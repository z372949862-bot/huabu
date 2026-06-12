<template>
  <div id="app" class="app-container">
    <div class="top-bar">
      <div class="top-bar-left">
        <span class="logo" v-if="currentRoute !== '/nodes'"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="2"/><polygon points="22 7 18 7 18 17 22 17"/><circle cx="8" cy="10" r="2"/></svg> AI Video Canvas</span>
        <!-- 项目名改名只在画布节点显示 -->
        <template v-if="currentRoute === '/nodes'">
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
        </template>
      </div>
      <div class="top-bar-right">
        <div class="ai-status" :title="aiStatusTitle" @click="navigateTo('/settings')">
          <span :class="['status-dot', aiAggregateClass]"></span>
          <span class="status-summary">中转站 · {{ aiStatusText }}</span>
        </div>
      </div>
    </div>

    <!-- 更新对话框 -->
    <el-dialog
      v-model="updateDialogVisible"
      :title="updateDialogTitle"
      width="420px"
      :close-on-click-modal="false"
      :show-close="updateState !== 'downloading'"
      class="update-dialog"
    >
      <div v-if="updateState === 'available'" class="update-body">
        <p>发现新版本 <strong>v{{ updateInfo.version }}</strong>，当前版本 v{{ currentVersion }}。</p>
        <p class="update-hint">是否现在下载更新？下载完成后会提示你重启安装。</p>
      </div>
      <div v-else-if="updateState === 'downloading'" class="update-body">
        <p>正在下载 v{{ updateInfo.version }}…</p>
        <el-progress :percentage="downloadPercent" :stroke-width="14" />
        <p class="update-hint">{{ downloadSpeedText }}</p>
      </div>
      <div v-else-if="updateState === 'downloaded'" class="update-body">
        <p>v{{ updateInfo.version }} 已下载完成。</p>
        <p class="update-hint">点击「立即重启安装」会关闭软件并安装新版本，安装后自动重新打开。</p>
      </div>
      <div v-else-if="updateState === 'not-available'" class="update-body">
        <p>当前已是最新版本 v{{ currentVersion }}。</p>
      </div>
      <div v-else-if="updateState === 'error'" class="update-body">
        <p>检查更新失败。</p>
        <p class="update-hint">{{ updateError }}</p>
      </div>

      <template #footer>
        <template v-if="updateState === 'available'">
          <el-button @click="updateDialogVisible = false">稍后</el-button>
          <el-button type="primary" @click="startDownload">立即更新</el-button>
        </template>
        <template v-else-if="updateState === 'downloaded'">
          <el-button @click="updateDialogVisible = false">稍后</el-button>
          <el-button type="primary" @click="installNow">立即重启安装</el-button>
        </template>
        <template v-else-if="updateState === 'not-available' || updateState === 'error'">
          <el-button type="primary" @click="updateDialogVisible = false">知道了</el-button>
        </template>
      </template>
    </el-dialog>

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
import { ElMessage } from 'element-plus'
import { useAIStore } from '@/stores/ai'

const router = useRouter()
const route = useRoute()
const aiStore = useAIStore()

const projectName = ref('未命名项目')
const isEditingName = ref(false)
const nameInputRef = ref<HTMLInputElement>()
const previousName = ref('')

// ---- 应用更新 ----
type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
const currentVersion = ref(__APP_VERSION__)
const updateState = ref<UpdateState>('idle')
const updateInfo = ref<{ version: string }>({ version: '' })
const updateDialogVisible = ref(false)
const downloadPercent = ref(0)
const downloadSpeed = ref(0)
const updateError = ref('')
let manualTriggered = false
const updaterUnsubs: Array<() => void> = []

const updateDialogTitle = computed(() => {
  switch (updateState.value) {
    case 'available': return '发现新版本'
    case 'downloading': return '正在下载更新'
    case 'downloaded': return '更新已就绪'
    case 'not-available': return '检查更新'
    case 'error': return '检查更新'
    default: return '检查更新'
  }
})
const downloadSpeedText = computed(() => {
  const s = downloadSpeed.value
  if (!s) return `${downloadPercent.value}%`
  const mb = s / 1024 / 1024
  return `${downloadPercent.value}% · ${mb.toFixed(1)} MB/s`
})

const manualCheckUpdate = async () => {
  const api = window.electronAPI?.updater
  if (!api) {
    ElMessage.info('更新功能仅在桌面客户端中可用')
    return
  }
  if (updateState.value === 'checking' || updateState.value === 'downloading') return
  manualTriggered = true
  updateState.value = 'checking'
  const r = await api.check()
  if (!r.ok && r.reason !== 'dev-mode') {
    updateState.value = 'error'
    updateError.value = r.reason || '未知错误'
    updateDialogVisible.value = true
  }
  // available / not-available / error 由事件回调处理
}

const startDownload = async () => {
  const api = window.electronAPI?.updater
  if (!api) return
  updateState.value = 'downloading'
  downloadPercent.value = 0
  const r = await api.download()
  if (!r.ok) {
    updateState.value = 'error'
    updateError.value = r.reason || '下载失败'
  }
}

const installNow = () => {
  window.electronAPI?.updater?.install()
}

const setupUpdater = () => {
  const api = window.electronAPI?.updater
  if (!api) return
  updaterUnsubs.push(
    api.on('available', (info) => {
      updateInfo.value = { version: info.version }
      updateState.value = 'available'
      updateDialogVisible.value = true
    }),
    api.on('not-available', () => {
      updateState.value = 'not-available'
      // 仅手动检查时提示"已是最新"，启动自检不打扰
      if (manualTriggered) updateDialogVisible.value = true
    }),
    api.on('progress', (p) => {
      downloadPercent.value = Math.round(p.percent || 0)
      downloadSpeed.value = p.bytesPerSecond || 0
    }),
    api.on('downloaded', (info) => {
      updateInfo.value = { version: info.version }
      updateState.value = 'downloaded'
      updateDialogVisible.value = true
    }),
    api.on('error', (e) => {
      updateState.value = 'error'
      updateError.value = e.message || '未知错误'
      if (manualTriggered) updateDialogVisible.value = true
    }),
  )
}

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
  // 注册更新事件监听（启动自检由主进程发起，有新版会自动弹窗）
  setupUpdater()
  // 主页右下角版本号点击时触发检查
  window.addEventListener('trigger-update-check', manualCheckUpdate)
})

onBeforeUnmount(() => {
  window.removeEventListener('project-name-change', handleProjectNameChange)
  window.removeEventListener('trigger-update-check', manualCheckUpdate)
  updaterUnsubs.forEach((un) => un())
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

// 顶栏 AI 状态汇总：聚合所有中转站为一个徽章，避免一排发光圆点+名字显得突兀
const providerTotal = computed(() => aiStore.providers.length)
const providerOnline = computed(() => aiStore.providers.filter((p) => p.status === 'connected').length)
// 聚合圆点颜色：全在线=绿，部分=黄，一个都不在线=红，未配置=灰
const aiAggregateClass = computed(() => {
  const t = providerTotal.value, on = providerOnline.value
  if (t === 0) return 'gray'
  if (on === t) return 'green'
  if (on > 0) return 'yellow'
  return 'red'
})
const aiStatusText = computed(() =>
  providerTotal.value === 0 ? '未配置' : `${providerOnline.value}/${providerTotal.value} 在线`
)
// 悬停展开逐个中转站明细（保留可见性，只是默认收起）
const STATUS_ZH: Record<string, string> = { connected: '在线', disconnected: '未连接', error: '异常', unconfigured: '未配置' }
const aiStatusTitle = computed(() => {
  if (!aiStore.providers.length) return '未配置任何中转站 · 点击去「设置」添加'
  const lines = aiStore.providers.map((p) => `${p.name}：${STATUS_ZH[p.status] || p.status}`)
  return lines.join('\n') + '\n（点击进入设置）'
})

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
  if (!hideNodesTab.value && route.path !== '/editor') {
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
  // 剪辑入口：主页和剪辑页显示，画布页不显示
  if (route.path !== '/chat' && route.path !== '/assets' && route.path !== '/nodes') {
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
void getStatusClass // 仅保留映射备用；顶栏已改用聚合徽章
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
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #e6f7ff;
  text-shadow: 0 0 10px rgba(0, 217, 255, 0.25);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 5px 12px;
  border-radius: 7px;
  transition: all 0.2s;
}
/* 标题前的青→紫渐变竖条，做出「画布名」的标识感 */
.project-name::before {
  content: '';
  width: 3px;
  height: 16px;
  border-radius: 2px;
  background: linear-gradient(180deg, #00D9FF, #B432FF);
  box-shadow: 0 0 6px rgba(0, 217, 255, 0.6);
  flex-shrink: 0;
}

.project-name:hover {
  color: #00D9FF;
  background: rgba(0, 217, 255, 0.12);
  box-shadow: inset 0 0 0 1px rgba(0, 217, 255, 0.25);
}

.project-name:hover .edit-icon {
  opacity: 1;
}

.edit-icon {
  opacity: 0;
  transition: opacity 0.2s;
}

.project-name-input {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #ffffff;
  background: rgba(0, 217, 255, 0.1);
  border: 1px solid #00D9FF;
  border-radius: 7px;
  padding: 5px 12px;
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

.update-body p {
  margin: 0 0 10px;
  line-height: 1.6;
}
.update-hint {
  font-size: 13px;
  color: var(--el-text-color-secondary, #8a94a6);
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
.status-dot.green  { background: #00ff88; box-shadow: 0 0 5px rgba(0,255,136,.55); }
.status-dot.yellow { background: #ffcc00; box-shadow: 0 0 5px rgba(255,204,0,.5); }
.status-dot.red    { background: #ff4444; box-shadow: 0 0 5px rgba(255,68,68,.5); }
.status-dot.gray   { background: #666; }

.status-summary {
  font-size: 12px;
  color: rgba(255,255,255,0.55);
  white-space: nowrap;
}

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
