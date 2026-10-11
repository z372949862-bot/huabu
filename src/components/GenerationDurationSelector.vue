<template>
  <div ref="selectorRef" class="generation-duration-selector">
    <button
      type="button"
      class="parameter-trigger duration-trigger"
      :class="{ fixed: isFixed }"
      :disabled="isFixed"
      :aria-label="'视频生成时长：' + displayValue"
      @click.stop="toggle"
    >
      <span class="duration-icon" aria-hidden="true">◷</span>
      <span class="parameter-trigger-text">{{ displayValue }}</span>
      <svg v-if="!isFixed" class="chevron" :class="{ open: isOpen }" width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M6.19819 0.117182C6.3544 -0.039028 6.60839 -0.039028 6.7646 0.117182L7.18843 0.54101C7.34464 0.69722 7.34464 0.951206 7.18843 1.10742L4.14741 4.14843C3.87403 4.42145 3.43043 4.42165 3.15718 4.14843L0.117137 1.10742C-0.039034 0.9512 -0.039057 0.697203 0.117137 0.54101L0.540965 0.117182C0.697193 -0.0390471 0.951169 -0.039074 1.10737 0.117182L3.65229 2.66308L6.19819 0.117182Z"/>
      </svg>
    </button>

    <transition name="parameter-menu">
      <div v-if="isOpen" class="parameter-menu duration-menu" :class="{ 'drop-up': placement === 'up' }" @click.stop>
        <div class="duration-menu-heading">
          <span>选择视频生成时长</span>
          <strong>{{ displayValue }}</strong>
        </div>
        <div v-if="availableOptions.length" class="duration-option-grid">
          <button
            v-for="duration in availableOptions"
            :key="duration"
            type="button"
            class="duration-option"
            :class="{ active: normalizedDuration === duration }"
            @click="selectDuration(duration)"
          >{{ formatDuration(duration) }}</button>
        </div>
        <template v-else-if="normalizedRange">
          <input
            class="duration-slider"
            type="range"
            :min="normalizedRange.min"
            :max="normalizedRange.max"
            step="1"
            :value="normalizedDuration"
            @input="onSliderInput"
          />
          <div class="duration-range-labels">
            <span>{{ normalizedRange.min }} 秒</span>
            <span>{{ normalizedRange.max }} 秒</span>
          </div>
          <label class="duration-number-field">
            <span>精确时长</span>
            <input type="number" :min="normalizedRange.min" :max="normalizedRange.max" :value="normalizedDuration" @change="onNumberChange" />
            <em>秒</em>
          </label>
        </template>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface DurationRange { min: number; max: number }
interface Props {
  modelValue?: number
  range?: DurationRange
  options?: number[]
  placement?: 'up' | 'down'
}

const props = withDefaults(defineProps<Props>(), { modelValue: undefined, range: undefined, options: () => [], placement: 'up' })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const isOpen = ref(false)
const selectorRef = ref<HTMLElement>()
const selectorId = 'generation-duration-' + Math.random().toString(36).slice(2)
const openSelector = inject<any>('openSelector', ref(null))
const requestOpen = inject<(selectorId: string | null) => void>('requestOpen', () => {})

const availableOptions = computed(() => [...new Set(props.options || [])])
const normalizedRange = computed(() => {
  if (!props.range) return undefined
  return { min: Math.min(props.range.min, props.range.max), max: Math.max(props.range.min, props.range.max) }
})
const fallbackDuration = computed(() => {
  const option = availableOptions.value.find(value => value >= 4)
  if (option != null) return option
  return normalizedRange.value?.min ?? 5
})
const normalizedDuration = computed(() => {
  const candidate = Number(props.modelValue)
  if (availableOptions.value.length) return availableOptions.value.includes(candidate) ? candidate : fallbackDuration.value
  if (!normalizedRange.value) return candidate || fallbackDuration.value
  const rounded = Number.isFinite(candidate) ? Math.round(candidate) : fallbackDuration.value
  return Math.min(normalizedRange.value.max, Math.max(normalizedRange.value.min, rounded))
})
const isFixed = computed(() => normalizedRange.value?.min === normalizedRange.value?.max || availableOptions.value.length === 1)
const displayValue = computed(() => formatDuration(normalizedDuration.value))

function formatDuration(value: number) { return value === -1 ? '自动' : value + ' 秒' }
function syncDuration() {
  if (Number(props.modelValue) !== normalizedDuration.value) emit('update:modelValue', normalizedDuration.value)
}
watch([availableOptions, normalizedRange], syncDuration, { immediate: true })
watch(openSelector, (current) => { if (current !== selectorId) isOpen.value = false })

function toggle() {
  if (isFixed.value) return
  isOpen.value = !isOpen.value
  requestOpen(isOpen.value ? selectorId : null)
}
function selectDuration(value: number) { emit('update:modelValue', value); isOpen.value = false; requestOpen(null) }
function onSliderInput(event: Event) { emit('update:modelValue', Number((event.target as HTMLInputElement).value)) }
function onNumberChange(event: Event) { emit('update:modelValue', Number((event.target as HTMLInputElement).value)) }
function closeWhenClickingOutside(event: MouseEvent) {
  if (!selectorRef.value?.contains(event.target as Node)) { isOpen.value = false; requestOpen(null) }
}
onMounted(() => document.addEventListener('click', closeWhenClickingOutside))
onBeforeUnmount(() => document.removeEventListener('click', closeWhenClickingOutside))
</script>

<style scoped>
.generation-duration-selector { position: relative; }
.parameter-trigger { display: inline-flex; align-items: center; gap: 7px; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid rgba(255,255,255,.11); border-radius: 10px; background: rgba(255,255,255,.055); color: rgba(255,255,255,.88); font: inherit; font-size: 12px; line-height: 1; cursor: pointer; transition: background .16s ease,border-color .16s ease,color .16s ease; }
.parameter-trigger:hover:not(:disabled) { background: rgba(255,255,255,.105); border-color: rgba(255,255,255,.23); color: #fff; }
.parameter-trigger.fixed { cursor: default; color: rgba(255,255,255,.58); }
.parameter-trigger-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.duration-icon { color: rgba(255,255,255,.65); font-size: 16px; line-height: 1; }
.chevron { color: rgba(255,255,255,.48); flex: 0 0 auto; transition: transform .16s ease; }
.chevron.open { transform: rotate(180deg); }
.parameter-menu { position: absolute; left: 0; top: calc(100% + 8px); z-index: 110; width: 266px; padding: 12px; border: 1px solid rgba(255,255,255,.13); border-radius: 14px; background: #2a2a2a; box-shadow: 0 14px 44px rgba(0,0,0,.46); user-select: none; }
.parameter-menu.drop-up { top: auto; bottom: calc(100% + 8px); }
.duration-menu-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 1px 1px 11px; color: rgba(255,255,255,.58); font-size: 12px; }
.duration-menu-heading strong { color: #fff; font-size: 12px; font-weight: 500; }
.duration-option-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.duration-option { min-width: 54px; height: 31px; padding: 0 10px; border: 1px solid rgba(255,255,255,.11); border-radius: 8px; background: rgba(255,255,255,.03); color: rgba(255,255,255,.68); font: inherit; font-size: 12px; cursor: pointer; transition: background .16s ease,border-color .16s ease,color .16s ease; }
.duration-option:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.22); color: #fff; }
.duration-option.active { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.35); color: #fff; }
.duration-slider { width: 100%; accent-color: #e5e5e5; cursor: pointer; }
.duration-range-labels { display:flex; justify-content:space-between; margin-top:4px; color:rgba(255,255,255,.43); font-size:10px; }
.duration-number-field { display:flex; align-items:center; gap:8px; margin-top:13px; padding-top:11px; border-top:1px solid rgba(255,255,255,.08); color:rgba(255,255,255,.58); font-size:11px; }
.duration-number-field input { width:54px; height:28px; border:1px solid rgba(255,255,255,.12); border-radius:7px; background:rgba(255,255,255,.05); color:#fff; font:inherit; text-align:center; outline:none; }
.duration-number-field input:focus { border-color:rgba(255,255,255,.34); }
.duration-number-field em { color:rgba(255,255,255,.45); font-style:normal; }
.parameter-menu-enter-active,.parameter-menu-leave-active { transition:opacity .14s ease,transform .14s ease; }
.parameter-menu-enter-from,.parameter-menu-leave-to { opacity:0; transform:translateY(5px); }
</style>
