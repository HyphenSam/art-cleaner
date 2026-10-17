/** Denoise and clean: the steps over a decoded image, with the models
 * behind an interface so tests run without ONNX Runtime. Ported from Kura's
 * `enhance/mod.rs`. */
import { hasAlpha, type Rgba, toPlanes, writeRows } from './image'
import { LanczosStream, resizePlanes } from './lanczos'
import { batchCount, ensemble, estimateSigma, GAINS, processTiled, processTiledToPlanes, type Tiling } from './tiles'

export type Steps = {
  /** Removes adversarial noise. `passes` runs it again over its own output;
   * `maxQuality` averages 24 rotated, flipped and brightened runs. `batch`
   * is tiles per model run (`DENOISE_TILING`'s unless the model needs less
   * memory). */
  denoise?: { passes: number; maxQuality: boolean; batch?: number }
  /** Removes JPEG artefacts: 2× with AnimeSharp, then back to the original
   * size with Lanczos3 unless `keepUpscaled`. Always after denoising. */
  clean?: { keepUpscaled: boolean }
}

/** Both take and return `[n, 3, size, size]` tiles (the upscaler returns
 * `2·size`). */
export interface Models {
  denoise(tiles: Float32Array, n: number, size: number, sigma: number): Promise<Float32Array>
  upscale(tiles: Float32Array, n: number, size: number): Promise<Float32Array>
}

export const DENOISE_TILING: Tiling = { tile: 256, overlap: 48, scale: 1, batch: 8 }
/** Batching doesn't speed the upscaler up on WebGPU and multiplies its memory. */
export const CLEAN_TILING: Tiling = { tile: 256, overlap: 32, scale: 2, batch: 1 }

const denoiseTiling = ({ batch }: { batch?: number }): Tiling => ({
  ...DENOISE_TILING,
  batch: batch ?? DENOISE_TILING.batch,
})

/** How many model runs `apply` makes, for progress. */
export function modelRuns(width: number, height: number, steps: Steps): number {
  let runs = 0
  if (steps.denoise) {
    const perBatch = steps.denoise.maxQuality ? 8 * GAINS.length : 1
    runs += steps.denoise.passes * perBatch * batchCount(width, height, denoiseTiling(steps.denoise))
  }
  if (steps.clean) runs += batchCount(width, height, CLEAN_TILING)
  return runs
}

/** Runs the steps over the image. `progress` is called after every model
 * run and stops the work by throwing. Alpha is kept as it was. */
export async function apply(
  image: Rgba,
  steps: Steps,
  models: Models,
  progress: () => void | Promise<void>,
): Promise<Rgba> {
  const { width, height } = image
  let rgb = toPlanes(image)
  // Estimated once, on the original (GRDDenoiser doesn't re-estimate).
  const sigma = estimateSigma(rgb)
  const size = DENOISE_TILING.tile

  if (steps.denoise) {
    const denoise = async (tiles: Float32Array, n: number) => {
      const out = await models.denoise(tiles, n, size, sigma)
      await progress()
      return out
    }
    const run = steps.denoise.maxQuality ? (t: Float32Array, n: number) => ensemble(t, n, size, denoise) : denoise
    const tiling = denoiseTiling(steps.denoise)
    for (let pass = 0; pass < steps.denoise.passes; pass++) rgb = await processTiledToPlanes(rgb, tiling, run)
  }

  if (!steps.clean) {
    const out: Rgba = { width, height, data: image.data.slice() }
    writeRows(rgb, out, 0)
    return out
  }

  const scale = steps.clean.keepUpscaled ? 2 : 1
  const out: Rgba = {
    width: width * scale,
    height: height * scale,
    data: new Uint8ClampedArray(4 * width * height * scale * scale),
  }
  setAlpha(image, out)
  const upscale = async (tiles: Float32Array, n: number) => {
    const result = await models.upscale(tiles, n, CLEAN_TILING.tile)
    await progress()
    return result
  }
  // The upscaled rows stream through, so the 2× image is never held whole.
  const lanczos = new LanczosStream(3, 2 * width, 2 * height, width, height, (row, y) => {
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++) out.data[4 * (y * width + x) + c] = Math.round(row[c * width + x] * 255)
  })
  await processTiled(rgb, CLEAN_TILING, upscale, (band, y0) => {
    // 8 bits before resizing, as Kura does.
    for (let i = 0; i < band.data.length; i++)
      band.data[i] = Math.round(Math.min(Math.max(band.data[i], 0), 1) * 255) / 255
    if (scale === 2) writeRows(band, out, y0)
    else lanczos.push(band.data, band.height)
  })
  return out
}

/** The original's alpha in `out`, resized with Lanczos3 if `out` is bigger. */
function setAlpha(image: Rgba, out: Rgba) {
  const pixels = out.width * out.height
  if (!hasAlpha(image)) {
    for (let i = 0; i < pixels; i++) out.data[4 * i + 3] = 255
    return
  }
  const source = new Float32Array(image.width * image.height)
  for (let i = 0; i < source.length; i++) source[i] = image.data[4 * i + 3] / 255
  const alpha =
    out.width === image.width ? source : resizePlanes(source, 1, image.width, image.height, out.width, out.height)
  for (let i = 0; i < pixels; i++) out.data[4 * i + 3] = Math.round(alpha[i] * 255)
}
