import { describe, expect, it } from 'vitest'
import { countPromptCharacters, formatStructuredPrompt } from '../promptFormatting'

describe('formatStructuredPrompt', () => {
  it('puts known prompt sections on separate lines', () => {
    const input = '角色：阿宿。场景与位置关系：营地。画风与人物质感：3D动画。光影效果：日光。拍摄与剪辑：紧凑。'
    expect(formatStructuredPrompt(input)).toBe(
      '角色：阿宿。\n场景与位置关系：营地。\n画风与人物质感：3D动画。\n光影效果：日光。\n拍摄与剪辑：紧凑。'
    )
  })

  it('starts each numbered shot on a new paragraph', () => {
    const input = '拍摄与剪辑：紧凑 1.镜头 近景 2、镜头 全景 第3镜头 特写 镜头4 收尾'
    expect(formatStructuredPrompt(input)).toBe(
      '拍摄与剪辑：紧凑\n\n1.镜头 近景\n\n2、镜头 全景\n\n第3镜头 特写\n\n镜头4 收尾'
    )
  })

  it('forces compact section headings and shot content fields onto new lines', () => {
    const input = '角色：阿宿场景与位置关系：营地1.镜头 近景内容：阿宿抬头光影：暖色侧光2.镜头 全景内容：迁迁走来光影效果：日光'
    expect(formatStructuredPrompt(input)).toBe(
      '角色：阿宿\n场景与位置关系：营地\n\n1.镜头 近景\n内容：阿宿抬头\n光影：暖色侧光\n\n2.镜头 全景\n内容：迁迁走来\n光影效果：日光'
    )
  })

  it('does not split standalone scene or position labels', () => {
    const input = '角色：@[阿宿](asset-1)；场景：营地；位置关系：阿宿在左。场景与位置关系：营地全貌'
    expect(formatStructuredPrompt(input)).toBe(
      '角色：@[阿宿](asset-1)；场景：营地；位置关系：阿宿在左。\n场景与位置关系：营地全貌'
    )
  })

  it('does not split ordinary phrases and is idempotent', () => {
    const input = '主要角色：阿宿\n\n1.镜头 近景'
    const formatted = formatStructuredPrompt(input)
    expect(formatted).toBe(input)
    expect(formatStructuredPrompt(formatted)).toBe(formatted)
  })
})

describe('countPromptCharacters', () => {
  it('excludes whitespace and counts asset references by their visible name', () => {
    expect(countPromptCharacters('角色： @[阿宿](asset-123)\n动作：挥手')).toBe(10)
  })
})
