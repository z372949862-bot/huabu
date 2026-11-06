// Use Chromium's desktop network/proxy stack without renderer CORS.
// A generation POST is sent exactly once; never retry it through another host.
module.exports = function registerGeekNow({ ipcMain, fetch, timeoutMs = 300000 }) {
  const requests = new Map()
  ipcMain.handle('geeknow:request', async (event, payload = {}) => {
    let timer, requestKey
    try {
      const { url: address, apiKey, body, requestId } = payload
      const url = new URL(address)
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('GeekNow 接口地址无效')
      if (!url.pathname.endsWith('/v1/images/generations') && !/\/v1beta\/models\/[^/]+:generateContent$/.test(url.pathname)) throw new Error('不支持的 GeekNow 图片接口')
      if (!apiKey || typeof apiKey !== 'string' || /[^!-~]/.test(apiKey)) throw new Error('GeekNow API Key 不能为空，且不能含空格、中文或换行')
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('GeekNow 图片请求参数无效')
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(requestId)) throw new Error('GeekNow 请求标识无效')
      requestKey = `${event.sender.id}:${requestId}`
      if (requests.has(requestKey)) { requestKey = undefined; throw new Error('该请求正在处理中，请勿重复提交') }
      const controller = new AbortController()
      const pending = { controller, cancelled: false, timedOut: false }
      requests.set(requestKey, pending)
      timer = setTimeout(() => { pending.timedOut = true; controller.abort() }, timeoutMs)
      try {
        const response = await fetch(url.href, {
          method: 'POST', redirect: 'error', credentials: 'omit', signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const text = await response.text()
        let data
        try { data = JSON.parse(text) } catch {
          return { ok: false, status: response.status, error: `接口返回非 JSON 内容（HTTP ${response.status}），请核对 API 地址；请先核实平台任务，再决定是否重试` }
        }
        if (!response.ok) return { ok: false, status: response.status, error: data?.error?.message || data?.message || `HTTP ${response.status}` }
        return { ok: true, data }
      } catch (error) {
        if (pending.cancelled) return { ok: false, cancelled: true, error: '已取消本地等待；已发送请求是否生成请到平台核实' }
        const message = pending.timedOut ? `请求超时（${Math.round(timeoutMs / 1000)} 秒）` : String(error.message || '网络连接失败')
        return { ok: false, error: `${message}。没有自动重新提交，请先核实平台任务状态再重试` }
      }
    } catch (error) { return { ok: false, error: error.message || 'GeekNow 请求失败' } }
    finally { clearTimeout(timer); if (requestKey) requests.delete(requestKey) }
  })
  ipcMain.handle('geeknow:cancel', (event, { requestId } = {}) => {
    const pending = requests.get(`${event.sender.id}:${requestId}`)
    if (pending) { pending.cancelled = true; pending.controller.abort() }
    return { ok: true }
  })
}
