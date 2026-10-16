import { AlertTriangle, Check, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { type Item, progressOf } from '@/lib/queue'

/** The batch as a row of thumbnails. State is carried by form as well as
 * colour: dashed while waiting, a filling bar while working, a tick when
 * done, a warning when failed, dimmed when cancelled. */
export function BatchStrip({
  items,
  selectedId,
  onSelect,
  onRemove,
}: {
  items: Item[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <ul aria-label="Images" className="flex gap-2 overflow-x-auto px-4 pt-3 pb-4">
      {items.map((item) => {
        const progress = item.event ? progressOf(item.event) : null
        const selected = item.id === selectedId
        return (
          <li key={item.id} className="group relative shrink-0">
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={selected ? 'true' : undefined}
              title={item.error ? `${item.name}: ${item.error}` : item.name}
              className={cn(
                'relative block size-16 overflow-hidden rounded-control bg-stage transition-[box-shadow,opacity] duration-150',
                'shadow-[0_0_0_1px_var(--color-line-strong)]',
                item.status === 'queued' &&
                  'shadow-none outline-1 -outline-offset-1 outline-line-strong outline-dashed',
                item.status === 'working' && 'shadow-[0_0_0_1.5px_var(--color-accent)]',
                item.status === 'failed' && 'shadow-[0_0_0_1.5px_var(--color-danger)]',
                item.status === 'cancelled' && 'opacity-50',
                selected && 'ring-2 ring-accent ring-offset-2 ring-offset-panel',
              )}
            >
              <img
                src={item.result?.url ?? item.originalUrl}
                alt=""
                className="checker size-full object-cover"
                draggable={false}
              />
              <span className="sr-only">
                {item.name}, {statusText(item)}
              </span>
              {item.status === 'working' && (
                <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40">
                  <span
                    role="progressbar"
                    aria-label={item.name}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress?.fraction != null ? Math.round(progress.fraction * 100) : undefined}
                    className={cn(
                      'block h-full bg-accent transition-[width] duration-200',
                      progress?.fraction == null && 'w-full animate-pulse',
                    )}
                    style={progress?.fraction != null ? { width: `${progress.fraction * 100}%` } : undefined}
                  />
                </span>
              )}
              {item.status === 'done' && (
                <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-ok text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
              {item.status === 'failed' && (
                <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-danger text-white">
                  <AlertTriangle className="size-2.5" strokeWidth={3} />
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.name}`}
              className="absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full bg-panel text-ink-soft opacity-0 shadow-float transition-opacity duration-150 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function statusText(item: Item): string {
  switch (item.status) {
    case 'queued':
      return 'Waiting'
    case 'working': {
      const progress = item.event ? progressOf(item.event) : null
      if (!progress) return 'Starting'
      return progress.fraction == null ? progress.label : `${progress.label} ${Math.round(progress.fraction * 100)}%`
    }
    case 'done':
      return 'Done'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
  }
}
