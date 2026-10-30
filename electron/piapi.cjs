const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const { validateVideo } = require('./yu25.cjs')
const BASE = 'https://api.piapi.ai'
const UPLOAD = 'https://upload.theapi.app/api/ephemeral_resource'
const TASK_TYPE = 'seedance-2.5-less-restriction'
const IMAGE_TASK_TYPE = 'seedream-5-pro-less-restriction'
const retry = message => Object.assign(new Error(message), { retryable: true })
function validateKey(value) {
  if (typeof value !== 'string' || !value.trim() || /[^!-~]/.test(value.trim())) throw new Error('请填写有效的 PiAPI API Key（不能含中文、空格或换行）')
}
function publicUrl(value) {
  const parsed = new URL(value)
  const h = parsed.hostname.toLowerCase()
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || h === 'localhost' || h.endsWith('.local') || h.startsWith('127.') || h.startsWith('10.') || h.startsWith('192.168.') || h === '0.0.0.0' || h.startsWith('169.254.') || /^172[.](1[6-9]|2[0-9]|3[01])[.]/.test(h) || h.includes(':')) throw new Error('PiAPI 素材或成片地址必须是有效公网地址')
  return parsed
}
function errorText(body) {
  const values = [body?.error?.message, body?.data?.error?.message, body?.message, body?.error, body?.detail]
  return values.find(value => typeof value === 'string' && value.trim()) || '平台返回错误'
}
module.exports = function registerPiapi({ ipcMain, net, app }) {
  const downloads = new Map()
  const wrap = fn => async (_event, args) => {
    try { return { ok: true, data: await fn(args || {}) } }
    catch (error) {
      let message = error.message || 'PiAPI 请求失败'
      if (typeof args?.apiKey === 'string' && args.apiKey.trim()) message = message.split(args.apiKey.trim()).join('[API Key]')
      return { ok: false, error: message, retryable: !!error.retryable, status: error.status }
    }
  }
  async function request(apiKey, url, body, phase) {
    validateKey(apiKey)
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), phase === 'image-create' ? 600000 : phase === 'create' ? 180000 : 60000)
    try {
      const response = await net.fetch(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal: controller.signal, headers: { 'X-API-Key': apiKey.trim(), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      let result
      try { result = await response.json() } catch { throw Object.assign(new Error('PiAPI 返回了非 JSON 响应'), { retryable: phase === 'poll' }) }
      if (!response.ok || (typeof result?.code === 'number' && ![0, 200, 202].includes(result.code))) {
        if (phase === 'upload' && response.status === 403) throw new Error('PiAPI 临时素材上传需要 Creator 或更高套餐；Free 套餐请使用公网素材直链。本次未提交生成任务')
        if (phase === 'asset-create' && response.status === 403) throw Object.assign(new Error('PiAPI 私有资产入库需要 hobbyist 或更高权限，请核对账户套餐；本次未提交视频生成任务'), { status: 403 })
        throw Object.assign(new Error(`PiAPI ${phase === 'create' ? '提交' : phase === 'upload' ? '素材上传' : '请求'}失败（HTTP ${response.status}）：${errorText(result)}`), { status: response.status, retryable: phase === 'poll' && [409, 425, 429, 500, 502, 503, 504].includes(response.status) })
      }
      return result
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) error = Object.assign(new Error(`PiAPI 请求${error.name === 'AbortError' ? '超时' : '连接中断'}`), { retryable: phase === 'poll' })
      if (phase === 'create' || phase === 'image-create') { error.retryable = false; error.message += '；软件不会自动重提，请先到 PiAPI 确认是否已创建任务，避免重复扣费' }
      throw error
    } finally { clearTimeout(timer) }
  }
  ipcMain.handle('piapi:request', wrap(async ({ apiKey, path: route, body }) => {
    const create = route === '/api/v1/task' && body
    const poll = typeof route === 'string' && route.startsWith('/api/v1/task/') && /^[A-Za-z0-9_-]+$/.test(route.slice('/api/v1/task/'.length)) && !body
    const assetRoute = typeof route === 'string' && !body && (/^[/]api[/]v1[/]asset[/]asset-[A-Za-z0-9_-]+$/.test(route) || /^[/]api[/]v1[/]asset[/]list[?]page=[1-9][0-9]*&size=50&order=-last_used_at$/.test(route))
    if (!create && !poll && !assetRoute && !(route === '/account/info' && !body)) throw new Error('不支持的 PiAPI 请求')
    if (create) {
      const image = body.model === 'seedream' && body.task_type === IMAGE_TASK_TYPE
      if ((!image && (body.model !== 'seedance' || body.task_type !== TASK_TYPE)) || !body.input || typeof body.input.prompt !== 'string') throw new Error('PiAPI 模型或请求内容无效')
      if (image) {
        if (!['1K', '2K'].includes(body.input.size) || !['jpeg', 'png'].includes(body.input.output_format) || !['1:1','16:9','9:16','4:3','3:4','3:2','2:3','4:5','5:4','21:9'].includes(body.input.aspect_ratio)) throw new Error('PiAPI Seedream 图片参数无效')
        if (body.input.image_urls && (!Array.isArray(body.input.image_urls) || body.input.image_urls.length > 10)) throw new Error('Seedream 最多支持 10 张参考图片')
        if (body.input.video_urls || body.input.audio_urls) throw new Error('Seedream 图片模型仅支持参考图片')
      }
      for (const field of ['image_urls', 'video_urls', 'audio_urls']) for (const url of body.input[field] || []) {
        if (typeof url === 'string' && /^asset:[/][/]asset-[A-Za-z0-9_-]+$/.test(url)) {
          if (image) throw new Error('Seedream 参考图片必须使用公网直链，不能使用 asset://')
          if (field === 'video_urls' && body.input.omni_reference_task_type === 'edit') throw new Error('PiAPI 编辑源视频必须使用可读取的公网直链')
        } else publicUrl(url)
      }
    }
    return request(apiKey, BASE + route, body, create ? body.model === 'seedream' ? 'image-create' : 'create' : 'poll')
  }))
  function imageExtension(bytes) {
    if (bytes.length < 12) throw new Error('PiAPI 成图不完整')
    if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return '.png'
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return '.jpg'
    if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return '.webp'
    throw new Error('PiAPI 成图地址未返回有效的 PNG/JPEG/WebP 图片')
  }
  ipcMain.handle('piapi:download-image', wrap(async ({ apiKey, taskId, imageUrl }) => {
    validateKey(apiKey); publicUrl(imageUrl)
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(taskId)) throw new Error('PiAPI 图片任务 ID 无效')
    const hash = crypto.createHash('sha256').update(apiKey.trim() + ':' + taskId + ':' + imageUrl).digest('hex')
    const directory = path.join(app.getPath('userData'), 'generated-images', 'piapi')
    fs.mkdirSync(directory, { recursive: true })
    for (const ext of ['.png','.jpg','.webp']) {
      const file = path.join(directory, hash + ext)
      if (fs.existsSync(file)) { try { imageExtension(fs.readFileSync(file)); return { path: file } } catch {} }
    }
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000)
    try {
      let current = publicUrl(imageUrl)
      for (let hop=0; hop<6; hop++) {
        const headers = { Accept: 'image/png,image/jpeg,image/webp' }
        if (current.origin === BASE) headers['X-API-Key'] = apiKey.trim()
        const response = await net.fetch(current.href, { headers, redirect:'manual', signal:controller.signal })
        if ([301,302,303,307,308].includes(response.status)) {
          const location = response.headers.get('location'); await response.body?.cancel()
          if (!location) throw new Error('PiAPI 成图重定向缺少地址')
          current = publicUrl(new URL(location,current).href); continue
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error(`PiAPI 成图下载失败（HTTP ${response.status}）`) }
        const limit=50*1024*1024, expected=Number(response.headers.get('content-length')||0)
        if (expected>limit) { await response.body?.cancel(); throw new Error('PiAPI 成图超过 50 MB 保存限制') }
        const chunks=[]; let size=0
        if (!response.body) throw new Error('PiAPI 成图为空')
        for await (const chunk of response.body) { size+=chunk.length; if(size>limit){controller.abort();throw new Error('PiAPI 成图超过 50 MB 保存限制')} chunks.push(Buffer.from(chunk)) }
        if(expected && !response.headers.get('content-encoding') && size!==expected) throw new Error('PiAPI 成图下载不完整，请继续获取原任务')
        const bytes=Buffer.concat(chunks), extension=imageExtension(bytes), target=path.join(directory,hash+extension)
        const temp=target+'.'+crypto.randomUUID()+'.part'
        try { fs.writeFileSync(temp,bytes); fs.renameSync(temp,target) } finally {if(fs.existsSync(temp)) fs.unlinkSync(temp)}
        return { path: target }
      }
      throw new Error('PiAPI 成图重定向次数过多')
    } finally { clearTimeout(timer) }
  }))
  const assetJobs = new Map()
  const cacheFile = path.join(app.getPath('userData'), 'piapi-private-assets.json')
  let assetCache = {}
  try { const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (saved && typeof saved === 'object' && !Array.isArray(saved)) assetCache = saved } catch {}
  function saveAssetCache() {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(cacheFile + '.tmp', JSON.stringify(assetCache))
    fs.renameSync(cacheFile + '.tmp', cacheFile)
  }
  ipcMain.handle('piapi:ensure-private-asset', wrap(async ({ apiKey, url, sourceKey, assetType, name }) => {
    validateKey(apiKey); publicUrl(url)
    if (!['Image', 'Video', 'Audio'].includes(assetType) || typeof sourceKey !== 'string' || !sourceKey || sourceKey.length > 32 * 1024 * 1024) throw new Error('私有资产类型或来源标识无效')
    const key = crypto.createHash('sha256').update(apiKey.trim() + ':' + assetType + ':' + sourceKey).digest('hex')
    if (assetJobs.has(key)) return assetJobs.get(key)
    const job = (async () => {
      const cached = assetCache[key]
      if (cached?.assetId) {
        try { return await request(apiKey, BASE + '/api/v1/asset/' + cached.assetId, undefined, 'poll') }
        catch (error) { if (error.status !== 404) throw error; delete assetCache[key]; saveAssetCache() }
      }
      if (assetCache[key]?.uncertain) throw new Error('上次私有资产入库未收到明确响应，请先在资产库中查询并选择已入库素材，避免重复创建；本次未提交视频生成')
      // Persist uncertainty BEFORE POST; a lost response must not cause blind re-ingestion.
      assetCache[key] = { uncertain: true, createdAt: new Date().toISOString() }; saveAssetCache()
      let raw
      try { raw = await request(apiKey, BASE + '/api/v1/asset/upload', { url, asset_type: assetType, name: String(name || '画布参考素材').slice(0, 100) }, 'asset-create') }
      catch (error) {
        if ([400, 401, 403, 404, 413, 415, 422, 429].includes(error.status)) { delete assetCache[key]; saveAssetCache() }
        throw error
      }
      const asset = raw?.data || raw
      if (typeof asset.asset_id !== 'string' || !/^asset-[A-Za-z0-9_-]+$/.test(asset.asset_id)) throw new Error('私有资产入库未返回有效 ID，请先在 PiAPI 资产库确认结果')
      assetCache[key] = { assetId: asset.asset_id }; saveAssetCache()
      return raw
    })()
    assetJobs.set(key, job)
    try { return await job } finally { assetJobs.delete(key) }
  }))
  ipcMain.handle('piapi:upload', wrap(async ({ apiKey, data, fileName }) => {
    validateKey(apiKey)
    if (typeof data !== 'string' || !data.length || data.length > 10 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('PiAPI 上传数据无效或 Base64 数据超过 10 MB')
    const extension = path.extname(fileName || '').toLowerCase()
    if (!['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.wav', '.mp3'].includes(extension)) throw new Error('PiAPI 临时上传仅支持 JPG/PNG/WebP/MP4/WAV/MP3，MOV 请用公网直链')
    const result = await request(apiKey, UPLOAD, { file_name: 'reference-' + crypto.randomUUID() + extension, file_data: data }, 'upload')
    if (!result?.data?.url) throw new Error('PiAPI 素材上传未返回 URL，本次未提交生成任务')
    publicUrl(result.data.url)
    return result
  }))
  ipcMain.handle('piapi:inspect-media', wrap(async ({ url, kind }) => {
    if (!['images', 'videos', 'audios'].includes(kind)) throw new Error('参考媒体类型无效')
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000)
    const limit = kind === 'videos' ? 200 : kind === 'images' ? 30 : 15
    const mimeTypes = kind === 'videos' ? ['video/mp4', 'video/quicktime'] : kind === 'images' ? ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff', 'image/gif', 'image/heic', 'image/heif'] : ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave']
    const extensions = kind === 'videos' ? ['.mp4', '.mov'] : kind === 'images' ? ['.jpeg', '.jpg', '.png', '.webp', '.bmp', '.tiff', '.gif', '.heic', '.heif'] : ['.mp3', '.wav']
    try {
      let current = publicUrl(url)
      for (let hop = 0; hop < 6; hop++) {
        // Range GET works with signed download URLs that may not permit HEAD.
        const response = await net.fetch(current.href, { method: 'GET', headers: { Range: 'bytes=0-0' }, redirect: 'manual', signal: controller.signal })
        await response.body?.cancel()
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location')
          if (!location) throw new Error('参考媒体直链重定向缺少地址')
          current = publicUrl(new URL(location, current).href); continue
        }
        if (!response.ok) throw new Error(`参考媒体直链无法读取（HTTP ${response.status}），本次未提交生成任务`)
        const range = response.headers.get('content-range') || ''
        const size = range ? Number(range.split('/').pop()) : Number(response.headers.get('content-length') || 0)
        if (size > limit * 1024 * 1024) throw new Error(`PiAPI 参考${kind === 'videos' ? '视频' : kind === 'images' ? '图片' : '音频'}不能超过 ${limit} MB`)
        const mime = (response.headers.get('content-type') || '').split(';')[0].toLowerCase()
        const extension = path.extname(current.pathname).toLowerCase()
        if (!mimeTypes.includes(mime) && (mime && mime !== 'application/octet-stream' && mime !== 'binary/octet-stream' || extension && !extensions.includes(extension))) throw new Error(`PiAPI 参考${kind === 'videos' ? '视频仅支持 MP4/MOV' : kind === 'images' ? '图片格式不支持' : '音频仅支持 MP3/WAV'}，请检查直链返回的文件格式`)
        return { size: Number.isFinite(size) ? size : undefined, mime }
      }
      throw new Error('参考媒体直链重定向次数过多')
    } finally { clearTimeout(timer) }
  }))
  async function downloadFile(url, apiKey, destination) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 300000)
    try {
      let current = publicUrl(url)
      for (let hop = 0; hop < 6; hop++) {
        const headers = { Accept: 'video/*,application/octet-stream;q=0.9' }
        // Credentials are attached only to the PiAPI origin, never a storage CDN.
        if (current.origin === BASE) headers['X-API-Key'] = apiKey.trim()
        const response = await net.fetch(current.href, { headers, redirect: 'manual', signal: controller.signal })
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location')
          await response.body?.cancel()
          if (!location) throw new Error('PiAPI 成片重定向缺少地址')
          current = publicUrl(new URL(location, current).href); continue
        }
        if (!response.ok) throw Object.assign(new Error(`PiAPI 成片下载失败（HTTP ${response.status}）`), { retryable: [404, 409, 425, 429, 500, 502, 503, 504].includes(response.status) })
        if (!response.body || /json|text/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw retry('PiAPI 成片尚未就绪，正在继续获取') }
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination))
        try { validateVideo(destination, Number(response.headers.get('content-length') || 0)) }
        catch (error) { throw retry(error.message.split('YU25').join('PiAPI')) }
        return
      }
      throw new Error('PiAPI 成片重定向次数过多')
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw retry('PiAPI 成片下载超时或连接中断，保留原任务继续获取')
      throw error
    } finally { clearTimeout(timer) }
  }
  ipcMain.handle('piapi:download', wrap(async ({ apiKey, taskId, videoUrl }) => {
    validateKey(apiKey); publicUrl(videoUrl)
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(taskId)) throw new Error('PiAPI 任务 ID 无效')
    const hash = crypto.createHash('sha256').update(apiKey.trim() + ':' + taskId).digest('hex')
    if (downloads.has(hash)) return downloads.get(hash)
    const job = (async () => {
      const directory = path.join(app.getPath('userData'), 'generated-videos', 'piapi')
      fs.mkdirSync(directory, { recursive: true })
      const target = path.join(directory, hash + '.mp4'), temp = target + '.part'
      if (fs.existsSync(target)) { try { validateVideo(target, 0); return { path: target } } catch { fs.unlinkSync(target) } }
      try { await downloadFile(videoUrl, apiKey, temp); fs.renameSync(temp, target); return { path: target } }
      finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
    })()
    downloads.set(hash, job)
    try { return await job } finally { downloads.delete(hash) }
  }))
}
