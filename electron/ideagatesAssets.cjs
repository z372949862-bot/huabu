const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value)

// One serialized journal per credential/group. Persist exact body and idempotency
// key BEFORE each registration; ambiguous responses reuse both after a restart.
module.exports = function createAssets({ app, request, mediaUrl, upload }) {
  const queues = new Map()
  const root = path.join(app.getPath('userData'), 'ideagates-assets')
  async function exclusive(scope, fn) {
    const previous = queues.get(scope) || Promise.resolve()
    const job = previous.catch(() => {}).then(fn)
    queues.set(scope, job)
    try { return await job } finally { if (queues.get(scope) === job) queues.delete(scope) }
  }
  async function load(file) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')) }
    catch (error) {
      if (error.code === 'ENOENT') return { assets: {} }
      throw new Error('素材登记记录无法读取，请检查磁盘；为防止重复登记，本次已停止')
    }
  }
  async function write(file, state) {
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(file + '.tmp', JSON.stringify(state, null, 2))
    await fs.rename(file + '.tmp', file)
  }
  function result(raw) {
    const value = raw?.result || raw?.Result
    if (!value || !validId(value.Id)) throw Object.assign(new Error('素材服务未返回有效 ID，可重试读取原登记结果'), { retryable: true })
    return value
  }
  function checkType(asset, type) {
    if (asset.AssetType && asset.AssetType !== type) throw new Error('素材类型与引用类型不匹配，本次未生成视频')
    return asset
  }
  async function get(apiKey, id, type) {
    if (!validId(id)) throw new Error('素材 ID 无效')
    return checkType(result(await request(apiKey, '/asset/get', { id })), type)
  }
  return {
    get,
    async prepare({ apiKey, group, dataUrl, url, assetType }, fingerprint) {
      if (!['ideagates', 'ideagates-overseas'].includes(group)) throw new Error('不支持的 IDEA Gates 分组')
      if (!['Image', 'Video', 'Audio'].includes(assetType)) throw new Error('请选择图片、视频或音频素材类型')
      if (typeof url === 'string' && url.startsWith('asset://')) return { asset: await get(apiKey, url.slice(8), assetType) }
      let sourceHash
      if (dataUrl) {
        const match = typeof dataUrl === 'string' && dataUrl.match(/^data:((image|video|audio)\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/i)
        if (!match || match[2].toLowerCase() !== assetType.toLowerCase()) throw new Error('本地文件类型与参考素材类型不一致')
        const bytes = Buffer.from(match[3], 'base64')
        if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error('本地素材须非空且不超过 100 MB')
        sourceHash = hash(Buffer.concat([Buffer.from(match[1].toLowerCase() + ':'), bytes]))
      } else sourceHash = hash(mediaUrl(url))
      const scope = hash(fingerprint + ':' + group)
      return exclusive(scope, async () => {
        const file = path.join(root, scope + '.json')
        const state = await load(file)
        const key = assetType + ':' + sourceHash
        let entry = state.assets[key]
        if (entry?.id) {
          let obsolete = false
          try {
            const asset = await get(apiKey, entry.id, assetType)
            obsolete = ['failed', 'error', 'rejected', 'deleted', 'expired', 'disabled'].includes(String(asset.Status || '').toLowerCase())
            if (!obsolete) return { asset }
          } catch (error) {
            if (error.status !== 404 || error.code !== 'seedance_asset_not_found') throw error
            obsolete = true
          }
          if (obsolete) {
            // Only definitive terminal/missing results allow a NEW registration.
            // Check group existence first; transient/auth failures preserve the old journal.
            try { result(await request(apiKey, '/asset/groups/get', { id: state.group.id })) }
            catch (error) {
              if (error.status !== 404 || !['seedance_asset_not_found', 'seedance_asset_group_not_found'].includes(error.code)) throw error
              delete state.group
              state.assets = {}
            }
            delete state.assets[key]
            entry = undefined
            await write(file, state)
          }
        }

        // Group registration also doubles as the support check for overseas Keys.
        // Do this before disclosing local bytes to the temporary staging host.
        if (!state.group) {
          state.group = { body: { name: '芜湖AI参考素材', description: '芜湖AI本地素材自动登记' }, idempotencyKey: crypto.randomUUID() }
          await write(file, state)
        }
        if (!state.group.id) {
          const raw = await request(apiKey, '/asset/groups', state.group.body, { 'Idempotency-Key': state.group.idempotencyKey })
          state.group.id = result(raw).Id
          await write(file, state)
        }
        if (!entry) {
          entry = state.assets[key] = { idempotencyKey: crypto.randomUUID() }
          await write(file, state)
        }
        if (!entry.body) {
          let remote = url
          if (dataUrl) {
            const staged = await upload({ dataUrl })
            if (!staged?.ok || !staged.data?.url) throw new Error((staged?.error || '本地素材上传失败').replaceAll('AIIDE', 'IDEA Gates'))
            remote = staged.data.url
          }
          mediaUrl(remote)
          entry.body = { group_id: state.group.id, url: remote, asset_type: assetType, name: `${assetType}-${sourceHash.slice(0, 12)}` }
          await write(file, state)
        }
        let raw
        try { raw = await request(apiKey, '/asset/create', entry.body, { 'Idempotency-Key': entry.idempotencyKey }) }
        catch (error) {
          if (error.status === 404 && ['seedance_asset_not_found', 'seedance_asset_group_not_found'].includes(error.code)) {
            // Confirm deletion instead of resetting on an ambiguous create failure.
            try { result(await request(apiKey, '/asset/groups/get', { id: state.group.id })) }
            catch (groupError) {
              if (groupError.status !== 404 || !['seedance_asset_not_found', 'seedance_asset_group_not_found'].includes(groupError.code)) throw groupError
              delete state.group
              state.assets = {}
              await write(file, state)
              throw Object.assign(new Error('原素材组已删除，正在重新登记素材，视频尚未提交'), { retryable: true })
            }
          }
          throw error
        }
        const asset = checkType(result(raw), assetType)
        entry.id = asset.Id
        await write(file, state)
        return { asset }
      })
    },
  }
}
