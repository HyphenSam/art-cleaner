import { describe, expect, it } from 'vitest'
import { outputName, uniqueNames } from './names'
import { DEFAULT_SETTINGS, type Settings } from './settings'

const BOTH: Settings = { ...DEFAULT_SETTINGS, denoise: true, clean: true }

describe('outputName', () => {
  it('names the result after the original and what was done', () => {
    expect(outputName('art.jpg', BOTH)).toBe('art-denoised-cleaned.png')
    expect(outputName('art.final.PNG', { ...BOTH, denoise: false, format: 'webp' })).toBe('art.final-cleaned.webp')
    expect(outputName('art', { ...BOTH, clean: false, format: 'webp-lossless' })).toBe('art-denoised.webp')
    expect(outputName('art.webp', { ...BOTH, keepUpscaled: true })).toBe('art-denoised-cleaned-2x.png')
  })

  it('ignores keeping the 2× size when not cleaning', () => {
    expect(outputName('a.png', { ...BOTH, clean: false, keepUpscaled: true })).toBe('a-denoised.png')
  })
})

describe('uniqueNames', () => {
  it('numbers repeated names so a zip keeps every file', () => {
    expect(uniqueNames(['a.png', 'b.png', 'a.png', 'a.png', 'A.png'])).toEqual([
      'a.png',
      'b.png',
      'a (2).png',
      'a (3).png',
      'A (4).png',
    ])
  })
})
