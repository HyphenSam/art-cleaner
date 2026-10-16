import { describe, expect, it } from 'vitest'
import cases from './fixtures/lanczos.json'
import { LanczosStream, lanczosWeights, resizePlanes } from './lanczos'

/** Interleaved RGB bytes to planar values 0–1. */
function toPlanar(rgb: number[], width: number, height: number): Float32Array {
  const out = new Float32Array(3 * width * height)
  for (let i = 0; i < width * height; i++)
    for (let c = 0; c < 3; c++) out[c * width * height + i] = rgb[i * 3 + c] / 255
  return out
}

function bytes(planar: Float32Array): number[] {
  return Array.from(planar, (v) => Math.round(Math.min(Math.max(v, 0), 1) * 255))
}

describe('lanczosWeights', () => {
  it('sums to 1 for every output pixel', () => {
    for (const [src, dst] of [
      [512, 256],
      [23, 11],
      [12, 24],
      [5, 5],
    ]) {
      for (const { weights } of lanczosWeights(src, dst)) {
        expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
      }
    }
  })

  it('reaches 6 source pixels each way when halving', () => {
    const middle = lanczosWeights(512, 256)[128]
    // Centre 257, support ±6: pixels 251 to 262.
    expect(middle.start).toBe(251)
    expect(middle.weights).toHaveLength(12)
  })

  it('stays inside the source at the edges', () => {
    const all = lanczosWeights(100, 50)
    expect(all[0].start).toBe(0)
    const last = all[49]
    expect(last.start + last.weights.length).toBe(100)
  })
})

describe('resizePlanes', () => {
  it("matches Pillow's Lanczos within 1/255", () => {
    for (const { width, height, dw, dh, input, output } of cases) {
      const got = bytes(resizePlanes(toPlanar(input, width, height), 3, width, height, dw, dh))
      const want = bytes(toPlanar(output, dw, dh))
      const worst = Math.max(...got.map((v, i) => Math.abs(v - want[i])))
      expect(worst, `${width}×${height} → ${dw}×${dh}`).toBeLessThanOrEqual(1)
    }
  })

  it('keeps a flat image flat', () => {
    const flat = new Float32Array(2 * 30 * 20).fill(0.4)
    for (const v of resizePlanes(flat, 2, 30, 20, 15, 10)) expect(v).toBeCloseTo(0.4, 6)
  })
})

describe('LanczosStream', () => {
  it('gives the same rows as resizing all at once, however the rows arrive', () => {
    const { width, height, dw, dh, input } = cases[0]
    const source = toPlanar(input, width, height)
    const whole = resizePlanes(source, 3, width, height, dw, dh)
    for (const bands of [[16], [5, 5, 6], [1, 2, 3, 4, 6]]) {
      const got = new Float32Array(3 * dw * dh)
      const order: number[] = []
      const stream = new LanczosStream(3, width, height, dw, dh, (row, y) => {
        order.push(y)
        for (let c = 0; c < 3; c++) got.set(row.subarray(c * dw, (c + 1) * dw), (c * dh + y) * dw)
      })
      let y0 = 0
      for (const count of bands) {
        const band = new Float32Array(3 * width * count)
        for (let c = 0; c < 3; c++)
          band.set(source.subarray((c * height + y0) * width, (c * height + y0 + count) * width), c * width * count)
        stream.push(band, count)
        y0 += count
      }
      expect(order).toEqual(Array.from({ length: dh }, (_, i) => i))
      expect(Array.from(got)).toEqual(Array.from(whole))
    }
  })

  it('emits rows before the last band arrives', () => {
    const emitted: number[] = []
    const stream = new LanczosStream(1, 4, 200, 2, 100, (_, y) => emitted.push(y))
    stream.push(new Float32Array(4 * 100), 100)
    expect(emitted.length).toBeGreaterThan(40)
    stream.push(new Float32Array(4 * 100), 100)
    expect(emitted).toHaveLength(100)
  })
})
