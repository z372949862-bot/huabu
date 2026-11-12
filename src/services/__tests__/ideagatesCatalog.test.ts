import { describe, expect, it } from 'vitest'
import { getModelTemplatesByKind } from '../modelTemplates'

describe('IDEA Gates requested groups', () => {
  it.each([
    ['ideagates', 'doubao-seedance-2-5-260628'],
    ['ideagates-overseas', 'dreamina-seedance-2-5'],
  ] as const)('offers only the 720p Seedance 2.5 model for %s', (kind, id) => {
    const models = getModelTemplatesByKind(kind as any)
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({ id, capabilities: { resolutions: ['720p'], durationRange: { min: 4, max: 30 } } })
  })
})
