const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const BASE = 'https://ideagates.com/v1'
const MODELS = { ideagates: 'doubao-seedance-2-5-260628', 'ideagates-overseas': 'dreamina-seedance-2-5' }
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
function mediaUrl(value, asset = false) {
  if (asset && /^asset:\/\/[A-Za-z0-9_-]+$/.test(value)) return value
  let url
  try { url = new URL(value) } catch { throw new Error('参考素材需要公网 HTTPS 链接或已登记的 asset:// 引用；本地文件请先上传到自己的存储') }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || host === 'localhost' || host.endsWith('.local') ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.includes(':')) {
    throw new Error('素材和成片链接必须是公网 HTTPS 地址')
  }
  return url.href
}
function validateBody(body, group) {
  if (!MODELS[group] || body?.model !== MODELS[group]) throw new Error('请选择该分组的 Seedance 2.5 模型')
  if (body.resolution !== '720p') throw new Error('此接入仅支持 720p')
  if (!Array.isArray(body.content) || !body.content.some(item => item.type === 'text' && typeof item.text === 'string' && item.text.trim())) throw new Error('请输入提示词')
  if (body.draft === true) throw new Error('不支持草稿模式')
  const mode = body.omni_reference_task_type
  if (mode && !['reference', 'edit', 'extend', 'auto'].includes(mode)) throw new Error('视频模式无效')
  if (mode === 'edit' ? body.duration !== -1 : !Number.isInteger(body.duration) || body.duration < 4 || body.duration > 30) throw new Error('时长应为 4–30 秒；编辑模式为 -1')
  if (['edit', 'extend'].includes(mode)) {
    if (body.ratio !== 'adaptive' || !body.content.some(item => item.type === 'video_url')) throw new Error('编辑和续接需要参考视频，画幅须为 adaptive')
  } else if (!['16:9', '9:16', '1:1', '21:9', '4:3', '3:4'].includes(body.ratio)) throw new Error('请选择支持的画幅比例')
  for (const key of ['generate_audio', 'return_last_frame', 'watermark']) if (body[key] != null && typeof body[key] !== 'boolean') throw new Error(`${key} 必须为布尔值`)
  let first = 0, last = 0, references = 0
  for (const item of body.content) {
    if (item.type === 'text') continue
    const roles = { image_url: ['reference_image', 'first_frame', 'last_frame'], video_url: ['reference_video'], audio_url: ['reference_audio'] }
    if (!roles[item.type]?.includes(item.role)) throw new Error('参考素材类型或 role 无效')
    mediaUrl(item[item.type]?.url, true)
    if (item.role === 'first_frame') first++
    else if (item.role === 'last_frame') last++
    else references++
  }
  if (first > 1 || last > 1 || (last && !first) || ((first || last) && references)) throw new Error('首尾帧不能与其他参考素材混用，尾帧必须配首帧')
}
function redact(message, key) {
  return String(message).split(key).join('[redacted]').replace(/https:\/\/[^\s"<>]+/g, value => value.split('?')[0] + (value.includes('?') ? '?[redacted]' : ''))
}
module.exports = function registerIdeaGates({ ipcMain, net, app }) {
  const directory = path.join(app.getPath('userData'), 'ideagates-tasks')
  const downloads = new Map()
  const wrap = handler => async (_event, args = {}) => {
    const key = typeof args.apiKey === 'string' ? args.apiKey.trim().replace(/^Bearer\s+/i, '') : ''
    try {
      if (!key || /[^!-~]/.test(key)) throw new Error('请填写有效的 IDEA Gates API Key')
      const fingerprint = hash(key)
      if (args.keyFingerprint && args.keyFingerprint !== fingerprint) throw new Error('此任务必须使用创建时的同一个 Key，请恢复原 Key 后继续查询')
      return { ok: true, data: await handler({ ...args, apiKey: key }, fingerprint) }
    } catch (error) {
      return { ok: false, error: redact(error.message || 'IDEA Gates 请求失败', key || '\u0000'), retryable: !!error.retryable, uncertain: !!error.uncertain, status: error.status, retryAfterMs: error.retryAfterMs }
    }
  }
  async function save(id, fingerprint, patch) {
    await fs.mkdir(directory, { recursive: true })
    const file = path.join(directory, hash(fingerprint + ':' + id) + '.json')
    const previous = await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => ({}))
    await fs.writeFile(file + '.tmp', JSON.stringify({ ...previous, ...patch }, null, 2))
    await fs.rename(file + '.tmp', file)
  }
  async function request(apiKey, route, body) {
    const create = !!body
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), create ? 180000 : 60000)
    try {
      const response = await net.fetch(BASE + route, { method: create ? 'POST' : 'GET', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', ...(create ? { 'Content-Type': 'application/json' } : {}) },
        ...(create ? { body: JSON.stringify(body) } : {}) })
      const raw = await response.json().catch(() => { throw Object.assign(new Error('平台返回非 JSON 响应'), { retryable: !create, uncertain: create }) })
      if (!response.ok) {
        const retry = response.headers.get('retry-after')
        const seconds = retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 0
        throw Object.assign(new Error(`IDEA Gates HTTP ${response.status}：${raw?.error?.message || raw?.message || '请求失败'}`), {
          status: response.status, uncertain: create && (response.status >= 500 || response.status === 408),
          retryable: !create && (response.status >= 500 || [408, 409, 425, 429].includes(response.status)), retryAfterMs: Number.isFinite(seconds) ? Math.max(0, seconds) : 0,
        })
      }
      return raw
    } catch (error) {
      if (create && !error.status) error.uncertain = true
      if (error.name === 'AbortError' || error instanceof TypeError) {
        error = Object.assign(new Error('IDEA Gates 请求超时或连接中断'), { uncertain: create, retryable: !create })
      }
      if (create && error.uncertain) error.message += '；提交结果不确定，请先联系平台核对，软件不会自动重提'
      throw error
    } finally { clearTimeout(timer) }
  }
  ipcMain.handle('ideagates:request', wrap(async ({ apiKey, path: route, body, group }, fingerprint) => {
    if (route === '/identity' && !body) return { keyFingerprint: fingerprint }
    const create = route === '/contents/generations/tasks' && !!body
    const poll = typeof route === 'string' && /^\/contents\/generations\/tasks\/[^/?#]+$/.test(route) && !body
    if (!create && !poll && !(route === '/models' && !body)) throw new Error('不支持的 IDEA Gates 请求')
    if (create) validateBody(body, group)
    const raw = await request(apiKey, route, body)
    let warning
    if (create || poll) {
      const id = create ? raw?.id : decodeURIComponent(route.split('/').pop())
      if (typeof id === 'string' && id) {
        try { await save(id, fingerprint, { id, ...(create ? { group, request: body, createdResponse: raw } : {}), response: raw }) }
        catch { warning = '任务已受理，但完整响应写盘失败，请保留任务号' }
      }
    }
    return { raw, keyFingerprint: fingerprint, warning }
  }))
  ipcMain.handle('ideagates:download', wrap(async ({ taskId, videoUrl, apiKey }, fingerprint) => {
    if (typeof taskId !== 'string' || !taskId) throw new Error('缺少任务 ID')
    const cache = hash(fingerprint + ':' + taskId)
    if (downloads.has(cache)) return downloads.get(cache)
    const job = (async () => {
      await fs.mkdir(directory, { recursive: true })
      const target = path.join(directory, cache + '.mp4'), temp = target + '.part'
      if (await fs.stat(target).then(s => s.size > 1024).catch(() => false)) return { path: target }
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 300000)
      try {
        let url = mediaUrl(videoUrl)
        for (let hop = 0; hop < 6; hop++) {
          // Signed download URLs never receive the API credential, including on redirects.
          const response = await net.fetch(url, { headers: { Accept: 'video/*,application/octet-stream' }, redirect: 'manual', signal: controller.signal })
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const next = response.headers.get('location'); await response.body?.cancel()
            if (!next) throw new Error('成片重定向缺少地址')
            url = mediaUrl(new URL(next, url).href); continue
          }
          if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error(`成片下载失败 HTTP ${response.status}`), { retryable: response.status >= 500 || [404, 429].includes(response.status) }) }
          if (!response.body || /json|text/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw Object.assign(new Error('成片尚未就绪'), { retryable: true }) }
          await pipeline(Readable.fromWeb(response.body), (await import('node:fs')).createWriteStream(temp))
          const size = (await fs.stat(temp)).size, expected = Number(response.headers.get('content-length') || 0)
          if (size < 1024 || (expected && expected !== size)) throw Object.assign(new Error('成片下载不完整'), { retryable: true })
          await fs.rename(temp, target)
          return { path: target }
        }
        throw new Error('成片重定向次数过多')
      } catch (error) {
        if (error.name === 'AbortError' || error instanceof TypeError) throw Object.assign(new Error('成片下载连接中断，请继续查询原任务'), { retryable: true })
        throw error
      } finally { clearTimeout(timer); await fs.unlink(temp).catch(() => {}) }
    })()
    downloads.set(cache, job)
    try { return await job } finally { downloads.delete(cache) }
  }))
}
module.exports.validateBody = validateBody
