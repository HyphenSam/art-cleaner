/** The batch: images in the order they were added, each queued, being
 * worked on, done, failed or cancelled. A pure reducer; object URLs are
 * made and revoked by whoever dispatches. */
import type { JobEvent } from './engine'

export type Status = 'queued' | 'working' | 'done' | 'failed' | 'cancelled'

export type Result = { url: string; name: string; width: number; height: number; size: number }

export type Item = {
  id: string
  name: string
  originalUrl: string
  status: Status
  /** The latest progress while working. */
  event: JobEvent | null
  error?: string
  result?: Result
}

export type QueueAction =
  | { type: 'add'; items: Item[] }
  | { type: 'start'; id: string }
  | { type: 'event'; id: string; event: JobEvent }
  | { type: 'done'; id: string; result: Result }
  | { type: 'failed'; id: string; message: string }
  | { type: 'cancelled'; id: string }
  | { type: 'requeue'; ids: string[] }
  | { type: 'remove'; id: string }
  | { type: 'clear' }

export function queue(items: Item[], action: QueueAction): Item[] {
  const update = (id: string, change: (item: Item) => Item) => items.map((i) => (i.id === id ? change(i) : i))
  switch (action.type) {
    case 'add':
      return [...items, ...action.items]
    case 'start':
      return update(action.id, (i) => ({ ...i, status: 'working', event: null, error: undefined }))
    case 'event':
      return update(action.id, (i) => ({ ...i, event: action.event }))
    case 'done':
      return update(action.id, (i) => ({ ...i, status: 'done', event: null, result: action.result }))
    case 'failed':
      return update(action.id, (i) => ({ ...i, status: 'failed', event: null, error: action.message }))
    case 'cancelled':
      return update(action.id, (i) => ({ ...i, status: 'cancelled', event: null }))
    case 'requeue':
      return items.map((i) =>
        action.ids.includes(i.id) && i.status !== 'working'
          ? { ...i, status: 'queued', event: null, error: undefined, result: undefined }
          : i,
      )
    case 'remove':
      return items.filter((i) => i.id !== action.id)
    case 'clear':
      return []
  }
}

export function nextQueued(items: Item[]): Item | undefined {
  return items.find((i) => i.status === 'queued')
}

/** What a progress bar shows: a label and how far along (null: no bar). */
export function progressOf(event: JobEvent): { label: string; fraction: number | null } {
  switch (event.phase) {
    case 'download':
      return { label: 'Downloading models', fraction: event.total ? event.loaded / event.total : 0 }
    case 'prepare':
      return { label: 'Preparing', fraction: null }
    case 'run':
      return { label: 'Processing', fraction: event.total ? event.done / event.total : 0 }
    case 'encode':
      return { label: 'Saving', fraction: null }
  }
}
