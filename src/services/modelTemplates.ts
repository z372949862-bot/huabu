/**
 * 视频中转站默认模型模板，按 kind 分组。
 *
 * - seedance：现有 SeedanceProvider 走 `/api/v3/contents/generations/tasks`（火山方舟原生）
 * - chuhaiying：出海营走 `/v1/videos`（OpenAI Sora 兼容）
 *
 * 模型 ID 来自 api.aiid.edu.kg 各自的 OpenAPI 文档。
 */

import type { VideoModelCapabilities } from './videoModelService'
import { UNMAU_MODELS } from './providers/unmau'
import { YU25_MODELS } from './providers/yu25'
import { XINSHUJU_MODELS } from './providers/xinshuju'
import { FMGO_MODELS } from './providers/fmgo'

export type VideoProviderKind = 'seedance' | 'chuhaiying' | 'qiling' | 'unmau' | 'yu25' | 'xinshuju' | 'dmxapi' | 'fmgo'

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

/** FMGO API 视频模型 */
export const FMGO_VIDEO_MODEL_TEMPLATES: ModelTemplate[] = FMGO_MODELS

/** 器灵中转站默认模型（仅 Seedance 系列） */
export const QILING_VIDEO_MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: 'SD2.5-满血-XG-720P',
    name: 'SD2.5 满血 XG · 720P',
    description: '器灵 XG 线路，4–30 秒，最多 30 图 / 10 视频 / 10 音频参考',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      resolutions: ['720p'],
      durationRange: { min: 4, max: 30 },
      audioGeneration: true,
      maxImages: 30,
      maxVideos: 10,
      maxAudios: 10,
    },
  },
  {
    id: 'SD2.5-满血-CB-720P',
    name: 'SD2.5 满血 CB · 720P',
    description: '器灵 CB 主线路，固定 30 秒，最多 9 张公网 HTTPS 参考图',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      resolutions: ['720p'],
      durationRange: { min: 30, max: 30 },
      audioGeneration: false,
      maxImages: 9,
      maxVideos: 0,
      maxAudios: 0,
    },
  },
  {
    id: 'SD2.5-满血-CB-720P-备用',
    name: 'SD2.5 满血 CB 备用 · 720P',
    description: '器灵 CB 备用线路，5 / 10 / 15 / 30 秒，最多 9 张公网 HTTPS 参考图',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1'],
      resolutions: ['720p'],
      durationRange: { min: 5, max: 30 },
      durationOptions: [5, 10, 15, 30],
      audioGeneration: false,
      maxImages: 9,
      maxVideos: 0,
      maxAudios: 0,
    },
  },
  {
    id: 'SD2.5-满血-HN-720P',
    name: 'SD2.5 满血 HN · 720P',
    description: '器灵 HN 线路，5 / 10 / 20 / 30 秒，最多 30 张公网参考图',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      resolutions: ['720p'],
      durationRange: { min: 5, max: 30 },
      durationOptions: [5, 10, 20, 30],
      audioGeneration: false,
      maxImages: 30,
      maxVideos: 0,
      maxAudios: 0,
    },
  },
  {
    id: 'SD2.5-满血-JL-720P',
    name: 'SD2.5 满血 JL · 720P',
    description: '器灵 JL 线路，固定 30 秒，支持文生、首帧、首尾帧和多媒体参考',
    capabilities: {
      ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      resolutions: ['720p'],
      durationRange: { min: 30, max: 30 },
      audioGeneration: true,
      maxImages: 30,
      maxVideos: 10,
      maxAudios: 10,
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
  seedance: SEEDANCE_MODEL_TEMPLATES,
  chuhaiying: CHUHAIYING_VIDEO_MODEL_TEMPLATES,
  qiling: QILING_VIDEO_MODEL_TEMPLATES,
  unmau: UNMAU_MODELS,
  yu25: YU25_MODELS,
  xinshuju: XINSHUJU_MODELS,
  dmxapi: DMXAPI_VIDEO_MODEL_TEMPLATES,
  fmgo: FMGO_VIDEO_MODEL_TEMPLATES,
}

/** 兼容旧代码：返回全部去重模板（按 id）。新代码用 getModelTemplatesByKind。 */
export const MODEL_TEMPLATES: ModelTemplate[] = (() => {
  const seen = new Set<string>()
  const merged: ModelTemplate[] = []
  for (const t of [...SEEDANCE_MODEL_TEMPLATES, ...CHUHAIYING_VIDEO_MODEL_TEMPLATES, ...QILING_VIDEO_MODEL_TEMPLATES, ...UNMAU_MODELS, ...YU25_MODELS, ...XINSHUJU_MODELS, ...FMGO_VIDEO_MODEL_TEMPLATES]) {
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
