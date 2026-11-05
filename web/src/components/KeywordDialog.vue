<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Plus, Tags, X } from 'lucide-vue-next';
import { api } from '../api';
import { state } from '../stores/deals';
import { useToast } from '../composables/useToast';

/** v-model:open —— 父组件控制开关，组件自己不持有可见性 */
const open = defineModel('open', { type: Boolean, default: false });

const draft = ref([]);
const input = ref('');
const saving = ref(false);
const { show } = useToast();

const isDuplicate = computed(() => {
  const value = input.value.trim().toLowerCase();
  return Boolean(value) && draft.value.some((keyword) => keyword.toLowerCase() === value);
});

// 每次打开都从当前配置重新拿一份草稿，取消就等于丢弃
watch(open, (visible) => {
  if (!visible) return;
  draft.value = [...state.keywords];
  input.value = '';
});

watch(open, (visible) => {
  document.body.style.overflow = visible ? 'hidden' : '';
});

function addKeyword() {
  const value = input.value.trim().replace(/\s+/g, ' ');
  if (!value) return;

  if (value.length > 60) {
    show('太长了，60 字以内');
    return;
  }
  if (isDuplicate.value) {
    show('已经有这个词了');
    return;
  }

  draft.value.push(value);
  input.value = '';
}

function removeKeyword(index) {
  draft.value.splice(index, 1);
}

async function save() {
  saving.value = true;
  try {
    const result = await api.saveKeywords(draft.value);
    if (!result.ok) throw new Error(result.error || '保存失败');

    state.keywords = result.keywords || draft.value;
    if (state.keyword !== '全部' && !state.keywords.includes(state.keyword)) {
      state.keyword = '全部';
    }

    show(`已保存 ${state.keywords.length} 个关键词，下一轮采集生效`);
    open.value = false;
  } catch (error) {
    show(error.message);
  } finally {
    saving.value = false;
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && open.value) open.value = false;
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div class="absolute inset-0 bg-ink/40 backdrop-blur-sm" @click="open = false" />

        <div
          class="panel relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl sm:max-w-md sm:rounded-2xl"
        >
          <header class="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
            <div>
              <h2 class="flex items-center gap-2 text-[15px] font-semibold">
                <Tags :size="16" class="text-ink-3" />
                采集关键词
              </h2>
              <p class="mt-1 text-[12.5px] text-ink-3">
                每行一个词，一次搜索一条。保存后下一轮采集生效，不用重启。
              </p>
            </div>
            <button
              type="button"
              class="grid size-7 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-canvas hover:text-ink"
              aria-label="关闭"
              @click="open = false"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-5">
            <div v-if="!draft.length" class="rounded-xl bg-canvas px-3 py-6 text-center text-[12.5px] text-ink-4">
              还没有关键词，先加一个
            </div>

            <ul v-else class="flex flex-wrap gap-2">
              <li
                v-for="(keyword, index) in draft"
                :key="keyword"
                class="group flex items-center gap-1.5 rounded-lg bg-canvas py-1 pl-2.5 pr-1.5 text-[13px] text-ink-2 ring-1 ring-line"
              >
                {{ keyword }}
                <button
                  type="button"
                  class="grid size-4 place-items-center rounded text-ink-4 transition-colors hover:bg-brand-soft hover:text-brand"
                  :aria-label="`删除 ${keyword}`"
                  @click="removeKeyword(index)"
                >
                  <X :size="11" />
                </button>
              </li>
            </ul>
          </div>

          <div class="px-5 pt-4">
            <div class="flex items-center gap-2">
              <input
                v-model="input"
                type="text"
                placeholder="加一个关键词，比如 机械键盘"
                class="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] outline-none transition-colors placeholder:text-ink-4 focus:border-ink-4/60"
                @keydown.enter.prevent="addKeyword"
              />
              <button
                type="button"
                class="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-ink px-3 text-[13px] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                :disabled="!input.trim() || isDuplicate"
                @click="addKeyword"
              >
                <Plus :size="14" />
                添加
              </button>
            </div>
            <p v-if="isDuplicate" class="mt-1.5 text-[12px] text-brand">已经有这个词了</p>
          </div>

          <footer class="flex items-center justify-between gap-3 px-5 py-4">
            <span class="text-[12px] text-ink-4">共 {{ draft.length }} 个</span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg px-3.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:bg-canvas hover:text-ink"
                @click="open = false"
              >
                取消
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
                :disabled="saving"
                @click="save"
              >
                {{ saving ? '保存中…' : '保存' }}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-active .panel,
.dialog-leave-active .panel {
  transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}
.dialog-enter-from .panel,
.dialog-leave-to .panel {
  transform: translateY(14px) scale(0.98);
}
</style>
