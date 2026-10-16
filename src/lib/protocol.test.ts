import { afterEach, describe, expect, it } from 'vitest'
import type { JobEvent } from './engine'
import { EngineClient, type Handlers, serve } from './protocol'
import { DEFAULT_SETTINGS } from './settings'

let channels: MessageChannel[] = []
afterEach(() => {
  for (const c of channels) {
    c.port1.close()
    c.port2.close()
  }
  channels = []
})

function connect(handlers: Partial<Handlers>) {
  const channel = new MessageChannel()
  channels.push(channel)
  serve(channel.port2, handlers as Handlers)
  return new EngineClient(channel.port1)
}

describe('EngineClient and serve', () => {
  it('says hello', async () => {
    const client = connect({ hello: async () => ({ backend: 'webgpu', cached: ['ort'], isolated: true, threads: 4 }) })
    expect(await client.hello()).toEqual({ backend: 'webgpu', cached: ['ort'], isolated: true, threads: 4 })
  })

  it('runs a job, passing its events and its result back', async () => {
    const client = connect({
      process: async (job, onEvent) => {
        expect(new Uint8Array(job.bytes)).toEqual(new Uint8Array([9, 8]))
        expect(job.type).toBe('image/jpeg')
        onEvent({ phase: 'run', done: 1, total: 2 })
        return { bytes: new Uint8Array([1]).buffer, width: 3, height: 4, mime: 'image/png' }
      },
    })
    const events: JobEvent[] = []
    const result = await client.process(new Uint8Array([9, 8]).buffer, 'image/jpeg', DEFAULT_SETTINGS, (e) =>
      events.push(e),
    )
    expect(events).toEqual([{ phase: 'run', done: 1, total: 2 }])
    expect(result).toMatchObject({ width: 3, height: 4, mime: 'image/png' })
    expect(new Uint8Array(result.bytes)).toEqual(new Uint8Array([1]))
  })

  it('keeps simultaneous requests apart', async () => {
    const client = connect({
      process: async (job) => ({ bytes: new ArrayBuffer(0), width: job.bytes.length, height: 0, mime: '' }),
    })
    const [a, b] = await Promise.all([
      client.process(new ArrayBuffer(1), '', DEFAULT_SETTINGS, () => {}),
      client.process(new ArrayBuffer(2), '', DEFAULT_SETTINGS, () => {}),
    ])
    expect([a.width, b.width]).toEqual([1, 2])
  })

  it('passes errors back as errors', async () => {
    const client = connect({ clear: async () => Promise.reject(new Error('quota')) })
    await expect(client.clear()).rejects.toThrow('quota')
  })

  it('cancels a job through its signal', async () => {
    const client = connect({
      download: (_ids, _onEvent, signal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))),
    })
    const controller = new AbortController()
    const run = client.download(['denoiser'], () => {}, controller.signal)
    setTimeout(() => controller.abort(), 5)
    const error = await run.catch((e) => e)
    expect(error).toBeInstanceOf(DOMException)
    expect(error.name).toBe('AbortError')
  })
})
