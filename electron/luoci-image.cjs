const origin = 'https://luocisheng.cn'
const model = 'seedream-5-5'
const taskRoute = /^\/api\/v1\/tasks\/[A-Za-z0-9_.:-]+$/
const ratios = ['auto', '1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2', '1:2', '2:1', '21:9']
const mimeTypes = ['image/png', 'image/jpeg', 'image/webp']

module.exports = function registerLuociImage({ ipcMain, net }) {
  const handle = (channel, fn) => ipcMain.handle('luoci-image:' + channel, async (_event, args) => {
    try {
      if (!args || typeof args.key !== 'string' || !args.key.trim() || /[\r\n]/.test(args.key)) throw new Error('请填写有效的洛辞 API Key')
      return { ok: true, data: await fn(args) }
    } catch (error) {
      return { ok: false, error: String(error.message).split(args?.key || '\0').join('[密钥]'), status: error.status }
    }
  })
  const json = async (key, route, body, requestKey) => {
    const res = await net.fetch(origin + route, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(requestKey ? { 'Idempotency-Key': requestKey } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw Object.assign(new Error(`洛辞 HTTP ${res.status}：${data?.error?.message || data?.error || res.statusText}`), { status: res.status })
    if (!data) throw new Error('洛辞返回的数据无法解析')
    return data
  }
  handle('request', async ({ key, route, body, requestKey }) => {
    const create = route === '/api/v1/images/generations'
    if (create || route === '/api/v1/images/quote') {
      if (body?.modelId !== model || !body.prompt?.trim() || !Number.isInteger(body.numImages) || body.numImages < 1
        || !['1K', '1.5K', '2K'].includes(body.imageSize) || !ratios.includes(body.aspectRatio)) throw new Error('Seedream 5.5 生图参数无效')
      if (body.referenceImageIds !== undefined && (!Array.isArray(body.referenceImageIds) || body.referenceImageIds.length > 10
        || body.referenceImageIds.some(id => typeof id !== 'string' || !id))) throw new Error('参考图片 ID 无效，最多 10 张')
      if (create && !/^[\w.:-]{8,128}$/.test(requestKey || '')) throw new Error('缺少有效的幂等提交标识')
    } else if ((route !== '/api/v1/balance' && !taskRoute.test(route)) || body !== undefined) throw new Error('无效的洛辞图片接口')
    return json(key, route, body, create ? requestKey : undefined)
  })
  handle('upload', async ({ key, modelId, name, mime, base64 }) => {
    if (modelId !== model || !mimeTypes.includes(mime)) throw new Error('参考图片仅支持 PNG、JPEG、WebP')
    if (typeof base64 !== 'string' || base64.length > 42 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('无效的参考图片数据')
    const bytes = Buffer.from(base64, 'base64')
    if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error('参考图片不能为空，单张最多 30MB')
    const filename = typeof name === 'string' && name.length <= 255 ? name : 'reference.' + mime.split('/')[1]
    const authorized = await json(key, '/api/v1/reference-uploads/authorize', { modelId, file: { name: filename, type: mime, size: bytes.length } })
    const url = new URL(authorized.uploadUrl)
    if (url.protocol !== 'https:' || url.username || url.password || typeof authorized.uploadId !== 'string' || !authorized.uploadId) throw new Error('洛辞返回了无效的上传凭证')
    // expiresAt has no documented wire format; numeric timestamps and local clock
    // skew must not reject fresh credentials. Storage validates expiry on PUT.
    const headers = authorized.headers || {}
    if (Object.values(headers).some(value => typeof value !== 'string' || value.includes(key))) throw new Error('洛辞上传凭证包含无效请求头')
    // Only the signed upload headers go to storage, never the API Bearer key.
    const uploaded = await net.fetch(url.href, { method: 'PUT', headers, body: bytes, redirect: 'error', signal: AbortSignal.timeout(120000) })
    if (!uploaded.ok) throw new Error(uploaded.status === 403
      ? '参考图片直传被拒绝（HTTP 403），请重试以重新申请上传凭证'
      : `参考图片直传失败，HTTP ${uploaded.status}`)
    const completed = await json(key, '/api/v1/reference-uploads/' + encodeURIComponent(authorized.uploadId) + '/complete', {})
    if (typeof completed.id !== 'string' || !completed.id) throw new Error('洛辞未返回已确认的参考图片 ID')
    return completed
  })
  handle('download', async ({ key, taskId, url }) => {
    let address = new URL(url, origin)
    // The API documents a same-site URL, not a fixed download pathname.
    if (typeof taskId !== 'string' || !taskId || address.origin !== origin || address.username || address.password) throw new Error('洛辞返回了无效的图片下载地址')
    let headers = { Authorization: 'Bearer ' + key }
    for (let hop = 0; hop < 4; hop++) {
      const res = await net.fetch(address.href, { headers, redirect: 'manual', signal: AbortSignal.timeout(120000) })
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location')
        if (!location) throw new Error('图片下载跳转缺少地址')
        address = new URL(location, address)
        if (address.protocol !== 'https:' || address.username || address.password) throw new Error('无效的图片下载跳转')
        headers = {} // Signed CDN URL needs no API credentials.
        continue
      }
      if (!res.ok) throw new Error(`洛辞图片下载失败，HTTP ${res.status}；原任务已保留`)
      if (Number(res.headers.get('content-length')) > 50 * 1024 * 1024) throw new Error('返回图片超过 50MB')
      const bytes = Buffer.from(await res.arrayBuffer())
      if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error('返回图片为空或超过 50MB')
      const mime = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : undefined
      if (!mime) throw new Error('洛辞返回的内容不是有效图片；原任务已保留')
      return { dataUrl: `data:${mime};base64,${bytes.toString('base64')}` }
    }
    throw new Error('图片下载跳转次数过多')
  })
}
