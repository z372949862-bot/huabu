import { describe, it, expect } from 'vitest'
import { applyPreset, STYLE_PRESETS } from '../stylePresets'

describe('applyPreset', () => {
  it('appends suffix to a non-empty prompt', () => {
    const out = applyPreset('一只猫', STYLE_PRESETS[0])
    expect(out.startsWith('一只猫')).toBe(true)
    expect(out).toContain('cyberpunk')
  })

  it('strips trailing punctuation before appending', () => {
    const out = applyPreset('一只猫，', STYLE_PRESETS[0])
    expect(out).not.toMatch(/[，,]\s*,/)
    expect(out.startsWith('一只猫,')).toBe(true)
  })

  it('handles empty prompt by using suffix without leading comma', () => {
    const out = applyPreset('   ', STYLE_PRESETS[0])
    expect(out.startsWith(',')).toBe(false)
    expect(out).toContain('cyberpunk')
  })

  it('preset list has unique ids and non-empty fields', () => {
    const ids = new Set<string>()
    for (const p of STYLE_PRESETS) {
      expect(p.id).toBeTruthy()
      expect(p.name).toBeTruthy()
      expect(p.suffix.startsWith(',')).toBe(true)
      expect(ids.has(p.id)).toBe(false)
      ids.add(p.id)
    }
  })
})
