// 算力 AI 视频接口的 Electron 主进程桥接。
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const BASE = 'https://suanliai.top'
const ALLOWED_VIDEO_MODELS = new Set([
  '008系列/sd2.5(30-10-10/5-30秒/480P)',
  '008系列/sd2.5(30-10-10/5-30秒/720P)',
])

function assertAsciiApiKey(apiKey) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('请填写有效的算力 AI API Key')
  if (/[^\x00-\x7F]/.test(apiKey)) throw new Error('算力 AI API Key 只能包含英文、数字和符号，请检查是否误粘贴了中文内容')
}

module.exports = function registerSuanliai({ ipcMain, net, app }) {
  const wrap = fn => async (_event, args) => {
    try { return { ok: true, data: await fn(args || {}) } }
    catch (error) {
      const message = error?.message || '算力 AI 请求失败'
      return { ok: false, error: message, retryable: !!error?.retryable }
    }
  }

  async function request(apiKey, route, options = {}, timeout = 120000, consume = response => response.json(), phase = 'poll') {
    assertAsciiApiKey(apiKey)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const response = await net.fetch(BASE + route, {
        ...options,
        signal: controller.signal,
        headers: { Accept: 'application/json', ...options.headers, Authorization: `Bearer ${apiKey.trim()}` },
      })
      if (!response.ok) {
        let detail = response.statusText
        try {
          const body = await response.json()
          detail = body?.error?.message || body?.error || body?.message || body?.detail || detail
        } catch {}
        const error = new Error(`算力 AI${phase === 'create' ? '提交' : phase === 'download' ? '下载' : '查询'}失败（HTTP ${response.status}）：${String(detail)}`)
        error.retryable = phase !== 'create' && [404, 409, 425, 429, 500, 502, 503, 504].includes(response.status)
        if (phase === 'create') error.message += '；请先到平台确认任务是否创建，避免重复提交'
        throw error
      }
      return await consume(response)
    } catch (error) {
      if (error?.name === 'AbortError' || error instanceof TypeError) {
        const wrapped = new Error(`算力 AI 请求${error?.name === 'AbortError' ? '超时' : '连接中断'}${phase === 'create' ? '；请先到平台确认任务是否创建，避免重复提交' : ''}`)
        wrapped.retryable = phase !== 'create'
        throw wrapped
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  ipcMain.handle('suanliai:request', wrap(async ({ apiKey, path: route, body }) => {
    const creating = route === '/v1/videos' && !!body
    if (!creating && route !== '/v1/models' && !/^\/v1\/videos\/[A-Za-z0-9_%.-]+$/.test(route || '')) throw new Error('不支持的算力 AI 请求')
    if (creating && !ALLOWED_VIDEO_MODELS.has(body.model)) throw new Error('不支持的算力 AI 视频模型')
    return request(apiKey, route, creating ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method: 'GET' }, creating ? 300000 : 60000, undefined, creating ? 'create' : 'poll')
  }))

  const uploadAsset = async ({ apiKey, data, fileName, mimeType, field = 'images' }) => {
    assertAsciiApiKey(apiKey)
    if (!['images', 'videos', 'audios'].includes(field)) throw new Error('算力 AI 素材类型无效')
    if (typeof data !== 'string' || data.length > 70 * 1024 * 1024) throw new Error('单个参考素材不能超过 50 MB')
    const bytes = Buffer.from(data, 'base64')
    if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error('参考素材为空或超过 50 MB')
    const form = new FormData()
    const extension = path.extname(String(fileName || '')).toLowerCase().replace(/[^a-z0-9.]/g, '')
    const fallbackExtension = field === 'videos' ? '.mp4' : field === 'audios' ? '.mp3' : '.png'
    const safeName = `reference${/^\.[a-z0-9]{1,8}$/.test(extension) ? extension : fallbackExtension}`
    const fallbackMime = field === 'videos' ? 'video/mp4' : field === 'audios' ? 'audio/mpeg' : 'image/png'
    form.append(field, new Blob([bytes], { type: mimeType || fallbackMime }), safeName)
    return request(apiKey, '/v1/assets/review', { method: 'POST', body: form }, 180000, undefined, 'upload')
  }

  ipcMain.handle('suanliai:upload', wrap(uploadAsset))
  ipcMain.handle('suanliai:upload-image', wrap(args => uploadAsset({ ...args, field: 'images' })))

  const downloads = new Map()
  ipcMain.handle('suanliai:download', wrap(async ({ apiKey, taskId }) => {
    if (typeof taskId !== 'string' || !taskId || taskId.length > 512) throw new Error('算力 AI 任务 ID 无效')
    const hash = crypto.createHash('sha256').update(String(apiKey) + '\0' + taskId).digest('hex')
    if (downloads.has(hash)) return downloads.get(hash)
    const job = (async () => {
      const dir = path.join(app.getPath('userData'), 'generated-videos', 'suanliai')
      fs.mkdirSync(dir, { recursive: true })
      const destination = path.join(dir, hash + '.mp4')
      const temporary = destination + '.part'
      if (fs.existsSync(destination) && fs.statSync(destination).size > 0) return { path: destination }
      try {
        await request(apiKey, `/v1/videos/${encodeURIComponent(taskId)}/content`, { method: 'GET', headers: { Accept: 'video/*,application/octet-stream;q=0.9,*/*;q=0.8' } }, 300000, async response => {
          const contentType = response.headers.get('content-type') || ''
          if (/json|text\/html/i.test(contentType)) throw new Error('算力 AI 内容接口未返回视频文件')
          if (!response.body) throw new Error('算力 AI 返回空视频')
          await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary))
        }, 'download')
        if (!fs.statSync(temporary).size) throw new Error('算力 AI 返回空视频')
        fs.renameSync(temporary, destination)
        return { path: destination }
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
      }
    })()
    downloads.set(hash, job)
    try { return await job } finally { downloads.delete(hash) }
  }))
}
