import { describe, expect, it } from 'vitest'
import { isImageFile, sniff } from './formats'

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

describe('sniff', () => {
  it('recognises PNG, JPEG and WebP by their first bytes', () => {
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png')
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(sniff(new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBPVP8L')]))).toBe('webp')
  })

  it('leaves anything else to the browser', () => {
    expect(sniff(new Uint8Array([...ascii('GIF89a')]))).toBe(null)
    expect(sniff(new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')]))).toBe(null)
    expect(sniff(new Uint8Array([]))).toBe(null)
  })
})

describe('isImageFile', () => {
  it('accepts image types, and image extensions when the type is missing', () => {
    expect(isImageFile('a.png', 'image/png')).toBe(true)
    expect(isImageFile('a.avif', '')).toBe(true)
    expect(isImageFile('a.JPEG', '')).toBe(true)
    expect(isImageFile('a.txt', 'text/plain')).toBe(false)
    expect(isImageFile('a.svg', 'image/svg+xml')).toBe(false)
    expect(isImageFile('a', '')).toBe(false)
  })
})
