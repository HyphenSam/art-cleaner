/** The blocks of JPEG, PNG and WebP files, for the metadata the decoders
 * ignore (EXIF orientation, ICC profiles). Each walk stops at a block that
 * runs past the end of the file. */

export const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)
export const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n))
export const bytesOf = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

export function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** A JPEG's marker segments before the image data. */
export function* jpegSegments(b: Uint8Array): Generator<{ marker: number; data: Uint8Array }> {
  const v = view(b)
  let at = 2
  while (at + 4 <= b.length && b[at] === 0xff) {
    const marker = b[at + 1]
    if (marker === 0xda) return // image data: no more headers
    const end = at + 2 + v.getUint16(at + 2)
    if (end > b.length) return
    yield { marker, data: b.subarray(at + 4, end) }
    at = end
  }
}

/** A PNG's chunks up to and including IEND; `raw` is the whole chunk, CRC and all. */
export function* pngChunks(b: Uint8Array): Generator<{ type: string; data: Uint8Array; raw: Uint8Array }> {
  const v = view(b)
  let at = 8
  while (at + 12 <= b.length) {
    const end = at + 12 + v.getUint32(at)
    if (end > b.length) return
    const type = ascii(b, at + 4, 4)
    yield { type, data: b.subarray(at + 8, end - 4), raw: b.subarray(at, end) }
    if (type === 'IEND') return
    at = end
  }
}

/** A WebP's RIFF chunks. */
export function* riffChunks(b: Uint8Array): Generator<{ fourcc: string; data: Uint8Array }> {
  const v = view(b)
  let at = 12
  while (at + 8 <= b.length) {
    const end = at + 8 + v.getUint32(at + 4, true)
    if (end > b.length) return
    yield { fourcc: ascii(b, at, 4), data: b.subarray(at + 8, end) }
    at = end + ((end - at) % 2)
  }
}
