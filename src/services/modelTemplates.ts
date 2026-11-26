/**
 * 视频中转站默认模型模板，按 kind 分组。
 *
 * - seedance：现有 SeedanceProvider 走 `/api/v3/contents/generations/tasks`（火山方舟原生）
 * - aiide：走 `/v1/video/generations`（Aiide Seedance 多模态格式）
 * - chuhaiying：出海营走 `/v1/videos`（OpenAI Sora 兼容）
 *
 * 模型 ID 来自 api.aiid.edu.kg 各自的 OpenAPI 文档。
 */

import { FLYAPI_MAGI2_MODELS, FLYAPI_MODELS } from './providers/flyapi'
import type { VideoModelCapabilities } from './videoModelService'
import { UNMAU_MODELS } from './providers/unmau'
import { YU25_MODELS } from './providers/yu25'
import { XINSHUJU_MODELS } from './providers/xinshuju'
import { FMGO_MODELS } from './providers/fmgo'
import { LUOCI_VIDEO_MODELS } from './providers/luociVideo'
import { AIMI_MODELS } from './providers/aimi'
import { PIAPI_MODELS } from './providers/piapi'
import { SUANLIAI_MODELS } from './providers/suanliai'

export type VideoProviderKind = 'seedance' | 'chuhaiying' | 'qiling' | 'unmau' | 'yu25' | 'xinshuju' | 'dmxapi' | 'fmgo' | 'aiide' | 'luoci' | 'aimi' | 'piapi' | 'suanliai' | 'flyapi' | 'flyapi-magi2' | 'ideagates' | 'ideagates-overseas'
import { ideaGatesModels } from './providers/ideagates'

export interface ModelTemplate {
  id: string
  name: string
  description?: string
  capabilities: VideoModelCapabilities
}

/** Seedance 中转站默认模型（保留原 3 个） */
export const SEEDANCE_MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: 'doubao-seedance-2-0-260128',
    name: 'Seedance 2.0',
    description: '高质量视频生成（推荐）',
    capabilities: {
      ratios: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      resolutions: ['480p', '720p', '1080p'],
      durationRange: { min: 4, max: 15 },
      audioGeneration: true,
    },
  },
  {
    id: 'doubao-seedance-2-0-fast-260128',
    name: 'Seedance 2.0 Fast',
    description: '更快的生成速度',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1'],
      resolutions: ['480p', '720p'],
      durationRange: { min: 4, max: 8 },
      audioGeneration: true,
    },
  },
  {
    id: 'gemini-omni',
    name: 'Gemini Omni',
    description: '参考图/视频编辑',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1'],
      resolutions: ['720p', '1080p'],
      durationRange: { min: 4, max: 10 },
      audioGeneration: true,
    },
  },
]

/** DMXAPI 官方 Seedance 2.5（Responses 异步接口）。 */
export const DMXAPI_VIDEO_MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: 'doubao-seedance-2-5-260628',
    name: 'Seedance 2.5',
    description: 'DMXAPI 官方接口，支持参考、编辑、延长，4–30 秒',
    capabilities: {
      ratios: ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16', '21:9'],
      resolutions: ['480p', '720p', '1080p'],
      durationRange: { min: -1, max: 30 },
      durationOptions: [-1, ...Array.from({ length: 27 }, (_, index) => index + 4)],
      audioGeneration: true,
      maxImages: 30,
      maxVideos: 10,
      maxAudios: 10,
    },
  },
]

/** Aiide-hosted Dreamina Seedance 2.5 HC model. */
export const AIIDE_VIDEO_MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: 'dreamina-seedance-2-5-hc',
    name: 'Dreamina Seedance 2.5 HC',
    description: 'Aiide 接口，支持 4–30 秒、多模态参考、视频编辑与延长，最多 50 项参考素材',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      // The documented Aiide multimodal endpoint does not accept a resolution field.
      resolutions: ['480p', '720p'],
      durationRange: { min: 4, max: 30 },
      audioGeneration: true,
      maxTotalReferences: 50,
    },
  },
]

/** FMGO API 视频模型 */
export const FMGO_VIDEO_MODEL_TEMPLATES: ModelTemplate[] = FMGO_MODELS

/** AIMI Seedance 2.5 models. */
export const AIMI_VIDEO_MODEL_TEMPLATES: ModelTemplate[] = AIMI_MODELS

/** 器灵中转站默认模型（仅 Seedance 系列） */
export const QILING_VIDEO_MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: 'SD2.5-满血-GF-480P',
    name: 'SD2.5 满血 GF · 480P',
    description: '器灵 GF 线路，4–30 秒，最多 10 图 / 5 视频 / 5 音频，参考视频和音频各自合计最多 15 秒',
    capabilities: {
      ratios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
      resolutions: ['480p'],
      durationRange: { min: 4, max: 30 },
      durationOptions: Array.from({ length: 27 }, (_, index) => index + 4),
      audioGeneration: false,
      maxImages: 10,
      maxVideos: 5,
      maxAudios: 5,
    },
  },
  {
    id: 'SD2.5-满血-GF-720P',
    name: 'SD2.5 满血 GF · 720P',
    description: '器灵 GF 线路，4–30 秒，最多 10 图 / 5 视频 / 5 音频，参考视频和音频各自合计最多 15 秒',
    capabilities: {
      ratios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
      resolutions: ['720p'],
      durationRange: { min: 4, max: 30 },
      durationOptions: Array.from({ length: 27 }, (_, index) => index + 4),
      audioGeneration: false,
      maxImages: 10,
      maxVideos: 5,
      maxAudios: 5,
    },
  },
]

/** 出海营中转站默认模型 */
export const CHUHAIYING_VIDEO_MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: 'gemini-omni',
    name: 'Gemini Omni',
    description: '参考图/视频编辑',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1'],
      resolutions: ['720p', '1080p'],
      durationRange: { min: 4, max: 10 },
      audioGeneration: true,
    },
  },
  {
    id: 'grok-imagine-video-1.5-preview',
    name: 'Grok Imagine Video 1.5',
    description: 'xAI Grok 视频（参考图友好，最长 10 秒）',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      resolutions: ['720p', '1080p'],
      durationRange: { min: 5, max: 10 },
      audioGeneration: false,
    },
  },
]

const TEMPLATES_BY_KIND: Record<VideoProviderKind, ModelTemplate[]> = {
  ideagates: ideaGatesModels('ideagates'),
  'ideagates-overseas': ideaGatesModels('ideagates-overseas'),
  seedance: SEEDANCE_MODEL_TEMPLATES,
  chuhaiying: CHUHAIYING_VIDEO_MODEL_TEMPLATES,
  qiling: QILING_VIDEO_MODEL_TEMPLATES,
  unmau: UNMAU_MODELS,
  yu25: YU25_MODELS,
  xinshuju: XINSHUJU_MODELS,
  dmxapi: DMXAPI_VIDEO_MODEL_TEMPLATES,
  fmgo: FMGO_VIDEO_MODEL_TEMPLATES,
  flyapi: FLYAPI_MODELS,
  'flyapi-magi2': FLYAPI_MAGI2_MODELS,
  aiide: AIIDE_VIDEO_MODEL_TEMPLATES,
  luoci: LUOCI_VIDEO_MODELS,
  aimi: AIMI_VIDEO_MODEL_TEMPLATES,
  piapi: PIAPI_MODELS,
  suanliai: SUANLIAI_MODELS,
}

/** 兼容旧代码：返回全部去重模板（按 id）。新代码用 getModelTemplatesByKind。 */
export const MODEL_TEMPLATES: ModelTemplate[] = (() => {
  const seen = new Set<string>()
  const merged: ModelTemplate[] = []
  for (const t of [...SEEDANCE_MODEL_TEMPLATES, ...CHUHAIYING_VIDEO_MODEL_TEMPLATES, ...QILING_VIDEO_MODEL_TEMPLATES, ...UNMAU_MODELS, ...YU25_MODELS, ...XINSHUJU_MODELS, ...FMGO_VIDEO_MODEL_TEMPLATES, ...AIIDE_VIDEO_MODEL_TEMPLATES, ...AIMI_VIDEO_MODEL_TEMPLATES, ...LUOCI_VIDEO_MODELS, ...PIAPI_MODELS, ...SUANLIAI_MODELS, ...FLYAPI_MODELS, ...FLYAPI_MAGI2_MODELS]) {
    if (!seen.has(t.id)) {
      seen.add(t.id)
      merged.push(t)
    }
  }
  return merged
})()

export function getModelTemplatesByKind(kind: VideoProviderKind): ModelTemplate[] {
  return TEMPLATES_BY_KIND[kind] || []
}

export function getModelTemplate(id: string, kind?: VideoProviderKind): ModelTemplate | undefined {
  if (kind) {
    return TEMPLATES_BY_KIND[kind]?.find((m) => m.id === id)
  }
  return MODEL_TEMPLATES.find((m) => m.id === id)
}

export function templateIds(): string[] {
  return MODEL_TEMPLATES.map((m) => m.id)
}
