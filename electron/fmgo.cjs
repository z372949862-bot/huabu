const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const BASE = 'https://api.fmgo.top'
const MODELS = new Set(['feimiao-v2.5-720p-30s'])

module.exports = function registerFmgo({ ipcMain, net, app }) {
  const downloads = new Map()
  const wrap = fn => async (_event, args) => {
    try { return { ok: true, data: await fn(args || {}) } }
    catch (error) {
      let message = error.message || 'FMGO 请求失败'
      if (args?.apiKey) message = message.split(args.apiKey).join('[API Key]')
      return { ok: false, error: message, retryable: !!error.retryable }
    }
  }

  async function request(apiKey, url, options = {}, timeout = 120000, consume = response => response.json(), phase = 'poll') {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('请填写有效的 FMGO API Key')
    const parsed = new URL(url, BASE)
    if (parsed.origin !== BASE || parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('FMGO 请求地址无效')
    const headers = { Accept: 'application/json', ...options.headers, Authorization: `Bearer ${apiKey.trim()}` }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await net.fetch(parsed.href, { ...options, headers, redirect: 'error', signal: controller.signal })
      if (!response.ok) {
        let detail = response.statusText
        try {
          const data = await response.json()
          detail = data.error?.message || data.error || data.message || data.detail || detail
        } catch {}
        const error = new Error(`FMGO ${phase === 'create' ? '提交' : '查询'}失败（HTTP ${response.status}）：${String(detail)}`)
        error.retryable = phase !== 'create' && [404, 409, 425, 429, 500, 502, 503, 504].includes(response.status)
        if (phase === 'create') error.message += '；请先到平台确认任务是否已创建，避免重复提交'
        throw error
      }
      return await consume(response)
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) {
        const wrapped = new Error(`FMGO 请求${error.name === 'AbortError' ? '超时' : '连接中断'}${phase === 'create' ? '；请先到平台确认任务是否已创建，避免重复提交' : ''}`)
        wrapped.retryable = phase !== 'create'
        throw wrapped
      }
      throw error
    } finally { clearTimeout(timer) }
  }

  ipcMain.handle('fmgo:request', wrap(async ({ apiKey, path: route, body }) => {
    const creating = route === '/v1/videos' && !!body
    const polling = /^\/v1\/videos\/[A-Za-z0-9_%.-]+$/.test(route || '')
    if (!creating && route !== '/v1/models' && !polling) throw new Error('不支持的 FMGO 请求')
    if (creating && !MODELS.has(body.model)) throw new Error('FMGO 当前仅接入 feimiao-v2.5-720p-30s')
    return request(apiKey, route, creating ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : { method: 'GET' }, creating ? 300000 : 60000, undefined, creating ? 'create' : 'poll')
  }))

  async function downloadVideo(apiKey, url, destination) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) {
      throw new Error('FMGO 返回的视频地址无效')
    }
    const headers = { Accept: 'video/*,application/octet-stream;q=0.9,*/*;q=0.8' }
    if (parsed.origin === BASE) headers.Authorization = `Bearer ${apiKey.trim()}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 300000)
    try {
      const response = await net.fetch(parsed.href, { headers, signal: controller.signal })
      if (!response.ok) {
        const error = new Error(`FMGO 视频下载失败（HTTP ${response.status}）`)
        error.retryable = [404, 409, 425, 429, 500, 502, 503, 504].includes(response.status)
        throw error
      }
      if (/json|text\/html/i.test(response.headers.get('content-type') || '')) {
        const error = new Error('FMGO 暂未返回视频文件')
        error.retryable = true
        throw error
      }
      if (!response.body) throw Object.assign(new Error('FMGO 返回空视频'), { retryable: true })
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination))
      if (!fs.existsSync(destination) || !fs.statSync(destination).size) throw Object.assign(new Error('FMGO 返回空视频'), { retryable: true })
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw Object.assign(new Error('FMGO 视频下载连接中断'), { retryable: true })
      throw error
    } finally { clearTimeout(timer) }
  }

  ipcMain.handle('fmgo:download', wrap(async ({ apiKey, taskId, videoUrl }) => {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('请填写有效的 FMGO API Key')
    if (typeof videoUrl !== 'string' || !videoUrl || videoUrl.length > 8192) throw Object.assign(new Error('FMGO 尚未返回可下载的视频地址'), { retryable: true })
    const parsed = new URL(videoUrl)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('FMGO 返回的视频地址无效')
    const identity = String(taskId || videoUrl)
    if (identity.length > 8192) throw new Error('FMGO 视频任务信息无效')
    const hash = crypto.createHash('sha256').update(`${apiKey}\0${identity}`).digest('hex')
    if (downloads.has(hash)) return downloads.get(hash)
    const job = (async () => {
      const directory = path.join(app.getPath('userData'), 'generated-videos', 'fmgo')
      fs.mkdirSync(directory, { recursive: true })
      const finalPath = path.join(directory, `${hash}.mp4`)
      const temporaryPath = `${finalPath}.part`
      if (fs.existsSync(finalPath) && fs.statSync(finalPath).size > 0) return { path: finalPath }
      try {
        await downloadVideo(apiKey, parsed.href, temporaryPath)
        fs.renameSync(temporaryPath, finalPath)
        return { path: finalPath }
      } finally { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath) }
    })()
    downloads.set(hash, job)
    try { return await job } finally { downloads.delete(hash) }
  }))
}
