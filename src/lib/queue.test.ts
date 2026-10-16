import { describe, expect, it } from 'vitest'
import { type Item, nextQueued, progressOf, queue, type QueueAction } from './queue'

const file = (id: string): Item => ({ id, name: `${id}.png`, originalUrl: `blob:${id}`, status: 'queued', event: null })
const run = (items: Item[], ...actions: QueueAction[]) => actions.reduce(queue, items)
const result = { url: 'blob:out', name: 'a-denoised.png', width: 2, height: 3, size: 10 }

describe('queue', () => {
  it('adds files at the end, queued', () => {
    const items = run([], { type: 'add', items: [file('a'), file('b')] }, { type: 'add', items: [file('c')] })
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(nextQueued(items)?.id).toBe('a')
  })

  it('follows a job from start to result', () => {
    const items = run(
      [file('a'), file('b')],
      { type: 'start', id: 'a' },
      { type: 'event', id: 'a', event: { phase: 'run', done: 1, total: 4 } },
    )
    expect(items[0]).toMatchObject({ status: 'working', event: { phase: 'run', done: 1, total: 4 } })
    expect(nextQueued(items)?.id).toBe('b')

    const done = run(items, { type: 'done', id: 'a', result })
    expect(done[0]).toMatchObject({ status: 'done', result, event: null })
  })

  it('records failures and cancellations', () => {
    const items = run(
      [file('a'), file('b')],
      { type: 'start', id: 'a' },
      { type: 'failed', id: 'a', message: 'out of memory' },
      { type: 'start', id: 'b' },
      { type: 'cancelled', id: 'b' },
    )
    expect(items[0]).toMatchObject({ status: 'failed', error: 'out of memory' })
    expect(items[1]).toMatchObject({ status: 'cancelled' })
    expect(nextQueued(items)).toBeUndefined()
  })

  it('queues finished, failed and cancelled items again, dropping old results', () => {
    const items = run(
      [file('a'), file('b'), file('c')],
      { type: 'start', id: 'a' },
      { type: 'done', id: 'a', result },
      { type: 'start', id: 'b' },
      { type: 'failed', id: 'b', message: 'x' },
      { type: 'requeue', ids: ['a', 'b'] },
    )
    expect(items.map((i) => i.status)).toEqual(['queued', 'queued', 'queued'])
    expect(items[0].result).toBeUndefined()
    expect(items[1].error).toBeUndefined()
  })

  it("doesn't requeue the item that's being worked on", () => {
    const items = run([file('a')], { type: 'start', id: 'a' }, { type: 'requeue', ids: ['a'] })
    expect(items[0].status).toBe('working')
  })

  it('removes items and clears everything', () => {
    expect(run([file('a'), file('b')], { type: 'remove', id: 'a' }).map((i) => i.id)).toEqual(['b'])
    expect(run([file('a'), file('b')], { type: 'clear' })).toEqual([])
  })
})

describe('progressOf', () => {
  it('describes each phase with a fraction done', () => {
    expect(progressOf({ phase: 'download', loaded: 25, total: 100 })).toEqual({
      label: 'Downloading models',
      fraction: 0.25,
    })
    expect(progressOf({ phase: 'prepare' })).toEqual({ label: 'Preparing', fraction: null })
    expect(progressOf({ phase: 'run', done: 3, total: 12 })).toEqual({ label: 'Processing', fraction: 0.25 })
    expect(progressOf({ phase: 'run', done: 0, total: 0 })).toEqual({ label: 'Processing', fraction: 0 })
    expect(progressOf({ phase: 'encode' })).toEqual({ label: 'Saving', fraction: null })
  })
})
