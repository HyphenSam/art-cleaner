/** EXIF orientation: the WebAssembly decoders return pixels as stored, so
 * the app turns them upright itself (browsers do it when showing the file). */
import type { Rgba } from './image'

/** The EXIF Orientation (1–8) of a JPEG, PNG or WebP file; 1 if it has none. */
export function readOrientation(bytes: Uint8Array): number {
  try {
    const tiff = exifBlock(bytes)
    return tiff ? orientationIn(tiff) : 1
  } catch {
    // Truncated or malformed: show it as stored.
    return 1
  }
}

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)
const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n))

/** The TIFF block that holds the EXIF tags, if any. */
function exifBlock(b: Uint8Array): Uint8Array | null {
  const v = view(b)
  if (b[0] === 0xff && b[1] === 0xd8) {
    let at = 2
    while (at + 4 <= b.length && b[at] === 0xff) {
      const marker = b[at + 1]
      if (marker === 0xda) return null // image data: no more headers
      const length = v.getUint16(at + 2)
      if (marker === 0xe1 && ascii(b, at + 4, 4) === 'Exif') return b.subarray(at + 10, at + 2 + length)
      at += 2 + length
    }
    return null
  }
  if (ascii(b, 1, 3) === 'PNG') {
    let at = 8
    while (at + 8 <= b.length) {
      const length = v.getUint32(at)
      const type = ascii(b, at + 4, 4)
      if (type === 'eXIf') return b.subarray(at + 8, at + 8 + length)
      if (type === 'IEND') return null
      at += 12 + length
    }
    return null
  }
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    let at = 12
    while (at + 8 <= b.length) {
      const length = v.getUint32(at + 4, true)
      if (ascii(b, at, 4) === 'EXIF') {
        const data = b.subarray(at + 8, at + 8 + length)
        return ascii(data, 0, 4) === 'Exif' ? data.subarray(6) : data
      }
      at += 8 + length + (length % 2)
    }
  }
  return null
}

function orientationIn(tiff: Uint8Array): number {
  const v = view(tiff)
  const little = ascii(tiff, 0, 2) === 'II'
  if (!little && ascii(tiff, 0, 2) !== 'MM') return 1
  const ifd = v.getUint32(4, little)
  const entries = v.getUint16(ifd, little)
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + 12 * i
    if (v.getUint16(entry, little) === 0x0112) {
      const value = v.getUint16(entry + 8, little)
      return value >= 1 && value <= 8 ? value : 1
    }
  }
  return 1
}

/** The image turned and mirrored upright for EXIF `orientation`. */
export function orient(image: Rgba, orientation: number): Rgba {
  if (orientation === 1) return image
  const { width: w, height: h } = image
  const swap = orientation >= 5
  const [ow, oh] = swap ? [h, w] : [w, h]
  // The source pixel of output pixel (x, y).
  const source: Record<number, (x: number, y: number) => [number, number]> = {
    2: (x, y) => [w - 1 - x, y],
    3: (x, y) => [w - 1 - x, h - 1 - y],
    4: (x, y) => [x, h - 1 - y],
    5: (x, y) => [y, x],
    6: (x, y) => [y, h - 1 - x],
    7: (x, y) => [w - 1 - y, h - 1 - x],
    8: (x, y) => [w - 1 - y, x],
  }
  const from = source[orientation]
  if (!from) return image
  const data = new Uint8ClampedArray(image.data.length)
  // Whole pixels at a time; a Uint32Array view needs a 4-byte aligned start.
  const bytes = image.data.byteOffset % 4 ? image.data.slice() : image.data
  const pixels = new Uint32Array(bytes.buffer, bytes.byteOffset, w * h)
  const out = new Uint32Array(data.buffer)
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      const [sx, sy] = from(x, y)
      out[y * ow + x] = pixels[sy * w + sx]
    }
  return { width: ow, height: oh, data }
}
