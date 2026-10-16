import { describe, expect, it } from 'vitest'
import { apply, CLEAN_TILING, DENOISE_TILING, modelRuns, type Steps } from './pipeline'
import { FakeModels, photo, rgba, smooth } from './testing'
import { batchCount } from './tiles'

const DENOISE: Steps = { denoise: { passes: 1, maxQuality: false } }
const CLEAN: Steps = { clean: { keepUpscaled: false } }
const none = () => {}

function worstDiff(a: ArrayLike<number>, b: ArrayLike<number>) {
  let worst = 0
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]))
  return worst
}

describe('apply', () => {
  it('leaves the pixels with an identity denoiser', async () => {
    const image = photo(300, 200)
    const out = await apply(image, DENOISE, new FakeModels(), none)
    expect([out.width, out.height]).toEqual([300, 200])
    expect(Array.from(out.data)).toEqual(Array.from(image.data))
  })

  it('keeps alpha as it was', async () => {
    const image = rgba(90, 60, (x, y) => [x * 2, y * 3, 9, x + y])
    const out = await apply(image, DENOISE, new FakeModels(), none)
    expect(Array.from(out.data)).toEqual(Array.from(image.data))
  })

  it('uses the noise level of the original for every pass', async () => {
    const models = new FakeModels()
    await apply(photo(300, 300), { denoise: { passes: 2, maxQuality: false } }, models, none)
    expect(models.calls).toHaveLength(2 * batchCount(300, 300, DENOISE_TILING))
    const first = models.sigmas[0]
    expect(first).toBeGreaterThan(0.0005)
    expect(first).toBeLessThan(1)
    expect(models.sigmas.every((s) => s === first)).toBe(true)
  })

  it('runs each batch 24 times for maximum quality', async () => {
    const models = new FakeModels()
    const out = await apply(photo(100, 100), { denoise: { passes: 1, maxQuality: true } }, models, none)
    expect(models.calls).toHaveLength(24)
    expect([out.width, out.height]).toEqual([100, 100])
  })

  it('cleans by upscaling and scaling back to the original size', async () => {
    const image = smooth(300, 170)
    const models = new FakeModels()
    const out = await apply(image, CLEAN, models, none)
    expect([out.width, out.height]).toEqual([300, 170])
    expect(models.calls.every((c) => c === 'upscale')).toBe(true)
    expect(worstDiff(out.data, image.data)).toBeLessThanOrEqual(2)
  })

  it('keeps the 2× size when asked', async () => {
    const image = photo(70, 50)
    const out = await apply(image, { clean: { keepUpscaled: true } }, new FakeModels(), none)
    expect([out.width, out.height]).toEqual([140, 100])
    // Nearest-neighbour 2× of the original, pixel for pixel.
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 140; x++)
        for (let c = 0; c < 4; c++)
          expect(out.data[4 * (y * 140 + x) + c]).toBe(image.data[4 * ((y >> 1) * 70 + (x >> 1)) + c])
  })

  it('resizes alpha with the image when keeping the 2× size', async () => {
    const image = rgba(40, 30, (x) => [10, 20, 30, x < 20 ? 0 : 200])
    const out = await apply(image, { clean: { keepUpscaled: true } }, new FakeModels(), none)
    expect([out.width, out.height]).toEqual([80, 60])
    expect(out.data[4 * (30 * 80 + 2) + 3]).toBe(0)
    expect(out.data[4 * (30 * 80 + 77) + 3]).toBe(200)
  })

  it('runs the steps in order', async () => {
    const models = new FakeModels()
    await apply(photo(64, 64), { ...DENOISE, ...CLEAN }, models, none)
    expect(models.calls).toEqual(['denoise', 'upscale'])
  })

  it('reports progress once per model run and stops when progress throws', async () => {
    const image = photo(700, 500)
    const steps: Steps = { denoise: { passes: 2, maxQuality: false }, ...CLEAN }
    let calls = 0
    await apply(image, steps, new FakeModels(), () => void calls++)
    expect(calls).toBe(modelRuns(700, 500, steps))
    expect(calls).toBe(2 * batchCount(700, 500, DENOISE_TILING) + batchCount(700, 500, CLEAN_TILING))

    const models = new FakeModels()
    const run = apply(image, steps, models, () => {
      throw new DOMException('Cancelled', 'AbortError')
    })
    await expect(run).rejects.toThrow('Cancelled')
    expect(models.calls).toHaveLength(1)
  })

  it('counts 24 runs per batch for maximum quality', () => {
    expect(modelRuns(100, 100, { denoise: { passes: 1, maxQuality: true } })).toBe(24)
    expect(modelRuns(100, 100, {})).toBe(0)
  })
})
