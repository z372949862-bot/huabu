import { describe, it, expect } from 'vitest'
import { classifyHttpError } from '../providers/_httpUtils'

describe('classifyHttpError', () => {
  it('401 → API Key 无效或已过期', () => {
    expect(classifyHttpError(401, 'unauthorized')).toContain('API Key')
  })
  it('429 → 限流提示', () => {
    expect(classifyHttpError(429, 'rate limited')).toContain('限流')
  })
  it('524 → 网关超时', () => {
    expect(classifyHttpError(524, 'origin timeout')).toContain('524')
  })
  it('500 → 网关错误带 detail', () => {
    const out = classifyHttpError(500, 'oops')
    expect(out).toContain('500')
    expect(out).toContain('oops')
  })
  it('400 → 通用失败带 detail', () => {
    const out = classifyHttpError(400, 'bad params')
    expect(out).toContain('400')
    expect(out).toContain('bad params')
  })
})
