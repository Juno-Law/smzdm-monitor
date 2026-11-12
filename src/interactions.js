// 互动数据（值 / 不值 / 收藏 / 评论）的补丁层。
//
// deals.jsonl 只追加、不改写（改字段要整文件重写，采集进程还在 append，风险大），
// 所以「更新数字」只能落在旁边这个 data/interactions.json 上 ——
// 和 reads.json 存已读状态是同一个思路。
//
// 结构：{ "185405138": { worthy, unworthy, favs, comments, at } }
const fs = require('fs');
const path = require('path');
const { enrichAll } = require('./detail');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'interactions.json');
const FIELDS = ['worthy', 'unworthy', 'favs', 'comments'];
const KEEP_DAYS = 30; // 超过这么久的补丁写入时顺手清掉，文件不会无限长
const DEADLINE_MS = 10000; // 接口的软超时，到点先返回已有缓存
const HARD_MAX_IDS = 60; // 单次请求的硬上限

let cache = null;
let cacheMtime = 0;

// 按 mtime 判断要不要重读磁盘：采集进程和单独起的 server.js 可能同时在写，
// 任何一方拿内存副本直接写回都会抹掉对方刚写进去的
function read() {
  try {
    const stat = fs.statSync(FILE);
    if (cache && stat.mtimeMs === cacheMtime) return cache;
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    cacheMtime = stat.mtimeMs;
  } catch (_) {
    if (!cache) cache = {};
  }
  return cache;
}

// 0 是合法值，null 不是。
// enrichAll 抓失败时四个字段全置 null（+ interactionUnknown），这种绝不能落盘 ——
// 否则前端 `|| 0` 会把「抓不到」显示成 0，正好放大「和详情页对不上」的问题
function valid(p) {
  if (!p) return false;
  for (const key of FIELDS) {
    const v = p[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false;
  }
  return true;
}

function pick(p) {
  const out = {};
  for (const key of FIELDS) out[key] = p[key];
  return out;
}

function get(id) {
  const p = read()[id];
  return valid(p) ? p : null;
}

function writeAll(all) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all), 'utf8');
  fs.renameSync(tmp, FILE);
  cache = all;
  cacheMtime = fs.statSync(FILE).mtimeMs;
}

/**
 * 批量写，只落盘一次。
 * @param {Array<[string, object]>} entries
 * @param {{maxOnly?: boolean}} [opts]
 *   maxOnly = true 时逐字段取较大值，绝不把数字改小 —— 采集用的列表页数据可能比详情页滞后，
 *   用它覆盖会让页面上刚涨上去的数又掉回去。
 * @returns {number} 实际写入条数（maxOnly 下数值没变化的条目不计）
 */
function saveMany(entries, opts = {}) {
  if (!entries.length) return 0;
  const maxOnly = opts.maxOnly === true;

  const all = { ...read() };
  const at = new Date().toISOString();
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  let changed = 0;

  for (const [id, patch] of entries) {
    if (!id || !valid(patch)) continue;
    const prev = valid(all[id]) ? all[id] : null;
    const next = {};
    for (const key of FIELDS) {
      next[key] = maxOnly && prev ? Math.max(prev[key], patch[key]) : patch[key];
    }
    // 数值完全没变就不写：省磁盘 IO，也避免把 at 刷成「刚刚」而掩盖真实新鲜度
    if (prev && FIELDS.every((key) => prev[key] === next[key])) continue;
    all[id] = { ...next, at };
    changed++;
  }
  if (!changed) return 0;

  for (const [id, p] of Object.entries(all)) {
    const t = p && p.at ? new Date(p.at).getTime() : NaN;
    if (!Number.isFinite(t) || t < cutoff) delete all[id];
  }

  writeAll(all);
  return changed;
}

/** /api/deals 用：把补丁贴到列表上。没有补丁时原样返回同一个数组 */
function merge(items) {
  const all = read();
  if (!Object.keys(all).length) return items;

  let touched = false;
  const out = items.map((it) => {
    const p = all[it.articleId];
    if (!valid(p)) return it;
    touched = true;
    return { ...it, ...pick(p), interactionsAt: p.at };
  });
  return touched ? out : items;
}

function snapshot(ids) {
  const all = read();
  const out = {};
  for (const id of ids) {
    const p = all[id];
    if (valid(p)) out[id] = p;
  }
  return out;
}

// ---------- 全局串行队列 ----------
// enrichAll 的 minGapMs 计数器是函数内局部变量（detail.js 里的 lastAt），
// 两次并发调用会各算各的，节流等于没有。这里再套一层模块级队列兜住。
let tail = Promise.resolve();

function serialize(task) {
  const run = tail.then(task, task);
  tail = run.then(
    () => {},
    () => {}
  ); // 失败不能把队列卡死
  return run;
}

/**
 * 刷新一批 id 的互动数据。
 * TTL 内的直接给缓存；到点还没抓完就先返回已有缓存（pending: true），后台继续跑完写盘。
 *
 * @param {string[]} ids
 * @param {{ttlMinutes?: number, maxIds?: number, concurrency?: number, minGapMs?: number, timeoutMs?: number, log?: Function}} opts
 */
function refresh(ids, opts = {}) {
  const ttlMs = (opts.ttlMinutes ?? 30) * 60000;
  const maxIds = Math.min(opts.maxIds ?? 12, HARD_MAX_IDS);
  const uniq = [...new Set(ids)].slice(0, maxIds);

  if (!uniq.length) return Promise.resolve({ ok: true, refreshed: 0, items: {} });

  const task = serialize(async () => {
    // TTL 在队列内部再判一次：排队期间可能已经被别的请求补齐了
    const now = Date.now();
    const stale = uniq.filter((id) => {
      const p = get(id);
      return !p || now - new Date(p.at).getTime() >= ttlMs;
    });

    let refreshed = 0;
    if (stale.length) {
      const r = await enrichAll(
        stale.map((id) => ({ articleId: id })),
        {
          concurrency: opts.concurrency ?? 3,
          minGapMs: opts.minGapMs ?? 400,
          timeoutMs: opts.timeoutMs ?? 8000,
          log: opts.log || (() => {}),
        }
      );
      const usable = r.items.filter((it) => !it.interactionUnknown);
      // 一条都没解析出来：多半是详情页被 WAF 挡住了，不是「本条失败」。
      // 告诉调用方这个事实，让前端别再每 5 分钟白发一批请求。
      if (!usable.length) {
        return { ok: true, unavailable: true, refreshed: 0, items: snapshot(uniq) };
      }
      refreshed = saveMany(usable.map((it) => [it.articleId, it]));
    }

    return { ok: true, refreshed, items: snapshot(uniq) };
  });

  let timer = null;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: true, pending: true, refreshed: 0, items: snapshot(uniq) }),
      DEADLINE_MS
    );
  });

  return Promise.race([task, deadline]).finally(() => clearTimeout(timer));
}

module.exports = { read, get, merge, saveMany, snapshot, refresh, serialize };
