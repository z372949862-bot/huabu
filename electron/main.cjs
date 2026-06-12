const { app, BrowserWindow, ipcMain, safeStorage, protocol, net, Menu, dialog, shell } = require('electron')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const Store = require('electron-store')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const jianying = require('./jianyingDraft.cjs')

const store = new Store({ name: 'ai-video-canvas-config' })

// 更新日志写文件，方便排查（Windows: %USERPROFILE%\AppData\Roaming\AI Video Canvas\logs\main.log）
log.transports.file.level = 'info'
autoUpdater.logger = log

let mainWindow = null

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
// ---- 视频导出（剪辑器）----
// 解析可用的 ffmpeg：①打包后 asarUnpack 解出的 ffmpeg-static；②exe 同目录；③系统 PATH。
function resolveFfmpeg() {
  try {
    const fromStatic = require('ffmpeg-static')
    if (fromStatic) {
      const unpacked = fromStatic.replace('app.asar', 'app.asar.unpacked')
      if (fs.existsSync(unpacked)) return unpacked
      if (fs.existsSync(fromStatic)) return fromStatic
    }
  } catch {}
  const beside = path.join(path.dirname(app.getPath('exe')), 'ffmpeg.exe')
  if (fs.existsSync(beside)) return beside
  return 'ffmpeg'
}

function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000) })
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`)))
    proc.on('error', err => reject(err))
  })
}

// 远程 URL 下载到本地文件。
// 背压：write() 返回 false（下载快于写盘）时暂停响应流，等 drain 再继续，
// 避免几百 MB 的生成视频在内存里堆 buffer。
function downloadToFile(url, dest) {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    request.on('response', (response) => {
      if (response.statusCode >= 400) { reject(new Error(`下载失败 ${response.statusCode}`)); return }
      const file = fs.createWriteStream(dest)
      file.on('error', reject)
      response.on('data', (chunk) => {
        if (file.write(chunk) === false) {
          response.pause()
          file.once('drain', () => response.resume())
        }
      })
      response.on('end', () => file.end(() => resolve(dest)))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

// 并发上限地批量执行异步任务（用于并行预下载远程片段，下载与后续编码不再完全串行）
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return out
}

// 把 clip.url 解析成本地可读文件路径；远程先下载到 tmpDir。
async function resolveClipFile(url, tmpDir, idx) {
  if (!url) throw new Error('片段地址为空')
  if (/^https?:\/\//i.test(url)) {
    const ext = (url.split('?')[0].split('.').pop() || 'mp4').toLowerCase()
    const dest = path.join(tmpDir, `src_${idx}.${/^[a-z0-9]{1,4}$/.test(ext) ? ext : 'mp4'}`)
    return downloadToFile(url, dest)
  }
  if (url.startsWith('local-upload:///')) {
    const p = url.replace('local-upload:///', '')
    if (!fs.existsSync(p)) throw new Error('本地文件不存在: ' + p)
    return p
  }
  if (url.startsWith('file:///')) {
    const p = decodeURIComponent(url.replace('file:///', ''))
    if (fs.existsSync(p)) return p
  }
  if (fs.existsSync(url)) return url
  throw new Error('无法解析片段地址: ' + url.slice(0, 80))
}

ipcMain.handle('video:export', async (_event, clips, _outputDir) => {
  // 兼容旧签名：传 url 字符串数组时，包成无裁剪的片段
  const list = (Array.isArray(clips) ? clips : [])
    .map(c => (typeof c === 'string' ? { url: c, trimStart: 0, trimEnd: 0 } : c))
    .filter(c => c && c.url)
  if (!list.length) throw new Error('没有可导出的片段')

  // 让用户选保存位置
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出视频',
    defaultPath: path.join(
      app.getPath('videos') || app.getPath('downloads') || app.getPath('desktop'),
      `export_${Date.now()}.mp4`
    ),
    filters: [{ name: 'MP4 视频', extensions: ['mp4'] }],
  })
  if (canceled || !filePath) return null

  const ffmpeg = resolveFfmpeg()
  const tmpDir = path.join(app.getPath('temp'), `avc-export-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const sendProgress = (stage, pct) => {
    try { mainWindow?.webContents.send('video:export-progress', { stage, percent: pct }) } catch {}
  }

  try {
    const total = list.length
    const segPaths = []
    let vf = null // 归一化滤镜：按首片段比例自适应（横/竖屏都对），延迟到拿到首片段尺寸再定
    let canvasW = 0, canvasH = 0
    // 先并行把所有远程片段下载到本地（限 3 并发），再串行编码 —— 下载不再卡在每段编码之间
    sendProgress('下载片段', 2)
    const srcFiles = await mapLimit(list, 3, (c, i) => resolveClipFile(c.url, tmpDir, i))
    for (let i = 0; i < total; i++) {
      const clip = list[i]
      sendProgress(`处理片段 ${i + 1}/${total}`, Math.round((i / (total + 1)) * 100))
      const srcFile = srcFiles[i]

      // 用首片段尺寸决定输出画布：长边≤1280、保持比例、宽高取偶数
      if (!vf) {
        const info = await jianying.probe(ffmpeg, srcFile)
        let w = info.width || 1280, h = info.height || 720
        const long = Math.max(w, h)
        if (long > 1280) { const s = 1280 / long; w = Math.round(w * s); h = Math.round(h * s) }
        canvasW = Math.max(2, w - (w % 2)); canvasH = Math.max(2, h - (h % 2))
        vf = `scale=${canvasW}:${canvasH}:force_original_aspect_ratio=decrease,pad=${canvasW}:${canvasH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`
      }

      const start = Math.max(0, Number(clip.trimStart) || 0)
      const end = Number(clip.trimEnd) || 0
      const dur = end > start ? end - start : 0 // 0 = 用整段

      // 单片段音量（0~1，默认 1）：!==1 时挂 -af volume 滤镜
      const aVol = Math.max(0, Math.min(1, Number(clip.volume == null ? 1 : clip.volume)))
      const afArgs = aVol !== 1 ? ['-af', `volume=${aVol.toFixed(3)}`] : []

      const seg = path.join(tmpDir, `seg_${i}.mp4`)
      const trimArgs = []
      if (start > 0) trimArgs.push('-ss', String(start))
      if (dur > 0) trimArgs.push('-t', String(dur))
      const encOut = [
        '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-r', '30', ...afArgs, '-c:a', 'aac', '-b:a', '128k',
        '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-y', seg,
      ]
      try {
        // 优先保留原声
        await runFfmpeg(ffmpeg, [...trimArgs, '-i', srcFile, '-map', '0:v:0', '-map', '0:a:0', ...encOut])
      } catch {
        // 片段无音轨：补静音轨，保证所有片段流结构一致
        await runFfmpeg(ffmpeg, [
          ...trimArgs, '-i', srcFile,
          '-f', 'lavfi', '-t', String(dur > 0 ? dur : 600), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
          '-map', '0:v:0', '-map', '1:a:0', '-shortest', ...encOut,
        ])
      }
      segPaths.push(seg)
    }

    // 拼接
    sendProgress('拼接中', Math.round((total / (total + 1)) * 100))
    const listPath = path.join(tmpDir, 'concat.txt')
    fs.writeFileSync(listPath, segPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'), 'utf-8')
    await runFfmpeg(ffmpeg, ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', '-y', filePath])

    sendProgress('完成', 100)
    return filePath
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
})

// 用 ffmpeg 给时间轴抽缩略图（比 renderer canvas 可靠，不受 CORS/GPU 解码影响）。
// 远程地址让 ffmpeg 直接流式读取，避免下载整段。返回 data URL 数组。
// 缩略图磁盘缓存清理：超过上限时按最近访问时间删最旧的，避免无限增长
function pruneThumbCache(cacheDir, maxBytes) {
  try {
    const files = fs.readdirSync(cacheDir)
      .filter(f => f.endsWith('.json'))
      .map(f => { const p = path.join(cacheDir, f); const st = fs.statSync(p); return { p, size: st.size, atime: st.atimeMs } })
    let total = files.reduce((s, f) => s + f.size, 0)
    if (total <= maxBytes) return
    files.sort((a, b) => a.atime - b.atime) // 最久未访问的排前面
    for (const f of files) {
      if (total <= maxBytes) break
      try { fs.rmSync(f.p, { force: true }); total -= f.size } catch {}
    }
  } catch {}
}

ipcMain.handle('video:thumbnails', async (_event, url, durationSec, count) => {
  const n = Math.max(1, Math.min(40, Math.round(Number(count) || 8)))
  const dur = Number(durationSec) > 0 ? Number(durationSec) : 0
  if (!url) return []

  const THUMB_H = 720 // 抽帧高度：用于 scrub 大预览放大显示，太小会糊
  // 磁盘缓存：key = url + 时长 + 帧数 + 分辨率。命中直接读，避免每次进剪辑器/重启都重抽。
  const cacheDir = path.join(app.getPath('userData'), 'thumb-cache')
  const cacheKey = crypto.createHash('md5').update(`${url}|${dur}|${n}|h${THUMB_H}`).digest('hex')
  const cacheFile = path.join(cacheDir, cacheKey + '.json')
  try {
    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      if (Array.isArray(cached) && cached.length) return cached
    }
  } catch {}

  const input = /^https?:\/\//i.test(url) ? url
    : url.startsWith('local-upload:///') ? url.replace('local-upload:///', '')
    : url.startsWith('file:///') ? decodeURIComponent(url.replace('file:///', ''))
    : url

  const ffmpeg = resolveFfmpeg()
  const tmpDir = path.join(app.getPath('temp'), `avc-thumbs-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  try {
    const fps = dur > 0 ? n / dur : 1 // 均匀抽 n 帧
    // 抽高分辨率(高 720px，按原始比例)，scrub 时放大到大预览也清晰；q:v 2 高质量
    const vf = `fps=${fps.toFixed(6)},scale=-2:${THUMB_H}`
    const pattern = path.join(tmpDir, 'thumb_%03d.jpg')
    await runFfmpeg(ffmpeg, ['-y', '-i', input, '-vf', vf, '-frames:v', String(n), '-q:v', '2', pattern])
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg')).sort()
    const result = files.map(f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(tmpDir, f)).toString('base64'))
    // 写缓存（失败不影响返回）
    try {
      fs.mkdirSync(cacheDir, { recursive: true })
      if (result.length) fs.writeFileSync(cacheFile, JSON.stringify(result), 'utf-8')
      pruneThumbCache(cacheDir, 200 * 1024 * 1024) // 上限 ~200MB
    } catch {}
    return result
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
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

// 在系统文件管理器中定位文件（导出后「打开所在文件夹」）
ipcMain.handle('shell:show-item', (_event, filePath) => {
  if (filePath && typeof filePath === 'string') shell.showItemInFolder(filePath)
})

// 是否检测到剪映专业版
ipcMain.handle('jianying:available', () => {
  try { return jianying.isInstalled() } catch { return false }
})

// 导出时间轴到剪映草稿（生成明文草稿，剪映可直接打开）
ipcMain.handle('jianying:export-draft', async (_event, clips, draftName) => {
  const list = (Array.isArray(clips) ? clips : []).filter(c => c && c.url)
  if (!list.length) throw new Error('没有可导出的片段')
  if (!jianying.isInstalled()) throw new Error('未检测到剪映专业版（草稿目录不存在）')
  const ffmpeg = resolveFfmpeg()
  // 远程片段先下载到临时目录，得到本地路径
  const tmpDir = path.join(app.getPath('temp'), `avc-jy-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  try {
    // 远程片段并行下载（限 3 并发），再按原顺序组装
    const resolvedFiles = await mapLimit(list, 3, (c, i) => resolveClipFile(c.url, tmpDir, i))
    const resolved = list.map((c, i) => ({
      localPath: resolvedFiles[i],
      trimStart: c.trimStart || 0,
      trimEnd: c.trimEnd || 0,
      volume: c.volume == null ? 1 : c.volume,
    }))
    const name = (draftName && String(draftName).trim()) || `AI视频_${Date.now()}`
    const folder = await jianying.buildDraft({ name, clips: resolved, ffmpeg })
    return folder
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
})

function createWindow() {
  mainWindow = new BrowserWindow({
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
  // 可见式更新：不自动下载，把事件推给渲染端由用户确认
  if (app.isPackaged) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    const send = (channel, payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload)
      }
    }

    autoUpdater.on('checking-for-update', () => send('updater:checking'))
    autoUpdater.on('update-available', (info) => send('updater:available', { version: info.version, releaseNotes: info.releaseNotes, releaseDate: info.releaseDate }))
    autoUpdater.on('update-not-available', (info) => send('updater:not-available', { version: info.version }))
    autoUpdater.on('download-progress', (p) => send('updater:progress', { percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond }))
    autoUpdater.on('update-downloaded', (info) => send('updater:downloaded', { version: info.version }))
    autoUpdater.on('error', (err) => send('updater:error', { message: err == null ? 'unknown' : (err.message || String(err)) }))

    // 启动后静默自检（发现新版才会通过 update-available 弹窗）
    autoUpdater.checkForUpdates().catch((err) => log.warn('auto-update check failed:', err && err.message))
  }

  // 渲染端触发的更新操作
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev-mode' }
    try {
      const r = await autoUpdater.checkForUpdates()
      return { ok: true, version: r && r.updateInfo && r.updateInfo.version }
    } catch (err) {
      return { ok: false, reason: (err && err.message) || String(err) }
    }
  })
  ipcMain.handle('updater:download', async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true } }
    catch (err) { return { ok: false, reason: (err && err.message) || String(err) } }
  })
  ipcMain.handle('updater:install', () => {
    // 退出并安装；isSilent=false 显示安装界面，isForceRunAfter=true 装完自动重开
    autoUpdater.quitAndInstall(false, true)
  })

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
