import { describe, expect, it } from 'vitest'
import { formatBytes } from './format-bytes'

describe('formatBytes', () => {
  it('uses decimal units, as download UIs do', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2_400)).toBe('2 kB')
    expect(formatBytes(38_978_681)).toBe('39.0 MB')
    expect(formatBytes(1_000_000)).toBe('1.0 MB')
  })
})
