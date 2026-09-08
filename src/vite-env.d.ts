declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare const __APP_VERSION__: string

interface Window {
  electronAPI?: {
    platform: string
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
    store: {
      get: (key: string) => Promise<string | null>
      set: (key: string, value: string) => Promise<void>
      delete: (key: string) => Promise<void>
    }
    upload: {
      save: (base64Data: string, fileName: string) => Promise<string | null>
      delete: (filePath: string) => Promise<boolean>
      read: (filePath: string) => Promise<{ data: string; size: number } | null>
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
