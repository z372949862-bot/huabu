import type { ObjectDirective } from 'vue'

// Bind to the preview container so overlays do not interrupt hover playback.
const cleanups = new WeakMap<HTMLElement, () => void>()
const controllers = new WeakMap<HTMLElement, { setEnabled: (enabled: boolean) => void }>()
let stopActivePreview: (() => void) | undefined

export const stopHoverVideo = () => stopActivePreview?.()

export const hoverVideo: ObjectDirective<HTMLElement> = {
  mounted(el, binding) {
    let enabled = binding.value !== false
    let blocked = false
    let active = false
    let current: HTMLVideoElement | null = null
    let attempt = 0
    const stop = () => {
      active = false
      blocked = false
      attempt += 1
      current?.pause()
      current = null
      if (stopActivePreview === stop) stopActivePreview = undefined
      el.classList.remove('video-preview-playing')
    }
    const start = (force = false) => {
      if (!enabled) return
      const video = el instanceof HTMLVideoElement ? el : el.querySelector('video')
      if (!video) return
      if (active && current === video && !force) return
      if (stopActivePreview && stopActivePreview !== stop) stopActivePreview()
      active = true
      current = video
      const mutedPreview = el.getAttribute('data-hover-muted') === 'true'
        || video.getAttribute('data-hover-muted') === 'true'
      if (mutedPreview) {
        video.muted = true
        video.defaultMuted = true
        video.setAttribute('muted', '')
      } else {
        // Preserve source audio outside parameter-card previews. A browser may
        // reject audible autoplay on a pure hover event; pointerdown retries it.
        video.muted = false
        video.defaultMuted = false
        video.removeAttribute('muted')
      }
      video.loop = true
      video.playsInline = true
      stopActivePreview = stop
      const thisAttempt = ++attempt
      void video.play().then(() => {
        if (!active || !el.isConnected || current !== video) video.pause()
        else if (stopActivePreview === stop) el.classList.add('video-preview-playing')
      }).catch(() => {
        if (attempt === thisAttempt && stopActivePreview === stop) {
          blocked = true
          el.classList.remove('video-preview-playing')
        }
      })
    }
    const visibility = () => { if (document.hidden) stop() }
    const onMouseEnter = () => start()
    const onPointerDown = () => { if (blocked) start(true) }
    controllers.set(el, { setEnabled(value) { enabled = value; if (!value) stop() } })
    el.addEventListener('mouseenter', onMouseEnter)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('mouseleave', stop)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', visibility)
    cleanups.set(el, () => {
      stop()
      el.removeEventListener('mouseenter', onMouseEnter)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('mouseleave', stop)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', visibility)
    })
  },
  updated(el, binding) { controllers.get(el)?.setEnabled(binding.value !== false) },
  beforeUnmount(el) { cleanups.get(el)?.(); cleanups.delete(el); controllers.delete(el) },
}
