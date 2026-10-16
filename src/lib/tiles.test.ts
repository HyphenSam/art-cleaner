import { describe, expect, it } from 'vitest'
import {
  at,
  batchCount,
  ensemble,
  estimateSigma,
  hannWindow,
  mirror,
  type Planes,
  processTiled,
  processTiledToPlanes,
  type RunTiles,
  type Tiling,
  tileCount,
  tileStarts,
  transform,
  untransform,
} from './tiles'

const DENOISE: Tiling = { tile: 256, overlap: 48, scale: 1, batch: 8 }

/** A deterministic image with detail everywhere, values 0.05–0.95. */
function pattern(width: number, height: number): Planes {
  const data = new Float32Array(3 * width * height)
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        data[(c * height + y) * width + x] = 0.05 + (0.9 * ((x * 7 + y * 13 + c * 29) % 97)) / 96
  return { width, height, data }
}

function grey(width: number, height: number, f: (x: number, y: number) => number): Planes {
  const data = new Float32Array(3 * width * height)
  for (let c = 0; c < 3; c++)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[(c * height + y) * width + x] = f(x, y)
  return { width, height, data }
}

function maxDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  expect(a.length).toBe(b.length)
  let worst = 0
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]))
  return worst
}

const identity: RunTiles = async (tiles) => tiles.slice()

/** Nearest-neighbour 2× of `[n, 3, size, size]` tiles. */
function nearest2x(size: number): RunTiles {
  return async (tiles, n) => {
    const big = size * 2
    const out = new Float32Array(n * 3 * big * big)
    for (let t = 0; t < n * 3; t++)
      for (let y = 0; y < big; y++)
        for (let x = 0; x < big; x++) out[(t * big + y) * big + x] = tiles[(t * size + (y >> 1)) * size + (x >> 1)]
    return out
  }
}

describe('mirror', () => {
  it('reflects without repeating the edge', () => {
    expect(Array.from({ length: 10 }, (_, i) => mirror(i, 4))).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2, 3])
  })

  it('maps every index of a one-pixel axis to that pixel', () => {
    expect(Array.from({ length: 5 }, (_, i) => mirror(i, 1))).toEqual([0, 0, 0, 0, 0])
  })
})

describe('tileStarts', () => {
  it('steps by tile minus overlap', () => {
    expect(tileStarts(1000, DENOISE)).toEqual({ starts: [0, 208, 416, 624, 832], padded: 1088 })
    expect(tileStarts(257, DENOISE)).toEqual({ starts: [0, 208], padded: 464 })
  })

  it('makes one tile of an image up to one tile', () => {
    expect(tileStarts(256, DENOISE)).toEqual({ starts: [0], padded: 256 })
    expect(tileStarts(100, DENOISE)).toEqual({ starts: [0], padded: 256 })
    expect(tileStarts(1, DENOISE)).toEqual({ starts: [0], padded: 256 })
  })

  it('counts tiles on both axes', () => {
    expect(tileCount(1000, 257, DENOISE)).toBe(5 * 2)
    expect(tileCount(10, 10, DENOISE)).toBe(1)
  })
})

describe('hannWindow', () => {
  it('is a Hann window that never reaches zero', () => {
    const w = hannWindow(256)
    expect(w).toHaveLength(256)
    expect(w[0]).toBeGreaterThan(0)
    expect(w[255]).toBeGreaterThan(0)
    expect(w[0]).toBeLessThanOrEqual(Math.fround(1e-3))
    for (let n = 0; n < 256; n++) expect(Math.abs(w[n] - w[255 - n])).toBeLessThan(1e-6)
    const hann = (n: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / 255)
    expect(Math.abs(w[64] - hann(64))).toBeLessThan(1e-6)
    expect(w[127]).toBeGreaterThan(0.99)
  })
})

describe('processTiled', () => {
  it('gives back the image with an identity model', async () => {
    for (const [width, height] of [
      [256, 256],
      [300, 700],
      [1000, 513],
      [100, 37],
      [1, 1],
    ]) {
      const image = pattern(width, height)
      const out = await processTiledToPlanes(image, DENOISE, identity)
      expect([out.width, out.height]).toEqual([width, height])
      expect(maxDiff(out.data, image.data), `${width}×${height}`).toBeLessThan(1e-5)
    }
  })

  it('runs tiles in batches within a row of tiles', async () => {
    const runs: number[] = []
    await processTiledToPlanes(pattern(1000, 513), DENOISE, async (tiles, n) => {
      expect(tiles).toHaveLength(n * 3 * 256 * 256)
      runs.push(n)
      return tiles.slice()
    })
    // 5 tiles across, 3 rows down.
    expect(runs).toEqual([5, 5, 5])
    expect(batchCount(1000, 513, DENOISE)).toBe(3)

    const wide: number[] = []
    await processTiledToPlanes(pattern(2000, 100), DENOISE, async (tiles, n) => (wide.push(n), tiles.slice()))
    expect(wide).toEqual([8, 2])
    expect(batchCount(2000, 100, DENOISE)).toBe(2)
  })

  it('pads edge tiles by mirroring', async () => {
    const image = pattern(100, 37)
    await processTiledToPlanes(image, DENOISE, async (tiles) => {
      // Row 0, columns 100 and 101 mirror columns 98 and 97.
      expect(tiles[100]).toBe(at(image, 0, 0, 98))
      expect(tiles[101]).toBe(at(image, 0, 0, 97))
      // Row 37 mirrors row 35.
      expect(tiles[37 * 256 + 5]).toBe(at(image, 0, 35, 5))
      return tiles.slice()
    })
  })

  it('blends scaled tiles into a scaled image', async () => {
    const tiling: Tiling = { tile: 64, overlap: 16, scale: 2, batch: 4 }
    const image = pattern(150, 90)
    const out = await processTiledToPlanes(image, tiling, nearest2x(64))
    expect([out.width, out.height]).toEqual([300, 180])
    for (let c = 0; c < 3; c++)
      for (let y = 0; y < 180; y++)
        for (let x = 0; x < 300; x++)
          expect(Math.abs(at(out, c, y, x) - at(image, c, y >> 1, x >> 1))).toBeLessThan(1e-5)
  })

  it('hands over finished rows in order, before the last run', async () => {
    const tiling: Tiling = { tile: 64, overlap: 16, scale: 2, batch: 1 }
    const image = pattern(100, 200)
    const events: string[] = []
    let next = 0
    await processTiled(
      image,
      tiling,
      async (tiles, n) => {
        events.push('run')
        return nearest2x(64)(tiles, n)
      },
      (rows, y0) => {
        expect(y0).toBe(next)
        expect(rows.width).toBe(200)
        next += rows.height
        events.push('rows')
      },
    )
    expect(next).toBe(400)
    expect(events.indexOf('rows')).toBeLessThan(events.lastIndexOf('run'))
  })

  it('stops at the first model error', async () => {
    let calls = 0
    const result = processTiledToPlanes(pattern(600, 600), DENOISE, async () => {
      calls++
      throw new Error('cancelled')
    })
    await expect(result).rejects.toThrow('cancelled')
    expect(calls).toBe(1)
  })
})

describe('estimateSigma', () => {
  it('is the median absolute Laplacian over 0.6745', () => {
    // Columns alternate 0.5 and 0.51: inside the image every pixel's
    // Laplacian is ±0.02 (times the luma weights, which sum to 0.9999).
    const image = grey(64, 64, (x) => (x % 2 === 0 ? 0.5 : 0.51))
    expect(Math.abs(estimateSigma(image) - (0.02 * 0.9999) / 0.6745)).toBeLessThan(1e-4)
  })

  it('takes the lower middle value of an even count', () => {
    // 2×1, luma 0 and l: the responses are l and 4l; the lower one wins.
    const dim = grey(2, 1, (x) => x * 0.1)
    expect(estimateSigma(dim)).toBeCloseTo((0.1 * 0.9999) / 0.6745, 5)
  })

  it('gives a flat image the default', () => {
    expect(Math.abs(estimateSigma(grey(64, 64, () => 0.5)) - 25 / 255)).toBeLessThan(1e-6)
  })

  it('is clamped', () => {
    expect(estimateSigma(grey(64, 64, (x) => (x % 2 === 0 ? 0.5 : 0.5000005)))).toBe(0.0005)
    expect(estimateSigma(grey(64, 64, (x, y) => (x + y) % 2))).toBe(1)
  })
})

describe('transforms', () => {
  it('undo', () => {
    const tile = pattern(5, 5).data
    for (let k = 0; k < 8; k++) {
      const t = transform(tile, 5, k)
      if (k !== 0) expect(Array.from(t), `transform ${k} changes the tile`).not.toEqual(Array.from(tile))
      expect(Array.from(untransform(t, 5, k)), `transform ${k}`).toEqual(Array.from(tile))
    }
  })

  it('are 8 distinct ones', () => {
    const tile = pattern(4, 4).data
    const all = Array.from({ length: 8 }, (_, k) => Array.from(transform(tile, 4, k)).join())
    expect(new Set(all).size).toBe(8)
  })

  it('include a quarter turn', () => {
    const tile = Float32Array.from({ length: 12 }, (_, v) => v)
    const first = Array.from(transform(tile, 2, 1).slice(0, 4))
    expect([
      [2, 0, 3, 1],
      [1, 3, 0, 2],
    ]).toContainEqual(first)
  })
})

describe('ensemble', () => {
  it('runs 24 times and averages', async () => {
    const tiles = pattern(8, 16).data // two 8×8 tiles
    let runs = 0
    const out = await ensemble(tiles, 2, 8, async (batch, n) => {
      runs++
      expect(n).toBe(2)
      return batch.slice()
    })
    expect(runs).toBe(24)
    // Values stay under 1/1.05, so no gain clips them.
    expect(maxDiff(out, tiles)).toBeLessThan(1e-5)
  })

  it('clamps like the original', async () => {
    const out = await ensemble(new Float32Array(3 * 2 * 2).fill(1), 1, 2, identity)
    // Gain 0.95 gives 0.95/0.95 = 1; 1.05 clips to 1 then 1/1.05.
    expect(Math.abs(out[0] - (1 + 1 + 1 / 1.05) / 3)).toBeLessThan(1e-5)
  })
})
