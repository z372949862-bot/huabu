<template>
  <div ref="selectorRef" class="generation-mode-selector">
    <button
      type="button"
      class="parameter-trigger mode-trigger"
      :aria-label="'生成模式：' + selectedOption.label"
      @click.stop="toggle"
    >
      <span class="mode-icon" aria-hidden="true">◇</span>
      <span class="parameter-trigger-text">{{ selectedOption.label }}</span>
      <svg class="chevron" :class="{ open: isOpen }" width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M6.19819 0.117182C6.3544 -0.039028 6.60839 -0.039028 6.7646 0.117182L7.18843 0.54101C7.34464 0.69722 7.34464 0.951206 7.18843 1.10742L4.14741 4.14843C3.87403 4.42145 3.43043 4.42165 3.15718 4.14843L0.117137 1.10742C-0.039034 0.9512 -0.039057 0.697203 0.117137 0.54101L0.540965 0.117182C0.697193 -0.0390471 0.951169 -0.039074 1.10737 0.117182L3.65229 2.66308L6.19819 0.117182Z"/>
      </svg>
    </button>

    <transition name="parameter-menu">
      <div v-if="isOpen" class="parameter-menu mode-menu" :class="{ 'drop-up': placement === 'up' }" @click.stop>
        <div class="parameter-section-title">生成模式</div>
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="mode-option"
          :class="{ active: modelValue === option.value, disabled: option.disabled }"
          :disabled="option.disabled"
          :title="option.disabled ? option.reason : undefined"
          @click="selectOption(option)"
        >
          <span class="mode-option-main">
            <span class="mode-option-name">{{ option.label }}</span>
            <span v-if="option.description" class="mode-option-description">{{ option.description }}</span>
          </span>
          <span v-if="option.disabled" class="mode-option-status">需素材</span>
          <svg v-else-if="modelValue === option.value" class="mode-check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg>
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface GenerationModeOption {
  label: string
  value: string
  disabled?: boolean
  description?: string
  reason?: string
}

interface Props {
  modelValue: string
  options: GenerationModeOption[]
  placement?: 'up' | 'down'
}

const props = withDefaults(defineProps<Props>(), { placement: 'up' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const isOpen = ref(false)
const selectorRef = ref<HTMLElement>()
const selectorId = 'generation-mode-' + Math.random().toString(36).slice(2)
const openSelector = inject<any>('openSelector', ref(null))
const requestOpen = inject<(selectorId: string | null) => void>('requestOpen', () => {})

const selectedOption = computed(() =>
  props.options.find(option => option.value === props.modelValue)
  || props.options.find(option => !option.disabled)
  || { label: '选择模式', value: '' },
)

watch(openSelector, (current) => {
  if (current !== selectorId) isOpen.value = false
})

function toggle() {
  isOpen.value = !isOpen.value
  requestOpen(isOpen.value ? selectorId : null)
}

function selectOption(option: GenerationModeOption) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  isOpen.value = false
  requestOpen(null)
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
.generation-mode-selector { position: relative; }
.parameter-trigger { display: inline-flex; align-items: center; gap: 7px; min-width: 0; height: 34px; padding: 0 10px; border: 1px solid rgba(255,255,255,.11); border-radius: 10px; background: rgba(255,255,255,.055); color: rgba(255,255,255,.88); font: inherit; font-size: 12px; line-height: 1; cursor: pointer; transition: background .16s ease,border-color .16s ease,color .16s ease; }
.parameter-trigger:hover { background: rgba(255,255,255,.105); border-color: rgba(255,255,255,.23); color: #fff; }
.parameter-trigger-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mode-icon { color: rgba(255,255,255,.65); font-size: 17px; line-height: 1; }
.chevron { color: rgba(255,255,255,.48); flex: 0 0 auto; transition: transform .16s ease; }
.chevron.open { transform: rotate(180deg); }
.parameter-menu { position: absolute; left: 0; top: calc(100% + 8px); z-index: 110; width: 250px; padding: 10px; border: 1px solid rgba(255,255,255,.13); border-radius: 14px; background: #2a2a2a; box-shadow: 0 14px 44px rgba(0,0,0,.46); user-select: none; }
.parameter-menu.drop-up { top: auto; bottom: calc(100% + 8px); }
.parameter-section-title { margin: 1px 2px 8px; color: rgba(255,255,255,.58); font-size: 12px; line-height: 1; }
.mode-option { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 7px 9px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: rgba(255,255,255,.77); font: inherit; text-align: left; cursor: pointer; transition: background .16s ease,border-color .16s ease,color .16s ease; }
.mode-option:hover:not(.disabled) { background: rgba(255,255,255,.09); color: #fff; }
.mode-option.active { background: rgba(255,255,255,.13); border-color: rgba(255,255,255,.28); color: #fff; }
.mode-option.disabled { cursor: not-allowed; color: rgba(255,255,255,.32); }
.mode-option-main { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
.mode-option-name { font-size: 12px; line-height: 1.2; }
.mode-option-description { overflow: hidden; color: rgba(255,255,255,.45); font-size: 10px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.mode-option-status { flex: 0 0 auto; color: rgba(255,255,255,.38); font-size: 10px; }
.mode-check { flex: 0 0 auto; }
.parameter-menu-enter-active,.parameter-menu-leave-active { transition: opacity .14s ease,transform .14s ease; }
.parameter-menu-enter-from,.parameter-menu-leave-to { opacity: 0; transform: translateY(5px); }
</style>
