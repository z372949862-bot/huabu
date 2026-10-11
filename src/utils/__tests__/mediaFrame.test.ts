import { describe, expect, it } from 'vitest'
import { mediaFrameSize } from '../mediaFrame'

describe('mediaFrameSize', () => {
  it('keeps a landscape video frame at its original ratio', () => {
    expect(mediaFrameSize(1920, 1080)).toEqual({ width: 420, height: 236.25 })
  })

  it('keeps portrait, square, and extreme material ratios without a short-edge clamp', () => {
    expect(mediaFrameSize(1080, 1920)).toEqual({ width: 236.25, height: 420 })
    expect(mediaFrameSize(1000, 1000)).toEqual({ width: 420, height: 420 })

    const extreme = mediaFrameSize(4000, 100)!
    expect(extreme.width / extreme.height).toBeCloseTo(40)
    expect(extreme).toEqual({ width: 420, height: 10.5 })
  })

  it('falls back when the browser cannot provide usable media metadata', () => {
    expect(mediaFrameSize()).toBeUndefined()
    expect(mediaFrameSize(0, 1080)).toBeUndefined()
    expect(mediaFrameSize(Number.NaN, 1080)).toBeUndefined()
  })
})
