<script setup>
import { useToast } from '../composables/useToast';

const { toasts } = useToast();
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="rounded-full bg-ink/90 px-4 py-2 text-[13px] text-white shadow-lg backdrop-blur"
        >
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.22s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
.toast-move {
  transition: transform 0.22s ease;
}
</style>
