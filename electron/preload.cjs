const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
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
  video: {
    export: (fileUrls, outputDir) => ipcRenderer.invoke('video:export', fileUrls, outputDir),
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
