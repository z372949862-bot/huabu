import { ratioToSize, findImageTemplate } from './imageModelTemplates'

export const SUNBURST26_MODEL = 'gpt-image-2.6-sunburst'
export const SUNBURST26_QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'] as const

export interface Sunburst26Options {
  format?: 'png' | 'gif'
  quality?: typeof SUNBURST26_QUALITIES[number]
  customSize?: boolean
  width?: number
  height?: number
  frameCount?: number
  frameDurationMs?: number
}

/** Only result sources, never credentials. Retried downloads must not repeat the billed POST. */
export interface GeekNowImageResult {
  sources: string[]
  model: string
  prompt: string
  providerId?: string
  ratio?: string
  resolution?: string
}

export function sunburst26Size(options: Sunburst26Options, ratio = '1:1', resolution: '1K' | '2K' | '4K' = '1K'): string {
  if (options.format === 'gif') return 'auto'
  if (options.customSize) {
    if (![options.width, options.height].every(value => Number.isSafeInteger(value) && value! > 0)) {
      throw new Error('自定义尺寸的宽度和高度必须为正整数像素')
    }
    return `${options.width}x${options.height}`
  }
  const template = findImageTemplate(SUNBURST26_MODEL, 'geeknow')!
  if (!template.capabilities.ratios?.includes(ratio)) throw new Error('请选择该模型支持的图片比例')
  return ratioToSize(ratio, resolution, template.sizeMaps)
}

export function sunburst26Fields(options: Sunburst26Options) {
  const format = options.format ?? 'png'
  const quality = options.quality ?? 'medium'
  if (!['png', 'gif'].includes(format)) throw new Error('该模型仅支持 PNG 或 GIF')
  if (!SUNBURST26_QUALITIES.includes(quality)) throw new Error('不支持的图片质量等级')
  const fields: Record<string, string | number> = { output_format: format, quality, response_format: 'url' }
  if (format === 'gif') {
    const count = options.frameCount ?? 9
    const duration = options.frameDurationMs ?? 200
    if (!Number.isInteger(count) || count < 2 || count > 64) throw new Error('GIF 帧数需为 2–64 的整数')
    if (!Number.isInteger(duration) || duration < 20 || duration > 2000 || duration % 10 !== 0) {
      throw new Error('GIF 每帧时长需为 20–2000 毫秒，且是 10 的倍数')
    }
    fields.frame_count = count
    fields.frame_duration_ms = duration
  }
  return fields
}

interface DecodedFrame {
  displayWidth: number
  displayHeight: number
  close(): void
}
interface GifDecoder {
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } }
  decode(options: { frameIndex: number }): Promise<{ image: DecodedFrame }>
  close(): void
}

/** Decode composited frames for validation, but always save the original encoded bytes. */
export async function isAnimatedGif(bytes: Uint8Array): Promise<boolean> {
  const signature = String.fromCharCode(...bytes.subarray(0, 6))
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return false
  const Decoder = (globalThis as unknown as {
    ImageDecoder?: new (options: { data: Uint8Array; type: string; preferAnimation: boolean }) => GifDecoder
  }).ImageDecoder
  if (!Decoder) throw new Error('当前运行环境不支持 GIF 帧校验，请使用桌面版或新版 Chromium 浏览器')
  const decoder = new Decoder({ data: bytes, type: 'image/gif', preferAnimation: true })
  try {
    await decoder.tracks.ready
    const count = decoder.tracks.selectedTrack?.frameCount ?? 0
    if (count < 2) return false
    let first: Uint8ClampedArray | undefined
    let canvas: OffscreenCanvas | undefined
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      try {
        canvas ??= new OffscreenCanvas(image.displayWidth, image.displayHeight)
        const context = canvas.getContext('2d')!
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image as unknown as CanvasImageSource, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        if (!first) first = pixels
        else if (pixels.some((value, index) => value !== first![index])) return true
      } finally { image.close() }
    }
    return false
  } finally { decoder.close() }
}

function gifDataUrl(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return 'data:image/gif;base64,' + btoa(binary)
}

async function downloadResultBytes(source: string, signal?: AbortSignal): Promise<Uint8Array> {
  if (/^data:image\/[^;]+;base64,/i.test(source)) {
    return Uint8Array.from(atob(source.slice(source.indexOf(',') + 1)), value => value.charCodeAt(0))
  }
  if (!/^https?:\/\//i.test(source)) throw new Error('图片结果地址无效')
  const bridge = (window as any).electronAPI?.image?.downloadResult
  if (bridge) {
    const result = await bridge({ url: source })
    if (signal?.aborted) throw new Error('已取消')
    if (!result?.ok || !result.base64) throw new Error(result?.error || '图片下载失败')
    return Uint8Array.from(atob(result.base64), value => value.charCodeAt(0))
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  const onAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const response = await fetch(source, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function resolveSunburst26Gifs(sources: string[], signal?: AbortSignal): Promise<string[]> {
  const animations: string[] = []
  let failure = ''
  for (const source of sources) {
    if (signal?.aborted) throw new Error('已取消')
    try {
      // Signed output URLs are fetched without the API key, irrespective of suffix or Content-Type.
      const bytes = await downloadResultBytes(source, signal)
      if (await isAnimatedGif(bytes)) animations.push(gifDataUrl(bytes))
    } catch (error) {
      if (signal?.aborted) throw new Error('已取消')
      failure = error instanceof Error ? error.message : String(error)
    }
  }
  if (!animations.length) {
    throw new Error(`未能取得有效 GIF 动图（可能返回了静态图、单帧或重复帧）。${failure} 返回结果已保留，请重试下载，不会重新生成。`)
  }
  return animations
}
