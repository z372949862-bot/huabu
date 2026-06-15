/**
 * 把 AI 生成的图片落盘到 userData/projects/{projectId}/images，
 * 避免 base64 data URL 直接塞进 store / 持久化（一张 2K PNG ≈ 4-8MB）。
 *
 * 浏览器 / 非 Electron 环境直接返回原 URL（fallback 不影响主流程）。
 */

declare global {
  interface Window {
    electronAPI?: {
      image?: {
        save: (payload: { projectId?: string; nodeId: string; dataUrl: string; ext?: string }) => Promise<{ path: string } | null>
        delete: (filePath: string) => Promise<boolean>
      }
    }
  }
}

function pathToLocalUploadUrl(filePath: string): string {
  // C:\path\file.png → local-upload:///C:/path/file.png
  const normalized = filePath.replace(/\\/g, '/')
  return 'local-upload:///' + normalized
}

/**
 * 落盘并返回 local-upload:/// URL。如果输入不是 data URL 或环境不支持，原样返回。
 * 失败时返回原 URL（warn 一下），保证主流程不中断。
 */
export async function persistImage(
  url: string,
  ctx: { projectId?: string | null; nodeId: string },
): Promise<string> {
  if (!url || typeof url !== 'string') return url
  if (!url.startsWith('data:image/')) return url
  const api = (window as any).electronAPI?.image
  if (!api?.save) return url
  const m = url.match(/^data:image\/([a-z+.-]+);base64,/i)
  const ext = (m?.[1] || 'png').replace(/\+xml/i, '').toLowerCase()
  try {
    const result = await api.save({
      projectId: ctx.projectId || undefined,
      nodeId: ctx.nodeId,
      dataUrl: url,
      ext,
    })
    if (!result?.path) return url
    return pathToLocalUploadUrl(result.path)
  } catch (err) {
    console.warn('[persistImage] failed, falling back to data URL:', err)
    return url
  }
}
