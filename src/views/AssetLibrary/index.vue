<template>
  <div class="asset-library">
    <div class="library-container">
      <div class="library-header">
        <h2>📦 生成历史</h2>
        <div class="header-right">
          <span class="count-tag">{{ filteredAssets.length }} 条</span>
          <button
            v-if="assetStore.assets.length > 0"
            class="btn-danger-text"
            @click="confirmClearAll"
          >🗑 清空全部</button>
        </div>
      </div>

      <div class="filter-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="filter-tab"
          :class="{ active: activeFilter === tab.value }"
          @click="activeFilter = tab.value"
        >
          {{ tab.label }} ({{ tab.count }})
        </button>
      </div>

      <div v-if="filteredAssets.length === 0" class="empty-state">
        <div class="empty-icon">🌌</div>
        <p class="empty-text">还没有生成历史</p>
        <p class="empty-hint">在节点画布上生成图片或视频，结果会自动归档到这里</p>
      </div>

      <div v-else class="asset-groups">
        <div v-for="g in assetGroups" :key="g.id" class="lib-group">
          <div class="lib-group-header" :class="{current:g.isCurrent}" @click="toggleGroup(g.id)">
            <span class="lib-caret">{{ isCollapsed(g.id)?'▸':'▾' }}</span>
            <span class="lib-group-name">{{ g.name }}</span>
            <span class="lib-group-count">{{ g.assets.length }}</span>
          </div>
          <div v-show="!isCollapsed(g.id)" class="asset-grid">
            <div
              v-for="asset in g.assets"
              :key="asset.id"
              class="asset-card"
              @click="openPreview(asset)"
            >
              <div class="asset-media">
                <img v-if="asset.type === 'image'" :src="asset.url" alt="" />
                <video v-else :src="asset.url" preload="metadata" muted />
                <span class="type-badge" :class="asset.type">
                  {{ asset.type === 'image' ? '图' : '视频' }}
                </span>
                <button
                  class="asset-delete"
                  title="删除"
                  @click.stop="confirmDelete(asset)"
                ><svg viewBox="0 0 16 16" width="10" height="10" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
              </div>
              <div class="asset-meta">
                <div class="asset-prompt" :title="asset.prompt">{{ asset.prompt || '(无提示词)' }}</div>
                <div class="asset-info">
                  <span>{{ asset.model }}</span>
                  <span>·</span>
                  <span>{{ formatTime(asset.createdAt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 预览大图/视频弹窗 -->
    <Transition name="modal">
      <div v-if="preview" class="preview-modal" @click="preview = null">
        <div class="preview-content" @click.stop>
          <div class="preview-toolbar">
            <button class="preview-download" @click="downloadAsset(preview)">⬇ 下载</button>
            <button class="preview-close" @click="preview = null"><svg viewBox="0 0 16 16" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg></button>
          </div>
          <img v-if="preview.type === 'image'" :src="preview.url" class="preview-media" />
          <video v-else :src="preview.url" controls autoplay class="preview-media" />
          <div class="preview-info">
            <div class="preview-prompt">{{ preview.prompt || '(无提示词)' }}</div>
            <div class="preview-meta">
              <span>{{ preview.providerName }}</span>
              <span>·</span>
              <span>{{ preview.model }}</span>
              <span v-if="preview.ratio">· {{ preview.ratio }}</span>
              <span v-if="preview.resolution">· {{ preview.resolution }}</span>
              <span v-if="preview.duration">· {{ preview.duration }}s</span>
              <span>· {{ formatTime(preview.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAssetStore, type GeneratedAsset } from '@/stores/asset'

const assetStore = useAssetStore()

type Filter = 'all' | 'image' | 'video'
const activeFilter = ref<Filter>('all')

// 项目元数据：项目名(recent_projects) + 当前项目(currentProjectId)
const projectNames = ref<Record<string,string>>({})
const currentProjectId = ref<string>('')
onMounted(() => {
  try {
    const raw = localStorage.getItem('recent_projects')
    const map: Record<string,string> = {}
    if (raw) for (const p of JSON.parse(raw)) { if (p && p.id) map[p.id] = p.name || '未命名项目' }
    projectNames.value = map
  } catch { projectNames.value = {} }
  currentProjectId.value = localStorage.getItem('currentProjectId') || ''
})

const tabs = computed(() => [
  { label: '全部', value: 'all' as Filter, count: assetStore.sortedAssets.length },
  { label: '图片', value: 'image' as Filter, count: assetStore.images.length },
  { label: '视频', value: 'video' as Filter, count: assetStore.videos.length },
])

const filteredAssets = computed(() => {
  if (activeFilter.value === 'image') return assetStore.images
  if (activeFilter.value === 'video') return assetStore.videos
  return assetStore.sortedAssets
})

// 按项目分组：当前项目最前，其余按数量，未分类垫底
const assetGroups = computed(() => {
  const groups: Record<string, GeneratedAsset[]> = {}
  for (const a of filteredAssets.value) { const k = a.projectId || '__none__'; (groups[k] || (groups[k] = [])).push(a) }
  const keys = Object.keys(groups).sort((x, y) => {
    if (x === currentProjectId.value) return -1; if (y === currentProjectId.value) return 1
    if (x === '__none__') return 1; if (y === '__none__') return -1
    return groups[y].length - groups[x].length
  })
  return keys.map(k => ({
    id: k,
    name: k === '__none__' ? '未分类' : (projectNames.value[k] || '其它项目'),
    assets: groups[k],
    isCurrent: k === currentProjectId.value,
  }))
})
const collapsed = ref<Record<string, boolean>>({})
const isCollapsed = (id: string) => id in collapsed.value ? collapsed.value[id] : false
const toggleGroup = (id: string) => { collapsed.value = { ...collapsed.value, [id]: !isCollapsed(id) } }

const preview = ref<GeneratedAsset | null>(null)
const openPreview = (asset: GeneratedAsset) => {
  preview.value = asset
}

const confirmDelete = (asset: GeneratedAsset) => {
  if (window.confirm(`确定从历史中删除这条 ${asset.type === 'image' ? '图片' : '视频'}？`)) {
    assetStore.removeAsset(asset.id)
  }
}

// 下载资产到本地（图片/视频通用）
const downloadAsset = async (asset: GeneratedAsset) => {
  try {
    const res = await fetch(asset.url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const mime = blob.type || (asset.type === 'image' ? 'image/png' : 'video/mp4')
    const ext = (mime.split('/')[1] || (asset.type === 'image' ? 'png' : 'mp4')).split(';')[0]
    const d = new Date(asset.createdAt)
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `${asset.type}_${stamp}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch (err) {
    console.error('下载失败', err)
    window.alert('下载失败：' + (err instanceof Error ? err.message : String(err)))
  }
}

const confirmClearAll = () => {
  if (window.confirm(`确定清空全部 ${assetStore.assets.length} 条历史？此操作不可撤销。`)) {
    assetStore.clearAll()
  }
}

const formatTime = (ts: number) => {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (sameDay) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.asset-library {
  width: 100%;
  height: 100%;
  background: #020308;
  overflow-y: auto;
}

.library-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}

.library-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.library-header h2 {
  font-size: 24px;
  color: #00D9FF;
  font-weight: 300;
  margin: 0;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.count-tag {
  font-size: 12px;
  color: #888;
  padding: 4px 10px;
  border: 1px solid rgba(0, 217, 255, 0.2);
  border-radius: 10px;
  background: rgba(0, 217, 255, 0.05);
}
.btn-danger-text {
  background: transparent;
  border: 1px solid rgba(255, 68, 68, 0.4);
  color: #ff8a8a;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-danger-text:hover {
  background: rgba(255, 68, 68, 0.15);
  border-color: #ff4444;
}

.filter-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0, 217, 255, 0.2);
}
.filter-tab {
  background: transparent;
  border: 1px solid transparent;
  color: #888;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}
.filter-tab:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.04);
}
.filter-tab.active {
  color: #00D9FF;
  border-color: #00D9FF;
  background: rgba(0, 217, 255, 0.08);
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  border: 1px dashed rgba(0, 217, 255, 0.3);
  border-radius: 12px;
  background: rgba(0, 217, 255, 0.02);
}
.empty-icon {
  font-size: 56px;
  margin-bottom: 16px;
  opacity: 0.7;
}
.empty-text {
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
  margin: 0 0 8px;
}
.empty-hint {
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
  margin: 0;
}

.asset-groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.lib-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 12px;
  transition: background 0.2s;
}
.lib-group-header:hover { background: rgba(0, 217, 255, 0.08); }
.lib-group-header.current { background: rgba(0, 217, 255, 0.12); }
.lib-caret { font-size: 11px; color: rgba(0, 217, 255, 0.7); width: 12px; flex-shrink: 0; }
.lib-group-name { flex: 1; font-size: 14px; color: #cfe9f5; }
.lib-group-header.current .lib-group-name { color: #00D9FF; font-weight: 500; }
.lib-group-count { font-size: 12px; color: rgba(255, 255, 255, 0.4); background: rgba(255, 255, 255, 0.06); border-radius: 10px; padding: 2px 10px; }

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.asset-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}
.asset-card:hover {
  border-color: rgba(0, 217, 255, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 217, 255, 0.15);
}
.asset-media {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: linear-gradient(135deg, rgba(0, 217, 255, 0.05), rgba(180, 50, 255, 0.05));
  overflow: hidden;
}
.asset-media img,
.asset-media video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.type-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  backdrop-filter: blur(6px);
}
.type-badge.image {
  background: rgba(180, 50, 255, 0.25);
  color: #B432FF;
}
.type-badge.video {
  background: rgba(0, 217, 255, 0.25);
  color: #00D9FF;
}
.asset-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;
}
.asset-card:hover .asset-delete {
  opacity: 1;
}
.asset-delete:hover {
  background: #ff4444;
  border-color: #ff4444;
}
.asset-meta {
  padding: 10px 12px;
}
.asset-prompt {
  font-size: 13px;
  color: #ffffff;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  min-height: 36px;
}
.asset-info {
  display: flex;
  gap: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 预览弹窗 */
.preview-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.92);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 24px;
}
.preview-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.preview-close {
  position: absolute;
  top: -52px;
  right: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 217, 255, 0.2);
  border: 1px solid #00D9FF;
  color: #00D9FF;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.preview-close:hover {
  background: rgba(0, 217, 255, 0.4);
  transform: rotate(90deg);
}
.preview-toolbar {
  position: absolute;
  top: -52px;
  right: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 10;
}
.preview-toolbar .preview-close {
  position: static;
}
.preview-download {
  height: 40px;
  padding: 0 16px;
  background: rgba(0, 217, 255, 0.2);
  border: 1px solid #00D9FF;
  border-radius: 20px;
  color: #00D9FF;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.preview-download:hover {
  background: rgba(0, 217, 255, 0.4);
  box-shadow: 0 0 12px rgba(0, 217, 255, 0.4);
}
.preview-media {
  max-width: 90vw;
  max-height: 75vh;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 217, 255, 0.3);
  display: block;
}
.preview-info {
  background: rgba(2, 3, 8, 0.85);
  border: 1px solid rgba(0, 217, 255, 0.2);
  border-radius: 8px;
  padding: 12px 16px;
}
.preview-prompt {
  color: #fff;
  font-size: 14px;
  margin-bottom: 6px;
  word-break: break-word;
}
.preview-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
