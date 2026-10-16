import { describe, expect, it } from 'vitest'
import { clampPan, fitScale, fitted, insetLeftOf, MAX_SCALE, type View, zoomAt } from './zoom'

const size = (width: number, height: number) => ({ width, height })

describe('fitScale', () => {
  it('scales a large image down to fit the viewport', () => {
    expect(fitScale(size(4000, 2000), size(1000, 1000))).toBe(0.25)
    expect(fitScale(size(1000, 3000), size(1000, 1500))).toBe(0.5)
  })

  it('never scales a small image up', () => {
    expect(fitScale(size(300, 200), size(1000, 1000))).toBe(1)
  })
})

describe('fitted', () => {
  it('centres the image at its fit scale', () => {
    expect(fitted(size(4000, 2000), size(1000, 1000))).toEqual({ scale: 0.25, x: 0, y: 250 })
    expect(fitted(size(300, 200), size(1000, 1000))).toEqual({ scale: 1, x: 350, y: 400 })
  })
})

describe('zoomAt', () => {
  const image = size(2000, 1000)
  const viewport = size(1000, 600)

  it('keeps the image point under the cursor in place', () => {
    const start: View = { scale: 0.5, x: 0, y: 50 }
    const next = zoomAt(start, { x: 300, y: 400 }, 2, image, viewport)
    expect(next.scale).toBe(1)
    // The point under the cursor was image (600, 700); it's still at (300, 400).
    expect(next.x + 600 * next.scale).toBeCloseTo(300)
    expect(next.y + 700 * next.scale).toBeCloseTo(400)
  })

  it('stops at the maximum scale', () => {
    const next = zoomAt({ scale: 6, x: 0, y: 0 }, { x: 0, y: 0 }, 4, image, viewport)
    expect(next.scale).toBe(MAX_SCALE)
  })

  it('stops at the fit scale when zooming out, and recentres', () => {
    const next = zoomAt({ scale: 1, x: -500, y: 0 }, { x: 100, y: 100 }, 0.1, image, viewport)
    expect(next).toEqual(fitted(image, viewport))
  })
})

describe('clampPan', () => {
  const image = size(2000, 1000)
  const viewport = size(1000, 800)

  it('keeps a zoomed image covering the viewport', () => {
    expect(clampPan({ scale: 1, x: 200, y: 100 }, image, viewport)).toEqual({ scale: 1, x: 0, y: 0 })
    expect(clampPan({ scale: 1, x: -5000, y: -5000 }, image, viewport)).toEqual({ scale: 1, x: -1000, y: -200 })
    expect(clampPan({ scale: 1, x: -300, y: -50 }, image, viewport)).toEqual({ scale: 1, x: -300, y: -50 })
  })

  it('centres a side that fits in the viewport', () => {
    expect(clampPan({ scale: 0.5, x: -100, y: 900 }, image, viewport)).toEqual({ scale: 0.5, x: 0, y: 150 })
  })
})

describe('insetLeftOf', () => {
  it("hides the image left of a stage position, in the image's own box", () => {
    // The image starts 200 px into the stage, so a divider at 300 cuts 100 px in.
    expect(insetLeftOf(300, { scale: 1, x: 200, y: 0 })).toBe(100)
    expect(insetLeftOf(300, { scale: 2, x: -500, y: 0 })).toBe(800)
  })

  it('hides nothing left of the image', () => {
    expect(insetLeftOf(100, { scale: 1, x: 200, y: 0 })).toBe(0)
  })
})
