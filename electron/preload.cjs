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
})
