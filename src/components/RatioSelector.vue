<template>
  <div class="ratio-selector" ref="selectorRef">
    <button class="ratio-btn" @click.stop="toggle">
      <span class="ratio-icon">{{ selectedIcon }}</span>
      <span class="ratio-text">{{ selectedLabel }}</span>
      <svg class="chevron" :class="{ open: isOpen }" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6.19819 0.117182C6.3544 -0.039028 6.60839 -0.039028 6.7646 0.117182L7.18843 0.54101C7.34464 0.69722 7.34464 0.951206 7.18843 1.10742L4.14741 4.14843C3.87403 4.42145 3.43043 4.42165 3.15718 4.14843L0.117137 1.10742C-0.039034 0.9512 -0.039057 0.697203 0.117137 0.54101L0.540965 0.117182C0.697193 -0.0390471 0.951169 -0.039074 1.10737 0.117182L3.65229 2.66308L6.19819 0.117182Z"/>
      </svg>
    </button>

    <transition name="dropdown">
      <div v-if="isOpen" class="ratio-dropdown nodrag nowheel">
        <div class="dropdown-section">
          <div class="section-title">比例</div>
          <div class="ratio-grid">
            <button
              v-for="option in availableRatios"
              :key="option.value"
              class="ratio-option"
              :class="{ active: modelValue === option.value }"
              @click.stop="selectOption(option)"
            >
              <span class="ratio-icon-box">
                <span class="ratio-box-inner" :style="{ aspectRatio: option.aspect }"></span>
              </span>
              <span class="ratio-label">{{ option.label }}</span>
            </button>
          </div>
        </div>

        <div class="dropdown-section">
          <div class="section-title">清晰度</div>
          <div class="resolution-list">
            <button
              v-for="res in availableResolutions"
              :key="res"
              class="resolution-option"
              :class="{ active: selectedResolution === res }"
              @click.stop="selectedResolution = res"
            >
              {{ res }}
            </button>
          </div>
        </div>

        <div v-if="durationRange" class="dropdown-section">
          <div class="duration-header">
            <span class="section-title">时长</span>
            <span class="duration-value">{{ selectedDuration }}秒</span>
          </div>
          <div class="duration-slider">
            <input
              type="range"
              class="slider"
              :min="durationRange.min"
              :max="durationRange.max"
              step="1"
              v-model.number="selectedDuration"
              @click.stop
            />
            <div class="slider-labels">
              <span>{{ durationRange.min }}秒</span>
              <span>{{ durationRange.max }}秒</span>
            </div>
          </div>
        </div>

        <div v-if="audioAvailable" class="dropdown-section">
          <div class="audio-toggle">
            <span class="section-title">生成音频</span>
            <button
              class="toggle-btn"
              :class="{ active: enableAudio }"
              @click.stop="enableAudio = !enableAudio"
            >
              <span class="toggle-option" :class="{ active: !enableAudio }">关闭</span>
              <span class="toggle-option" :class="{ active: enableAudio }">开启</span>
              <span class="toggle-indicator" :class="{ active: enableAudio }"></span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue'
import type { VideoModelCapabilities } from '@/services/videoModelService'

interface RatioOption {
  label: string
  value: string
  aspect: string
  icon: string
}

interface Props {
  modelValue?: string
  capabilities?: VideoModelCapabilities // 当前模型的能力
  // 以下用于「从节点保存值恢复」初始状态，避免切节点回来丢失
  resolution?: string
  duration?: number
  audio?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '16:9',
  capabilities: undefined,
  resolution: undefined,
  duration: undefined,
  audio: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:resolution': [value: string]
  'update:duration': [value: number]
  'update:audio': [value: boolean]
}>()

const isOpen = ref(false)
const selectorRef = ref<HTMLElement>()
// 内部状态从 props 恢复（节点 data 里存过就用存的，否则用默认）
const selectedResolution = ref(props.resolution ?? '')
const selectedDuration = ref(typeof props.duration === 'number' ? props.duration : 5)
const enableAudio = ref(props.audio === true) // 音频开关

watch(selectedResolution, (val) => emit('update:resolution', val))
watch(selectedDuration, (val) => emit('update:duration', val))
watch(enableAudio, (val) => emit('update:audio', val))

const SELECTOR_ID = 'ratio-selector'

// 注入父组件提供的控制器
const openSelector = inject<any>('openSelector', ref(null))
const requestOpen = inject<any>('requestOpen', () => {})

// 监听全局打开状态
watch(openSelector, (currentOpen) => {
  if (currentOpen !== SELECTOR_ID) {
    isOpen.value = false
  }
})

const ratioOptions: RatioOption[] = [
  { label: 'Auto', value: 'auto', aspect: '1/1', icon: '⚡' },
  { label: '16:9', value: '16:9', aspect: '16/9', icon: '▭' },
  { label: '21:9', value: '21:9', aspect: '21/9', icon: '▬' },
  { label: '9:16', value: '9:16', aspect: '9/16', icon: '▯' },
  { label: '1:1', value: '1:1', aspect: '1/1', icon: '□' },
  { label: '4:3', value: '4:3', aspect: '4/3', icon: '▭' },
  { label: '3:4', value: '3:4', aspect: '3/4', icon: '▯' },
]

const resolutions = ['1K', '2K', '4K', '480p', '720p', '1080p']

// 根据模型能力过滤可用的比例
const availableRatios = computed(() => {
  if (!props.capabilities?.ratios) {
    return ratioOptions
  }
  return ratioOptions.filter(opt => props.capabilities!.ratios!.includes(opt.value))
})

// 根据模型能力过滤可用的清晰度
const availableResolutions = computed(() => {
  if (!props.capabilities?.resolutions) {
    return resolutions
  }
  return resolutions.filter(res => props.capabilities!.resolutions!.includes(res))
})

// 时长范围（仅视频节点有）
const durationRange = computed(() => props.capabilities?.durationRange)

// 当前清晰度不在可用列表里时，重置为中间值（默认 720p 这一档）
watch(availableResolutions, (list) => {
  if (list.length === 0) return
  if (!list.includes(selectedResolution.value)) {
    selectedResolution.value = list[Math.floor(list.length / 2)] || list[0]
  }
}, { immediate: true })

// 时长越界时夹紧到模型支持范围内
watch(durationRange, (range) => {
  if (!range) return
  if (selectedDuration.value < range.min) selectedDuration.value = range.min
  if (selectedDuration.value > range.max) selectedDuration.value = range.max
}, { immediate: true })

// 根据模型能力决定是否显示音频开关：未声明视为不支持（图片模型默认隐藏）
const audioAvailable = computed(() => props.capabilities?.audioGeneration === true)

const selectedOption = computed(() => {
  return availableRatios.value.find(opt => opt.value === props.modelValue) || availableRatios.value[0]
})

const selectedIcon = computed(() => selectedOption.value.icon)
const selectedLabel = computed(() => {
  return `${selectedOption.value.label} · ${selectedResolution.value}`
})

function toggle() {
  if (isOpen.value) {
    isOpen.value = false
    requestOpen(null)
  } else {
    isOpen.value = true
    requestOpen(SELECTOR_ID)
  }
}

function selectOption(option: RatioOption) {
  emit('update:modelValue', option.value)
  // 不关闭下拉，允许继续选择其他选项
}

function handleClickOutside(event: MouseEvent) {
  if (selectorRef.value && !selectorRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.ratio-selector {
  position: relative;
}

.ratio-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 130px;
}

.ratio-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.ratio-icon {
  font-size: 16px;
}

.ratio-text {
  flex: 1;
  text-align: left;
}

.chevron {
  color: #888;
  transition: transform 0.2s;
}

.chevron.open {
  transform: rotate(180deg);
}

.ratio-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 320px;
  background: #262626;
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  padding: 12px;
  z-index: 100;
  user-select: none;
}

.dropdown-section {
  margin-bottom: 16px;
}

.dropdown-section:last-child {
  margin-bottom: 0;
}

.section-title {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  padding-left: 4px;
}

.ratio-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.ratio-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.ratio-option:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(0, 217, 255, 0.3);
}

.ratio-option.active {
  background: rgba(0, 217, 255, 0.1);
  border-color: #00D9FF;
}

.ratio-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 2px;
  color: #888;
  padding: 0;
}

.ratio-option.active .ratio-icon-box {
  color: #00D9FF;
}

.ratio-box-inner {
  border: 1.5px solid currentColor;
  border-radius: 1px;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: 24px;
}

.ratio-label {
  font-size: 11px;
  color: #ffffff;
}

.resolution-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.resolution-option {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #ffffff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.resolution-option:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(0, 217, 255, 0.3);
}

.resolution-option.active {
  background: rgba(0, 217, 255, 0.1);
  border-color: #00D9FF;
  color: #00D9FF;
}

.duration-slider {
  padding: 0 4px;
}

.duration-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-left: 4px;
}

.duration-header .section-title {
  margin-bottom: 0;
  padding-left: 0;
}

.duration-value {
  font-size: 12px;
  color: #00D9FF;
  font-weight: 500;
}

.slider {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #00D9FF;
  cursor: pointer;
  box-shadow: 0 0 8px rgba(0, 217, 255, 0.5);
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #00D9FF;
  cursor: pointer;
  border: none;
  box-shadow: 0 0 8px rgba(0, 217, 255, 0.5);
}

.slider::-webkit-slider-thumb:hover {
  background: #00f0ff;
  box-shadow: 0 0 12px rgba(0, 217, 255, 0.8);
}

.slider::-moz-range-thumb:hover {
  background: #00f0ff;
  box-shadow: 0 0 12px rgba(0, 217, 255, 0.8);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 11px;
  color: #888;
}

.audio-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toggle-btn {
  position: relative;
  display: flex;
  align-items: center;
  width: 100px;
  height: 32px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 2px;
  cursor: pointer;
  transition: all 0.3s;
}

.toggle-btn.active {
  background: rgba(0, 217, 255, 0.1);
  border-color: #00D9FF;
}

.toggle-option {
  flex: 1;
  text-align: center;
  font-size: 11px;
  color: #888;
  z-index: 1;
  transition: color 0.3s;
}

.toggle-option.active {
  color: #ffffff;
}

.toggle-indicator {
  position: absolute;
  left: 2px;
  width: calc(50% - 2px);
  height: calc(100% - 4px);
  background: rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  transition: all 0.3s;
}

.toggle-indicator.active {
  left: calc(50% + 2px);
  background: #00D9FF;
  box-shadow: 0 0 8px rgba(0, 217, 255, 0.5);
}

/* 下拉动画 - 向上弹出 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.dropdown-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
