<script setup>
defineProps({
  tabs: { type: Array, required: true },
  active: { type: String, required: true },
});

const emit = defineEmits(['select']);
</script>

<template>
  <nav class="no-scrollbar scroll-fade -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
    <button
      v-for="tab in tabs"
      :key="tab"
      type="button"
      class="shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] transition-all duration-200"
      :class="
        tab === active
          ? 'bg-ink font-medium text-white shadow-sm'
          : 'bg-surface text-ink-2 ring-1 ring-line hover:text-ink hover:ring-ink-4/40'
      "
      @click="emit('select', tab)"
    >
      {{ tab }}
    </button>
  </nav>
</template>
