import { Download, ImagePlus, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatBytes } from '@/lib/format-bytes'
import type { Item } from '@/lib/queue'
import { statusText } from './BatchStrip'
import { Compare, COMPARE_MODES, type CompareMode } from './Compare'
import { Button } from './ui/Button'
import { Segmented } from './ui/Segmented'

/** The image area: a drop target while empty, otherwise the selected image
 * compared with its result. */
export function Stage({
  item,
  onBrowse,
  onRetry,
}: {
  item: Item | null
  onBrowse: () => void
  onRetry: (id: string) => void
}) {
  const [mode, setMode] = useState<CompareMode>('slider')
  const [showOriginal, setShowOriginal] = useState(false)
  useEffect(() => setShowOriginal(false), [item?.id])

  if (!item) return <Empty onBrowse={onBrowse} />
  const result = item.result

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{item.name}</p>
          <p className={cn('truncate text-xs', item.status === 'failed' ? 'text-danger' : 'text-ink-soft')}>
            {item.status === 'failed'
              ? item.error
              : result
                ? `${result.width} × ${result.height} · ${formatBytes(result.size)}`
                : statusText(item)}
          </p>
        </div>
        {result && (
          <>
            <Segmented label="Compare" value={mode} options={COMPARE_MODES} onChange={setMode} fit />
            {mode === 'toggle' && (
              <Button size="sm" aria-pressed={showOriginal} onClick={() => setShowOriginal((s) => !s)}>
                {showOriginal ? 'Showing original' : 'Show original'}
              </Button>
            )}
            <a
              href={result.url}
              download={result.name}
              className="inline-flex h-8 items-center gap-2 rounded-control bg-accent px-3 text-[13px] font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-hover [&_svg]:size-4"
            >
              <Download />
              Download
            </a>
          </>
        )}
        {(item.status === 'failed' || item.status === 'cancelled') && (
          <Button size="sm" onClick={() => onRetry(item.id)}>
            <RotateCcw />
            Try again
          </Button>
        )}
      </div>
      <Compare
        key={`${item.id}:${mode}`}
        originalUrl={item.originalUrl}
        resultUrl={result?.url ?? null}
        mode={mode}
        showOriginal={showOriginal}
      />
    </div>
  )
}

function Empty({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-1 bg-stage p-4 lg:p-8">
      <div className="flex flex-1 flex-col items-center justify-center rounded-panel border-2 border-dashed border-line-strong/70 px-6 py-12 text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-panel bg-panel text-ink-soft shadow-[0_0_0_1px_var(--color-line)]">
          <ImagePlus className="size-6" strokeWidth={1.75} />
        </div>
        <h1 className="text-lg font-semibold text-balance">Drop images here</h1>
        <p className="mt-1.5 max-w-sm text-sm text-ink-soft text-pretty">
          PNG, JPEG, WebP, AVIF and more. You can also paste from the clipboard.
        </p>
        <Button variant="primary" className="mt-5" onClick={onBrowse}>
          Browse
        </Button>
        <p className="mt-8 text-xs text-ink-soft">Runs on your device. Nothing is uploaded.</p>
      </div>
    </div>
  )
}
