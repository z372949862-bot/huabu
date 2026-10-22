/**
 * 图片中转站模型模板，按 kind 分组：
 *
 * - geeknow：GeekNow OpenAI Images 兼容模型
 * - chuhaiying：出海营中转站（api.aiid.edu.kg）的 GPT Image 模型
 * - luoci：洛辞 Seedream 5 Pro Uncensored API
 *
 * 每个模型带 endpointStyle 决定走哪条 URL：
 * - 'openai'  → POST {base}/v1/images/generations
 * - 'gemini'  → POST {base}/v1beta/models/{model}:generateContent（保留协议兼容性）
 */

import type { VideoModelCapabilities } from './videoModelService'

export type ImageProviderKind = 'geeknow' | 'chuhaiying' | 'luoci'

export interface ImageModelTemplate {
  id: string
  name: string
  description?: string
  capabilities: VideoModelCapabilities
  endpointStyle: 'openai' | 'gemini'
  supportsReferenceImage: boolean
  supportsImageSize2K?: boolean
  /** 模型自己的实际 WxH 尺寸表；未声明时使用通用映射。 */
  sizeMaps?: Partial<Record<'1K' | '1.5K' | '2K' | '4K', Record<string, string>>>
  /** GPT Image VIP 建议省略 response_format，让网关自行返回 URL 或 Base64。 */
  omitResponseFormat?: boolean
  /** 对外只对 kling 系列等需要 model_name 的模型才填 */
  modelName?: string
  /** 参考图字段名（chuhaiying 用，按模型决定塞到 image / subject_image_list / image_list 等） */
  refImageField?: 'image' | 'image_urls' | 'subject_image_list' | 'image_list'
  /** chuhaiying 专用异步端点：提交后轮询任务，提供真实进度。 */
  asyncEndpoint?: boolean
  /** 上游模型是否真的认 seed 参数；false 时 UI 灰显且调用层不再发送字段。 */
  supportsSeed?: boolean
  /** 上游模型是否原生支持 negative prompt；GPT Image 系列不支持。 */
  supportsNegativePrompt?: boolean
}

const COMMON_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9']
const GPT_BASIC_RATIOS = ['1:1', '16:9', '9:16']
const GPT_RATIOS = COMMON_RATIOS

const SUNBURST_SIZE_MAPS: ImageModelTemplate['sizeMaps'] = {
  '1K': { '1:1': '1024x1024', '4:3': '1536x1152', '3:2': '1536x1024', '2:3': '1024x1536', '16:9': '1920x1080', '9:16': '1080x1920' },
  '2K': { '1:1': '2048x2048', '4:3': '2048x1536', '3:2': '2560x1712', '2:3': '1712x2560', '16:9': '2048x1152', '9:16': '1152x2048' },
  '4K': { '1:1': '2880x2880', '4:3': '3840x2880', '3:2': '3840x2560', '2:3': '2560x3840', '16:9': '3840x2160', '9:16': '2160x3840' },
}

const VIP_SIZE_MAPS: ImageModelTemplate['sizeMaps'] = {
  '1K': { '1:1': '1024x1024', '4:3': '1024x768', '3:4': '768x1024', '3:2': '1008x672', '2:3': '672x1008', '16:9': '1280x720', '9:16': '720x1280', '21:9': '1344x576' },
  '2K': { '1:1': '2048x2048', '4:3': '2304x1728', '3:4': '1728x2304', '3:2': '2496x1664', '2:3': '1664x2496', '16:9': '2560x1440', '9:16': '1440x2560', '21:9': '3024x1296' },
  '4K': { '1:1': '2880x2880', '4:3': '3264x2448', '3:4': '2448x3264', '3:2': '3504x2336', '2:3': '2336x3504', '16:9': '3840x2160', '9:16': '2160x3840', '21:9': '3808x1632' },
}

/** GeekNow 只保留 GPT Image 系列。 */
export const GEEKNOW_IMAGE_MODEL_TEMPLATES: ImageModelTemplate[] = [
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    description: 'OpenAI 图像',
    capabilities: { ratios: GPT_BASIC_RATIOS, resolutions: ['1K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
  {
    id: 'gpt-image-2-pro',
    name: 'GPT Image 2 Pro',
    description: 'OpenAI 图像（高画质）',
    capabilities: { ratios: GPT_BASIC_RATIOS, resolutions: ['1K', '2K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsImageSize2K: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
  {
    id: 'gpt-image-2.5-sunburst',
    name: 'GPT Image 2.5 Sunburst',
    description: '高质量图像生成（支持 1K / 2K / 4K）',
    capabilities: { ratios: ['1:1', '4:3', '3:2', '2:3', '16:9', '9:16'], resolutions: ['1K', '2K', '4K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsImageSize2K: true,
    sizeMaps: SUNBURST_SIZE_MAPS,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
  {
    id: 'gpt-image-2-vip',
    name: 'GPT Image 2 VIP',
    description: 'VIP 图像生成（支持参考图与 1K / 2K / 4K）',
    capabilities: { ratios: GPT_RATIOS, resolutions: ['1K', '2K', '4K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsImageSize2K: true,
    sizeMaps: VIP_SIZE_MAPS,
    omitResponseFormat: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
]

/** 出海营默认模型（仅保留 GPT Image 异步版本）。 */
export const CHUHAIYING_IMAGE_MODEL_TEMPLATES: ImageModelTemplate[] = [
  {
    id: 'gpt-image-2-2k',
    name: 'GPT Image 2 · 2K',
    description: 'OpenAI 图像（2K，异步队列，真实进度）',
    capabilities: { ratios: GPT_BASIC_RATIOS, resolutions: ['2K'] },
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
    capabilities: { ratios: GPT_BASIC_RATIOS, resolutions: ['4K'] },
    endpointStyle: 'openai',
    supportsReferenceImage: true,
    supportsImageSize2K: true,
    asyncEndpoint: true,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
]

/** 洛辞 API 默认图片模型。洛辞直接接收 aspectRatio/imageSize。 */
export const LUOCI_IMAGE_MODEL_TEMPLATES: ImageModelTemplate[] = [
  {
    id: 'seedream-5-pro',
    name: 'Seedream 5 Pro Uncensored',
    description: '洛辞 Seedream 5 Pro（1K / 1.5K / 2K）',
    capabilities: {
      ratios: ['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '21:9'],
      resolutions: ['1K', '1.5K', '2K'],
    },
    endpointStyle: 'openai',
    supportsReferenceImage: false,
    supportsSeed: false,
    supportsNegativePrompt: false,
  },
]

const TEMPLATES_BY_KIND: Record<ImageProviderKind, ImageModelTemplate[]> = {
  geeknow: GEEKNOW_IMAGE_MODEL_TEMPLATES,
  chuhaiying: CHUHAIYING_IMAGE_MODEL_TEMPLATES,
  luoci: LUOCI_IMAGE_MODEL_TEMPLATES,
}

/** 兼容旧代码：未带 kind 时返回全部，主要用于 store 的 addModel 兜底查询。 */
export const IMAGE_MODEL_TEMPLATES: ImageModelTemplate[] = [
  ...GEEKNOW_IMAGE_MODEL_TEMPLATES,
  ...CHUHAIYING_IMAGE_MODEL_TEMPLATES,
  ...LUOCI_IMAGE_MODEL_TEMPLATES,
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

const RATIO_TO_SIZE_4K: Record<string, string> = {
  '1:1': '4096x4096',
  '16:9': '4096x2304',
  '9:16': '2304x4096',
  '4:3': '4096x3072',
  '3:4': '3072x4096',
  '3:2': '4096x2731',
  '2:3': '2731x4096',
  '21:9': '4096x1755',
}

/** Convert the selected resolution tier into the provider's OpenAI-compatible size. */
export function ratioToSize(
  ratio: string,
  resolution: '1K' | '1.5K' | '2K' | '4K' | boolean = '1K',
  sizeMaps?: ImageModelTemplate['sizeMaps'],
): string {
  const tier = typeof resolution === 'boolean' ? (resolution ? '2K' : '1K') : resolution
  const map = sizeMaps?.[tier] || (tier === '4K' ? RATIO_TO_SIZE_4K : tier === '2K' ? RATIO_TO_SIZE_2K : RATIO_TO_SIZE)
  return map[ratio] || map['16:9']
}
