import { urlToBase64, compressImageToDataUrl } from './imageProviderUtils'

const pending = new Map<string, Promise<string>>()

/** Local references use Qiling's own stable image host, matching its video plugin. */
export async function ensureQilingImageUrl(url: string, apiKey: string): Promise<string> {
  if (/^https:\/\//i.test(url)) return url
  if (/^(http:|asset:)/i.test(url)) throw new Error('器灵参考图片需要公网 HTTPS 地址，请重新导入本地图片')
  if (!apiKey.trim()) throw new Error('未配置器灵 API Key')
  const upload = window.electronAPI?.qiling?.upload
  if (!upload) throw new Error('器灵图片上传组件未加载，请完全退出并重新打开软件')
  const key = apiKey + '\0' + url
  if (pending.has(key)) return pending.get(key)!
  const job = (async () => {
    const { base64, mimeType } = await urlToBase64(url)
    const dataUrl = await compressImageToDataUrl(base64, mimeType, 1280, 0.85)
    const result = await upload({ apiKey, dataUrl })
    if (!result?.ok || typeof result.data?.url !== 'string' || !/^https:\/\//i.test(result.data.url)) {
      throw new Error(result?.error || '器灵图床未返回有效 HTTPS 图片地址')
    }
    return result.data.url as string
  })()
  pending.set(key, job)
  try { return await job } finally { pending.delete(key) }
}
