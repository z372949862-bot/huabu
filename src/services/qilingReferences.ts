type MediaType = 'image' | 'video' | 'audio'
interface CanvasNode { id: string; type?: string; data?: Record<string, any> }

/** Keep mention identities and media order together until remote uploads finish. */
export function prepareQilingReferences(nodeId: string, nodes: CanvasNode[], edges: { source: string; target: string }[]) {
  const images: string[] = [], videos: string[] = [], audios: string[] = []
  const lists = { image: images, video: videos, audio: audios }
  const bindings = new Map<string, string>()
  const labels = { image: '@图片', video: '@视频', audio: '@音频' }
  const add = (type: MediaType, url: unknown, id?: string) => {
    if (typeof url !== 'string' || !url) return
    const list = lists[type]
    if (!list.includes(url)) list.push(url)
    if (id) bindings.set(id, `${labels[type]}${list.indexOf(url) + 1}`)
  }
  for (const edge of edges.filter(item => item.target === nodeId)) {
    const source = nodes.find(item => item.id === edge.source)
    const data = source?.data || {}
    const id = `node_${edge.source}`
    if (source?.type === 'asset-ref' && data.assetUrl) {
      add(data.assetType === 'video' ? 'video' : data.assetType === 'audio' ? 'audio' : 'image', data.assetUrl, id)
    } else if (data.outputImage) add('image', data.outputImage, id)
    else if (data.outputVideo) add('video', data.outputVideo, id)
    else if (data.outputAudio) add('audio', data.outputAudio, id)
  }
  const data = nodes.find(item => item.id === nodeId)?.data || {}
  // Same order as the node's reference panel: connected assets, then local uploads.
  for (const asset of data._uploads || []) {
    if (['image', 'video', 'audio'].includes(asset.type)) add(asset.type, asset.url, asset.id)
  }
  for (const url of data.inputImages || []) add('image', url)
  for (const url of data.inputVideos || []) add('video', url)
  for (const url of data.inputAudios || []) add('audio', url)
  add('image', data.inputImage)
  add('video', data.inputVideo)
  add('audio', data.inputAudio)
  const prompt = String(data.prompt || '').replace(/@\[([^\]]*)\]\(([^)]*)\)/g, (_match, name: string, id: string) => {
    const label = bindings.get(id)
    if (!label) throw new Error(`提示词引用的素材「${name || id}」已失效，请重新连接素材或插入引用`)
    return label
  }).trim()
  return { images, videos, audios, prompt }
}
