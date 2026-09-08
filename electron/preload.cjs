const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  unmau: {
    request: (payload) => ipcRenderer.invoke('unmau:request', payload),
    upload: (payload) => ipcRenderer.invoke('unmau:upload', payload),
    download: (payload) => ipcRenderer.invoke('unmau:download', payload),
  },
  yu25: {
    request: (payload) => ipcRenderer.invoke('yu25:request', payload),
    upload: (payload) => ipcRenderer.invoke('yu25:upload', payload),
    download: (payload) => ipcRenderer.invoke('yu25:download', payload),
  },
  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value),
    delete: (key) => ipcRenderer.invoke('store:delete', key),
  },
  upload: {
    save: (base64Data, fileName) => ipcRenderer.invoke('upload:save', base64Data, fileName),
    delete: (filePath) => ipcRenderer.invoke('upload:delete', filePath),
    read: (filePath) => ipcRenderer.invoke('upload:read', filePath),
  },
  image: {
    // payload: { projectId, nodeId, dataUrl, ext? } → { path } | null
    save: (payload) => ipcRenderer.invoke('image:save', payload),
    delete: (filePath) => ipcRenderer.invoke('image:delete', filePath),
  },
  shell: {
    // 在系统文件管理器中定位文件
    showItem: (filePath) => ipcRenderer.invoke('shell:show-item', filePath),
  },
  jianying: {
    available: () => ipcRenderer.invoke('jianying:available'),
    exportDraft: (clips, draftName) => ipcRenderer.invoke('jianying:export-draft', clips, draftName),
  },
  video: {
    // clips: Array<{ url, trimStart, trimEnd }>（也兼容旧的 url 字符串数组）。返回保存路径或 null（取消）。
    export: (clips, outputDir) => ipcRenderer.invoke('video:export', clips, outputDir),
    // 用主进程 ffmpeg 给时间轴抽缩略图，返回 data URL 数组
    thumbnails: (url, durationSec, count) => ipcRenderer.invoke('video:thumbnails', url, durationSec, count),
    // 订阅导出进度，返回取消订阅函数
    onProgress: (callback) => {
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on('video:export-progress', handler)
      return () => ipcRenderer.removeListener('video:export-progress', handler)
    },
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    // 订阅主进程推送的更新事件，返回取消订阅函数
    on: (event, callback) => {
      const channel = `updater:${event}`
      const handler = (_e, payload) => callback(payload)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    },
  },
})
