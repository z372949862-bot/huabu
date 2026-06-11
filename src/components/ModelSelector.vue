<template>
  <div class="model-selector" ref="selectorRef">
    <button class="model-btn" @click.stop="toggle">
      <span class="model-icon">🤖</span>
      <span class="model-text">{{ selectedModel?.name || '选择模型' }}</span>
      <svg class="chevron" :class="{ open: isOpen }" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6.19819 0.117182C6.3544 -0.039028 6.60839 -0.039028 6.7646 0.117182L7.18843 0.54101C7.34464 0.69722 7.34464 0.951206 7.18843 1.10742L4.14741 4.14843C3.87403 4.42145 3.43043 4.42165 3.15718 4.14843L0.117137 1.10742C-0.039034 0.9512 -0.039057 0.697203 0.117137 0.54101L0.540965 0.117182C0.697193 -0.0390471 0.951169 -0.039074 1.10737 0.117182L3.65229 2.66308L6.19819 0.117182Z"/>
      </svg>
    </button>

    <transition name="dropdown">
      <div v-if="isOpen" class="model-dropdown">
        <div class="dropdown-section">
          <div class="section-title">{{ label }}</div>
          <div v-if="modelList.length === 0" class="empty-tip">
            该中转站还没添加模型
          </div>
          <div v-else class="model-list">
            <button
              v-for="model in modelList"
              :key="model.id"
              class="model-option"
              :class="{ active: modelValue === model.id }"
              @click.stop="selectModel(model)"
            >
              <div class="model-info">
                <div class="model-name">{{ model.name || model.id }}</div>
                <div v-if="model.description" class="model-desc">{{ model.description }}</div>
              </div>
              <span v-if="model.badge" class="model-badge">{{ model.badge }}</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue'

interface VideoModel {
  id: string
  name?: string
  description?: string
  badge?: string
}

interface Props {
  modelValue?: string
  models?: VideoModel[]
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  models: () => [],
  label: '模型',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const selectorRef = ref<HTMLElement>()

const SELECTOR_ID = 'model-selector'

// 注入父组件提供的控制器
const openSelector = inject<any>('openSelector', ref(null))
const requestOpen = inject<any>('requestOpen', () => {})

// 监听全局打开状态
watch(openSelector, (currentOpen) => {
  if (currentOpen !== SELECTOR_ID) {
    isOpen.value = false
  }
})

// 父组件传入模型列表，不再内置假模型兜底（旧 defaultModels 已删除，
// 避免删完中转站模型后 UI 还显示 runway/pika 等错误项）
const modelList = computed(() => props.models)

const selectedModel = computed(() => {
  return modelList.value.find(m => m.id === props.modelValue)
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

function selectModel(model: VideoModel) {
  emit('update:modelValue', model.id)
  isOpen.value = false
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
.model-selector {
  position: relative;
}

.model-btn {
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
  min-width: 120px;
}

.model-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.model-icon {
  font-size: 16px;
}

.model-text {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron {
  color: #888;
  transition: transform 0.2s;
  flex-shrink: 0;
}

.chevron.open {
  transform: rotate(180deg);
}

.model-dropdown {
  position: absolute;
  top: calc(100% + 6px);
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
  margin-bottom: 0;
}

.section-title {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  padding-left: 4px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-tip {
  padding: 16px 8px;
  color: #888;
  font-size: 12px;
  text-align: center;
  font-style: italic;
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.model-option:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(0, 217, 255, 0.3);
}

.model-option.active {
  background: rgba(0, 217, 255, 0.1);
  border-color: #00D9FF;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 13px;
  color: #ffffff;
  font-weight: 500;
  margin-bottom: 2px;
}

.model-desc {
  font-size: 11px;
  color: #888;
}

.model-badge {
  padding: 2px 8px;
  background: rgba(180, 50, 255, 0.2);
  border: 1px solid #B432FF;
  border-radius: 4px;
  color: #B432FF;
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
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
