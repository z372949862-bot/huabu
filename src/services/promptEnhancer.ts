/**
 * Prompt LLM 改写服务。
 * 用项目里已配的文本中转站，把图片节点的 prompt 按选中风格改写。
 * 调用方负责把返回值写回节点。
 */

import { useAIStore } from '@/stores/ai'

export type EnhanceStyle = 'english' | 'scifi' | 'cinematic'

const SYSTEM_PROMPTS: Record<EnhanceStyle, string> = {
  english:
    'You rewrite Chinese image prompts into rich English prompts optimized for diffusion models. Output ONLY the rewritten English prompt, no explanation, no quoting, no preface. Keep camera, lighting, mood; add specifics for composition, subject, style.',
  scifi:
    '你是图像提示词改写助手。把用户的提示词改写成科幻 + 宇宙主题的中文提示词，强化深空、霓虹、全息、星云、机甲、赛博这类视觉元素，但保留用户原始意图中的主体与动作。只输出改写后的提示词，不要解释、不要引号、不要前后缀。',
  cinematic:
    'Rewrite the prompt with cinematic terminology: lens (35mm/50mm/85mm), aperture (f/1.4/f/2.8), lighting (key light, rim light, practicals), color grade (teal-orange, bleach bypass), and frame composition. Keep the subject. Output ONLY the new prompt, no explanation.',
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
