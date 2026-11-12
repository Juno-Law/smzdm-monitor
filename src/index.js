const { SmzdmSource } = require('./source');
const { HttpSource } = require('./source-http');
const { ApiSource } = require('./source-api');
const { enrichAll } = require('./detail');
const { Store, Reads, parseTime } = require('./store');
const interactions = require('./interactions');
const { notifyRound } = require('./notify');
const { createServer } = require('./server');

const { read: readConfig, CONFIG_PATH } = require('./config');
const { keywordNames, buildRules } = require('./keywords');

const cfg = readConfig();
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

function passGate(it, g) {
  const worthy = it.worthy || 0;
  const comments = it.comments || 0;
  const minW = g.minWorthy || 0;
  const minC = g.minComments || 0;
  return g.combine === 'all' ? worthy >= minW && comments >= minC : worthy >= minW || comments >= minC;
}

function filterItems(items, rulesFor, opts = {}) {
  const { skipInteraction = false } = opts;
  const kept = [];
  const drop = {
    stale: 0,
    staleDefault: 0,
    expired: 0,
    noInteraction: 0,
    lowInteraction: 0,
    noId: 0,
  };
  for (const it of items) {
    if (!it.articleId || !it.title) {
      drop.noId++;
      continue;
    }
    // 每个词的规则不同，逐条取；查不到就回落全局默认
    const r = rulesFor(it.keyword);
    const gate = r.interactionGate;

    if (r.skipExpired && it.expired) {
      drop.expired++;
      continue;
    }
    if (!skipInteraction && r.skipNoInteraction) {
      const interactions = (it.worthy || 0) + (it.unworthy || 0) + (it.favs || 0) + (it.comments || 0);
      if (interactions <= 0) {
        drop.noInteraction++;
        continue;
      }
      // 互动门槛：最新排序和综合排序用同一套，值/评论谁达标都算（combine=all 时两个都要）
      if (gate && !it.interactionUnknown) {
        if (!passGate(it, gate)) {
          drop.lowInteraction++;
          continue;
        }
      }
    }
    if (r.maxAgeDays) {
      const ageDays = (Date.now() - new Date(it.pubTime).getTime()) / 86400000;
      if (ageDays > r.maxAgeDays) {
        drop.stale++;
        continue;
      }
    }
    // 只在综合排序出现的条目：它靠热度上榜，可能是几十小时前的。
    // 这类要看但要有上限 —— 超过两天基本是已经死掉、只是还挂在热榜上的老帖
    if (r.maxAgeHoursDefault) {
      const s = it.sorts || [];
      const defaultOnly = s.length === 1 && s[0] === 'default';
      if (defaultOnly) {
        const ageHours = (Date.now() - new Date(it.pubTime).getTime()) / 3600000;
        if (ageHours > r.maxAgeHoursDefault) {
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
function limitPerKeyword(items, rulesFor) {
  const count = new Map();
  const out = [];
  for (const it of items) {
    const n = rulesFor(it.keyword).maxItemsPerKeyword || 40;
    const c = count.get(it.keyword) || 0;
    if (c >= n) continue;
    count.set(it.keyword, c + 1);
    out.push(it);
  }
  return out;
}

// 历史页可以改关键词，每轮开始前重新读一次，省得重启
function reloadKeywords() {
  try {
    const c = readConfig();
    const list = c.keywords || [];
    if (!list.length) return; // 全清空了就沿用上次，别让采集直接停摆
    // 现在 keywords 是对象数组，只能按结构比较
    if (JSON.stringify(list) === JSON.stringify(cfg.keywords)) return;
    cfg.keywords = list;
    log(`关键词/规则已更新：${list.length} 个 → ${keywordNames(list).join(' / ')}`);
  } catch (e) {
    log('重读 config.json 失败，沿用上次关键词:', e.message.split('\n')[0]);
  }
}

async function runRound(source, store) {
  const started = Date.now();
  const mode = resolveMode();
  const fromApi = mode === 'api';
  reloadKeywords();

  // 本轮把关键词和规则各拷一份局部引用：即使下一轮开始时配置被改，
  // 这一轮的过滤也只用开跑那一刻的规则
  const keywords = cfg.keywords;
  const names = keywordNames(keywords);
  const rulesFor = buildRules({ ...cfg, keywords });

  log(`开始一轮，关键词 ${names.length} 个（来源：${SOURCE_LABEL[mode]}）`);

  let raw = [];
  try {
    raw = await source.searchAll(names);
  } catch (e) {
    log('采集失败:', e.message.split('\n')[0]);
    return;
  }

  const enriched = raw.map((it) => ({
    ...it,
    pubTime: parseTime(it.timeText),
    fetchedAt: new Date().toISOString(),
  }));

  // 已入库的条目不再参与入库判断，但它们的值/评论还在涨。
  // 顺手把列表页的最新数字写进补丁层（deals.jsonl 只追加不改，见 interactions.js），
  // 否则页面上下滑到的老条目会永远停在入库那一刻。只增不减，防止滞后的列表页把数改小。
  const known = enriched.filter((it) => {
    if (!it.articleId || !store.has(it.articleId)) return false;
    // 四项全 0 多半是列表页没解析出来，别把 0 当成真实值写进去
    return (it.worthy || 0) + (it.unworthy || 0) + (it.favs || 0) + (it.comments || 0) > 0;
  });
  if (known.length) {
    const patched = interactions.saveMany(
      known.map((it) => [
        it.articleId,
        { worthy: it.worthy, unworthy: it.unworthy, favs: it.favs, comments: it.comments },
      ]),
      { maxOnly: true }
    );
    if (patched) log(`  互动补丁：${patched} 条已入库条目的数字有变化`);
  }

  // 阶段一：先做不依赖互动的过滤（过期/超期/无效），把详情页请求量压到最低
  const pre = filterItems(enriched, rulesFor, { skipInteraction: true });
  const limited = limitPerKeyword(pre.kept, rulesFor);
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
  const finalCheck = filterItems(items, rulesFor, { skipInteraction: false });
  const fresh = finalCheck.kept;
  const drop = {
    ...pre.drop,
    expired: pre.drop.expired + finalCheck.drop.expired,
    noInteraction: finalCheck.drop.noInteraction,
    lowInteraction: finalCheck.drop.lowInteraction,
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

  // notify:false 的词照样入库，只是不弹桌面通知
  const toastItems = fresh.filter((it) => rulesFor(it.keyword).notify);
  if (toastItems.length) {
    notifyRound(toastItems, {
      port: cfg.server.port,
      maxPerRound: (cfg.notify && cfg.notify.maxPerRound) || 5,
      enabled: (cfg.notify && cfg.notify.toast) !== false,
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

  // 上一轮没跑完就别再开一轮：两轮同时抓会把同一批条目重复入队、重复通知
  let roundRunning = false;
  setInterval(async () => {
    if (roundRunning) {
      log('上一轮还没结束，跳过这次');
      return;
    }
    roundRunning = true;
    try {
      await runRound(source, store);
    } finally {
      roundRunning = false;
    }
    log(`下次检查在 ${cfg.intervalMinutes} 分钟后`);
  }, interval);
}

// 作为脚本直接跑时才启动采集；被 require（比如验证过滤逻辑）时只导出函数
if (require.main === module) {
  main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
  });
}

module.exports = { filterItems, limitPerKeyword, runRound };
