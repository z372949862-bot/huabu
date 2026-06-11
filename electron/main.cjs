const { app, BrowserWindow, ipcMain, safeStorage, protocol, net, Menu, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const Store = require('electron-store')
const { autoUpdater } = require('electron-updater')

const store = new Store({ name: 'ai-video-canvas-config' })

// ---- 本地上传文件落盘 ----
let uploadsDir = ''
function getUploadsDir() {
  if (!uploadsDir) {
    uploadsDir = path.join(app.getPath('userData'), 'node-uploads')
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
  }
  return uploadsDir
}

ipcMain.handle('upload:save', (_event, base64Data, fileName) => {
  try {
    const dir = getUploadsDir()
    const safeName = Date.now() + '_' + (fileName || 'file').replace(/[<>:"/\\|?*]/g, '_')
    const filePath = path.join(dir, safeName)
    const buf = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(filePath, buf)
    return filePath
  } catch (err) {
    console.error('upload:save failed:', err)
    return null
  }
})

ipcMain.handle('upload:delete', (_event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return true
  } catch { return false }
})

ipcMain.handle('upload:read', (_event, filePath) => {
  try {
    const buf = fs.readFileSync(filePath)
    return { data: buf.toString('base64'), size: buf.length }
  } catch (err) {
    console.error('upload:read failed:', err)
    return null
  }
})

// ---- 视频拼接导出 ----
ipcMain.handle('video:export', async (_event, fileUrls, outputDir) => {
  // 尝试找 ffmpeg，找不到则生成 HTML 播放器
  const ffmpegExe = path.join(path.dirname(app.getPath('exe')), 'ffmpeg.exe')
  const hasFfmpeg = fs.existsSync(ffmpegExe)

  if (!hasFfmpeg) {
    // 生成 HTML 顺序播放器
    const htmlPath = path.join(outputDir, 'playlist.html')
    const items = fileUrls.map((u, i) => `<video src="${u}" controls width="100%"></video><p>片段 ${i+1}</p>`).join('\n<hr>\n')
    const html = `<html><head><meta charset="utf-8"><title>视频拼接</title><style>body{background:#000;color:#fff;max-width:800px;margin:0 auto;padding:20px;font-family:sans-serif}video{display:block;margin:10px 0}p{color:#888;text-align:center}</style></head><body><h2>视频拼接预览</h2>${items}</body></html>`
    fs.writeFileSync(htmlPath, html)
    return htmlPath
  }

  // FFmpeg concat
  return new Promise((resolve, reject) => {
    const outPath = path.join(outputDir, `export_${Date.now()}.mp4`)
    const listPath = outPath + '.list.txt'
    const list = fileUrls.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n')
    fs.writeFileSync(listPath, list, 'utf-8')

    const proc = spawn(ffmpegExe, ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', outPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => {
      try { fs.unlinkSync(listPath) } catch {}
      code === 0 ? resolve(outPath) : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-200)}`))
    })
    proc.on('error', err => { try { fs.unlinkSync(listPath) } catch {}; reject(err) })
  })
})

ipcMain.handle('store:get', (_event, key) => {
  const raw = store.get(key)
  if (!raw || typeof raw !== 'string') return null
  if (raw.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'))
    } catch (err) {
      console.warn('safeStorage decrypt failed:', err)
      return null
    }
  }
  return raw
})

ipcMain.handle('store:set', (_event, key, value) => {
  if (typeof value !== 'string') return
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(value).toString('base64')
    store.set(key, 'enc:' + enc)
  } else {
    console.warn('safeStorage unavailable, storing plaintext')
    store.set(key, value)
  }
})

ipcMain.handle('store:delete', (_event, key) => {
  store.delete(key)
})

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#020308',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (!app.isPackaged) {
    mainWindow.loadURL(devUrl)
    // 独立窗口打开 DevTools，避免被画布盖住
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // F12 / Ctrl+Shift+I 切换 DevTools；Ctrl+R 刷新
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools()
      event.preventDefault()
    } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools()
      event.preventDefault()
    } else if (input.control && input.key.toLowerCase() === 'r') {
      mainWindow.webContents.reload()
      event.preventDefault()
    }
  })
}

app.whenReady().then(() => {
  // 隐藏菜单栏
  Menu.setApplicationMenu(null)

  // 自动更新（仅在打包后的 app 中生效，dev 模式跳过）
  if (app.isPackaged) {
    autoUpdater.logger = console
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('auto-update check failed:', err.message)
    })
  }
  // 注册自定义协议，绕开 Chromium 的 file:// 跨目录安全限制
  // 同时提供正确的 MIME 类型和 Range 支持，视频/音频才能正常播放
  protocol.handle('local-upload', (request) => {
    try {
      const u = new URL(request.url)
      let fp = decodeURIComponent(u.pathname)
      if (fp.startsWith('/') && /^\/[A-Za-z]:/.test(fp)) fp = fp.slice(1)

      if (!fs.existsSync(fp)) return new Response('', { status: 404 })

      const stat = fs.statSync(fp)
      const ext = path.extname(fp).toLowerCase()
      const mimeMap = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
      }
      const contentType = mimeMap[ext] || 'application/octet-stream'

      // Range 请求支持（视频 seek 需要）
      const rangeHeader = request.headers.get('range')
      if (rangeHeader) {
        const [start, end] = rangeHeader.replace('bytes=', '').split('-').map(Number)
        const chunkEnd = Math.min(end || stat.size - 1, stat.size - 1)
        const chunkSize = chunkEnd - start + 1
        const buf = Buffer.alloc(chunkSize)
        const fd = fs.openSync(fp, 'r')
        fs.readSync(fd, buf, 0, chunkSize, start)
        fs.closeSync(fd)
        return new Response(buf, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${chunkEnd}/${stat.size}`,
            'Content-Length': String(chunkSize),
            'Accept-Ranges': 'bytes',
          },
        })
      }

      // 完整文件请求
      const data = fs.readFileSync(fp)
      return new Response(data, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
        },
      })
    } catch {
      return new Response('', { status: 404 })
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
