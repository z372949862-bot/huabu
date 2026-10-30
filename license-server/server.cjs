const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { sha256, signLease, verifyProof } = require('../electron/license-core.cjs')
const normalizeCode = code => String(code || '').trim().toUpperCase().replace(/[- ]/g, '')
const random = () => crypto.randomBytes(32).toString('base64url')
const reject = (status, code, message) => { throw Object.assign(new Error(message), { status, code }) }
function createService({ directory, port = 18765, leaseMs = 60000, clock = Date.now }) {
  fs.mkdirSync(directory, { recursive: true })
  const dbPath = path.join(directory, 'licenses.json'), keyPath = path.join(directory, 'signing-private.pem')
  if (!fs.existsSync(keyPath)) {
    if (fs.existsSync(dbPath)) throw new Error('签名密钥缺失，请恢复备份，不能自动更换已有授权密钥')
    const keys = crypto.generateKeyPairSync('ed25519')
    fs.writeFileSync(keyPath, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 })
  }
  const privateKey = fs.readFileSync(keyPath, 'utf8'), publicKey = crypto.createPublicKey(privateKey).export({ format: 'pem', type: 'spki' })
  const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : { version: 1, licenses: [], audit: [] }
  if (db.version !== 1 || !Array.isArray(db.licenses) || !Array.isArray(db.audit)) throw new Error('授权数据库损坏，请恢复备份')
  const save = () => { fs.writeFileSync(dbPath + '.tmp', JSON.stringify(db, null, 2), { mode: 0o600 }); fs.renameSync(dbPath + '.tmp', dbPath) }
  const audit = (action, licenseId) => { db.audit.unshift({ action, licenseId, at: clock() }); db.audit = db.audit.slice(0, 500) }
  const adminKeyPath = path.join(directory, 'admin-login.txt')
  if (!fs.existsSync(adminKeyPath)) fs.writeFileSync(adminKeyPath, random(), { mode: 0o600 })
  const adminHash = sha256(fs.readFileSync(adminKeyPath, 'utf8').trim())
  const adminSessions = new Map(), challenges = new Map(), attempts = new Map()
  let bootstrap = random(), bootstrapDeadline = clock() + 600000
  let origin = 'http://127.0.0.1:' + port
  const sweep = () => { for (const map of [adminSessions, challenges, attempts]) for (const [key, value] of map) if (value.until <= clock()) map.delete(key) }
  function limit(key, max) {
    sweep(); const value = attempts.get(key) || { count: 0, until: clock() + 60000 }; value.count++; attempts.set(key, value)
    if (value.count > max) reject(429, 'RATE_LIMIT', '操作过于频繁，请稍后再试')
  }
  function createLicense(body) {
    const days = Number(body.days ?? 7)
    if (!Number.isInteger(days) || days < 1 || days > 36500) reject(400, 'INVALID_DAYS', '有效期应为 1–36500 天')
    const raw = crypto.randomBytes(20).toString('hex').toUpperCase(), code = 'WH-' + raw.match(/.{1,5}/g).join('-')
    const license = { id: crypto.randomUUID(), label: String(body.label || '未命名授权').slice(0, 80), codeHash: sha256(normalizeCode(code)), suffix: raw.slice(-5), status: 'active', createdAt: clock(), expiresAt: clock() + days * 86400000, binding: null, generation: 0 }
    db.licenses.unshift(license); audit('create', license.id); save()
    return { id: license.id, code, expiresAt: license.expiresAt }
  }
  function issue(license) {
    const now = clock(), binding = license.binding
    const token = signLease({ licenseId: license.id, fingerprint: binding.fingerprint, deviceKey: sha256(binding.publicKey), generation: license.generation, iat: now, exp: Math.min(now + leaseMs, license.expiresAt), licenseExpiresAt: license.expiresAt, label: license.label }, privateKey)
    return { token, serverTime: now }
  }
  function verifyDevice(body) {
    const challenge = challenges.get(body.nonce); challenges.delete(body.nonce)
    if (!challenge || challenge.until <= clock() || challenge.fingerprint !== body.fingerprint || challenge.devicePublicKey !== body.devicePublicKey || !verifyProof(body)) reject(403, 'DEVICE_PROOF_INVALID', '设备验证失败，请重试')
  }
  async function readBody(req) {
    const chunks = []; let size = 0
    for await (const chunk of req) { size += chunk.length; if (size > 16384) reject(413, 'TOO_LARGE', '请求过大'); chunks.push(chunk) }
    try { const body = JSON.parse(Buffer.concat(chunks).toString()); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body } catch { reject(400, 'INVALID_JSON', '请求格式错误') }
  }
  function send(res, status, data, headers = {}) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(JSON.stringify(data)) }
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(origin).host) reject(403, 'INVALID_HOST', '请求地址不允许')
      if (req.headers.origin && req.headers.origin !== origin) reject(403, 'INVALID_ORIGIN', '跨站请求不允许')
      limit('requests', 300)
      const url = new URL(req.url, origin)
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, service: 'wuhu-license-local-trial', publicKey, trial: true })
      if (req.method === 'GET' && ['/admin','/admin.js','/admin.css'].includes(url.pathname)) {
        const file = url.pathname === '/admin' ? 'admin.html' : url.pathname.slice(1)
        res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Referrer-Policy': 'no-referrer' })
        return res.end(fs.readFileSync(path.join(__dirname, file)))
      }
      if (req.method === 'POST' && req.headers['content-type']?.split(';')[0] !== 'application/json') reject(415, 'INVALID_TYPE', '仅接受 JSON 请求')
      if (url.pathname.startsWith('/admin/api/')) {
        if (req.headers.origin !== origin && req.method !== 'GET') reject(403, 'INVALID_ORIGIN', '请从本机管理页面操作')
        if (url.pathname === '/admin/api/login' && req.method === 'POST') {
          limit('login', 10); const body = await readBody(req)
          const usingBootstrap = body.bootstrap && bootstrap && clock() < bootstrapDeadline && sha256(String(body.bootstrap)) === sha256(bootstrap)
          const usingPassword = typeof body.password === 'string' && sha256(body.password.trim()) === adminHash
          if (!usingBootstrap && !usingPassword) reject(401, 'BAD_LOGIN', '管理登录码无效')
          if (usingBootstrap) bootstrap = null
          const session = random(), csrf = random(); adminSessions.set(sha256(session), { csrf, until: clock() + 8 * 3600000 })
          return send(res, 200, { ok: true, csrf }, { 'Set-Cookie': 'wuhu_admin=' + session + '; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=28800' })
        }
        const cookie = String(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('wuhu_admin='))?.slice(11)
        const session = cookie && adminSessions.get(sha256(cookie))
        if (!session || session.until <= clock()) reject(401, 'LOGIN_REQUIRED', '请先登录管理后台')
        if (req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf) reject(403, 'CSRF', '页面验证已失效，请刷新后重试')
        if (req.method === 'GET' && url.pathname === '/admin/api/licenses') return send(res, 200, { ok: true, csrf: session.csrf, licenses: db.licenses.map(({ codeHash, binding, ...item }) => ({ ...item, binding: binding ? { fingerprint: binding.fingerprint, lastSeen: binding.lastSeen, boundAt: binding.boundAt } : null })), audit: db.audit.slice(0, 30), trial: true, heartbeatSeconds: 15, offlineSeconds: leaseMs / 1000 })
        if (req.method === 'POST' && url.pathname === '/admin/api/licenses') return send(res, 201, { ok: true, ...createLicense(await readBody(req)) })
        if (req.method === 'POST' && url.pathname === '/admin/api/action') {
          const body = await readBody(req), license = db.licenses.find(item => item.id === body.id)
          if (!license) reject(404, 'NOT_FOUND', '授权不存在')
          if (body.action === 'disable') { license.status = 'disabled'; license.generation++ }
          else if (body.action === 'enable') license.status = 'active'
          else if (body.action === 'unbind') { license.binding = null; license.generation++ }
          else if (body.action === 'extend') {
            const days = Number(body.days); if (!Number.isInteger(days) || days < 1 || days > 36500) reject(400, 'INVALID_DAYS', '续期天数无效')
            license.expiresAt = Math.max(license.expiresAt, clock()) + days * 86400000
          } else reject(400, 'INVALID_ACTION', '不支持的操作')
          audit(body.action, license.id); save(); return send(res, 200, { ok: true })
        }
        if (req.method === 'POST' && url.pathname === '/admin/api/logout') { adminSessions.delete(sha256(cookie)); return send(res, 200, { ok: true }, { 'Set-Cookie': 'wuhu_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0' }) }
      }
      if (req.method === 'POST' && url.pathname === '/v1/challenge') {
        limit('challenge', 60); const body = await readBody(req)
        if (!/^[a-f0-9]{64}$/.test(body.fingerprint || '') || typeof body.devicePublicKey !== 'string' || body.devicePublicKey.length > 1000) reject(400, 'BAD_DEVICE', '设备标识无效')
        try { if (crypto.createPublicKey(body.devicePublicKey).asymmetricKeyType !== 'ed25519') throw new Error() } catch { reject(400, 'BAD_KEY', '设备公钥无效') }
        const nonce = random(); challenges.set(nonce, { fingerprint: body.fingerprint, devicePublicKey: body.devicePublicKey, until: clock() + 60000 })
        return send(res, 200, { ok: true, nonce })
      }
      if (req.method === 'POST' && ['/v1/activate','/v1/renew'].includes(url.pathname)) {
        limit(url.pathname, 30); const body = await readBody(req)
        verifyDevice(body)
        if (body.action !== url.pathname.slice(4)) reject(400, 'BAD_ACTION', '请求用途不匹配')
        const license = body.action === 'activate' ? db.licenses.find(item => item.codeHash === sha256(normalizeCode(body.credential))) : db.licenses.find(item => item.id === body.credential)
        if (!license) reject(403, 'LICENSE_NOT_FOUND', '激活码无效或授权不存在')
        if (license.status !== 'active') reject(403, 'LICENSE_DISABLED', '授权已被管理员停用，请联系管理员')
        if (license.expiresAt <= clock()) reject(403, 'LICENSE_EXPIRED', '授权已到期，请联系管理员续期')
        if (body.action === 'renew' && !license.binding) reject(403, 'DEVICE_UNBOUND', '设备已解绑，请重新输入激活码')
        if (license.binding && (license.binding.fingerprint !== body.fingerprint || license.binding.publicKey !== body.devicePublicKey)) reject(403, 'DEVICE_MISMATCH', '此授权已绑定另一台电脑，请联系管理员解绑换机')
        if (!license.binding) { license.binding = { fingerprint: body.fingerprint, publicKey: body.devicePublicKey, boundAt: clock(), lastSeen: clock() }; audit('activate', license.id) }
        license.binding.lastSeen = clock(); save(); return send(res, 200, { ok: true, ...issue(license) })
      }
      reject(404, 'NOT_FOUND', '接口不存在')
    } catch (error) { send(res, error.status || 500, { ok: false, code: error.code || 'SERVICE_ERROR', message: error.status ? error.message : '授权服务异常，请查看本机服务状态' }) }
  })
  server.requestTimeout = 15000; server.headersTimeout = 10000
  return { server, publicKey, createLicense, async listen() { await new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',resolve) }); origin='http://127.0.0.1:'+server.address().port; return origin }, adminUrl() { return origin + '/admin#bootstrap=' + bootstrap }, close() { server.closeAllConnections(); return new Promise(resolve=>server.close(resolve)) } }
}
module.exports = { createService, normalizeCode }
if (require.main === module) {
  const directory = process.argv[2]
  if (!directory || !path.isAbsolute(directory)) throw new Error('请提供独立的绝对数据目录')
  const service = createService({ directory, port: Number(process.argv[3] || 18765) })
  service.listen().then(origin => {
    fs.writeFileSync(path.join(directory,'client-config.json'),JSON.stringify({ required:true, trial:true, serverUrl:origin, publicKey:service.publicKey, heartbeatSeconds:15 },null,2))
    fs.writeFileSync(path.join(directory,'admin-bootstrap-url.txt'),service.adminUrl(),{mode:0o600})
    console.log('本地授权试用服务已启动：'+origin+'（仅本机可访问）')
  }).catch(error=>{console.error(error.message);process.exitCode=1})
}
