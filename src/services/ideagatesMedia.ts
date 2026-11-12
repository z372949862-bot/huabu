import type { ContentItem, CreateTaskParams } from './ai-provider'
import { urlToFile } from './imageHost'
export interface IdeaGatesAsset { Id: string; Status?: string; AssetType?: string }
interface Bridge {
  prepareAsset: (payload: { dataUrl: string; assetType: string }) => Promise<IdeaGatesAsset>
  getAsset: (id: string, assetType: string) => Promise<IdeaGatesAsset>
}
const TYPES = { image_url: 'Image', video_url: 'Video', audio_url: 'Audio' } as const
export const isLocalIdeaGatesMedia = (url: string) => /^(local-upload:\/\/\/|file:\/\/\/|blob:|data:(image|video|audio)\/)/i.test(url)
function check(signal: AbortSignal) { if (signal.aborted) throw new DOMException('已停止准备素材', 'AbortError') }
function wait(ms: number, signal: AbortSignal): Promise<void> {
  check(signal)
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('已停止准备素材', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}
async function readDataUrl(url: string, type: string, signal: AbortSignal) {
  check(signal)
  const local = url.startsWith('file:///') ? 'local-upload:///' + decodeURIComponent(url.slice(8)) : url
  const file = await urlToFile(local)
  check(signal)
  if (!file.size || file.size > 100 * 1024 * 1024) throw new Error('本地参考素材须非空且不超过 100 MB')
  if (!file.type.toLowerCase().startsWith(type.toLowerCase() + '/')) throw new Error('本地文件格式与素材类型不匹配')
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => { reader.abort(); cleanup(); reject(new DOMException('已停止准备素材', 'AbortError')) }
    reader.onload = () => { cleanup(); resolve(String(reader.result)) }
    reader.onerror = () => { cleanup(); reject(new Error('读取本地素材失败')) }
    signal.addEventListener('abort', abort, { once: true })
    reader.readAsDataURL(file)
  })
}
export async function prepareIdeaGatesMedia(params: CreateTaskParams, bridge: Bridge, signal: AbortSignal,
  notify: (message: string) => void, dependencies: { read?: typeof readDataUrl; wait?: typeof wait; now?: () => number } = {}) {
  const sleep = dependencies.wait || wait, now = dependencies.now || Date.now, read = dependencies.read || readDataUrl
  const completed = new Map<string, string>(), content: ContentItem[] = []
  const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      check(signal)
      try { const result = await fn(); check(signal); return result }
      catch (error) {
        check(signal)
        if (!(error as any).retryable || attempt >= 3) throw error
        notify('素材服务暂未返回结果，正在读取原登记记录，尚未提交视频生成。')
        await sleep(Math.max(3000 * 2 ** attempt, Number((error as any).retryAfterMs) || 0), signal)
      }
    }
  }
  for (const item of params.content || []) {
    check(signal)
    if (item.type === 'text') { content.push({ ...item }); continue }
    const source = item[item.type]
    if (!source || typeof source !== 'object') throw new Error('参考素材格式无效')
    const url = source.url, type = TYPES[item.type]
    if (!isLocalIdeaGatesMedia(url) && !url.startsWith('asset://')) { content.push({ ...item }); continue }
    const key = type + ':' + url
    let target = completed.get(key)
    if (!target) {
      const label = { Image: '图片', Video: '视频', Audio: '音频' }[type]
      let asset: IdeaGatesAsset
      if (url.startsWith('asset://')) {
        notify(`正在检查已登记的参考${label}…`)
        asset = await retry(() => bridge.getAsset(url.slice(8), type))
      } else {
        notify(`正在读取参考${label}，尚未提交视频生成…`)
        const dataUrl = await read(url, type, signal)
        check(signal)
        notify(`正在上传并登记参考${label}，较大文件可能需要数分钟，尚未提交视频生成…`)
        asset = await retry(() => bridge.prepareAsset({ dataUrl, assetType: type }))
        // Creation may omit type/status; query the authoritative record before use.
        if (asset?.Id) asset = await retry(() => bridge.getAsset(asset.Id, type))
      }
      const start = now()
      for (;;) {
        check(signal)
        if (!asset?.Id) throw new Error('素材登记未返回 ID，请重试读取原登记结果')
        if (asset.AssetType && asset.AssetType !== type) throw new Error('已登记素材类型与当前引用不一致，视频尚未提交')
        const status = String(asset.Status || '').toLowerCase()
        if (status === 'active') {
          if (asset.AssetType !== type) throw new Error('素材服务未确认素材类型，视频尚未提交')
          target = 'asset://' + asset.Id; break
        }
        if (['failed', 'error', 'rejected', 'deleted', 'expired', 'disabled'].includes(status)) throw new Error(`参考${label}登记不可用（${asset.Status}），视频尚未提交`)
        if (status && !['processing', 'pending', 'queued', 'created'].includes(status)) throw new Error(`无法确认参考${label}状态（${asset.Status}），请稍后重试，视频尚未提交`)
        if (now() - start >= 10 * 60 * 1000) throw new Error('素材仍在处理中，登记记录已保留，请稍后重试；视频尚未提交')
        notify(`参考${label}已登记，等待官方处理为可用状态，尚未提交视频生成…`)
        await sleep(3000, signal)
        asset = await retry(() => bridge.getAsset(asset.Id, type))
      }
      completed.set(key, target)
    }
    content.push({ ...item, [item.type]: { ...source, url: target } })
  }
  return { ...params, content }
}
