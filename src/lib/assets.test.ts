import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { type AssetCache, cachedIds, loadAsset, pruneCache } from './assets'
import type { Asset } from './manifest'

const bytes = new Uint8Array(1000).map((_, i) => i * 7)
const asset: Asset = {
  id: 'thing',
  file: 'thing.onnx',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: bytes.length,
  path: 'models/abc/thing.onnx',
}
const URL_ = 'https://assets.example/models/abc/thing.onnx'

class MemoryCache implements AssetCache {
  entries = new Map<string, Uint8Array>()
  async match(url: string) {
    const b = this.entries.get(url)
    return b ? new Response(b.slice()) : undefined
  }
  async put(url: string, response: Response) {
    this.entries.set(url, new Uint8Array(await response.arrayBuffer()))
  }
  async delete(url: string) {
    return this.entries.delete(url)
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url))
  }
}

/** Serves `body` in chunks of 300 bytes and counts requests. */
function server(body: Uint8Array, status = 200) {
  const s = {
    requests: 0,
    inits: [] as (RequestInit | undefined)[],
    fetch: async (_url: string, init?: RequestInit) => {
      s.requests++
      s.inits.push(init)
      let at = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (at >= body.length) return controller.close()
          controller.enqueue(body.slice(at, at + 300))
          at += 300
        },
      })
      return new Response(stream, { status })
    },
  }
  return s
}

describe('loadAsset', () => {
  it('downloads, reports progress, checks the hash and caches', async () => {
    const cache = new MemoryCache()
    const net = server(bytes)
    const seen: number[] = []
    const got = await loadAsset(asset, URL_, {
      cache,
      fetch: net.fetch,
      onProgress: (loaded, total) => {
        expect(total).toBe(1000)
        seen.push(loaded)
      },
    })
    expect(new Uint8Array(got)).toEqual(bytes)
    expect(seen).toEqual([300, 600, 900, 1000])
    expect(cache.entries.get(URL_)).toEqual(bytes)
  })

  it("skips the browser's HTTP cache, which may hold a copy from before CORS was set up", async () => {
    const net = server(bytes)
    await loadAsset(asset, URL_, { cache: new MemoryCache(), fetch: net.fetch })
    expect(net.inits[0]).toMatchObject({ cache: 'no-store' })
  })

  it('uses a good cached copy without downloading', async () => {
    const cache = new MemoryCache()
    cache.entries.set(URL_, bytes)
    const net = server(bytes)
    expect(new Uint8Array(await loadAsset(asset, URL_, { cache, fetch: net.fetch }))).toEqual(bytes)
    expect(net.requests).toBe(0)
  })

  it('downloads again when the cached copy is damaged', async () => {
    const cache = new MemoryCache()
    cache.entries.set(
      URL_,
      bytes.map((b) => b ^ 1),
    )
    const net = server(bytes)
    expect(new Uint8Array(await loadAsset(asset, URL_, { cache, fetch: net.fetch }))).toEqual(bytes)
    expect(net.requests).toBe(1)
    expect(cache.entries.get(URL_)).toEqual(bytes)
  })

  it("refuses a download that doesn't match its hash, and doesn't cache it", async () => {
    const cache = new MemoryCache()
    const net = server(bytes.map((b) => b ^ 1))
    await expect(loadAsset(asset, URL_, { cache, fetch: net.fetch })).rejects.toThrow(/checksum/)
    expect(cache.entries.size).toBe(0)
  })

  it('says what failed on an HTTP error', async () => {
    const net = server(new Uint8Array(), 404)
    await expect(loadAsset(asset, URL_, { cache: new MemoryCache(), fetch: net.fetch })).rejects.toThrow(
      /thing\.onnx.*404/,
    )
  })

  it('refuses a download bigger than expected', async () => {
    const net = server(new Uint8Array(2000))
    await expect(loadAsset(asset, URL_, { cache: new MemoryCache(), fetch: net.fetch })).rejects.toThrow(/size/)
  })
})

describe('cachedIds', () => {
  it('lists the assets the cache holds', async () => {
    const cache = new MemoryCache()
    cache.entries.set(URL_, bytes)
    const other = { ...asset, id: 'other', path: 'x/other' }
    const ids = await cachedIds([asset, other], (a) => `https://assets.example/${a.path}`, cache)
    expect(ids).toEqual(new Set(['thing']))
  })
})

describe('pruneCache', () => {
  it("removes what isn't wanted any more, such as an older version", async () => {
    const cache = new MemoryCache()
    cache.entries.set(URL_, bytes)
    cache.entries.set('https://assets.example/models/old/thing.onnx', bytes)
    await pruneCache(cache, [URL_])
    expect([...cache.entries.keys()]).toEqual([URL_])
  })
})
