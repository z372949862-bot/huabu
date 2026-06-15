/**
 * 出海营（chuhaiying）图片中转 API 客户端。base URL: https://api.aiid.edu.kg
 *
 * 两条路径并存：
 *  - 同步：POST /v1/images/generations，nano-banana / seedream / kling 等模型走这里
 *  - 异步：POST /v1/responses + tools=[image_generation] + background=true，然后
 *    轮询 GET /v1/responses/{id}。仅 gpt-image-2-2k / gpt-image-2-4k / nano-banana-pro
 *    走这条，能拿到真实进度（status: queued → in_progress → completed/failed）。
 *
 * 是否走异步看模板里的 asyncEndpoint 字段；不在模板里的模型默认走同步。
 */

import {
  findImageTemplate,
  ratioToSize,
  type ImageModelTemplate,
} from '../imageModelTemplates'
import type {
  GenerateImageParams,
  ImageGenerationResult,
  ImageProvider,
} from './geeknow'
import { prepareReferenceImage } from '../imageProviderUtils'
import { fetchWithTimeout, classifyHttpError } from './_httpUtils'

const DEFAULT_BASE_URL = 'https://api.aiid.edu.kg'
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

/** 把任何形式的图片 URL 规范成"裸 base64 字符串 + mimeType"。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Responses API 失败时的 error 字段形状不固定，挨个尝试取最有用的人类可读信息。 */
function extractAsyncErrorMessage(poll: any, status: string): string {
  const err = poll?.error
  // 1) 字符串：直接用
  if (typeof err === 'string' && err.trim()) return err.trim()
  // 2) 对象：message > reason > code+type 组合
  if (err && typeof err === 'object') {
    if (typeof err.message === 'string' && err.message.trim()) return err.message.trim()
    if (typeof err.reason === 'string' && err.reason.trim()) return err.reason.trim()
    const codeType = [err.code, err.type].filter(Boolean).join(' / ')
    if (codeType) return `网关错误代码: ${codeType}`
    // 实在没有，把整个 error 对象 JSON 化让用户至少看到原文
    try {
      const json = JSON.stringify(err)
      if (json && json !== '{}') return `网关原始错误: ${json}`
    } catch {}
  }
  // 3) incomplete_details.reason
  const incompleteReason = poll?.incomplete_details?.reason
  if (typeof incompleteReason === 'string' && incompleteReason.trim()) {
    return incompleteReason.trim()
  }
  // 4) 上游审核常见信号：metadata 里可能藏 content_policy_violation 之类
  const metaErr = poll?.metadata?.error || poll?.metadata?.error_message
  if (typeof metaErr === 'string' && metaErr.trim()) return metaErr.trim()
  // 5) 兜底：明确告知是哪种 status，方便对照文档判断
  return `任务状态 ${status}（网关未返回详细错误，常见原因：版权 IP / NSFW 触发审核 / 模型权限未开通 / prompt 违规）`
}

export class ChuhaiyingImageProvider implements ImageProvider {
  name = '出海营'
  private apiKey = ''
  private baseUrl = DEFAULT_BASE_URL

  constructor(apiKey?: string, baseUrl?: string) {
    if (apiKey) this.apiKey = apiKey
    if (baseUrl) this.baseUrl = this.normalizeBaseUrl(baseUrl)
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = this.normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL)
  }

  /** 用户填的 URL 末尾若带 /v1，剥掉，端点拼接由内部完成 */
  private normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  async testAuth(apiKey: string) {
    if (!apiKey || typeof apiKey !== 'string') {
      return { success: false, error: 'API Key 不能为空' }
    }
    if (!apiKey.startsWith('sk-')) {
      return { success: false, error: 'API Key 格式不正确，应以 sk- 开头' }
    }
    if (apiKey.length < 20) {
      return { success: false, error: 'API Key 长度过短' }
    }
    return { success: true }
  }

  async generateImage(params: GenerateImageParams): Promise<ImageGenerationResult> {
    if (!this.apiKey) throw new Error('未配置 API Key')
    if (!params.prompt) throw new Error('提示词不能为空')

    const tpl = findImageTemplate(params.model, 'chuhaiying')

    if (tpl?.asyncEndpoint) {
      return this.callAsyncResponses(params, tpl)
    }
    return this.callSyncGenerations(params, tpl)
  }

  // ---------- 同步：/v1/images/generations ----------

  private async callSyncGenerations(
    params: GenerateImageParams,
    tpl: ImageModelTemplate | undefined
  ): Promise<ImageGenerationResult> {
    // 同步路径没法拿到中间进度（HTTP 一直阻塞到完成），故意不调 onProgress，
    // 让 node.ts 那边的"假进度兜底定时器"接管动画，否则进度条会卡死在 30%。
    // 异步 callAsyncResponses 才上报真实进度。

    const want2K = params.imageSize === '2K'
    const ratio = params.aspectRatio || '16:9'

    const body: Record<string, any> = {
      model: params.model,
      prompt: params.prompt,
      n: params.n ?? 1,
    }
    if (params.seed && params.seed > 0) body.seed = params.seed
    if (params.negativePrompt && params.negativePrompt.trim()) {
      body.negative_prompt = params.negativePrompt.trim()
    }

    // kling 系列需要 model_name
    if (tpl?.modelName) {
      body.model_name = tpl.modelName
      body.aspect_ratio = ratio
    } else {
      body.size = ratioToSize(ratio, want2K)
    }

    // 参考图：按模板指定字段名（默认 image）；模型不支持参考图就跳过
    if (params.imageUrls?.length && tpl?.supportsReferenceImage !== false) {
      const field = tpl?.refImageField || 'image'
      // 多图参考时压到 1024px JPEG 0.85，避免请求体过大触发 413；单图保留原图
      const shouldCompress = params.imageUrls.length > 1
      const dataUrls: string[] = []
      for (const url of params.imageUrls) {
        const { dataUrl } = await prepareReferenceImage(url, { compress: shouldCompress })
        dataUrls.push(dataUrl)
      }
      if (field === 'image') {
        // 单图字段：取第一张
        body.image = dataUrls[0]
      } else {
        body[field] = dataUrls
      }
    }

    const url = `${this.baseUrl}/v1/images/generations`
    const data = await this.request<any>(url, body, params.signal)

    return { imageUrls: this.extractOpenAIImages(data) }
  }

  private extractOpenAIImages(data: any): string[] {
    const items = Array.isArray(data?.data) ? data.data : []
    const out: string[] = []
    for (const item of items) {
      if (typeof item?.b64_json === 'string' && item.b64_json.length) {
        out.push(`data:image/png;base64,${item.b64_json}`)
      } else if (typeof item?.url === 'string' && item.url.length) {
        out.push(item.url)
      }
    }
    if (out.length === 0) throw new Error('出海营未返回有效图片')
    return out
  }

  // ---------- 异步：/v1/responses + 轮询 ----------

  private async callAsyncResponses(
    params: GenerateImageParams,
    tpl: ImageModelTemplate
  ): Promise<ImageGenerationResult> {
    params.onProgress?.({ status: 'queued', progress: 5 })

    // 构造 input：有参考图时发多模态数组，否则发纯文本
    let input: any = params.prompt
    if (params.imageUrls?.length && tpl?.supportsReferenceImage !== false) {
      const content: any[] = []
      // 多图参考时压到 1024px JPEG 0.85，避免请求体过大触发 413；单图保留原图
      const shouldCompress = params.imageUrls.length > 1
      for (const url of params.imageUrls) {
        const { dataUrl } = await prepareReferenceImage(url, { compress: shouldCompress })
        content.push({
          type: 'input_image',
          image_url: dataUrl,
        })
      }
      content.push({ type: 'input_text', text: params.prompt })
      input = [{ role: 'user', content }]
    }

    // 1) 创建任务
    const createBody: Record<string, any> = {
      model: params.model,
      input,
      stream: false,
      tools: [{ type: 'image_generation' }],
      background: true,
    }
    // kling 系列需要 model_name
    if (tpl?.modelName) createBody.model_name = tpl.modelName
    if (params.seed && params.seed > 0) createBody.seed = params.seed
    if (params.negativePrompt && params.negativePrompt.trim()) {
      createBody.negative_prompt = params.negativePrompt.trim()
    }

    const createRes = await this.request<any>(
      `${this.baseUrl}/v1/responses`,
      createBody,
      params.signal
    )
    const responseId: string | undefined = createRes?.id
    if (!responseId) {
      throw new Error('出海营异步任务未返回 response id')
    }

    // 2) 轮询，把 queued/in_progress 阶段做成 5→90 缓慢爬升
    const started = Date.now()
    let progress = 10
    while (true) {
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        throw new Error('出海营异步任务超时（5 分钟未返回）')
      }
      await sleep(POLL_INTERVAL_MS)
      if (params.signal?.aborted) {
        throw new Error('已取消')
      }
      const poll = await this.requestGet<any>(
        `${this.baseUrl}/v1/responses/${encodeURIComponent(responseId)}`,
        params.signal
      )
      const status: string = poll?.status || 'in_progress'

      if (status === 'completed') {
        params.onProgress?.({ status: 'completed', progress: 100 })
        return { imageUrls: this.extractResponseImages(poll) }
      }
      if (status === 'failed' || status === 'incomplete') {
        const errMsg = extractAsyncErrorMessage(poll, status)
        throw new Error(`出海营异步任务失败：${errMsg}`)
      }
      // queued / in_progress：缓慢爬升进度
      progress = Math.min(90, progress + (status === 'in_progress' ? 8 : 3))
      params.onProgress?.({ status, progress })
    }
  }

  /** Responses API 返回的图片可能落在 output[].url、output[].content[].image_url.url 等位置 */
  private extractResponseImages(data: any): string[] {
    const out: string[] = []
    const output = Array.isArray(data?.output) ? data.output : []
    for (const item of output) {
      // 直接 url
      if (typeof item?.url === 'string' && item.url.length) {
        out.push(item.url)
        continue
      }
      // content 数组里的 image_url / image_generation_call
      const content = Array.isArray(item?.content) ? item.content : []
      for (const c of content) {
        const u =
          c?.image_url?.url
          || c?.image?.url
          || (typeof c?.image_url === 'string' ? c.image_url : null)
          || (typeof c?.b64_json === 'string' ? `data:image/png;base64,${c.b64_json}` : null)
        if (typeof u === 'string' && u.length) out.push(u)
      }
      // image_generation_call 结构
      const result = item?.result
      if (typeof result?.url === 'string') out.push(result.url)
      if (typeof result?.b64_json === 'string') {
        out.push(`data:image/png;base64,${result.b64_json}`)
      }
    }
    if (out.length === 0) {
      throw new Error('出海营异步任务完成但未返回图片 URL')
    }
    return out
  }

  // ---------- HTTP 通用 ----------

  private async request<T>(url: string, body: any, externalSignal?: AbortSignal): Promise<T> {
    let res: Response
    try {
      res = await fetchWithTimeout(url, {
        method: 'POST',
        externalSignal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '')
      if (msg === '已取消' || msg.startsWith('请求超时')) throw err
      throw new Error(`无法连接到 ${this.baseUrl}：${msg || '网络错误'}`)
    }
    return this.parseResponse<T>(res)
  }

  private async requestGet<T>(url: string, externalSignal?: AbortSignal): Promise<T> {
    let res: Response
    try {
      res = await fetchWithTimeout(url, {
        method: 'GET',
        externalSignal,
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '')
      if (msg === '已取消' || msg.startsWith('请求超时')) throw err
      throw new Error(`无法连接到 ${this.baseUrl}：${msg || '网络错误'}`)
    }
    return this.parseResponse<T>(res)
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let detail = ''
      try {
        const json = await res.json()
        detail = json?.error?.message || json?.message || JSON.stringify(json)
      } catch {
        try { detail = await res.text() } catch { detail = res.statusText }
      }
      throw new Error(classifyHttpError(res.status, detail))
    }
    return res.json() as Promise<T>
  }
}
