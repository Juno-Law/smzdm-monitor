/**
 * 纯 HTTP 采集（不启动浏览器跑页面渲染）
 *
 * 原理：search.smzdm.com 前面是腾讯防水墙（__TENCENT_CHAOS_VM）。
 * 过了墙之后，服务端会把完整的结果 HTML 直接吐出来（20 条，含价格/值得/评论/时间/商城）。
 * 所以只需要「用真实浏览器过一次墙，拿到 cookie」，后续所有请求都能用纯 fetch 完成。
 * cookie 失效时才重新起浏览器 —— 浏览器从「每轮必开」降级为「偶尔开一次」。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { resolveExecutable } = require('./config');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl(keyword, pageNo, sort) {
  let base = `https://search.smzdm.com/?c=faxian&s=${encodeURIComponent(keyword)}&v=b`;
  if (sort === 'time') base += '&order=time';
  // sort === 'default' 时不带 order 参数，即站内默认的「综合排序」
  return pageNo > 1 ? `${base}&p=${pageNo}` : base;
}

// ---------- HTML 解析 ----------

const stripTags = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// 搜索页的图是协议相对的 //y.zdmimg.com/... ，补上 https: 才能用
function normalizeImg(u) {
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('http')) return u;
  return '';
}

function parseRows(html, keyword) {
  // 每条结果是一个 <li class="feed-row-wide ...">，里面一个 .feed-block
  const parts = html.split(/<li class="feed-row/).slice(1);
  const out = [];

  for (const raw of parts) {
    const seg = raw.slice(0, 8000); // 单条足够，防止跨条误匹配

    const idm = seg.match(/href="https:\/\/www\.smzdm\.com\/p\/(\d+)\//);
    if (!idm) continue;

    const titlem = seg.match(/\stitle="([^"]*)"/);
    const imgm = seg.match(/<img[^>]+src="([^"]+)"/);
    const pricem = seg.match(/<div class="z-highlight">([\s\S]*?)<\/div>/);
    const extram = seg.match(/<span class="feed-block-extras">([\s\S]*?)<span>([^<]*)<\/span>/);
    const buym = seg.match(/href="([^"]+)"[^>]*class="z-btn z-btn-red"/);

    const numMatch = (re) => {
      const m = seg.match(re);
      return m ? parseInt(m[1], 10) || 0 : 0;
    };

    const priceText = pricem ? stripTags(pricem[1]) : '';

    out.push({
      articleId: idm[1],
      title: titlem ? titlem[1] : '',
      url: `https://www.smzdm.com/p/${idm[1]}/`,
      imgUrl: imgm ? normalizeImg(imgm[1]) : '',
      priceText,
      expired: /过期|售罄|已结束|已下架/.test(priceText),
      tags: [...seg.matchAll(/<span class="feed-block-tags">[\s\S]*?<\/span>/g)]
        .flatMap((m) => [...m[0].matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map((x) => x[1].trim()))
        .filter(Boolean)
        .slice(0, 6),
      worthy: numMatch(/price-btn-up[\s\S]{0,200}?<span class="unvoted-wrap">[\s\S]{0,120}?<span>(\d+)<\/span>/),
      unworthy: numMatch(/price-btn-down[\s\S]{0,200}?<span class="unvoted-wrap">[\s\S]{0,120}?<span>(\d+)<\/span>/),
      favs: numMatch(/feed-btn-fav[\s\S]{0,200}?<span>(\d+)<\/span>/),
      comments: numMatch(/feed-btn-comment[\s\S]{0,200}?<\/i>\s*(\d+)/),
      timeText: extram ? stripTags(extram[1]) : '',
      mall: extram ? stripTags(extram[2]) : '',
      buyUrl: buym ? buym[1] : '',
      keyword,
    });
  }
  return out;
}

// ---------- 采集器 ----------

class HttpSource {
  constructor(cfg, log) {
    this.cfg = cfg;
    this.log = log || console.log;
    this.pageCfg = cfg.pages || {};
    this.wafCfg = cfg.waf || {};
    // 两路排序：time=最新（快，覆盖新爆料）/ default=综合（热，含仍有效的长尾好价）
    const wanted = Array.isArray(cfg.sorts) && cfg.sorts.length ? cfg.sorts : ['time', 'default'];
    this.sorts = wanted.filter((s) => s === 'time' || s === 'default');
    if (!this.sorts.length) this.sorts = ['time'];
    this.cookieFile = path.join(__dirname, '..', 'data', 'waf-cookie.json');
    this.cookie = null;
    this.cookieAge = 0; // 取得时刻
    this.stats = { harvest: 0, http: 0 };
  }

  // ---- cookie 缓存 ----
  loadCookie() {
    try {
      const j = JSON.parse(fs.readFileSync(this.cookieFile, 'utf8'));
      if (j.cookie && j.harvestedAt) {
        this.cookie = j.cookie;
        this.cookieAge = new Date(j.harvestedAt).getTime();
        return true;
      }
    } catch (_) {}
    return false;
  }

  saveCookie(cookie) {
    this.cookie = cookie;
    this.cookieAge = Date.now();
    fs.mkdirSync(path.dirname(this.cookieFile), { recursive: true });
    fs.writeFileSync(
      this.cookieFile,
      JSON.stringify({ cookie, harvestedAt: new Date().toISOString() }, null, 1)
    );
  }

  cookieFresh() {
    if (!this.cookie) return false;
    const maxAge = (this.wafCfg.maxAgeMinutes || 30) * 60 * 1000;
    return Date.now() - this.cookieAge < maxAge;
  }

  // ---- 过一次墙（唯一需要浏览器的地方）----
  async harvest() {
    const t0 = Date.now();
    this.log('  过 WAF：启动浏览器取 cookie…');
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: resolveExecutable(this.cfg.browser && this.cfg.browser.executablePath),
        headless: false, // 无头过不了，必须真实窗口
        args: [
          '--disable-blink-features=AutomationControlled',
          '--window-position=-2000,-2000',
          '--window-size=1280,900',
        ],
      });
      const ctx = await browser.newContext({
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        viewport: { width: 1280, height: 900 },
        userAgent: UA,
      });
      await ctx.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      const page = await ctx.newPage();
      await page.goto(buildUrl(this.cfg.keywords[0] || '牛奶', 1, 'time'), {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await page.waitForSelector('.feed-block', { timeout: 45000 });

      const cookies = await ctx.cookies();
      const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      this.saveCookie(header);
      this.stats.harvest++;
      this.log(`  过墙成功，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，cookie ${header.length} 字节`);
      return header;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  async ensureCookie(force) {
    if (force) return this.harvest();
    if (!this.cookie && !this.loadCookie()) return this.harvest();
    if (!this.cookieFresh()) return this.harvest();
    return this.cookie;
  }

  // ---- 纯 HTTP 拉一页 ----
  async fetchPage(keyword, pageNo, sort) {
    const cookie = await this.ensureCookie();
    const res = await fetch(buildUrl(keyword, pageNo, sort), {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://www.smzdm.com/',
        Cookie: cookie,
      },
    });
    const html = await res.text();
    this.stats.http++;

    const looksChallenged =
      res.status === 202 || /probe\.js|__TENCENT_CHAOS_VM|\bseqid\b/.test(html.slice(0, 2000));

    if (looksChallenged) {
      const err = new Error(`WAF 挑战（HTTP ${res.status}）`);
      err.challenged = true;
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return parseRows(html, keyword);
  }

  // 第 1 页最老那条仍在一个轮询周期内 => 这段时间产出超过 20 条，要翻页兜住
  needNextPage(items, intervalMs) {
    if (!items.length) return false;
    const { toMs } = require('./time');
    const oldest = toMs(items[items.length - 1].timeText);
    if (!oldest) return false;
    return Date.now() - oldest < intervalMs;
  }

  async searchKeyword(keyword, intervalMs) {
    const maxPages = this.pageCfg.maxPages || 2;
    const byId = new Map(); // articleId -> item，两路结果在这里合并

    const put = (it, sort) => {
      const prev = byId.get(it.articleId);
      if (!prev) {
        byId.set(it.articleId, { ...it, sorts: [sort] });
        return;
      }
      // 同一篇文章两路都出现：合并来源，互动数取大值（两次请求间隔几秒，数字可能微增）
      if (!prev.sorts.includes(sort)) prev.sorts.push(sort);
      prev.worthy = Math.max(prev.worthy, it.worthy);
      prev.unworthy = Math.max(prev.unworthy, it.unworthy);
      prev.favs = Math.max(prev.favs, it.favs);
      prev.comments = Math.max(prev.comments, it.comments);
    };

    const counts = {};
    for (const sort of this.sorts) {
      let got = 0;
      for (let p = 1; p <= maxPages; p++) {
        let items = null;

        for (let attempt = 1; attempt <= 3 && items === null; attempt++) {
          try {
            items = await this.fetchPage(keyword, p, sort);
          } catch (e) {
            const challenged = !!e.challenged;
            this.log(
              `  [${keyword}/${this.sortLabel(sort)}] 第${p}页 第 ${attempt} 次失败: ${e.message}${challenged ? ' → 重新过墙' : ''}`
            );
            if (challenged) {
              await this.harvest().catch((x) => this.log('    过墙失败: ' + x.message));
            } else {
              await sleep(2000 * attempt);
            }
            if (attempt === 3) items = [];
          }
        }

        for (const it of items) put(it, sort);
        got += items.length;

        // 只有「最新」这一路需要自适应翻页：它的 20 条可能覆盖不了一个轮询周期。
        // 综合排序是按热度取的，翻页意义不大，只会把老帖再拉一遍。
        const goNext = sort === 'time' && p < maxPages && this.needNextPage(items, intervalMs);
        if (p > 1 || goNext) {
          this.log(
            `  [${keyword}/${this.sortLabel(sort)}] 第${p}页 ${items.length} 条${goNext ? '（20 条未覆盖一个轮询周期，继续翻页）' : ''}`
          );
        }
        if (!goNext) break;
        await sleep(1200 + Math.random() * 1200);
      }
      counts[sort] = got;
      if (this.sorts.length > 1) await sleep(800 + Math.random() * 600);
    }

    const merged = [...byId.values()];
    if (this.sorts.length > 1) {
      this.log(
        `  [${keyword}] ${this.sorts.map((s) => `${this.sortLabel(s)} ${counts[s] || 0}`).join(' + ')} → 合并 ${merged.length} 条`
      );
    }
    return merged;
  }

  sortLabel(sort) {
    return sort === 'time' ? '最新' : '综合';
  }

  // 与 SmzdmSource 接口对齐（HTTP 模式无长驻浏览器，直接返回）
  async close() {
    if (this.stats.http || this.stats.harvest) {
      this.log(`  HTTP 请求 ${this.stats.http} 次，过墙 ${this.stats.harvest} 次`);
    }
  }

  async searchAll(keywords) {
    const intervalMs = (this.cfg.intervalMinutes || 15) * 60 * 1000;
    const out = [];

    if (!this.cookie && this.loadCookie() && this.cookieFresh()) {
      this.log(`  复用本地 cookie（${Math.round((Date.now() - this.cookieAge) / 60000)} 分钟前取得）`);
    }

    for (const kw of keywords) {
      const items = await this.searchKeyword(kw, intervalMs);
      if (items.length) this.log(`  [${kw}] 共 ${items.length} 条`);
      out.push(...items);
      await sleep(1000 + Math.random() * 1200);
    }

    return out;
  }
}

module.exports = { HttpSource, parseRows };
