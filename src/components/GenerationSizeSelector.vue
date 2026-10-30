<template>
  <div ref="selectorRef" class="generation-size-selector">
    <button
      type="button"
      class="parameter-trigger size-trigger"
      :aria-label="label + '：' + displayValue"
      @click.stop="toggle"
    >
      <span class="ratio-glyph" :class="ratioGlyphClass" aria-hidden="true"></span>
      <span class="parameter-trigger-text">{{ displayValue }}</span>
      <svg class="chevron" :class="{ open: isOpen }" width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M6.19819 0.117182C6.3544 -0.039028 6.60839 -0.039028 6.7646 0.117182L7.18843 0.54101C7.34464 0.69722 7.34464 0.951206 7.18843 1.10742L4.14741 4.14843C3.87403 4.42145 3.43043 4.42165 3.15718 4.14843L0.117137 1.10742C-0.039034 0.9512 -0.039057 0.697203 0.117137 0.54101L0.540965 0.117182C0.697193 -0.0390471 0.951169 -0.039074 1.10737 0.117182L3.65229 2.66308L6.19819 0.117182Z"/>
      </svg>
    </button>

    <transition name="parameter-menu">
      <div v-if="isOpen" class="parameter-menu size-menu" :class="{ 'drop-up': placement === 'up' }" @click.stop>
        <section v-if="availableRatios.length" class="parameter-section">
          <div class="parameter-section-title">选择比例</div>
          <div class="ratio-grid">
            <button
              v-for="option in availableRatios"
              :key="option.value"
              type="button"
              class="ratio-option"
              :class="{ active: normalizedRatio === option.value }"
              @click="selectRatio(option.value)"
            >
              <span class="ratio-option-icon">
                <span class="ratio-option-frame" :style="ratioFrameStyle(option)"></span>
              </span>
              <span>{{ option.label }}</span>
            </button>
          </div>
        </section>

        <section v-if="availableResolutions.length" class="parameter-section resolution-section">
          <div class="parameter-section-title">选择清晰度</div>
          <div class="resolution-list">
            <button
              v-for="resolution in availableResolutions"
              :key="resolution"
              type="button"
              class="resolution-option"
              :class="{ active: normalizedResolution === resolution }"
              @click="selectResolution(resolution)"
            >{{ resolution }}</button>
          </div>
        </section>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { VideoModelCapabilities } from '@/services/videoModelService'

interface RatioOption {
  label: string
  value: string
  aspect?: string
}

interface Props {
  modelValue?: string
  resolution?: string
  capabilities?: VideoModelCapabilities
  defaultResolution?: string
  label?: string
  placement?: 'up' | 'down'
  allowAuto?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '16:9',
  resolution: '',
  capabilities: undefined,
  defaultResolution: '',
  label: '视频尺寸',
  placement: 'up',
  allowAuto: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:resolution': [value: string]
}>()

const ratioOptions: RatioOption[] = [
  { label: '智能', value: 'auto' },
  { label: '自适应', value: 'adaptive' },
  { label: '21:9', value: '21:9', aspect: '21 / 9' },
  { label: '16:9', value: '16:9', aspect: '16 / 9' },
  { label: '4:3', value: '4:3', aspect: '4 / 3' },
  { label: '1:1', value: '1:1', aspect: '1 / 1' },
  { label: '3:4', value: '3:4', aspect: '3 / 4' },
  { label: '9:16', value: '9:16', aspect: '9 / 16' },
  { label: '3:2', value: '3:2', aspect: '3 / 2' },
  { label: '2:3', value: '2:3', aspect: '2 / 3' },
  { label: '4:5', value: '4:5', aspect: '4 / 5' },
  { label: '5:4', value: '5:4', aspect: '5 / 4' },
]

const fallbackResolutions = ['480p', '720p', '1080p']
const isOpen = ref(false)
const selectorRef = ref<HTMLElement>()
const selectorId = 'generation-size-' + Math.random().toString(36).slice(2)
const openSelector = inject<any>('openSelector', ref(null))
const requestOpen = inject<(selectorId: string | null) => void>('requestOpen', () => {})

const availableRatios = computed(() => {
  const supported = props.capabilities?.ratios
  const result = supported?.length
    ? ratioOptions.filter(option => supported.includes(option.value))
    : ratioOptions
  return props.allowAuto ? result : result.filter(option => option.value !== 'auto' && option.value !== 'adaptive')
})

const availableResolutions = computed(() => {
  const supported = props.capabilities?.resolutions
  return supported !== undefined ? supported : fallbackResolutions
})

function canonical(value: string | undefined, values: string[], fallback: string) {
  const found = values.find(item => item.toLowerCase() === String(value || '').toLowerCase())
  return found || fallback || values[0] || ''
}

function preferredResolution(values: string[]) {
  if (props.defaultResolution && values.includes(props.defaultResolution)) return props.defaultResolution
  return values.find(value => value.toLowerCase() === '720p')
    || values.find(value => value.toLowerCase() === '2k')
    || values[Math.floor((values.length - 1) / 2)]
    || ''
}

const normalizedRatio = computed(() => canonical(props.modelValue, availableRatios.value.map(option => option.value), availableRatios.value[0]?.value || ''))
const normalizedResolution = computed(() => canonical(props.resolution, availableResolutions.value, preferredResolution(availableResolutions.value)))
const selectedRatio = computed(() => ratioOptions.find(option => option.value === normalizedRatio.value))
const displayValue = computed(() => [selectedRatio.value?.label || normalizedRatio.value, normalizedResolution.value].filter(Boolean).join(' · '))
const ratioGlyphClass = computed(() => 'ratio-' + (normalizedRatio.value || '1:1').replace(':', '-'))

function ratioFrameStyle(option: RatioOption) {
  if (!option.aspect) return { aspectRatio: '1 / 1', borderStyle: 'dashed' }
  return { aspectRatio: option.aspect }
}

function syncSupportedValues() {
  if (normalizedRatio.value && props.modelValue !== normalizedRatio.value) emit('update:modelValue', normalizedRatio.value)
  if (normalizedResolution.value && props.resolution !== normalizedResolution.value) emit('update:resolution', normalizedResolution.value)
}

watch([availableRatios, availableResolutions], syncSupportedValues, { immediate: true })
watch(openSelector, (current) => {
  if (current !== selectorId) isOpen.value = false
})

function toggle() {
  isOpen.value = !isOpen.value
  requestOpen(isOpen.value ? selectorId : null)
}

function selectRatio(value: string) {
  emit('update:modelValue', value)
}

function selectResolution(value: string) {
  emit('update:resolution', value)
}

function closeWhenClickingOutside(event: MouseEvent) {
  if (!selectorRef.value?.contains(event.target as Node)) {
    isOpen.value = false
    requestOpen(null)
  }
}

onMounted(() => document.addEventListener('click', closeWhenClickingOutside))
onBeforeUnmount(() => document.removeEventListener('click', closeWhenClickingOutside))
</script>

<style scoped>
.generation-size-selector { position: relative; }
.parameter-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.055);
  color: rgba(255, 255, 255, 0.88);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: background .16s ease, border-color .16s ease, color .16s ease;
}
.parameter-trigger:hover { background: rgba(255, 255, 255, .105); border-color: rgba(255,255,255,.23); color: #fff; }
.parameter-trigger-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chevron { color: rgba(255,255,255,.48); flex: 0 0 auto; transition: transform .16s ease; }
.chevron.open { transform: rotate(180deg); }
.ratio-glyph { width: 15px; height: 11px; border: 1.35px solid currentColor; border-radius: 2px; display: inline-block; flex: 0 0 auto; opacity: .82; }
.ratio-glyph.ratio-9-16,.ratio-glyph.ratio-3-4,.ratio-glyph.ratio-2-3 { width: 9px; height: 14px; }
.ratio-glyph.ratio-21-9 { width: 17px; height: 8px; }
.ratio-glyph.ratio-auto,.ratio-glyph.ratio-adaptive { width: 12px; height: 12px; border-style: dashed; border-radius: 50%; }
.parameter-menu {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  z-index: 110;
  width: 324px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: 14px;
  background: #2a2a2a;
  box-shadow: 0 14px 44px rgba(0, 0, 0, .46);
  user-select: none;
}
.parameter-menu.drop-up { top: auto; bottom: calc(100% + 8px); }
.parameter-section + .parameter-section { margin-top: 14px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.08); }
.parameter-section-title { margin: 0 0 9px 2px; color: rgba(255,255,255,.58); font-size: 12px; line-height: 1; }
.ratio-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 5px; }
.ratio-option {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  min-height: 58px; padding: 7px 3px; border: 1px solid transparent; border-radius: 9px;
  background: transparent; color: rgba(255,255,255,.67); font: inherit; font-size: 10px; cursor: pointer;
  transition: background .16s ease, border-color .16s ease, color .16s ease;
}
.ratio-option:hover { background: rgba(255,255,255,.09); color: #fff; }
.ratio-option.active { background: rgba(255,255,255,.13); border-color: rgba(255,255,255,.3); color: #fff; }
.ratio-option-icon { width: 28px; height: 27px; display: flex; align-items: center; justify-content: center; }
.ratio-option-frame { display: block; max-width: 25px; max-height: 23px; height: 18px; border: 1.3px solid currentColor; border-radius: 2px; }
.resolution-list { display: flex; flex-wrap: wrap; gap: 6px; }
.resolution-option { min-width: 50px; height: 30px; padding: 0 10px; border: 1px solid rgba(255,255,255,.11); border-radius: 8px; background: rgba(255,255,255,.03); color: rgba(255,255,255,.68); font: inherit; font-size: 12px; cursor: pointer; transition: background .16s ease,border-color .16s ease,color .16s ease; }
.resolution-option:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.22); color:#fff; }
.resolution-option.active { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.35); color:#fff; }
.parameter-menu-enter-active,.parameter-menu-leave-active { transition: opacity .14s ease, transform .14s ease; }
.parameter-menu-enter-from,.parameter-menu-leave-to { opacity: 0; transform: translateY(5px); }
</style>
