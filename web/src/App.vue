<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AppHeader from './components/AppHeader.vue';
import DealList from './components/DealList.vue';
import KeywordDialog from './components/KeywordDialog.vue';
import ToastHost from './components/ToastHost.vue';
import { loadDeals, loadKeywords, startPolling, stopPolling } from './stores/deals';

const keywordDialogOpen = ref(false);

onMounted(async () => {
  await Promise.all([loadDeals(), loadKeywords()]);
  startPolling();
});

onBeforeUnmount(stopPolling);
</script>

<template>
  <div class="min-h-screen pb-10">
    <AppHeader @manage-keywords="keywordDialogOpen = true" />

    <main class="mx-auto max-w-[1040px] px-4 pt-4 sm:px-6">
      <DealList />
    </main>

    <KeywordDialog v-model:open="keywordDialogOpen" />
    <ToastHost />
  </div>
</template>
