import { urlToFile } from './imageHost'

/** AIIDE documents HTTP(S) / asset IDs. Local media first needs a public URL. */
export async function ensureAiideMediaUrl(url: string): Promise<string> {
  if (/^(https?:\/\/|asset:\/\/)/i.test(url) || /^mat_[\w-]+$/.test(url)) return url
  const file = await urlToFile(url)
  if (file.size > 100 * 1024 * 1024) throw new Error('参考素材超过本地上传上限 100 MB，请压缩后重试')
  if (window.electronAPI?.aiide?.upload) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('读取 AIIDE 参考素材失败'))
      reader.readAsDataURL(file)
    })
    const result = await window.electronAPI.aiide.upload({ dataUrl })
    if (!result?.ok || !result.data?.url) throw new Error(result?.error || 'AIIDE 参考素材上传未返回地址')
    return result.data.url
  }
  const form = new FormData()
  form.append('file', file)
  // Browser development fallback. No AIIDE credentials go to the staging host.
  // Keep the timeout active through the JSON body too, not just the headers.
  const controller = new AbortController()
  const timeoutMs = 600_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('https://imageproxy.zhongzhuan.chat/api/upload', { method: 'POST', body: form, signal: controller.signal })
    if (!response.ok) throw new Error(`素材图床上传失败（HTTP ${response.status}），视频任务尚未提交`)
    const result = await response.json()
    const remote = new URL(result?.url || '')
    if (!['http:', 'https:'].includes(remote.protocol) || remote.username || remote.password) throw new Error('素材图床未返回有效地址')
    return remote.href
  } catch (error) {
    if (controller.signal.aborted) throw new Error('AIIDE 参考素材上传超时（等待 10 分钟），请压缩素材或检查网络、代理连接。视频任务尚未提交')
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AIIDE 参考素材上传连接被中断，请检查网络或代理连接。视频任务尚未提交')
    throw error
  } finally { clearTimeout(timer) }
}
