import { describe, expect, it } from 'vitest'
import { outputName, uniqueNames } from './names'
import { DEFAULT_SETTINGS } from './settings'

describe('outputName', () => {
  it('names the result after the original and what was done', () => {
    expect(outputName('art.jpg', DEFAULT_SETTINGS)).toBe('art-denoised-cleaned.png')
    expect(outputName('art.final.PNG', { ...DEFAULT_SETTINGS, denoise: false, format: 'webp' })).toBe(
      'art.final-cleaned.webp',
    )
    expect(outputName('art', { ...DEFAULT_SETTINGS, clean: false, format: 'webp-lossless' })).toBe('art-denoised.webp')
    expect(outputName('art.webp', { ...DEFAULT_SETTINGS, keepUpscaled: true })).toBe('art-denoised-cleaned-2x.png')
  })

  it('ignores keeping the 2× size when not cleaning', () => {
    expect(outputName('a.png', { ...DEFAULT_SETTINGS, clean: false, keepUpscaled: true })).toBe('a-denoised.png')
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
