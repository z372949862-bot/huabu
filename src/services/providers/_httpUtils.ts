// src/services/providers/_httpUtils.ts
/**
 * 共享 HTTP 工具：
 *  - fetchWithTimeout：120s 内部超时 + 外部 AbortSignal 合并，返回 Response
 *  - classifyHttpError：HTTP 状态码映射成中文错误信息
 * 给 geeknow.ts / chuhaiying.ts 共用，避免每个 provider 重复同一份样板。
 */

export interface FetchOpts extends RequestInit {
  /** 请求超时（毫秒），默认 120s */
  timeoutMs?: number
  /** 外部取消信号；和内部超时合并，谁先触发都中止 fetch */
  externalSignal?: AbortSignal
}

/**
 * fetch 包装：
 *  - 超时：默认 120s 后自动 abort，抛"请求超时（X 秒未响应）..."
 *  - 外部 signal：abort 时抛"已取消"，便于上层据此跳过错误 toast
 */
export async function fetchWithTimeout(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 120_000, externalSignal, ...rest } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (externalSignal?.aborted) throw new Error('已取消')
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)} 秒未响应），中转站负载过高，请稍后重试`)
    }
    throw err
  } finally {
    clearTimeout(timer)
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
  }
}

/**
 * HTTP 状态码 → 人类可读错误信息。所有 image provider 共用同一份映射，
 * 让 401/429/524/5xx 在不同 provider 报错文案完全一致。
 */
export function classifyHttpError(status: number, detail: string): string {
  if (status === 401) return 'API Key 无效或已过期'
  if (status === 429) return '已限流，请稍后重试'
  if (status === 524) return '中转站网关超时（524），服务器处理过久或负载过高，请稍后重试'
  if (status >= 500) return `网关错误 ${status}：${detail}`
  return `请求失败 ${status}：${detail}`
}
