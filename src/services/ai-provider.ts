// AI服务提供商统一接口

export interface ContentItem {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url'
  text?: string
  image_url?: { url: string } | string
  video_url?: { url: string } | string
  audio_url?: { url: string } | string
  role?: string
  name?: string
}

export interface CreateTaskParams {
  model: string
  prompt: string
  mode?: 't2v' | 'i2v' | 'reference_images' | 'reference_material' | 'r2v' | 'edit' | 'extend'
  /** i2v 首帧图 */
  image_url?: string
  /** reference_images 模式的角色/素材参考图（数组） */
  image_urls?: string[]
  /** reference_material 模式的混排素材数组 */
  content?: ContentItem[]
  ratio?: string
  resolution?: string
  duration?: number
  fps?: number
  generate_audio?: boolean
  /** DMXAPI Seedance 2.5 子任务校验：reference / edit / extend。 */
  omniReferenceTaskType?: 'auto' | 'reference' | 'edit' | 'extend'
  outputFormat?: 'mp4' | 'mov'
  returnLastFrame?: boolean
}

export interface TextToImageParams {
  prompt: string
  negativePrompt?: string
  size: string
  style?: string
  seed?: number
}

export interface ImageToVideoParams {
  imageUrl: string
  prompt?: string
  duration: number
  fps: number
  model?: string
  ratio?: string
  resolution?: string
  generate_audio?: boolean
}

export interface TextToVideoParams {
  prompt: string
  duration: number
  fps: number
  model?: string
  ratio?: string
  resolution?: string
  generate_audio?: boolean
}

export interface ImageResult {
  imageUrl: string
  seed: number
}

export interface VideoResult {
  videoUrl: string
  taskId: string
}

export interface TaskStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  videoUrl?: string
  error?: string
  warning?: string
}

export interface AuthResult {
  success: boolean
  quota?: {
    remaining: number
    total: number
  }
  error?: string
}

export interface AIProvider {
  name: string

  testAuth(apiKey: string): Promise<AuthResult>
  createTask(params: CreateTaskParams): Promise<{ taskId: string }>
  getTaskStatus(taskId: string): Promise<TaskStatus>
  textToImage(params: TextToImageParams): Promise<ImageResult>
  imageToVideo(params: ImageToVideoParams): Promise<VideoResult>
  textToVideo(params: TextToVideoParams): Promise<VideoResult>
}
