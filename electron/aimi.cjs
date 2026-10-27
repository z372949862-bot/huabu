const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const BASE = 'https://aimiapi.com'
const MODELS = new Set(['JL-seedance-2.5-480p', 'JL-seedance-2.5-720p', 'sd2.5-n-480p', 'sd2.5-n-720p'])
const UPLOAD_PATHS = { image: '/pg/reference-images', audio: '/pg/reference-audios', video: '/v1/reference-videos' }

module.exports = function registerAimi({ ipcMain, net, app }) {
  const downloads = new Map()
  const wrap = fn => async (_event, args) => {
    try { return { ok: true, data: await fn(args || {}) } }
    catch (error) {
      let message = error.message || 'AIMI 请求失败'
      if (args?.apiKey) message = message.split(args.apiKey).join('[API Key]')
      return { ok: false, error: message, retryable: !!error.retryable }
    }
  }

  function validateKey(apiKey) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('请填写有效的 AIMI API Key')
  }

  async function request(apiKey, route, options = {}, timeout = 120000, consume = response => response.json(), phase = 'poll') {
    validateKey(apiKey)
    const parsed = new URL(route, BASE)
    if (parsed.origin !== BASE || parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('AIMI 请求地址无效')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await net.fetch(parsed.href, { ...options, redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json', ...options.headers, Authorization: `Bearer ${apiKey.trim()}` } })
      if (!response.ok) {
        let detail = response.statusText
        try { const body = await response.json(); detail = body.error?.message || body.error || body.message || body.detail || detail } catch {}
        const error = new Error(`AIMI ${phase === 'create' ? '提交' : '请求'}失败（HTTP ${response.status}）：${String(detail)}`)
        error.retryable = phase !== 'create' && (response.status === 429 || response.status >= 500)
        if (phase === 'create') error.message += '；请先到平台确认任务是否已创建，避免重复提交'
        throw error
      }
      return await consume(response)
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) {
        const wrapped = new Error(`AIMI 请求${error.name === 'AbortError' ? '超时' : '连接中断'}${phase === 'create' ? '；请先到平台确认任务是否已创建，避免重复提交' : ''}`)
        wrapped.retryable = phase !== 'create'
        throw wrapped
      }
      throw error
    } finally { clearTimeout(timer) }
  }

  ipcMain.handle('aimi:request', wrap(async ({ apiKey, path: route, body }) => {
    const creating = route === '/v1/videos' && !!body
    const polling = /^\/v1\/videos\/[A-Za-z0-9_%.-]+$/.test(route || '')
    if (!creating && route !== '/v1/models' && !polling) throw new Error('不支持的 AIMI 请求')
    if (creating && !MODELS.has(body.model)) throw new Error('AIMI 当前仅接入 JL Seedance 2.5 480p/720p 与 sd2.5-n 480p/720p')
    return request(apiKey, route, creating ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'GET' }, creating ? 300000 : 60000, undefined, creating ? 'create' : 'poll')
  }))

  ipcMain.handle('aimi:upload', wrap(async ({ apiKey, kind, data, fileName, mimeType }) => {
    validateKey(apiKey)
    const route = UPLOAD_PATHS[kind]
    if (!route) throw new Error('AIMI 不支持该素材类型')
    if (typeof data !== 'string' || data.length > 90 * 1024 * 1024) throw new Error('参考素材数据无效或过大')
    const bytes = Buffer.from(data, 'base64')
    const limit = kind === 'video' ? 64 : 20
    if (!bytes.length || bytes.length > limit * 1024 * 1024) throw new Error(`AIMI ${kind === 'image' ? '图片' : kind === 'video' ? '视频' : '音频'}须非空且不超过 ${limit} MB`)
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: mimeType || 'application/octet-stream' }), path.basename(fileName || `reference.${kind}`))
    return request(apiKey, route, { method: 'POST', body: form }, 120000, async response => {
      const result = await response.json()
      if (result?.success === false || typeof (result?.data?.url || result?.url) !== 'string') throw new Error('AIMI 素材上传未返回有效 URL')
      let url
      try { url = new URL(result.data?.url || result.url, BASE) } catch { throw new Error('AIMI 素材上传返回了无效 URL') }
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('AIMI 素材上传返回了无效的 HTTPS 地址')
      return result
    }, 'upload')
  }))

  async function download(url, apiKey, destination) {
    const parsed = new URL(url, BASE)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) throw new Error('AIMI 返回的视频地址无效')
    const headers = { Accept: 'video/*,application/octet-stream;q=0.9,*/*;q=0.8' }
    if (parsed.origin === BASE) headers.Authorization = `Bearer ${apiKey.trim()}`
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 300000)
    try {
      const response = await net.fetch(parsed.href, { headers, redirect: 'error', signal: controller.signal })
      if (!response.ok) {
        const error = new Error(`AIMI 视频下载失败（HTTP ${response.status}）`)
        error.retryable = [404, 409, 425, 429, 500, 502, 503, 504].includes(response.status)
        throw error
      }
      if (/json|text\/html/i.test(response.headers.get('content-type') || '') || !response.body) throw Object.assign(new Error('AIMI 暂未返回视频文件'), { retryable: true })
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination))
      if (!fs.existsSync(destination) || !fs.statSync(destination).size) throw Object.assign(new Error('AIMI 返回空视频'), { retryable: true })
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw Object.assign(new Error('AIMI 视频下载连接中断'), { retryable: true })
      throw error
    } finally { clearTimeout(timer) }
  }

  ipcMain.handle('aimi:download', wrap(async ({ apiKey, taskId, videoUrl }) => {
    validateKey(apiKey)
    if (typeof taskId !== 'string' || !taskId || taskId.length > 512) throw new Error('AIMI 视频任务 ID 无效')
    const hash = crypto.createHash('sha256').update(`${apiKey}\0${taskId}`).digest('hex')
    if (downloads.has(hash)) return downloads.get(hash)
    const job = (async () => {
      const directory = path.join(app.getPath('userData'), 'generated-videos', 'aimi')
      fs.mkdirSync(directory, { recursive: true })
      const finalPath = path.join(directory, `${hash}.mp4`), temporaryPath = `${finalPath}.part`
      if (fs.existsSync(finalPath) && fs.statSync(finalPath).size) return { path: finalPath }
      try {
        const candidates = [`${BASE}/v1/videos/${encodeURIComponent(taskId)}/content`]
        if (typeof videoUrl === 'string' && videoUrl.trim()) candidates.push(videoUrl)
        let lastError
        for (const url of candidates) {
          try { await download(url, apiKey, temporaryPath); lastError = null; break }
          catch (error) {
            lastError = error
            if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
            if (!error.retryable) break
          }
        }
        if (lastError) throw lastError
        fs.renameSync(temporaryPath, finalPath)
        return { path: finalPath }
      } finally { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath) }
    })()
    downloads.set(hash, job)
    try { return await job } finally { downloads.delete(hash) }
  }))
}
