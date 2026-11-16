const path = require('path')
const crypto = require('crypto')
const { createVideoSaver } = require('./videoStorage.cjs')

const origin = 'https://luocisheng.cn'
const taskPath = /^\/api\/v1\/tasks\/[A-Za-z0-9_.:-]+$/
const downloads = new Map()

module.exports = function registerLuociVideo({ ipcMain, net, app }) {
  const handle = (name, fn) => ipcMain.handle(name, async (_event, args) => {
    try {
      if (!args || typeof args.key !== 'string' || !args.key.trim() || /[\r\n]/.test(args.key)) throw new Error('请填写有效的洛辞 API Key')
      return { ok: true, data: await fn(args) }
    } catch (err) {
      return { ok: false, error: String(err.message).split(args?.key || '\0').join('[密钥]'), status: err.status }
    }
  })
  handle('luoci-video:request', async ({ key, route, body, requestKey }) => {
    const create = route === '/api/v1/videos/generations'
    const post = create || route === '/api/v1/videos/quote'
    if (!post && route !== '/api/v1/balance' && !taskPath.test(route)) throw new Error('无效的洛辞接口')
    if (post && body?.modelId !== 'seedance-2-5-uncensored') throw new Error('无效的洛辞模型')
    const headers = { Authorization: 'Bearer ' + key, Accept: 'application/json' }
    if (post) headers['Content-Type'] = 'application/json'
    if (create) {
      if (!/^[\w.:-]{8,128}$/.test(requestKey || '')) throw new Error('缺少有效的提交标识')
      headers['Idempotency-Key'] = requestKey
    }
    const res = await net.fetch(origin + route, {
      method: post ? 'POST' : 'GET', redirect: 'error', headers,
      body: post ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw Object.assign(new Error('洛辞 HTTP ' + res.status + '：' +
      (data?.error?.message || data?.error || data?.message || res.statusText)), { status: res.status })
    if (!data) throw new Error('洛辞返回的数据无法解析')
    return data
  })
  handle('luoci-video:download', async ({ key, taskId, url }) => {
    const result = new URL(url, origin)
    const prefix = '/api/v1/tasks/' + encodeURIComponent(taskId) + '/videos/'
    if (result.origin !== origin || result.username || result.password || !result.pathname.startsWith(prefix)
        || !/^\d+$/.test(result.pathname.slice(prefix.length))) throw new Error('洛辞返回了无效的任务下载地址')
    const id = crypto.createHash('sha256').update(key + '\0' + taskId + '\0' + result.pathname).digest('hex')
    if (downloads.has(id)) return downloads.get(id)
    const save = createVideoSaver({
      root: path.join(app.getPath('userData'), 'generated-videos', 'luoci'),
      fetch: async (address, options) => {
        const res = await net.fetch(address, { ...options, redirect: 'manual', headers: { Authorization: 'Bearer ' + key } })
        if ([301,302,303,307,308].includes(res.status)) {
          const location = res.headers.get('location')
          if (!location) throw new Error('下载跳转缺少目标地址')
          const next = new URL(location, address)
          if (next.protocol !== 'https:' || next.username || next.password) throw new Error('无效的下载跳转')
          return net.fetch(next.href, { ...options, redirect: 'follow', headers: {} })
        }
        if (!res.ok) throw Object.assign(new Error(res.status === 410 ? '洛辞成片已超过保存期限（410）' : '洛辞成片下载失败，HTTP ' + res.status), { status: res.status })
        return res
      },
    })
    const job = save({ url: result.href, assetId: id })
    downloads.set(id, job)
    try { return await job } finally { downloads.delete(id) }
  })
}
