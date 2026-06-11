<template>
  <div id="app" class="app-container">
    <div class="top-bar">
      <div class="top-bar-left">
        <span class="logo"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><polygon points="22 7 18 7 18 17 22 17"/><circle cx="8" cy="10" r="2"/></svg> AI Video Canvas</span>
        <input
          v-if="isEditingName"
          ref="nameInputRef"
          v-model="projectName"
          type="text"
          class="project-name-input"
          @blur="finishEditing"
          @keyup.enter="finishEditing"
          @keyup.escape="cancelEditing"
          maxlength="50"
        />
        <span
          v-else
          class="project-name"
          @click="startEditing"
          title="点击修改项目名称"
        >
          {{ projectName }}
          <svg class="edit-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </span>
      </div>
      <div class="top-bar-right">
        <div class="ai-status" title="点击查看AI服务配置" @click="navigateTo('/settings')">
          <template v-for="indicator in aiStatusIndicators" :key="indicator.key">
            <span
              :class="['status-dot', getStatusClass(indicator.status)]"
              :title="indicator.name + ': ' + indicator.status"
            ></span>
            <span class="status-label">{{ indicator.name }}</span>
          </template>
          <span v-if="aiStatusIndicators.length > 0" class="status-divider">|</span>
          <span class="status-count">{{ configuredCount }} 个中转站</span>
        </div>
      </div>
    </div>

    <div class="main-content">
      <router-view v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </router-view>
    </div>

    <div class="bottom-nav">
      <button
        v-for="nav in navItems"
        :key="nav.path"
        :class="['nav-item', { active: currentRoute === nav.path }]"
        @click="navigateTo(nav.path)"
      >
        <span class="nav-icon" v-html="navIcons[nav.path]"></span>
        <span class="nav-label">{{ nav.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAIStore } from '@/stores/ai'

const router = useRouter()
const route = useRoute()
const aiStore = useAIStore()

const projectName = ref('未命名项目')
const isEditingName = ref(false)
const nameInputRef = ref<HTMLInputElement>()
const previousName = ref('')

// 监听项目名称变化事件
const handleProjectNameChange = (event: Event) => {
  const customEvent = event as CustomEvent
  projectName.value = customEvent.detail
}

onMounted(() => {
  window.addEventListener('project-name-change', handleProjectNameChange)
  // 检查全局变量
  if ((window as any).__projectName) {
    projectName.value = (window as any).__projectName
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('project-name-change', handleProjectNameChange)
})

const startEditing = async () => {
  previousName.value = projectName.value
  isEditingName.value = true
  await nextTick()
  nameInputRef.value?.focus()
  nameInputRef.value?.select()
}

const finishEditing = () => {
  if (!projectName.value.trim()) {
    projectName.value = previousName.value || '未命名项目'
  }
  isEditingName.value = false
}

const cancelEditing = () => {
  projectName.value = previousName.value
  isEditingName.value = false
}

const currentRoute = computed(() => route.path)

const aiStatusIndicators = computed(() => {
  return aiStore.providers.map((config) => ({
    key: config.id,
    name: config.name,
    status: config.status,
  }))
})

const configuredCount = computed(() =>
  aiStore.providers.filter((p) => p.apiKey).length
)

// 底部导航：非项目上下文（主页 / 从主页进入的素材库）不显示"节点"入口
const hideNodesTab = computed(() => {
  if (route.path === '/home') return true
  if (route.path === '/assets' && route.query.from === 'home') return true
  if (route.path === '/chat') return true
  return false
})

const navItems = computed(() => {
  const items = [
    { path: '/home', label: '主页' },
  ]
  if (!hideNodesTab.value) {
    items.push({ path: '/nodes', label: '画布' })
  }
  // 对话入口：仅主页和对话页面显示
  if (route.path === '/home' || route.path === '/chat') {
    items.push({ path: '/chat', label: '对话' })
  }
  // 资产入口：对话页和剪辑页不显示
  if (route.path !== '/chat' && route.path !== '/editor') {
    items.push({ path: '/assets', label: '资产' })
  }
  // 剪辑入口：主页和画布和剪辑页显示
  if (route.path !== '/chat' && route.path !== '/assets') {
    items.push({ path: '/editor', label: '剪辑' })
  }
  items.push(
    { path: '/settings', label: '设置' },
  )
  return items
})

const navIcons: Record<string, string> = {
  '/home': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5"/><path d="M5 11v8a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-8"/></svg>`,
  '/nodes': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="8" height="8" rx="1.5"/><rect x="14" y="2" width="8" height="8" rx="1.5"/><rect x="2" y="14" width="8" height="8" rx="1.5"/><rect x="14" y="14" width="8" height="8" rx="1.5"/></svg>`,
  '/assets': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  '/chat': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  '/editor': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="22 7 18 7 18 17 22 17"/><line x1="6" y1="10" x2="10" y2="10"/><line x1="6" y1="14" x2="10" y2="14"/></svg>`,
  '/settings': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>`,
}

const navigateTo = (path: string) => {
  // 已在当前页面，不重复导航
  if (route.path === path) return
  // 从主页进入素材库 → 保持独立上下文（隐藏"节点"入口）
  if (path === '/assets' && hideNodesTab.value) {
    router.push({ path: '/assets', query: { from: 'home' } })
    return
  }
  router.push(path)
}

const getStatusClass = (status: string): string => {
  const classes: Record<string, string> = {
    connected: 'green',
    disconnected: 'yellow',
    error: 'red',
    unconfigured: 'gray',
  }
  return classes[status] || 'gray'
}
</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #020308;
  color: #ffffff;
  overflow: hidden;
}

.top-bar {
  height: 50px;
  background: rgba(2, 3, 8, 0.95);
  border-bottom: 1px solid #00D9FF;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  box-shadow: 0 2px 10px rgba(0, 217, 255, 0.2);
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.logo {
  font-size: 18px;
  font-weight: 600;
  color: #00D9FF;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.logo svg { flex-shrink: 0; }

.project-name {
  font-size: 14px;
  color: #888;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.project-name:hover {
  color: #00D9FF;
  background: rgba(0, 217, 255, 0.1);
}

.project-name:hover .edit-icon {
  opacity: 1;
}

.edit-icon {
  opacity: 0;
  transition: opacity 0.2s;
}

.project-name-input {
  font-size: 14px;
  color: #ffffff;
  background: rgba(0, 217, 255, 0.1);
  border: 1px solid #00D9FF;
  border-radius: 4px;
  padding: 4px 8px;
  outline: none;
  min-width: 200px;
  font-family: inherit;
}

.project-name-input:focus {
  background: rgba(0, 217, 255, 0.15);
  box-shadow: 0 0 8px rgba(0, 217, 255, 0.4);
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.ai-status {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 5px 10px;
  border-radius: 6px;
  transition: background 0.3s;
}
.ai-status:hover { background: rgba(0, 217, 255, 0.1); }

.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.green  { background: #00ff88; box-shadow: 0 0 6px #00ff88; }
.status-dot.yellow { background: #ffcc00; box-shadow: 0 0 6px #ffcc00; }
.status-dot.red    { background: #ff4444; box-shadow: 0 0 6px #ff4444; }
.status-dot.gray   { background: #666; }

.status-label {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  white-space: nowrap;
}
.status-divider { color: rgba(255,255,255,0.2); margin: 0 4px; }
.status-count { font-size: 11px; color: rgba(255,255,255,0.35); white-space: nowrap; }

.main-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.bottom-nav {
  height: 60px;
  background: rgba(2, 3, 8, 0.95);
  border-top: 1px solid #00D9FF;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 20px;
  box-shadow: 0 -2px 10px rgba(0, 217, 255, 0.2);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 20px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  color: #888;
  min-width: 80px;
}

.nav-item:hover {
  border-color: #00D9FF;
  color: #00D9FF;
  box-shadow: 0 0 15px rgba(0, 217, 255, 0.3);
}

.nav-item.active {
  background: rgba(0, 217, 255, 0.1);
  border-color: #00D9FF;
  color: #00D9FF;
  box-shadow: 0 0 20px rgba(0, 217, 255, 0.4);
}

.nav-icon {
  width: 20px;
  height: 20px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-icon :deep(svg) {
  display: block;
}

.nav-label {
  font-size: 12px;
}

/* 页面切换过渡 */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.15s ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
