/**
 * API服务 - 管理视频模型
 *
 * 模型 ID 来源：api.aiid.edu.kg 的 Seedance OpenAPI 文档 enum。
 * 只列通用 ID（同时支持 t2v + i2v，靠 mode 字段切换），
 * 不放 doubao-seedance-1-0-lite-{i2v,t2v}-* 这类按用途拆分的版本。
 */

export interface VideoModelCapabilities {
  ratios?: string[]
  resolutions?: string[]
  durationRange?: {
    min: number
    max: number
  }
  durationOptions?: number[]
  audioGeneration?: boolean
  maxImages?: number
  maxVideos?: number
  maxAudios?: number
}

export interface VideoModel {
  id: string
  name: string
  description: string
  badge?: string
  capabilities?: VideoModelCapabilities
}

let modelList: VideoModel[] = [
  {
    id: 'doubao-seedance-2-0-260128',
    name: 'Seedance 2.0',
    description: '高质量视频生成（推荐）',
    capabilities: {
      ratios: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      resolutions: ['480p', '720p', '1080p'],
      durationRange: { min: 4, max: 10 },
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
]

export function getVideoModels(): VideoModel[] {
  return modelList
}

export function setVideoModels(models: VideoModel[]): void {
  modelList = models
}

export function addVideoModel(model: VideoModel): void {
  const exists = modelList.find((m) => m.id === model.id)
  if (!exists) {
    modelList.push(model)
  }
}

export function removeVideoModel(modelId: string): void {
  const index = modelList.findIndex((m) => m.id === modelId)
  if (index !== -1) {
    modelList.splice(index, 1)
  }
}

/**
 * 网关有 GET /api/v3/models 接口可拉取模型列表，但本轮先用本地常量。
 */
export async function loadModelsFromAPI(): Promise<VideoModel[]> {
  return modelList
}
