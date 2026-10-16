import { DEFAULT_ASSET_BASE } from './manifest'

/** Where models and ONNX Runtime's wasm come from: R2 in production, the
 * dev server's copy of `assets-out/` in development, or `VITE_ASSET_BASE`. */
export const ASSET_BASE: string =
  import.meta.env.VITE_ASSET_BASE ?? (import.meta.env.DEV ? '/__assets' : DEFAULT_ASSET_BASE)

/** The Cache API cache the worker keeps assets in. */
export const ASSET_CACHE = 'art-cleaner-assets'
