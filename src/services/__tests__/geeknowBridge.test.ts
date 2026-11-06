// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
const register = createRequire(import.meta.url)('../../../electron/geeknow.cjs')
const event = { sender: { id: 10 } }
const input = { url: 'https://www.geeknow.top/v1/images/generations', apiKey: 'fake-key', requestId: 'request-1', body: { model: 'gpt-image-2.6-sunburst', prompt: 'test', size: '1536x864', image: ['reference-base64'] } }
function setup(timeoutMs = 300000) {
  const handlers = new Map<string, Function>()
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'https://example.com/image.png' }] })))
  register({ ipcMain: { handle: (key: string, fn: Function) => handlers.set(key, fn) }, fetch, timeoutMs })
  return { fetch, request: handlers.get('geeknow:request')!, cancel: handlers.get('geeknow:cancel')! }
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
describe('GeekNow desktop generation bridge', () => {
  it('sends the configured request once with references and never follows credential-bearing redirects', async () => {
    const { fetch, request } = setup()
    const result = await request(event, input)
    expect(result).toEqual({ ok: true, data: { data: [{ url: 'https://example.com/image.png' }] } })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe(input.url)
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit', headers: { Authorization: 'Bearer fake-key', 'Content-Type': 'application/json' } })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(input.body)
  })
  it('returns HTTP and certificate errors without automatically retrying generation', async () => {
    const { fetch, request } = setup()
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'invalid key' } }), { status: 401 }))
    expect(await request(event, input)).toEqual({ ok: false, status: 401, error: 'invalid key' })
    fetch.mockRejectedValueOnce(new Error('net::ERR_CERT_COMMON_NAME_INVALID'))
    expect(await request(event, input)).toMatchObject({ ok: false, error: expect.stringContaining('ERR_CERT_COMMON_NAME_INVALID') })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('rejects unrelated URLs, malformed keys and invalid request IDs before network I/O', async () => {
    const { fetch, request } = setup()
    for (const change of [{ url: 'file:///C:/secret' }, { url: 'https://example.com/v1/chat/completions' }, { url: 'https://name:password@example.com/v1/images/generations' }, { apiKey: 'key with spaces' }, { requestId: '../invalid' }]) {
      expect((await request(event, { ...input, ...change })).ok).toBe(false)
    }
    expect(fetch).not.toHaveBeenCalled()
  })
  it('deduplicates a pending request and only lets its renderer cancel it', async () => {
    const { fetch, request, cancel } = setup()
    fetch.mockImplementation((_url: string, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))))
    const running = request(event, input)
    expect((await request(event, input)).error).toContain('正在处理中')
    await cancel({ sender: { id: 11 } }, { requestId: input.requestId })
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false)
    await cancel(event, { requestId: input.requestId })
    expect(await running).toMatchObject({ ok: false, cancelled: true })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('keeps timeout active through reading the response body', async () => {
    const { fetch, request } = setup(10)
    fetch.mockImplementation(async (_url: string, { signal }: { signal: AbortSignal }) => new Response(new ReadableStream({
      start(controller) { signal.addEventListener('abort', () => controller.error(new Error('aborted'))) },
    })))
    expect(await request(event, input)).toMatchObject({ ok: false, error: expect.stringContaining('请求超时') })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
