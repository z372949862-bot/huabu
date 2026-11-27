// H3 works with a public MP4, not a Seedance asset ID. Never pass an account key to the CDN.
const fs = require('node:fs/promises')
const path = require('node:path')
const { publicResultUrl } = require('./imageResultFetch.cjs')
const { createVideoSaver } = require('./videoStorage.cjs')
const MODEL = 'h3-shipinzhuanshendu'
const MAX_LOCAL = 100 * 1024 * 1024 // same as the FlyAPI staging service

function depthRequest(body) {
  if (body.model !== MODEL || Object.keys(body).some(k => k !== 'video' && k !== 'model') || typeof body.video !== 'string') throw new Error('视频转深度只接受一个公网 MP4 地址')
  return { model: MODEL, video: publicResultUrl(body.video) }
}
function checkHeader(b) {
  // ISO BMFF files identify themselves by their ftyp brands (MOV/HEIF are also ISO BMFF).
  const end = b.length >= 16 ? Math.min(b.readUInt32BE(0), b.length) : 0
  const brands = [b.toString('ascii',8,12)]
  for (let i=16; i+4<=end; i+=4) brands.push(b.toString('ascii',i,i+4))
  if (end < 16 || b.toString('ascii',4,8) !== 'ftyp' || /^(qt  |avif|avis|mif1|heic|3g..|M4A )$/.test(brands[0]) || !brands.some(v => /^(isom|iso[2-9]|mp4[12]|avc1|hvc1|hev1|dash|M4V |MSNV|mp71|cmf[cv])$/.test(v))) throw new Error('源文件不是 MP4 视频，请先导出为 MP4')
}
function depthMedia({ fetch, app }) {
  const publicFetch = async (source, options = {}) => {
    let url = publicResultUrl(source)
    for (let redirects=0; redirects<=5; redirects++) {
      const res = await fetch(url, { ...options, credentials: 'omit', redirect: 'manual' })
      if (![301,302,303,307,308].includes(res.status)) return res
      const next = res.headers.get('location'); await res.body?.cancel()
      if (!next) throw new Error('视频跳转未返回地址')
      url = publicResultUrl(new URL(next,url).href)
    }
    throw new Error('视频地址跳转次数过多')
  }
  let saver
  async function checkSource(source) {
    if (typeof source !== 'string') throw new Error('缺少源视频')
    if (source.startsWith('local-upload:///')) {
      const file = source.slice('local-upload:///'.length)
      if (!path.isAbsolute(file) || /^[/\\]{2}/.test(file)) throw new Error('请选择本地 MP4 文件')
      const handle = await fs.open(file,'r')
      try {
        const stat = await handle.stat(); if (!stat.isFile() || stat.size > MAX_LOCAL) throw new Error('本地源视频须为不超过 100 MB 的 MP4')
        const b=Buffer.alloc(64), { bytesRead }=await handle.read(b,0,b.length,0); checkHeader(b.subarray(0,bytesRead))
      } finally { await handle.close() }
    } else if (source.startsWith('data:video/mp4;base64,')) {
      if (source.length > Math.ceil(MAX_LOCAL/3)*4+32) throw new Error('本地源视频不能超过 100 MB')
      checkHeader(Buffer.from(source.slice(22,110),'base64'))
    } else {
      const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),20000)
      try {
        const res = await publicFetch(source,{ headers:{ Range:'bytes=0-63' },signal:controller.signal })
        if (![200,206].includes(res.status) || !res.body) throw new Error('无法读取源视频，请确认 MP4 链接可公开访问')
        const reader=res.body.getReader(), b=Buffer.alloc(64); let n=0
        try { while(n<b.length){const {value,done}=await reader.read(); if(done)break; n+=Buffer.from(value.buffer,value.byteOffset,value.byteLength).copy(b,n,0,Math.min(value.byteLength,b.length-n))} }
        finally { await reader.cancel().catch(()=>{}) }
        checkHeader(b.subarray(0,n))
      } finally {clearTimeout(timer); controller.abort()}
    }
    return {}
  }
  async function download(taskId,url) {
    if (!saver) saver=createVideoSaver({root:path.join(app.getPath('userData'),'generated-videos','flyapi-depth'),fetch:publicFetch})
    return saver({url:publicResultUrl(url),assetId:taskId})
  }
  return {checkSource,download}
}
module.exports = { MODEL, depthRequest, depthMedia }
