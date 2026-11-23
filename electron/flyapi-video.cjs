// Make local MP4/MOV references seekable before staging. Copy encoded streams; never re-encode.
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const MAX_BYTES = 100 * 1024 * 1024

function boxes(bytes, start = 0, end = bytes.length) {
  const result = []
  for (let offset = start; offset + 8 <= end;) {
    let size = bytes.readUInt32BE(offset), header = 8
    if (size === 1) {
      if (offset + 16 > end) break
      size = Number(bytes.readBigUInt64BE(offset + 8)); header = 16
    } else if (size === 0) size = end - offset
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) break
    result.push({ type: bytes.toString('ascii', offset + 4, offset + 8), offset, start: offset + header, end: offset + size })
    offset += size
  }
  return result
}
function inspectMp4(bytes) {
  const top = boxes(bytes), movie = top.find(box => box.type === 'moov'), media = top.find(box => box.type === 'mdat')
  const header = movie && boxes(bytes, movie.start, movie.end).find(box => box.type === 'mvhd')
  if (!header || !media) return { duration: 0, fastStart: false }
  const version = bytes[header.start]
  const required = version === 1 ? 32 : 20
  if (![0, 1].includes(version) || header.end - header.start < required) return { duration: 0, fastStart: false }
  const scale = bytes.readUInt32BE(header.start + (version === 1 ? 20 : 12))
  const ticks = version === 1 ? Number(bytes.readBigUInt64BE(header.start + 24)) : bytes.readUInt32BE(header.start + 16)
  const duration = scale && Number.isSafeInteger(ticks) ? ticks / scale : 0
  return { duration, fastStart: movie.offset < media.offset }
}
function resolveFfmpeg() {
  const executable = require('ffmpeg-static')
  if (!executable) throw new Error('缺少视频封装整理组件，请重新安装完整桌面版')
  return executable.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep)
}
function remux(executable, input, output, timeoutMs) {
  return new Promise((resolve, reject) => {
    const process = spawn(executable, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', input,
      '-map', '0:V:0', '-map', '0:a?', '-c', 'copy', '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart', output],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; process.kill() }, timeoutMs)
    process.once('error', () => { clearTimeout(timer); reject(new Error('无法启动视频封装整理组件，请重新安装完整桌面版')) })
    process.once('close', code => {
      clearTimeout(timer)
      if (timedOut) reject(new Error('参考视频封装整理超时，尚未上传或提交视频生成'))
      else if (code !== 0) reject(new Error('参考视频无法无损整理，请重新导出为可正常播放的 MP4 后重试；尚未上传或提交视频生成'))
      else resolve()
    })
  })
}
function createFlyapiVideoPreparer({ ffmpegPath, tempRoot = os.tmpdir(), timeoutMs = 120000 } = {}) {
  return async dataUrl => {
    if (typeof dataUrl !== 'string' || !/^data:video[/](mp4|quicktime|x-m4v);base64,/i.test(dataUrl)) return dataUrl
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
    if (encoded.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error('参考视频超过本地上传上限 100 MB')
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('参考视频为空或超过本地上传上限 100 MB')
    const before = inspectMp4(bytes)
    const dir = await fs.mkdtemp(path.join(tempRoot, 'wuhu-flyapi-reference-'))
    try {
      const input = path.join(dir, 'input.mp4'), output = path.join(dir, 'reference.mp4')
      await fs.writeFile(input, bytes)
      await remux(ffmpegPath || resolveFfmpeg(), input, output, timeoutMs)
      const stat = await fs.stat(output)
      if (!stat.size || stat.size > MAX_BYTES) throw new Error('整理后的参考视频为空或超过 100 MB，尚未上传')
      const prepared = await fs.readFile(output), after = inspectMp4(prepared)
      if (!(after.duration > 0) || !after.fastStart) throw new Error('参考视频仍缺少有效时长或索引，尚未上传；请重新导出为 MP4')
      if (before.duration > 0 && Math.abs(after.duration - before.duration) > Math.max(0.1, before.duration * 0.01)) {
        throw new Error('整理后的参考视频时长发生变化，已停止上传以保留原内容；请重新导出为 MP4')
      }
      return 'data:video/mp4;base64,' + prepared.toString('base64')
    } finally { await fs.rm(dir, { recursive: true, force: true }) }
  }
}
module.exports = { createFlyapiVideoPreparer, inspectMp4 }
