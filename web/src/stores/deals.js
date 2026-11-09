import { computed, reactive } from 'vue';
import { api } from '../api';
import { dayKey, dayLabel } from '../utils/format';

/**
 * 全站状态。
 *
 * 没有用 Pinia：这个应用只有一个视图，状态也就十来个字段。
 * 用模块级 reactive 当单例，组件直接 import 就能读写 —— 对学习来说，
 * 先把 computed、响应式依赖追踪看明白，比先学一套状态库的样板更有用。
 * 等以后有多个页面、需要跨路由共享，再换 Pinia 是一行行搬过去的事。
 */
export const state = reactive({
  deals: [],
  readIds: new Set(),
  // 本会话里点过、但仍要留在列表原位的 id。只增不减，刷新页面自然清空。
  // 不能复用 readIds：那个每 60 秒会被服务端数据整体替换，承载不了「本会话」语义。
  settledIds: new Set(),
  baselineAt: 0,
  keywords: [],
  view: 'unread', // 'unread' | 'all'
  keyword: '全部',
  query: '',
  visible: 60,
  loading: true,
  error: '',
});

const POLL_INTERVAL = 60_000;

/** 未读 = 晚于基线抓到的，且没有被点过 */
export function isUnread(deal) {
  if (state.readIds.has(deal.articleId)) return false;
  return new Date(deal.fetchedAt).getTime() > state.baselineAt;
}

/** 界面上还该当作「活的未读」渲染：服务端未读，且本会话没点过 */
export function isPending(deal) {
  return isUnread(deal) && !state.settledIds.has(deal.articleId);
}

/** 卡片是否灰掉：本会话点过，或者服务端已读 */
export function isDimmed(deal) {
  return state.settledIds.has(deal.articleId) || !isUnread(deal);
}

/**
 * 这张卡算在哪个分区里。
 * 点过的仍算「未读区」——否则会立刻沉到「已读 · N 条」下面去，看着像被下架了。
 * 不变量：settledIds 只收录「点的那一刻确实是未读」的 id，
 * 所以在「全部」视图里点历史已读条目，不会把它误拉回未读区顶部。
 */
function inUnreadSection(deal) {
  return isUnread(deal) || state.settledIds.has(deal.articleId);
}

const byPubTimeDesc = (a, b) => new Date(b.pubTime) - new Date(a.pubTime);

/** 当前筛选条件下命中的记录（不含排序与分页） */
const filteredDeals = computed(() => {
  const query = state.query.trim().toLowerCase();

  return state.deals.filter((deal) => {
    if (state.keyword !== '全部' && deal.keyword !== state.keyword) return false;

    if (query) {
      const haystack = `${deal.title} ${deal.mall || ''} ${deal.keyword || ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return state.view === 'all' || inUnreadSection(deal);
  });
});

/** 角标只看「真·没点过」的：点过就减 1，哪怕服务端还没确认 */
export const unreadCount = computed(() => state.deals.filter(isPending).length);

export const totalCount = computed(() => state.deals.length);

/** 未读永远在前，已读沉底，两段内部都按发布时间倒序 */
const orderedDeals = computed(() => {
  const sorted = [...filteredDeals.value].sort(byPubTimeDesc);
  return [
    ...sorted.filter(inUnreadSection),
    ...sorted.filter((deal) => !inUnreadSection(deal)),
  ];
});

export const hasMore = computed(() => orderedDeals.value.length > state.visible);

/**
 * 把列表摊平成「日期分隔 / 已读分隔 / 卡片」三种行，
 * 这样模板里只有一个 v-for，TransitionGroup 也能整体做动画。
 */
export const rows = computed(() => {
  const list = orderedDeals.value.slice(0, state.visible);
  const readTotal = orderedDeals.value.filter((deal) => !inUnreadSection(deal)).length;
  const result = [];

  let lastDay = '';
  let dividerAdded = false;

  for (const deal of list) {
    // 用「分区归属」而不是「是否未读」：点过之后它仍在未读区，
    // 下面 day-xxx-${placed} 这个 key 才不会翻转，TransitionGroup 不会整组重建闪一下
    const placed = inUnreadSection(deal);

    if (!placed && !dividerAdded && readTotal > 0) {
      result.push({ type: 'divider', key: 'divider', count: readTotal });
      dividerAdded = true;
      lastDay = '';
    }

    const key = dayKey(deal.pubTime);
    if (key && key !== lastDay) {
      result.push({ type: 'day', key: `day-${key}-${placed}`, label: dayLabel(deal.pubTime) });
      lastDay = key;
    }

    result.push({ type: 'deal', key: deal.articleId, deal });
  }

  return result;
});

export const keywordTabs = computed(() => ['全部', ...state.keywords]);

let pollTimer = null;

/** 拉一次数据。silent = 轮询刷新，不显示骨架屏 */
export async function loadDeals({ silent = false } = {}) {
  if (!silent) state.loading = true;

  try {
    const data = await api.fetchDeals();
    state.deals = data.items || [];
    state.readIds = new Set(data.read || []);
    state.baselineAt = new Date(data.baseline || 0).getTime();
    state.error = '';
    // 列表先渲染出来，互动数据随后在后台补，不阻塞首屏
    refreshInteractions();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
  }
}

export async function loadKeywords() {
  try {
    const data = await api.fetchKeywords();
    state.keywords = data.keywords || [];
    if (state.keyword !== '全部' && !state.keywords.includes(state.keyword)) {
      state.keyword = '全部';
    }
  } catch {
    // 关键词拿不到不影响看列表，静默失败
  }
}

/**
 * 点过之后：卡片变灰但留在原位，刷新页面才真正从「未读」里消失。
 * settledIds 负责「留在原位」，readIds 负责「服务端已读」，两者分开。
 */
export async function markRead(deal) {
  // 必须在 readIds.add 之前算：isUnread 内部就查 readIds
  if (isUnread(deal)) state.settledIds.add(deal.articleId);
  if (state.readIds.has(deal.articleId)) return;
  state.readIds.add(deal.articleId);
  try {
    await api.markRead(deal.articleId);
  } catch {
    /* 忽略，轮询会纠正；settledIds 保证它不会在原位上「复活」变黑 */
  }
}

export async function markAllRead() {
  // 只挑还显示为未读的：点过变灰的不重复提交，已读历史也不再无谓重发
  const ids = filteredDeals.value.filter(isPending).map((deal) => deal.articleId);
  if (!ids.length) return 0;

  ids.forEach((id) => {
    state.settledIds.add(id);
    state.readIds.add(id);
  });
  try {
    await api.markRead(ids);
  } catch {
    /* 同上 */
  }
  return ids.length;
}

export function loadMore() {
  state.visible += 60;
}

export function resetPaging() {
  state.visible = 60;
}

export function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => loadDeals({ silent: true }), POLL_INTERVAL);
}

export function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ---------- 互动数据刷新 ----------
// 列表里的值/不值/收藏/评论是入库那一刻的快照，详情页的数字会一直涨。
// 这里在数据到位后按批问后端要最新值，拿到就原地改字段，不重建列表。

const INTERACTION_TTL_MS = 30 * 60 * 1000; // 和服务端 refreshTtlMinutes 对齐
const INTERACTION_BATCH = 6; // 一批大约 1 秒，回来一批就刷一批
const INTERACTION_MAX = 12; // 单次加载最多补 12 条，剩下的等下一轮轮询

let refreshing = false;

/** 只改字段、不换对象 —— 不触发重排，也不打断 TransitionGroup */
function applyInteractions(map) {
  if (!map) return;
  for (const deal of state.deals) {
    const patch = map[deal.articleId];
    if (!patch) continue;
    const values = [patch.worthy, patch.unworthy, patch.favs, patch.comments];
    if (!values.every(Number.isFinite)) continue;
    Object.assign(deal, {
      worthy: patch.worthy,
      unworthy: patch.unworthy,
      favs: patch.favs,
      comments: patch.comments,
      interactionsAt: patch.at,
    });
  }
}

/**
 * 补互动数据：挑「未读 + 本地没有新值」的，按批串行请求。
 * fire-and-forget，失败静默 —— 数字旧一点不影响用，比弹错误好。
 */
export async function refreshInteractions() {
  if (refreshing) return;
  refreshing = true;

  try {
    const now = Date.now();
    const targets = state.deals
      .filter(isPending)
      .filter(
        (deal) =>
          !deal.interactionsAt ||
          now - new Date(deal.interactionsAt).getTime() > INTERACTION_TTL_MS
      )
      .slice(0, INTERACTION_MAX)
      .map((deal) => deal.articleId);

    for (let start = 0; start < targets.length; start += INTERACTION_BATCH) {
      let data;
      try {
        data = await api.fetchInteractions(targets.slice(start, start + INTERACTION_BATCH));
      } catch {
        break;
      }
      // 每次都按「当前」的 state.deals 匹配：请求期间它可能已被轮询整体替换
      applyInteractions(data.items);
    }
  } finally {
    refreshing = false;
  }
}
