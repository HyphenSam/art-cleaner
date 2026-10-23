/** Every file the app downloads at run time (too big for Pages, so on R2),
 * with the sha256 it must have. Paths change whenever contents do, so they
 * can be cached forever. No imports: Node scripts import this file too. */

export type Asset = { id: string; file: string; sha256: string; size: number; path: string }

export type ModelId = 'denoiser' | 'denoiserGan' | 'translator' | 'cleaner'

export type Model = Asset & {
  id: ModelId
  /** The pipeline step it runs in. */
  step: 'denoise' | 'clean'
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
    step: 'denoise',
    name: 'GRDDenoiser',
    author: 'livinginparadise',
    file: 'grd_denoiser.onnx',
    sha256: 'c30f25fe71997e07db3b0d839b4450ba040854d96ad643160c7370cf9004a3b8',
    size: 8_818_216,
    licence: "Redistributed with the author's permission",
    licenceUrl: 'https://github.com/livinginparadise/GRDDenoiser',
    sourceUrl: 'https://github.com/livinginparadise/GRDDenoiser',
  }),
  denoiserGan: model({
    id: 'denoiserGan',
    step: 'denoise',
    name: 'DenoiseGAN',
    author: 'livinginparadise',
    file: 'denoisegan.onnx',
    sha256: '14d13dfd43910ec684007d762e8c3ed0d55efec4ab2c8ea4a6406d4c00ce5312',
    size: 45_106_556,
    licence: 'MIT',
    licenceUrl: 'https://github.com/livinginparadise/OmniGAN/blob/main/LICENSE',
    sourceUrl: 'https://huggingface.co/orangepegasus/DenoiseGAN',
  }),
  translator: model({
    id: 'translator',
    step: 'denoise',
    name: 'DenoiseGAN noise translator',
    author: 'livinginparadise',
    file: 'denoisegan_translator.onnx',
    sha256: '0c101d042b6e39ea70a511aad8a64cad13566ddb8a76b570c57841332ea179b3',
    size: 1_535_370,
    licence: 'MIT',
    licenceUrl: 'https://github.com/livinginparadise/OmniGAN/blob/main/LICENSE',
    sourceUrl: 'https://huggingface.co/orangepegasus/DenoiseGAN',
  }),
  cleaner: model({
    id: 'cleaner',
    step: 'clean',
    name: '2x IllustrationJaNai V3detail (FDAT M)',
    author: 'the-database',
    file: 'illustrationjanai_v3detail_fdat_m_2x.onnx',
    sha256: '6e6824dcd1befd2cc008865b92a9e9f3dfd60ef21754d091c8f6c58c42dcff8c',
    size: 16_997_541,
    licence: 'CC BY-NC 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
    sourceUrl: 'https://github.com/the-database/mangajanai/releases/tag/3.0.0',
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
