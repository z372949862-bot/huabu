import { describe, it, expect } from 'vitest'
import { mapRectToSource } from '../inpaintingService'

describe('mapRectToSource', () => {
  it('scales display coords to source pixels (no padding)', () => {
    const out = mapRectToSource({ x: 50, y: 50, w: 100, h: 100 }, 200, 200, 1000, 1000, 0)
    expect(out).toEqual({ sx: 250, sy: 250, sw: 500, sh: 500 })
  })

  it('clamps to source bounds', () => {
    const out = mapRectToSource({ x: 180, y: 180, w: 50, h: 50 }, 200, 200, 1000, 1000, 0)
    expect(out.sx + out.sw).toBeLessThanOrEqual(1000)
    expect(out.sy + out.sh).toBeLessThanOrEqual(1000)
  })

  it('expands selection by padding ratio', () => {
    const noPad = mapRectToSource({ x: 50, y: 50, w: 100, h: 100 }, 200, 200, 1000, 1000, 0)
    const padded = mapRectToSource({ x: 50, y: 50, w: 100, h: 100 }, 200, 200, 1000, 1000, 0.1)
    expect(padded.sw).toBeGreaterThan(noPad.sw)
    expect(padded.sh).toBeGreaterThan(noPad.sh)
  })

  it('handles different display vs source aspect (does not crash, scales each axis independently)', () => {
    const out = mapRectToSource({ x: 0, y: 0, w: 100, h: 100 }, 200, 100, 2000, 1000, 0)
    expect(out.sx).toBe(0)
    expect(out.sy).toBe(0)
    expect(out.sw).toBe(1000)
    expect(out.sh).toBe(1000)
  })

  it('falls back to full source when display dimensions are 0', () => {
    const out = mapRectToSource({ x: 0, y: 0, w: 0, h: 0 }, 0, 0, 800, 600, 0)
    expect(out).toEqual({ sx: 0, sy: 0, sw: 800, sh: 600 })
  })
})
