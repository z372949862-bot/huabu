import type { InjectionKey, Ref } from 'vue'

// Temporary connection feedback is deliberately kept out of project data.
export const receivingNodeKey: InjectionKey<Ref<string | null>> = Symbol('receiving-node')
export const receivingOffsetKey: InjectionKey<Ref<{ x: number; y: number }>> = Symbol('receiving-offset')
export const connectionPointerKey: InjectionKey<Ref<{ x: number; y: number } | null>> = Symbol('connection-pointer')
export const imageConnectionKey: InjectionKey<Ref<boolean>> = Symbol('image-connection')
export const videoConnectionKey: InjectionKey<Ref<boolean>> = Symbol('video-connection')
export function isImageNode(node: { type?: string; data?: { assetType?: string } } | null | undefined) {
  return node?.type === 'ai-image' || (node?.type === 'asset-ref' && node.data?.assetType === 'image')
}
export function isVideoNode(node: { type?: string; data?: { assetType?: string } } | null | undefined) {
  return node?.type === 'ai-video' || (node?.type === 'asset-ref' && node.data?.assetType === 'video')
}
export function compatibleConnection(source: { type?: string; data?: { assetType?: string } }, target: { type?: string; data?: { assetType?: string } }) {
  return !(isVideoNode(source) && isImageNode(target))
}
export interface HandleMagnet { nodeId: string; side: 'source' | 'target'; x: number; y: number }
export const handleMagnetKey: InjectionKey<Ref<HandleMagnet | null>> = Symbol('handle-magnet')

// Screen-pixel radius/displacement stay consistent at every canvas zoom.
export function magneticHandleOffset(dx: number, dy: number) {
  const distance = Math.hypot(dx, dy)
  if (distance >= 48) return null
  const strength = 0.45 * (1 - distance / 48)
  return { x: dx * strength, y: dy * strength }
}
export interface ConnectionSurface { left: number; top: number; width: number; height: number }
export const receivingSurfaceKey: InjectionKey<Ref<ConnectionSurface | null>> = Symbol('receiving-surface')

// Keep the endpoint behind the moving face, even at its rounded corners.
// Inputs and result are screen coordinates; offset is in flow units.
export function connectionInteriorPoint(pointer: { x: number; y: number }, rect: ConnectionSurface, offset: { x: number; y: number }, zoom: number) {
  const inset = Math.min(24, rect.width / 3, rect.height / 3)
  const left = rect.left + offset.x * zoom
  const top = rect.top + offset.y * zoom
  return {
    x: Math.max(left + inset, Math.min(left + rect.width - inset, pointer.x)),
    y: Math.max(top + inset, Math.min(top + rect.height - inset, pointer.y)),
  }
}

export function connectionFrameTilt(pointer: { x: number; y: number }, rect: ConnectionSurface) {
  const strength = (value: number) => {
    const normalized = Math.max(-1, Math.min(1, value))
    return 4 * normalized ** 3
  }
  return {
    x: strength((pointer.y - rect.top - rect.height / 2) / Math.max(1, rect.height / 2)),
    y: -strength((pointer.x - rect.left - rect.width / 2) / Math.max(1, rect.width / 2)),
  }
}

// Local tuning values, not measured Dreamina parameters. Return world units
// so the visual displacement stays within eight screen pixels at any zoom.
export function connectionFrameOffset(x: number, y: number, rect: { left: number; top: number; width: number; height: number }, zoom: number) {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const offset = (delta: number) => Math.max(-8, Math.min(8, delta * 0.08)) / scale
  return { x: offset(x - rect.left - rect.width / 2), y: offset(y - rect.top - rect.height / 2) }
}

// Drag handlers can stop mousemove propagation at document level. Observe the
// capture phase so node feedback is updated before those handlers run.
export function trackConnectionPointer(update: (event: MouseEvent) => void): () => void {
  window.addEventListener('pointermove', update, true)
  window.addEventListener('mousemove', update, true)
  return () => {
    window.removeEventListener('pointermove', update, true)
    window.removeEventListener('mousemove', update, true)
  }
}

export function connectionDropNode(element: Element | null): string | null {
  if (!element) return null
  const handle = element.closest('.vue-flow__handle')
  if (handle) {
    return handle.classList.contains('target')
      ? handle.closest('.vue-flow__node')?.getAttribute('data-id') || null
      : null
  }
  // The node's parameter/editor cards are not part of its connection surface.
  if (!element.closest('.node-surface, .node-main')) return null
  return element.closest('.vue-flow__node')?.getAttribute('data-id') || null
}

export function canConnectNodes(
  source: string,
  target: string,
  nodes: readonly { id: string; type?: string; data?: { assetType?: string } }[],
  edges: readonly { source: string; target: string }[],
): boolean {
  return source !== target && nodes.some(n => n.id === source) &&
    nodes.some(n => n.id === target) &&
    compatibleConnection(nodes.find(n => n.id === source)!, nodes.find(n => n.id === target)!) &&
    !edges.some(edge => edge.source === source && edge.target === target)
}

export function normalizeCanvasEdges(
  edges: readonly any[],
  nodes: readonly { id: string }[],
): any[] {
  const ids = new Set(nodes.map(node => node.id))
  return edges
    .filter(edge => edge && typeof edge.source === 'string' && typeof edge.target === 'string')
    .filter(edge => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target)
    .map(edge => ({ ...edge, source: String(edge.source), target: String(edge.target) }))
}
