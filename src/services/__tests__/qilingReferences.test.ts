import { describe, expect, it } from 'vitest'
import { prepareQilingReferences } from '../qilingReferences'
import { ChuhaiyingVideoProvider } from '../providers/chuhaiyingVideo'

const nodes = [
  { id: 'man', type: 'asset-ref', data: { assetType: 'image', assetUrl: 'https://example.com/man.png' } },
  { id: 'woman', type: 'ai-image', data: { outputImage: 'https://example.com/woman.png' } },
  { id: 'video', type: 'ai-video', data: {
    prompt: '角色：@[沈知意](node_woman)是沈知意、@[萧承渊](node_man)是萧承渊。\n场景与位置关系：@[慈宁宫](scene)。\n1.镜头\n内容：沈知意端起茶杯，萧承渊看向她。',
    _uploads: [{ id: 'scene', type: 'image', url: 'local-upload:///C:/scene.png' }],
    inputImages: ['https://example.com/man.png', 'https://example.com/woman.png', 'local-upload:///C:/scene.png'],
  } },
]
const edges = [{ source: 'man', target: 'video' }, { source: 'woman', target: 'video' }]

describe('Qiling reference binding', () => {
  it('binds roles to the media order instead of mention order and preserves shot instructions', () => {
    const result = prepareQilingReferences('video', nodes, edges)
    expect(result.images).toEqual(['https://example.com/man.png', 'https://example.com/woman.png', 'local-upload:///C:/scene.png'])
    expect(result.prompt).toBe('角色：@图片2是沈知意、@图片1是萧承渊。\n场景与位置关系：@图片3。\n1.镜头\n内容：沈知意端起茶杯，萧承渊看向她。')
  })

  it('deduplicates URLs while preserving aliases and separate media numbering', () => {
    const result = prepareQilingReferences('v', [{ id: 'v', data: {
      prompt: '@[甲](a)与@[乙](b)，参考@[动作](motion)和@[声音](sound)',
      _uploads: [
        { id: 'a', type: 'image', url: 'https://example.com/a.png' },
        { id: 'b', type: 'image', url: 'https://example.com/a.png' },
        { id: 'motion', type: 'video', url: 'https://example.com/a.mp4' },
        { id: 'sound', type: 'audio', url: 'https://example.com/a.mp3' },
      ],
    } }], [])
    expect(result.images).toHaveLength(1)
    expect(result.prompt).toBe('@图片1与@图片1，参考@视频1和@音频1')
  })

  it('blocks stale references before a paid submission', () => {
    expect(() => prepareQilingReferences('v', [{ id: 'v', data: { prompt: '@[沈知意](deleted)是沈知意' } }], []))
      .toThrow('素材「沈知意」已失效')
  })

  it.each(['SD2.5-满血-CB-720P', 'SD2.5-满血-HN-720P'])('sends the complete bound prompt and exact media array for %s', async model => {
    const result = prepareQilingReferences('video', nodes, edges)
    const original = globalThis.fetch
    let body: any
    globalThis.fetch = (async (_url, init) => {
      body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ id: 'test_task' }), { status: 200 })
    }) as typeof fetch
    try {
      // Stand-in remote URL, matching the upload loop's in-place replacement.
      result.images[2] = 'https://example.com/scene.png'
      await new ChuhaiyingVideoProvider('sk-test', 'https://api.qilingze.com').createTask({
        model, prompt: result.prompt, image_urls: result.images,
      })
      expect(body.prompt).toBe(result.prompt)
      expect(body.images).toEqual(result.images)
      expect(body.prompt).toContain('@图片2是沈知意')
      expect(body.prompt).toContain('内容：沈知意端起茶杯，萧承渊看向她。')
      expect(body.prompt).not.toContain('node_woman')
    } finally { globalThis.fetch = original }
  })
})
