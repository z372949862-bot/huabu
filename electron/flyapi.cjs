const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const { createMediaUploader } = require('./aiide.cjs')

const BASE = 'https://flyapi.vip'
const ASSETS = '/kyyReactApiServer/asset/seedance2/'
const validTask = id => typeof id === 'string' && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,511}$/.test(id)
const transient = status => [404, 408, 409, 425, 429].includes(status) || status >= 500
function keyFor(value) {
  if (typeof value !== 'string' || !/^[!-~]+$/.test(value.trim()) || /[\r\n]/.test(value)) throw new Error('请填写有效的 FlyAPI Key')
  return value.trim()
}
module.exports = function registerFlyapi({ ipcMain, net, app, stagingFetch }) {
  const stage = createMediaUploader({ fetch: stagingFetch || ((...args) => net.fetch(...args)), serviceName: 'FlyAPI',
    extraFormats: { 'image/avif': 'avif', 'video/webm': 'webm', 'video/x-m4v': 'm4v', 'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/webm': 'webm' } })
  ipcMain.handle('flyapi:upload', (_event, { dataUrl } = {}) => stage({ dataUrl }))
  const wrap = fn => async (_event, args) => {
    try { return { ok: true, data: await fn(args || {}) } }
    catch (err) {
      let message = String(err.message || 'FlyAPI 请求失败')
      if (args?.apiKey?.trim()) message = message.split(args.apiKey.trim()).join('[API Key]')
      return { ok: false, error: message, retryable: !!err.retryable, status: err.status }
    }
  }
  async function request(apiKey, route, body, consume) {
    const key = keyFor(apiKey), creating = route === '/v1/videos'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), creating || consume ? 300000 : 60000)
    try {
      const response = await net.fetch(BASE + route, { method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${key}`, Accept: consume ? 'video/*, application/octet-stream' : 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal, redirect: 'error' })
      if (!response.ok) {
        let reason = response.statusText
        try { const json = await response.json(); reason = [json.error?.code || json.code, json.error?.message || json.errorMessage || json.message || (typeof json.error === 'string' ? json.error : '')].filter(Boolean).join('：') || reason } catch {}
        throw Object.assign(new Error(`FlyAPI（HTTP ${response.status}）：${reason}`), { status: response.status, retryable: body === undefined && transient(response.status) })
      }
      return consume ? await consume(response) : await response.json()
    } catch (err) {
      if (controller.signal.aborted || err instanceof TypeError || err instanceof SyntaxError) {
        throw Object.assign(new Error('FlyAPI ' + (controller.signal.aborted ? '请求超时' : '未收到有效响应') + (creating ? '；请先在平台核对是否已创建任务，再决定是否重试' : '')), { retryable: body === undefined })
      }
      throw err
    } finally { clearTimeout(timer) }
  }
  ipcMain.handle('flyapi:request', wrap(async ({ apiKey, path: route, body }) => {
    const create = route === '/v1/videos' && body?.model === 'seedance2.5'
    const asset = [ASSETS + 'assetUpload', ASSETS + 'assetDetail'].includes(route) && body && typeof body === 'object'
    const poll = typeof route === 'string' && route.startsWith('/v1/videos/') && validTask(route.slice('/v1/videos/'.length))
    if (!create && !asset && !(body === undefined && (route === '/v1/models' || poll))) throw new Error('不支持的 FlyAPI 请求')
    return request(apiKey, route, body)
  }))
  const downloads = new Map()
  ipcMain.handle('flyapi:download', wrap(async ({ apiKey, taskId }) => {
    if (!validTask(taskId)) throw new Error('FlyAPI 任务 ID 无效')
    const hash = crypto.createHash('sha256').update(keyFor(apiKey) + '\0' + taskId).digest('hex')
    if (downloads.has(hash)) return downloads.get(hash)
    const job = (async () => {
      const dir = path.join(app.getPath('userData'), 'generated-videos', 'flyapi')
      await fs.promises.mkdir(dir, { recursive: true })
      const dest = path.join(dir, hash + '.mp4'), part = dest + '.part'
      if ((await fs.promises.stat(dest).catch(() => null))?.size) return { path: dest }
      try {
        await request(apiKey, '/v1/videos/' + taskId + '/content', undefined, async response => {
          if (!response.body || /json|text\//i.test(response.headers.get('content-type') || '')) throw Object.assign(new Error('成片尚不可下载'), { retryable: true })
          await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(part))
          if (!(await fs.promises.stat(part)).size) throw Object.assign(new Error('返回的视频为空'), { retryable: true })
        })
        await fs.promises.rename(part, dest)
        return { path: dest }
      } finally { await fs.promises.rm(part, { force: true }) }
    })()
    downloads.set(hash, job)
    try { return await job } finally { downloads.delete(hash) }
  }))
}
