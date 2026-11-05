<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Search, X } from 'lucide-vue-next';

defineProps({
  placeholder: { type: String, default: '搜标题、商城…' },
});

const model = defineModel({ type: String, default: '' });
const inputRef = ref(null);

/** 按 / 聚焦搜索框，跟大多数列表页的习惯一致 */
function onKeydown(event) {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (event.key === '/' && !typing) {
    event.preventDefault();
    inputRef.value?.focus();
  }
  if (event.key === 'Escape' && document.activeElement === inputRef.value) {
    model.value = '';
    inputRef.value?.blur();
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <label
    class="group flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 transition-colors focus-within:border-ink-4/60 hover:border-ink-4/40"
  >
    <Search :size="15" class="shrink-0 text-ink-4" />
    <input
      ref="inputRef"
      v-model="model"
      type="search"
      :placeholder="placeholder"
      class="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-ink-4 [&::-webkit-search-cancel-button]:hidden"
    />
    <button
      v-if="model"
      type="button"
      class="grid size-4 shrink-0 place-items-center rounded-full bg-ink-4/20 text-ink-2 hover:bg-ink-4/40"
      title="清空"
      @click="model = ''"
    >
      <X :size="11" />
    </button>
    <kbd
      v-else
      class="hidden shrink-0 rounded border border-line px-1 text-[10px] text-ink-4 sm:block"
    >
      /
    </kbd>
  </label>
</template>
