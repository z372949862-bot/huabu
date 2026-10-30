// Run with Electron (not Node): electron scripts/test-media-fetch.cjs
// Local HTTP fixtures only: no provider calls, credentials or paid tasks.
const { app, net } = require('electron')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { createMediaFetch } = require('../electron/mediaFetch.cjs')
const { createVideoSaver } = require('../electron/videoStorage.cjs')
const fetch = createMediaFetch(net)
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(128 * 1024)])
const largeVideo = Buffer.concat([mp4, Buffer.alloc(16 * 1024 * 1024, 0x5a)])
const disposition = 'attachment; filename="自动生成的视频.mp4"'
const sockets = new Set()
let uploads = 0, redirects = 0, profile, server

async function test() {
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'wuhu-media-fetch-'))
  app.setPath('userData', profile)
  await app.whenReady()
  server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/redirect') {
        redirects++
        res.writeHead(302, { location: '/video' }); res.end(); return
      }
      if (req.url === '/redirect-upload') {
        for await (const _chunk of req) { /* receive original upload */ }
        res.writeHead(307, { location: '/upload' }); res.end(); return
      }
      if (req.url === '/upload') {
        uploads++
        assert.equal(req.headers.authorization, undefined)
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] } }).formData()
        assert.equal(form.get('file').name, 'reference.png')
        assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()), Buffer.from([0, 255, 128, 10]))
        const body = Buffer.from(JSON.stringify({ url: 'https://example.test/reference.png' }))
        raw(res, body, 'application/json'); return
      }
      if (req.url === '/upload-large') {
        assert.equal(req.headers.authorization, undefined)
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] } }).formData()
        assert.equal(form.get('file').name, 'reference.mp4')
        assert.deepEqual(Buffer.from(await form.get('file').arrayBuffer()), largeVideo)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ url: 'https://example.test/reference.mp4' })); return
      }
      if (req.url === '/error') { res.writeHead(502); res.end('temporary error'); return }
      if (req.url === '/empty') { res.writeHead(204); res.end(); return }
      if (req.url === '/waiting') return
      if (req.url === '/network-error') { req.socket.destroy(); return }
      if (req.url === '/stalled') {
        res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': String(mp4.length) })
        res.write(mp4.subarray(0, 12)); return
      }
      if (req.url === '/broken') {
        raw(res, mp4.subarray(0, 12), 'video/mp4', mp4.length); return
      }
      raw(res, mp4, 'video/mp4')
    } catch (error) { console.error(error); process.exitCode = 1; res.destroy(error) }
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  let result = await fetch(base + '/video')
  assert.equal(Buffer.from(result.headers.get('content-disposition'), 'latin1').toString('utf8'), disposition)
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), mp4)
  console.log('PASS UTF-8 response filename / exact video bytes')

  const form = new FormData()
  form.append('file', new Blob([Buffer.from([0, 255, 128, 10])], { type: 'image/png' }), 'reference.png')
  result = await fetch(base + '/redirect-upload', { method: 'POST', body: form })
  assert.equal((await result.json()).url, 'https://example.test/reference.png')
  assert.equal(uploads, 1)
  console.log('PASS multipart bytes, boundary, 307 redirect, no provider key')

  const videoForm = new FormData()
  videoForm.append('file', new Blob([largeVideo], { type: 'video/mp4' }), 'reference.mp4')
  result = await fetch(base + '/upload-large', { method: 'POST', body: videoForm })
  assert.equal((await result.json()).url, 'https://example.test/reference.mp4')
  console.log('PASS large multipart video upload / exact 16 MiB+ payload')

  const save = createVideoSaver({ root: path.join(profile, 'videos'), fetch, timeoutMs: 2000 })
  const saved = await save({ url: base + '/redirect' })
  assert.deepEqual(await fs.readFile(saved.path), mp4)
  assert.equal(redirects, 1)
  console.log('PASS redirected video atomically saved with Unicode filename header')

  assert.equal((await fetch(base + '/error')).status, 502)
  assert.equal(await (await fetch(base + '/empty')).text(), '')
  await assert.rejects(fetch(base + '/video', { signal: AbortSignal.abort() }), { name: 'AbortError' })
  const beforeHeaders = new AbortController()
  const waiting = fetch(base + '/waiting', { signal: beforeHeaders.signal })
  setTimeout(() => beforeHeaders.abort(), 20)
  await assert.rejects(waiting, { name: 'AbortError' })
  await assert.rejects(fetch(base + '/network-error'))
  const controller = new AbortController()
  result = await fetch(base + '/stalled', { signal: controller.signal })
  const pendingBody = result.arrayBuffer()
  controller.abort()
  await assert.rejects(pendingBody, { name: 'AbortError' })
  await (await fetch(base + '/stalled')).body.cancel()
  await assert.rejects((await fetch(base + '/broken')).arrayBuffer())
  await assert.rejects(save({ url: base + '/broken' }))
  const timeoutSave = createVideoSaver({ root: path.join(profile, 'timeout'), fetch, timeoutMs: 100 })
  await assert.rejects(timeoutSave({ url: base + '/stalled' }), /保存到本地超时/)
  console.log('PASS HTTP errors, empty responses, abort, cancel, truncation, timeout')

  for (const dir of [path.join(profile, 'videos'), path.join(profile, 'timeout')]) {
    const entries = await fs.readdir(dir, { recursive: true })
    assert.ok(entries.every(file => !file.endsWith('.part')))
  }
  console.log('PASS failed downloads leave no partial files')
  assert.notEqual(process.exitCode, 1)
}

function raw(res, body, type, length = body.length) {
  // Chromium decodes raw UTF-8 header bytes to Unicode; Node's writeHead rejects
  // such header values, so intentionally emit the fixture at the socket level.
  res.socket.end(Buffer.concat([
    Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: ${type}\r\nContent-Disposition: ${disposition}\r\nContent-Length: ${length}\r\nConnection: close\r\n\r\n`, 'utf8'), body,
  ]))
}
const watchdog = setTimeout(() => { console.error('FAIL test timeout'); app.exit(1) }, 20000)
test().then(() => finish(0), error => { console.error(error); finish(1) })
async function finish(code) {
  clearTimeout(watchdog)
  for (const socket of sockets) socket.destroy()
  if (server) server.close()
  // Electron owns its temporary profile until exit. Never touch the real app's data.
  console.log('RESULT ' + (code ? 'FAIL' : 'PASS'))
  app.exit(code)
}
