/** Messages between the page and the worker, and both ends of them: a
 * promise-based client for the page, a dispatcher for the worker. */
import type { Job, JobEvent, JobResult } from './engine'
import type { ModelId } from './manifest'
import type { Backend, Settings } from './settings'

export type Hello = { backend: Backend; cached: string[]; isolated: boolean; threads: number }

export type Request =
  | { type: 'hello'; id: number }
  | { type: 'process'; id: number; bytes: ArrayBuffer; mime: string; settings: Settings }
  | { type: 'download'; id: number; ids: ModelId[] }
  | { type: 'remove'; id: number; ids: string[] }
  | { type: 'clear'; id: number }
  | { type: 'cancel'; id: number }

export type Reply =
  | { type: 'event'; id: number; event: JobEvent }
  | { type: 'done'; id: number; value: unknown }
  | { type: 'failed'; id: number; message: string; cancelled: boolean }
  /** The worker lost its GPU. ORT can't recover from that, so nothing it was
   * doing will finish. */
  | { type: 'lost'; message: string }

/** A `Worker`, a `MessagePort` or the worker's `self`. */
export interface Port {
  postMessage(message: unknown, transfer: Transferable[]): void
  onmessage: ((event: MessageEvent) => void) | null
  terminate?(): void
}

export type Handlers = {
  hello(): Promise<Hello>
  process(job: Job, onEvent: (e: JobEvent) => void, signal: AbortSignal): Promise<JobResult>
  download(ids: ModelId[], onEvent: (e: JobEvent) => void, signal: AbortSignal): Promise<void>
  /** Deletes the saved copies of these assets (by asset id). */
  remove(ids: string[]): Promise<void>
  clear(): Promise<void>
}

type Pending = { resolve(value: unknown): void; reject(error: unknown): void; onEvent?: (e: JobEvent) => void }

export class EngineClient {
  private next = 1
  private pending = new Map<number, Pending>()
  private port: Port

  /** `start` makes a worker; it's called again to replace one that lost its GPU. */
  constructor(private readonly start: () => Port) {
    this.port = this.listen(start())
  }

  private listen(port: Port) {
    port.onmessage = (event: MessageEvent<Reply>) => {
      const reply = event.data
      if (reply.type === 'lost') return this.restart(reply.message)
      const waiting = this.pending.get(reply.id)
      if (!waiting) return
      if (reply.type === 'event') return waiting.onEvent?.(reply.event)
      this.pending.delete(reply.id)
      if (reply.type === 'done') waiting.resolve(reply.value)
      else waiting.reject(reply.cancelled ? new DOMException(reply.message, 'AbortError') : new Error(reply.message))
    }
    return port
  }

  /** Fails everything the old worker was doing and starts a new one. */
  private restart(message: string) {
    this.port.onmessage = null
    this.port.terminate?.()
    for (const waiting of this.pending.values()) waiting.reject(new Error(message))
    this.pending.clear()
    this.port = this.listen(this.start())
  }

  hello() {
    return this.send<Hello>({ type: 'hello' })
  }

  process(bytes: ArrayBuffer, mime: string, settings: Settings, onEvent: (e: JobEvent) => void, signal?: AbortSignal) {
    return this.send<JobResult>({ type: 'process', bytes, mime, settings }, onEvent, signal, [bytes])
  }

  download(ids: ModelId[], onEvent: (e: JobEvent) => void, signal?: AbortSignal) {
    return this.send<void>({ type: 'download', ids }, onEvent, signal)
  }

  remove(ids: string[]) {
    return this.send<void>({ type: 'remove', ids })
  }

  clear() {
    return this.send<void>({ type: 'clear' })
  }

  private send<T>(
    request: DistributiveOmit<Request, 'id'>,
    onEvent?: (e: JobEvent) => void,
    signal?: AbortSignal,
    transfer: Transferable[] = [],
  ): Promise<T> {
    const id = this.next++
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onEvent })
      signal?.addEventListener('abort', () => this.port.postMessage({ type: 'cancel', id }, []), { once: true })
      this.port.postMessage({ ...request, id }, transfer)
    })
  }
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

/** Answers the client's requests with `handlers`, one AbortController per
 * request so a `cancel` stops it. */
export function serve(port: Port, handlers: Handlers) {
  const running = new Map<number, AbortController>()
  port.onmessage = async (event: MessageEvent<Request>) => {
    const request = event.data
    if (request.type === 'cancel') return running.get(request.id)?.abort()
    const controller = new AbortController()
    running.set(request.id, controller)
    const onEvent = (e: JobEvent) => port.postMessage({ type: 'event', id: request.id, event: e } satisfies Reply, [])
    try {
      let value: unknown
      let transfer: Transferable[] = []
      if (request.type === 'hello') value = await handlers.hello()
      else if (request.type === 'remove') value = await handlers.remove(request.ids)
      else if (request.type === 'clear') value = await handlers.clear()
      else if (request.type === 'download') value = await handlers.download(request.ids, onEvent, controller.signal)
      else {
        const job = { bytes: new Uint8Array(request.bytes), type: request.mime, settings: request.settings }
        const result = await handlers.process(job, onEvent, controller.signal)
        value = result
        transfer = [result.bytes]
      }
      port.postMessage({ type: 'done', id: request.id, value } satisfies Reply, transfer)
    } catch (error) {
      const cancelled = controller.signal.aborted
      const message = cancelled ? 'Cancelled' : error instanceof Error ? error.message : String(error)
      port.postMessage({ type: 'failed', id: request.id, message, cancelled } satisfies Reply, [])
    } finally {
      running.delete(request.id)
    }
  }
}
