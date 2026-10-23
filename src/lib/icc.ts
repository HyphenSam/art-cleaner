/** ICC colour profiles. The decoders return the stored values and ignore the
 * profile, and the encoders write none, so a result would show a Display P3
 * original's values as sRGB: washed out. The original's profile is copied
 * into the result unchanged, with no colour conversion. */
import { unzlibSync, zlibSync } from 'fflate'
import { ascii, bytesOf, concat, jpegSegments, pngChunks, riffChunks, view } from './containers'
import { sniff } from './formats'
import type { OutputFormat } from './settings'

/** The embedded RGB profile of a JPEG, PNG or WebP file; null if it has none. */
export function readIcc(bytes: Uint8Array): Uint8Array | null {
  try {
    const icc = profileIn(bytes)
    // The result is always RGB; a CMYK or grey profile wouldn't describe it.
    return icc && ascii(icc, 16, 4) === 'RGB ' ? icc : null
  } catch {
    // Truncated or malformed: no profile.
    return null
  }
}

function profileIn(b: Uint8Array): Uint8Array | null {
  const format = sniff(b)
  if (format === 'jpeg') {
    // A profile over ~64 KB is split across APP2 segments, numbered from 1.
    const parts: Uint8Array[] = []
    let count = 0
    for (const { marker, data } of jpegSegments(b)) {
      if (marker !== 0xe2 || ascii(data, 0, 12) !== 'ICC_PROFILE\0') continue
      parts[data[12] - 1] = data.subarray(14)
      count = data[13]
    }
    const ordered = Array.from({ length: count }, (_, i) => parts[i])
    return count && ordered.every(Boolean) ? concat(ordered) : null
  }
  if (format === 'png') {
    for (const { type, data } of pngChunks(b)) {
      if (type !== 'iCCP') continue
      // A name of 1–79 bytes, a NUL, compression method 0, then zlib data.
      const nul = data.indexOf(0)
      return nul >= 1 && nul <= 79 && data[nul + 1] === 0 ? unzlibSync(data.subarray(nul + 2)) : null
    }
  }
  if (format === 'webp') {
    for (const { fourcc, data } of riffChunks(b)) if (fourcc === 'ICCP') return data.slice()
  }
  return null
}

/** `encoded`, as the codecs wrote it, carrying `icc`. */
export function embedIcc(encoded: ArrayBuffer, format: OutputFormat, icc: Uint8Array): ArrayBuffer {
  const b = new Uint8Array(encoded)
  const out = format === 'png' ? pngWithIcc(b, icc) : webpWithIcc(b, icc)
  return out.buffer
}

function pngWithIcc(b: Uint8Array, icc: Uint8Array): Uint8Array<ArrayBuffer> {
  if (sniff(b) !== 'png') throw new Error("Can't add the colour profile: not a PNG.")
  const data = concat([bytesOf('ICC Profile\0\0'), zlibSync(icc)])
  const type = bytesOf('iCCP')
  const crc = new Uint8Array(4)
  view(crc).setUint32(0, crc32(concat([type, data])))
  const length = new Uint8Array(4)
  view(length).setUint32(0, data.length)
  const iccp = concat([length, type, data, crc])

  const parts = [b.subarray(0, 8)]
  for (const { type, raw } of pngChunks(b)) {
    // The PNG spec says not to have sRGB beside iCCP.
    if (type === 'sRGB' || type === 'iCCP') continue
    parts.push(raw)
    // iCCP must come before PLTE and IDAT.
    if (type === 'IHDR') parts.push(iccp)
  }
  if (parts[2] !== iccp) throw new Error("Can't add the colour profile: the PNG doesn't start with IHDR.")
  return concat(parts)
}

const ICC_FLAG = 0x20
const ALPHA_FLAG = 0x10

/** A port of Kura's `with_icc`: libwebp writes simple lossy (`VP8 `),
 * lossless (`VP8L`) or, for lossy with alpha, extended (`VP8X`) files. */
function webpWithIcc(b: Uint8Array, icc: Uint8Array): Uint8Array<ArrayBuffer> {
  const bad = () => new Error("Can't add the colour profile: not a still WebP.")
  if (sniff(b) !== 'webp' || b.length < 20) throw bad()
  const kind = ascii(b, 12, 4)
  const payload = view(b.subarray(20))
  let head: Uint8Array
  let rest: Uint8Array
  if (kind === 'VP8X') {
    if (b.length < 30) throw bad()
    head = b.slice(12, 30)
    head[8] |= ICC_FLAG
    rest = b.subarray(30)
  } else if (kind === 'VP8 ' || kind === 'VP8L') {
    // Size and alpha come from the bitstream, not the image: libwebp drops
    // the alpha of an RGBA image that's fully opaque.
    let width: number, height: number, alpha: boolean
    if (kind === 'VP8 ') {
      // After the frame tag and start code: 14-bit width and height.
      width = payload.getUint16(6, true) & 0x3fff
      height = payload.getUint16(8, true) & 0x3fff
      alpha = false
    } else {
      // After the signature byte: width−1, height−1 (14 bits each), alpha.
      const bits = payload.getUint32(1, true)
      width = (bits & 0x3fff) + 1
      height = ((bits >>> 14) & 0x3fff) + 1
      alpha = ((bits >>> 28) & 1) === 1
    }
    const header = new Uint8Array(10)
    header[0] = ICC_FLAG | (alpha ? ALPHA_FLAG : 0)
    const u24 = (at: number, v: number) => header.set([v & 255, (v >> 8) & 255, (v >> 16) & 255], at)
    u24(4, width - 1)
    u24(7, height - 1)
    head = riffChunk('VP8X', header)
    rest = b.subarray(12)
  } else throw bad()
  const out = concat([bytesOf('RIFF\0\0\0\0WEBP'), head, riffChunk('ICCP', icc), rest])
  view(out).setUint32(4, out.length - 8, true)
  return out
}

/** A RIFF chunk, padded to an even length. */
function riffChunk(fourcc: string, data: Uint8Array): Uint8Array {
  const size = new Uint8Array(4)
  view(size).setUint32(0, data.length, true)
  return concat([bytesOf(fourcc), size, data, new Uint8Array(data.length % 2)])
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of b) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
