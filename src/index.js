const fs = require('fs');
const path = require('path');
const { SmzdmSource } = require('./source');
const { HttpSource } = require('./source-http');
const { ApiSource } = require('./source-api');
const { enrichAll } = require('./detail');
const { Store, Reads, parseTime } = require('./store');
const { notifyRound } = require('./notify');
const { createServer } = require('./server');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const ONCE = process.argv.includes('--once');

const ts = () => new Date().toTimeString().slice(0, 8);
const log = (...a) => console.log(`[${ts()}]`, ...a);

const SOURCE_LABEL = {
  http: '搜索页 · 纯 HTTP',
  browser: '搜索页 · 浏览器渲染',
  api: '好价检索 Pro（官方 API）',
};

// config.source 优先；没配置时按旧逻辑从 api.enabled 推断
function resolveMode() {
  if (cfg.source && SOURCE_LABEL[cfg.source]) return cfg.source;
  return cfg.api && cfg.api.enabled ? 'api' : 'http';
}

// 选门槛：只在综合排序出现的条目走「严门槛」，其余走默认门槛
// 双路都出现的说明既新又热，仍然按默认门槛放过
function pickGate(it, gate) {
  const dg = gate && gate.defaultSort;
  if (!dg) return gate;
  const s = it.sorts || [];
  const onlyDefault = s.length === 1 && s[0] === 'default';
  const applies = dg.appliesTo === 'hasDefault' ? s.includes('default') : onlyDefault;
  return applies ? dg : gate;
}

function passGate(it, g) {
  const worthy = it.worthy || 0;
  const comments = it.comments || 0;
  const minW = g.minWorthy || 0;
  const minC = g.minComments || 0;
  return g.combine === 'all' ? worthy >= minW && comments >= minC : worthy >= minW || comments >= minC;
}

function filterItems(items, cfg, opts = {}) {
  const { skipInteraction = false } = opts;
  const kept = [];
  const drop = {
    stale: 0,
    staleDefault: 0,
    expired: 0,
    noInteraction: 0,
    lowInteraction: 0,
    lowInteractionDefault: 0,
    noId: 0,
  };
  const gate = cfg.interactionGate;
  for (const it of items) {
    if (!it.articleId || !it.title) {
      drop.noId++;
      continue;
    }
    if (cfg.skipExpired && it.expired) {
      drop.expired++;
      continue;
    }
    if (!skipInteraction && cfg.skipNoInteraction) {
      const interactions = (it.worthy || 0) + (it.unworthy || 0) + (it.favs || 0) + (it.comments || 0);
      if (interactions <= 0) {
        drop.noInteraction++;
        continue;
      }
      // 互动门槛：最新排序「值 或 评论」任一达标即可；
      // 只在综合排序出现的条目要「值 ≥ 5 且 评论 ≥ 5」，热度够的真好价才留
      if (gate && !it.interactionUnknown) {
        const g = pickGate(it, gate);
        if (!passGate(it, g)) {
          if (g !== gate) drop.lowInteractionDefault++;
          else drop.lowInteraction++;
          continue;
        }
      }
    }
    if (cfg.maxAgeDays) {
      const ageDays = (Date.now() - new Date(it.pubTime).getTime()) / 86400000;
      if (ageDays > cfg.maxAgeDays) {
        drop.stale++;
        continue;
      }
    }
    // 只在综合排序出现的条目：它靠热度上榜，可能是几十小时前的。
    // 这类要看但要有上限 —— 超过两天基本是已经死掉、只是还挂在热榜上的老帖
    if (cfg.maxAgeHoursDefault) {
      const s = it.sorts || [];
      const defaultOnly = s.length === 1 && s[0] === 'default';
      if (defaultOnly) {
        const ageHours = (Date.now() - new Date(it.pubTime).getTime()) / 3600000;
        if (ageHours > cfg.maxAgeHoursDefault) {
          drop.staleDefault++;
          continue;
        }
      }
    }
    kept.push(it);
  }
  return { kept, drop };
}

// 每个关键词只保留搜索页最前面 N 条（和人工“看前几条”一致）
function limitPerKeyword(items, n) {
  const count = new Map();
  const out = [];
  for (const it of items) {
    const c = count.get(it.keyword) || 0;
    if (c >= n) continue;
    count.set(it.keyword, c + 1);
    out.push(it);
  }
  return out;
}

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

// 历史页可以改关键词，每轮开始前重新读一次，省得重启
function reloadKeywords() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!Array.isArray(c.keywords)) return;
    const list = c.keywords.map((s) => String(s).trim()).filter(Boolean);
    if (!list.length) return;
    if (list.join('\u0000') === cfg.keywords.join('\u0000')) return;
    cfg.keywords = list;
    log(`关键词已更新：${list.length} 个 → ${list.join(' / ')}`);
  } catch (e) {
    log('重读 config.json 失败，沿用上次关键词:', e.message.split('\n')[0]);
  }
}

async function runRound(source, store) {
  const started = Date.now();
  const mode = resolveMode();
  const fromApi = mode === 'api';
  reloadKeywords();
  log(`开始一轮，关键词 ${cfg.keywords.length} 个（来源：${SOURCE_LABEL[mode]}）`);

  let raw = [];
  try {
    raw = await source.searchAll(cfg.keywords);
  } catch (e) {
    log('采集失败:', e.message.split('\n')[0]);
    return;
  }

  const enriched = raw.map((it) => ({
    ...it,
    pubTime: parseTime(it.timeText),
    fetchedAt: new Date().toISOString(),
  }));

  // 阶段一：先做不依赖互动的过滤（过期/超期/无效），把详情页请求量压到最低
  const pre = filterItems(enriched, cfg, { skipInteraction: true });
  const limited = limitPerKeyword(pre.kept, cfg.maxItemsPerKeyword || 30);
  const candidates = limited.filter((it) => !store.has(it.articleId));

  log(
    `本轮：抓到 ${raw.length}，预过滤 ${JSON.stringify(pre.drop)}，候选 ${candidates.length} 条（已排除历史重复）`
  );

  // 阶段二：候选才补互动数据（仅 API 来源需要；页面来源本身已带）
  let items = candidates;
  if (fromApi && candidates.length) {
    const t = Date.now();
    const r = await enrichAll(candidates, {
      concurrency: (cfg.detail && cfg.detail.concurrency) || 3,
      minGapMs: (cfg.detail && cfg.detail.minGapMs) || 400,
      log,
    });
    items = r.items;
    log(`  补互动：成功 ${r.ok}，失败 ${r.fail}，耗时 ${((Date.now() - t) / 1000).toFixed(1)}s`);
  }

  // 阶段三：拿到互动后再做最终过滤（补全时可能发现已过期）
  const finalCheck = filterItems(items, cfg, { skipInteraction: false });
  const fresh = finalCheck.kept;
  const drop = {
    ...pre.drop,
    expired: pre.drop.expired + finalCheck.drop.expired,
    noInteraction: finalCheck.drop.noInteraction,
    lowInteraction: finalCheck.drop.lowInteraction,
    lowInteractionDefault: finalCheck.drop.lowInteractionDefault,
    stale: pre.drop.stale + finalCheck.drop.stale,
    staleDefault: pre.drop.staleDefault + finalCheck.drop.staleDefault,
  };

  // 补不到互动数据的，不当作「全 0」误杀，但也不静默——在看板上标出来
  const unknown = fresh.filter((it) => it.interactionUnknown).length;

  if (fresh.length) store.add(fresh);

  log(
    `结果：新增 ${fresh.length} 条${unknown ? `（其中 ${unknown} 条互动数据缺失）` : ''}，丢弃 ${JSON.stringify(drop)}，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`
  );

  for (const it of fresh) {
    log(
      `  + [${it.keyword}] ${it.title.slice(0, 40)} | ${it.priceText} | 值${it.worthy ?? '?'} 不值${it.unworthy ?? '?'} 藏${it.favs ?? '?'} 评${it.comments ?? '?'}`
    );
  }

  if (fresh.length) {
    notifyRound(fresh, {
      port: cfg.server.port,
      maxPerRound: cfg.notify.maxPerRound || 5,
      enabled: cfg.notify.toast !== false,
    });
  }
}

async function main() {
  if (!cfg.keywords || !cfg.keywords.length) {
    console.error('config.json 里没有关键词');
    process.exit(1);
  }

  const store = new Store();
  log(`已加载历史 ${store.items.length} 条`);

  const reads = new Reads();
  const server = createServer(store, cfg, reads);
  const mode = resolveMode();
  const source =
    mode === 'api'
      ? new ApiSource(cfg, log)
      : mode === 'browser'
        ? new SmzdmSource(cfg, log)
        : new HttpSource(cfg, log);
  log(`数据源：${SOURCE_LABEL[mode]}`);

  const shutdown = async () => {
    log('退出中…');
    await source.close();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (ONCE) {
    await runRound(source, store);
    await source.close();
    server.close();
    // 等 Toast 的 PowerShell 进程发出去
    setTimeout(() => process.exit(0), 1500);
    return;
  }

  await runRound(source, store);
  const interval = (cfg.intervalMinutes || 15) * 60 * 1000;
  log(`下次检查在 ${cfg.intervalMinutes} 分钟后`);
  setInterval(async () => {
    await runRound(source, store);
    log(`下次检查在 ${cfg.intervalMinutes} 分钟后`);
  }, interval);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
