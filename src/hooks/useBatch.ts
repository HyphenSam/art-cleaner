import { zipSync } from 'fflate'
import { useCallback, useRef, useState } from 'react'
import { isImageFile } from '@/lib/formats'
import { outputName, uniqueNames } from '@/lib/names'
import type { EngineClient } from '@/lib/protocol'
import { type Item, nextQueued, queue, type QueueAction } from '@/lib/queue'
import type { Settings } from '@/lib/settings'

export type EngineApi = Pick<EngineClient, 'hello' | 'process' | 'download' | 'clear'>

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** The batch: adding images, working through them one at a time with the
 * settings current when each starts, cancelling, and collecting results. */
export function useBatch(client: EngineApi, settings: Settings) {
  // The queue lives in a ref too, so the processing loop reads it without
  // waiting for a render.
  const state = useRef<Item[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [running, setRunning] = useState(false)
  const files = useRef(new Map<string, File>())
  const blobs = useRef(new Map<string, Blob>())
  const current = useRef<{ id: string; controller: AbortController } | null>(null)
  const stopping = useRef(false)
  const latest = useRef(settings)
  latest.current = settings

  const act = useCallback((action: QueueAction) => {
    state.current = queue(state.current, action)
    setItems(state.current)
  }, [])

  const forgetResult = (item: Item) => {
    if (item.result) URL.revokeObjectURL(item.result.url)
    blobs.current.delete(item.id)
  }

  const drain = useCallback(async () => {
    if (current.current || running) return
    setRunning(true)
    stopping.current = false
    for (let next = nextQueued(state.current); next && !stopping.current; next = nextQueued(state.current)) {
      const { id } = next
      const file = files.current.get(id)!
      const settings = latest.current
      const controller = new AbortController()
      current.current = { id, controller }
      act({ type: 'start', id })
      try {
        const bytes = await file.arrayBuffer()
        const result = await client.process(
          bytes,
          file.type,
          settings,
          (event) => act({ type: 'event', id, event }),
          controller.signal,
        )
        const blob = new Blob([result.bytes], { type: result.mime })
        blobs.current.set(id, blob)
        const name = outputName(file.name, settings)
        act({
          type: 'done',
          id,
          result: { url: URL.createObjectURL(blob), name, width: result.width, height: result.height, size: blob.size },
        })
      } catch (error) {
        if (isAbort(error)) act({ type: 'cancelled', id })
        else act({ type: 'failed', id, message: error instanceof Error ? error.message : String(error) })
      }
    }
    current.current = null
    setRunning(false)
  }, [act, client, running])

  const add = useCallback(
    (list: Iterable<File>) => {
      const added: Item[] = []
      for (const file of list) {
        if (!isImageFile(file.name, file.type)) continue
        const id = crypto.randomUUID()
        files.current.set(id, file)
        added.push({ id, name: file.name, originalUrl: URL.createObjectURL(file), status: 'queued', event: null })
      }
      if (added.length) act({ type: 'add', items: added })
      return added
    },
    [act],
  )

  const remove = useCallback(
    (id: string) => {
      const item = state.current.find((i) => i.id === id)
      if (!item) return
      if (current.current?.id === id) current.current.controller.abort()
      URL.revokeObjectURL(item.originalUrl)
      forgetResult(item)
      files.current.delete(id)
      act({ type: 'remove', id })
    },
    [act],
  )

  const clear = useCallback(() => {
    stopping.current = true
    current.current?.controller.abort()
    for (const item of state.current) {
      URL.revokeObjectURL(item.originalUrl)
      forgetResult(item)
    }
    files.current.clear()
    act({ type: 'clear' })
  }, [act])

  /** Queues every image that isn't waiting or being worked on, and starts. */
  const redo = useCallback(
    (ids?: string[]) => {
      const again = state.current.filter(
        (i) => (ids ? ids.includes(i.id) : true) && i.status !== 'queued' && i.status !== 'working',
      )
      again.forEach(forgetResult)
      act({ type: 'requeue', ids: again.map((i) => i.id) })
      void drain()
    },
    [act, drain],
  )

  const cancel = useCallback(() => {
    stopping.current = true
    current.current?.controller.abort()
  }, [])

  /** Every result in one zip, names made unique. Stored, not deflated:
   * PNG and WebP are compressed already. */
  const zip = useCallback(async () => {
    const done = state.current.filter((i) => i.result && blobs.current.has(i.id))
    const names = uniqueNames(done.map((i) => i.result!.name))
    const entries: Record<string, [Uint8Array, { level: 0 }]> = {}
    for (const [k, item] of done.entries()) {
      entries[names[k]] = [new Uint8Array(await blobs.current.get(item.id)!.arrayBuffer()), { level: 0 }]
    }
    return new Blob([zipSync(entries)], { type: 'application/zip' })
  }, [])

  return { items, running, add, remove, clear, start: drain, redo, cancel, zip }
}
