const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable, Transform } = require('stream')
const { pipeline } = require('stream/promises')

function createVideoSaver({ root, fetch, timeoutMs = 300000, maxBytes = 1024 * 1024 * 1024 }) {
  const pending = new Map()
  let active = 0
  const queue = []
  async function slot(fn) {
    if (active >= 2) await new Promise(resolve => queue.push(resolve))
    else active++
    try { return await fn() }
    finally {
      const next = queue.shift()
      if (next) next()
      else active--
    }
  }
  return function save({ url, projectId, assetId } = {}) {
    let remote
    try { remote = new URL(url) } catch { return Promise.reject(new Error('成片链接无效')) }
    if (!['https:', 'http:'].includes(remote.protocol)) return Promise.reject(new Error('仅支持保存 HTTP/HTTPS 成片链接'))
    const project = 'project-' + String(projectId || 'default').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80)
    const hash = crypto.createHash('sha256').update(String(assetId || url)).digest('hex')
    const key = project + '/' + hash
    if (pending.has(key)) return pending.get(key)
    const job = slot(async () => {
      const dir = path.resolve(root, project)
      if (!dir.startsWith(path.resolve(root) + path.sep)) throw new Error('本地保存路径无效')
      await fs.promises.mkdir(dir, { recursive: true })
      for (const ext of ['mp4', 'mov', 'webm', 'mkv']) {
        const file = path.join(dir, hash + '.' + ext)
        try { if ((await fs.promises.stat(file)).size > 0) return { path: file } } catch {}
      }
      const temporary = path.join(dir, hash + '.part')
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        // Signed result links do not need API credentials. Never attach a provider key.
        const response = await fetch(url, { signal: controller.signal })
        if (response.status !== 200 || !response.body) throw new Error('成片下载失败，HTTP ' + response.status)
        const mime = response.headers.get('content-type') || ''
        if (/json|text\/|image\/|audio\/|xml/i.test(mime)) throw new Error('平台返回的内容不是视频文件')
        const expected = Number(response.headers.get('content-length') || 0)
        if (expected > maxBytes) throw new Error('成片超过 1 GB，无法自动保存')
        let size = 0, header = Buffer.alloc(0)
        const inspect = new Transform({
          transform(chunk, _encoding, callback) {
            size += chunk.length
            if (header.length < 32) header = Buffer.concat([header, chunk.subarray(0, 32 - header.length)])
            if (size > maxBytes) return callback(new Error('成片超过 1 GB，无法自动保存'))
            callback(null, chunk)
          },
        })
        await pipeline(Readable.fromWeb(response.body), inspect, fs.createWriteStream(temporary), { signal: controller.signal })
        if (!size || (expected && !response.headers.get('content-encoding') && expected !== size)) {
          throw new Error('成片未下载完整，请重试保存')
        }
        const box = header.subarray(4, 8).toString('ascii')
        const isMp4 = ['ftyp', 'moov', 'mdat', 'wide'].includes(box)
        const isWebm = header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        if (!isMp4 && !isWebm) throw new Error('下载内容不是可识别的视频文件')
        const ext = isWebm ? (/matroska/i.test(mime) ? 'mkv' : 'webm')
          : /quicktime/i.test(mime) || /\.mov$/i.test(remote.pathname) ? 'mov' : 'mp4'
        const finalPath = path.join(dir, hash + '.' + ext)
        await fs.promises.rename(temporary, finalPath)
        return { path: finalPath }
      } catch (error) {
        if (controller.signal.aborted) throw new Error('成片已生成，但保存到本地超时，请重试保存')
        throw error
      } finally {
        clearTimeout(timer)
        await fs.promises.rm(temporary, { force: true }).catch(() => {})
      }
    })
    pending.set(key, job)
    void job.finally(() => pending.delete(key)).catch(() => {})
    return job
  }
}

module.exports = { createVideoSaver }
