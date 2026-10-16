/** Downloading the models and ONNX Runtime's wasm once, keeping them in the
 * Cache API for offline use, and checking every copy's sha256 before use. */
import type { Asset } from './manifest'

/** The part of the Cache API this needs (a `Cache` fits). */
export interface AssetCache {
  match(url: string): Promise<Response | undefined>
  put(url: string, response: Response): Promise<void>
  delete(url: string): Promise<boolean>
  keys(): Promise<readonly Request[]>
}

export type LoadOptions = {
  cache: AssetCache
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  onProgress?: (loaded: number, total: number) => void
  signal?: AbortSignal
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The asset's bytes, from the cache when its copy is intact, otherwise
 * downloaded, checked and cached. */
export async function loadAsset(asset: Asset, url: string, options: LoadOptions): Promise<ArrayBuffer> {
  const { cache } = options
  const cached = await cache.match(url)
  if (cached) {
    const data = await cached.arrayBuffer()
    if (data.byteLength === asset.size && (await sha256Hex(data)) === asset.sha256) return data
    await cache.delete(url)
  }
  const data = await download(asset, url, options)
  if ((await sha256Hex(data)) !== asset.sha256) {
    throw new Error(`${asset.file} doesn't match its checksum; the download may be damaged. Try again.`)
  }
  await cache.put(url, new Response(data, { headers: { 'Content-Type': 'application/octet-stream' } }))
  return data.buffer
}

async function download(asset: Asset, url: string, { fetch, onProgress, signal }: LoadOptions) {
  const response = await fetch(url, { signal })
  if (!response.ok || !response.body) throw new Error(`Couldn't download ${asset.file} (HTTP ${response.status}).`)
  const data = new Uint8Array(asset.size)
  const reader = response.body.getReader()
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (loaded + value.length > asset.size) {
      await reader.cancel()
      throw new Error(`${asset.file} isn't the expected size.`)
    }
    data.set(value, loaded)
    loaded += value.length
    onProgress?.(loaded, asset.size)
  }
  if (loaded !== asset.size) throw new Error(`${asset.file} isn't the expected size.`)
  return data
}

/** Which of `assets` the cache holds (without checking them). */
export async function cachedIds(assets: Asset[], urlOf: (a: Asset) => string, cache: AssetCache) {
  const held = await Promise.all(assets.map(async (a) => ((await cache.match(urlOf(a))) ? a.id : null)))
  return new Set(held.filter((id): id is string => id !== null))
}

/** Deletes every entry but `keep`, such as files from older versions. */
export async function pruneCache(cache: AssetCache, keep: string[]) {
  for (const request of await cache.keys()) if (!keep.includes(request.url)) await cache.delete(request.url)
}
