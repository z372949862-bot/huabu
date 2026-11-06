// Download generated image bytes through the desktop network stack (no CORS).
// No API credentials are accepted or forwarded to result/CDN URLs.
function publicResultUrl(value) {
  const url = new URL(value)
  const host = url.hostname.toLowerCase()
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.')
    || host.startsWith('169.254.') || host === '0.0.0.0' || host.includes(':')
    || /^172[.](1[6-9]|2[0-9]|3[01])[.]/.test(host)) throw new Error('生成结果必须是公网 HTTP(S) 地址')
  return url.href
}

function createImageResultFetch({ fetch, timeoutMs = 120000, maxBytes = 100 * 1024 * 1024 }) {
  return async ({ url: source }) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      let url = publicResultUrl(source)
      for (let redirects = 0; redirects <= 5; redirects++) {
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit', redirect: 'manual' })
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel()
          const location = response.headers.get('location')
          if (!location || redirects === 5) throw new Error('图片下载重定向异常')
          url = publicResultUrl(new URL(location, url).href)
          continue
        }
        if (!response.ok) { await response.body?.cancel(); throw new Error(`图片下载失败 HTTP ${response.status}`) }
        if (Number(response.headers.get('content-length')) > maxBytes) {
          await response.body?.cancel(); throw new Error('图片结果超过 100 MB，无法载入')
        }
        if (!response.body) throw new Error('图片结果为空')
        const reader = response.body.getReader()
        const chunks = []
        let total = 0
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            total += value.length
            if (total > maxBytes) { await reader.cancel(); throw new Error('图片结果超过 100 MB，无法载入') }
            chunks.push(Buffer.from(value))
          }
        } finally { reader.releaseLock() }
        if (!total) throw new Error('图片结果为空')
        return { base64: Buffer.concat(chunks).toString('base64') }
      }
      throw new Error('图片下载重定向异常')
    } catch (error) {
      if (controller.signal.aborted) throw new Error('图片下载超时，可重试下载已生成的结果')
      throw error
    } finally { clearTimeout(timer) }
  }
}
module.exports = { createImageResultFetch }
