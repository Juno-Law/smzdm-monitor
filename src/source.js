const { chromium } = require('playwright-core');
const { extractBlocks } = require('./parse');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 时间文本 -> 毫秒，用于判断"这一页够不够新"
function toMs(text) {
  if (!text) return 0;
  const now = new Date();
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  m = text.match(/(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date(now.getFullYear(), +m[1] - 1, +m[2], +m[3], +m[4]);
    if (d > now) d.setFullYear(now.getFullYear() - 1);
    return d.getTime();
  }
  m = text.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2]);
    if (d > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  return 0;
}

class SmzdmSource {
  constructor(cfg, log) {
    this.cfg = cfg;
    this.log = log || console.log;
    this.browser = null;
    this.ctx = null;
    this.pageCfg = cfg.pages || {};
  }

  async ensureBrowser() {
    if (this.browser && this.browser.isConnected()) return;

    this.log('  启动浏览器…');
    this.browser = await chromium.launch({
      executablePath: this.cfg.browser.executablePath,
      headless: !!this.cfg.browser.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-position=-2000,-2000',
        '--window-size=1280,900',
      ],
    });
    this.ctx = await this.browser.newContext({
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      viewport: { width: 1280, height: 900 },
      userAgent: UA,
    });
    await this.ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (_) {}
      this.browser = null;
      this.ctx = null;
    }
  }

  // order=time 是按发布时间倒序；p=N 才是真分页（page= 无效，会退回第 1 页）
  async searchOnce(keyword, pageNo = 1) {
    const base = `https://search.smzdm.com/?c=faxian&s=${encodeURIComponent(keyword)}&order=time&v=b`;
    const url = pageNo > 1 ? `${base}&p=${pageNo}` : base;
    const page = await this.ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // WAF 会走 202 -> probe.js -> 302 循环，等最终渲染出结果
      await page.waitForSelector('.feed-block', { timeout: 45000 });
      await page.waitForTimeout(800);
      const items = await page.evaluate(extractBlocks, keyword);
      return items;
    } finally {
      await page.close().catch(() => {});
    }
  }

  // 第 1 页最老那条仍在一个轮询周期内 => 说明这段时间产出超过 20 条，必须翻页兜住
  needNextPage(items, intervalMs) {
    if (!items.length) return false;
    const oldest = toMs(items[items.length - 1].timeText);
    if (!oldest) return false;
    return Date.now() - oldest < intervalMs;
  }

  async searchKeyword(keyword, intervalMs) {
    const maxPages = this.pageCfg.maxPages || 2;
    const out = [];
    for (let p = 1; p <= maxPages; p++) {
      let items = null;
      for (let attempt = 1; attempt <= 2 && items === null; attempt++) {
        try {
          items = await this.searchOnce(keyword, p);
        } catch (e) {
          this.log(`  [${keyword}] 第${p}页 第 ${attempt} 次失败: ${e.message.split('\n')[0]}`);
          if (attempt === 2) items = [];
          else await sleep(3000);
        }
      }
      out.push(...items);

      const goNext = p < maxPages && this.needNextPage(items, intervalMs);
      if (p > 1 || goNext) {
        this.log(
          `  [${keyword}] 第${p}页 ${items.length} 条${goNext ? '（20 条未覆盖一个轮询周期，继续翻页）' : ''}`
        );
      }
      if (!goNext) break;
      await sleep(1500 + Math.random() * 1500);
    }
    return out;
  }

  async searchAll(keywords) {
    await this.ensureBrowser();
    const intervalMs = (this.cfg.intervalMinutes || 15) * 60 * 1000;
    const out = [];

    for (const kw of keywords) {
      const items = await this.searchKeyword(kw, intervalMs);
      if (items.length && !out.some((x) => x.keyword === kw)) {
        this.log(`  [${kw}] 共 ${items.length} 条`);
      }
      out.push(...items);
      // 关键词之间随机停顿，避免触发风控
      await sleep(1500 + Math.random() * 2000);
    }

    return out;
  }
}

module.exports = { SmzdmSource, toMs };
