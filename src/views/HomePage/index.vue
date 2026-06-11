<template>
  <div class="home-page">
    <!-- 右上角公告按钮 -->
    <button class="announce-btn" @click="openChangelog" title="更新公告">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <span class="announce-dot" v-if="!hasSeenLatest"></span>
    </button>

    <!-- 版本更新弹窗 -->
    <Teleport to="body">
      <div v-if="showChangelog" class="changelog-overlay" @click.self="dismissChangelog">
        <div class="changelog-modal">
          <h3>更新公告 · v{{ appVersion }}</h3>
          <div class="changelog-body">
            <div class="changelog-date">{{ formatDateStr(Date.now()) }}</div>
            <ul>
              <li>💬 新增 AI 文本对话助手（支持 DeepSeek 等大模型）</li>
              <li>🎬 新增器灵视频中转站（Seedance 系列）</li>
              <li>🖱️ 画布 Shift+拖拽 框选多个节点</li>
              <li>💾 本地上传素材重启后保留（磁盘存储）</li>
              <li>🎨 底部导航图标升级为 SVG 风格</li>
              <li>⚡ 页面切换过渡动画 & 节点生成光效</li>
              <li>🔧 多项 UI 优化和 Bug 修复</li>
            </ul>
          </div>
          <button
            class="changelog-ok"
            :class="{ ready: okReady }"
            :disabled="!okReady"
            @click="dismissChangelog"
          >
            {{ okReady ? '我知道了' : `请阅读 (${countdown}s)` }}
          </button>
        </div>
      </div>
    </Teleport>

    <!-- 自定义背景层 -->
    <div class="background-layer" :style="backgroundStyle">
      <video
        v-if="customBackground && customBackgroundType === 'video'"
        :src="customBackground"
        class="background-video"
        autoplay
        loop
        muted
        playsinline
      />
      <div class="background-overlay"></div>
    </div>

    <!-- 内容容器 -->
    <div class="content-container">
      <!-- Hero区 -->
      <section class="hero-section">
        <div class="hero-content">
          <h1 class="hero-title">
            <span class="title-gradient">AI Video Canvas</span>
          </h1>
          <p class="hero-subtitle">用节点构建你的创意视频，AI驱动的可视化创作平台</p>
          <div class="hero-actions">
            <button class="hero-btn primary" @click="openNewProjectDialog">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a1 1 0 011 1v6h6a1 1 0 110 2H9v6a1 1 0 11-2 0V9H1a1 1 0 010-2h6V1a1 1 0 011-1z"/>
              </svg>
              新建项目
            </button>
          </div>
        </div>
      </section>

      <!-- 快速创建卡片 -->
      <section class="quick-create-section">
        <h2 class="section-title">快速创建</h2>
        <div class="quick-cards">
          <div
            v-for="card in quickCards"
            :key="card.type"
            class="quick-card"
            @click="createNode(card.type)"
          >
            <div class="card-icon" :style="{ background: card.color }">
              <span>{{ card.icon }}</span>
            </div>
            <div class="card-content">
              <div class="card-title">{{ card.title }}</div>
              <div class="card-desc">{{ card.description }}</div>
            </div>
            <svg class="card-arrow" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>
      </section>

      <!-- 最近项目 -->
      <section class="recent-section">
        <div class="section-header">
          <h2 class="section-title">最近项目</h2>
          <button class="section-link" @click="showProjectsModal = true">
            查看全部
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>

        <div v-if="recentProjects.length === 0" class="empty-state">
          <div class="empty-icon">📂</div>
          <p class="empty-text">还没有项目</p>
          <button class="empty-action" @click="openNewProjectDialog">创建第一个项目</button>
        </div>

        <div v-else class="projects-grid">
          <div
            v-for="project in recentProjects"
            :key="project.id"
            class="project-card"
            @click="openProject(project)"
          >
            <button class="project-delete" @click.stop="deleteProject(project.id)" title="删除项目">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <div class="project-thumbnail">
              <img v-if="project.thumbnail" :src="project.thumbnail" :alt="project.name" />
              <div v-else class="project-placeholder">
                <span>{{ project.name.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="project-overlay">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16" fill="white">
                  <path d="M4.66699 2.64248C4.66717 1.82358 5.59736 1.35167 6.25781 1.83584L13.5674 7.19619C14.1117 7.59579 14.1118 8.40897 13.5674 8.8085L6.25781 14.1688C5.59734 14.6528 4.6671 14.1811 4.66699 13.3622V2.64248Z"/>
                </svg>
              </div>
            </div>
            <div class="project-info">
              <div class="project-name">{{ project.name }}</div>
              <div class="project-meta">
                <span class="project-date">{{ formatDate(project.updatedAt) }}</span>
                <span class="project-nodes">{{ project.nodeCount }} 个节点</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 右下角版本号 + 检查更新 -->
    <div class="version-tag" @click="checkUpdate" title="点击检查更新">
      <svg class="version-update-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 2v6h-6"></path>
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
        <path d="M3 22v-6h6"></path>
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
      </svg>
      v{{ appVersion }}
    </div>

    <!-- 左下角背景设置齿轮 -->
    <div class="bg-settings">      <button class="bg-gear-btn" @click="toggleBgMenu" title="主页设置">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>
        </svg>
      </button>

      <transition name="bg-menu">
        <div v-if="showBgMenu" class="bg-menu" @click.stop>
          <div class="bg-menu-title">主页背景</div>
          <button class="bg-menu-item" @click="triggerBackgroundUpload">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <span>更换背景</span>
          </button>
          <button v-if="customBackground" class="bg-menu-item" @click="resetBackground">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
              <path d="M3 21v-5h5"></path>
            </svg>
            <span>重置默认</span>
          </button>
          <input
            ref="bgInputRef"
            type="file"
            accept="image/*,video/*"
            @change="handleBackgroundUpload"
            style="display: none"
          />
        </div>
      </transition>
    </div>

    <!-- 项目列表弹窗 -->
    <Teleport to="body">
      <transition name="modal">
        <div v-if="showProjectsModal" class="modal-overlay" @click="showProjectsModal = false">
          <div class="modal-content modal-wide" @click.stop>
            <div class="modal-header">
              <h3 class="modal-title">全部项目</h3>
              <button class="modal-close" @click="showProjectsModal = false">×</button>
            </div>
            <div class="modal-body" style="max-height:50vh;overflow-y:auto">
              <div v-if="recentProjects.length === 0" class="empty-state" style="border:none;padding:40px">
                <div class="empty-icon">📂</div>
                <p class="empty-text">还没有项目</p>
              </div>
              <div v-else class="projects-list">
                <div v-for="p in recentProjects" :key="p.id" class="project-list-item" @click="openProjectFromModal(p)">
                  <div class="project-list-name">{{ p.name }}</div>
                  <div class="project-list-meta">
                    <span>{{ formatDate(p.updatedAt) }}</span>
                    <span>{{ p.nodeCount }} 个节点</span>
                  </div>
                  <button class="project-list-delete" @click.stop="deleteProjectFromModal(p.id)" title="删除">🗑</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 新建项目弹窗 -->
    <Teleport to="body">
      <transition name="modal">
        <div v-if="showNewProjectDialog" class="modal-overlay" @click="closeNewProjectDialog">
          <div class="modal-content" @click.stop>
            <div class="modal-header">
              <h3 class="modal-title">新建项目</h3>
              <button class="modal-close" @click="closeNewProjectDialog"><svg viewBox="0 0 16 16" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
            </div>
            <div class="modal-body">
              <label class="modal-label">项目名称</label>
              <input
                ref="projectNameInputRef"
                v-model="newProjectName"
                type="text"
                class="modal-input"
                placeholder="请输入项目名称..."
                maxlength="50"
                @keyup.enter="confirmNewProject"
                @keyup.escape="closeNewProjectDialog"
              />
              <div class="modal-hint">{{ newProjectName.length }} / 50</div>
            </div>
            <div class="modal-footer">
              <button class="modal-btn ghost" @click="closeNewProjectDialog">取消</button>
              <button
                class="modal-btn primary"
                @click="confirmNewProject"
                :disabled="!newProjectName.trim()"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useNodeStore } from '@/stores/node'

const router = useRouter()
const nodeStore = useNodeStore()
const bgInputRef = ref<HTMLInputElement>()
const customBackground = ref<string>('')
const customBackgroundType = ref<'image' | 'video'>('image')
const showBgMenu = ref(false)
const showChangelog = ref(false)
const okReady = ref(false)
const countdown = ref(3)
const isAutoPopup = ref(false)
const appVersion = __APP_VERSION__
const hasSeenLatest = computed(() => localStorage.getItem('lastSeenVersion') === appVersion)

// 点击版本号触发更新检查（更新逻辑在 App.vue 全局处理）
const checkUpdate = () => {
  window.dispatchEvent(new CustomEvent('trigger-update-check'))
}

// 新建项目弹窗
const showNewProjectDialog = ref(false)
const showProjectsModal = ref(false)
const newProjectName = ref('')
const projectNameInputRef = ref<HTMLInputElement>()

const openNewProjectDialog = async () => {
  showNewProjectDialog.value = true
  newProjectName.value = ''
  await nextTick()
  setTimeout(() => {
    projectNameInputRef.value?.focus()
  }, 100)
}

const closeNewProjectDialog = () => {
  showNewProjectDialog.value = false
  newProjectName.value = ''
}

function uniqueProjectName(base: string): string {
  const existing = new Set(recentProjects.value.map(p => p.name))
  if (!existing.has(base)) return base
  let i = 2
  while (existing.has(`${base}${i}`)) i++
  return `${base}${i}`
}

const confirmNewProject = () => {
  const name = newProjectName.value.trim()
  if (!name) return

  // 创建新项目
  const uniqueName = uniqueProjectName(name)
  const newProject: Project = {
    id: `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: uniqueName,
    updatedAt: Date.now(),
    nodeCount: 0,
  }

  // 添加到最近项目列表（最新的在最前）
  recentProjects.value.unshift(newProject)
  saveProjects()

  // 跳转到画布
  router.push({
    path: '/nodes',
    query: {
      newProject: 'true',
      name: encodeURIComponent(name),
      projectId: newProject.id,
    }
  })

  showNewProjectDialog.value = false
}

function openChangelog() {
  showChangelog.value = true
  isAutoPopup.value = false
  okReady.value = true
  countdown.value = 0
}

function startCountdown() {
  isAutoPopup.value = true
  countdown.value = 3
  okReady.value = false
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
      okReady.value = true
    }
  }, 1000)
}

function dismissChangelog() {
  if (!okReady.value) return
  showChangelog.value = false
  localStorage.setItem('lastSeenVersion', appVersion)
}

function formatDateStr(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const toggleBgMenu = () => {
  showBgMenu.value = !showBgMenu.value
}

// 初始化
onMounted(() => {
  // 版本更新公告：首次打开该版本时弹窗
  const lastSeen = localStorage.getItem('lastSeenVersion')
  if (lastSeen !== appVersion) {
    showChangelog.value = true
    startCountdown()
  }

  // 加载项目列表
  loadProjects()

  // 从磁盘恢复背景设置
  try {
    const savedPath = localStorage.getItem('homepage_background_path')
    const savedType = localStorage.getItem('homepage_background_type') as 'image' | 'video'
    if (savedPath) {
      const normalized = savedPath.replace(/\\/g, '/')
      customBackground.value = /^[A-Za-z]:\//.test(normalized) ? 'local-upload:///' + normalized : savedPath
      customBackgroundType.value = savedType || 'image'
    }
  } catch { /* ignore */ }

  // 点击外部关闭菜单
  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.bg-settings')) {
      showBgMenu.value = false
    }
  })
})

// 背景样式
const backgroundStyle = computed(() => {
  if (!customBackground.value) {
    return {}
  }
  if (customBackgroundType.value === 'image') {
    return {
      backgroundImage: `url(${customBackground.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  return {}
})

// 触发背景上传
const triggerBackgroundUpload = () => {
  bgInputRef.value?.click()
}

// 处理背景上传
const handleBackgroundUpload = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    const dataUrl = e.target?.result as string
    customBackground.value = dataUrl
    customBackgroundType.value = file.type.startsWith('video/') ? 'video' : 'image'

    // 落盘到磁盘（local-upload:/// + IPC）
    const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl
    if (window.electronAPI?.upload?.save) {
      try {
        const savedPath = await window.electronAPI.upload.save(base64, file.name)
        if (savedPath) {
          localStorage.setItem('homepage_background_path', savedPath)
          localStorage.setItem('homepage_background_type', customBackgroundType.value)
          const normalized = savedPath.replace(/\\/g, '/')
          customBackground.value = 'local-upload:///' + normalized
        }
      } catch { /* 落盘失败回退 data URL */ }
    }
  }
  reader.readAsDataURL(file)
}

// 重置背景
const resetBackground = () => {
  customBackground.value = ''
  localStorage.removeItem('homepage_background_path')
  localStorage.removeItem('homepage_background_type')
}

// 快速创建卡片
const quickCards = [
  {
    type: 'ai-short-drama',
    title: 'AI短剧生成',
    description: '一键生成短剧视频',
    icon: '🎬',
    color: 'linear-gradient(135deg, #00D9FF 0%, #B432FF 100%)',
  },
  {
    type: 'asset-library',
    title: '素材库',
    description: '管理项目素材',
    icon: '📦',
    color: 'linear-gradient(135deg, #FFC371 0%, #00D9FF 100%)',
  },
  {
    type: 'ai-chat',
    title: 'AI 对话助手',
    description: 'AI 智能问答与创作',
    icon: '💬',
    color: 'linear-gradient(135deg, #00ff88 0%, #00D9FF 100%)',
  },
]

// 最近项目（从localStorage加载）
interface Project {
  id: string
  name: string
  thumbnail?: string
  updatedAt: number
  nodeCount: number
}

const recentProjects = ref<Project[]>([])

// 从localStorage加载项目列表
const loadProjects = () => {
  try {
    const saved = localStorage.getItem('recent_projects')
    if (saved) {
      recentProjects.value = JSON.parse(saved)
    }
  } catch (err) {
    console.warn('加载项目列表失败:', err)
    recentProjects.value = []
  }
}

// 保存项目列表到localStorage
const saveProjects = () => {
  try {
    localStorage.setItem('recent_projects', JSON.stringify(recentProjects.value))
  } catch (err) {
    console.warn('保存项目列表失败:', err)
  }
}

// 创建节点
const createNode = (type: string) => {
  if (type === 'ai-short-drama') {
    // 短剧入口：自动创建一个项目 + 加入最近列表，跳转到新画布
    const id = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const proj: Project = {
      id,
      name: uniqueProjectName('AI短剧'),
      updatedAt: Date.now(),
      nodeCount: 0,
    }
    recentProjects.value.unshift(proj)
    saveProjects()
    router.push({
      path: '/nodes',
      query: {
        newProject: 'true',
        projectId: id,
        name: encodeURIComponent(proj.name),
      },
    })
  } else if (type === 'asset-library') {
    router.push({ path: '/assets', query: { from: 'home' } })
  } else if (type === 'ai-chat') {
    router.push('/chat')
  } else {
    router.push({ path: '/nodes', query: { create: type } })
  }
}

// 打开项目
const openProject = (project: Project) => {
  router.push({ path: '/nodes', query: { project: project.id } })
}

function openProjectFromModal(p: Project) {
  showProjectsModal.value = false
  openProject(p)
}

function deleteProjectFromModal(projectId: string) {
  deleteProject(projectId)
  if (recentProjects.value.length === 0) showProjectsModal.value = false
}

// 删除项目
const deleteProject = (projectId: string) => {
  if (confirm('确定要删除这个项目吗？此操作不可撤销。')) {
    recentProjects.value = recentProjects.value.filter(p => p.id !== projectId)
    saveProjects()
    // 同时清掉 node store 里这个项目的画布数据
    nodeStore.deleteProject(projectId).catch((err) => {
      console.warn('删除项目画布数据失败:', err)
    })
  }
}

// 导航
const navigateTo = (path: string) => {
  router.push(path)
}

// 格式化日期
const formatDate = (timestamp: number) => {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}
</script>

<style scoped>
.home-page {
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 背景层 */
.background-layer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at center, #0a1628 0%, #020308 100%);
  z-index: 0;
  transition: background 0.5s;
  overflow: hidden;
}

.background-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.background-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(2, 3, 8, 0.4) 0%, rgba(2, 3, 8, 0.85) 100%);
  backdrop-filter: blur(2px);
}

.content-container {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 60px 40px;
  display: flex;
  flex-direction: column;
  gap: 60px;
}

/* Hero区 */
.hero-section {
  text-align: center;
  padding: 60px 0 40px;
}

.hero-title {
  font-size: 72px;
  font-weight: 700;
  margin: 0 0 20px;
  letter-spacing: -2px;
  line-height: 1.1;
}

.title-gradient {
  background: linear-gradient(135deg, #00D9FF 0%, #B432FF 50%, #FF6B9D 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 30px rgba(0, 217, 255, 0.5));
}

.hero-subtitle {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0 0 40px;
  font-weight: 300;
}

.hero-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.hero-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 28px;
  font-size: 15px;
  font-weight: 500;
  border: 1px solid rgba(0, 217, 255, 0.3);
  background: rgba(0, 217, 255, 0.05);
  color: #ffffff;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
  backdrop-filter: blur(10px);
}

.hero-btn:hover {
  background: rgba(0, 217, 255, 0.15);
  border-color: #00D9FF;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 217, 255, 0.2);
}

.hero-btn.primary {
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.3) 0%, rgba(180, 50, 255, 0.3) 100%);
  border-color: #00D9FF;
}

.hero-btn.primary:hover {
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.5) 0%, rgba(180, 50, 255, 0.5) 100%);
  box-shadow: 0 8px 32px rgba(0, 217, 255, 0.4);
}

.hero-btn.ghost {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.7);
}

.hero-btn.ghost:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
}

/* 区块通用 */
.section-title {
  font-size: 24px;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-header .section-title {
  margin: 0;
}

.section-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: #00D9FF;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  padding: 6px 12px;
  border-radius: 6px;
}

.section-link:hover {
  background: rgba(0, 217, 255, 0.1);
  gap: 8px;
}

/* 快速创建卡片 */
.quick-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s;
  backdrop-filter: blur(10px);
}

.quick-card:hover {
  background: rgba(0, 217, 255, 0.08);
  border-color: rgba(0, 217, 255, 0.4);
  transform: translateY(-3px);
}

.quick-card:hover .card-arrow {
  transform: translateX(4px);
  color: #00D9FF;
}

.card-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  flex-shrink: 0;
}

.card-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 4px;
}

.card-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.card-arrow {
  color: rgba(255, 255, 255, 0.3);
  transition: all 0.3s;
  flex-shrink: 0;
}

/* 最近项目 */
.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
}

.project-card {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s;
  backdrop-filter: blur(10px);
}

.project-card:hover {
  border-color: rgba(0, 217, 255, 0.4);
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(0, 217, 255, 0.15);
}

.project-card:hover .project-overlay {
  opacity: 1;
}

.project-card:hover .project-delete {
  opacity: 1;
}

.project-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
  z-index: 2;
  backdrop-filter: blur(8px);
  padding: 0;
}

.project-delete:hover {
  background: rgba(255, 80, 80, 0.85);
  border-color: rgba(255, 100, 100, 0.8);
  color: #ffffff;
  transform: scale(1.1);
}

.project-thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.1) 0%, rgba(180, 50, 255, 0.1) 100%);
  overflow: hidden;
}

.project-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.project-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 60px;
  font-weight: 700;
  color: rgba(0, 217, 255, 0.3);
}

.project-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.3s;
}

.project-info {
  padding: 14px 16px;
}

.project-name {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 20px;
}

.empty-action {
  padding: 10px 24px;
  background: rgba(0, 217, 255, 0.15);
  border: 1px solid #00D9FF;
  color: #00D9FF;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.empty-action:hover {
  background: rgba(0, 217, 255, 0.25);
  box-shadow: 0 0 16px rgba(0, 217, 255, 0.3);
}

.version-tag {
  position: fixed;
  bottom: 20px; right: 24px;
  font-size: 11px; color: rgba(255,255,255,0.2);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s ease;
}
.version-tag:hover {
  color: rgba(127, 180, 255, 0.9);
  background: rgba(20, 30, 55, 0.5);
  text-shadow: 0 0 8px rgba(100, 180, 255, 0.5);
}
.version-update-icon {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}
.version-tag:hover .version-update-icon {
  opacity: 1;
}

/* 左下角背景设置 */
.bg-settings {
  position: fixed;
  bottom: 100px;
  left: 24px;
  z-index: 100;
}

/* 公告按钮 */
.announce-btn {
  position: fixed;
  top: 64px; right: 24px;
  width: 32px; height: 32px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.2);
  cursor: pointer;
  z-index: 100;
  transition: all 0.3s;
  display: flex; align-items: center; justify-content: center;
}
.announce-btn:hover {
  color: rgba(255,255,255,0.5);
}
.announce-dot {
  position: absolute;
  top: 4px; right: 4px;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: #ff4444;
  opacity: 0.8;
}

/* 更新弹窗 */
.changelog-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
}
.changelog-modal {
  background: rgba(2,3,8,0.98);
  border: 1px solid rgba(0,217,255,0.4);
  border-radius: 16px;
  padding: 32px;
  max-width: 480px; width: 90%;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
}
.changelog-modal h3 {
  color: #00D9FF; font-size: 20px; font-weight: 500;
  margin: 0 0 20px;
}
.changelog-date { font-size: 12px; color: rgba(255,255,255,0.3); margin-bottom: 16px; }
.changelog-body ul { padding-left: 18px; margin: 0; }
.changelog-body li {
  color: rgba(255,255,255,0.7); font-size: 14px;
  line-height: 2; margin-bottom: 2px;
}
.changelog-ok {
  display: block; margin: 24px auto 0;
  padding: 10px 40px;
  border-radius: 8px; border: 1px solid #00D9FF;
  background: rgba(0,217,255,0.1);
  color: #00D9FF; font-size: 14px; cursor: pointer;
  transition: all 0.3s;
}
.changelog-ok:disabled { opacity: 0.4; cursor: not-allowed; }
.changelog-ok.ready { background: rgba(0,217,255,0.25); }
.changelog-ok.ready:hover {
  background: rgba(0,217,255,0.4);
  box-shadow: 0 0 16px rgba(0,217,255,0.4);
}

.bg-gear-btn {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.2);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.3s;
}
.bg-gear-btn:hover { color: rgba(255,255,255,0.5); }

.bg-menu {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 0;
  background: rgba(2, 3, 8, 0.95);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 10px;
  padding: 6px;
  min-width: 160px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.bg-menu-title {
  padding: 8px 12px 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.bg-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.bg-menu-item:hover {
  background: rgba(0, 217, 255, 0.15);
  color: #00D9FF;
}

.bg-menu-enter-active,
.bg-menu-leave-active {
  transition: all 0.25s;
}

.bg-menu-enter-from,
.bg-menu-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* 新建项目弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-wide { max-width: 640px; }
.projects-list { display: flex; flex-direction: column; gap: 4px; }
.project-list-item {
  display: flex; align-items: center; gap: 16px;
  padding: 14px 16px; border-radius: 8px;
  cursor: pointer; transition: background 0.2s;
}
.project-list-item:hover { background: rgba(0,217,255,0.06); }
.project-list-name {
  flex: 1; font-size: 15px; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.project-list-meta {
  display: flex; gap: 12px;
  font-size: 12px; color: rgba(255,255,255,0.4); white-space: nowrap;
}
.project-list-delete {
  background: none; border: none; font-size: 14px; cursor: pointer;
  opacity: 0; transition: opacity 0.2s; padding: 4px;
}
.project-list-item:hover .project-list-delete { opacity: 0.5; }
.project-list-delete:hover { opacity: 1 !important; }

.modal-content {
  background: rgba(2, 3, 8, 0.98);
  border: 1px solid rgba(0, 217, 255, 0.4);
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 217, 255, 0.15);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
}

.modal-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.modal-close:hover {
  background: rgba(255, 80, 80, 0.2);
  border-color: rgba(255, 80, 80, 0.5);
  color: #ffffff;
  transform: rotate(90deg);
}

.modal-body {
  padding: 24px;
}

.modal-label {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 10px;
}

.modal-input {
  width: 100%;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(0, 217, 255, 0.3);
  border-radius: 8px;
  color: #ffffff;
  font-size: 15px;
  outline: none;
  transition: all 0.2s;
  font-family: inherit;
  box-sizing: border-box;
}

.modal-input:focus {
  background: rgba(0, 217, 255, 0.08);
  border-color: #00D9FF;
  box-shadow: 0 0 16px rgba(0, 217, 255, 0.2);
}

.modal-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.modal-hint {
  text-align: right;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 6px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.modal-btn {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
  border: 1px solid transparent;
}

.modal-btn.ghost {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
}

.modal-btn.ghost:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
}

.modal-btn.primary {
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.3) 0%, rgba(180, 50, 255, 0.3) 100%);
  border-color: #00D9FF;
  color: #00D9FF;
}

.modal-btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.5) 0%, rgba(180, 50, 255, 0.5) 100%);
  color: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 217, 255, 0.4);
}

.modal-btn.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.9) translateY(-20px);
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s;
}

/* 响应式 */
@media (max-width: 768px) {
  .content-container {
    padding: 40px 20px;
    gap: 40px;
  }

  .hero-title {
    font-size: 48px;
  }

  .hero-subtitle {
    font-size: 16px;
  }

  .quick-cards {
    grid-template-columns: 1fr;
  }

  .projects-grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }
}
</style>
