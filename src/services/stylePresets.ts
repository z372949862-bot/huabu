/**
 * 图片节点的风格预设库。
 * 选中预设后把 suffix 拼到当前 prompt 末尾，点选不替换原文。
 */

export interface StylePreset {
  id: string
  name: string
  /** 拼到 prompt 末尾的修饰词（含前置逗号） */
  suffix: string
  /** 缩略图 emoji */
  cover: string
  category: '科幻' | '漫画' | '写实' | '艺术'
}

export const STYLE_PRESETS: StylePreset[] = [
  // ─── 科幻 ───
  { id: 'cyberpunk',   name: '赛博朋克', suffix: ', cyberpunk, neon glow, rain reflections, cinematic lighting',           cover: '🌃', category: '科幻' },
  { id: 'space',       name: '深空宇宙', suffix: ', deep space, nebula, cosmic, holographic, ultra detailed',               cover: '🌌', category: '科幻' },
  { id: 'mecha',       name: '机甲',     suffix: ', mecha, hard surface, metallic sheen, dramatic lighting',                cover: '🤖', category: '科幻' },
  { id: 'hologram',    name: '全息',     suffix: ', holographic UI, scanlines, translucent layers, soft glow',              cover: '👁️', category: '科幻' },
  { id: 'biotech',     name: '生物科技', suffix: ', biotech, bioluminescent, organic circuits, glowing veins',              cover: '🧬', category: '科幻' },
  { id: 'wasteland',   name: '废土',     suffix: ', post-apocalyptic wasteland, dust, rust, broken machinery, desaturated', cover: '☠️', category: '科幻' },
  { id: 'retrofuture', name: '复古未来', suffix: ', retro-futurism, 70s sci-fi, analog screens, warm tones',                cover: '📻', category: '科幻' },
  { id: 'darksoul',    name: '暗黑奇幻', suffix: ', dark fantasy, gothic, occult symbols, ominous atmosphere',              cover: '🗡️', category: '科幻' },

  // ─── 漫画 ───
  { id: 'manga',       name: '日漫',     suffix: ', anime style, manga, cel shaded, vibrant colors',                       cover: '🎌', category: '漫画' },
  { id: 'comic',       name: '美漫',     suffix: ', western comic style, bold ink lines, halftone shading',                cover: '💥', category: '漫画' },
  { id: 'chibi',       name: 'Q 版',     suffix: ', chibi, cute big head, soft pastel, kawaii',                            cover: '🐰', category: '漫画' },
  { id: 'shonen',      name: '热血少年', suffix: ', shonen anime, dynamic action lines, intense expressions, sparks',      cover: '⚡', category: '漫画' },
  { id: 'shoujo',      name: '少女漫画', suffix: ', shoujo manga, sparkles, soft blush, romantic pastels, large eyes',    cover: '🌸', category: '漫画' },
  { id: 'ghibli',      name: '吉卜力',   suffix: ', studio ghibli style, soft watercolor, lush nature, warm light',        cover: '🍃', category: '漫画' },
  { id: 'pixar',       name: '皮克斯',   suffix: ', pixar 3d style, expressive characters, polished lighting',             cover: '🎈', category: '漫画' },
  { id: 'pixelart',    name: '像素',     suffix: ', pixel art, 16-bit, limited palette, dithering',                        cover: '👾', category: '漫画' },

  // ─── 写实 ───
  { id: 'realistic',   name: '写实',     suffix: ', photorealistic, 8k, sharp focus, natural lighting',                    cover: '📷', category: '写实' },
  { id: 'cinematic',   name: '电影感',   suffix: ', cinematic, 35mm film, shallow depth of field, color graded',           cover: '🎬', category: '写实' },
  { id: 'portrait',    name: '人像',     suffix: ', portrait photography, 85mm lens, f/1.4, soft natural light, bokeh',    cover: '🧑', category: '写实' },
  { id: 'landscape',   name: '风光',     suffix: ', landscape photography, golden hour, wide angle, dramatic sky',          cover: '🏞️', category: '写实' },
  { id: 'street',      name: '街拍',     suffix: ', street photography, candid, urban, 35mm, grainy film',                  cover: '🚶', category: '写实' },
  { id: 'macro',       name: '微距',     suffix: ', macro photography, extreme close-up, shallow DOF, fine detail',         cover: '🔍', category: '写实' },
  { id: 'noir',        name: '黑白',     suffix: ', black and white, high contrast, film noir, deep shadows',               cover: '⚫', category: '写实' },
  { id: 'studio',      name: '商业棚拍', suffix: ', studio lighting, clean backdrop, product photography, crisp',           cover: '💡', category: '写实' },

  // ─── 艺术 ───
  { id: 'oil',         name: '油画',     suffix: ', oil painting, thick brush strokes, classical',                          cover: '🎨', category: '艺术' },
  { id: 'watercolor',  name: '水彩',     suffix: ', watercolor, soft edges, paper texture',                                 cover: '🖌️', category: '艺术' },
  { id: 'ink',         name: '水墨',     suffix: ', chinese ink painting, sumi-e, monochrome, flowing brush',               cover: '🖋️', category: '艺术' },
  { id: 'gouache',     name: '厚涂',     suffix: ', gouache painting, opaque pigments, painterly textures',                 cover: '🖼️', category: '艺术' },
  { id: 'sketch',      name: '素描',     suffix: ', pencil sketch, graphite, hatching, monochrome',                          cover: '✏️', category: '艺术' },
  { id: 'lineart',     name: '线稿',     suffix: ', clean line art, black ink, no shading, flat',                            cover: '➰', category: '艺术' },
  { id: 'lowpoly',     name: '低多边形', suffix: ', low poly, geometric facets, flat shading, vibrant',                     cover: '🔺', category: '艺术' },
  { id: 'papercut',    name: '剪纸',     suffix: ', paper cut craft, layered paper, soft shadows, folk style',              cover: '✂️', category: '艺术' },
]

/**
 * 在 prompt 末尾追加预设的风格 suffix；先把原文末尾的标点和空白裁掉，避免出现 "猫，, cyberpunk"。
 */
export function applyPreset(prompt: string, preset: StylePreset): string {
  const trimmed = prompt.trim().replace(/[，,。.\s]+$/u, '')
  if (!trimmed) return preset.suffix.replace(/^,\s*/, '')
  return trimmed + preset.suffix
}
