import { describe, expect, it } from 'vitest'
import { orient, readOrientation } from './orientation'
import { rgba } from './testing'

/** A TIFF block holding only an Orientation tag. */
function tiff(orientation: number, little = true): number[] {
  const u16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255])
  const u32 = (v: number) =>
    little ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24] : [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]
  return [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(8),
    ...u16(1), // one entry
    ...u16(0x0112),
    ...u16(3), // SHORT
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u32(0),
  ]
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))
const be32 = (v: number) => [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]
const le32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]

function jpeg(orientation: number, little = true): Uint8Array {
  const exif = [...ascii('Exif'), 0, 0, ...tiff(orientation, little)]
  const app0 = [0xff, 0xe0, 0, 4, 0, 0]
  const app1 = [0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif]
  return new Uint8Array([0xff, 0xd8, ...app0, ...app1, 0xff, 0xda, 0, 2, 1, 2, 3])
}

function png(orientation: number): Uint8Array {
  const chunk = (type: string, data: number[]) => [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', new Array(13).fill(0)),
    ...chunk('eXIf', tiff(orientation, false)),
    ...chunk('IDAT', [1, 2, 3]),
    ...chunk('IEND', []),
  ])
}

function webp(orientation: number, prefixed = false): Uint8Array {
  const exif = [...(prefixed ? [...ascii('Exif'), 0, 0] : []), ...tiff(orientation)]
  const padded = exif.length % 2 ? [...exif, 0] : exif
  const body = [
    ...ascii('WEBP'),
    ...ascii('VP8X'),
    ...le32(10),
    ...new Array(10).fill(0),
    ...ascii('EXIF'),
    ...le32(exif.length),
    ...padded,
  ]
  return new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body])
}

describe('readOrientation', () => {
  it('reads it from a JPEG, either byte order', () => {
    expect(readOrientation(jpeg(6))).toBe(6)
    expect(readOrientation(jpeg(8, false))).toBe(8)
  })

  it("reads it from a PNG's eXIf chunk", () => {
    expect(readOrientation(png(3))).toBe(3)
  })

  it("reads it from a WebP's EXIF chunk, with or without the Exif prefix", () => {
    expect(readOrientation(webp(5))).toBe(5)
    expect(readOrientation(webp(7, true))).toBe(7)
  })

  it('is 1 without EXIF, for nonsense, and for values out of range', () => {
    expect(readOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1)
    expect(readOrientation(new Uint8Array([1, 2, 3]))).toBe(1)
    expect(readOrientation(jpeg(9))).toBe(1)
    expect(readOrientation(jpeg(6).slice(0, 20))).toBe(1)
  })
})

describe('orient', () => {
  // 3×2, each pixel's red is its index:
  // 0 1 2
  // 3 4 5
  const image = rgba(3, 2, (x, y) => [y * 3 + x, 0, 0, 255])
  const reds = (o: number) => {
    const out = orient(image, o)
    return {
      size: [out.width, out.height],
      reds: Array.from({ length: out.width * out.height }, (_, i) => out.data[4 * i]),
    }
  }

  it('leaves 1 alone', () => {
    expect(reds(1)).toEqual({ size: [3, 2], reds: [0, 1, 2, 3, 4, 5] })
  })

  it('mirrors and turns half way', () => {
    expect(reds(2)).toEqual({ size: [3, 2], reds: [2, 1, 0, 5, 4, 3] })
    expect(reds(3)).toEqual({ size: [3, 2], reds: [5, 4, 3, 2, 1, 0] })
    expect(reds(4)).toEqual({ size: [3, 2], reds: [3, 4, 5, 0, 1, 2] })
  })

  it('turns a quarter: 6 clockwise, 8 anticlockwise', () => {
    expect(reds(6)).toEqual({ size: [2, 3], reds: [3, 0, 4, 1, 5, 2] })
    expect(reds(8)).toEqual({ size: [2, 3], reds: [2, 5, 1, 4, 0, 3] })
  })

  it('transposes for 5 and 7', () => {
    expect(reds(5)).toEqual({ size: [2, 3], reds: [0, 3, 1, 4, 2, 5] })
    expect(reds(7)).toEqual({ size: [2, 3], reds: [5, 2, 4, 1, 3, 0] })
  })

  it('works on pixels that start at any byte offset', () => {
    const buffer = new Uint8ClampedArray(1 + image.data.length)
    buffer.set(image.data, 1)
    const out = orient({ width: 3, height: 2, data: buffer.subarray(1) }, 6)
    expect(Array.from({ length: 6 }, (_, i) => out.data[4 * i])).toEqual([3, 0, 4, 1, 5, 2])
  })
})
