/**
 * 局部重绘服务：用户在已生成图上画矩形选区 → 裁剪 → 调图编辑模型重绘 → 羽化贴回。
 *
 * 不依赖 mask API；纯前端 canvas 合成。模型只看到选区裁片 + 用户描述，
 * 输出贴回原图对应坐标，边缘做径向羽化让过渡看起来自然。
 */

import { useAIStore } from '@/stores/ai'

/**
 * 把屏幕坐标的选区换算成原图像素坐标，并加 padding 让边界更自然。
 * 纯函数，便于单测。
 */
export function mapRectToSource(
  rect: { x: number; y: number; w: number; h: number },
  displayW: number,
  displayH: number,
  naturalW: number,
  naturalH: number,
  paddingRatio = 0.08,
): { sx: number; sy: number; sw: number; sh: number } {
  if (displayW <= 0 || displayH <= 0) return { sx: 0, sy: 0, sw: naturalW, sh: naturalH }
  const scaleX = naturalW / displayW
  const scaleY = naturalH / displayH
  const px = rect.w * paddingRatio
  const py = rect.h * paddingRatio
  const sx = Math.max(0, Math.round((rect.x - px) * scaleX))
  const sy = Math.max(0, Math.round((rect.y - py) * scaleY))
  const sw = Math.max(1, Math.min(naturalW - sx, Math.round((rect.w + 2 * px) * scaleX)))
  const sh = Math.max(1, Math.min(naturalH - sy, Math.round((rect.h + 2 * py) * scaleY)))
  return { sx, sy, sw, sh }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}

function cropToDataUrl(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): string {
  const c = document.createElement('canvas')
  c.width = sw
  c.height = sh
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('canvas 2D 上下文不可用')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return c.toDataURL('image/png')
}

async function compositeBack(
  baseImg: HTMLImageElement,
  patchUrl: string,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  featherPx = 16,
): Promise<string> {
  const patch = await loadImage(patchUrl)
  // 主画布：完整原图
  const main = document.createElement('canvas')
  main.width = baseImg.naturalWidth
  main.height = baseImg.naturalHeight
  const ctx = main.getContext('2d')
  if (!ctx) throw new Error('canvas 2D 上下文不可用')
  ctx.drawImage(baseImg, 0, 0)

  // 离屏画布：把 patch 画上去，再用径向渐变把边缘羽化掉
  const off = document.createElement('canvas')
  off.width = sw
  off.height = sh
  const octx = off.getContext('2d')
  if (!octx) throw new Error('canvas 2D 上下文不可用')
  octx.drawImage(patch, 0, 0, sw, sh)

  // destination-in 配径向渐变 = 越靠近边缘 alpha 越低
  const cx = sw / 2
  const cy = sh / 2
  const inner = Math.max(0, Math.min(sw, sh) / 2 - featherPx)
  const outer = Math.max(inner + 1, Math.min(sw, sh) / 2)
  const grad = octx.createRadialGradient(cx, cy, inner, cx, cy, outer)
  grad.addColorStop(0, 'rgba(0,0,0,1)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  octx.globalCompositeOperation = 'destination-in'
  octx.fillStyle = grad
  octx.fillRect(0, 0, sw, sh)

  // 贴回主画布
  ctx.drawImage(off, sx, sy)
  return main.toDataURL('image/png')
}

/**
 * 局部重绘主入口。
 * - sourceUrl  原图 URL（http/https/data:/local-upload:/// 都行）
 * - displayedImg 用户屏幕上看到的 <img>，用来取 client 尺寸做坐标换算
 * - rect 屏幕坐标的选区
 * - prompt 用户写的重绘描述
 *
 * 返回合成后的 PNG dataURL；调用方自己决定要不要落盘。
 */
export async function runInpaint(
  sourceUrl: string,
  displayedImg: HTMLImageElement,
  rect: { x: number; y: number; w: number; h: number },
  prompt: string,
): Promise<string> {
  if (!prompt.trim()) throw new Error('请输入选区描述')
  if (rect.w < 8 || rect.h < 8) throw new Error('选区太小，至少 8×8 像素')

  const aiStore = useAIStore()
  const providerId = aiStore.defaultImageProviderId
  if (!providerId) throw new Error('请先在「设置」配置图片中转站')
  const cfg = aiStore.getProviderConfig(providerId)
  if (!cfg) throw new Error('找不到默认图片中转站')
  // 优先 nano-banana 系列（出海营，明确支持图编辑）；否则任意支持参考图的模型
  const model =
    cfg.models.find((m) => m.id.startsWith('nano-banana'))?.id
    || cfg.models.find((m) => (m as any).supportsReferenceImage !== false)?.id
    || cfg.models[0]?.id
  if (!model) throw new Error('当前中转站没有支持图编辑的模型')
  const provider = aiStore.getImageProvider(providerId)
  if (!provider) throw new Error('图片 provider 初始化失败')

  // 1) 加载原图取真实像素
  const fullImg = await loadImage(sourceUrl)
  const { sx, sy, sw, sh } = mapRectToSource(
    rect,
    displayedImg.clientWidth,
    displayedImg.clientHeight,
    fullImg.naturalWidth,
    fullImg.naturalHeight,
  )
  const cropDataUrl = cropToDataUrl(fullImg, sx, sy, sw, sh)

  // 2) 调 API 重绘（裁片当参考图，用户的描述当 prompt）
  const result = await provider.generateImage({
    model,
    prompt,
    imageUrls: [cropDataUrl],
    aspectRatio: '1:1',
    n: 1,
  })
  const patchUrl = result.imageUrls[0]
  if (!patchUrl) throw new Error('未拿到重绘结果')

  // 3) 贴回原图
  return compositeBack(fullImg, patchUrl, sx, sy, sw, sh, 16)
}
