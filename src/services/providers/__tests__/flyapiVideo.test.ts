// @vitest-environment node
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const ffmpeg = require('ffmpeg-static')
const { createFlyapiVideoPreparer, inspectMp4 } = require('../../../../electron/flyapi-video.cjs')

it.each(['mp4', 'mov'])('moves %s timing information to the front without changing encoded video/audio or duration', async extension => {
  const root = await mkdtemp(join(tmpdir(), 'flyapi-video-test-'))
  try {
    const input = join(root, 'original.' + extension), output = join(root, 'normalized.mp4')
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=32x48:r=10', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100', '-t', '1.5', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input], { windowsHide: true, timeout: 15000 })
    const original = await readFile(input)
    expect(inspectMp4(original).fastStart).toBe(false)
    const prepared = await createFlyapiVideoPreparer({ ffmpegPath: ffmpeg, tempRoot: root })(`data:video/${extension === 'mov' ? 'quicktime' : 'mp4'};base64,` + original.toString('base64'))
    expect(prepared.startsWith('data:video/mp4;base64,')).toBe(true)
    const bytes = Buffer.from(prepared.slice(prepared.indexOf(',') + 1), 'base64')
    await writeFile(output, bytes)
    expect(inspectMp4(bytes)).toMatchObject({ fastStart: true, duration: inspectMp4(original).duration })
    const streamHashes = (file: string) => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:V:0', '-map', '0:a?', '-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-'], { windowsHide: true, encoding: 'utf8', timeout: 15000 })
    expect(streamHashes(output)).toBe(streamHashes(input))
    expect(await readFile(input)).toEqual(original)
    expect((await readdir(root)).sort()).toEqual(['normalized.mp4', 'original.' + extension].sort())
  } finally { await rm(root, { recursive: true, force: true }) }
}, 25000)

it('preserves non-MP4 media and rejects corrupt MP4 without leaving temporary files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'flyapi-video-invalid-'))
  try {
    const prepare = createFlyapiVideoPreparer({ ffmpegPath: ffmpeg, tempRoot: root })
    for (const source of ['data:image/png;base64,aW1hZ2U=', 'data:audio/wav;base64,YXVkaW8=', 'data:video/webm;base64,d2VibQ==']) expect(await prepare(source)).toBe(source)
    await expect(prepare('data:video/mp4;base64,' + Buffer.from('not a video').toString('base64'))).rejects.toThrow('无法无损整理')
    expect(await readdir(root)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
