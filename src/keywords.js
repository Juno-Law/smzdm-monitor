/**
 * 关键词与「每个词自己的规则」。
 *
 * 纯函数模块，不碰文件、不碰进程 —— 三处调用方共用：
 *   config.read()           读盘后归一化，旧字符串自动升级成对象
 *   server /api/keywords    校验前端提交、算默认值给 UI 显示
 *   index.runRound          每轮建一次 rulesFor，过滤/限量/通知都查它
 *
 * 继承语义：rules 里出现的键才覆盖，没出现的沿用 config.json 的全局同名字段。
 * 所以 rules 是「差量」，不是完整规则。
 */

const MAX_KEYWORDS = 40;
const MAX_NAME_LEN = 60;

// 与代码里的真实语义对齐：maxAge* 的 0 表示「关掉这个判定」
const NUM_LIMITS = {
  minWorthy: [0, 9999],
  minComments: [0, 9999],
  maxAgeDays: [0, 3650],
  maxAgeHoursDefault: [0, 8760],
  maxItemsPerKeyword: [1, 200],
};

function cleanName(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const s = String(value).trim().replace(/\s+/g, ' ');
  if (!s || s.length > MAX_NAME_LEN) return '';
  return s;
}

function toBool(value) {
  if (value === true || value === false) return value;
  return undefined; // 其余一律当「没配」，继承
}

function toInt(value, [min, max]) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 逐字段白名单拷贝，不用 Object.assign —— 防 __proto__ 和脏键落盘 */
function cleanRules(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};

  const skipExpired = toBool(raw.skipExpired);
  if (skipExpired !== undefined) out.skipExpired = skipExpired;

  const skipNoInteraction = toBool(raw.skipNoInteraction);
  if (skipNoInteraction !== undefined) out.skipNoInteraction = skipNoInteraction;

  if (raw.interactionGate && typeof raw.interactionGate === 'object') {
    const g = {};
    const minWorthy = toInt(raw.interactionGate.minWorthy, NUM_LIMITS.minWorthy);
    if (minWorthy !== undefined) g.minWorthy = minWorthy;
    const minComments = toInt(raw.interactionGate.minComments, NUM_LIMITS.minComments);
    if (minComments !== undefined) g.minComments = minComments;
    // interactionGate.defaultSort 已废弃：综合榜与最新榜共用同一套门槛。
    // 老 config.json 里残留的这个键会被这里丢掉，不再参与过滤。
    if (raw.interactionGate.combine === 'any' || raw.interactionGate.combine === 'all') {
      g.combine = raw.interactionGate.combine;
    }
    if (Object.keys(g).length) out.interactionGate = g;
  }

  const maxAgeDays = toInt(raw.maxAgeDays, NUM_LIMITS.maxAgeDays);
  if (maxAgeDays !== undefined) out.maxAgeDays = maxAgeDays;

  const maxAgeHoursDefault = toInt(raw.maxAgeHoursDefault, NUM_LIMITS.maxAgeHoursDefault);
  if (maxAgeHoursDefault !== undefined) out.maxAgeHoursDefault = maxAgeHoursDefault;

  const maxItemsPerKeyword = toInt(raw.maxItemsPerKeyword, NUM_LIMITS.maxItemsPerKeyword);
  if (maxItemsPerKeyword !== undefined) out.maxItemsPerKeyword = maxItemsPerKeyword;

  const notify = toBool(raw.notify);
  if (notify !== undefined) out.notify = notify;

  return Object.keys(out).length ? out : undefined;
}

/**
 * 唯一的「旧格式 → 新格式」入口。config.json、POST body 都走这里。
 * 字符串 "牛奶" 和对象 { name: "牛奶", rules: {...} } 混着传也能处理。
 */
function normalizeKeywords(list) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(list) ? list : []) {
    const isObject = raw && typeof raw === 'object' && !Array.isArray(raw);
    const name = cleanName(isObject ? raw.name : raw);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const rules = isObject ? cleanRules(raw.rules) : undefined;
    // 空规则不落 "rules": {}，让「没配过」在 JSON 里一眼可读
    out.push(rules ? { name, rules } : { name });

    if (out.length >= MAX_KEYWORDS) break;
  }

  return out;
}

/** 数据源只认字符串数组，searchAll 的签名不因为这件事改变 */
function keywordNames(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => (item && typeof item === 'object' ? cleanName(item.name) : cleanName(item)))
    .filter(Boolean);
}

function numOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 从全局 config 抽出「有效默认值」。
 * 必须和 index.js 里真实用的 fallback 一致（maxItemsPerKeyword 默认 40），
 * 否则前端占位符会撒谎。
 */
function globalRules(cfg) {
  const c = cfg || {};
  const gate = c.interactionGate || {};
  const notify = c.notify || {};

  return {
    skipExpired: Boolean(c.skipExpired),
    skipNoInteraction: Boolean(c.skipNoInteraction),
    interactionGate: {
      // 字段缺失时的兜底与 config.example.json 的默认值保持一致
      minWorthy: numOr(gate.minWorthy, 1),
      minComments: numOr(gate.minComments, 1),
      combine: gate.combine === 'all' ? 'all' : 'any',
    },
    maxAgeDays: numOr(c.maxAgeDays, 0),
    maxAgeHoursDefault: numOr(c.maxAgeHoursDefault, 0),
    maxItemsPerKeyword: numOr(c.maxItemsPerKeyword, 40) || 40,
    notify: notify.toast !== false,
  };
}

/**
 * 每轮调一次，拿到 rulesFor(keyword)。
 * 用 Map 而不是每次遍历数组：过滤是逐条跑的，两阶段各一遍。
 */
function buildRules(cfg) {
  const base = globalRules(cfg);
  const map = new Map();

  for (const item of (cfg && cfg.keywords) || []) {
    if (!item || typeof item !== 'object') continue;
    const name = cleanName(item.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, item.rules || {});
  }

  return function rulesFor(keyword) {
    const key = String(keyword == null ? '' : keyword)
      .trim()
      .toLowerCase();
    const rules = key ? map.get(key) : undefined;
    // 查不到（已删的词、历史数据）回落全局，别因为缺规则把数据误杀
    if (!rules) return base;

    const merged = { ...base, ...rules };
    merged.interactionGate = { ...base.interactionGate, ...(rules.interactionGate || {}) };
    return merged;
  };
}

/** 给前端表单用的取值区间，和上面的 clamp 同源 */
function clientLimits() {
  return {
    ...NUM_LIMITS,
    maxKeywords: MAX_KEYWORDS,
    maxNameLen: MAX_NAME_LEN,
  };
}

module.exports = {
  MAX_KEYWORDS,
  MAX_NAME_LEN,
  normalizeKeywords,
  keywordNames,
  globalRules,
  buildRules,
  clientLimits,
};
