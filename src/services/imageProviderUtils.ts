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
