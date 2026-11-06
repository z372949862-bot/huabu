import { afterEach, expect, it, vi } from 'vitest'
import { persistImage } from '../imageStorage'
afterEach(() => vi.unstubAllGlobals())
it('persists GIF as original encoded bytes and uses the gif extension', async () => {
  const save = vi.fn().mockResolvedValue({ path: 'C:/images/result.gif' })
  vi.stubGlobal('electronAPI', { image: { save } })
  const source = 'data:image/gif;base64,R0lGODlh'
  expect(await persistImage(source, { projectId: 'project', nodeId: 'node' })).toBe('local-upload:///C:/images/result.gif')
  expect(save).toHaveBeenCalledExactlyOnceWith({ projectId: 'project', nodeId: 'node', dataUrl: source, ext: 'gif' })
})
