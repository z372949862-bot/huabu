const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

const BASE = 'https://api.qilingze.com'

module.exports = function registerQiling({ ipcMain, net, app }) {
  const downloads = new Map()
  const wrap = fn => async (_event, args) => {
    try { return { ok: true, data: await fn(args || {}) } }
    catch (error) {
      let message = error.message || '器灵视频下载失败'
      if (args?.apiKey) message = message.split(args.apiKey).join('[API Key]')
      return { ok: false, error: message, retryable: !!error.retryable }
    }
  }

  async function fetchVideo(url, apiKey, temporary) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 300000)
    try {
      const headers = { Accept: 'video/*,application/octet-stream;q=0.9,*/*;q=0.8' }
      if (new URL(url).origin === BASE) headers.Authorization = `Bearer ${apiKey.trim()}`
      const response = await net.fetch(url, { headers, signal: controller.signal })
      if (!response.ok) {
        const error = new Error(`器灵视频下载失败（HTTP ${response.status}）`)
        error.retryable = [404, 409, 425, 429, 500, 502, 503, 504].includes(response.status)
        throw error
      }
      if (/json|text\/html/i.test(response.headers.get('content-type') || '')) {
        throw Object.assign(new Error('器灵内容接口没有返回视频文件'), { retryable: true })
      }
      if (!response.body) throw Object.assign(new Error('器灵返回了空视频'), { retryable: true })
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary))
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) {
        throw Object.assign(new Error('器灵视频下载连接中断'), { retryable: true })
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  ipcMain.handle('qiling:download', wrap(async ({ apiKey, taskId, videoUrl }) => {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('请填写有效的器灵 API Key')
    if (taskId !== undefined && (typeof taskId !== 'string' || !taskId || taskId.length > 512)) throw new Error('器灵任务 ID 无效')
    const candidates = []
    if (taskId) candidates.push(`${BASE}/v1/videos/${encodeURIComponent(taskId)}/content`)
    if (videoUrl) {
      let parsed
      try { parsed = new URL(videoUrl) } catch { throw new Error('器灵返回的视频地址无效') }
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('器灵返回的视频地址无效')
      if (!candidates.includes(parsed.href)) candidates.push(parsed.href)
    }
    if (!candidates.length) throw Object.assign(new Error('器灵尚未返回可下载的视频地址'), { retryable: true })

    const hash = crypto.createHash('sha256').update(apiKey.trim() + '\0' + (taskId || '') + '\0' + (videoUrl || '')).digest('hex')
    if (downloads.has(hash)) return downloads.get(hash)
    const job = (async () => {
      const dir = path.join(app.getPath('userData'), 'generated-videos', 'qiling')
      fs.mkdirSync(dir, { recursive: true })
      const destination = path.join(dir, hash + '.mp4')
      const temporary = destination + '.part'
      if (fs.existsSync(destination) && fs.statSync(destination).size > 0) return { path: destination }
      let lastError
      for (const url of candidates) {
        try {
          await fetchVideo(url, apiKey, temporary)
          if (!fs.existsSync(temporary) || !fs.statSync(temporary).size) throw Object.assign(new Error('器灵返回了空视频'), { retryable: true })
          fs.renameSync(temporary, destination)
          return { path: destination }
        } catch (error) {
          lastError = error
          if (!error.retryable) throw error
        } finally {
          if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
        }
      }
      throw lastError || Object.assign(new Error('器灵视频暂时无法下载'), { retryable: true })
    })()
    downloads.set(hash, job)
    try { return await job } finally { downloads.delete(hash) }
  }))
}
