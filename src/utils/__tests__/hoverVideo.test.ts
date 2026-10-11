import { createApp, h, withDirectives, ref, nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { hoverVideo, stopHoverVideo } from '../hoverVideo'

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })
it('retries blocked audible playback on user input and stops when its panel hides', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new DOMException('User activation required', 'NotAllowedError'))
    .mockResolvedValue(undefined)
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const enabled = ref(true)
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => withDirectives(h('div', [h('video')]), [[hoverVideo, enabled.value]]) })
  app.mount(root)
  const preview = root.firstElementChild as HTMLElement
  preview.dispatchEvent(new MouseEvent('mouseenter'))
  await Promise.resolve()
  await Promise.resolve()
  expect(preview.querySelector('video')!.muted).toBe(false)
  preview.dispatchEvent(new Event('pointerdown'))
  await Promise.resolve()
  expect(play).toHaveBeenCalledTimes(2)
  expect(preview.classList.contains('video-preview-playing')).toBe(true)
  enabled.value = false
  await nextTick()
  expect(pause).toHaveBeenCalled()
  expect(preview.classList.contains('video-preview-playing')).toBe(false)
  preview.dispatchEvent(new MouseEvent('mouseenter'))
  expect(play).toHaveBeenCalledTimes(2)
  enabled.value = true
  await nextTick()
  preview.dispatchEvent(new MouseEvent('mouseenter'))
  await Promise.resolve()
  stopHoverVideo()
  expect(preview.classList.contains('video-preview-playing')).toBe(false)
  app.unmount()
})
it('plays an audible looping preview, pauses even when play resolves after mouseleave, and cleans up', async () => {
  let resolvePlay!: () => void
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => new Promise<void>(resolve => { resolvePlay = resolve }))
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => withDirectives(h('div', [h('video')]), [[hoverVideo]]) })
  app.mount(root)
  const preview = root.firstElementChild as HTMLElement
  const video = preview.querySelector('video')!
  video.muted = true
  preview.dispatchEvent(new MouseEvent('mouseenter'))
  expect(play).toHaveBeenCalledTimes(1)
  expect(video.muted).toBe(false)
  expect(video.loop && video.playsInline).toBe(true)
  preview.dispatchEvent(new MouseEvent('mouseleave'))
  resolvePlay()
  await Promise.resolve()
  expect(pause).toHaveBeenCalledTimes(2)
  expect(preview.classList.contains('video-preview-playing')).toBe(false)
  app.unmount()
  const count = pause.mock.calls.length
  preview.dispatchEvent(new MouseEvent('mouseenter'))
  window.dispatchEvent(new Event('blur'))
  expect(play).toHaveBeenCalledTimes(1)
  expect(pause).toHaveBeenCalledTimes(count)
})

it('stops the previous hover preview before a second audible preview starts', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    render: () => h('div', [
      withDirectives(h('div', [h('video')]), [[hoverVideo]]),
      withDirectives(h('div', [h('video')]), [[hoverVideo]]),
    ]),
  })
  app.mount(root)
  const [first, second] = Array.from(root.firstElementChild!.children) as HTMLElement[]
  const firstVideo = first.querySelector('video')!
  const secondVideo = second.querySelector('video')!

  first.dispatchEvent(new MouseEvent('mouseenter'))
  await Promise.resolve()
  second.dispatchEvent(new MouseEvent('mouseenter'))
  await Promise.resolve()

  expect(play).toHaveBeenCalledTimes(2)
  expect(pause).toHaveBeenCalled()
  expect(firstVideo.muted).toBe(false)
  expect(secondVideo.muted).toBe(false)
  expect(first.classList.contains('video-preview-playing')).toBe(false)
  expect(second.classList.contains('video-preview-playing')).toBe(true)
  app.unmount()
})
