const crypto = require('crypto')
const ISSUER = 'wuhu-ai-license-v1'
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const canonicalProof = body => JSON.stringify({ action: body.action, nonce: body.nonce, fingerprint: body.fingerprint, devicePublicKey: body.devicePublicKey, credential: body.credential, appVersion: body.appVersion })
function verifyLease(token, publicKey, device, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 16000) throw new Error('授权凭证无效')
  const parts = token.split('.')
  if (parts.length !== 2 || !crypto.verify(null, Buffer.from(parts[0]), publicKey, Buffer.from(parts[1], 'base64url'))) throw new Error('授权签名校验失败')
  const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  if (payload.iss !== ISSUER || payload.fingerprint !== device.fingerprint || payload.deviceKey !== sha256(device.publicKey)) throw new Error('授权不属于当前设备')
  if (typeof payload.licenseId !== 'string' || !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) || payload.exp <= payload.iat || payload.exp - payload.iat > 86400000 || payload.iat > now + 300000 || payload.exp <= now) throw new Error('授权凭证已过期或系统时间异常')
  if (payload.licenseExpiresAt !== null && (!Number.isFinite(payload.licenseExpiresAt) || payload.exp > payload.licenseExpiresAt)) throw new Error('授权期限无效')
  return payload
}
function signLease(payload, privateKey) {
  const body = Buffer.from(JSON.stringify({ ...payload, iss: ISSUER })).toString('base64url')
  return body + '.' + crypto.sign(null, Buffer.from(body), privateKey).toString('base64url')
}
function verifyProof(body) {
  if (!['activate','renew'].includes(body.action) || !/^[a-f0-9]{64}$/.test(body.fingerprint || '') || typeof body.credential !== 'string' || body.credential.length > 200 || typeof body.appVersion !== 'string' || body.appVersion.length > 80 || typeof body.devicePublicKey !== 'string' || body.devicePublicKey.length > 1000 || typeof body.signature !== 'string' || body.signature.length > 300) return false
  try {
    const key = crypto.createPublicKey(body.devicePublicKey)
    return key.asymmetricKeyType === 'ed25519' && crypto.verify(null, Buffer.from(canonicalProof(body)), key, Buffer.from(body.signature, 'base64url'))
  } catch { return false }
}
module.exports = { ISSUER, sha256, canonicalProof, verifyLease, signLease, verifyProof }
