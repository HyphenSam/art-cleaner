/// <reference lib="webworker" />
/** The worker: owns ONNX Runtime and the codecs, runs one job at a time
 * (the page queues them) and answers the page through `serve`. */
import { cachedIds, loadAsset, pruneCache } from '@/lib/assets'
import { ASSET_BASE, ASSET_CACHE } from '@/lib/config'
import { Engine } from '@/lib/engine'
import { ALL_ASSETS, type Asset, assetUrl } from '@/lib/manifest'
import { type Port, serve } from '@/lib/protocol'
import { codecs } from './codecs'
import { detectBackend, startRuntime, threads } from './ort'

const urlOf = (asset: Asset) => new URL(assetUrl(ASSET_BASE, asset), self.location.href).href
const cache = () => caches.open(ASSET_CACHE)

const engine = new Engine({
  detectBackend,
  startRuntime,
  codecs,
  load: async (asset, onProgress, signal) =>
    loadAsset(asset, urlOf(asset), { cache: await cache(), fetch, onProgress, signal }),
})

serve(self as unknown as Port, {
  async hello() {
    const store = await cache()
    await pruneCache(store, ALL_ASSETS.map(urlOf))
    const cached = await cachedIds(ALL_ASSETS, urlOf, store)
    return {
      backend: await engine.backend(),
      cached: [...cached],
      isolated: self.crossOriginIsolated,
      threads: threads(),
    }
  },
  process: (job, onEvent, signal) => engine.process(job, onEvent, signal),
  download: (ids, onEvent, signal) => engine.download(ids, onEvent, signal),
  async clear() {
    await caches.delete(ASSET_CACHE)
  },
})
