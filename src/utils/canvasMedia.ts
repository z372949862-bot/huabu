export type MediaKind = 'image' | 'video' | 'audio'
export interface CanvasMedia { id: string; type: MediaKind; url: string; name: string; fromNode?: boolean }
interface MediaNode { id: string; type?: string; data?: Record<string, any> }

/** The panel and the provider must assign the same identities and order to incoming media. */
export function connectedCanvasMedia(target: string, nodes: MediaNode[], edges: { source: string; target: string }[], requireReady = false): CanvasMedia[] {
  const media: CanvasMedia[] = []
  for (const edge of edges) {
    if (edge.target !== target) continue
    const source = nodes.find(node => node.id === edge.source)
    if (!source) continue
    const data = source.data || {}
    const asset = source.type === 'asset-ref'
    const type = asset ? (data.assetType || 'image')
      : data.outputImage ? 'image' : data.outputVideo ? 'video' : data.outputAudio ? 'audio' : undefined
    const url = asset ? data.assetUrl : (data.outputImage || data.outputVideo || data.outputAudio)
    const name = (asset && data.assetName) || data.label || (asset ? '上传素材' : '节点输出')
    if (type && url) media.push({ id: `node_${source.id}`, type, url, name, fromNode: true })
    else if (requireReady && (asset || source.type === 'ai-image' || source.type === 'ai-video')) {
      throw new Error(`已连接的参考素材「${name}」还没有可用内容，请先完成上游节点或断开连线`)
    }
  }
  return media
}

/** Restore the same local file URL for a reopened project and a newly attached file. */
export function canvasMediaUrl(path: string): string {
  if (/^file:\/\/\//i.test(path)) {
    const local = path.slice(8)
    try { return 'local-upload:///' + decodeURIComponent(local) } catch { return 'local-upload:///' + local }
  }
  if (/^[A-Za-z]:[\\/]/.test(path)) return 'local-upload:///' + path.replace(/\\/g, '/')
  return path
}

export function inferCanvasMediaKind(file: File): MediaKind | null {
  const mime = file.type.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'

  const extension = file.name.toLowerCase().split('.').pop() || ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff'].includes(extension)) return 'image'
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'].includes(extension)) return 'video'
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'].includes(extension)) return 'audio'
  return null
}

const mediaFields = { image: 'images', video: 'videos', audio: 'audios' } as const
const labels = { image: '图片', video: '视频', audio: '音频' } as const

/** Old canvases kept a snapshot of local files and connections together. */
export function legacyCanvasUploads(data: Record<string, any>, connected: CanvasMedia[]): CanvasMedia[] {
  const uploads: CanvasMedia[] = []
  for (const type of ['image', 'video', 'audio'] as const) {
    const key = { image: 'inputImage', video: 'inputVideo', audio: 'inputAudio' }[type]
    const seen = new Set(connected.filter(a => a.type === type).map(a => canvasMediaUrl(a.url)))
    for (const raw of [...(data[key + 's'] || []), data[key]]) {
      if (!raw) continue
      const url = canvasMediaUrl(raw)
      if (seen.has(url)) continue
      seen.add(url)
      const name = /^(data:|blob:)/i.test(url) ? '' : url.split(/[?#]/, 1)[0].split(/[\\/]/).pop()
      uploads.push({ id: `legacy_${type}_${uploads.length + 1}`, type, name: name || labels[type], url })
    }
  }
  return uploads
}

/** Bind the prompt to exactly the same ordered slots as the reference panel. */
export function bindCanvasReferences(prompt: string, selected: CanvasMedia[]) {
  const refs = { images: [] as string[], videos: [] as string[], audios: [] as string[] }
  const bindings = new Map<string, string>()
  for (const asset of selected) {
    const field = mediaFields[asset?.type]
    if (!field || typeof asset.url !== 'string' || !asset.url.trim()) {
      throw new Error(`参考素材「${asset?.name || '未命名'}」尚不可用，请等待读取完成或移除后重新添加`)
    }
    const position = refs[field].push(canvasMediaUrl(asset.url.trim()))
    if (asset.id) bindings.set(asset.id, `@${labels[asset.type]}${position}`)
  }
  return { ...refs, prompt: String(prompt || '').replace(/@\[([^\]]*)\]\(([^)]*)\)/g, (_, name, id) => {
    if (!bindings.has(id)) throw new Error(`提示词引用的素材「${name || id}」已失效，请重新选择素材或移除引用`)
    return bindings.get(id)!
  }) }
}
