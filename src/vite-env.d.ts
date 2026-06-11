declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare const __APP_VERSION__: string

interface Window {
  electronAPI?: {
    platform: string
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
