// 直连文章详情页，补齐「值 / 不值 / 收藏 / 评论」
// 搜索页有 WAF，但 www.smzdm.com/p/{id} 可以纯 HTTP 拿到，不需要浏览器。
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const RE = {
  worthy: /id="rating_worthy_num"[^>]*>\s*(\d+)\s*</,
  unworthy: /id="rating_unworthy_num"[^>]*>\s*(\d+)\s*</,
  favs: /class="fav J_zhi_like_fav"[\s\S]{0,400}?<span>\s*(\d+)\s*<\/span>/,
  comments: /class="comment J_comment"[\s\S]{0,400}?<span>\s*(\d+)\s*<\/span>/,
};

function num(m) {
  return m ? parseInt(m[1], 10) || 0 : 0;
}

// 详情页出现过期/售罄的类名或文案时标记；拿不准就当正常，避免误杀
function detectExpired(html) {
  if (/class="[^"]*\b(expired|sold-out|soldout)\b[^"]*"/i.test(html)) return true;
  if (html.includes('该商品已过期') || html.includes('优惠已失效')) return true;
  return false;
}

async function fetchInteractions(articleId, timeoutMs = 20000) {
  const url = `https://www.smzdm.com/p/${articleId}`;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const parsed = {
    worthy: num(html.match(RE.worthy)),
    unworthy: num(html.match(RE.unworthy)),
    favs: num(html.match(RE.favs)),
    comments: num(html.match(RE.comments)),
    expired: detectExpired(html),
  };

  // 四个正则全没命中，说明页面结构变了，不能当 0 处理（会误杀）
  const hitAny = RE.worthy.test(html) || RE.unworthy.test(html) || RE.favs.test(html) || RE.comments.test(html);
  if (!hitAny) throw new Error('页面结构变化，互动字段未解析到');

  return parsed;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 并发补全，带最小间隔，避免对站点造成突发压力
async function enrichAll(items, opts = {}) {
  const { concurrency = 3, minGapMs = 400, timeoutMs = 20000, log = console.log } = opts;
  const out = new Array(items.length);
  let cursor = 0;
  let lastAt = 0;
  let ok = 0;
  let fail = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      const it = items[idx];
      // 节流：全局最小间隔
      const wait = lastAt + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastAt = Date.now();

      let result = null;
      for (let attempt = 1; attempt <= 2 && !result; attempt++) {
        try {
          result = await fetchInteractions(it.articleId, timeoutMs);
        } catch (e) {
          if (attempt === 2) {
            fail++;
            log(`    ! 补全失败 ${it.articleId}: ${e.message.split('\n')[0]}`);
          } else {
            await sleep(1200);
          }
        }
      }
      if (result) {
        ok++;
        out[idx] = { ...it, ...result };
      } else {
        // 补不到互动数据 → 标记 unknown，后续按「不确定」处理，不当作全 0 丢弃
        out[idx] = { ...it, worthy: null, unworthy: null, favs: null, comments: null, interactionUnknown: true };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { items: out.filter(Boolean), ok, fail };
}

module.exports = { fetchInteractions, enrichAll };
