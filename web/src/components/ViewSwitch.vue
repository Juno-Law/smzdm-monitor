<script setup>
import { computed } from 'vue';

/**
 * 未读 / 全部 分段切换。
 * 用 v-model 双向绑定：父组件写 v-model="state.view"，
 * 子组件只负责 emit('update:modelValue')，不直接改父状态。
 */
const props = defineProps({
  modelValue: { type: String, required: true },
  unread: { type: Number, default: 0 },
});

const emit = defineEmits(['update:modelValue']);

const options = [
  { value: 'unread', label: '未读' },
  { value: 'all', label: '全部' },
];

const activeIndex = computed(() => options.findIndex((item) => item.value === props.modelValue));
</script>

<template>
  <div class="relative grid grid-cols-2 rounded-full bg-ink/5 p-1 text-sm">
    <!-- 滑块：靠 transform 移动，比切换背景色顺滑 -->
    <span
      class="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-surface shadow-sm transition-transform duration-300 ease-out"
      :style="{ transform: `translateX(${activeIndex * 100}%)` }"
    />

    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="relative z-10 flex h-7 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] transition-colors sm:h-8 sm:px-4 sm:text-sm"
      :class="modelValue === option.value ? 'font-semibold text-ink' : 'text-ink-3 hover:text-ink-2'"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
      <span
        v-if="option.value === 'unread' && unread > 0"
        class="rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors"
        :class="modelValue === 'unread' ? 'bg-brand text-white' : 'bg-brand-soft text-brand'"
      >
        {{ unread }}
      </span>
    </button>
  </div>
</template>
