/**
 * LLM 文本聊天 Provider。走 OpenAI 兼容 /v1/chat/completions 端点。
 * 供 ai-text 节点使用。
 */

export interface ChatCompletionParams {
  model: string
  prompt: string
  systemPrompt?: string
  imageUrls?: string[]
  maxTokens?: number
  temperature?: number
  enableThinking?: string | boolean
  onProgress?: (info: { status: string; progress: number }) => void
}

export interface ChatCompletionResult {
  text: string
  reasoning?: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  model?: string
}

import { chatEndpoint, type TextProviderKind } from '../chatModelTemplates'

export interface LLMProvider {
  name: string
  setApiKey(key: string): void
  setBaseUrl(url: string): void
  setKind(kind: string): void
  chat(params: ChatCompletionParams): Promise<ChatCompletionResult>
  testAuth(apiKey: string): Promise<{ success: boolean; error?: string }>
}

const DEFAULT_BASE_URL: Record<TextProviderKind, string> = {
  openaichat: 'https://api.geeknow.ai',
  deepseek: 'https://api.deepseek.com',
}

export class OpenAIChatProvider implements LLMProvider {
  name = 'OpenAI Chat'
  private apiKey = ''
  private baseUrl = DEFAULT_BASE_URL.openaichat
  private kind: TextProviderKind = 'openaichat'

  constructor(apiKey?: string, baseUrl?: string, kind?: TextProviderKind) {
    if (apiKey) this.apiKey = apiKey
    if (kind) this.kind = kind
    if (baseUrl) this.baseUrl = this.normalizeBaseUrl(baseUrl)
  }

  setApiKey(apiKey: string) { this.apiKey = apiKey }
  setBaseUrl(baseUrl: string) {
    this.baseUrl = this.normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL[this.kind] || 'https://api.geeknow.ai')
  }
  setKind(kind: string) { this.kind = kind as TextProviderKind }

  private normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  }

  async testAuth(apiKey: string) {
    if (!apiKey?.startsWith('sk-')) return { success: false, error: 'API Key 格式不正确，应以 sk- 开头' }
    if (apiKey.length < 20) return { success: false, error: 'API Key 长度过短' }
    return { success: true }
  }

  async chat(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    if (!this.apiKey) throw new Error('未配置 API Key')
    if (!params.prompt) throw new Error('提示词不能为空')

    // 有参考图时构建多模态消息
    let userContent: string | Array<Record<string, any>> = params.prompt
    if (params.imageUrls?.length) {
      const parts: Record<string, any>[] = []
      for (const url of params.imageUrls) {
        parts.push({ type: 'image_url', image_url: { url } })
      }
      parts.push({ type: 'text', text: params.prompt })
      userContent = parts
    }

    const messages = [
      ...(params.systemPrompt ? [{ role: 'system' as const, content: params.systemPrompt }] : []),
      { role: 'user' as const, content: userContent },
    ]

    const body: Record<string, any> = { model: params.model, messages }
    if (params.maxTokens) body.max_tokens = params.maxTokens
    if (params.temperature != null) body.temperature = params.temperature
    if (params.enableThinking) body.reasoning_effort = typeof params.enableThinking === 'string' ? params.enableThinking : 'medium'

    params.onProgress?.({ status: 'running', progress: 30 })

    const endpoint = chatEndpoint(this.kind)
    const data = await this.request<any>(`${this.baseUrl}${endpoint}`, body)

    params.onProgress?.({ status: 'completed', progress: 100 })

    const msg = data?.choices?.[0]?.message
    return {
      text: msg?.content || '',
      reasoning: msg?.reasoning_content || undefined,
      usage: data?.usage ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      } : undefined,
      model: data?.model,
    }
  }

  private async request<T>(url: string, body: any): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)

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
        throw new Error('请求超时（30 秒未响应）')
      }
      throw new Error(`无法连接到 ${this.baseUrl}：${(err as Error)?.message || '网络错误'}`)
    }
    clearTimeout(timer)

    if (!res.ok) {
      let detail = ''
      try { const j = await res.json(); detail = j?.error?.message || j?.message || JSON.stringify(j) } catch { detail = res.statusText }
      if (res.status === 401) throw new Error('API Key 无效或已过期')
      if (res.status === 429) throw new Error('已限流，请稍后重试')
      if (res.status >= 500) throw new Error(`网关错误 ${res.status}：${detail}`)
      throw new Error(`请求失败 ${res.status}：${detail}`)
    }
    return res.json() as Promise<T>
  }
}
