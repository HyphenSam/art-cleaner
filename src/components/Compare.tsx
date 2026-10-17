import { type PointerEvent, type WheelEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useZoomPan } from '@/hooks/useZoomPan'
import { cn } from '@/lib/cn'
import { clampPan, fitted, insetLeftOf, type Size, type View } from '@/lib/zoom'

export type CompareMode = 'toggle' | 'slider' | 'side'

export const COMPARE_MODES: { value: CompareMode; label: string }[] = [
  { value: 'slider', label: 'Slider' },
  { value: 'toggle', label: 'Toggle' },
  { value: 'side', label: 'Side by side' },
]

/** A saved mode, or the slider for anything else. */
export const parseCompareMode = (saved: unknown): CompareMode =>
  COMPARE_MODES.find((m) => m.value === saved)?.value ?? 'slider'

/** The original and the result, compared: split by a slider, flipped in
 * place, or side by side. Wheel zoom and drag pan are shared by every mode
 * and both sides. Key it by mode and image: side by side halves the stage,
 * so a zoom from another mode doesn't carry over. Ported from Kura. */
export function Compare({
  originalUrl,
  resultUrl,
  mode,
  showOriginal,
}: {
  originalUrl: string
  /** Null until there's a result: the original shows alone. */
  resultUrl: string | null
  mode: CompareMode
  /** Toggle mode: the original instead of the result. */
  showOriginal: boolean
}) {
  const stage = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<Size | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  // Where the slider splits the stage, as a fraction of its width.
  const [split, setSplit] = useState(0.5)
  // Ends a divider drag; set while one is going on.
  const endSplit = useRef<(() => void) | null>(null)
  useEffect(() => () => endSplit.current?.(), [])

  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const zoom = useZoomPan({
    size,
    viewport,
    stage,
    fit: () => (size && viewport ? fitted(size, viewport) : null),
  })
  const view: View | null = size && viewport ? (zoom.view ?? fitted(size, viewport)) : null

  function actualSize() {
    if (!size || !viewport) return
    if (fitted(size, viewport).scale >= 1) return zoom.reset()
    const centred = { scale: 1, x: (viewport.width - size.width) / 2, y: (viewport.height - size.height) / 2 }
    zoom.set(clampPan(centred, size, viewport))
  }

  const pane = {
    ...zoom.handlers,
    onWheel(event: WheelEvent<HTMLDivElement>) {
      // Zooms at the pointer in whichever pane it's over.
      const rect = event.currentTarget.getBoundingClientRect()
      zoom.zoomBy(Math.pow(1.0015, -event.deltaY), { x: event.clientX - rect.left, y: event.clientY - rect.top })
    },
  }

  function layer(src: string, alt: string, { hidden = false, clip }: { hidden?: boolean; clip?: string } = {}) {
    return (
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={
          alt === 'Original'
            ? (e) => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
            : undefined
        }
        className="checker absolute top-0 left-0 max-w-none origin-top-left select-none"
        style={{
          visibility: hidden ? 'hidden' : undefined,
          // Unsized until the original loads and the stage is measured.
          opacity: view ? undefined : 0,
          width: view && size ? size.width * view.scale : undefined,
          height: view && size ? size.height * view.scale : undefined,
          transform: view ? `translate(${view.x}px, ${view.y}px)` : undefined,
          // Pixels stay sharp when zoomed in, so artefacts can be compared.
          imageRendering: view && view.scale >= 2 ? 'pixelated' : undefined,
          clipPath: clip,
        }}
      />
    )
  }

  function label(text: string, side: 'left' | 'right' = 'left') {
    return (
      <span
        className={cn(
          'pointer-events-none absolute top-3 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm',
          side === 'left' ? 'left-3' : 'right-3',
        )}
      >
        {text}
      </span>
    )
  }

  /** Drags the divider. The window follows the pointer, so the drag goes
   * on wherever it moves, and ends on a release anywhere, or on the next
   * move without the button if the release never arrived. */
  function startSplit(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    endSplit.current?.()
    const move = (e: globalThis.PointerEvent) => {
      if ((e.buttons & 1) === 0) return end()
      const rect = stage.current?.getBoundingClientRect()
      if (rect && rect.width > 0) setSplit(Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1))
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      endSplit.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    endSplit.current = end
  }

  function nudgeSplit(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.02
    if (event.key === 'ArrowLeft') setSplit((s) => Math.max(0, s - step))
    else if (event.key === 'ArrowRight') setSplit((s) => Math.min(1, s + step))
    else return
    event.preventDefault()
  }

  const splitX = viewport ? split * viewport.width : 0
  const zoomed = zoom.view !== null
  const paneClass = cn(
    'relative min-w-0 flex-1 touch-none overflow-hidden bg-stage',
    // A click doesn't zoom, so no zoom cursor; the wheel does.
    zoomed && 'cursor-grab active:cursor-grabbing',
  )

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 gap-px bg-line">
      <div ref={stage} className={paneClass} {...pane}>
        {!resultUrl || mode === 'toggle' ? (
          <>
            {layer(originalUrl, 'Original', { hidden: !!resultUrl && !showOriginal })}
            {resultUrl && layer(resultUrl, 'Result', { hidden: showOriginal })}
            {label(!resultUrl || showOriginal ? 'Original' : 'Result')}
          </>
        ) : mode === 'slider' ? (
          <>
            {layer(originalUrl, 'Original')}
            {layer(resultUrl, 'Result', { clip: `inset(0 0 0 ${view ? insetLeftOf(splitX, view) : 0}px)` })}
            {label('Original')}
            {label('Result', 'right')}
            <div
              role="slider"
              tabIndex={0}
              aria-label="Split"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split * 100)}
              className="group absolute inset-y-0 z-10 w-6 -translate-x-1/2 cursor-ew-resize touch-none outline-none"
              style={{ left: splitX }}
              onPointerDown={startSplit}
              onKeyDown={nudgeSplit}
            >
              <div className="mx-auto h-full w-px bg-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.35),0_0_6px_rgba(0,0,0,0.35)]" />
              <div className="absolute top-1/2 left-1/2 flex h-8 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-150 group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-accent">
                <span className="h-3 w-px bg-zinc-400" />
                <span className="h-3 w-px bg-zinc-400" />
              </div>
            </div>
          </>
        ) : (
          <>
            {layer(originalUrl, 'Original')}
            {label('Original')}
          </>
        )}
      </div>
      {resultUrl && mode === 'side' && (
        <div className={paneClass} {...pane}>
          {layer(resultUrl, 'Result')}
          {label('Result')}
        </div>
      )}
      <div className="absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-lg bg-black/55 p-1 text-xs text-white backdrop-blur-sm">
        <span className="w-12 text-center tabular-nums" aria-label="Zoom">
          {view ? `${Math.round(view.scale * 100)}%` : ''}
        </span>
        <button
          type="button"
          className="h-6 rounded-md px-2 font-medium hover:bg-white/15"
          onClick={() => zoom.reset()}
        >
          Fit
        </button>
        <button type="button" className="h-6 rounded-md px-2 font-medium hover:bg-white/15" onClick={actualSize}>
          1:1
        </button>
      </div>
    </div>
  )
}
