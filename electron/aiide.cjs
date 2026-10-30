const crypto = require('crypto')

// AIIDE accepts public media URLs, not multipart local files. Keep the existing
// staging host, but upload outside renderer CORS and never send provider keys.
module.exports = function registerAiide({ ipcMain, fetch, retryDelay = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const cache = new Map()
  const inflight = new Map()
  ipcMain.handle('aiide:upload', async (_event, { dataUrl } = {}) => {
    try {
      const match = typeof dataUrl === 'string' && dataUrl.match(/^data:((?:image|video|audio)\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/i)
      const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/tiff': 'tiff', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' }
      const ext = match && extensions[match[1].toLowerCase()]
      if (!ext) throw new Error('AIIDE 不支持该参考素材格式，请使用图片、MP4/MOV 视频或 MP3/WAV 音频')
      const bytes = Buffer.from(match[2], 'base64')
      if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error('参考素材为空或超过本地上传上限 100 MB，请压缩后重试')
      const hash = crypto.createHash('sha256').update(match[1]).update(bytes).digest('hex')
      const saved = cache.get(hash)
      if (saved && Date.now() - saved.time < 30 * 60 * 1000) return { ok: true, data: { url: saved.url } }
      if (!inflight.has(hash)) {
        const job = (async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 60_000)
            try {
              const form = new FormData()
              form.append('file', new Blob([bytes], { type: match[1] }), `reference.${ext}`)
              const response = await fetch('https://imageproxy.zhongzhuan.chat/api/upload', {
                method: 'POST', body: form, signal: controller.signal,
              })
              if (!response.ok) {
                await response.body?.cancel().catch(() => {})
                throw Object.assign(new Error(`素材图床上传失败（HTTP ${response.status}）`), {
                  retryable: response.status >= 500 || [408, 429].includes(response.status),
                })
              }
              const result = await response.json()
              let url
              try { url = new URL(result?.url) } catch { throw new Error('素材图床未返回有效地址') }
              if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('素材图床返回了无效地址')
              cache.set(hash, { url: url.href, time: Date.now() })
              while (cache.size > 128) cache.delete(cache.keys().next().value)
              return { url: url.href }
            } catch (error) {
              const transient = error.retryable || error.name === 'AbortError' || error instanceof TypeError
              if (!transient || attempt === 2) throw new Error('AIIDE 参考素材上传失败：' + error.message + '。视频任务尚未提交，请稍后重试或使用可公开访问的素材链接')
              await retryDelay(1000 * 2 ** attempt)
            } finally { clearTimeout(timer) }
          }
        })()
        inflight.set(hash, job)
        void job.finally(() => inflight.delete(hash)).catch(() => {})
      }
      return { ok: true, data: await inflight.get(hash) }
    } catch (error) { return { ok: false, error: error.message || 'AIIDE 素材上传失败' } }
  })
}
