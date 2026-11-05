<script setup>
import { CheckCheck, Flame, Tags } from 'lucide-vue-next';
import ViewSwitch from './ViewSwitch.vue';
import SearchBox from './SearchBox.vue';
import KeywordBar from './KeywordBar.vue';
import { useToast } from '../composables/useToast';
import { state, unreadCount, keywordTabs, markAllRead, resetPaging } from '../stores/deals';

const emit = defineEmits(['manage-keywords']);
const { show } = useToast();

async function onMarkAll() {
  const scope = state.view === 'unread' ? '未读' : '当前筛选下';
  if (!window.confirm(`把${scope}的记录全部标为已读？`)) return;

  const count = await markAllRead();
  show(count ? `已标记 ${count} 条` : '没有可标记的记录');
}

function selectKeyword(keyword) {
  state.keyword = keyword;
  resetPaging();
}
</script>

<template>
  <header class="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-xl">
    <div class="mx-auto max-w-[1040px] px-4 sm:px-6">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-2 py-3 sm:gap-x-3">
        <!-- 品牌：窄屏只留图标，省出宽度给分段控件 -->
        <div class="flex shrink-0 items-center gap-2.5">
          <span
            class="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-brand to-orange-500 text-white shadow-sm shadow-brand/25"
          >
            <Flame :size="16" />
          </span>
          <span class="hidden text-[15px] font-semibold tracking-tight sm:inline">
            好价<span class="text-brand">监控</span>
          </span>
        </div>

        <ViewSwitch v-model="state.view" :unread="unreadCount" class="sm:ml-1" />

        <SearchBox
          v-model="state.query"
          class="order-last w-full sm:order-none sm:ml-auto sm:w-60"
        />

        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink sm:w-auto sm:px-2.5"
          title="管理关键词"
          @click="emit('manage-keywords')"
        >
          <Tags :size="16" />
          <span class="hidden text-[13px] sm:inline">关键词</span>
        </button>

        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink sm:w-auto sm:px-2.5"
          title="把当前列表全部标为已读"
          @click="onMarkAll"
        >
          <CheckCheck :size="16" />
          <span class="hidden text-[13px] sm:inline">全部已读</span>
        </button>
      </div>

      <KeywordBar :tabs="keywordTabs" :active="state.keyword" @select="selectKeyword" />
    </div>
  </header>
</template>
