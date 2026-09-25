const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const BASE = 'https://www.xinshuju.net'
const MODELS = new Set(['2-seedance-2.5', '3-seedance-2.5-720p', '4-seedance-2.5-720p'])

module.exports = function registerXinshuju({ ipcMain, net, app }) {
  const wrap = fn => async (_event, args) => {
    try { return { ok: true, data: await fn(args || {}) } }
    catch (error) {
      let message = error.message || '心数据请求失败'
      if (args?.apiKey) message = message.split(args.apiKey).join('[API Key]')
      return { ok: false, error: message, retryable: !!error.retryable }
    }
  }
  async function request(apiKey, route, options = {}, timeout = 120000, consume = response => response.json(), phase = 'poll') {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('请填写有效的心数据 API Key')
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), timeout)
    try {
      const response = await net.fetch(BASE + route, { ...options, signal: abort.signal, headers: { Accept: 'application/json', ...options.headers, Authorization: `Bearer ${apiKey.trim()}` } })
      if (!response.ok) {
        let detail = response.statusText
        try { const body = await response.json(); detail = body.error?.message || body.error || body.message || body.detail || detail } catch {}
        const error = new Error(`心数据${phase === 'create' ? '提交' : phase === 'download' ? '下载' : '查询'}失败（HTTP ${response.status}）：${String(detail)}`)
        error.retryable = phase !== 'create' && [404, 409, 425, 429, 500, 502, 503, 504].includes(response.status)
        if (phase === 'create') error.message += '；请先到平台确认任务是否创建，避免重复提交'
        throw error
      }
      return await consume(response)
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) {
        const wrapped = new Error(`心数据请求${error.name === 'AbortError' ? '超时' : '连接中断'}${phase === 'create' ? '；请先到平台确认任务是否创建，避免重复提交' : ''}`)
        wrapped.retryable = phase !== 'create'
        throw wrapped
      }
      throw error
    } finally { clearTimeout(timer) }
  }

  ipcMain.handle('xinshuju:request', wrap(async ({ apiKey, path: route, body }) => {
    const creating = route === '/v1/videos' && !!body
    if (!creating && route !== '/v1/models' && !/^\/v1\/videos\/[A-Za-z0-9_%.-]+$/.test(route || '')) throw new Error('不支持的心数据请求')
    if (creating && !MODELS.has(body.model)) throw new Error('不支持的心数据视频模型')
    return request(apiKey, route, creating ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'GET' }, creating ? 300000 : 60000, undefined, creating ? 'create' : 'poll')
  }))

  const downloads = new Map()
  async function fetchVideo(apiKey, url, temporary) {
    const parsed = new URL(url)
    const headers = { Accept: 'video/*,application/octet-stream;q=0.9,*/*;q=0.8' }
    if (parsed.origin === BASE) headers.Authorization = `Bearer ${apiKey.trim()}`
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 300000)
    try {
      const response = await net.fetch(parsed.href, { headers, signal: abort.signal })
      if (!response.ok) {
        const error = new Error(`心数据下载失败（HTTP ${response.status}）`)
        error.retryable = [404, 409, 425, 429, 500, 502, 503, 504].includes(response.status)
        throw error
      }
      if (/json|text\/html/i.test(response.headers.get('content-type') || '')) throw Object.assign(new Error('心数据尚未返回视频文件'), { retryable: true })
      if (!response.body) throw Object.assign(new Error('心数据返回空视频'), { retryable: true })
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary))
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw Object.assign(new Error('心数据视频下载连接中断'), { retryable: true })
      throw error
    } finally { clearTimeout(timer) }
  }
  ipcMain.handle('xinshuju:download', wrap(async ({ apiKey, taskId, videoUrl }) => {
    if (taskId !== undefined && (typeof taskId !== 'string' || taskId.length > 512)) throw new Error('心数据任务 ID 无效')
    const candidates = []
    if (videoUrl) {
      const parsed = new URL(videoUrl, BASE)
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('心数据返回的视频地址无效')
      candidates.push(parsed.href)
    }
    if (taskId) candidates.push(`${BASE}/v1/videos/${encodeURIComponent(taskId)}/content`)
    if (!candidates.length) throw Object.assign(new Error('心数据尚未返回可下载的视频地址'), { retryable: true })
    const hash = crypto.createHash('sha256').update(String(apiKey) + '\0' + (taskId || videoUrl)).digest('hex')
    if (downloads.has(hash)) return downloads.get(hash)
    const job = (async () => {
      const dir = path.join(app.getPath('userData'), 'generated-videos', 'xinshuju')
      fs.mkdirSync(dir, { recursive: true })
      const destination = path.join(dir, hash + '.mp4'), temporary = destination + '.part'
      if (fs.existsSync(destination) && fs.statSync(destination).size > 0) return { path: destination }
      let lastError
      for (const url of candidates) {
        try {
          await fetchVideo(apiKey, url, temporary)
          if (!fs.existsSync(temporary) || !fs.statSync(temporary).size) throw Object.assign(new Error('心数据返回空视频'), { retryable: true })
          fs.renameSync(temporary, destination)
          return { path: destination }
        } catch (error) { lastError = error; if (!error.retryable) throw error }
        finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
      }
      throw lastError || Object.assign(new Error('心数据视频暂不可下载'), { retryable: true })
    })()
    downloads.set(hash, job)
    try { return await job } finally { downloads.delete(hash) }
  }))
}
