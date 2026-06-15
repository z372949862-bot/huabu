/**
 * 图床上传：把本地 blob:/data: URL 上传到中转站图床，换成公网 https URL，
 * 让视频生成 API 能真正读到这个素材（图片 / 视频 / 音频均可）。
 *
 * 接口：POST https://imageproxy.zhongzhuan.chat/api/upload
 *   Authorization: Bearer <token>   （复用 Seedance API Key）
 *   form: file=<File>
 * 响应：{ url: 'https://imageproxy.zhongzhuan.chat/api/proxy/image/xxx.png', created: ... }
 */

const UPLOAD_URL = 'https://imageproxy.zhongzhuan.chat/api/upload'

/** 把 blob:/data: URL 拉成 File，文件名按 MIME 自动选后缀，方便 form 上传 */
async function urlToFile(url: string, fallbackBase = 'asset'): Promise<File> {
  console.log('[imageHost] fetching asset:', url)

  // local-upload:/// 协议 renderer 进程的 fetch 不支持，走 IPC 读磁盘
  if (url.startsWith('local-upload:///')) {
    const filePath = url.replace('local-upload:///', '')
    const result = await window.electronAPI?.upload?.read(filePath)
    if (!result) throw new Error('读取本地文件失败：文件不存在或无法访问')
    const binary = Uint8Array.from(atob(result.data), c => c.charCodeAt(0))
    const ext = (filePath.split('.').pop() || 'bin').toLowerCase()
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
      mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    }
    const mime = mimeMap[ext] || 'application/octet-stream'
    const name = `${fallbackBase}.${ext}`
    return new File([binary], name, { type: mime })
  }

  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    console.error('[imageHost] fetch failed for:', url, err)
    throw new Error(`读取本地素材失败: ${err instanceof Error ? err.message : '网络错误'}`)
  }
  if (!res.ok) throw new Error(`读取本地素材失败: ${res.status}`)
  const blob = await res.blob()
  const mime = blob.type || 'application/octet-stream'
  const subtype = mime.split('/')[1] || 'bin'
  const ext = subtype === 'mpeg' && mime.startsWith('audio/') ? 'mp3' : subtype.split(';')[0]
  const name = `${fallbackBase}.${ext}`
  return new File([blob], name, { type: mime })
}

/** 上传到图床，返回公网 URL；公网 URL 原样透传 */
export async function ensureRemoteAssetUrl(url: string, apiKey: string): Promise<string> {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  if (!apiKey) throw new Error('未配置 API Key，无法上传素材')

  const file = await urlToFile(url)
  const form = new FormData()
  form.append('file', file)

  let res: Response
  try {
    res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch (err) {
    console.error('[imageHost] upload network error:', err)
    const msg = err instanceof Error ? err.message : '未知网络错误'
    throw new Error(`无法连接图床（${UPLOAD_URL}）：${msg}`)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body?.error?.message || body?.message || JSON.stringify(body)
    } catch {
      detail = res.statusText
    }
    throw new Error(`图床上传失败 ${res.status}：${detail}`)
  }
  const data = await res.json() as { url?: string }
  if (!data?.url) throw new Error('图床上传未返回 url')
  return data.url
}

/** 兼容旧调用点：图片上传保持原函数名可用 */
export async function ensureRemoteImageUrl(url: string, apiKey: string): Promise<string> {
  return ensureRemoteAssetUrl(url, apiKey)
}
