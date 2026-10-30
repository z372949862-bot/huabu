import type { GenerateImageParams, ImageGenerationResult, ImageProvider } from './geeknow'
import { PiapiProvider, PIAPI_BASE, publicMediaUrl, validateLocalFile } from './piapi'
import { urlToFile } from '../imageHost'
import { PIAPI_IMAGE_MODEL_TEMPLATES } from '../imageModelTemplates'
export const PIAPI_IMAGE_MODEL = 'seedream-5-pro-less-restriction'
const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('已取消', 'AbortError') }
export function seedreamImagePayload(params: GenerateImageParams, urls: string[] = params.imageUrls || []) {
  if (params.model !== PIAPI_IMAGE_MODEL) throw new Error('请选择 PiAPI 的 Seedream 5 Pro Less Restriction 图片模型')
  if (!params.prompt?.trim()) throw new Error('请输入图片提示词')
  const size = params.imageSize || '1K', ratio = params.aspectRatio || '1:1', format = params.imageOutputFormat || 'jpeg'
  if (!['1K', '2K'].includes(size)) throw new Error('PiAPI Seedream 5 Pro 仅支持 1K / 2K')
  if (!PIAPI_IMAGE_MODEL_TEMPLATES[0].capabilities.ratios.includes(ratio)) throw new Error('请选择 Seedream 5 Pro 支持的图片比例')
  if (!['jpeg', 'png'].includes(format)) throw new Error('请选择 JPEG 或 PNG 图片格式')
  if (params.n !== undefined && params.n !== 1) throw new Error('Seedream 5 Pro 每次生成一张图片，不支持 Lite 的批量出图参数')
  if (urls.length > 10) throw new Error(`Seedream 5 Pro 最多支持 10 张参考图片，当前 ${urls.length} 张`)
  return { model: 'seedream', task_type: PIAPI_IMAGE_MODEL, input: { prompt: params.prompt.trim(), size, aspect_ratio: ratio, output_format: format, ...(urls.length ? { image_urls: urls } : {}) } }
}
export function parseSeedreamImageTask(raw: any) {
  const data = raw?.data || raw, status = String(data?.status || '').toLowerCase()
  const taskId = typeof data?.task_id === 'string' && /^[A-Za-z0-9_-]+$/.test(data.task_id) ? data.task_id : undefined
  const output = data?.output || {}
  const urls = [...new Set([...(Array.isArray(output.image_urls) ? output.image_urls : []), output.image_url].filter(url => typeof url === 'string' && publicMediaUrl(url)))] as string[]
  const failed = ['failed', 'cancelled', 'canceled'].includes(status)
  const message = [data?.error?.message, data?.error?.raw_message, data?.error, data?.detail].find(item => typeof item === 'string' && item.trim())
  return { taskId, status, urls, failed, error: message || 'PiAPI 图片任务失败，请查看平台任务详情' }
}
const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  abort(signal)
  const cancelled = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')) }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', cancelled); resolve() }, ms)
  signal?.addEventListener('abort', cancelled, { once: true })
})
export class PiapiImageProvider implements ImageProvider {
  name = 'PiAPI · Seedream 5 Pro'
  private client: PiapiProvider
  constructor(private apiKey = '', baseUrl = PIAPI_BASE) { this.client = new PiapiProvider(apiKey, baseUrl) }
  setApiKey(key: string) { this.apiKey = key; this.client.setApiKey(key) }
  setBaseUrl(url: string) { this.client.setBaseUrl(url) }
  testAuth(key: string) { return this.client.testAuth(key) }
  async generateImage(params: GenerateImageParams): Promise<ImageGenerationResult> {
    this.client.validate(); abort(params.signal)
    let taskId = params.resumeTaskId, state: ReturnType<typeof parseSeedreamImageTask> | undefined
    if (!taskId) {
      const references = [...new Set((params.imageUrls || []).filter(Boolean))]
      seedreamImagePayload(params, references) // Validate before any uploads or billed calls.
      const files = new Map<string, File>()
      for (const url of references) {
        if (url.startsWith('asset://')) throw new Error('Seedream 图片接口使用参考图公网直链，不能使用 Seedance 的 asset:// 资产 ID')
        if (!publicMediaUrl(url)) {
          if (/^https?:/i.test(url)) throw new Error('Seedream 参考图片必须是可公开访问的直链')
          const file = await urlToFile(url); abort(params.signal); validateLocalFile(file, 'images'); files.set(url, file)
        }
      }
      params.onProgress?.({ status: 'preparing', progress: 5 })
      const urls: string[] = []
      for (const url of references) urls.push(await this.client.uploadAsset(url, async () => files.get(url), params.signal, 'images'))
      abort(params.signal)
      params.onProgress?.({ status: 'submitting', progress: 10 })
      const response = await this.client.request('/api/v1/task', seedreamImagePayload(params, urls))
      state = parseSeedreamImageTask(response); taskId = state.taskId
      // Save a returned task even if the user stopped waiting while POST was in flight.
      if (taskId) await params.onTask?.(taskId)
      abort(params.signal)
      if (!taskId && !state.failed) throw new Error('PiAPI 图片响应缺少任务 ID，请先到平台确认生成结果，避免重复付费提交')
    }
    const started = Date.now()
    while (true) {
      abort(params.signal)
      if (state?.failed) { await params.onTask?.(undefined); throw new Error(state.error) }
      if (state?.urls.length && (!state.status || state.status === 'completed')) {
        params.onProgress?.({ status: 'saving', progress: 95 })
        const imageUrls: string[] = []
        for (const imageUrl of state.urls) {
          abort(params.signal)
          const result = await window.electronAPI?.piapi?.downloadImage({ apiKey: this.apiKey, taskId, imageUrl })
          if (!result?.ok || !result.data?.path) throw new Error((result?.error || 'PiAPI 成图保存失败') + '；原任务已保留，可继续获取，不会重新生成')
          abort(params.signal)
          imageUrls.push('local-upload:///' + result.data.path.split(String.fromCharCode(92)).join('/'))
        }
        return { imageUrls }
      }
      if (!taskId) throw new Error('PiAPI 图片响应未返回成图或任务 ID，请先到平台核实，软件不会自动重提')
      if (Date.now() - started > 10 * 60 * 1000) throw new Error(`PiAPI 图片等待超时，保留任务 ${taskId}；点击继续查询，不会重新提交`)
      if (state) await delay(3000, params.signal)
      params.onProgress?.({ status: 'processing', progress: 15 })
      try { state = parseSeedreamImageTask(await this.client.request('/api/v1/task/' + encodeURIComponent(taskId))) }
      catch (error: any) { if (!error.retryable) throw error; await delay(5000, params.signal) }
    }
  }
}
