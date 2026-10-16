/** Lanczos3 resizing of 8-bit images, separable, as Pillow computes it (the
 * ComfyUI graph the cleaner reproduces used Pillow's LANCZOS). Works on
 * planar float channels holding 8-bit values (k/255); the cleaner feeds it
 * rows as they're finished. */

export type Taps = { start: number; weights: Float32Array }

function sinc(x: number): number {
  if (x === 0) return 1
  const p = Math.PI * x
  return Math.sin(p) / p
}

function lanczos3(x: number): number {
  return x > -3 && x < 3 ? sinc(x) * sinc(x / 3) : 0
}

/** For each output pixel along an axis, the source pixels it reads and their
 * weights. Downscaling widens the kernel by the factor (±6 pixels at 2×). */
export function lanczosWeights(src: number, dst: number): Taps[] {
  const scale = src / dst
  const filterScale = Math.max(scale, 1)
  const support = 3 * filterScale
  return Array.from({ length: dst }, (_, i) => {
    const centre = (i + 0.5) * scale
    const start = Math.max(Math.trunc(centre - support + 0.5), 0)
    const end = Math.min(Math.trunc(centre + support + 0.5), src)
    const weights = Float32Array.from({ length: end - start }, (_, k) =>
      lanczos3((start + k - centre + 0.5) / filterScale),
    )
    const total = weights.reduce((a, b) => a + b, 0)
    return { start, weights: weights.map((w) => w / total) }
  })
}

/** Resizes `channels` planes of `width × height` (one after another) to
 * `dw × dh`, rows arriving in order through `push`. Each output row goes
 * to `emit` (`channels` runs of `dw` values) as soon as the source rows it
 * reads are in, so only a few rows are held at a time. */
export class LanczosStream {
  private readonly across: Taps[]
  private readonly down: Taps[]
  /** Source rows resized across, until no output row needs them. */
  private readonly rows: (Float32Array | undefined)[]
  private received = 0
  private next = 0

  constructor(
    private readonly channels: number,
    private readonly width: number,
    height: number,
    private readonly dw: number,
    private readonly dh: number,
    private readonly emit: (row: Float32Array, y: number) => void,
  ) {
    this.across = lanczosWeights(width, dw)
    this.down = lanczosWeights(height, dh)
    this.rows = new Array(height)
  }

  /** The next `count` source rows: `channels` runs of `count × width`. */
  push(band: Float32Array, count: number) {
    const { channels, width, dw } = this
    for (let r = 0; r < count; r++) {
      const row = new Float32Array(channels * dw)
      for (let c = 0; c < channels; c++) {
        const source = (c * count + r) * width
        for (let x = 0; x < dw; x++) {
          const { start, weights } = this.across[x]
          let v = 0
          for (let k = 0; k < weights.length; k++) v += weights[k] * band[source + start + k]
          // 8 bits between the passes, as Pillow and fast_image_resize do.
          row[c * dw + x] = Math.round(Math.min(Math.max(v, 0), 1) * 255) / 255
        }
      }
      this.rows[this.received + r] = row
    }
    this.received += count
    while (this.next < this.dh) {
      const { start, weights } = this.down[this.next]
      if (start + weights.length > this.received) break
      const out = new Float32Array(channels * dw)
      for (let k = 0; k < weights.length; k++) {
        const row = this.rows[start + k]!
        for (let i = 0; i < out.length; i++) out[i] += weights[k] * row[i]
      }
      this.emit(out, this.next)
      this.next++
      // Rows above the next output row's first tap aren't needed again.
      const keep = this.next < this.dh ? this.down[this.next].start : this.received
      for (let y = start; y < keep; y++) this.rows[y] = undefined
    }
  }
}

/** Resizes whole planes at once. */
export function resizePlanes(
  data: Float32Array,
  channels: number,
  width: number,
  height: number,
  dw: number,
  dh: number,
): Float32Array {
  const out = new Float32Array(channels * dw * dh)
  new LanczosStream(channels, width, height, dw, dh, (row, y) => {
    for (let c = 0; c < channels; c++) out.set(row.subarray(c * dw, (c + 1) * dw), (c * dh + y) * dw)
  }).push(data, height)
  return out
}
