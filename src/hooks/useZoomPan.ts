import { useRef, useState } from 'react'
import { clampPan, type Size, type View, zoomAt } from '@/lib/zoom'

/** Moving further than this between press and release is a pan, not a click. */
const CLICK_SLOP = 4

type Point = { clientX: number; clientY: number }
type PointerLike = Point & { button: number; pointerId: number; currentTarget: Element }
type WheelLike = Point & { deltaY: number }

/** Wheel zoom and drag pan over an image of `size` in `viewport`.
 * `view` is null while the image is
 * drawn at `fit()`, the view it has when not zoomed. */
export function useZoomPan({
  size,
  viewport,
  stage,
  fit,
  onChange,
}: {
  size: Size | null
  viewport: Size | null
  stage: { current: Element | null }
  fit: () => View | null
  /** Every zoom or pan, null when back at fit. */
  onChange?: (view: View | null) => void
}) {
  const [view, setView] = useState<View | null>(null)
  const latest = useRef<View | null>(null)
  // The pointer's last position while a drag pans; each move pans the
  // latest view, so a wheel zoom during the drag stands.
  const drag = useRef<{ x: number; y: number } | null>(null)
  const press = useRef<{ x: number; y: number } | null>(null)

  function set(next: View | null) {
    latest.current = next
    setView(next)
    onChange?.(next)
  }

  function local(event: Point) {
    const rect = stage.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  /** Zooms by `factor` at `point` (stage pixels, the middle by default);
   * zooming out to the fit scale goes back to fit. */
  function zoomBy(factor: number, point?: { x: number; y: number }) {
    const base = fit()
    const current = latest.current ?? base
    if (!size || !viewport || !current || !base) return
    const at = point ?? { x: viewport.width / 2, y: viewport.height / 2 }
    const next = zoomAt(current, at, factor, size, viewport)
    set(next.scale <= base.scale ? null : next)
  }

  const handlers = {
    onWheel(event: WheelLike) {
      zoomBy(Math.pow(1.0015, -event.deltaY), local(event))
    },
    onPointerDown(event: PointerLike) {
      press.current = { x: event.clientX, y: event.clientY }
      if (event.button !== 0 || !latest.current) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { x: event.clientX, y: event.clientY }
    },
    onPointerMove(event: Point) {
      const last = drag.current
      const current = latest.current
      if (!last || !size || !viewport) return
      drag.current = { x: event.clientX, y: event.clientY }
      if (!current) return
      set(
        clampPan(
          { ...current, x: current.x + event.clientX - last.x, y: current.y + event.clientY - last.y },
          size,
          viewport,
        ),
      )
    },
    onPointerUp() {
      drag.current = null
    },
  }

  /** Whether the pointer moved far enough since the press to be a pan. */
  function moved(event: Point): boolean {
    const start = press.current
    return !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP
  }

  return { view, zoomBy, set, reset: () => set(null), handlers, moved }
}
