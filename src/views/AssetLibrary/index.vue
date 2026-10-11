<template>
  <div class="asset-library">
    <div class="library-container">
      <div class="library-header">
        <div>
          <div class="library-kicker">MEDIA LIBRARY</div>
          <h2>素材库</h2>
          <p class="library-subtitle">集中管理你导入到画布的图片、视频和音频</p>
        </div>
        <div class="header-actions">
          <span class="count-tag">{{ filteredMaterials.length }} 条素材</span>
          <button class="import-button" @click="openImporter">＋ 导入素材</button>
          <button v-if="materialStore.materials.length" class="btn-danger-text" @click="confirmClearAll">清空</button>
          <input ref="fileInputRef" type="file" accept="image/*,video/*,audio/*" multiple hidden @change="handleImport" />
        </div>
      </div>

      <div v-if="materialStore.materials.length === 0" class="asset-empty-shell">
        <div class="asset-empty-icon">◇</div>
        <p class="empty-text">素材库还是空的</p>
        <p class="empty-hint">导入图片、视频或音频后，它们会保存在这里，随时可以用于画布创作</p>
        <button class="import-button empty-import" @click="openImporter">导入第一份素材</button>
      </div>

      <div v-else class="asset-browser">
        <aside class="asset-project-sidebar" aria-label="素材类型筛选">
          <div class="asset-sidebar-label">素材视图</div>
          <button class="asset-project-item" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">
            <span class="asset-project-icon all">◇</span>
            <span class="asset-project-name">全部素材</span>
            <span class="asset-project-count">{{ materialStore.materials.length }}</span>
          </button>
          <div class="asset-sidebar-divider"></div>
          <div class="asset-sidebar-label">类型</div>
          <button v-for="tab in tabs" :key="tab.value" class="asset-project-item" :class="{ active: activeFilter === tab.value }" @click="activeFilter = tab.value">
            <span class="asset-project-icon" :class="tab.value"></span>
            <span class="asset-project-name">{{ tab.label }}</span>
            <span class="asset-project-count">{{ tab.count }}</span>
          </button>
        </aside>

        <section class="asset-browser-main">
          <div class="asset-browser-heading">
            <div>
              <div class="asset-browser-kicker">我的素材</div>
              <h3 class="asset-browser-title">{{ activeFilter === 'all' ? '全部素材' : tabs.find(tab => tab.value === activeFilter)?.label }}</h3>
              <p class="asset-browser-subtitle">素材来源于画布导入、节点上传或这里的手动导入</p>
            </div>
            <span class="asset-browser-count">{{ filteredMaterials.length }} 条</span>
          </div>

          <div v-if="filteredMaterials.length" class="asset-grid">
            <div v-for="material in filteredMaterials" :key="material.id" class="asset-card" @click="openPreview(material)">
              <div class="asset-media" :class="`media-${material.type}`">
                <img v-if="material.type === 'image'" :src="material.url" :alt="material.name" />
                <video v-else-if="material.type === 'video'" :src="material.url" preload="metadata" muted />
                <div v-else class="audio-placeholder"><span>♪</span></div>
                <span class="type-badge" :class="material.type">{{ typeLabel(material.type) }}</span>
                <button class="asset-delete" title="删除素材" @click.stop="confirmDelete(material)">
                  <svg viewBox="0 0 16 16" width="10" height="10" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
                </button>
              </div>
              <div class="asset-meta">
                <div class="asset-name" :title="material.name">{{ material.name }}</div>
                <div class="asset-info"><span>{{ typeLabel(material.type) }}</span><span>·</span><span>{{ formatTime(material.createdAt) }}</span></div>
              </div>
            </div>
          </div>
          <div v-else class="asset-browser-empty">
            <div class="asset-browser-empty-icon">◇</div>
            <p>还没有{{ tabs.find(tab => tab.value === activeFilter)?.label || '素材' }}</p>
            <span>点击右上角“导入素材”添加文件</span>
          </div>
        </section>
      </div>
    </div>

    <Transition name="modal">
      <div v-if="preview" class="preview-modal" @click="preview = null">
        <div class="preview-content" @click.stop>
          <div class="preview-toolbar">
            <button class="preview-download" @click="downloadMaterial(preview)">下载</button>
            <button class="preview-close" aria-label="关闭预览" @click="preview = null">×</button>
          </div>
          <img v-if="preview.type === 'image'" :src="preview.url" class="preview-media" />
          <video v-else-if="preview.type === 'video'" :src="preview.url" controls autoplay class="preview-media" />
          <audio v-else :src="preview.url" controls autoplay class="preview-audio" />
          <div class="preview-info">
            <div class="preview-prompt">{{ preview.name }}</div>
            <div class="preview-meta"><span>{{ typeLabel(preview.type) }}</span><span>·</span><span>{{ formatTime(preview.createdAt) }}</span></div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMaterialStore, type MaterialAsset, type MaterialType } from '@/stores/material'

const materialStore = useMaterialStore()
const fileInputRef = ref<HTMLInputElement>()
type Filter = 'all' | MaterialType
const activeFilter = ref<Filter>('all')
const preview = ref<MaterialAsset | null>(null)

const tabs = computed(() => [
  { label: '图片', value: 'image' as const, count: materialStore.images.length },
  { label: '视频', value: 'video' as const, count: materialStore.videos.length },
  { label: '音频', value: 'audio' as const, count: materialStore.audios.length },
])
const filteredMaterials = computed(() => {
  if (activeFilter.value === 'all') return materialStore.sortedMaterials
  return materialStore.sortedMaterials.filter((item) => item.type === activeFilter.value)
})

const typeLabel = (type: MaterialType) => ({ image: '图片', video: '视频', audio: '音频' })[type]
const openImporter = () => fileInputRef.value?.click()
const inferType = (file: File): MaterialType | null => {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return null
}
const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})
const saveFile = async (file: File) => {
  const dataUrl = await readDataUrl(file)
  let url = dataUrl
  let localPath: string | undefined
  const base64 = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : ''
  if (base64 && window.electronAPI?.upload?.save) {
    try {
      const savedPath = await window.electronAPI.upload.save(base64, file.name)
      if (savedPath) {
        localPath = savedPath
        url = 'local-upload:///' + savedPath.replace(/\\/g, '/')
      }
    } catch { /* 保留 data URL，确保浏览器预览不受影响 */ }
  }
  return { url, localPath }
}
const handleImport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  for (const file of files) {
    const type = inferType(file)
    if (!type) continue
    try {
      const saved = await saveFile(file)
      materialStore.addMaterial({ type, name: file.name, url: saved.url, localPath: saved.localPath })
    } catch (error) {
      console.warn('import material failed:', file.name, error)
    }
  }
}
const openPreview = (material: MaterialAsset) => { preview.value = material }
const confirmDelete = (material: MaterialAsset) => {
  if (!window.confirm(`确定删除素材“${material.name}”？`)) return
  if (material.localPath) void window.electronAPI?.upload?.delete(material.localPath)
  materialStore.removeMaterial(material.id)
}
const confirmClearAll = () => {
  if (!window.confirm(`确定清空全部 ${materialStore.materials.length} 个素材？`)) return
  for (const material of materialStore.materials) {
    if (material.localPath) void window.electronAPI?.upload?.delete(material.localPath)
  }
  materialStore.clearAll()
}
const downloadMaterial = async (material: MaterialAsset) => {
  try {
    const response = await fetch(material.url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const objectUrl = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = material.name || `${material.type}-${material.id}`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch (error) {
    window.alert('下载失败：' + (error instanceof Error ? error.message : String(error)))
  }
}
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
</script>

<style scoped>
.asset-library { width: 100%; height: 100%; overflow-y: auto; background: #111214; color: #f1f1f1; }
.library-container { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
.library-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
.library-kicker, .asset-browser-kicker, .asset-sidebar-label { color: rgba(255,255,255,.38); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.library-header h2 { margin: 4px 0 5px; font-size: 26px; font-weight: 500; }
.library-subtitle { margin: 0; color: rgba(255,255,255,.44); font-size: 13px; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.count-tag, .asset-browser-count { color: rgba(255,255,255,.58); font-size: 12px; }
.import-button { border: 1px solid rgba(255,255,255,.28); border-radius: 8px; padding: 9px 14px; color: #fff; background: rgba(255,255,255,.12); cursor: pointer; font: inherit; }
.import-button:hover { background: rgba(255,255,255,.20); }
.btn-danger-text { border: 1px solid rgba(255,120,120,.34); border-radius: 7px; padding: 8px 10px; color: #ffaaaa; background: transparent; cursor: pointer; font-size: 12px; }
.btn-danger-text:hover { background: rgba(255,80,80,.12); }
.asset-browser { display: grid; grid-template-columns: 220px minmax(0,1fr); gap: 24px; align-items: start; }
.asset-project-sidebar { position: sticky; top: 24px; padding: 14px 10px; border: 1px solid rgba(255,255,255,.10); border-radius: 14px; background: rgba(255,255,255,.035); }
.asset-sidebar-label { padding: 4px 10px 8px; }
.asset-sidebar-divider { height: 1px; margin: 12px 10px; background: rgba(255,255,255,.08); }
.asset-project-item { width: 100%; display: flex; align-items: center; gap: 9px; min-height: 38px; padding: 8px 10px; border: 1px solid transparent; border-radius: 8px; color: rgba(255,255,255,.62); background: transparent; text-align: left; cursor: pointer; font: inherit; }
.asset-project-item:hover { color: #fff; background: rgba(255,255,255,.07); }
.asset-project-item.active { color: #fff; border-color: rgba(255,255,255,.16); background: rgba(255,255,255,.12); }
.asset-project-icon { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: rgba(255,255,255,.30); }
.asset-project-icon.all { width: 18px; height: 18px; flex-basis: 18px; display: grid; place-items: center; border-radius: 5px; color: rgba(255,255,255,.72); background: rgba(255,255,255,.10); font-size: 13px; }
.asset-project-icon.image { background: #b9a6e8; }
.asset-project-icon.video { background: #d8d8d8; }
.asset-project-icon.audio { background: #b7c9b8; }
.asset-project-name { flex: 1; min-width: 0; font-size: 13px; }
.asset-project-count { min-width: 22px; padding: 2px 6px; border-radius: 10px; color: rgba(255,255,255,.44); background: rgba(255,255,255,.06); font-size: 11px; text-align: center; }
.asset-browser-main { min-width: 0; }
.asset-browser-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.asset-browser-title { margin: 4px 0 3px; color: rgba(255,255,255,.92); font-size: 20px; font-weight: 500; }
.asset-browser-subtitle { margin: 0; color: rgba(255,255,255,.42); font-size: 12px; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px,1fr)); gap: 16px; }
.asset-card { overflow: hidden; border: 1px solid rgba(255,255,255,.08); border-radius: 10px; background: rgba(255,255,255,.035); cursor: pointer; transition: transform .2s, border-color .2s, box-shadow .2s; }
.asset-card:hover { border-color: rgba(255,255,255,.28); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.28); }
.asset-media { position: relative; width: 100%; aspect-ratio: 4/3; overflow: hidden; background: #222326; }
.asset-media img, .asset-media video { width: 100%; height: 100%; display: block; object-fit: cover; }
.audio-placeholder { width: 100%; height: 100%; display: grid; place-items: center; color: rgba(255,255,255,.76); background: radial-gradient(circle at center, #36383a, #1d1e20); font-size: 52px; }
.type-badge { position: absolute; top: 8px; left: 8px; padding: 3px 8px; border-radius: 4px; color: rgba(255,255,255,.86); background: rgba(0,0,0,.48); font-size: 11px; backdrop-filter: blur(6px); }
.asset-delete { position: absolute; top: 7px; right: 7px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; padding: 0; border: 1px solid rgba(255,255,255,.20); border-radius: 50%; color: #fff; background: rgba(0,0,0,.72); opacity: 0; cursor: pointer; }
.asset-card:hover .asset-delete { opacity: 1; }
.asset-delete:hover { border-color: #ff7676; background: #ba4242; }
.asset-meta { padding: 10px 12px; }
.asset-name { overflow: hidden; margin-bottom: 6px; color: #fff; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.asset-info, .preview-meta { display: flex; gap: 5px; color: rgba(255,255,255,.42); font-size: 11px; }
.asset-empty-shell, .asset-browser-empty { min-height: 340px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,.16); border-radius: 14px; background: rgba(255,255,255,.02); text-align: center; }
.asset-empty-icon, .asset-browser-empty-icon { margin-bottom: 10px; color: rgba(255,255,255,.34); font-size: 38px; }
.empty-text, .asset-browser-empty p { margin: 0 0 8px; color: rgba(255,255,255,.74); font-size: 15px; }
.empty-hint, .asset-browser-empty span { max-width: 360px; margin: 0 0 16px; color: rgba(255,255,255,.40); font-size: 12px; }
.empty-import { margin-top: 8px; }
.preview-modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0,0,0,.88); backdrop-filter: blur(8px); }
.preview-content { position: relative; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; gap: 14px; }
.preview-toolbar { position: absolute; top: -52px; right: 0; display: flex; gap: 10px; z-index: 2; }
.preview-download, .preview-close { height: 40px; border: 1px solid rgba(255,255,255,.26); border-radius: 20px; color: rgba(255,255,255,.92); background: rgba(255,255,255,.10); cursor: pointer; }
.preview-download { padding: 0 16px; }
.preview-close { width: 40px; font-size: 24px; line-height: 1; }
.preview-download:hover, .preview-close:hover { background: rgba(255,255,255,.20); }
.preview-media { max-width: 90vw; max-height: 75vh; display: block; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,.44); }
.preview-audio { width: min(520px, 80vw); }
.preview-info { padding: 12px 16px; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: rgba(28,29,31,.94); }
.preview-prompt { margin-bottom: 6px; color: #fff; font-size: 14px; word-break: break-word; }
.modal-enter-active, .modal-leave-active { transition: opacity .2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
@media (max-width: 760px) {
  .library-container { padding: 24px 16px; }
  .library-header { align-items: flex-start; flex-direction: column; }
  .header-actions { width: 100%; flex-wrap: wrap; }
  .asset-browser { grid-template-columns: 1fr; gap: 16px; }
  .asset-project-sidebar { position: static; display: flex; align-items: center; gap: 6px; overflow-x: auto; padding: 8px; }
  .asset-sidebar-label, .asset-sidebar-divider { display: none; }
  .asset-project-item { width: auto; min-width: max-content; }
  .asset-project-count { display: none; }
  .asset-grid { grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 12px; }
}
</style>
