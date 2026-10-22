import type { GenerateImageParams, ImageGenerationResult, ImageProvider } from './geeknow'
import { fetchWithTimeout } from './_httpUtils'

const DEFAULT_BASE_URL = 'https://luocisheng.cn'
const POLL_INTERVAL_MS = 4000
const POLL_TIMEOUT_MS = 10 * 60 * 1000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const newKey = () => `seedream-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

function errorMessage(payload: any, fallback: string): string {
  if (typeof payload?.error === 'string') return payload.error
  if (typeof payload?.error?.message === 'string') return payload.error.message
  if (typeof payload?.message === 'string') return payload.message
  return fallback
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取洛辞返回的图片'))
    reader.onerror = () => reject(reader.error || new Error('无法读取洛辞返回的图片'))
    reader.readAsDataURL(blob)
  })
}

export class LuociImageProvider implements ImageProvider {
  name = '洛辞 API'
  private apiKey = ''
  private baseUrl = DEFAULT_BASE_URL
  private pendingKeys = new Map<string, string>()

  constructor(apiKey?: string, baseUrl?: string) {
    if (apiKey) this.apiKey = apiKey
    if (baseUrl) this.setBaseUrl(baseUrl)
  }

  setApiKey(key: string) { this.apiKey = key }
  setBaseUrl(url: string) { this.baseUrl = (url || DEFAULT_BASE_URL).trim().replace(/\/+$/, '').replace(/\/api\/v1$/i, '').replace(/\/api$/i, '') }

  async testAuth(apiKey: string) {
    if (!apiKey?.trim()) return { success: false, error: 'API Key 不能为空' }
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/api/v1/balance`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        timeoutMs: 15000,
      })
      if (res.ok) return { success: true }
      const payload = await res.json().catch(() => null)
      return { success: false, error: errorMessage(payload, `余额查询失败（HTTP ${res.status}）`) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '无法连接洛辞 API' }
    }
  }

  async generateImage(params: GenerateImageParams): Promise<ImageGenerationResult> {
    if (!this.apiKey) throw new Error('未配置 API Key')
    if (!params.prompt?.trim()) throw new Error('提示词不能为空')
    if (params.imageUrls?.length) throw new Error('Seedream 5 Pro API 文档当前未说明参考图字段，暂不支持参考图输入')

    const imageSize = params.imageSize === '1.5K' || params.imageSize === '2K' ? params.imageSize : '1K'
    const aspectRatio = params.aspectRatio || '1:1'
    if (!['1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '21:9'].includes(aspectRatio)) {
      throw new Error(`Seedream 5 Pro 不支持比例 ${aspectRatio}`)
    }
    const body = { modelId: params.model, prompt: params.prompt.trim(), numImages: params.n ?? 1, aspectRatio, imageSize }
    if (!Number.isInteger(body.numImages) || body.numImages < 1) throw new Error('生成数量必须是正整数')

    await this.request('/api/v1/images/quote', body)
    params.onProgress?.({ status: 'quoted', progress: 5 })

    // Keep the submission key when the response is lost so an identical retry cannot double-charge.
    const signature = JSON.stringify(body)
    let submitKey = this.pendingKeys.get(signature)
    if (!submitKey) {
      submitKey = newKey()
      this.pendingKeys.set(signature, submitKey)
    }
    const created = await this.request('/api/v1/images/generations', body, params.signal, { 'Idempotency-Key': submitKey })
    const taskId = created?.taskId
    if (typeof taskId !== 'string' || !taskId) throw new Error('洛辞 API 未返回 taskId，请核实任务状态后再重试')
    this.pendingKeys.delete(signature)
    params.onProgress?.({ status: 'queued', progress: 10 })

    const started = Date.now()
    while (Date.now() - started < POLL_TIMEOUT_MS) {
      if (params.signal?.aborted) throw new Error('已取消')
      await sleep(POLL_INTERVAL_MS)
      const response = await this.request(`/api/v1/tasks/${encodeURIComponent(taskId)}`, undefined, params.signal, {}, 'GET')
      const task = response?.task ?? response
      const status = String(task?.status || 'processing')
      if (status === 'succeeded' || status === 'partial') {
        const images = Array.isArray(task?.images) ? task.images : []
        const imagePaths = images.map((item: any) => item?.url).filter((url: any) => typeof url === 'string' && url)
        if (!imagePaths.length) throw new Error('洛辞任务已完成但没有返回图片')
        params.onProgress?.({ status, progress: 100 })
        const imageUrls = await Promise.all(imagePaths.map((path: string) => this.downloadImage(path, taskId, params.signal)))
        return { imageUrls }
      }
      if (status === 'failed') throw new Error(errorMessage(task, '洛辞图片任务失败'))
      const progress = Number(task?.progress)
      params.onProgress?.({ status, progress: Number.isFinite(progress) ? Math.min(95, Math.max(10, progress)) : 20 })
    }
    throw new Error('洛辞图片任务超时（10 分钟未完成）')
  }

  private async downloadImage(path: string, taskId: string, signal?: AbortSignal): Promise<string> {
    const url = new URL(path, `${this.baseUrl}/`).toString()
    if (new URL(url).origin !== new URL(this.baseUrl).origin) {
      throw new Error('洛辞 API 返回了非本站图片地址，已阻止向其他站点发送 API Key')
    }
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      externalSignal: signal,
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    if (!res.ok) throw new Error(`洛辞图片下载失败（HTTP ${res.status}，任务 ${taskId}）`)
    return blobToDataUrl(await res.blob())
  }

  private async request<T = any>(path: string, body?: unknown, signal?: AbortSignal, extraHeaders: Record<string, string> = {}, method = body ? 'POST' : 'GET'): Promise<T> {
    let res: Response
    try {
      res = await fetchWithTimeout(`${this.baseUrl}${path}`, {
        method,
        externalSignal: signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === '已取消' || msg.startsWith('请求超时')) throw err
      throw new Error(`无法连接到 ${this.baseUrl}：${msg}`)
    }
    const payload = await res.json().catch(() => null)
    if (!res.ok) {
      const code = String(payload?.code || '')
      const detail = errorMessage(payload, `HTTP ${res.status}`)
      if (res.status === 401) throw new Error('洛辞 API Key 无效或已撤销')
      if (res.status === 402) throw new Error('洛辞 API 积分不足，请先充值 API 积分')
      if (res.status === 404) throw new Error(`洛辞 API 资源不存在或不可访问：${detail}`)
      if (res.status === 409 || code === 'IDEMPOTENCY_CONFLICT') throw new Error(`洛辞 API 幂等键冲突：${detail}`)
      if (res.status === 429) throw new Error('洛辞 API 检测到无效密钥请求过于频繁，请稍后再试')
      if (res.status >= 500) throw new Error(`洛辞 API 暂时不可用（${res.status}）：${detail}`)
      throw new Error(`洛辞 API 请求失败（${res.status}）：${detail}`)
    }
    return payload as T
  }
}
