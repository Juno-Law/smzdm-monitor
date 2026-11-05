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

    return state.view === 'all' || isUnread(deal);
  });
});

export const unreadCount = computed(() => state.deals.filter(isUnread).length);

export const totalCount = computed(() => state.deals.length);

/** 未读永远在前，已读沉底，两段内部都按发布时间倒序 */
const orderedDeals = computed(() => {
  const sorted = [...filteredDeals.value].sort(byPubTimeDesc);
  return [...sorted.filter(isUnread), ...sorted.filter((deal) => !isUnread(deal))];
});

export const hasMore = computed(() => orderedDeals.value.length > state.visible);

/**
 * 把列表摊平成「日期分隔 / 已读分隔 / 卡片」三种行，
 * 这样模板里只有一个 v-for，TransitionGroup 也能整体做动画。
 */
export const rows = computed(() => {
  const list = orderedDeals.value.slice(0, state.visible);
  const readTotal = orderedDeals.value.filter((deal) => !isUnread(deal)).length;
  const result = [];

  let lastDay = '';
  let dividerAdded = false;

  for (const deal of list) {
    const unread = isUnread(deal);

    if (!unread && !dividerAdded && readTotal > 0) {
      result.push({ type: 'divider', key: 'divider', count: readTotal });
      dividerAdded = true;
      lastDay = '';
    }

    const key = dayKey(deal.pubTime);
    if (key && key !== lastDay) {
      result.push({ type: 'day', key: `day-${key}-${unread}`, label: dayLabel(deal.pubTime) });
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

/** 乐观更新：先改本地，失败了也不回滚（下次轮询会对齐到服务端） */
export async function markRead(deal) {
  if (state.readIds.has(deal.articleId)) return;
  state.readIds.add(deal.articleId);
  try {
    await api.markRead(deal.articleId);
  } catch {
    /* 忽略，轮询会纠正 */
  }
}

export async function markAllRead() {
  const ids = filteredDeals.value.map((deal) => deal.articleId);
  if (!ids.length) return 0;

  ids.forEach((id) => state.readIds.add(id));
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
