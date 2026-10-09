import { describe, expect, it } from 'vitest'
import { magneticHandleOffset } from '../canvasConnection'
import { canConnectNodes, connectionDropNode, connectionFrameOffset, connectionFrameTilt, connectionInteriorPoint, normalizeCanvasEdges, trackConnectionPointer } from '../canvasConnection'

describe('canvas connection receiving surface', () => {
  it('rejects video-to-image connections while preserving image-to-video connections', () => {
    const nodes = [
      { id: 'image', type: 'ai-image' },
      { id: 'video', type: 'ai-video' },
      { id: 'image-asset', type: 'asset-ref', data: { assetType: 'image' } },
      { id: 'video-asset', type: 'asset-ref', data: { assetType: 'video' } },
    ]
    for (const source of ['video', 'video-asset']) {
      for (const target of ['image', 'image-asset']) {
        expect(canConnectNodes(source, target, nodes, [])).toBe(false)
        expect(canConnectNodes(target, source, nodes, [])).toBe(true)
      }
    }
  })
  it('attracts toward the pointer inside the radius and releases at its boundary', () => {
    expect(magneticHandleOffset(24, 0)).toEqual({ x: 5.4, y: 0 })
    expect(magneticHandleOffset(0, -24)).toEqual({ x: 0, y: -5.4 })
    expect(magneticHandleOffset(48, 0)).toBeNull()
    expect(magneticHandleOffset(40, 40)).toBeNull()
  })
  it('keeps edge and corner endpoints inside the displaced face at different zooms', () => {
    for (const zoom of [0.1, 0.5, 1, 4]) {
      const rect = { left: 120, top: 80, width: 420 * zoom, height: 236 * zoom }
      for (const x of [rect.left, rect.left + rect.width]) {
        for (const y of [rect.top, rect.top + rect.height]) {
          const offset = connectionFrameOffset(x, y, rect, zoom)
          const point = connectionInteriorPoint({ x, y }, rect, offset, zoom)
          expect(point.x).toBeGreaterThan(rect.left + offset.x * zoom)
          expect(point.x).toBeLessThan(rect.left + rect.width + offset.x * zoom)
          expect(point.y).toBeGreaterThan(rect.top + offset.y * zoom)
          expect(point.y).toBeLessThan(rect.top + rect.height + offset.y * zoom)
        }
      }
    }
  })
  it('leaves an interior pointer in place and increases tilt toward the edge', () => {
    const rect = { left: 0, top: 0, width: 400, height: 200 }
    const center = { x: 200, y: 100 }
    expect(connectionInteriorPoint(center, rect, { x: 0, y: 0 }, 1)).toEqual(center)
    const middle = connectionFrameTilt(center, rect)
    expect(Math.abs(middle.x) + Math.abs(middle.y)).toBe(0)
    expect(connectionFrameTilt({ x: 300, y: 150 }, rect)).toEqual({ x: 0.5, y: -0.5 })
    expect(connectionFrameTilt({ x: 400, y: 200 }, rect)).toEqual({ x: 4, y: -4 })
    expect(connectionFrameTilt({ x: -10, y: -10 }, rect)).toEqual({ x: -4, y: 4 })
  })
  it('updates receiving state even when a drag handler stops bubbling, and cleans up', () => {
    const surface = document.createElement('div')
    surface.innerHTML = '<div class="vue-flow__node" data-id="video"><div class="node-main"></div></div>'
    document.body.append(surface)
    const stopBubbling = (event: Event) => event.stopPropagation()
    surface.addEventListener('mousemove', stopBubbling)
    let receiving: string | null = null
    const stopTracking = trackConnectionPointer(event => {
      receiving = connectionDropNode(event.target as Element)
    })
    try {
      surface.querySelector('.node-main')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      expect(receiving).toBe('video')
      surface.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      expect(receiving).toBeNull()
      stopTracking()
      surface.querySelector('.node-main')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      expect(receiving).toBeNull()
    } finally {
      stopTracking()
      surface.remove()
    }
  })
  const fixture = () => {
    const root = document.createElement('div')
    root.innerHTML = `<div class="vue-flow__node" data-id="video">
      <div class="node-main"><div class="node-content"><img /></div></div>
      <div class="generator-card"><textarea></textarea></div>
      <div class="vue-flow__handle target"></div>
      <div class="vue-flow__handle source"></div>
    </div>`
    return root
  }
  it('accepts the full media surface including nested previews', () => {
    const root = fixture()
    for (const selector of ['.node-main', '.node-content', 'img', '.target']) {
      expect(connectionDropNode(root.querySelector(selector))).toBe('video')
    }
  })
  it('excludes editor panels, container gaps, output handles and empty space', () => {
    const root = fixture()
    for (const selector of ['textarea', '.generator-card', '.vue-flow__node', '.source']) {
      expect(connectionDropNode(root.querySelector(selector))).toBeNull()
    }
    expect(connectionDropNode(null)).toBeNull()
  })
  it('rejects self connections, missing nodes and duplicate references', () => {
    const nodes = [{ id: 'image' }, { id: 'video' }]
    expect(canConnectNodes('image', 'video', nodes, [])).toBe(true)
    expect(canConnectNodes('image', 'image', nodes, [])).toBe(false)
    expect(canConnectNodes('image', 'deleted', nodes, [])).toBe(false)
    expect(canConnectNodes('image', 'video', nodes, [{ source: 'image', target: 'video' }])).toBe(false)
  })
  it('normalizes persisted edges and removes malformed or orphaned entries', () => {
    expect(normalizeCanvasEdges([
      { id: 'ok', source: 'image', target: 'video' },
      { id: 'bad', source: '', target: 'video' },
      { id: 'orphan', source: 'image', target: 'gone' },
    ], [{ id: 'image' }, { id: 'video' }])).toEqual([
      { id: 'ok', source: 'image', target: 'video' },
    ])
  })
  it('keeps the receiving nudge bounded and zoom-aware', () => {
    expect(connectionFrameOffset(100, 75, { left: 0, top: 0, width: 100, height: 100 }, 1)).toEqual({ x: 4, y: 2 })
    expect(connectionFrameOffset(50, 50, { left: 0, top: 0, width: 100, height: 100 }, 0.5)).toEqual({ x: 0, y: 0 })
    expect(connectionFrameOffset(-100, -100, { left: 0, top: 0, width: 100, height: 100 }, 0.5)).toEqual({ x: -16, y: -16 })
    expect(connectionFrameOffset(1000, 1000, { left: 0, top: 0, width: 100, height: 100 }, 2)).toEqual({ x: 4, y: 4 })
  })
})
