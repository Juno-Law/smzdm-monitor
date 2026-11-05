/**
 * 一次性回填：给历史记录补商品图
 *
 * 老的 71 条记录里没有 imgUrl 字段（采集代码当时没抓图）。
 * 详情页有 og:image，直连拿一张 250px 缩略图即可，不需要浏览器。
 *
 * 用法：node src/backfill-img.js
 */
const fs = require('fs');
const path = require('path');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'deals.jsonl');
const COOKIE_FILE = path.join(DATA_DIR, 'waf-cookie.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadCookie() {
  try {
    const j = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    return j.cookie || '';
  } catch (_) {
    return '';
  }
}

async function getImg(id, cookie) {
  const headers = {
    'User-Agent': UA,
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Accept: 'text/html,application/xhtml+xml',
  };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`https://www.smzdm.com/p/${id}/`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // og:image 的 meta，属性顺序不固定，所以先抓整个标签再取 content
  const tags = html.match(/<meta[^>]+og:image[^>]*>/gi) || [];
  for (const t of tags) {
    const c = t.match(/content=["']([^"']+)["']/i);
    if (c) return c[1];
  }
  return '';
}

async function main() {
  const items = fs
    .readFileSync(FILE, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  const todo = items.filter((x) => !x.imgUrl);
  console.log(`共 ${items.length} 条，缺图 ${todo.length} 条`);
  if (!todo.length) {
    console.log('不需要回填');
    return;
  }

  // 先备份，改文件前留一手
  const bak = path.join(DATA_DIR, `deals.backup.before-img.${Date.now()}.jsonl`);
  fs.copyFileSync(FILE, bak);
  console.log(`已备份到 ${path.basename(bak)}`);

  const cookie = loadCookie();
  let ok = 0;
  let fail = 0;
  const CONCURRENCY = 3;

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (it) => {
        try {
          const img = await getImg(it.articleId, cookie);
          if (img) {
            it.imgUrl = img;
            ok++;
            console.log(`  ✓ ${it.articleId} ${it.title.slice(0, 22)}`);
          } else {
            it.imgUrl = '';
            fail++;
            console.log(`  - ${it.articleId} 页面里没有 og:image`);
          }
        } catch (e) {
          it.imgUrl = '';
          fail++;
          console.log(`  ✗ ${it.articleId} ${e.message}`);
        }
      })
    );
    process.stdout.write(`  进度 ${Math.min(i + CONCURRENCY, todo.length)}/${todo.length}\n`);
    await sleep(350);
  }

  // 按原顺序整体重写（JSONL 是追加格式，改字段只能重写）
  fs.writeFileSync(FILE, items.map((x) => JSON.stringify(x)).join('\n') + '\n', 'utf8');
  console.log(`\n完成：成功 ${ok}，失败/无图 ${fail}，已写入 ${path.basename(FILE)}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
