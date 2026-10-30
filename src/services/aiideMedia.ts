import { urlToFile } from './imageHost'
import { fetchWithTimeout } from './providers/_httpUtils'

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
  const response = await fetchWithTimeout('https://imageproxy.zhongzhuan.chat/api/upload', { method: 'POST', body: form, timeoutMs: 60_000 })
  if (!response.ok) throw new Error(`素材图床上传失败（HTTP ${response.status}），视频任务尚未提交`)
  const result = await response.json()
  if (!/^https?:\/\//i.test(result?.url || '')) throw new Error('素材图床未返回有效地址')
  return result.url
}
