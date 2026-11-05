<script setup>
import { Inbox } from 'lucide-vue-next';

defineProps({
  title: { type: String, required: true },
  hint: { type: String, default: '' },
  actionText: { type: String, default: '' },
});

const emit = defineEmits(['action']);
</script>

<template>
  <div class="flex flex-col items-center justify-center py-24 text-center">
    <div class="grid size-14 place-items-center rounded-2xl bg-surface text-ink-4 ring-1 ring-line">
      <Inbox :size="24" />
    </div>

    <p class="mt-4 text-[14px] font-medium text-ink-2">{{ title }}</p>
    <p v-if="hint" class="mt-1 text-[13px] text-ink-4">{{ hint }}</p>

    <button
      v-if="actionText"
      type="button"
      class="mt-5 rounded-full bg-surface px-4 py-1.5 text-[13px] text-ink-2 ring-1 ring-line transition-colors hover:text-ink hover:ring-ink-4/40"
      @click="emit('action')"
    >
      {{ actionText }}
    </button>
  </div>
</template>
