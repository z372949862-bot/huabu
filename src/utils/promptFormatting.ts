// 除“角色”外，这些标签即使紧跟在上一段内容后面也强制换行。
// 这样可处理模型返回的“……角色描述场景与位置关系：……”这类完全没有分隔符的文本。
const INLINE_SECTION_LABELS = [
  '场景与位置关系',
  '画风与人物质感',
  '拍摄与剪辑',
  '镜头内容',
  '画面内容',
  '光影效果',
  '光影',
  '内容',
] as const

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const inlineSectionPattern = INLINE_SECTION_LABELS.map(escapeRegExp).join('|')
const inlineSectionHeading = new RegExp(`(^|[^\\n])(${inlineSectionPattern}[ \\t]*[：:])`, 'gu')
// “主要角色：”属于普通短语，不应拆成“主要 / 角色：”，所以角色标题仍要求自然边界。
const roleHeading = /(^|[\s，,。；;|｜])(角色[ \t]*[：:])/gu
const shotNumber = '[0-9０-９一二三四五六七八九十百]+'
const shotMarker = `(?:第[ \\t]*${shotNumber}[ \\t]*镜头|${shotNumber}[ \\t]*(?:[.．、)）:：-][ \\t]*)?镜头|镜头[ \\t]*(?:第[ \\t]*)?${shotNumber})`
const numberedShotHeading = new RegExp(`(^|[^\\n])(${shotMarker})(?=[ \\t:：|｜]|$)`, 'gu')

function breakBefore(prefix: string, blankLine = false): string {
  if (!prefix) return ''
  if (prefix.includes('\n')) return blankLine ? '\n\n' : '\n'
  if (/^[ \\t]+$/.test(prefix)) return blankLine ? '\n\n' : '\n'
  return `${prefix}${blankLine ? '\n\n' : '\n'}`
}

/**
 * Formats long Chinese storyboard prompts without changing their wording.
 * Known section headings start on their own line and numbered shots start a
 * new paragraph. Calling the formatter repeatedly is safe.
 */
export function formatStructuredPrompt(input: string): string {
  if (!input) return ''

  let text = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')

  text = text.replace(inlineSectionHeading, (_match, prefix: string, heading: string) =>
    `${breakBefore(prefix)}${heading}`
  )
  text = text.replace(roleHeading, (_match, prefix: string, heading: string) =>
    `${breakBefore(prefix)}${heading}`
  )
  text = text.replace(numberedShotHeading, (_match, prefix: string, heading: string) =>
    `${breakBefore(prefix, true)}${heading}`
  )

  return text
    .replace(/[ \\t]*\n[ \\t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Counts visible prompt characters, excluding whitespace and hidden asset IDs. */
export function countPromptCharacters(input: string): number {
  const visibleText = input.replace(/@\[([^\]]+)\]\([^)]+\)/g, '$1')
  return Array.from(visibleText.replace(/\s/gu, '')).length
}
