// Hidden Electron renderer; local fixtures only, no API keys or paid requests.
const { app, BrowserWindow } = require('electron')
const { build } = require('esbuild')
const sharp = require('sharp')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sunburst-gif-test-'))
  let window
  try {
    const bundle = await build({ entryPoints: [path.join(__dirname, '../src/services/geeknowSunburst26.ts')], bundle: true, format: 'iife', globalName: 'Sunburst', platform: 'browser', write: false })
    const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: 'red' } }).png().toBuffer()
    const single = await sharp(png).gif().toBuffer()
    const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255])
    const animated = await sharp(pixels, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } }).gif({ delay: [200, 200], loop: 0 }).toBuffer()
    // Assemble two identical image blocks to test repeated-frame rejection.
    const frame = single.indexOf(Buffer.from([0x2c]))
    assert.ok(frame > 0 && single[single.length - 1] === 0x3b)
    const repeat = Buffer.concat([single.subarray(0, -1), single.subarray(frame, -1), Buffer.from([0x3b])])
    const html = path.join(root, 'test.html')
    await fs.writeFile(html, '<!doctype html><html><body>Local GIF checks</body></html>')
    await app.whenReady()
    window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } })
    await window.loadFile(html)
    await window.webContents.executeJavaScript(bundle.outputFiles[0].text)
    const fixtures = Object.fromEntries(Object.entries({ png, single, animated, repeat }).map(([key, value]) => [key, value.toString('base64')]))
    const result = await window.webContents.executeJavaScript(`(async () => {
      const fixtures = ${JSON.stringify(fixtures)};
      const bytes = key => Uint8Array.from(atob(fixtures[key]), value => value.charCodeAt(0));
      const checks = {};
      for (const key of Object.keys(fixtures)) checks[key] = await Sunburst.isAnimatedGif(bytes(key));
      const seen = [];
      globalThis.fetch = async (url, options) => {
        seen.push({ url, options: { ...options, signal: undefined } });
        return new Response(bytes(url.includes('storyboard') ? 'png' : 'animated'), { headers: { 'content-type': 'image/png' } });
      };
      const urls = await Sunburst.resolveSunburst26Gifs(['https://example.test/storyboard.png', 'https://example.test/animation.png']);
      return { checks, urls, seen };
    })()`);
    assert.deepEqual(result.checks, { png: false, single: false, animated: true, repeat: false })
    assert.deepEqual(result.urls, ['data:image/gif;base64,' + fixtures.animated])
    assert.ok(result.seen.every(item => !item.options.headers && item.options.credentials === 'omit'))
    console.log('PASS real Chromium GIF decoding: PNG / single frame / repeated frames rejected; animated original bytes preserved despite PNG name and MIME; no API key sent')
  } finally {
    if (window && !window.isDestroyed()) window.destroy()
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'sunburst-gif-test-')) throw new Error('Unsafe cleanup path')
    await fs.rm(root, { recursive: true, force: true })
  }
}
main().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1) })
