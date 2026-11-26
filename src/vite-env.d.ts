declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare const __APP_VERSION__: string

interface Window {
  electronAPI?: {
    platform: string
    license?: {
      status: () => Promise<any>
      activate: (code: string) => Promise<any>
      refresh: () => Promise<any>
      openUpdate: () => Promise<void>
      onChanged: (callback: (state: any) => void) => () => void
    }
    suanliai?: {
      request: (payload: any) => Promise<any>
      uploadImage: (payload: any) => Promise<any>
      upload: (payload: any) => Promise<any>
      download: (payload: any) => Promise<any>
    }
    flyapi?: {
      checkDepthSource: (payload: { source: string }) => Promise<{ ok: boolean; error?: string }>
      downloadDepth: (payload: { taskId: string; url: string }) => Promise<{ ok: boolean; data?: { path: string }; error?: string }>
      request: (payload: { apiKey: string; path: string; body?: unknown; catalog?: 'seedance' | 'magi2' }) => Promise<{ ok: boolean; data?: any; error?: string; retryable?: boolean; status?: number }>
      upload: (payload: { dataUrl: string }) => Promise<{ ok: boolean; data?: { url: string }; error?: string }>
      download: (payload: { apiKey: string; taskId: string }) => Promise<{ ok: boolean; data?: { path: string }; error?: string; retryable?: boolean }>
    }
    fmgo?: {
      request: (payload: { apiKey: string; path: string; body?: unknown }) => Promise<{ ok: boolean; data?: any; error?: string; retryable?: boolean }>
      upload: (payload: { dataUrl: string }) => Promise<{ ok: boolean; data?: { url: string }; error?: string }>
      download: (payload: { apiKey: string; taskId: string; videoUrl: string }) => Promise<{ ok: boolean; data?: { path: string }; error?: string; retryable?: boolean }>
    }
    unmau?: {
      request: (payload: any) => Promise<any>
      upload: (payload: any) => Promise<any>
      download: (payload: any) => Promise<any>
    }
    yu25?: {
      request: (payload: any) => Promise<any>
      upload: (payload: any) => Promise<any>
      download: (payload: any) => Promise<any>
    }
    luociImage?: {
      request: (payload: { key: string; route: string; body?: unknown; requestKey?: string }) => Promise<{ ok: boolean; data?: any; error?: string; status?: number }>
      upload: (payload: { key: string; modelId: string; base64: string; mime: string; name: string }) => Promise<{ ok: boolean; data?: any; error?: string }>
      download: (payload: { key: string; taskId: string; url: string }) => Promise<{ ok: boolean; data?: { dataUrl: string }; error?: string }>
    }
    luociVideo?: {
      request: (payload: any) => Promise<any>
      download: (payload: any) => Promise<any>
    }
    aimi?: {
      request: (payload: any) => Promise<any>
      upload: (payload: any) => Promise<any>
      download: (payload: any) => Promise<any>
    }
    piapi?: {
      downloadImage: (payload: any) => Promise<any>
      ensurePrivateAsset: (payload: any) => Promise<any>
      inspectMedia: (payload: any) => Promise<any>
      request: (payload: any) => Promise<any>
      upload: (payload: any) => Promise<any>
      download: (payload: any) => Promise<any>
    }
    qiling?: {
      upload: (payload: { apiKey: string; dataUrl: string }) => Promise<any>
      download: (payload: { apiKey: string; taskId?: string; videoUrl?: string; model?: string }) => Promise<any>
    }
    aiide?: {
      upload: (payload: { dataUrl: string }) => Promise<{ ok: boolean; data?: { url: string }; error?: string }>
    }
    store: {
      get: (key: string) => Promise<string | null>
      set: (key: string, value: string) => Promise<void>
      delete: (key: string) => Promise<void>
    }
    upload: {
      save: (base64Data: string, fileName: string) => Promise<string | null>
      delete: (filePath: string) => Promise<boolean>
      read: (filePath: string, maxBytes?: number) => Promise<{ data: string; size: number } | null>
    }
    shell?: {
      showItem: (filePath: string) => Promise<void>
    }
    jianying?: {
      available: () => Promise<boolean>
      exportDraft: (
        clips: Array<{ url: string; trimStart?: number; trimEnd?: number }>,
        draftName?: string
      ) => Promise<string>
    }
    video?: {
      export: (
        clips: Array<{ url: string; trimStart?: number; trimEnd?: number }> | string[],
        outputDir?: string
      ) => Promise<string | null>
      thumbnails: (url: string, durationSec: number, count: number) => Promise<string[]>
      onProgress: (callback: (payload: { stage: string; percent: number }) => void) => () => void
    }
    updater?: {
      check: () => Promise<{ ok: boolean; version?: string; reason?: string }>
      download: () => Promise<{ ok: boolean; reason?: string }>
      install: () => Promise<void>
      on: (
        event: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error',
        callback: (payload: any) => void
      ) => () => void
    }
  }
}
