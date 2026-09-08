import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { SeedanceProvider } from '@/services/providers/seedance'
import { ChuhaiyingVideoProvider } from '@/services/providers/chuhaiyingVideo'
import { UnmauProvider } from '@/services/providers/unmau'
import { Yu25Provider } from '@/services/providers/yu25'
import { GeekNowImageProvider, type ImageProvider } from '@/services/providers/geeknow'
import { ChuhaiyingImageProvider } from '@/services/providers/chuhaiying'
import { OpenAIChatProvider, type LLMProvider } from '@/services/providers/chatProvider'
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
import {
  getChatTemplatesByKind,
  type ChatModelTemplate,
  type TextProviderKind,
} from '@/services/chatModelTemplates'
import type { VideoModelCapabilities } from '@/services/videoModelService'

type RuntimeVideoProvider = SeedanceProvider | ChuhaiyingVideoProvider | UnmauProvider | Yu25Provider

export type ProviderStatus = 'connected' | 'disconnected' | 'error' | 'unconfigured'
export type ProviderType = 'video' | 'image' | 'text'
export type ProviderKind = ImageProviderKind | VideoProviderKind | TextProviderKind

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
  supportsReasoning?: boolean
  /** 上游模型是否真的认 seed 参数；默认 true，false 表示调了也没用，UI 应灰显 */
  supportsSeed?: boolean
  /** 上游模型是否真的认 negative_prompt；默认 true */
  supportsNegativePrompt?: boolean
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
  defaultTextProviderId?: string | null
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
  qiling: 'https://api.qilingze.com',
  unmau: 'https://newapis.unmau.com',
  yu25: 'https://api.yu25.xyz',
}
const CURRENT_MIGRATION = 8

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
    supportsSeed: t.supportsSeed,
    supportsNegativePrompt: t.supportsNegativePrompt,
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
  if (conf.kind === 'chuhaiying') return 'chuhaiying'
  if (conf.kind === 'qiling') return 'qiling'
  if (conf.kind === 'unmau') return 'unmau'
  if (conf.kind === 'yu25') return 'yu25'
  return 'seedance'
}

export const useAIStore = defineStore('ai', () => {
  const providers = ref<Provider[]>([])
  const defaultProviderId = ref<string | null>(null)
  const defaultImageProviderId = ref<string | null>(null)
  const defaultTextProviderId = ref<string | null>(null)
  const migrationVersion = ref(0)
  const initialized = ref(false)

  const videoCache = new Map<string, RuntimeVideoProvider>()
  const imageCache = new Map<string, ImageProvider>()
  const textCache = new Map<string, LLMProvider>()

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

  const textProviders = computed(() =>
    providers.value.filter((p) => p.type === 'text')
  )

  function getProviderConfig(id: string | null | undefined): Provider | undefined {
    if (!id) return undefined
    return providers.value.find((p) => p.id === id)
  }

  function getProvider(id: string): RuntimeVideoProvider | null {
    const conf = getProviderConfig(id)
    if (!conf || conf.type !== 'video') return null
    let inst = videoCache.get(id)
    if (!inst) {
      const kind = videoKindOf(conf)
      inst = kind === 'yu25'
        ? new Yu25Provider(conf.apiKey, conf.baseUrl)
        : kind === 'unmau'
          ? new UnmauProvider(conf.apiKey, conf.baseUrl)
          : (kind === 'chuhaiying' || kind === 'qiling')
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

  function getTextProvider(id: string): LLMProvider | null {
    const conf = getProviderConfig(id)
    if (!conf || conf.type !== 'text') return null
    let inst = textCache.get(id)
    if (!inst) {
      const kind = (conf.kind || 'openaichat') as TextProviderKind
      inst = new OpenAIChatProvider(conf.apiKey, conf.baseUrl, kind)
      textCache.set(id, inst)
    } else {
      inst.setApiKey(conf.apiKey)
      inst.setBaseUrl(conf.baseUrl)
    }
    return inst
  }

  function invalidateInstance(id: string) {
    videoCache.delete(id)
    imageCache.delete(id)
    textCache.delete(id)
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
    } else if (type === 'text') {
      const textKind: TextProviderKind =
        (input.kind === 'deepseek' || input.kind === 'openaichat')
          ? input.kind
          : 'openaichat'
      kind = textKind
      const bases: Record<TextProviderKind, string> = { openaichat: 'https://api.geeknow.ai', deepseek: 'https://api.deepseek.com' }
      defaultBase = input.baseUrl || bases[textKind]
      defaultModels = getChatTemplatesByKind(textKind).map((t: ChatModelTemplate): ProviderModel => ({
        id: t.id, name: t.name, description: t.description,
        capabilities: { ...t.capabilities },
        supportsReferenceImage: true,
        supportsReasoning: t.supportsReasoning,
      } as any))
      defaultName = textKind === 'deepseek' ? 'DeepSeek' : 'OpenAI Chat'
    } else {
      const vidKind: VideoProviderKind =
        (input.kind === 'chuhaiying' || input.kind === 'seedance' || input.kind === 'qiling' || input.kind === 'unmau' || input.kind === 'yu25')
          ? input.kind
          : 'seedance'
      kind = vidKind
      defaultBase = VIDEO_DEFAULT_BASE_URL[vidKind]
      defaultModels = defaultVideoModelSet(vidKind)
      defaultName = vidKind === 'unmau'
        ? 'New API · Seedance 2.5'
        : vidKind === 'yu25'
          ? 'YU25 · sd2.5'
          : vidKind === 'chuhaiying'
            ? '出海营视频'
            : vidKind === 'qiling'
              ? '器灵'
              : 'Seedance'
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
    if (type === 'text' && !defaultTextProviderId.value) defaultTextProviderId.value = id
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
    if (defaultTextProviderId.value === id) {
      defaultTextProviderId.value = providers.value.find((p) => p.type === 'text')?.id ?? null
    }
    void removed
    persist()
  }

  function setDefaultProvider(id: string) {
    const p = getProviderConfig(id)
    if (!p) return
    if (p.type === 'image') {
      defaultImageProviderId.value = id
    } else if (p.type === 'text') {
      defaultTextProviderId.value = id
    } else {
      defaultProviderId.value = id
    }
    persist()
  }

  function addModel(providerId: string, modelId: string, override?: Partial<ProviderModel>) {
    const p = getProviderConfig(providerId)
    if (!p) return
    if (p.models.find((m) => m.id === modelId)) return
    if (p.type === 'text') {
      const tpl = getChatTemplatesByKind('openaichat').find((t) => t.id === modelId)
      const model: any = tpl
        ? { id: tpl.id, name: tpl.name, description: tpl.description, capabilities: { ...tpl.capabilities }, supportsReasoning: tpl.supportsReasoning, ...override }
        : { id: modelId, name: override?.name || modelId, capabilities: override?.capabilities || { ratios: [], resolutions: [] } }
      p.models.push(model)
    } else if (p.type === 'image') {
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
      p.type === 'image' ? getImageProvider(id) : p.type === 'text' ? getTextProvider(id) : getProvider(id)
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
          defaultTextProviderId: defaultTextProviderId.value,
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
        defaultTextProviderId.value =
          parsed.defaultTextProviderId
          ?? providers.value.find((p) => p.type === 'text')?.id
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

    // 3) 迁移：Seedance 2.0 / Qiling sd2 时长上限 10 → 15，GPT Image 2K/4K 参考图支持
    if (migrationVersion.value < 4) {
      for (const p of providers.value) {
        for (const m of p.models) {
          if (m.id === 'doubao-seedance-2-0-260128' && m.capabilities?.durationRange?.max < 15) {
            m.capabilities.durationRange.max = 15
          }
          // Qiling sd2 系列时长上限 10 → 15
          if (m.id?.startsWith('sd2-') && m.capabilities?.durationRange?.max < 15) {
            m.capabilities.durationRange.max = 15
          }
          // GPT Image 2-2K / 2-4K 参考图
          if ((m.id === 'gpt-image-2-2k' || m.id === 'gpt-image-2-4k') && (m as any).supportsReferenceImage === false) {
            (m as any).supportsReferenceImage = true
          }
        }
      }
    }

    if (migrationVersion.value < 5 && !providers.value.some((p) => p.type === 'video' && p.kind === 'unmau')) {
      addProvider({ name: 'New API · Seedance 2.5', type: 'video', kind: 'unmau' })
    }
    if (migrationVersion.value < 6 && !providers.value.some((p) => p.type === 'video' && p.kind === 'yu25')) {
      addProvider({ name: 'YU25 · sd2.5', type: 'video', kind: 'yu25' })
    }

    // Keep the built-in New API catalog in sync even if another release has
    // already used the same migration number. Preserve user-added model IDs.
    let unmauChanged = false
    for (const provider of providers.value) {
      if (provider.type !== 'video' || provider.kind !== 'unmau') continue
      const defaults = defaultVideoModelSet('unmau')
      const current = provider.models || []
      const merged = [
        ...defaults,
        ...current.filter((model) => !defaults.some((item) => item.id === model.id)),
      ]
      const renamed = provider.name === 'New API · XD / TD'
      if (renamed) provider.name = 'New API · Seedance 2.5'
      if (renamed || JSON.stringify(current) !== JSON.stringify(merged)) {
        provider.models = merged
        unmauChanged = true
      }
    }

    if (migrationVersion.value < CURRENT_MIGRATION || unmauChanged) {
      migrationVersion.value = CURRENT_MIGRATION
      persist()
    }
  }

  return {
    providers,
    defaultProviderId,
    defaultImageProviderId,
    defaultTextProviderId,
    videoProviders,
    imageProviders,
    textProviders,
    configuredProviders,
    connectedProviders,
    getProviderConfig,
    getProvider,
    getImageProvider,
    getTextProvider,
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
