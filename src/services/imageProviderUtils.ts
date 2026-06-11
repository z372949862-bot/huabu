/**
 * 图片 Provider 共享工具：urlToBase64 + request 超时封装
 * 供 geeknow.ts / chuhaiying.ts / chuhaiyingVideo.ts / seedance.ts 共用
 */

/** 把任何形式的图片 URL 规范成"裸 base64 字符串 + mimeType" */
export async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  if (!url) throw new Error('图片 URL 为空')

  // 已是 data:image/png;base64,xxxx
  const dataMatch = url.match(/^data:(image\/[a-z+.-]+);base64,(.*)$/i)
  if (dataMatch) return { mimeType: dataMatch[1], base64: dataMatch[2] }

  // local-upload:/// → IPC 读磁盘
  if (url.startsWith('local-upload:///')) {
    const filePath = url.replace('local-upload:///', '')
    const result = await window.electronAPI?.upload?.read(filePath)
    if (!result) throw new Error('读取本地文件失败：文件不存在或无法访问')
    const ext = (filePath.split('.').pop() || 'png').toLowerCase()
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
    }
    return { mimeType: mimeMap[ext] || 'image/png', base64: result.data }
  }

  // 看起来已经是裸 base64（不带前缀）
  if (!url.startsWith('http') && !url.startsWith('blob:') && !url.startsWith('file:')) {
    return { mimeType: 'image/png', base64: url }
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`读取图片失败 ${res.status}`)
  const blob = await res.blob()
  const reader = new FileReader()
  return await new Promise((resolve, reject) => {
    reader.onload = () => {
      const result = String(reader.result || '')
      const m = result.match(/^data:(image\/[a-z+.-]+);base64,(.*)$/i)
      if (m) resolve({ mimeType: m[1], base64: m[2] })
      else reject(new Error('FileReader 输出不是 data URL'))
    }
    reader.onerror = () => reject(reader.error || new Error('FileReader 失败'))
    reader.readAsDataURL(blob)
  })
}

/**
 * 把图片压缩成 JPEG data URL，避免多张参考图原图内联导致请求体过大（413）。
 * 策略对齐参考插件 _image_to_data_url：最长边缩到 maxSize（默认 1024），
 * 重编码为 JPEG（默认质量 0.85）。透明区填白，避免 PNG 透明在 JPEG 里发黑。
 * 任何失败都回退到原始 data URL，保证不影响主流程。
 */
export async function compressImageToDataUrl(
  base64: string,
  mimeType: string,
  maxSize = 1024,
  quality = 0.85,
): Promise<string> {
  const srcDataUrl = `data:${mimeType};base64,${base64}`
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('图片解码失败'))
      el.src = srcDataUrl
    })
    const sw = img.naturalWidth || img.width
    const sh = img.naturalHeight || img.height
    if (!sw || !sh) return srcDataUrl
    let w = sw, h = sh
    if (Math.max(w, h) > maxSize) {
      const scale = maxSize / Math.max(w, h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return srcDataUrl
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return srcDataUrl
  }
}
