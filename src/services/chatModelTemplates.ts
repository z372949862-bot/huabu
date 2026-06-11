import type { VideoModelCapabilities } from './videoModelService'

export type TextProviderKind = 'openaichat' | 'deepseek'

export interface ChatModelTemplate {
  id: string
  name: string
  description?: string
  capabilities: VideoModelCapabilities
  maxTokens?: number
  supportsReasoning?: boolean
}

export const OPENAI_CHAT_MODEL_TEMPLATES: ChatModelTemplate[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: '快速文本生成（推荐）',
    capabilities: { ratios: [], resolutions: [] },
    maxTokens: 8192,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: '高质量长文本生成',
    capabilities: { ratios: [], resolutions: [] },
    maxTokens: 16384,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI 旗舰模型',
    capabilities: { ratios: [], resolutions: [] },
    maxTokens: 16384,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: '轻量快速模型',
    capabilities: { ratios: [], resolutions: [] },
    maxTokens: 4096,
  },
]

export const DEEPSEEK_CHAT_MODEL_TEMPLATES: ChatModelTemplate[] = [
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    description: 'DeepSeek 顶级模型',
    capabilities: { ratios: [], resolutions: [] },
    maxTokens: 8192,
    supportsReasoning: true,
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: 'DeepSeek 快速轻量模型',
    capabilities: { ratios: [], resolutions: [] },
    maxTokens: 4096,
    supportsReasoning: true,
  },
]

const TEMPLATES_BY_KIND: Record<TextProviderKind, ChatModelTemplate[]> = {
  openaichat: OPENAI_CHAT_MODEL_TEMPLATES,
  deepseek: DEEPSEEK_CHAT_MODEL_TEMPLATES,
}

export const CHAT_MODEL_TEMPLATES: ChatModelTemplate[] = [
  ...OPENAI_CHAT_MODEL_TEMPLATES,
  ...DEEPSEEK_CHAT_MODEL_TEMPLATES,
]

export function getChatTemplatesByKind(kind: TextProviderKind): ChatModelTemplate[] {
  return TEMPLATES_BY_KIND[kind] || []
}

export function findChatTemplate(id: string, kind?: TextProviderKind): ChatModelTemplate | undefined {
  if (kind) return TEMPLATES_BY_KIND[kind]?.find((t) => t.id === id)
  return CHAT_MODEL_TEMPLATES.find((t) => t.id === id)
}

/** DeepSeek 端点没用 /v1 前缀 */
export function chatEndpoint(kind: TextProviderKind): string {
  return kind === 'deepseek' ? '/chat/completions' : '/v1/chat/completions'
}
