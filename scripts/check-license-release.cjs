const crypto = require('crypto')
function check(candidate) {
  const config = candidate && Object.hasOwn(candidate,'required') ? candidate : require('../electron/license-config.cjs')
  if (config.required !== true || config.trial || config.preview || !config.publicKey || !config.serverUrl) throw new Error('禁止正式打包：授权服务未部署，或当前使用本地试用配置')
  const url = new URL(config.serverUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' || /^[0-9.]+$/.test(url.hostname) || url.hostname.endsWith('.local') || url.pathname !== '/' || url.search || url.hash) throw new Error('正式授权服务必须使用有效的 HTTPS 域名地址')
  if (crypto.createPublicKey(config.publicKey).asymmetricKeyType !== 'ed25519' || config.publicKey.includes('PRIVATE KEY')) throw new Error('授权校验公钥无效')
}
module.exports = check
if (require.main === module) { check(); console.log('Production license configuration verified') }
