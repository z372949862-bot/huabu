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
    const asset: GeneratedAsset = {
      ...input,
      id: uid(),
      createdAt: Date.now(),
    }
    assets.value.push(asset)
    // LRU 上限：超过就把最旧的扔掉
    if (assets.value.length > MAX_ASSETS) {
      assets.value.sort((a, b) => a.createdAt - b.createdAt)
      assets.value.splice(0, assets.value.length - MAX_ASSETS)
    }
    persist()
    return asset
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
  }

  return {
    assets,
    sortedAssets,
    images,
    videos,
    assetsForNode,
    addAsset,
    removeAsset,
    toggleFavorite,
    clearAll,
    init,
  }
})
