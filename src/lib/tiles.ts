/** The image maths around the models, kept pure: the noise estimate, cutting
 * an image into overlapping tiles, blending the model's tiles back together,
 * and the "maximum quality" ensemble. Ported from Kura's `tiles.rs`. */

/** An RGB image as the models take it: values 0–1, one plane per channel
 * (`[r…, g…, b…]`, each `width × height`, row by row). */
export type Planes = { width: number; height: number; data: Float32Array }

export function planes(width: number, height: number): Planes {
  return { width, height, data: new Float32Array(3 * width * height) }
}

export function at(image: Planes, channel: number, y: number, x: number): number {
  return image.data[(channel * image.height + y) * image.width + x]
}

/** A model over a batch of tiles: gets `[n, 3, size, size]` and the tile
 * count `n`, returns the model's output for them. */
export type RunTiles = (tiles: Float32Array, n: number) => Promise<Float32Array>

/** Gets finished output rows, in order: `rows` holds output rows
 * `y0 … y0 + rows.height - 1`. */
export type RowSink = (rows: Planes, y0: number) => void | Promise<void>

/** How an image is cut up for a model. */
export type Tiling = {
  /** Input tile side, in pixels. */
  tile: number
  /** How much neighbouring tiles share. */
  overlap: number
  /** Output pixels per input pixel (2 for the upscaler). */
  scale: number
  /** Most tiles per model run. Batches stay within a row of tiles. */
  batch: number
}

/** The noise level of an image, for the denoiser's `sigma` input: the
 * median absolute Laplacian of its luma / 0.6745 (GRDDenoiser's estimate),
 * 25/255 when that comes out as nothing, clamped to 0.0005–1. */
export function estimateSigma(image: Planes): number {
  const { width: w, height: h, data } = image
  const plane = w * h
  const luma = new Float32Array(plane)
  for (let i = 0; i < plane; i++) luma[i] = 0.2989 * data[i] + 0.587 * data[plane + i] + 0.114 * data[2 * plane + i]
  // Zero padding outside the image, as torch's conv2d(padding=1).
  const response = new Float32Array(plane)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const up = y > 0 ? luma[i - w] : 0
      const down = y < h - 1 ? luma[i + w] : 0
      const left = x > 0 ? luma[i - 1] : 0
      const right = x < w - 1 ? luma[i + 1] : 0
      response[i] = Math.abs(up + down + left + right - 4 * luma[i])
    }
  }
  // torch's median takes the lower middle value.
  const sigma = select(response, (plane - 1) >> 1) / 0.6745
  const value = Number.isFinite(sigma) && sigma > 0 ? sigma : 25 / 255
  return Math.min(Math.max(value, 0.0005), 1)
}

/** The `k`th smallest value (0-based). Reorders `values`. */
function select(values: Float32Array, k: number): number {
  let lo = 0
  let hi = values.length - 1
  while (lo < hi) {
    const pivot = values[(lo + hi) >> 1]
    let i = lo
    let j = hi
    while (i <= j) {
      while (values[i] < pivot) i++
      while (values[j] > pivot) j--
      if (i <= j) {
        const t = values[i]
        values[i] = values[j]
        values[j] = t
        i++
        j--
      }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else break
  }
  return values[k]
}

/** Mirrors an index past the end of `0..n` back into it without repeating
 * the edge pixel (`…, n-2, n-1, n-2, …`), however far past it is. */
export function mirror(i: number, n: number): number {
  if (n === 1) return 0
  const m = i % (2 * (n - 1))
  return m < n ? m : 2 * (n - 1) - m
}

/** Where tiles start along one axis, and the padded length they cover. */
export function tileStarts(size: number, tiling: Tiling): { starts: number[]; padded: number } {
  const stride = tiling.tile - tiling.overlap
  const count = Math.max(1, Math.ceil(Math.max(0, size - tiling.overlap) / stride))
  return { starts: Array.from({ length: count }, (_, i) => i * stride), padded: stride * (count - 1) + tiling.tile }
}

/** How many tiles an image is cut into. */
export function tileCount(width: number, height: number, tiling: Tiling): number {
  return tileStarts(width, tiling).starts.length * tileStarts(height, tiling).starts.length
}

/** How many model runs `processTiled` makes. */
export function batchCount(width: number, height: number, tiling: Tiling): number {
  const across = tileStarts(width, tiling).starts.length
  return tileStarts(height, tiling).starts.length * Math.ceil(across / tiling.batch)
}

/** A Hann window of `n` weights, never quite 0, so a pixel only one tile's
 * edge covers still gets a weight (GRDDenoiser's tool left those black). */
export function hannWindow(n: number): Float32Array {
  const last = Math.max(n, 2) - 1
  return Float32Array.from({ length: n }, (_, i) => Math.max(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / last), 1e-3))
}

/** Runs `run` over the image's tiles and blends what it returns into one
 * image `scale` times the size, handing each band of finished rows to
 * `sink` as soon as no later tile touches it, so only one row of tiles is
 * ever held. Edges are padded by mirroring. */
export async function processTiled(image: Planes, tiling: Tiling, run: RunTiles, sink: RowSink): Promise<void> {
  const { width: w, height: h } = image
  const { tile: t, scale: s } = tiling
  const xs = tileStarts(w, tiling).starts
  const ys = tileStarts(h, tiling).starts
  const [ow, oh, ot] = [w * s, h * s, t * s]
  const edge = hannWindow(ot)
  // Sums for the output rows the current row of tiles covers, from `base`.
  const sum = new Float32Array(3 * ot * ow)
  const weights = new Float32Array(ot * ow)
  let base = 0
  for (let r = 0; r < ys.length; r++) {
    const y0 = ys[r] * s
    shiftRows(sum, weights, ot, ow, y0 - base)
    base = y0
    const rows = Math.min(ot, oh - y0)
    for (let b = 0; b < xs.length; b += tiling.batch) {
      const batch = xs.slice(b, b + tiling.batch)
      const input = new Float32Array(batch.length * 3 * t * t)
      batch.forEach((x0, i) => {
        for (let c = 0; c < 3; c++) {
          for (let ty = 0; ty < t; ty++) {
            const source = (c * h + mirror(ys[r] + ty, h)) * w
            const target = ((i * 3 + c) * t + ty) * t
            for (let tx = 0; tx < t; tx++) input[target + tx] = image.data[source + mirror(x0 + tx, w)]
          }
        }
      })
      const output = await run(input, batch.length)
      batch.forEach((x0, i) => {
        const left = x0 * s
        // Only the part inside the image; the padding is cropped off.
        const cols = Math.min(ot, ow - left)
        for (let ty = 0; ty < rows; ty++) {
          for (let tx = 0; tx < cols; tx++) {
            const weight = edge[ty] * edge[tx]
            weights[ty * ow + left + tx] += weight
            for (let c = 0; c < 3; c++)
              sum[(c * ot + ty) * ow + left + tx] += output[((i * 3 + c) * ot + ty) * ot + tx] * weight
          }
        }
      })
    }
    // Rows above the next row of tiles are finished.
    const done = (r + 1 < ys.length ? ys[r + 1] * s : oh) - y0
    const band = planes(ow, done)
    for (let c = 0; c < 3; c++)
      for (let i = 0; i < done * ow; i++) band.data[c * done * ow + i] = sum[c * ot * ow + i] / weights[i]
    await sink(band, y0)
  }
}

/** Drops the first `by` rows of the sums, moving the rest up. */
function shiftRows(sum: Float32Array, weights: Float32Array, rows: number, width: number, by: number) {
  if (by <= 0) return
  const kept = Math.max(0, rows - by) * width
  for (let c = 0; c < 3; c++) {
    const start = c * rows * width
    sum.copyWithin(start, start + by * width, start + rows * width)
    sum.fill(0, start + kept, start + rows * width)
  }
  weights.copyWithin(0, by * width, rows * width)
  weights.fill(0, kept)
}

/** `processTiled` collected into one image. */
export async function processTiledToPlanes(image: Planes, tiling: Tiling, run: RunTiles): Promise<Planes> {
  const out = planes(image.width * tiling.scale, image.height * tiling.scale)
  const plane = out.width * out.height
  await processTiled(image, tiling, run, (band, y0) => {
    const size = band.width * band.height
    for (let c = 0; c < 3; c++) out.data.set(band.data.subarray(c * size, (c + 1) * size), c * plane + y0 * out.width)
  })
  return out
}

/** One of the 8 rotations and flips of a stack of square `size` tiles:
 * `k % 4` quarter turns, flipped horizontally first when `k >= 4`. */
export function transform(tiles: Float32Array, size: number, k: number): Float32Array {
  let out: Float32Array = k >= 4 ? flip(tiles, size) : tiles.slice()
  for (let i = 0; i < k % 4; i++) out = quarterTurn(out, size)
  return out
}

/** Undoes `transform(…, k)`. */
export function untransform(tiles: Float32Array, size: number, k: number): Float32Array {
  let out: Float32Array = tiles.slice()
  for (let i = 0; i < (4 - (k % 4)) % 4; i++) out = quarterTurn(out, size)
  return k >= 4 ? flip(out, size) : out
}

/** Mirrors every plane of a stack of square tiles left to right. */
function flip(tiles: Float32Array, size: number): Float32Array {
  const out = new Float32Array(tiles.length)
  for (let row = 0; row < tiles.length; row += size)
    for (let x = 0; x < size; x++) out[row + x] = tiles[row + size - 1 - x]
  return out
}

/** Turns every plane of a stack of square tiles a quarter clockwise. */
function quarterTurn(tiles: Float32Array, size: number): Float32Array {
  const out = new Float32Array(tiles.length)
  const area = size * size
  for (let p = 0; p < tiles.length; p += area)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) out[p + y * size + x] = tiles[p + (size - 1 - x) * size + y]
  return out
}

/** The brightness gains of the "maximum quality" ensemble. */
export const GAINS = [0.95, 1, 1.05]

/** "Maximum quality": runs a batch of square tiles 24 times, once per
 * rotation/flip and brightness gain, and averages the results. Each run:
 * transform, multiply by the gain, clamp, model, divide by the gain, clamp,
 * undo the transform. */
export async function ensemble(tiles: Float32Array, n: number, size: number, run: RunTiles): Promise<Float32Array> {
  const total = new Float32Array(tiles.length)
  const clamp = (v: number) => Math.min(Math.max(v, 0), 1)
  for (let k = 0; k < 8; k++) {
    const turned = transform(tiles, size, k)
    for (const gain of GAINS) {
      const output = await run(
        turned.map((v) => clamp(v * gain)),
        n,
      )
      const back = untransform(
        output.map((v) => clamp(v / gain)),
        size,
        k,
      )
      for (let i = 0; i < total.length; i++) total[i] += back[i]
    }
  }
  const runs = 8 * GAINS.length
  return total.map((v) => v / runs)
}
