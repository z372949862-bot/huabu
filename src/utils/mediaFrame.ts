export interface MediaFrameSize {
  width: number
  height: number
}

/**
 * Scale a media frame by its long edge without changing its original aspect
 * ratio. Keeping the short edge unconstrained is intentional: a minimum
 * short edge would distort very wide or very tall assets.
 */
export function mediaFrameSize(width?: number, height?: number): MediaFrameSize | undefined {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) return undefined

  const scale = 420 / Math.max(width, height)
  return { width: width * scale, height: height * scale }
}
