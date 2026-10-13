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
          <h3>更新公告</h3>
          <div class="changelog-body">
            <section
              v-for="entry in recentChangelogEntries"
              :key="entry.version"
              class="changelog-entry"
            >
              <div class="changelog-entry-header">
                <strong>v{{ entry.version }}</strong>
                <span>{{ entry.date }}</span>
              </div>
              <ul>
                <li v-for="item in entry.items" :key="item">{{ item }}</li>
              </ul>
            </section>
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

    <!-- 动态画布背景 -->
    <div class="background-layer" aria-hidden="true">
      <div class="background-overlay"></div>
      <div class="ambient-orb ambient-blue"></div>
      <div class="ambient-orb ambient-violet"></div>
      <div class="ambient-grid"></div>
      <div class="ambient-flow"></div>
      <div class="ambient-specks"></div>
      <div class="ambient-ribbon ambient-ribbon-one"></div>
      <div class="ambient-ribbon ambient-ribbon-two"></div>
    </div>

    <!-- 内容容器 -->
    <div class="content-container">
      <!-- Hero区 -->
      <section class="hero-section">
        <div class="hero-content">
          <h1 class="hero-title">
            <span class="title-gradient">芜湖AI</span>
          </h1>
          <p class="hero-subtitle">用节点构建你的创意视频，AI驱动的可视化创作平台</p>
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
              <CanvasIcon :name="card.icon" />
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
              <template v-if="projectPreview(project)">
                <img
                  v-if="projectPreview(project)?.type === 'image'"
                  :src="projectPreview(project)?.url"
                  :alt="project.name"
                />
                <video
                  v-else
                  :src="projectPreview(project)?.url"
                  muted
                  playsinline
                  preload="metadata"
                  :aria-label="`${project.name} 首帧预览`"
                />
              </template>
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

    <!-- 左下角设置入口 -->
    <div class="bg-settings">
      <button class="bg-gear-btn" @click="router.push('/settings')" title="设置">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"></path>
        </svg>
      </button>

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
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNodeStore } from '@/stores/node'
import { useAssetStore } from '@/stores/asset'
import CanvasIcon from '@/components/CanvasIcon.vue'

const router = useRouter()
const nodeStore = useNodeStore()
const assetStore = useAssetStore()



const showChangelog = ref(false)
const okReady = ref(false)
const countdown = ref(3)
const isAutoPopup = ref(false)
const appVersion = __APP_VERSION__
const hasSeenLatest = computed(() => localStorage.getItem('lastSeenVersion') === appVersion)

// 新公告始终插到数组最前面。界面只展示最近两次版本更新，较早记录不再出现。
const changelogEntries = [
  {
    version: '0.3.14',
    date: '2026-10-13',
    items: [
      '新增器灵 SD2.5-满血-CB-480P 模型，固定 480P，支持 4–30 秒生成',
      'CB 480P 支持最多 30 张图、10 个视频、10 个音频，参考素材合计最多 50 项',
      'CB 480P 限定 16:9 和 9:16 画幅，并接入多媒体参考提交路径',
    ],
  },
  {
    version: '0.3.13',
    date: '2026-10-12',
    items: [
      '新增 GeekNow GPT Image 2.5 Sunburst 和 GPT Image 2 VIP，支持参考图及 1K / 2K / 4K',
      '图片模型目录仅保留 GPT 系列，已有图片中转站配置自动同步调整',
      '按模型匹配实际图片尺寸，适配 VIP 返回格式要求',
      '保留原有中转站地址、密钥及生成历史，文本和视频模型不受影响',
    ],
  },
  {
    version: '0.3.12',
    date: '2026-10-11',
    items: [
      '🌌 首页改为动态画布风格背景，增强蓝紫光晕、流动光带和微粒动效',
      '✨ 软件名称统一更新为芜湖AI，首页标题使用渐变彩色字体',
      '🧩 同步整理首页、素材库和画布界面视觉体验',
    ],
  },
  {
    version: '0.3.10',
    date: '2026-10-10',
    items: [
      '💾 新生成成片自动保存本地，预览窗口可打开保存位置或重试保存',
      '⏱️ 修复成片完成后旧查询继续报超时的问题，保存失败不再覆盖生成结果',
      '🎬 完善 DMXAPI 素材引用、首尾帧、编辑延长及重启后继续查询',
      '✨ 新增 FMGO Feimiao 2.5 · 720P · 30秒模型，支持最多30张参考图',
    ],
  },
  {
    version: '0.3.9',
    date: '2026-10-08',
    items: [
      '🎞️ 修复 DMXAPI 误把输入参考图或原视频识别为生成结果，导致视频预览错误的问题',
      '🧹 同一节点的相同结果不再重复写入生成历史',
    ],
  },
] as const
const recentChangelogEntries = changelogEntries.slice(0, 2)

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

})

// 快速创建卡片
const quickCards = [
  {
    type: 'ai-short-drama',
    title: 'AI短剧生成',
    description: '一键生成短剧视频',
    icon: 'video',
    color: '#2b2b2b',
  },
  {
    type: 'asset-library',
    title: '素材库',
    description: '管理项目素材',
    icon: 'assets',
    color: '#2b2b2b',
  },
  {
    type: 'ai-chat',
    title: 'AI 对话助手',
    description: 'AI 智能问答与创作',
    icon: 'chat',
    color: '#2b2b2b',
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
const projectPreviewCache = ref<Record<string, { type: 'image' | 'video'; url: string }>>({})

// 项目卡片使用该项目最早生成的结果作为封面；视频元素会停在首帧。
const projectPreview = (project: Project) => {
  const cached = projectPreviewCache.value[project.id]
  if (cached) return cached
  const generated = assetStore.sortedAssets
    .filter((asset) => asset.projectId === project.id && !!asset.url)
    .sort((a, b) => a.createdAt - b.createdAt)[0]
  if (generated) return { type: generated.type, url: generated.url }
  if (project.thumbnail) return { type: 'image' as const, url: project.thumbnail }
  return null
}

const refreshProjectPreviews = async () => {
  const next: Record<string, { type: 'image' | 'video'; url: string }> = {}
  for (const project of recentProjects.value) {
    const generated = assetStore.sortedAssets
      .filter((asset) => asset.projectId === project.id && !!asset.url)
      .sort((a, b) => a.createdAt - b.createdAt)[0]
    if (!generated) {
      if (project.thumbnail) next[project.id] = { type: 'image', url: project.thumbnail }
      continue
    }
    if (generated.type === 'image') {
      next[project.id] = { type: 'image', url: generated.url }
      continue
    }
    let firstFrame = ''
    try {
      const thumbnails = window.electronAPI?.video?.thumbnails
      if (thumbnails) {
        const frames = await thumbnails(generated.url, generated.duration || 5, 1)
        firstFrame = frames?.[0] || ''
      }
    } catch { /* 远程视频无法抽帧时保留视频预览 */ }
    next[project.id] = firstFrame
      ? { type: 'image', url: firstFrame }
      : { type: 'video', url: generated.url }
  }
  projectPreviewCache.value = next
}

watch([recentProjects, () => assetStore.assets], () => {
  void refreshProjectPreviews()
}, { deep: true, immediate: true })

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
  background: radial-gradient(ellipse at 50% -10%, #202638 0%, #12151e 42%, #0c0e14 100%);
  pointer-events: none;
  z-index: 0;
  transition: background 0.5s;
  overflow: hidden;
}

.ambient-orb { position: absolute; width: min(86vw, 1100px); aspect-ratio: 1; border-radius: 50%; will-change: transform, opacity; filter: blur(2px); }
.ambient-blue { left: -20%; top: -48%; background: radial-gradient(circle, #6c9dff80 0%, #4b73d644 34%, #4062a61c 55%, transparent 73%); animation: drift-blue 16s ease-in-out infinite alternate; }
.ambient-violet { right: -18%; top: -30%; background: radial-gradient(circle, #bf8dff72 0%, #925fca3d 35%, #82599718 56%, transparent 74%); animation: drift-violet 21s ease-in-out infinite alternate; }
.ambient-grid { position: absolute; inset: -48px; opacity: .36; background-image: linear-gradient(#b4bdda2b 1px, transparent 1px), linear-gradient(90deg, #b4bdda2b 1px, transparent 1px); background-size: 48px 48px; mask-image: radial-gradient(ellipse at 50% 20%, black, transparent 76%); animation: grid-drift 20s linear infinite; }
.ambient-flow { position: absolute; inset: -35%; background: conic-gradient(from 210deg at 50% 42%, transparent 0deg, #6f8dff26 55deg, transparent 105deg, #d18bff22 190deg, transparent 250deg, #70c8ff20 310deg, transparent 360deg); filter: blur(30px); animation: flow-spin 26s linear infinite; }
.ambient-specks { position: absolute; inset: 0; opacity: .34; background-image: radial-gradient(circle at 12% 28%, #bcd4ff88 0 1px, transparent 1.5px), radial-gradient(circle at 74% 18%, #e5c8ff70 0 1px, transparent 1.5px), radial-gradient(circle at 42% 64%, #8ecbff66 0 1px, transparent 1.5px), radial-gradient(circle at 88% 76%, #d7b7ff66 0 1px, transparent 1.5px), radial-gradient(circle at 24% 88%, #a9c8ff55 0 1px, transparent 1.5px); background-size: 260px 220px, 340px 280px, 420px 320px, 300px 260px, 380px 300px; animation: specks-drift 24s linear infinite alternate; }
.ambient-ribbon { position: absolute; width: 145%; height: 18%; left: -24%; border-radius: 50%; filter: blur(34px); opacity: .3; mix-blend-mode: screen; will-change: transform; }
.ambient-ribbon-one { top: 12%; background: linear-gradient(90deg, transparent 0%, #6aa4ff00 12%, #6aa4ff52 40%, #b78cff62 53%, #6aa4ff00 86%); transform: rotate(-9deg); animation: ribbon-drift-one 18s ease-in-out infinite alternate; }
.ambient-ribbon-two { top: 48%; left: -32%; background: linear-gradient(90deg, transparent 0%, #d494ff00 14%, #d494ff3d 42%, #75c5ff4d 61%, #d494ff00 88%); transform: rotate(8deg); animation: ribbon-drift-two 23s ease-in-out infinite alternate-reverse; }
@keyframes drift-blue { 0% { transform: translate3d(-4vw,-2vh,0) scale(.92); opacity: .72; } 100% { transform: translate3d(28vw,16vh,0) scale(1.18); opacity: 1; } }
@keyframes drift-violet { 0% { transform: translate3d(2vw,-4vh,0) scale(.86); opacity: .66; } 100% { transform: translate3d(-24vw,22vh,0) scale(1.08); opacity: 1; } }
@keyframes grid-drift { to { transform: translate3d(48px,48px,0); } }
@keyframes flow-spin { to { transform: rotate(360deg); } }
@keyframes specks-drift { from { transform: translate3d(-16px,-10px,0); } to { transform: translate3d(20px,14px,0); } }
@keyframes ribbon-drift-one { 0% { transform: translate3d(-15vw,-8vh,0) rotate(-9deg) scale(.92); opacity: .18; } 100% { transform: translate3d(22vw,12vh,0) rotate(-5deg) scale(1.08); opacity: .48; } }
@keyframes ribbon-drift-two { 0% { transform: translate3d(20vw,8vh,0) rotate(8deg) scale(1.05); opacity: .14; } 100% { transform: translate3d(-18vw,-12vh,0) rotate(3deg) scale(.9); opacity: .42; } }
@media (prefers-reduced-motion: reduce) { .ambient-orb, .ambient-grid, .ambient-flow, .ambient-specks, .ambient-ribbon { animation: none; will-change: auto; } }

.background-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, transparent, #101115b8);
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
  background: linear-gradient(115deg, #a7c8ff 0%, #c1b1ed 50%, #e4b4ca 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 4px 28px rgba(145, 129, 209, 0.20));
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
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
  backdrop-filter: blur(10px);
}

.hero-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.42);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
}

.hero-btn.primary {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255,255,255,.88);
}

.hero-btn.primary:hover {
  background: rgba(255, 255, 255, 0.24);
  box-shadow: 0 8px 32px rgba(255, 255, 255, 0.12);
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
  color: rgba(255, 255, 255, 0.72);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  padding: 6px 12px;
  border-radius: 6px;
}

.section-link:hover {
  background: rgba(255, 255, 255, 0.08);
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
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.26);
  transform: translateY(-3px);
}

.quick-card:hover .card-arrow {
  transform: translateX(4px);
  color: #fff;
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
  border-color: rgba(255, 255, 255, 0.26);
  transform: translateY(-4px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28);
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
  background: linear-gradient(135deg, #2a2b2d 0%, #171819 100%);
  overflow: hidden;
}

.project-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.project-thumbnail video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.project-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 60px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.28);
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
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255,255,255,.28);
  color: rgba(255,255,255,.88);
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
  color: rgba(255,255,255,.88); font-size: 20px; font-weight: 500;
  margin: 0 0 20px;
}
.changelog-body {
  max-height: min(58vh, 520px);
  overflow-y: auto;
  padding-right: 6px;
}
.changelog-entry + .changelog-entry {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid rgba(255,255,255,0.1);
}
.changelog-entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.changelog-entry-header strong { color: rgba(255,255,255,0.9); font-size: 15px; }
.changelog-entry-header span { color: rgba(255,255,255,0.3); font-size: 12px; }
.changelog-body ul { padding-left: 18px; margin: 0; }
.changelog-body li {
  color: rgba(255,255,255,0.7); font-size: 14px;
  line-height: 2; margin-bottom: 2px;
}
.changelog-ok {
  display: block; margin: 24px auto 0;
  padding: 10px 40px;
  border-radius: 8px; border: 1px solid rgba(255,255,255,.28);
  background: rgba(0,217,255,0.1);
  color: rgba(255,255,255,.88); font-size: 14px; cursor: pointer;
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
  color: rgba(255,255,255,.88);
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
  background: #222324;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
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
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  color: #ffffff;
  font-size: 15px;
  outline: none;
  transition: all 0.2s;
  font-family: inherit;
  box-sizing: border-box;
}

.modal-input:focus {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255,255,255,.48);
  box-shadow: 0 0 16px rgba(255, 255, 255, 0.08);
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
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255,255,255,.32);
  color: rgba(255,255,255,.92);
}

.modal-btn.primary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
  box-shadow: 0 4px 16px rgba(255, 255, 255, 0.10);
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
