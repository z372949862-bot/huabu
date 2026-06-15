/**
 * 图片中转站模型模板，按 kind 分组：
 *
 * - geeknow：原 GeekNow 中转站（gemini-* / doubao-seedream / grok / gpt-image），
 *   字段映射来自 D:\字字动画\_internal\plugins\image_plugins\nano_banana_plugin_geeknow\main.py
 * - chuhaiying：出海营中转站（api.aiid.edu.kg），DALL-E 兼容
 *
 * 每个模型带 endpointStyle 决定走哪条 URL：
 * - 'openai'  → POST {base}/v1/images/generations
 * - 'gemini'  → POST {base}/v1beta/models/{model}:generateContent
 */

import type { VideoModelCapabilities } from './videoModelService'

export type ImageProviderKind = 'geeknow' | 'chuhaiying'

export interface ImageModelTemplate {
  id: string
  name: string
  description?: string
  capabilities: VideoModelCapabilities
  endpointStyle: 'openai' | 'gemini'
  supportsReferenceImage: boolean
  supportsImageSize2K?: boolean
  /** 对外只对 kling 系列等需要 model_name 的模型才填 */
  modelName?: string
  /** 参考图字段名（chuhaiying 用，按模型决定塞到 image / subject_image_list / image_list 等） */
  refImageField?: 'image' | 'image_urls' | 'subject_image_list' | 'image_list'
  /**
   * chuhaiying 专用：true 表示走异步 POST /v1/responses + 轮询 GET /v1/responses/{id}。
   * 仅 gpt-image-2-2k / gpt-image-2-4k / nano-banana-pro 支持，给出真实进度。
   */
  asyncEndpoint?: boolean
  /**
   * 上游模型是否真的认 seed 参数。false 时 UI 灰显且调用层不再发送字段，
   * 避免「调了也没用」的迷惑（例如 grok / gpt-image / gemini）。默认 true。
   */
  supportsSeed?: boolean
  /**
   * 上游模型是否原生支持 negative prompt。
   * - 真原生（doubao / nano-banana / kling 等）：true
   * - 仅作为文字提示拼到 prompt 里（gemini）：false，调用层不会发字段、UI 不灰显但加注脚
   * - 完全无效（grok / gpt-image）：false
   * 默认 true。
   */
  supportsNegativePrompt?: boolean
}

const COMMON_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']

/** GeekNow 默认 8 个模型 */
export const GEEKNOW_IMAGE_MODEL_TEMPLATES: ImageModelTemplate[] = [
  {
    id: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    description: '高质量参考图生成（支持 2K）',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K', '2K'] },
    endpointStyle: 'gemini',
    supportsReferenceImage: true,
    supportsImageSize2K: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
  {
    id: 'gemini-2.5-flash-image-preview',
    name: 'Gemini 2.5 Flash Image',
    description: '快速生成，参考图友好',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K'] },
    endpointStyle: 'gemini',
    supportsReferenceImage: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    description: '更新的 Flash 系列',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K'] },
    endpointStyle: 'gemini',
    supportsReferenceImage: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
  {
    id: 'doubao-seedream-4-5-251128',
    name: '豆包即梦 4.5',
    description: '中文 prompt 友好',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K', '2K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
  },
  {
    id: 'doubao-seedream-5-0-260128',
    name: '豆包即梦 5.0',
    description: '更高质量中文绘图',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K', '2K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
  },
  {
    id: 'grok-4-2-image',
    name: 'Grok 4.2 Image',
    description: 'xAI 出品',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: false, // Grok API 不支持 URL/参考图模式
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    description: 'OpenAI 图像',
    capabilities: { ratios: ['1:1', '16:9', '9:16'], resolutions: ['1K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
  {
    id: 'gpt-image-2-pro',
    name: 'GPT Image 2 Pro',
    description: 'OpenAI 图像（高画质）',
    capabilities: { ratios: ['1:1', '16:9', '9:16'], resolutions: ['1K', '2K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
]

/** 出海营默认模型（api.aiid.edu.kg） */
export const CHUHAIYING_IMAGE_MODEL_TEMPLATES: ImageModelTemplate[] = [
  {
    id: 'nano-banana',
    name: 'Nano Banana',
    description: '基础文生图，兼容图编辑',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    refImageField: 'image',
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    description: '更高质量版本（异步队列，真实进度）',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    refImageField: 'image',
    asyncEndpoint: true,
  },
  {
    id: 'nano-banana-pro-2k',
    name: 'Nano Banana Pro 2K',
    description: '高分辨率（异步队列，真实进度）',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['2K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsImageSize2K: true,
    refImageField: 'image',
    asyncEndpoint: true,
  },
  {
    id: 'nano-banana-pro-4k',
    name: 'Nano Banana Pro 4K',
    description: '超高分辨率（异步队列，真实进度）',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['4K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsImageSize2K: true,
    refImageField: 'image',
    asyncEndpoint: true,
  },
  {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    description: '更新版本族',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    refImageField: 'image',
  },
  {
    id: 'doubao-seedream-4-5-251128',
    name: '豆包即梦 4.5',
    description: '中文 prompt 友好',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K', '2K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    refImageField: 'image',
  },
  {
    id: 'doubao-seedream-5-0-260128',
    name: '豆包即梦 5.0',
    description: '更高质量中文绘图',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K', '2K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    refImageField: 'image',
  },
  {
    id: 'kling-image',
    name: 'Kling Image v3',
    description: 'Kling 常规图（默认 v3）',
    capabilities: { ratios: COMMON_RATIOS, resolutions: ['1K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    modelName: 'kling-v3',
    refImageField: 'image',
  },
  {
    id: 'gpt-image-2-2k',
    name: 'GPT Image 2 · 2K',
    description: 'OpenAI 图像（2K，异步队列，真实进度）',
    capabilities: { ratios: ['1:1', '16:9', '9:16'], resolutions: ['2K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsImageSize2K: true,
    asyncEndpoint: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
  {
    id: 'gpt-image-2-4k',
    name: 'GPT Image 2 · 4K',
    description: 'OpenAI 图像（4K，异步队列，真实进度）',
    capabilities: { ratios: ['1:1', '16:9', '9:16'], resolutions: ['4K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsImageSize2K: true,
    asyncEndpoint: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
]

const TEMPLATES_BY_KIND: Record<ImageProviderKind, ImageModelTemplate[]> = {
  geeknow: GEEKNOW_IMAGE_MODEL_TEMPLATES,
  chuhaiying: CHUHAIYING_IMAGE_MODEL_TEMPLATES,
}

/** 兼容旧代码：未带 kind 时返回全部，主要用于 store 的 addModel 兜底查询。 */
export const IMAGE_MODEL_TEMPLATES: ImageModelTemplate[] = [
  ...GEEKNOW_IMAGE_MODEL_TEMPLATES,
  ...CHUHAIYING_IMAGE_MODEL_TEMPLATES,
]

export function getImageTemplatesByKind(kind: ImageProviderKind): ImageModelTemplate[] {
  return TEMPLATES_BY_KIND[kind] || []
}

/**
 * 按 kind 精确查找模型；不传 kind 时退化为旧的全局查找（geeknow 优先）。
 * 同一 id 在不同 kind 下可能字段不同（例如 seedream 5.0），provider 内部要传自己的 kind。
 */
export function findImageTemplate(id: string, kind?: ImageProviderKind): ImageModelTemplate | undefined {
  if (kind) {
    return TEMPLATES_BY_KIND[kind]?.find((t) => t.id === id)
  }
  return IMAGE_MODEL_TEMPLATES.find((t) => t.id === id)
}

/**
 * Doubao / Grok / GPT-image 不直接接受 aspectRatio 字符串，需要换算成 size (WxH)。
 * 数值参考 main.py 第 1601-1666 行的映射表。
 */
const RATIO_TO_SIZE: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1280x720',
  '9:16': '720x1280',
  '4:3': '1024x768',
  '3:4': '768x1024',
  '3:2': '1024x683',
  '2:3': '683x1024',
  '21:9': '1280x549',
}

const RATIO_TO_SIZE_2K: Record<string, string> = {
  '1:1': '2048x2048',
  '16:9': '2560x1440',
  '9:16': '1440x2560',
  '4:3': '2048x1536',
  '3:4': '1536x2048',
  '3:2': '2048x1365',
  '2:3': '1365x2048',
  '21:9': '2560x1097',
}

export function ratioToSize(ratio: string, want2K = false): string {
  const map = want2K ? RATIO_TO_SIZE_2K : RATIO_TO_SIZE
  return map[ratio] || map['16:9']
}
