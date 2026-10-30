const crypto = require('crypto')
const RELEASE_URL = 'https://github.com/z372949862-bot/huabu/releases/latest'
const ISSUER = 'wuhu-ai-update-policy-v1'
const stable = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/
function validMinimum(version) { return typeof version === 'string' && stable.test(version) }
function requiresUpdate(version, policy) {
  if (!policy?.enabled) return false
  if (!validMinimum(policy.minVersion)) throw new Error('最低版本配置无效')
  const match = typeof version === 'string' && version.match(/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) return true
  const minimum = policy.minVersion.split('.').map(Number)
  for (let index = 0; index < 3; index++) {
    const difference = Number(match[index + 1]) - minimum[index]
    if (difference) return difference < 0
  }
  return !!match[4]
}
function signPolicy(policy, privateKey, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...policy, iss: ISSUER, releaseUrl: RELEASE_URL, iat: now, exp: now + 3600000 })).toString('base64url')
  return body + '.' + crypto.sign(null, Buffer.from(body), privateKey).toString('base64url')
}
function verifyPolicy(token, publicKey, now = Date.now(), cached = false) {
  if (typeof token !== 'string' || token.length > 8000) throw new Error('更新策略无效')
  const parts = token.split('.')
  if (parts.length !== 2 || !crypto.verify(null, Buffer.from(parts[0]), publicKey, Buffer.from(parts[1], 'base64url'))) throw new Error('更新策略签名无效')
  const policy = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  if (policy.iss !== ISSUER || typeof policy.enabled !== 'boolean' || !validMinimum(policy.minVersion) || !Number.isSafeInteger(policy.revision) || policy.revision < 0 || policy.releaseUrl !== RELEASE_URL || typeof policy.message !== 'string' || policy.message.length > 200 || !Number.isFinite(policy.iat) || !Number.isFinite(policy.exp) || policy.exp <= policy.iat || policy.exp - policy.iat > 3600000 || (!cached && (policy.iat > now + 300000 || policy.exp <= now))) throw new Error('更新策略无效或已过期')
  return policy
}
module.exports = { RELEASE_URL, validMinimum, requiresUpdate, signPolicy, verifyPolicy }
