<script setup>
import { computed } from 'vue';
import DealCard from './DealCard.vue';
import EmptyState from './EmptyState.vue';
import {
  state,
  rows,
  hasMore,
  loadMore,
  isDimmed,
  markRead,
  totalCount,
} from '../stores/deals';

/** 骨架屏条数，不用跟随真实数据，给个固定值就行 */
const skeletons = Array.from({ length: 4 }, (_, index) => index);

const emptyState = computed(() => {
  if (state.query.trim()) {
    return { title: '没有匹配的记录', hint: `换个词试试，或者清空搜索框`, action: '清空搜索' };
  }
  if (state.keyword !== '全部') {
    return {
      title: `「${state.keyword}」还没有记录`,
      hint: '这个词刚开始采集，或者最近确实没人爆料',
      action: '看全部',
    };
  }
  if (state.view === 'unread') {
    return { title: '都处理完了', hint: '切到「全部」可以翻历史', action: '翻历史' };
  }
  return { title: '还没有数据', hint: '跑一轮采集就有了', action: '' };
});

function handleEmptyAction() {
  if (state.query.trim()) {
    state.query = '';
  } else if (state.keyword !== '全部') {
    state.keyword = '全部';
  } else {
    state.view = 'all';
  }
}
</script>

<template>
  <!-- 首次加载 -->
  <div v-if="state.loading" class="flex flex-col gap-3">
    <div
      v-for="item in skeletons"
      :key="item"
      class="flex gap-5 rounded-card bg-surface p-5 ring-1 ring-line"
    >
      <div class="size-32 shrink-0 animate-pulse rounded-xl bg-canvas" />
      <div class="flex-1 space-y-3 py-1">
        <div class="h-3.5 w-3/4 animate-pulse rounded bg-canvas" />
        <div class="h-3.5 w-1/2 animate-pulse rounded bg-canvas" />
        <div class="h-6 w-24 animate-pulse rounded bg-canvas" />
        <div class="h-3 w-40 animate-pulse rounded bg-canvas" />
      </div>
    </div>
  </div>

  <EmptyState
    v-else-if="!rows.length"
    :title="emptyState.title"
    :hint="emptyState.hint"
    :action-text="emptyState.action"
    @action="handleEmptyAction"
  />

  <template v-else>
    <TransitionGroup name="list" tag="div" class="flex flex-col gap-3">
      <div v-for="row in rows" :key="row.key">
        <p v-if="row.type === 'day'" class="px-1 pb-1 text-[12px] font-medium text-ink-3">
          {{ row.label }}
        </p>

        <div v-else-if="row.type === 'divider'" class="flex items-center gap-3 py-2">
          <span class="h-px flex-1 bg-line" />
          <span class="text-[11.5px] text-ink-4">已读 · {{ row.count }} 条</span>
          <span class="h-px flex-1 bg-line" />
        </div>

        <DealCard
          v-else
          :deal="row.deal"
          :unread="!isDimmed(row.deal)"
          @read="markRead"
          @open="markRead"
        />
      </div>
    </TransitionGroup>

    <div class="mt-6 flex flex-col items-center gap-3">
      <button
        v-if="hasMore"
        type="button"
        class="rounded-full bg-surface px-5 py-2 text-[13px] text-ink-2 ring-1 ring-line transition-colors hover:text-ink hover:ring-ink-4/40"
        @click="loadMore"
      >
        加载更多
      </button>
      <p class="text-[12px] text-ink-4">共 {{ totalCount }} 条记录</p>
    </div>
  </template>
</template>
