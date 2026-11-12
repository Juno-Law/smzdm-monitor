const http = require('http');
const fs = require('fs');
const path = require('path');

const { CONFIG_PATH, read: readConfigFile } = require('./config');
const { normalizeKeywords, globalRules, clientLimits } = require('./keywords');
const interactions = require('./interactions');

// 改不动配置时别把整个页面搞崩，返回 null 让调用方自己决定
function readConfig() {
  try {
    return readConfigFile();
  } catch (_) {
    return null;
  }
}

// 先写临时文件再改名，避免写到一半把 config.json 弄坏
function writeKeywords(list) {
  const cfg = readConfig();
  if (!cfg) throw new Error('config.json 读取失败');
  // 再清洗一遍：即便调用方已经处理过，落盘前也不接受脏数据
  cfg.keywords = normalizeKeywords(list);
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
  return cfg.keywords;
}

// —— 前端静态资源 ——
// Vue 的构建产物在 web/dist。托盘和 npm start 都只拉一个 node 进程，
// 所以由这里顺带托管，不再单开 vite；开发时仍然用 npm run dev 走 5173 热更新。
const DIST_DIR = path.join(__dirname, '..', 'web', 'dist');
const DIST_INDEX = path.join(DIST_DIR, 'index.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function hasDist() {
  try {
    return fs.statSync(DIST_INDEX).isFile();
  } catch (_) {
    return false;
  }
}

// 返回 true 表示这个请求已经处理掉了；false 让调用方继续走后面的逻辑
function serveDist(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (!hasDist()) return false;
  // /api 下没匹配到路由的，交给后面的 JSON 404，别被 SPA 兜底成 index.html
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;

  let rel;
  try {
    rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch (_) {
    rel = '';
  }

  let file = null;
  if (rel) {
    const target = path.resolve(DIST_DIR, rel);
    // 目录穿越防护：解析完必须仍在 dist 里面
    if (target === DIST_DIR) {
      file = DIST_INDEX;
    } else if (target.startsWith(DIST_DIR + path.sep)) {
      try {
        if (fs.statSync(target).isFile()) file = target;
      } catch (_) {}
    }
  } else {
    file = DIST_INDEX;
  }

  // 找不到时的处理：带扩展名的（多半是 assets 里的 hash 文件）直接 404，
  // 不能让前端拿到一份 HTML 当 JS 用；其余按 SPA 兜底回 index.html。
  if (!file) {
    const ext = path.extname(rel);
    if (ext) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return true;
    }
    file = DIST_INDEX;
  }

  let data;
  try {
    data = fs.readFileSync(file);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('读取前端资源失败: ' + e.message);
    return true;
  }

  const ext = path.extname(file).toLowerCase();
  const isHashedAsset = file.startsWith(path.join(DIST_DIR, 'assets') + path.sep);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    // assets 里文件名自带 hash，可以长缓存；index.html 必须每次回源，否则构建后看不到新版
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-store',
    'Content-Length': data.length,
  });
  res.end(req.method === 'HEAD' ? undefined : data);
  return true;
}

function createServer(store, cfg, reads) {
  const port = (cfg.server && cfg.server.port) || 7788;
  const server = http.createServer((req, res) => {
    // 新路由要精确匹配，先把 query 摘掉；老的几个接口照旧用裸 startsWith
    const pathname = req.url.split('?')[0];

    if (req.url.startsWith('/api/deals')) {
      const snap = reads.snapshot();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          baseline: snap.baseline,
          read: snap.read,
          // 互动数在 deals.jsonl 里是入库快照，这里把补丁层贴上去再返回
          items: interactions.merge(store.recent(0)),
        })
      );
      return;
    }

    if (req.url.startsWith('/api/read') && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 1e6) req.destroy();
      });
      req.on('end', () => {
        let marked = 0;
        try {
          const d = JSON.parse(body || '{}');
          marked = reads.mark(d.ids || d.id);
        } catch (_) {}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, marked }));
      });
      return;
    }

    if (req.url.startsWith('/api/keywords')) {
      if (req.method === 'GET') {
        const c = readConfig();
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            // 归一化后的对象数组：[{ name, rules? }]
            keywords: (c && c.keywords) || [],
            // 全局有效值，前端拿来显示「默认 7」这种占位，别自己硬编码
            defaults: globalRules(c || {}),
            limits: clientLimits(),
          })
        );
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => {
          body += c;
          if (body.length > 1e6) req.destroy();
        });
        req.on('end', () => {
          let out = { ok: false, error: '解析失败' };
          try {
            const d = JSON.parse(body || '{}');
            // 元素可以是字符串（旧页面/curl）或对象；清理后为空直接拒绝，
            // 免得一次误操作把关键词清空、采集停摆
            const list = normalizeKeywords(d.keywords);
            if (!list.length) throw new Error('至少保留一个关键词');
            const saved = writeKeywords(list);
            out = { ok: true, keywords: saved, defaults: globalRules(readConfig() || {}) };
          } catch (e) {
            out = { ok: false, error: e.message };
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(out));
        });
        return;
      }
    }

    // 补互动数据：/api/interactions?ids=1,2,3
    // TTL 内直接给缓存，过期的才去抓 https://www.smzdm.com/p/{id}
    if (pathname === '/api/interactions' && req.method === 'GET') {
      const query = new URL(req.url, 'http://127.0.0.1').searchParams;
      const ids = String(query.get('ids') || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d{6,}$/.test(s));

      // 每请求现读配置：改 refreshTtlMinutes 不用重启
      const detailCfg = (readConfig() || {}).detail || {};

      interactions
        .refresh(ids, {
          ttlMinutes: detailCfg.refreshTtlMinutes ?? 30,
          maxIds: detailCfg.refreshMaxIds ?? 12,
          concurrency: detailCfg.concurrency ?? 3,
          minGapMs: detailCfg.minGapMs ?? 400,
          log: () => {}, // 不往采集日志里灌
        })
        .then((out) => {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify(out));
        })
        .catch((e) => {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify({ ok: false, error: String(e.message).split('\n')[0], items: {} }));
        });
      return;
    }

    // 前端只有 Vue 一套：直接托管 web/dist。没构建过就给一条明确的提示，
    // 不再回退到早就废弃的内嵌 HTML 页面。
    if (serveDist(req, res, pathname)) return;

    if (pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('前端还没构建。先执行：\n\n  cd web && npm run build\n');
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`  历史页 http://localhost:${port}${hasDist() ? '' : '（前端未构建：cd web && npm run build）'}`);
  });
  server.on('error', (e) => {
    console.error(`  历史页启动失败: ${e.message}`);
  });
  return server;
}

module.exports = { createServer };

// 单独启动历史页：node src/server.js
if (require.main === module) {
  const { Store, Reads } = require('./store');
  const cfg = readConfig();
  const store = new Store();
  createServer(store, cfg, new Reads());
}
