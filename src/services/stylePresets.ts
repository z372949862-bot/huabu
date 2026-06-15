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
  { id: 'cyberpunk', name: '赛博朋克', suffix: ', cyberpunk, neon glow, rain reflections, cinematic lighting', cover: '🌃', category: '科幻' },
  { id: 'space',     name: '深空宇宙', suffix: ', deep space, nebula, cosmic, holographic, ultra detailed',     cover: '🌌', category: '科幻' },
  { id: 'mecha',     name: '机甲',     suffix: ', mecha, hard surface, metallic sheen, dramatic lighting',     cover: '🤖', category: '科幻' },
  { id: 'hologram',  name: '全息',     suffix: ', holographic UI, scanlines, translucent layers, soft glow',  cover: '👁️', category: '科幻' },
  { id: 'manga',     name: '日漫',     suffix: ', anime style, manga, cel shaded, vibrant colors',             cover: '🎌', category: '漫画' },
  { id: 'comic',     name: '美漫',     suffix: ', western comic style, bold ink lines, halftone shading',      cover: '💥', category: '漫画' },
  { id: 'chibi',     name: 'Q 版',     suffix: ', chibi, cute big head, soft pastel, kawaii',                  cover: '🐰', category: '漫画' },
  { id: 'realistic', name: '写实',     suffix: ', photorealistic, 8k, sharp focus, natural lighting',          cover: '📷', category: '写实' },
  { id: 'cinematic', name: '电影感',   suffix: ', cinematic, 35mm film, shallow depth of field, color graded', cover: '🎬', category: '写实' },
  { id: 'oil',       name: '油画',     suffix: ', oil painting, thick brush strokes, classical',                cover: '🎨', category: '艺术' },
  { id: 'watercolor',name: '水彩',     suffix: ', watercolor, soft edges, paper texture',                       cover: '🖌️', category: '艺术' },
  { id: 'ink',       name: '水墨',     suffix: ', chinese ink painting, sumi-e, monochrome, flowing brush',     cover: '🖋️', category: '艺术' },
]

/**
 * 在 prompt 末尾追加预设的风格 suffix；先把原文末尾的标点和空白裁掉，避免出现 "猫，, cyberpunk"。
 */
export function applyPreset(prompt: string, preset: StylePreset): string {
  const trimmed = prompt.trim().replace(/[，,。.\s]+$/u, '')
  if (!trimmed) return preset.suffix.replace(/^,\s*/, '')
  return trimmed + preset.suffix
}
