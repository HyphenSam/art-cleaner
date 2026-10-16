/** Model sessions on ONNX Runtime Web: WebGPU when it works, else the CPU
 * (WebAssembly, threaded when the page is cross-origin isolated). */
import * as ort from 'onnxruntime-web/webgpu'
import loaderUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import type { Runtime } from '@/lib/engine'
import type { ModelId } from '@/lib/manifest'
import type { Backend } from '@/lib/settings'

export async function detectBackend(): Promise<Backend> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return (await gpu?.requestAdapter()) ? 'webgpu' : 'wasm'
  } catch {
    return 'wasm'
  }
}

export function threads(): number {
  return self.crossOriginIsolated ? Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8)) : 1
}

/** `wasm` is ORT's WebGPU build, already downloaded and checked; only its
 * small loader script is served with the app. */
export async function startRuntime(wasm: ArrayBuffer, onGpuLost: () => void): Promise<Runtime> {
  ort.env.wasm.wasmBinary = wasm
  ort.env.wasm.wasmPaths = { mjs: new URL(loaderUrl, self.location.href).href }
  ort.env.wasm.numThreads = threads()
  ort.env.logLevel = 'warning'
  return new OrtRuntime(onGpuLost)
}

type GpuDevice = { lost: Promise<{ reason: string; message: string }> }

class OrtRuntime implements Runtime {
  private sessions = new Map<ModelId, ort.InferenceSession>()
  private watching = false

  constructor(private readonly onGpuLost: () => void) {}

  async load(id: ModelId, model: ArrayBuffer, backend: Backend) {
    await this.release(id)
    const session = await ort.InferenceSession.create(new Uint8Array(model), {
      executionProviders: [backend],
      graphOptimizationLevel: 'all',
    })
    this.sessions.set(id, session)
    if (backend === 'webgpu' && !this.watching) {
      this.watching = true
      void this.watchGpu()
    }
  }

  /** A lost GPU (a driver reset, the GPU process crashing) leaves ORT's
   * pending calls unsettled for good, so the page has to start over. */
  private async watchGpu() {
    const device = (await ort.env.webgpu.device) as unknown as GpuDevice
    const info = await device.lost
    console.warn(`WebGPU device lost (${info.reason}): ${info.message}`)
    if (info.reason !== 'destroyed') this.onGpuLost()
  }

  async release(id: ModelId) {
    await this.sessions.get(id)?.release()
    this.sessions.delete(id)
  }

  async run(id: ModelId, tiles: Float32Array, n: number, size: number, sigma?: number) {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`The ${id} model isn't loaded.`)
    const feeds: Record<string, ort.Tensor> = { image: new ort.Tensor('float32', tiles, [n, 3, size, size]) }
    if (sigma !== undefined) feeds.sigma = new ort.Tensor('float32', new Float32Array(n).fill(sigma), [n, 1])
    const outputs = await session.run(feeds)
    const output = outputs[session.outputNames[0]]
    const data = (output.data as Float32Array).slice()
    output.dispose()
    return data
  }
}
