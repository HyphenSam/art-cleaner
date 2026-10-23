import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { crc32 } from 'node:zlib'
import optimisePng, { init as initOxipng } from '@jsquash/oxipng/optimise'
import decodePng, { init as initPng } from '@jsquash/png/decode'
import decodeWebp, { init as initWebpDec } from '@jsquash/webp/decode'
import encodeWebp, { init as initWebpEnc } from '@jsquash/webp/encode'
import { zlibSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { ascii, bytesOf, concat, pngChunks, riffChunks } from './containers'
import { embedIcc, readIcc } from './icc'
import type { Rgba } from './image'
import { rgba } from './testing'

/** Made-up profile bytes with an RGB ICC header; decoders don't check the rest. */
function profile(length: number, space = 'RGB '): Uint8Array {
  const p = Uint8Array.from({ length }, (_, i) => (i * 31 + 7) & 255)
  p.set(bytesOf(space), 16)
  p.set(bytesOf('acsp'), 36)
  return p
}

// Odd, so WebP's padding is exercised; long enough for three JPEG segments.
const ICC = profile(1001)
const LONG = profile(150_001)

const be16 = (v: number) => [v >> 8, v & 255]
const be32 = (v: number) => [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255]
const le32 = (v: number) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24]

/** A JPEG whose APP2 segments hold `icc`, written in `order` (1-based). */
function jpeg(icc: Uint8Array | null, order?: number[]) {
  const parts: Uint8Array[] = []
  if (icc) {
    const size = 65519
    const count = Math.ceil(icc.length / size)
    for (const seq of order ?? Array.from({ length: count }, (_, i) => i + 1)) {
      const data = icc.subarray((seq - 1) * size, seq * size)
      parts.push(
        new Uint8Array([0xff, 0xe2, ...be16(data.length + 16)]),
        bytesOf('ICC_PROFILE\0'),
        new Uint8Array([seq, count]),
        data,
      )
    }
  }
  return concat([
    new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0]),
    ...parts,
    new Uint8Array([0xff, 0xda, 0, 2, 1, 2, 3]),
  ])
}

const pngChunk = (type: string, data: Uint8Array) =>
  concat([new Uint8Array(be32(data.length)), bytesOf(type), data, new Uint8Array(4)])

function png(icc: Uint8Array | null, extra: Uint8Array[] = []) {
  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', new Uint8Array(13)),
    ...(icc ? [pngChunk('iCCP', concat([bytesOf('Display P3\0\0'), zlibSync(icc)]))] : []),
    ...extra,
    pngChunk('IDAT', new Uint8Array([1, 2, 3])),
    pngChunk('IEND', new Uint8Array()),
  ])
}

function webp(icc: Uint8Array | null) {
  const chunk = (fourcc: string, data: Uint8Array) =>
    concat([bytesOf(fourcc), new Uint8Array(le32(data.length)), data, new Uint8Array(data.length % 2)])
  const body = concat([
    bytesOf('WEBP'),
    chunk('VP8X', new Uint8Array(10)),
    ...(icc ? [chunk('ICCP', icc)] : []),
    chunk('VP8L', new Uint8Array([0x2f, 0, 0, 0, 0])),
  ])
  return concat([bytesOf('RIFF'), new Uint8Array(le32(body.length)), body])
}

describe('readIcc', () => {
  it("reads a JPEG's profile, in one segment or several in any order", () => {
    expect(readIcc(jpeg(ICC))).toEqual(ICC)
    expect(readIcc(jpeg(LONG))).toEqual(LONG)
    expect(readIcc(jpeg(LONG, [3, 1, 2]))).toEqual(LONG)
  })

  it("reads a PNG's iCCP and a WebP's ICCP", () => {
    expect(readIcc(png(ICC))).toEqual(ICC)
    expect(readIcc(webp(ICC))).toEqual(ICC)
  })

  it('is null without a profile', () => {
    expect(readIcc(jpeg(null))).toBeNull()
    expect(readIcc(png(null))).toBeNull()
    expect(readIcc(webp(null))).toBeNull()
  })

  it('is null for a JPEG missing a segment, truncated files and other formats', () => {
    expect(readIcc(jpeg(LONG, [1, 3]))).toBeNull()
    expect(readIcc(jpeg(ICC).subarray(0, 500))).toBeNull()
    expect(readIcc(png(ICC).subarray(0, 60))).toBeNull()
    expect(readIcc(webp(ICC).subarray(0, 300))).toBeNull()
    expect(readIcc(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull()
    expect(readIcc(new Uint8Array())).toBeNull()
  })

  it("is null for profiles that aren't RGB, since the result always is", () => {
    expect(readIcc(jpeg(profile(1001, 'CMYK')))).toBeNull()
    expect(readIcc(png(profile(1001, 'GRAY')))).toBeNull()
  })
})

// The real encoders, so embedIcc sees what libwebp and oxipng write.
const require = createRequire(import.meta.url)
const wasm = (pkg: string, file: string) => WebAssembly.compile(readFileSync(join(dirname(require.resolve(pkg)), file)))

beforeAll(async () => {
  // Node has no ImageData; the codecs only need its shape.
  globalThis.ImageData ??= class {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  } as unknown as typeof ImageData
  await initWebpEnc(await wasm('@jsquash/webp/encode', 'codec/enc/webp_enc_simd.wasm'))
  await initWebpDec(await wasm('@jsquash/webp/decode', 'codec/dec/webp_dec.wasm'))
  await initPng(await wasm('@jsquash/png/decode', 'codec/pkg/squoosh_png_bg.wasm'))
  await initOxipng(await wasm('@jsquash/oxipng/optimise', 'codec/pkg/squoosh_oxipng_bg.wasm'))
})

const opaque = rgba(37, 23, (x, y) => [x * 6, y * 11, (x ^ y) * 5, 255])
const alpha = rgba(37, 23, (x, y) => [x * 6, y * 11, 40, x * y])
const imageData = (image: Rgba) =>
  new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height)
const pixels = async (bytes: ArrayBuffer, decode: (b: ArrayBuffer) => Promise<ImageData>) =>
  Array.from((await decode(bytes)).data)

describe('embedIcc for WebP', () => {
  const shapes = [
    { name: 'lossy', image: opaque, lossless: false, kind: 'VP8 ' },
    { name: 'lossy with alpha', image: alpha, lossless: false, kind: 'VP8X' },
    { name: 'lossless', image: opaque, lossless: true, kind: 'VP8L' },
    { name: 'lossless with alpha', image: alpha, lossless: true, kind: 'VP8L' },
  ]

  for (const { name, image, lossless, kind } of shapes)
    it(`tags ${name} WebP without changing its pixels`, async () => {
      const plain = await encodeWebp(imageData(image), lossless ? { lossless: 1, exact: 1 } : { quality: 90, exact: 1 })
      expect(ascii(new Uint8Array(plain), 12, 4)).toBe(kind)

      const tagged = new Uint8Array(embedIcc(plain, lossless ? 'webp-lossless' : 'webp', ICC))
      expect(readIcc(tagged)).toEqual(ICC)
      const v = new DataView(tagged.buffer)
      expect(v.getUint32(4, true)).toBe(tagged.length - 8)

      const [vp8x] = riffChunks(tagged)
      expect(vp8x.fourcc).toBe('VP8X')
      const flags = vp8x.data[0]
      expect(flags & 0x20).toBe(0x20)
      expect(flags & 0x10).toBe(image === alpha ? 0x10 : 0)
      const u24 = (at: number) => vp8x.data[at] | (vp8x.data[at + 1] << 8) | (vp8x.data[at + 2] << 16)
      expect([u24(4) + 1, u24(7) + 1]).toEqual([37, 23])

      expect(await pixels(tagged.buffer, decodeWebp)).toEqual(await pixels(plain, decodeWebp))
    })

  it("refuses what isn't a WebP it can tag", () => {
    expect(() => embedIcc(png(null).buffer, 'webp', ICC)).toThrow()
    expect(() => embedIcc(bytesOf('RIFF\0\0\0\0WEBP').buffer, 'webp', ICC)).toThrow()
  })
})

describe('embedIcc for PNG', () => {
  for (const image of [opaque, alpha])
    it(`puts iCCP straight after IHDR, ${image === alpha ? 'with' : 'without'} alpha, pixels unchanged`, async () => {
      const plain = await optimisePng(imageData(image), { level: 2, interlace: false, optimiseAlpha: false })
      const tagged = new Uint8Array(embedIcc(plain, 'png', ICC))
      expect(readIcc(tagged)).toEqual(ICC)
      const types = [...pngChunks(tagged)].map((c) => c.type)
      expect(types.slice(0, 2)).toEqual(['IHDR', 'iCCP'])
      expect(await pixels(tagged.buffer, decodePng)).toEqual(await pixels(plain, decodePng))
    })

  it('writes correct CRCs and drops sRGB, which mustn’t sit beside iCCP', () => {
    const tagged = new Uint8Array(embedIcc(png(null, [pngChunk('sRGB', new Uint8Array([0]))]).buffer, 'png', ICC))
    const chunks = [...pngChunks(tagged)]
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'iCCP', 'IDAT', 'IEND'])
    const iccp = chunks[1].raw
    const stored = new DataView(iccp.buffer, iccp.byteOffset).getUint32(iccp.length - 4)
    expect(stored).toBe(crc32(iccp.subarray(4, iccp.length - 4)))
  })

  it("refuses what isn't a PNG", () => {
    expect(() => embedIcc(webp(null).buffer, 'png', ICC)).toThrow()
  })
})
