export type Size = { width: number; height: number }

/** The image's scale and the viewport position of its top-left corner. */
export type View = { scale: number; x: number; y: number }

export const MAX_SCALE = 8

/** The scale that fits the image in the viewport. Small images stay at 1. */
export function fitScale(image: Size, viewport: Size): number {
  return Math.min(viewport.width / image.width, viewport.height / image.height, 1)
}

/** The image at its fit scale, centred. */
export function fitted(image: Size, viewport: Size): View {
  return clampPan({ scale: fitScale(image, viewport), x: 0, y: 0 }, image, viewport)
}

/** Zooms by `factor` keeping the image point under `point` (viewport
 * pixels) where it is. The scale stays between the fit scale and
 * [`MAX_SCALE`]. */
export function zoomAt(view: View, point: { x: number; y: number }, factor: number, image: Size, viewport: Size): View {
  const scale = Math.min(Math.max(view.scale * factor, fitScale(image, viewport)), MAX_SCALE)
  const imageX = (point.x - view.x) / view.scale
  const imageY = (point.y - view.y) / view.scale
  return clampPan({ scale, x: point.x - imageX * scale, y: point.y - imageY * scale }, image, viewport)
}

/** Centres a side that fits in the viewport; otherwise keeps the image
 * covering the viewport on that side. */
export function clampPan(view: View, image: Size, viewport: Size): View {
  const axis = (offset: number, imageSide: number, viewSide: number) => {
    const scaled = imageSide * view.scale
    if (scaled <= viewSide) return (viewSide - scaled) / 2
    return Math.min(0, Math.max(viewSide - scaled, offset))
  }
  return {
    scale: view.scale,
    x: axis(view.x, image.width, viewport.width),
    y: axis(view.y, image.height, viewport.height),
  }
}

/** How far into the drawn image a stage position `x` is: the left inset a
 * `clip-path` needs to hide the image left of `x`, since the inset is
 * measured from the image's own box, not the stage. */
export function insetLeftOf(x: number, view: View): number {
  return Math.max(0, x - view.x)
}
