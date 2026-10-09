/**
 * 全局生成资产仓库（生成历史）。
 *
 * 每次节点成功生成图/视频时，往 `assets` 数组里 push 一条。
 *  - 节点内：按 nodeId 过滤显示自己的历史
 *  - 资产库 tab：全量呈现，可筛选可删
 *
 * 持久化到 electron-store；LRU 上限 200 条，避免 base64 数据 URL 把存储撑爆。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type AssetType = 'image' | 'video'

export interface GeneratedAsset {
  id: string
  type: AssetType
  /** 直接可用于 <img> / <video> 的地址，可能是 https URL，也可能是 data:image/...;base64,xxx */
  url: string
  sourceUrl?: string
  localPath?: string
  saveStatus?: 'saving' | 'saved' | 'error'
  saveError?: string
  prompt: string
  model: string
  providerId: string
  providerName: string
  nodeId: string
  nodeType: string
  /** 生成该资产时所属的画布项目 ID（旧数据可能没有，归入"未分类"） */
  projectId?: string
  ratio?: string
  resolution?: string
  duration?: number
  createdAt: number
  /** 收藏状态：true 时 history-strip 内置顶；undefined / false = 普通 */
  favorite?: boolean
}

const STORE_KEY = 'generatedAssets'
const MAX_ASSETS = 200

declare global {
  interface Window {
    electronAPI?: {
      platform?: string
      store?: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
        delete: (key: string) => Promise<void>
      }
    }
  }
}

function uid(): string {
  return 'a_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export const useAssetStore = defineStore('asset', () => {
  const assets = ref<GeneratedAsset[]>([])
  const initialized = ref(false)

  /** 按时间倒序的全部资产（最近的在前） */
  const sortedAssets = computed(() =>
    [...assets.value].sort((a, b) => b.createdAt - a.createdAt)
  )

  const images = computed(() => sortedAssets.value.filter((a) => a.type === 'image'))
  const videos = computed(() => sortedAssets.value.filter((a) => a.type === 'video'))

  function assetsForNode(nodeId: string): GeneratedAsset[] {
    return sortedAssets.value.filter((a) => a.nodeId === nodeId)
  }

  function addAsset(input: Omit<GeneratedAsset, 'id' | 'createdAt'>): GeneratedAsset {
    const duplicate = assets.value.find((asset) => asset.nodeId === input.nodeId && asset.projectId === input.projectId && (asset.url === input.url || asset.sourceUrl === input.url))
    if (duplicate) return duplicate
    const asset: GeneratedAsset = {
      ...input,
      id: uid(),
      createdAt: Date.now(),
    }
    if (asset.type === 'video' && asset.url.startsWith('local-upload:///')) {
      asset.localPath = decodeURIComponent(asset.url.slice('local-upload:///'.length))
      asset.saveStatus = 'saved'
    }
    assets.value.push(asset)
    // LRU 上限：超过就把最旧的扔掉
    if (assets.value.length > MAX_ASSETS) {
      assets.value.sort((a, b) => a.createdAt - b.createdAt)
      assets.value.splice(0, assets.value.length - MAX_ASSETS)
    }
    persist()
    if (asset.type === 'video' && /^https?:\/\//i.test(asset.url) && (window as any).electronAPI?.video?.saveGenerated) {
      void retrySaveVideo(asset.id)
    }
    return asset
  }

  const saving = new Map<string, Promise<void>>()
  function retrySaveVideo(id: string): Promise<void> {
    if (saving.has(id)) return saving.get(id)!
    const asset = assets.value.find(a => a.id === id)
    if (!asset || asset.type !== 'video' || asset.saveStatus === 'saved') return Promise.resolve()
    const sourceUrl = asset.sourceUrl || asset.url
    if (!/^https?:\/\//i.test(sourceUrl)) return Promise.resolve()
    asset.sourceUrl = sourceUrl
    asset.saveStatus = 'saving'
    asset.saveError = undefined
    const job = (async () => {
      await persistNow()
      try {
        const bridge = (window as any).electronAPI?.video?.saveGenerated
        if (!bridge) throw new Error('请在桌面软件中保存视频')
        const result = await bridge({ url: sourceUrl, assetId: id, projectId: asset.projectId })
        if (!result?.ok || !result.path) throw new Error(result?.error || '本地保存失败')
        const target = assets.value.find(a => a.id === id)
        if (!target) return
        target.localPath = result.path
        target.url = 'local-upload:///' + result.path.replace(/\\/g, '/')
        target.saveStatus = 'saved'
        target.saveError = undefined
      } catch (error) {
        const target = assets.value.find(a => a.id === id)
        if (target) {
          target.saveStatus = 'error'
          target.saveError = error instanceof Error ? error.message : '本地保存失败'
        }
      } finally {
        await persistNow()
      }
    })()
    saving.set(id, job)
    void job.finally(() => saving.delete(id))
    return job
  }

  function remoteVideoUrl(url: string): string {
    return assets.value.find(a => a.type === 'video' && a.url === url)?.sourceUrl || url
  }

  function removeAsset(id: string) {
    const idx = assets.value.findIndex((a) => a.id === id)
    if (idx < 0) return
    assets.value.splice(idx, 1)
    persist()
  }

  function toggleFavorite(id: string) {
    const a = assets.value.find((x) => x.id === id)
    if (!a) return
    a.favorite = !a.favorite
    persist()
  }

  function clearAll() {
    assets.value = []
    persist()
  }

  // ---------- 持久化 ----------

  let persistDebounce: number | null = null
  async function persistNow() {
    if (persistDebounce) clearTimeout(persistDebounce)
    persistDebounce = null
    try {
      await window.electronAPI?.store?.set(STORE_KEY, JSON.stringify(assets.value))
    } catch (error) { console.warn('persist assets failed:', error) }
  }
  function persist() {
    if (persistDebounce) clearTimeout(persistDebounce)
    persistDebounce = window.setTimeout(async () => {
      const electronStore = window.electronAPI?.store
      if (!electronStore) return
      try {
        await electronStore.set(STORE_KEY, JSON.stringify(assets.value))
      } catch (err) {
        console.warn('persist assets failed:', err)
      }
    }, 300)
  }

  async function init() {
    if (initialized.value) return
    initialized.value = true
    const electronStore = window.electronAPI?.store
    if (!electronStore) return
    try {
      const raw = await electronStore.get(STORE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          // 简单校验，丢弃明显坏数据
          assets.value = parsed.filter(
            (a: any) => a && typeof a.id === 'string' && typeof a.url === 'string'
          )
        }
      }
    } catch (err) {
      console.warn('load assets failed:', err)
    }
    for (const asset of assets.value) {
      if (asset.saveStatus === 'saving') void retrySaveVideo(asset.id)
    }
  }

  return {
    assets,
    sortedAssets,
    images,
    videos,
    assetsForNode,
    addAsset,
    retrySaveVideo,
    remoteVideoUrl,
    removeAsset,
    toggleFavorite,
    clearAll,
    init,
  }
})
