<script setup>
import { computed, ref, watch } from 'vue';
import { ThumbsUp, ThumbsDown, Star, MessageSquare, ImageOff } from 'lucide-vue-next';
import { splitPrice, largeImage, sourceOf, isHotTag } from '../utils/format';

const props = defineProps({
  deal: { type: Object, required: true },
  unread: { type: Boolean, default: false },
});

const emit = defineEmits(['read', 'open']);

const price = computed(() => splitPrice(props.deal.priceText));
const source = computed(() => sourceOf(props.deal.sorts));
const tags = computed(() => (props.deal.tags || []).slice(0, 3));

const stats = computed(() => [
  { key: 'worthy', icon: ThumbsUp, value: props.deal.worthy || 0, label: '值' },
  { key: 'unworthy', icon: ThumbsDown, value: props.deal.unworthy || 0, label: '不值' },
  { key: 'favs', icon: Star, value: props.deal.favs || 0, label: '收藏' },
  { key: 'comments', icon: MessageSquare, value: props.deal.comments || 0, label: '评论' },
]);

const imgSrc = ref('');
const imgBroken = ref(false);
const triedOriginal = ref(false);

watch(
  () => props.deal.imgUrl,
  (url) => {
    imgSrc.value = url ? largeImage(url) : '';
    imgBroken.value = false;
    triedOriginal.value = false;
  },
  { immediate: true }
);

/** 高清图挂了退回 250px 原图，再挂就显示占位块 */
function onImageError() {
  const original = props.deal.imgUrl;
  if (original && !triedOriginal.value) {
    triedOriginal.value = true;
    imgSrc.value = original;
    return;
  }
  imgBroken.value = true;
}

function openDeal() {
  emit('open', props.deal);
}
</script>

<template>
  <article
    class="group relative flex gap-4 rounded-card bg-surface p-4 ring-1 ring-line transition-all duration-200 hover:-translate-y-px hover:ring-ink-4/30 hover:shadow-[0_12px_30px_-18px_rgba(17,18,22,0.3)] sm:gap-[18px] sm:p-[18px]"
  >
    <!-- 商品图：点图等于点标题 -->
    <a
      :href="deal.url"
      target="_blank"
      rel="noreferrer"
      class="relative size-24 shrink-0 self-start overflow-hidden rounded-xl bg-canvas ring-1 ring-line/70 sm:size-[124px]"
      :aria-label="deal.title"
      @click="openDeal"
    >
      <img
        v-if="imgSrc && !imgBroken"
        :src="imgSrc"
        :alt="deal.title"
        loading="lazy"
        class="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
        :class="unread ? '' : 'opacity-70 grayscale-[35%]'"
        @error="onImageError"
      />
      <span v-else class="grid size-full place-items-center text-ink-4">
        <ImageOff :size="20" />
      </span>
    </a>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 标题 -->
      <a
        :href="deal.url"
        target="_blank"
        rel="noreferrer"
        class="line-clamp-2 text-[15.5px] leading-[1.55] transition-colors hover:text-brand"
        :class="unread ? 'font-semibold text-ink' : 'text-ink-3'"
        @click="openDeal"
      >
        <span
          v-if="unread"
          class="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-brand align-middle"
        />
        {{ deal.title }}
      </a>

      <!-- 价格 -->
      <p class="mt-1.5 flex items-baseline gap-0.5">
        <span class="text-[13px] font-semibold" :class="unread ? 'text-brand' : 'text-brand/50'">¥</span>
        <span
          class="text-[26px] font-bold leading-none tracking-tight tabular-nums"
          :class="unread ? 'text-brand' : 'text-brand/50'"
        >
          {{ price.value }}
        </span>
        <span v-if="price.note" class="ml-1 text-[12px] text-ink-3">{{ price.note }}</span>
      </p>

      <!-- 标签 -->
      <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span class="rounded-md bg-canvas px-2 py-0.5 text-[11.5px] text-ink-2 ring-1 ring-line">
          {{ deal.keyword }}
        </span>
        <span
          v-if="source"
          class="rounded-md px-2 py-0.5 text-[11.5px]"
          :class="
            source.tone === 'both' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-700'
          "
        >
          {{ source.text }}
        </span>
        <span
          v-for="(tag, index) in tags"
          :key="tag"
          class="rounded-md px-2 py-0.5 text-[11.5px]"
          :class="[
            isHotTag(tag) ? 'bg-brand-soft text-brand' : 'bg-canvas text-ink-3',
            index >= 2 ? 'hidden sm:inline-block' : '',
          ]"
        >
          {{ tag }}
        </span>
      </div>

      <!-- 互动数据 + 来源信息 -->
      <div class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-3">
        <div class="flex items-center gap-4">
          <span
            v-for="stat in stats"
            :key="stat.key"
            class="flex items-center gap-1.5"
            :title="stat.label"
          >
            <component
              :is="stat.icon"
              :size="14"
              :class="stat.value ? 'text-ink-3' : 'text-ink-4/40'"
            />
            <span
              class="text-[13px] tabular-nums"
              :class="stat.value ? 'font-semibold text-ink-2' : 'text-ink-4'"
            >
              {{ stat.value }}
            </span>
          </span>
        </div>

        <span class="hidden items-center gap-2 text-[12px] text-ink-4 sm:flex">
          <span class="h-3 w-px bg-line" />
          {{ deal.mall }}<template v-if="deal.timeText"> · {{ deal.timeText }}</template>
        </span>

        <!-- 窄屏才用底部按钮，宽屏走右侧操作列 -->
        <div class="ml-auto flex items-center gap-2 sm:hidden">
          <button
            v-if="unread"
            type="button"
            class="rounded-lg px-2.5 py-2 text-[12.5px] text-ink-3"
            @click="emit('read', deal)"
          >
            已看
          </button>
          <a
            :href="deal.buyUrl || deal.url"
            target="_blank"
            rel="noreferrer"
            class="rounded-lg bg-brand px-4 py-2 text-[13px] font-medium text-white"
            @click="openDeal"
          >
            去购买
          </a>
        </div>
      </div>
    </div>

    <!-- 桌面端操作列：让卡片右侧有落点，不再是一片空白 -->
    <div class="hidden w-[88px] shrink-0 flex-col justify-center gap-1 sm:flex">
      <a
        :href="deal.buyUrl || deal.url"
        target="_blank"
        rel="noreferrer"
        class="rounded-lg bg-brand py-1.5 text-center text-[12.5px] font-medium text-white transition-colors hover:bg-brand-strong"
        @click="openDeal"
      >
        去购买
      </a>
      <!-- 平时不抢视线，鼠标移上来才出现 -->
      <button
        v-if="unread"
        type="button"
        class="rounded-lg py-1 text-[12px] text-ink-3 opacity-0 transition-all hover:bg-canvas hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        @click="emit('read', deal)"
      >
        标为已看
      </button>
    </div>
  </article>
</template>
