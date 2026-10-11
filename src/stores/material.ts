/**
 * 用户素材库：只保存用户导入/保存的图片、视频和音频素材。
 * 生成结果由 assetStore 单独负责，避免素材库和生成历史混在一起。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type MaterialType = 'image' | 'video' | 'audio'

export interface MaterialAsset {
  id: string
  type: MaterialType
  url: string
  name: string
  localPath?: string
  width?: number
  height?: number
  duration?: number
  createdAt: number
  updatedAt?: number
}

const STORE_KEY = 'canvasMaterials'
const MAX_MATERIALS = 500

function uid() {
  return `m_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36).slice(-5)}`
}

export const useMaterialStore = defineStore('material', () => {
  const materials = ref<MaterialAsset[]>([])
  const initialized = ref(false)
  const sortedMaterials = computed(() => [...materials.value].sort((a, b) => b.createdAt - a.createdAt))
  const images = computed(() => sortedMaterials.value.filter((item) => item.type === 'image'))
  const videos = computed(() => sortedMaterials.value.filter((item) => item.type === 'video'))
  const audios = computed(() => sortedMaterials.value.filter((item) => item.type === 'audio'))

  function addMaterial(input: Omit<MaterialAsset, 'id' | 'createdAt'> & { id?: string }) {
    const existing = materials.value.find((item) =>
      (input.localPath && item.localPath === input.localPath) ||
      (item.url === input.url && item.name === input.name)
    )
    if (existing) return existing

    const material: MaterialAsset = {
      ...input,
      id: input.id || uid(),
      createdAt: Date.now(),
    }
    materials.value.unshift(material)
    if (materials.value.length > MAX_MATERIALS) materials.value.splice(MAX_MATERIALS)
    persist()
    return material
  }

  function removeMaterial(id: string) {
    materials.value = materials.value.filter((item) => item.id !== id)
    persist()
  }

  function clearAll() {
    materials.value = []
    persist()
  }

  let persistTimer: number | null = null
  async function persistNow() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
    const value = JSON.stringify(materials.value)
    try {
      const store = (window as any).electronAPI?.store
      if (store?.set) {
        await store.set(STORE_KEY, value)
      } else {
        localStorage.setItem(STORE_KEY, value)
      }
    } catch (error) {
      console.warn('persist materials failed:', error)
    }
  }

  function persist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => void persistNow(), 250)
  }

  async function init() {
    if (initialized.value) return
    initialized.value = true
    try {
      const store = (window as any).electronAPI?.store
      const raw = store?.get
        ? await store.get(STORE_KEY)
        : localStorage.getItem(STORE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        materials.value = parsed.filter((item: any) =>
          item && typeof item.id === 'string' && typeof item.url === 'string' &&
          typeof item.name === 'string' && ['image', 'video', 'audio'].includes(item.type)
        )
      }
    } catch (error) {
      console.warn('load materials failed:', error)
    }
  }

  return {
    materials,
    sortedMaterials,
    images,
    videos,
    audios,
    addMaterial,
    removeMaterial,
    clearAll,
    init,
  }
})
