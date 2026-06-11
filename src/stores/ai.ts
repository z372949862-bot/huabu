import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { SeedanceProvider } from '@/services/providers/seedance'
import { ChuhaiyingVideoProvider } from '@/services/providers/chuhaiyingVideo'
import { GeekNowImageProvider, type ImageProvider } from '@/services/providers/geeknow'
import { ChuhaiyingImageProvider } from '@/services/providers/chuhaiying'
import type { AIProvider } from '@/services/ai-provider'
import {
  getModelTemplatesByKind,
  type ModelTemplate,
  type VideoProviderKind,
} from '@/services/modelTemplates'
import {
  getImageTemplatesByKind,
  type ImageModelTemplate,
  type ImageProviderKind,
} from '@/services/imageModelTemplates'
import type { VideoModelCapabilities } from '@/services/videoModelService'

export type ProviderStatus = 'connected' | 'disconnected' | 'error' | 'unconfigured'
export type ProviderType = 'video' | 'image'
/** kind 在 video / image 各自命名空间里独立判断（'chuhaiying' 在两类里都有，靠 type 区分）。 */
export type ProviderKind = ImageProviderKind | VideoProviderKind

export interface ProviderModel {
  id: string
  name?: string
  description?: string
  capabilities: VideoModelCapabilities
  // 图片模型才有的元信息（GeekNow / Chuhaiying 内部分流用）
  endpointStyle?: 'openai' | 'gemini'
  supportsReferenceImage?: boolean
  supportsImageSize2K?: boolean
  asyncEndpoint?: boolean
}

export interface Provider {
  id: string
  name: string
  type: ProviderType
  /** image: 'geeknow' | 'chuhaiying'；video: 'seedance' | 'chuhaiying'。老数据可能没有，按 type 兜底。 */
  kind?: ProviderKind
  baseUrl: string
  apiKey: string
  models: ProviderModel[]
  status: ProviderStatus
  error?: string
}

interface PersistShape {
  providers: Provider[]
  defaultProviderId: string | null
  defaultImageProviderId?: string | null
  migrationVersion: number
}

const STORE_KEY = 'aiProviders'
const LEGACY_KEY = 'apiKey.seedance'
const DEFAULT_BASE_URL = 'https://api.aiid.edu.kg'
const IMAGE_DEFAULT_BASE_URL: Record<ImageProviderKind, string> = {
  geeknow: 'https://api.geeknow.ai',
  chuhaiying: 'https://api.aiid.edu.kg',
}
const VIDEO_DEFAULT_BASE_URL: Record<VideoProviderKind, string> = {
  seedance: 'https://api.aiid.edu.kg',
  chuhaiying: 'https://api.aiid.edu.kg',
}
const CURRENT_MIGRATION = 3

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
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function templateToModel(t: ModelTemplate): ProviderModel {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    capabilities: { ...t.capabilities },
  }
}

function imageTemplateToModel(t: ImageModelTemplate): ProviderModel {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    capabilities: { ...t.capabilities },
    endpointStyle: t.endpointStyle,
    supportsReferenceImage: t.supportsReferenceImage,
    supportsImageSize2K: t.supportsImageSize2K,
    asyncEndpoint: t.asyncEndpoint,
  }
}

function defaultVideoModelSet(kind: VideoProviderKind): ProviderModel[] {
  return getModelTemplatesByKind(kind).map(templateToModel)
}

function defaultImageModelSet(kind: ImageProviderKind): ProviderModel[] {
  return getImageTemplatesByKind(kind).map(imageTemplateToModel)
}

/** 把存档里宽松的 kind 收窄成 image kind（未知 / undefined → 'geeknow'）。 */
function imageKindOf(conf: Provider): ImageProviderKind {
  return conf.kind === 'chuhaiying' ? 'chuhaiying' : 'geeknow'
}

/** 把存档里宽松的 kind 收窄成 video kind（未知 / undefined → 'seedance'）。 */
function videoKindOf(conf: Provider): VideoProviderKind {
  return conf.kind === 'chuhaiying' ? 'chuhaiying' : 'seedance'
}

export const useAIStore = defineStore('ai', () => {
  const providers = ref<Provider[]>([])
  const defaultProviderId = ref<string | null>(null)
  const defaultImageProviderId = ref<string | null>(null)
  const migrationVersion = ref(0)
  const initialized = ref(false)

  // Provider 实例缓存：按 id 懒构建。改 baseUrl/apiKey 时立即清掉对应实例。
  // video → SeedanceProvider | ChuhaiyingVideoProvider；image → GeekNowImageProvider | ChuhaiyingImageProvider
  const videoCache = new Map<string, AIProvider>()
  const imageCache = new Map<string, ImageProvider>()

  const configuredProviders = computed(() =>
    providers.value.filter((p) => p.apiKey)
  )

  const connectedProviders = computed(() =>
    providers.value.filter((p) => p.status === 'connected')
  )

  const videoProviders = computed(() =>
    providers.value.filter((p) => (p.type ?? 'video') === 'video')
  )

  const imageProviders = computed(() =>
    providers.value.filter((p) => p.type === 'image')
  )

  function getProviderConfig(id: string | null | undefined): Provider | undefined {
    if (!id) return undefined
    return providers.value.find((p) => p.id === id)
  }

  function getProvider(id: string): AIProvider | null {
    const conf = getProviderConfig(id)
    if (!conf || conf.type !== 'video') return null
    let inst = videoCache.get(id)
    if (!inst) {
      const kind = videoKindOf(conf)
      inst = kind === 'chuhaiying'
        ? new ChuhaiyingVideoProvider(conf.apiKey, conf.baseUrl)
        : new SeedanceProvider(conf.apiKey, conf.baseUrl)
      videoCache.set(id, inst)
    } else {
      inst.setApiKey(conf.apiKey)
      inst.setBaseUrl(conf.baseUrl)
    }
    return inst
  }

  function getImageProvider(id: string): ImageProvider | null {
    const conf = getProviderConfig(id)
    if (!conf || conf.type !== 'image') return null
    let inst = imageCache.get(id)
    if (!inst) {
      const kind = imageKindOf(conf)
      inst = kind === 'chuhaiying'
        ? new ChuhaiyingImageProvider(conf.apiKey, conf.baseUrl)
        : new GeekNowImageProvider(conf.apiKey, conf.baseUrl)
      imageCache.set(id, inst)
    } else {
      inst.setApiKey(conf.apiKey)
      inst.setBaseUrl(conf.baseUrl)
    }
    return inst
  }

  function invalidateInstance(id: string) {
    videoCache.delete(id)
    imageCache.delete(id)
  }

  // ---------- CRUD ----------

  function addProvider(input: {
    name: string
    type?: ProviderType
    kind?: ProviderKind
    baseUrl?: string
    apiKey?: string
    models?: ProviderModel[]
  }): string {
    const id = uid()
    const type: ProviderType = input.type || 'video'

    let kind: ProviderKind | undefined
    let defaultBase: string
    let defaultModels: ProviderModel[]
    let defaultName: string

    if (type === 'image') {
      const imgKind: ImageProviderKind =
        (input.kind === 'chuhaiying' || input.kind === 'geeknow')
          ? input.kind
          : 'geeknow'
      kind = imgKind
      defaultBase = IMAGE_DEFAULT_BASE_URL[imgKind]
      defaultModels = defaultImageModelSet(imgKind)
      defaultName = imgKind === 'chuhaiying' ? '出海营' : 'GeekNow'
    } else {
      const vidKind: VideoProviderKind =
        (input.kind === 'chuhaiying' || input.kind === 'seedance')
          ? input.kind
          : 'seedance'
      kind = vidKind
      defaultBase = VIDEO_DEFAULT_BASE_URL[vidKind]
      defaultModels = defaultVideoModelSet(vidKind)
      defaultName = vidKind === 'chuhaiying' ? '出海营视频' : 'Seedance'
    }

    providers.value.push({
      id,
      name: input.name || defaultName,
      type,
      kind,
      baseUrl: input.baseUrl || defaultBase,
      apiKey: input.apiKey || '',
      models: input.models?.length ? input.models : defaultModels,
      status: input.apiKey ? 'connected' : 'unconfigured',
    })
    if (type === 'video' && !defaultProviderId.value) defaultProviderId.value = id
    if (type === 'image' && !defaultImageProviderId.value) defaultImageProviderId.value = id
    persist()
    return id
  }

  function updateProvider(id: string, patch: Partial<Omit<Provider, 'id'>>) {
    const p = getProviderConfig(id)
    if (!p) return
    if (patch.name !== undefined) p.name = patch.name
    if (patch.type !== undefined) p.type = patch.type
    if (patch.baseUrl !== undefined) p.baseUrl = patch.baseUrl
    if (patch.apiKey !== undefined) {
      p.apiKey = patch.apiKey
      p.status = patch.apiKey ? (p.status === 'error' ? 'connected' : p.status) : 'unconfigured'
    }
    if (patch.models !== undefined) p.models = patch.models
    if (patch.status !== undefined) p.status = patch.status
    if (patch.error !== undefined) p.error = patch.error
    invalidateInstance(id)
    persist()
  }

  function deleteProvider(id: string) {
    const idx = providers.value.findIndex((p) => p.id === id)
    if (idx < 0) return
    const removed = providers.value[idx]
    providers.value.splice(idx, 1)
    invalidateInstance(id)
    if (defaultProviderId.value === id) {
      defaultProviderId.value = providers.value.find((p) => (p.type ?? 'video') === 'video')?.id ?? null
    }
    if (defaultImageProviderId.value === id) {
      defaultImageProviderId.value = providers.value.find((p) => p.type === 'image')?.id ?? null
    }
    void removed
    persist()
  }

  function setDefaultProvider(id: string) {
    const p = getProviderConfig(id)
    if (!p) return
    if (p.type === 'image') {
      defaultImageProviderId.value = id
    } else {
      defaultProviderId.value = id
    }
    persist()
  }

  function addModel(providerId: string, modelId: string, override?: Partial<ProviderModel>) {
    const p = getProviderConfig(providerId)
    if (!p) return
    if (p.models.find((m) => m.id === modelId)) return
    if (p.type === 'image') {
      const kind = imageKindOf(p)
      const tpl = getImageTemplatesByKind(kind).find((t) => t.id === modelId)
      const model: ProviderModel = tpl
        ? { ...imageTemplateToModel(tpl), ...override }
        : {
            id: modelId,
            name: override?.name || modelId,
            description: override?.description,
            capabilities: override?.capabilities || { ratios: ['1:1', '16:9', '9:16'] },
            endpointStyle: override?.endpointStyle || 'openai',
            supportsReferenceImage: override?.supportsReferenceImage ?? true,
          }
      p.models.push(model)
    } else {
      const kind = videoKindOf(p)
      const tpl = getModelTemplatesByKind(kind).find((t) => t.id === modelId)
      const model: ProviderModel = tpl
        ? { ...templateToModel(tpl), ...override }
        : {
            id: modelId,
            name: override?.name || modelId,
            description: override?.description,
            capabilities: override?.capabilities || {
              ratios: ['16:9', '9:16', '1:1'],
              resolutions: ['480p', '720p'],
              durationRange: { min: 4, max: 10 },
              audioGeneration: false,
            },
          }
      p.models.push(model)
    }
    persist()
  }

  function removeModel(providerId: string, modelId: string) {
    const p = getProviderConfig(providerId)
    if (!p) return
    p.models = p.models.filter((m) => m.id !== modelId)
    persist()
  }

  async function testProviderConnection(id: string): Promise<{ ok: boolean; error?: string }> {
    const p = getProviderConfig(id)
    if (!p) return { ok: false, error: '中转站不存在' }
    if (!p.apiKey) {
      updateProvider(id, { status: 'unconfigured', error: undefined })
      return { ok: false, error: '未配置 API Key' }
    }
    const inst: { testAuth: (k: string) => Promise<{ success: boolean; error?: string }> } | null =
      p.type === 'image' ? getImageProvider(id) : getProvider(id)
    if (!inst) return { ok: false, error: '初始化 provider 失败' }
    try {
      const result = await inst.testAuth(p.apiKey)
      if (result.success) {
        updateProvider(id, { status: 'connected', error: undefined })
        return { ok: true }
      }
      updateProvider(id, { status: 'error', error: result.error || '连接失败' })
      return { ok: false, error: result.error || '连接失败' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      updateProvider(id, { status: 'error', error: msg })
      return { ok: false, error: msg }
    }
  }

  // ---------- 持久化 ----------

  let persistDebounce: number | null = null
  function persist() {
    if (persistDebounce) clearTimeout(persistDebounce)
    persistDebounce = window.setTimeout(async () => {
      const electronStore = window.electronAPI?.store
      if (!electronStore) return
      try {
        const payload: PersistShape = {
          providers: providers.value,
          defaultProviderId: defaultProviderId.value,
          defaultImageProviderId: defaultImageProviderId.value,
          migrationVersion: migrationVersion.value,
        }
        await electronStore.set(STORE_KEY, JSON.stringify(payload))
      } catch (err) {
        console.warn('persist providers failed:', err)
      }
    }, 200)
  }

  async function init() {
    if (initialized.value) return
    initialized.value = true
    const electronStore = window.electronAPI?.store
    if (!electronStore) {
      // 浏览器开发环境兜底：建一个空默认中转站
      if (providers.value.length === 0) {
        addProvider({ name: '默认中转站', type: 'video', baseUrl: DEFAULT_BASE_URL })
        migrationVersion.value = CURRENT_MIGRATION
      }
      return
    }

    // 1) 读新格式
    try {
      const raw = await electronStore.get(STORE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as PersistShape
        const list = parsed.providers || []
        // 老数据可能没有 type / kind 字段：默认 video=seedance, image=geeknow
        providers.value = list.map((p) => {
          const type: ProviderType = (p as any).type || 'video'
          const kind = type === 'image'
            ? ((p as any).kind || 'geeknow')
            : ((p as any).kind || 'seedance')
          return { ...p, type, kind }
        })
        defaultProviderId.value =
          parsed.defaultProviderId
          ?? providers.value.find((p) => p.type === 'video')?.id
          ?? null
        defaultImageProviderId.value =
          parsed.defaultImageProviderId
          ?? providers.value.find((p) => p.type === 'image')?.id
          ?? null
        migrationVersion.value = parsed.migrationVersion ?? 0
      }
    } catch (err) {
      console.warn('load providers failed:', err)
    }

    // 2) 迁移：旧 apiKey.seedance → 默认视频中转站
    if (migrationVersion.value < 1 && providers.value.length === 0) {
      let legacyKey = ''
      try {
        legacyKey = (await electronStore.get(LEGACY_KEY)) || ''
      } catch {
        legacyKey = ''
      }
      addProvider({
        name: '默认中转站',
        type: 'video',
        baseUrl: DEFAULT_BASE_URL,
        apiKey: legacyKey,
      })
    }

    // 3) 迁移：Seedance 2.0 时长上限 10 → 15，GPT Image 2K/4K 参考图支持
    if (migrationVersion.value < 3) {
      for (const p of providers.value) {
        for (const m of p.models) {
          if (m.id === 'doubao-seedance-2-0-260128' && m.capabilities?.durationRange?.max < 15) {
            m.capabilities.durationRange.max = 15
          }
          // GPT Image 2-2K / 2-4K 参考图
          if ((m.id === 'gpt-image-2-2k' || m.id === 'gpt-image-2-4k') && (m as any).supportsReferenceImage === false) {
            (m as any).supportsReferenceImage = true
          }
        }
      }
    }

    if (migrationVersion.value < CURRENT_MIGRATION) {
      migrationVersion.value = CURRENT_MIGRATION
      persist()
    }
  }

  return {
    providers,
    defaultProviderId,
    defaultImageProviderId,
    videoProviders,
    imageProviders,
    configuredProviders,
    connectedProviders,
    getProviderConfig,
    getProvider,
    getImageProvider,
    addProvider,
    updateProvider,
    deleteProvider,
    setDefaultProvider,
    addModel,
    removeModel,
    testProviderConnection,
    init,
  }
})
