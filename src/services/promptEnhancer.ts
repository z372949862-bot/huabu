/**
 * Prompt LLM 改写服务。
 * 用项目里已配的文本中转站，把图片节点的 prompt 按选中风格改写。
 * 调用方负责把返回值写回节点。
 */

import { useAIStore } from '@/stores/ai'

export type EnhanceStyle =
  | 'english'
  | 'chinese'
  | 'concise'
  | 'detailed'
  | 'scifi'
  | 'cinematic'
  | 'photorealistic'
  | 'anime'
  | 'painterly'

export interface EnhanceOption {
  value: EnhanceStyle
  label: string
}

export const ENHANCE_OPTIONS: EnhanceOption[] = [
  { value: 'english',        label: '改成英文' },
  { value: 'chinese',        label: '改成中文' },
  { value: 'concise',        label: '精简到一句话' },
  { value: 'detailed',       label: '加更多细节' },
  { value: 'photorealistic', label: '写实摄影感' },
  { value: 'cinematic',      label: '电影镜头感' },
  { value: 'scifi',          label: '科幻 + 宇宙' },
  { value: 'anime',          label: '日漫 / 二次元' },
  { value: 'painterly',      label: '绘画感' },
]

const SYSTEM_PROMPTS: Record<EnhanceStyle, string> = {
  english:
    'You rewrite Chinese image prompts into rich English prompts optimized for diffusion models. Output ONLY the rewritten English prompt, no explanation, no quoting, no preface. Keep camera, lighting, mood; add specifics for composition, subject, style.',
  chinese:
    '你是图像提示词改写助手。把用户的英文 / 中英混杂提示词改写成自然、专业的中文图像描述。保留主体、构图、光线、氛围；本地化模型偏好的描述方式。只输出改写后的中文提示词，不要解释、不要引号、不要前后缀。',
  concise:
    '把用户的提示词精简到一句话以内，保留最关键的主体、动作、氛围词，去掉冗余形容。语言保持原文（中文出中文，英文出英文）。只输出改写结果。',
  detailed:
    '在保留用户原意的前提下，把提示词扩写得更丰富：补足主体细节（外观、动作、表情）、环境（光线、时间、地点）、构图（视角、景别、镜头）、氛围（色调、情绪）。语言保持原文。只输出改写后的提示词，不要解释。',
  scifi:
    '你是图像提示词改写助手。把用户的提示词改写成科幻 + 宇宙主题的中文提示词，强化深空、霓虹、全息、星云、机甲、赛博这类视觉元素，但保留用户原始意图中的主体与动作。只输出改写后的提示词，不要解释、不要引号、不要前后缀。',
  cinematic:
    'Rewrite the prompt with cinematic terminology: lens (35mm/50mm/85mm), aperture (f/1.4/f/2.8), lighting (key light, rim light, practicals), color grade (teal-orange, bleach bypass), and frame composition. Keep the subject. Output ONLY the new prompt, no explanation.',
  photorealistic:
    'Rewrite the prompt to push photorealistic output: add words like "photorealistic, 8k, sharp focus, natural lighting, fine skin texture, depth of field". Keep the subject and scene. Output ONLY the new prompt, no explanation.',
  anime:
    '把用户的提示词改写成日系动漫 / 二次元风格的图像提示词，加上 anime style / cel shaded / vibrant colors / clean line art 这类描述。保留主体与场景。只输出改写后的提示词，不要解释。',
  painterly:
    '把用户的提示词改写成绘画风格的图像提示词，可在 oil painting / gouache / watercolor / digital painting 中选最贴合主体的一种，强化笔触感、色彩调性、构图美感。语言保持原文。只输出改写后的提示词。',
}

export async function enhancePrompt(raw: string, style: EnhanceStyle = 'english'): Promise<string> {
  const text = raw.trim()
  if (!text) throw new Error('请先输入提示词')

  const aiStore = useAIStore()
  const providerId = aiStore.defaultTextProviderId
  if (!providerId) throw new Error('请先在「设置」中配置文本中转站')

  const provider = aiStore.getTextProvider(providerId)
  if (!provider) throw new Error('文本 provider 初始化失败')

  const cfg = aiStore.getProviderConfig(providerId)
  const model = cfg?.models?.[0]?.id
  if (!model) throw new Error('当前文本中转站没有可用模型')

  const result = await provider.chat({
    model,
    prompt: text,
    systemPrompt: SYSTEM_PROMPTS[style],
    temperature: 0.7,
  })

  const out = (result.text || '').trim()
  if (!out) throw new Error('改写返回为空，请重试')
  // 偶尔模型会带引号，去掉首尾对称引号
  return stripWrappingQuotes(out)
}

function stripWrappingQuotes(s: string): string {
  const m = s.match(/^([\"'“”‘’「」])([\s\S]*)\1$/)
  return m ? m[2] : s
}
