const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'deals.jsonl');
const READ_FILE = path.join(DATA_DIR, 'reads.json');

function pad(n) {
  return String(n).padStart(2, '0');
}

// 把 "11-02 19:23" / "2026-11-02 19:23" / "今天 19:23" 转成标准时间
function parseTime(text) {
  if (!text) return new Date().toISOString();
  const now = new Date();
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).toISOString();
  }
  m = text.match(/(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const d = new Date(now.getFullYear(), +m[1] - 1, +m[2], +(m[3] || 0), +(m[4] || 0));
    if (d > now) d.setFullYear(now.getFullYear() - 1);
    return d.toISOString();
  }
  m = text.match(/(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/);
  if (m) {
    const d = new Date(now.getFullYear(), +m[1] - 1, +m[2], +(m[3] || 0), +(m[4] || 0));
    if (d > now) d.setFullYear(now.getFullYear() - 1);
    return d.toISOString();
  }
  // 纯时间 "11:08"：页面当天发布的条目只给时分，按今天算；若晚于此刻则算昨天
  m = text.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
  if (m) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2]);
    if (d.getTime() > now.getTime() + 5 * 60 * 1000) d.setDate(d.getDate() - 1);
    return d.toISOString();
  }
  if (text.includes('今天')) return now.toISOString();
  return now.toISOString();
}

class Store {
  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    this.items = this.#load();
    this.seen = new Set(this.items.map((i) => i.articleId));
  }

  #load() {
    if (!fs.existsSync(FILE)) return [];
    const out = [];
    for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch (_) {}
    }
    return out;
  }

  has(id) {
    return this.seen.has(id);
  }

  add(records) {
    const fresh = [];
    for (const r of records) {
      if (!r.articleId || this.seen.has(r.articleId)) continue;
      this.seen.add(r.articleId);
      fresh.push(r);
    }
    if (!fresh.length) return [];
    const buf = fresh.map((r) => JSON.stringify(r)).join('\n') + '\n';
    fs.appendFileSync(FILE, buf, 'utf8');
    this.items.push(...fresh);
    return fresh;
  }

  // 按发布时间倒序（最新的在最前），而不是按写入顺序。limit 为 0 表示不限
  recent(limit = 0) {
    const sorted = [...this.items].sort(
      (a, b) => new Date(b.pubTime || 0) - new Date(a.pubTime || 0)
    );
    return limit > 0 ? sorted.slice(0, limit) : sorted;
  }

  stats() {
    return { total: this.items.length, file: FILE };
  }
}

// 已读标记。用独立的 reads.json，不改动主数据文件（JSONL 只追加，改字段很麻烦）
// baseline 是「开始计未读」的那一刻，早于它的历史一律按已读处理，
// 否则第一次上线时几十条历史全变成未读，等于没有效果
class Reads {
  constructor() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const d = this.#load();
    this.baseline = d.baseline || new Date().toISOString();
    this.read = d.read;
    this.#save(); // 首次运行把 baseline 落盘
  }

  // 每次都从磁盘读，不用内存快照 —— 页面进程和采集进程可能同时在写，
  // 任何一方的内存副本写回都会把对方刚标记的记录抹掉
  #load() {
    let raw = {};
    try {
      raw = JSON.parse(fs.readFileSync(READ_FILE, 'utf8'));
    } catch (_) {}
    return {
      baseline: raw.baseline || null,
      read: new Set(Array.isArray(raw.read) ? raw.read : []),
    };
  }

  #save() {
    const data = { baseline: this.baseline, read: [...this.read] };
    fs.writeFileSync(READ_FILE, JSON.stringify(data), 'utf8');
  }

  // 给接口用：总是返回磁盘上的最新状态
  snapshot() {
    const d = this.#load();
    if (d.baseline) this.baseline = d.baseline;
    this.read = d.read;
    return { baseline: this.baseline, read: [...this.read] };
  }

  isUnread(it) {
    if (this.read.has(it.articleId)) return false;
    const t = new Date(it.fetchedAt || 0).getTime();
    return t > new Date(this.baseline).getTime();
  }

  mark(ids) {
    const arr = Array.isArray(ids) ? ids : [ids];
    const d = this.#load();
    if (d.baseline) this.baseline = d.baseline;
    let changed = 0;
    for (const id of arr) {
      if (!id || d.read.has(id)) continue;
      d.read.add(id);
      changed++;
    }
    if (changed) {
      this.read = d.read;
      this.#save();
    }
    return changed;
  }
}

module.exports = { Store, Reads, parseTime };
