/** Test doubles for the models: an identity denoiser and a nearest-neighbour
 * 2× upscaler that record their calls. */
import type { Models } from './pipeline'
import type { Rgba } from './image'

export class FakeModels implements Models {
  calls: ('denoise' | 'upscale')[] = []
  sigmas: number[] = []

  async denoise(tiles: Float32Array, n: number, size: number, sigma: number) {
    if (tiles.length !== n * 3 * size * size) throw new Error('wrong tile buffer')
    this.calls.push('denoise')
    this.sigmas.push(sigma)
    return tiles.slice()
  }

  async upscale(tiles: Float32Array, n: number, size: number) {
    this.calls.push('upscale')
    const big = size * 2
    const out = new Float32Array(n * 3 * big * big)
    for (let t = 0; t < n * 3; t++)
      for (let y = 0; y < big; y++)
        for (let x = 0; x < big; x++) out[(t * big + y) * big + x] = tiles[(t * size + (y >> 1)) * size + (x >> 1)]
    return out
  }
}

export function rgba(
  width: number,
  height: number,
  f: (x: number, y: number) => [number, number, number, number],
): Rgba {
  const data = new Uint8ClampedArray(4 * width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(f(x, y), 4 * (y * width + x))
  return { width, height, data }
}

/** Busy, opaque. */
export const photo = (width: number, height: number) =>
  rgba(width, height, (x, y) => [(x * 3 + y) & 255, (y * 5) & 255, ((x ^ y) * 7) & 255, 255])

/** Gentle gradients, opaque. */
export const smooth = (width: number, height: number) =>
  rgba(width, height, (x, y) => [(x >> 1) & 255, (y >> 1) & 255, 128, 255])
