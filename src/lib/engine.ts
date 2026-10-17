/** The worker's logic: fetch what a job needs, keep model sessions loaded,
 * decode, run the pipeline, encode. ONNX Runtime, the codecs and the
 * network come in as dependencies, so this is tested with fakes. */
import type { Rgba } from './image'
import { type Asset, type ModelId, MODELS, ORT_WASM } from './manifest'
import { orient, readOrientation } from './orientation'
import { apply, type Models, modelRuns } from './pipeline'
import {
  type Backend,
  cleanerModel,
  denoiserModels,
  modelsNeeded,
  type OutputFormat,
  type Settings,
  stepsOf,
} from './settings'

/** Model sessions on ONNX Runtime. */
export interface Runtime {
  /** (Re)creates the model's session on `backend`. */
  load(id: ModelId, model: ArrayBuffer, backend: Backend): Promise<void>
  release(id: ModelId): Promise<void>
  run(id: ModelId, tiles: Float32Array, n: number, size: number, sigma?: number): Promise<Float32Array>
}

export type Decoded = {
  image: Rgba
  /** The decoder applied the EXIF orientation already. */
  upright: boolean
}

export interface Codecs {
  decode(bytes: Uint8Array, type: string): Promise<Decoded>
  encode(image: Rgba, format: OutputFormat, quality: number): Promise<ArrayBuffer>
}

export type EngineDeps = {
  detectBackend(): Promise<Backend>
  startRuntime(wasm: ArrayBuffer): Promise<Runtime>
  codecs: Codecs
  /** An asset's bytes, from the cache or downloaded and checked. */
  load(asset: Asset, onProgress: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<ArrayBuffer>
}

export type JobEvent =
  | { phase: 'download'; loaded: number; total: number }
  | { phase: 'prepare' }
  | { phase: 'run'; done: number; total: number }
  | { phase: 'encode' }

export type Job = { bytes: Uint8Array; type: string; settings: Settings }

export type JobResult = { bytes: ArrayBuffer; width: number; height: number; mime: string }

const MIME: Record<OutputFormat, string> = { png: 'image/png', 'webp-lossless': 'image/webp', webp: 'image/webp' }

export class Engine {
  private detected: Promise<Backend> | null = null
  private fellBack = false
  private runtime: Runtime | null = null
  private loaded = new Set<ModelId>()

  constructor(private readonly deps: EngineDeps) {}

  /** WebGPU when the browser has a usable adapter and it has worked so far. */
  async backend(): Promise<Backend> {
    if (this.fellBack) return 'wasm'
    this.detected ??= this.deps.detectBackend()
    return this.detected
  }

  /** Downloads the runtime and `ids` into the cache, for offline use. */
  async download(ids: ModelId[], onEvent: (e: JobEvent) => void, signal?: AbortSignal) {
    await this.fetchAll([ORT_WASM, ...ids.map((id) => MODELS[id])], onEvent, signal)
  }

  async process(job: Job, onEvent: (e: JobEvent) => void, signal?: AbortSignal): Promise<JobResult> {
    const steps = stepsOf(job.settings)
    if (!steps.denoise && !steps.clean) throw new Error('Nothing to do: turn on Denoise or Clean.')
    const backend = await this.backend()
    const ids = modelsNeeded(job.settings, backend)
    const missing = ids.filter((id) => !this.loaded.has(id))
    const assets = [...(this.runtime ? [] : [ORT_WASM]), ...missing.map((id) => MODELS[id])]
    const bytes = await this.fetchAll(assets, onEvent, signal)

    onEvent({ phase: 'prepare' })
    this.runtime ??= await this.deps.startRuntime(bytes.get(ORT_WASM.id)!)
    const runtime = this.runtime
    // One choice of model per step at a time: they're big. A model stays
    // loaded until a job loads another for its step, since re-creating a
    // WebGPU session after releasing it could hang ORT.
    const cleaner = cleanerModel(job.settings.cleaner, backend)
    const swapping = new Set(missing.map((id) => MODELS[id].step))
    for (const id of this.loaded) {
      if (!ids.includes(id) && swapping.has(MODELS[id].step)) {
        await runtime.release(id)
        this.loaded.delete(id)
      }
    }
    try {
      for (const id of missing) {
        await runtime.load(id, bytes.get(id)!, backend)
        this.loaded.add(id)
      }
    } catch (error) {
      if (backend !== 'webgpu') throw error
      // WebGPU refused a graph or couldn't start; the CPU runs everything.
      this.fellBack = true
      for (const id of this.loaded) await runtime.release(id)
      this.loaded.clear()
      return this.process(job, onEvent, signal)
    }
    bytes.clear()

    const decoded = await this.deps.codecs.decode(job.bytes, job.type)
    const image = decoded.upright ? decoded.image : orient(decoded.image, readOrientation(job.bytes))
    const denoisers = denoiserModels(job.settings)
    const models: Models = {
      async denoise(tiles, n, size, sigma) {
        signal?.throwIfAborted()
        // Only GRDDenoiser takes the noise level.
        for (const id of denoisers) tiles = await runtime.run(id, tiles, n, size, id === 'denoiser' ? sigma : undefined)
        return tiles
      },
      upscale(tiles, n, size) {
        signal?.throwIfAborted()
        return runtime.run(cleaner, tiles, n, size)
      },
    }
    const total = modelRuns(image.width, image.height, steps)
    let done = 0
    onEvent({ phase: 'run', done, total })
    const result = await apply(image, steps, models, () => {
      onEvent({ phase: 'run', done: ++done, total })
      signal?.throwIfAborted()
    })

    onEvent({ phase: 'encode' })
    const { format, quality } = job.settings
    const encoded = await this.deps.codecs.encode(result, format, quality)
    return { bytes: encoded, width: result.width, height: result.height, mime: MIME[format] }
  }

  /** Each asset's bytes, with one progress bar over all of them. */
  private async fetchAll(assets: Asset[], onEvent: (e: JobEvent) => void, signal?: AbortSignal) {
    const total = assets.reduce((sum, a) => sum + a.size, 0)
    const bytes = new Map<string, ArrayBuffer>()
    let finished = 0
    for (const asset of assets) {
      bytes.set(
        asset.id,
        await this.deps.load(
          asset,
          (loaded) => onEvent({ phase: 'download', loaded: finished + loaded, total }),
          signal,
        ),
      )
      finished += asset.size
    }
    return bytes
  }
}
