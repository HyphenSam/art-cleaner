/** Exact decoding and encoding with jSquash's WebAssembly codecs (a 2D
 * canvas would premultiply alpha and lose colour under transparent pixels). */
import decodeJpeg from '@jsquash/jpeg/decode'
import optimisePng from '@jsquash/oxipng/optimise'
import decodePng from '@jsquash/png/decode'
import decodeWebp from '@jsquash/webp/decode'
import encodeWebp from '@jsquash/webp/encode'
import type { Codecs, Decoded } from '@/lib/engine'
import { sniff } from '@/lib/formats'
import type { Rgba } from '@/lib/image'

/** libwebp's limit on either side. */
const WEBP_MAX = 16383

export const codecs: Codecs = {
  async decode(bytes, type): Promise<Decoded> {
    const buffer = bytes.slice().buffer
    const exact = sniff(bytes)
    if (exact) {
      const image =
        exact === 'png'
          ? await decodePng(buffer)
          : exact === 'jpeg'
            ? await decodeJpeg(buffer)
            : await decodeWebp(buffer)
      return { image: { width: image.width, height: image.height, data: image.data }, upright: false }
    }
    // Anything else (AVIF, GIF, BMP…) through the browser, which turns it upright.
    const bitmap = await createImageBitmap(new Blob([buffer], { type }), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
      imageOrientation: 'from-image',
    })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const data = context.getImageData(0, 0, canvas.width, canvas.height)
    return { image: { width: data.width, height: data.height, data: data.data }, upright: true }
  },

  async encode(image: Rgba, format, quality) {
    const data = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
    if (format === 'png') return optimisePng(data, { level: 2, interlace: false, optimiseAlpha: false })
    if (image.width > WEBP_MAX || image.height > WEBP_MAX) {
      throw new Error(`WebP can't be larger than ${WEBP_MAX} px on a side; choose PNG for this image.`)
    }
    // `exact` keeps the colour under transparent pixels; sharp YUV keeps thin
    // coloured lines from bleeding in lossy WebP's chroma.
    if (format === 'webp-lossless') return encodeWebp(data, { lossless: 1, exact: 1, quality: 75, method: 4 })
    return encodeWebp(data, { quality, method: 4, use_sharp_yuv: 1, exact: 1 })
  },
}
