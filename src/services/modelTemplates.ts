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

export type VideoProviderKind = 'seedance' | 'chuhaiying' | 'qiling' | 'unmau' | 'yu25'

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

/** 器灵中转站默认模型（仅 Seedance 系列） */
export const QILING_VIDEO_MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: 'sd2-720p-fast',
    name: 'Seedance 2 · 720P Fast',
    description: '快速生成',
    capabilities: {
      ratios: ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
      resolutions: ['720p'],
      durationRange: { min: 4, max: 15 },
      audioGeneration: true,
    },
  },
  {
    id: 'sd2-720p',
    name: 'Seedance 2 · 720P',
    description: '标准画质',
    capabilities: {
      ratios: ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
      resolutions: ['720p'],
      durationRange: { min: 4, max: 15 },
      audioGeneration: true,
    },
  },
  {
    id: 'sd2-1080p-fast',
    name: 'Seedance 2 · 1080P Fast',
    description: '高画质快速',
    capabilities: {
      ratios: ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
      resolutions: ['1080p'],
      durationRange: { min: 4, max: 15 },
      audioGeneration: true,
    },
  },
  {
    id: 'sd2-1080p',
    name: 'Seedance 2 · 1080P',
    description: '最高画质',
    capabilities: {
      ratios: ['16:9', '9:16', '4:3', '3:4', '1:1', '21:9'],
      resolutions: ['1080p'],
      durationRange: { min: 4, max: 15 },
      audioGeneration: true,
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
}

/** 兼容旧代码：返回全部去重模板（按 id）。新代码用 getModelTemplatesByKind。 */
export const MODEL_TEMPLATES: ModelTemplate[] = (() => {
  const seen = new Set<string>()
  const merged: ModelTemplate[] = []
  for (const t of [...SEEDANCE_MODEL_TEMPLATES, ...CHUHAIYING_VIDEO_MODEL_TEMPLATES, ...QILING_VIDEO_MODEL_TEMPLATES, ...UNMAU_MODELS, ...YU25_MODELS]) {
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
