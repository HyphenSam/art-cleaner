import { type Planes, planes } from './tiles'

/** Decoded pixels, RGBA interleaved, straight (not premultiplied) alpha. */
export type Rgba = { width: number; height: number; data: Uint8ClampedArray }

/** The image's RGB as the models take it. */
export function toPlanes(image: Rgba): Planes {
  const out = planes(image.width, image.height)
  const plane = image.width * image.height
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) out.data[c * plane + i] = image.data[4 * i + c] / 255
  return out
}

/** Clamps to 0–1 and rounds to 8 bits, into `target`'s RGB from row `y0`. */
export function writeRows(rows: Planes, target: Rgba, y0: number) {
  const { width, height, data } = rows
  const plane = width * height
  const offset = y0 * width
  for (let i = 0; i < plane; i++)
    for (let c = 0; c < 3; c++) target.data[4 * (offset + i) + c] = Math.round(data[c * plane + i] * 255)
}

export function hasAlpha(image: Rgba): boolean {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] !== 255) return true
  return false
}
