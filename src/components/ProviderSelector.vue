<template>
  <div class="provider-selector" ref="selectorRef">
    <button class="provider-btn" @click.stop="toggle">
      <span class="provider-icon">🛰</span>
      <span class="provider-text">{{ selected?.name || '选择中转站' }}</span>
      <svg class="chevron" :class="{ open: isOpen }" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
        <path d="M6.19819 0.117182C6.3544 -0.039028 6.60839 -0.039028 6.7646 0.117182L7.18843 0.54101C7.34464 0.69722 7.34464 0.951206 7.18843 1.10742L4.14741 4.14843C3.87403 4.42145 3.43043 4.42165 3.15718 4.14843L0.117137 1.10742C-0.039034 0.9512 -0.039057 0.697203 0.117137 0.54101L0.540965 0.117182C0.697193 -0.0390471 0.951169 -0.039074 1.10737 0.117182L3.65229 2.66308L6.19819 0.117182Z"/>
      </svg>
    </button>

    <transition name="dropdown">
      <div v-if="isOpen" class="provider-dropdown">
        <div class="dropdown-section">
          <div class="section-title">中转站</div>
          <div v-if="!providers || providers.length === 0" class="empty-tip">
            还没有中转站，请到「设置」添加
          </div>
          <div v-else class="provider-list">
            <button
              v-for="p in providers"
              :key="p.id"
              class="provider-option"
              :class="{ active: modelValue === p.id }"
              @click.stop="selectProvider(p.id)"
            >
              <div class="provider-meta">
                <div class="provider-name-line">
                  <span class="star" v-if="p.isDefault">⭐</span>
                  {{ p.name || '未命名中转站' }}
                </div>
                <div class="provider-host">{{ p.baseUrl }}</div>
              </div>
              <span class="status-dot" :class="p.status"></span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue'

interface ProviderSummary {
  id: string
  name: string
  baseUrl: string
  status?: 'connected' | 'error' | 'unconfigured' | 'disconnected'
  isDefault?: boolean
}

interface Props {
  modelValue?: string
  providers?: ProviderSummary[]
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  providers: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const selectorRef = ref<HTMLElement>()
const SELECTOR_ID = 'provider-selector'

const openSelector = inject<any>('openSelector', ref(null))
const requestOpen = inject<any>('requestOpen', () => {})

watch(openSelector, (currentOpen) => {
  if (currentOpen !== SELECTOR_ID) isOpen.value = false
})

const selected = computed(() =>
  props.providers.find((p) => p.id === props.modelValue)
)

function toggle() {
  if (isOpen.value) {
    isOpen.value = false
    requestOpen(null)
  } else {
    isOpen.value = true
    requestOpen(SELECTOR_ID)
  }
}

function selectProvider(id: string) {
  emit('update:modelValue', id)
  isOpen.value = false
  requestOpen(null)
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
.provider-selector {
  position: relative;
}

.provider-btn {
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
  min-width: 110px;
}

.provider-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.provider-icon {
  font-size: 14px;
}

.provider-text {
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

.provider-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 280px;
  background: #262626;
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  padding: 12px;
  z-index: 100;
  user-select: none;
}

.section-title {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  padding-left: 4px;
}

.empty-tip {
  padding: 16px 8px;
  color: #888;
  font-size: 12px;
  text-align: center;
  font-style: italic;
}

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.provider-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.provider-option:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(0, 217, 255, 0.3);
}

.provider-option.active {
  background: rgba(0, 217, 255, 0.1);
  border-color: #00D9FF;
}

.provider-meta {
  flex: 1;
  min-width: 0;
}

.provider-name-line {
  font-size: 13px;
  color: #ffffff;
  font-weight: 500;
  margin-bottom: 2px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.star {
  color: #FFD166;
  font-size: 11px;
}

.provider-host {
  font-size: 11px;
  color: #888;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #666;
}
.status-dot.connected { background: #00ff88; box-shadow: 0 0 6px #00ff88; }
.status-dot.error { background: #ff4444; box-shadow: 0 0 6px #ff4444; }
.status-dot.unconfigured { background: #666; }
.status-dot.disconnected { background: #ffcc00; }

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
