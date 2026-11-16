import type { GenerateImageParams, ImageGenerationResult } from './geeknow'
import { prepareReferenceImage } from '../imageProviderUtils'
import { findImageTemplate } from '../imageModelTemplates'

export interface LuociImagePending {
  requestKey: string
  body: { modelId: string; prompt: string; numImages: number; aspectRatio: string; imageSize: string; referenceImageIds?: string[] }
  taskId?: string
  estimatedPoints?: number
  providerId?: string
  model?: string
  prompt?: string
  ratio?: string
  resolution?: string
}
const abort = (signal?: AbortSignal) => { if (signal?.aborted) throw new Error('已取消') }
const unwrap = (result: any) => {
  if (!result?.ok) throw new Error(result?.error || '洛辞接口没有返回有效结果')
  return result.data
}
const wait = (signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  abort(signal)
  const cancel = () => { clearTimeout(timer); reject(new Error('已取消')) }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve() }, 4000)
  signal?.addEventListener('abort', cancel, { once: true })
})

export class Luoci55Client {
  // Used by callers without project persistence (for example the image editor).
  private pending = new Map<string, LuociImagePending>()

  async generate(params: GenerateImageParams, key: string, baseUrl: string): Promise<ImageGenerationResult> {
    if (baseUrl !== 'https://luocisheng.cn') throw new Error('Seedream 5.5 请使用洛辞官方地址 https://luocisheng.cn')
    const api = window.electronAPI?.luociImage
    if (!api) throw new Error('请使用更新后的桌面软件接入 Seedream 5.5')
    abort(params.signal)
    const signature = JSON.stringify([key, params.model, params.prompt, params.aspectRatio, params.imageSize, params.n, params.imageUrls])
    let pending = params.luociImageTask || (!params.onLuociImageTask ? this.pending.get(signature) : undefined)
    const save = async (state: LuociImagePending | undefined) => {
      if (!params.onLuociImageTask) { if (state) this.pending.set(signature, state); else this.pending.delete(signature) }
      await params.onLuociImageTask?.(state)
    }
    const request = async (route: string, body?: unknown, requestKey?: string) => unwrap(await api.request({ key, route, body: body ? JSON.parse(JSON.stringify(body)) : undefined, requestKey }))

    if (!pending) {
      if (!params.prompt?.trim()) throw new Error('提示词不能为空')
      const imageSize = params.imageSize || '2K', aspectRatio = params.aspectRatio || 'auto'
      if (!['1K', '1.5K', '2K'].includes(imageSize)) throw new Error('Seedream 5.5 仅支持 1K / 1.5K / 2K')
      if (!findImageTemplate('seedream-5-5', 'luoci')!.capabilities.ratios.includes(aspectRatio)) throw new Error('请选择 Seedream 5.5 支持的画幅')
      const numImages = params.n ?? 1
      if (!Number.isInteger(numImages) || numImages < 1) throw new Error('生成数量必须是正整数')
      const sources = params.imageUrls || []
      if (sources.length > 10) throw new Error('Seedream 5.5 最多支持 10 张参考图片')
      const files: { base64: string; mime: string; name: string }[] = []
      for (const source of sources) {
        abort(params.signal)
        const image = await prepareReferenceImage(source, { compress: false })
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) throw new Error('参考图片仅支持 PNG、JPEG、WebP')
        const size = atob(image.base64).length
        if (!size || size > 30 * 1024 * 1024) throw new Error('参考图片不能为空，单张最多 30MB')
        files.push({ base64: image.base64, mime: image.mimeType, name: `reference-${files.length + 1}.${image.mimeType.split('/')[1]}` })
      }
      const referenceImageIds: string[] = []
      for (const file of files) {
        abort(params.signal)
        params.onProgress?.({ status: 'uploading', progress: 5 })
        const uploaded = unwrap(await api.upload({ key, modelId: 'seedream-5-5', ...file }))
        if (typeof uploaded?.id !== 'string' || !uploaded.id) throw new Error('洛辞参考图确认未返回素材 ID')
        referenceImageIds.push(uploaded.id)
      }
      abort(params.signal)
      const body = { modelId: 'seedream-5-5', prompt: params.prompt.trim(), numImages, aspectRatio, imageSize,
        ...(referenceImageIds.length ? { referenceImageIds } : {}) }
      const quote = await request('/api/v1/images/quote', body)
      abort(params.signal)
      if (!Number.isFinite(quote?.estimatedPoints) || quote.estimatedPoints < 0) throw new Error('洛辞未返回有效报价，未提交生成')
      pending = { body, requestKey: `seedream-${crypto.randomUUID()}`, estimatedPoints: quote.estimatedPoints }
    }
    if (!pending.taskId) {
      // Also retry persistence after an earlier disk failure before sending POST.
      await save(pending)
      abort(params.signal)
      const created = await request('/api/v1/images/generations', pending.body, pending.requestKey)
      if (typeof created?.taskId !== 'string' || !created.taskId) throw new Error('洛辞未返回任务号；提交记录已保留，请继续查询或先到平台核实')
      pending = { ...pending, taskId: created.taskId }
      await save(pending) // Save even if cancellation happened during submission.
    }
    const taskId = pending.taskId!
    const started = Date.now()
    while (Date.now() - started < 10 * 60 * 1000) {
      abort(params.signal)
      const response = await request('/api/v1/tasks/' + encodeURIComponent(taskId))
      abort(params.signal)
      const task = response?.task ?? response
      if (task.status === 'failed') {
        await save(undefined)
        throw new Error(typeof task.error === 'string' ? task.error : task.error?.message || '洛辞图片生成失败')
      }
      if (['succeeded', 'partial'].includes(task.status) && task.settled === true) {
        const urls = (Array.isArray(task.images) ? task.images : []).map((item: any) => item?.url).filter((url: any) => typeof url === 'string' && url)
        if (!urls.length) throw new Error('洛辞任务没有返回图片；任务已保留，请到平台核实')
        const imageUrls: string[] = []
        for (const url of urls) {
          abort(params.signal)
          const result = unwrap(await api.download({ key, taskId, url }))
          if (!result?.dataUrl?.startsWith('data:image/')) throw new Error('洛辞图片下载失败；任务已保留，可继续下载')
          imageUrls.push(result.dataUrl)
        }
        abort(params.signal)
        if (!params.onLuociImageTask) this.pending.delete(signature)
        // Project caller clears the pending task only after persisting the images.
        return { imageUrls }
      }
      params.onProgress?.({ status: task.status || 'processing', progress: 15 })
      await wait(params.signal)
    }
    throw new Error(`洛辞图片等待超时，任务 ${taskId} 已保存，可继续查询`)
  }
}
