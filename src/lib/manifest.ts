/** Every file the app downloads at run time (too big for Pages, so on R2),
 * with the sha256 it must have. Paths change whenever contents do, so they
 * can be cached forever. No imports: Node scripts import this file too. */

export type Asset = { id: string; file: string; sha256: string; size: number; path: string }

export type ModelId = 'denoiser' | 'cleaner' | 'cleanerFast'

export type Model = Asset & {
  id: ModelId
  name: string
  author: string
  licence: string
  licenceUrl: string
  sourceUrl: string
}

/** Must match the installed `onnxruntime-web` (a test checks). */
export const ORT_VERSION = '1.30.0'

/** Where assets live in production; dev serves `assets-out/` instead. */
export const DEFAULT_ASSET_BASE = 'https://asset.hyphensam.com/art-cleaner'

const model = (m: Omit<Model, 'path'>): Model => ({ ...m, path: `models/${m.sha256.slice(0, 12)}/${m.file}` })

export const MODELS: Record<ModelId, Model> = {
  denoiser: model({
    id: 'denoiser',
    name: 'GRDDenoiser',
    author: 'livinginparadise',
    file: 'grd_denoiser.onnx',
    sha256: 'c30f25fe71997e07db3b0d839b4450ba040854d96ad643160c7370cf9004a3b8',
    size: 8_818_216,
    licence: "Redistributed with the author's permission",
    licenceUrl: 'https://github.com/livinginparadise/GRDDenoiser',
    sourceUrl: 'https://github.com/livinginparadise/GRDDenoiser',
  }),
  cleaner: model({
    id: 'cleaner',
    name: '2x-AnimeSharpV4 (RCAN)',
    author: 'Kim2091',
    file: 'animesharp_v4_rcan_2x.onnx',
    sha256: '53b94269589af03dfec37092865261291d50d2f5fa13045607fdb798d65861e0',
    size: 37_001_806,
    licence: 'CC BY-NC-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    sourceUrl: 'https://huggingface.co/Kim2091/2x-AnimeSharpV4',
  }),
  cleanerFast: model({
    id: 'cleanerFast',
    name: '2x-AnimeSharpV4 Fast (RCAN PU)',
    author: 'Kim2091',
    file: 'animesharp_v4_fast_rcan_pu_2x.onnx',
    sha256: '7642ce7777da7e9e15955a22ea1946017bf0c508db199a3545d356e4ceed60f6',
    size: 38_978_681,
    licence: 'CC BY-NC-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    sourceUrl: 'https://huggingface.co/Kim2091/2x-AnimeSharpV4',
  }),
}

/** ONNX Runtime's WebGPU build (25.5 MB: over Pages' 25 MiB limit). */
export const ORT_WASM: Asset = {
  id: 'ort',
  file: 'ort-wasm-simd-threaded.asyncify.wasm',
  sha256: '39f9f0894d478800487ed9f7dbe92618498db320cf55c8e3d89adff8dce658da',
  size: 26_781_914,
  path: `ort/${ORT_VERSION}/ort-wasm-simd-threaded.asyncify.wasm`,
}

export const ALL_ASSETS: Asset[] = [ORT_WASM, ...Object.values(MODELS)]

export function assetUrl(base: string, asset: Asset): string {
  return `${base.replace(/\/+$/, '')}/${asset.path}`
}
