/**
 * GeekNow 图片中转 API 客户端。
 *
 * 8 个模型按前缀分流到两条 endpoint：
 *  - openai 风格（doubao / grok / gpt-image）：POST {baseUrl}/v1/images/generations
 *  - gemini 风格（gemini-*）：POST {baseUrl}/v1beta/models/{model}:generateContent
 *
 * 参考图统一传 base64（不传 https URL，因为 Grok 不支持，统一行为更可控）。
 * 调用方拿到本地 blob: URL 应该先转 base64 再传进来。
 */

import {
  findImageTemplate,
  ratioToSize,
  type ImageModelTemplate,
} from '../imageModelTemplates'
import { urlToBase64, compressImageToDataUrl } from '../imageProviderUtils'

export interface GenerateImageParams {
  model: string
  prompt: string
  /** 参考图：可以是 https URL、blob:、data:image/...;base64,xxx 或裸 base64。
   *  blob/data 都会在调用方转好后再传进来。 */
  imageUrls?: string[]
  /** 期望比例，例如 '16:9'。模型不支持时调用方自行兜底。 */
  aspectRatio?: string
  /** 期望分辨率档位，'1K' / '2K'。Gemini 3 Pro 才支持 2K。 */
  imageSize?: '1K' | '2K' | '4K'
  /** 出图数量（OpenAI 兼容路径用），默认 1。 */
  n?: number
  /** Negative prompt（保留位，目前 GeekNow 不读）。 */
  negativePrompt?: string
  /**
   * 进度回调；走异步队列的 provider（如 chuhaiying 的 /v1/responses）会持续上报真实进度。
   * 同步 provider 可忽略。progress 取值 0~100。
   */
  onProgress?: (info: { status: string; progress: number }) => void
}

export interface ImageGenerationResult {
  /** 直接可塞 <img src> 用：可能是 https URL，也可能是 data:image/...;base64,xxx。 */
  imageUrls: string[]
}

export interface ImageProvider {
  name: string
  setApiKey(key: string): void
  setBaseUrl(url: string): void
  generateImage(params: GenerateImageParams): Promise<ImageGenerationResult>
  testAuth(apiKey: string): Promise<{ success: boolean; error?: string }>
}

const DEFAULT_BASE_URL = 'https://api.geeknow.ai'

export class GeekNowImageProvider implements ImageProvider {
  name = 'GeekNow'
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

  /** 用户填的 URL 末尾若带 /v1 或 /v1beta，剥掉，端点拼接由内部完成 */
  private normalizeBaseUrl(url: string): string {
    let u = url.trim().replace(/\/+$/, '')
    u = u.replace(/\/v1beta$/, '').replace(/\/v1$/, '')
    return u
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

    const tpl = findImageTemplate(params.model, 'geeknow')
    const style: 'openai' | 'gemini' = tpl?.endpointStyle
      || (params.model.startsWith('gemini-') ? 'gemini' : 'openai')

    if (style === 'gemini') return this.callGemini(params, tpl)
    return this.callOpenAIStyle(params, tpl)
  }

  // ---------- Gemini 风格 ----------

  private async callGemini(
    params: GenerateImageParams,
    tpl: ImageModelTemplate | undefined
  ): Promise<ImageGenerationResult> {
    const parts: any[] = [{ text: params.prompt }]
    if (params.imageUrls?.length) {
      const shouldCompress = params.imageUrls.length > 1
      for (const url of params.imageUrls) {
        const { base64, mimeType } = await urlToBase64(url)
        if (shouldCompress) {
          const dataUrl = await compressImageToDataUrl(base64, mimeType)
          const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
          if (m) {
            parts.push({ inlineData: { mimeType: m[1], data: m[2] } })
          } else {
            parts.push({ inlineData: { mimeType, data: base64 } })
          }
        } else {
          parts.push({ inlineData: { mimeType, data: base64 } })
        }
      }
    }

    const want2K = params.imageSize === '2K' && tpl?.supportsImageSize2K === true

    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        temperature: 1.0,
        topP: 0.95,
        maxOutputTokens: 8192,
        imageConfig: {
          aspectRatio: params.aspectRatio || '1:1',
          imageSize: want2K ? '2K' : '1K',
        },
      },
    }

    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(params.model)}:generateContent`
    const data = await this.request<any>(url, body)
    return { imageUrls: this.extractGeminiImages(data) }
  }

  /** Gemini 响应里图片可能藏在多个位置，按优先级提取 */
  private extractGeminiImages(data: any): string[] {
    const out: string[] = []
    const candidates = data?.candidates ?? []
    for (const cand of candidates) {
      const innerParts = cand?.content?.parts ?? []
      for (const part of innerParts) {
        // 1) inlineData.data 是 base64 或 https URL
        const inline = part?.inlineData?.data
        if (typeof inline === 'string' && inline.length) {
          if (inline.startsWith('http')) {
            out.push(inline)
          } else if (inline.startsWith('data:')) {
            out.push(inline)
          } else {
            const mime = part?.inlineData?.mimeType || 'image/png'
            out.push(`data:${mime};base64,${inline}`)
          }
          continue
        }
        // 2) text 里的 markdown 图片或 data URL
        if (typeof part?.text === 'string') {
          const md = part.text.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)
          if (md) {
            for (const m of md) {
              const u = m.match(/\((https?:\/\/[^)]+)\)/)?.[1]
              if (u) out.push(u)
            }
          }
          const dataUrlMatch = part.text.match(/data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+/g)
          if (dataUrlMatch) out.push(...dataUrlMatch)
        }
      }
    }
    if (out.length === 0) {
      throw new Error('Gemini 未返回有效图片（请检查 prompt 或参考图）')
    }
    return out
  }

  // ---------- OpenAI 兼容风格（doubao / grok / gpt-image） ----------

  private async callOpenAIStyle(
    params: GenerateImageParams,
    tpl: ImageModelTemplate | undefined
  ): Promise<ImageGenerationResult> {
    const want2K = params.imageSize === '2K'
    const size = ratioToSize(params.aspectRatio || '16:9', want2K)
    const isGptImage = params.model.startsWith('gpt-image-')

    const body: Record<string, any> = {
      model: params.model,
      prompt: params.prompt,
      n: params.n ?? 1,
      size,
    }

    // 参考图：传成 base64 数组（去掉 data: 前缀，按裸 base64 发）
    if (params.imageUrls?.length && tpl?.supportsReferenceImage !== false) {
      const arr: string[] = []
      // 多图参考时压到 1024px JPEG 0.85，避免请求体过大触发 413；单图保留原图
      const shouldCompress = params.imageUrls.length > 1
      for (const url of params.imageUrls) {
        const { base64, mimeType } = await urlToBase64(url)
        if (shouldCompress) {
          const dataUrl = await compressImageToDataUrl(base64, mimeType)
          const m = dataUrl.match(/^data:[^;]+;base64,(.*)$/)
          arr.push(m ? m[1] : base64)
        } else {
          arr.push(base64)
        }
      }
      body.image = arr
    }

    if (isGptImage) {
      body.quality = 'high'
      body.response_format = 'url'
    }

    const url = `${this.baseUrl}/v1/images/generations`
    const data = await this.request<any>(url, body)
    return { imageUrls: this.extractOpenAIImages(data) }
  }

  private extractOpenAIImages(data: any): string[] {
    const items = Array.isArray(data?.data) ? data.data : []
    const out: string[] = []
    for (const item of items) {
      // 优先 b64_json，其次 url
      if (typeof item?.b64_json === 'string' && item.b64_json.length) {
        out.push(`data:image/png;base64,${item.b64_json}`)
      } else if (typeof item?.url === 'string' && item.url.length) {
        out.push(item.url)
      }
    }
    if (out.length === 0) throw new Error('GeekNow 未返回有效图片')
    return out
  }

  // ---------- HTTP 通用 ----------

  private async request<T>(url: string, body: any): Promise<T> {
    // 120 秒超时（图片生成可能较慢）
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('请求超时（120 秒未响应），中转站可能负载过高，请稍后重试')
      }
      const msg = (err instanceof Error ? err.message : '') || String(err || '')
      if (/524|server error|timeout/i.test(msg)) {
        throw new Error('中转站网关超时（524），服务器处理过久或负载过高，请稍后重试')
      }
      throw new Error(`无法连接到 ${this.baseUrl}：${msg || '网络错误'}`)
    }
    clearTimeout(timer)

    if (!res.ok) {
      let detail = ''
      try {
        const json = await res.json()
        detail = json?.error?.message || json?.message || JSON.stringify(json)
      } catch {
        try {
          detail = await res.text()
        } catch {
          detail = res.statusText
        }
      }
      if (res.status === 401) throw new Error('API Key 无效或已过期')
      if (res.status === 429) throw new Error('已限流，请稍后重试')
      if (res.status === 524) throw new Error('中转站网关超时（524），服务器处理过久或负载过高，请稍后重试')
      if (res.status >= 500) throw new Error(`网关错误 ${res.status}：${detail}`)
      throw new Error(`请求失败 ${res.status}：${detail}`)
    }

    return res.json() as Promise<T>
  }
}
