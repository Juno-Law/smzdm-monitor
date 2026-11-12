<script setup>
import { computed } from 'vue';

/**
 * 单个关键词的规则面板。
 *
 * 纯展示：不自持状态，也不发请求。modelValue 是「差量」——
 * 只包含这个关键词真正覆盖的字段，未出现的键表示「跟随全局默认」。
 * 所以每个控件都有三态：默认 / 开 / 关（数值则是空 = 默认）。
 */
const props = defineProps({
  modelValue: { type: Object, default: undefined },
  defaults: { type: Object, default: () => ({}) },
  limits: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['update:modelValue']);

const rules = computed(() => props.modelValue || {});
const gateRules = computed(() => rules.value.interactionGate || {});
const defaults = computed(() => props.defaults || {});
const gateDefaults = computed(() => defaults.value.interactionGate || {});

const triFields = [
  { key: 'skipExpired', label: '跳过过期 / 售罄' },
  { key: 'skipNoInteraction', label: '跳过无互动（全 0）' },
  { key: 'notify', label: '本轮弹桌面通知' },
];

function boolText(value) {
  return value ? '开' : '关';
}

/** 清掉空值和空 interactionGate，避免「跟随默认」变成 null 落盘 */
function commit(next) {
  const out = { ...next };

  if (out.interactionGate) {
    const gate = { ...out.interactionGate };
    for (const key of Object.keys(gate)) {
      if (gate[key] === undefined || gate[key] === '') delete gate[key];
    }
    if (Object.keys(gate).length) out.interactionGate = gate;
    else delete out.interactionGate;
  }

  for (const key of Object.keys(out)) {
    if (out[key] === undefined || out[key] === '') delete out[key];
  }

  emit('update:modelValue', Object.keys(out).length ? out : undefined);
}

function setRule(key, value) {
  const next = { ...rules.value };
  if (value === undefined) delete next[key];
  else next[key] = value;
  commit(next);
}

function setGate(key, value) {
  const next = { ...rules.value, interactionGate: { ...gateRules.value } };
  if (value === undefined) delete next.interactionGate[key];
  else next.interactionGate[key] = value;
  commit(next);
}

function numValue(key, scope) {
  const value = (scope === 'gate' ? gateRules.value : rules.value)[key];
  return value === undefined || value === null ? '' : value;
}

function isSet(key, scope) {
  return (scope === 'gate' ? gateRules.value : rules.value)[key] !== undefined;
}

function onNumberInput(key, scope, event) {
  const raw = event.target.value;
  const next = { ...rules.value };
  if (scope === 'gate') next.interactionGate = { ...gateRules.value };
  const box = scope === 'gate' ? next.interactionGate : next;

  if (raw === '') {
    delete box[key];
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    box[key] = Math.round(n);
  }
  commit(next);
}

/** 失焦才夹到合法区间，否则输 "1" 的中途会被拽成别的值 */
function clampOnBlur(key, scope) {
  const range = (props.limits || {})[key];
  if (!Array.isArray(range)) return;
  const current = (scope === 'gate' ? gateRules.value : rules.value)[key];
  if (current === undefined) return;

  const clamped = Math.min(range[1], Math.max(range[0], Math.round(Number(current))));
  if (clamped === current) return;

  if (scope === 'gate') setGate(key, clamped);
  else setRule(key, clamped);
}

function segClass(active) {
  return active
    ? 'rounded-md bg-ink px-2 py-1 text-white'
    : 'rounded-md px-2 py-1 text-ink-3 hover:text-ink';
}

function numClass(active) {
  return active
    ? 'border-brand/40 bg-surface text-ink'
    : 'border-line bg-canvas text-ink-3';
}
</script>

<template>
  <div class="space-y-3">
    <section>
      <p class="mb-1.5 text-[11px] font-medium tracking-wide text-ink-4">过滤</p>
      <div class="space-y-2">
        <div v-for="field in triFields.slice(0, 2)" :key="field.key" class="flex items-center justify-between gap-2">
          <span class="text-[12.5px] text-ink-2">{{ field.label }}</span>
          <div class="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-canvas p-0.5 ring-1 ring-line">
            <button
              type="button"
              class="text-[12px] transition-colors"
              :class="segClass(rules[field.key] === undefined)"
              @click="setRule(field.key, undefined)"
            >
              默认 {{ boolText(defaults[field.key]) }}
            </button>
            <button
              type="button"
              class="text-[12px] transition-colors"
              :class="segClass(rules[field.key] === true)"
              @click="setRule(field.key, true)"
            >
              开
            </button>
            <button
              type="button"
              class="text-[12px] transition-colors"
              :class="segClass(rules[field.key] === false)"
              @click="setRule(field.key, false)"
            >
              关
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <label class="flex items-center gap-1.5 text-[12.5px] text-ink-2">
            值 ≥
            <input
              type="number"
              inputmode="numeric"
              class="h-7 w-16 rounded-md border px-2 text-[12.5px] outline-none transition-colors focus:border-brand/50"
              :class="numClass(isSet('minWorthy', 'gate'))"
              :value="numValue('minWorthy', 'gate')"
              :placeholder="String(gateDefaults.minWorthy ?? 1)"
              @input="onNumberInput('minWorthy', 'gate', $event)"
              @blur="clampOnBlur('minWorthy', 'gate')"
            />
          </label>
          <label class="flex items-center gap-1.5 text-[12.5px] text-ink-2">
            评论 ≥
            <input
              type="number"
              inputmode="numeric"
              class="h-7 w-16 rounded-md border px-2 text-[12.5px] outline-none transition-colors focus:border-brand/50"
              :class="numClass(isSet('minComments', 'gate'))"
              :value="numValue('minComments', 'gate')"
              :placeholder="String(gateDefaults.minComments ?? 1)"
              @input="onNumberInput('minComments', 'gate', $event)"
              @blur="clampOnBlur('minComments', 'gate')"
            />
          </label>
          <div class="inline-flex items-center gap-0.5 rounded-lg bg-canvas p-0.5 ring-1 ring-line">
            <button
              type="button"
              class="text-[12px] transition-colors"
              :class="segClass(gateRules.combine === undefined)"
              @click="setGate('combine', undefined)"
            >
              默认 {{ gateDefaults.combine === 'all' ? '全部' : '任一' }}
            </button>
            <button
              type="button"
              class="text-[12px] transition-colors"
              :class="segClass(gateRules.combine === 'any')"
              @click="setGate('combine', 'any')"
            >
              任一
            </button>
            <button
              type="button"
              class="text-[12px] transition-colors"
              :class="segClass(gateRules.combine === 'all')"
              @click="setGate('combine', 'all')"
            >
              全部
            </button>
          </div>
        </div>
      </div>
    </section>

    <section>
      <p class="mb-1.5 text-[11px] font-medium tracking-wide text-ink-4">时效</p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label class="flex items-center gap-1.5 text-[12.5px] text-ink-2">
          最久
          <input
            type="number"
            inputmode="numeric"
            class="h-7 w-16 rounded-md border px-2 text-[12.5px] outline-none transition-colors focus:border-brand/50"
            :class="numClass(isSet('maxAgeDays'))"
            :value="numValue('maxAgeDays')"
            :placeholder="String(defaults.maxAgeDays ?? 0)"
            @input="onNumberInput('maxAgeDays', 'rule', $event)"
            @blur="clampOnBlur('maxAgeDays', 'rule')"
          />
          天
        </label>
        <label class="flex items-center gap-1.5 text-[12.5px] text-ink-2">
          综合榜最久
          <input
            type="number"
            inputmode="numeric"
            class="h-7 w-16 rounded-md border px-2 text-[12.5px] outline-none transition-colors focus:border-brand/50"
            :class="numClass(isSet('maxAgeHoursDefault'))"
            :value="numValue('maxAgeHoursDefault')"
            :placeholder="String(defaults.maxAgeHoursDefault ?? 0)"
            @input="onNumberInput('maxAgeHoursDefault', 'rule', $event)"
            @blur="clampOnBlur('maxAgeHoursDefault', 'rule')"
          />
          小时
        </label>
        <span class="text-[11.5px] text-ink-4">填 0 = 不限</span>
      </div>
    </section>

    <section>
      <p class="mb-1.5 text-[11px] font-medium tracking-wide text-ink-4">条数与通知</p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label class="flex items-center gap-1.5 text-[12.5px] text-ink-2">
          每轮最多
          <input
            type="number"
            inputmode="numeric"
            class="h-7 w-16 rounded-md border px-2 text-[12.5px] outline-none transition-colors focus:border-brand/50"
            :class="numClass(isSet('maxItemsPerKeyword'))"
            :value="numValue('maxItemsPerKeyword')"
            :placeholder="String(defaults.maxItemsPerKeyword ?? 40)"
            @input="onNumberInput('maxItemsPerKeyword', 'rule', $event)"
            @blur="clampOnBlur('maxItemsPerKeyword', 'rule')"
          />
          条
        </label>
        <div class="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-canvas p-0.5 ring-1 ring-line">
          <button
            type="button"
            class="text-[12px] transition-colors"
            :class="segClass(rules.notify === undefined)"
            @click="setRule('notify', undefined)"
          >
            默认 {{ boolText(defaults.notify) }}
          </button>
          <button
            type="button"
            class="text-[12px] transition-colors"
            :class="segClass(rules.notify === true)"
            @click="setRule('notify', true)"
          >
            开
          </button>
          <button
            type="button"
            class="text-[12px] transition-colors"
            :class="segClass(rules.notify === false)"
            @click="setRule('notify', false)"
          >
            关
          </button>
        </div>
      </div>
    </section>

    <p class="text-[11.5px] leading-relaxed text-ink-4">
      空着或选「默认」的项跟随全局配置；这里改的只是覆盖项。
    </p>
  </div>
</template>

<style scoped>
/* 去掉数字框的上下箭头：面板里字段多，箭头只会让行更挤 */
input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
