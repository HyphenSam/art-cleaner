import { describe, expect, it } from 'vitest'
import { type Codecs, Engine, type EngineDeps, type JobEvent, type Runtime } from './engine'
import type { Rgba } from './image'
import { type Asset, type ModelId, MODELS, ORT_WASM } from './manifest'
import { modelRuns } from './pipeline'
import { type Backend, DEFAULT_SETTINGS, type Settings, stepsOf } from './settings'
import { FakeModels, photo } from './testing'

class FakeRuntime implements Runtime {
  models = new FakeModels()
  sessions = new Map<ModelId, string>()
  created: string[] = []
  /** Each run's model and sigma. */
  runs: [ModelId, number | undefined][] = []
  failOn: string | null = null

  async load(id: ModelId, bytes: ArrayBuffer, backend: string) {
    if (bytes.byteLength === 0) throw new Error('no model bytes')
    if (this.failOn === backend) throw new Error(`${backend} refused ${id}`)
    this.created.push(`${id}@${backend}`)
    this.sessions.set(id, backend)
  }
  async release(id: ModelId) {
    this.sessions.delete(id)
  }
  async run(id: ModelId, tiles: Float32Array, n: number, size: number, sigma?: number) {
    if (!this.sessions.has(id)) throw new Error(`${id} isn't loaded`)
    this.runs.push([id, sigma])
    if (id === 'translator') return tiles.slice()
    return id.startsWith('cleaner') ? this.models.upscale(tiles, n, size) : this.models.denoise(tiles, n, size, sigma!)
  }
}

function setup({ backend = 'webgpu' as Backend, image = photo(300, 200), upright = false } = {}) {
  const runtime = new FakeRuntime()
  const downloads: string[] = []
  const decoded: Rgba[] = []
  const codecs: Codecs = {
    async decode() {
      return { image, upright }
    },
    async encode(img) {
      decoded.push(img)
      return new Uint8Array([1, 2, 3]).buffer
    },
  }
  const deps: EngineDeps = {
    detectBackend: async () => backend,
    startRuntime: async (wasm) => {
      expect(wasm.byteLength).toBe(1)
      return runtime
    },
    codecs,
    load: async (asset: Asset, onProgress) => {
      downloads.push(asset.id)
      onProgress(asset.size / 2, asset.size)
      onProgress(asset.size, asset.size)
      return new ArrayBuffer(1)
    },
  }
  return { engine: new Engine(deps), runtime, downloads, encoded: decoded }
}

const job = (settings: Settings = DEFAULT_SETTINGS) => ({ bytes: new Uint8Array([0]), type: 'image/png', settings })

describe('Engine.process', () => {
  it('downloads what the job needs, runs it and encodes the result', async () => {
    const { engine, runtime, downloads, encoded } = setup()
    const events: JobEvent[] = []
    const result = await engine.process(job(), (e) => events.push(e))
    expect(downloads).toEqual(['ort', 'denoiser', 'cleaner'])
    expect(runtime.created).toEqual(['denoiser@webgpu', 'cleaner@webgpu'])
    expect(result).toMatchObject({ width: 300, height: 200, mime: 'image/png' })
    expect(new Uint8Array(result.bytes)).toEqual(new Uint8Array([1, 2, 3]))
    expect(encoded[0].width).toBe(300)

    const total = ORT_WASM.size + MODELS.denoiser.size + MODELS.cleaner.size
    const download = events.filter((e) => e.phase === 'download')
    expect(download.at(-1)).toEqual({ phase: 'download', loaded: total, total })
    const runs = events.filter((e) => e.phase === 'run')
    const expected = modelRuns(300, 200, stepsOf(DEFAULT_SETTINGS))
    expect(runs.at(-1)).toEqual({ phase: 'run', done: expected, total: expected })
    expect(events.at(-1)).toEqual({ phase: 'encode' })
  })

  it('uses the fast cleaner on the CPU by default', async () => {
    const { engine, runtime } = setup({ backend: 'wasm' })
    await engine.process(job(), () => {})
    expect(runtime.created).toEqual(['denoiser@wasm', 'cleanerFast@wasm'])
  })

  it('keeps sessions between jobs, and swaps the cleaner when the choice changes', async () => {
    const { engine, runtime, downloads } = setup()
    await engine.process(job(), () => {})
    await engine.process(job(), () => {})
    expect(runtime.created).toEqual(['denoiser@webgpu', 'cleaner@webgpu'])
    expect(downloads).toEqual(['ort', 'denoiser', 'cleaner'])

    await engine.process(job({ ...DEFAULT_SETTINGS, cleaner: 'fast' }), () => {})
    expect([...runtime.sessions.keys()].sort()).toEqual(['cleanerFast', 'denoiser'])
  })

  it('keeps the cleaner loaded through jobs that only denoise', async () => {
    // Releasing and re-creating a WebGPU session is where the page hung on "Preparing".
    const { engine, runtime } = setup()
    const fast = { ...DEFAULT_SETTINGS, cleaner: 'fast' as const }
    await engine.process(job(fast), () => {})
    await engine.process(job({ ...fast, clean: false }), () => {})
    await engine.process(job(fast), () => {})
    expect(runtime.created).toEqual(['denoiser@webgpu', 'cleanerFast@webgpu'])
    expect([...runtime.sessions.keys()].sort()).toEqual(['cleanerFast', 'denoiser'])
  })

  it('runs DenoiseGAN without a noise level, after the translator when asked', async () => {
    const { engine, runtime, downloads } = setup({ image: photo(40, 30) })
    await engine.process(job({ ...DEFAULT_SETTINGS, denoiser: 'gan', clean: false }), () => {})
    expect(downloads).toEqual(['ort', 'denoiserGan'])
    expect(runtime.runs).toEqual([['denoiserGan', undefined]])

    runtime.runs = []
    await engine.process(job({ ...DEFAULT_SETTINGS, denoiser: 'gan', translator: true, clean: false }), () => {})
    expect(runtime.runs).toEqual([
      ['translator', undefined],
      ['denoiserGan', undefined],
    ])
  })

  it('swaps the denoiser when the choice changes, keeping the translator until then', async () => {
    const { engine, runtime } = setup({ image: photo(40, 30) })
    const gan = { ...DEFAULT_SETTINGS, denoiser: 'gan' as const, translator: true }
    await engine.process(job(gan), () => {})
    await engine.process(job({ ...gan, translator: false }), () => {})
    expect([...runtime.sessions.keys()].sort()).toEqual(['cleaner', 'denoiserGan', 'translator'])
    await engine.process(job({ ...gan, denoiser: 'grd' }), () => {})
    expect([...runtime.sessions.keys()].sort()).toEqual(['cleaner', 'denoiser'])
    // Cleaning only keeps the denoiser loaded.
    await engine.process(job({ ...gan, denoise: false }), () => {})
    expect([...runtime.sessions.keys()].sort()).toEqual(['cleaner', 'denoiser'])
  })

  it('falls back to the CPU when WebGPU refuses a model', async () => {
    const { engine, runtime } = setup()
    runtime.failOn = 'webgpu'
    await engine.process(job(), () => {})
    expect(runtime.created).toEqual(['denoiser@wasm', 'cleanerFast@wasm'])
    expect(await engine.backend()).toBe('wasm')
  })

  it('turns the image upright unless the decoder already did', async () => {
    // A 6 (quarter turn) orientation in a minimal JPEG.
    const exif = [
      0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0,
      0, 0,
    ]
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, 0xff, 0xda])
    const turned = setup()
    const result = await turned.engine.process({ ...job(), bytes }, () => {})
    expect([result.width, result.height]).toEqual([200, 300])

    const already = setup({ upright: true })
    const kept = await already.engine.process({ ...job(), bytes }, () => {})
    expect([kept.width, kept.height]).toEqual([300, 200])
  })

  it('reports the 2× size when keeping it', async () => {
    const { engine } = setup({ image: photo(40, 30) })
    const result = await engine.process(job({ ...DEFAULT_SETTINGS, keepUpscaled: true }), () => {})
    expect([result.width, result.height]).toEqual([80, 60])
  })

  it('stops between model runs when cancelled', async () => {
    const { engine, runtime } = setup({ image: photo(700, 500) })
    const controller = new AbortController()
    const run = engine.process(
      job(),
      (e) => {
        if (e.phase === 'run' && e.done === 2) controller.abort()
      },
      controller.signal,
    )
    await expect(run).rejects.toThrow(/abort/i)
    expect(runtime.models.calls).toHaveLength(2)
  })

  it('refuses a job with nothing to do', async () => {
    const { engine } = setup()
    await expect(engine.process(job({ ...DEFAULT_SETTINGS, denoise: false, clean: false }), () => {})).rejects.toThrow(
      /nothing to do/i,
    )
  })
})

describe('Engine.download', () => {
  it('fetches the runtime and the chosen models without starting anything', async () => {
    const { engine, runtime, downloads } = setup({ backend: 'wasm' })
    await engine.download(['denoiser', 'cleanerFast'], () => {})
    expect(downloads).toEqual(['ort', 'denoiser', 'cleanerFast'])
    expect(runtime.created).toEqual([])
  })
})
