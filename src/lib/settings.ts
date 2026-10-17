/** What the user picks, its defaults, and what it means for a job. */
import type { ModelId } from './manifest'
import type { Steps } from './pipeline'

export type Backend = 'webgpu' | 'wasm'
export type DenoiserChoice = 'grd' | 'gan'
export type CleanerChoice = 'fast' | 'full'
export type OutputFormat = 'png' | 'webp-lossless' | 'webp'

export type Settings = {
  denoise: boolean
  denoiser: DenoiserChoice
  /** DenoiseGAN's noise translator, for noise it wasn't trained on. */
  translator: boolean
  passes: number
  maxQuality: boolean
  clean: boolean
  cleaner: CleanerChoice
  keepUpscaled: boolean
  format: OutputFormat
  /** Lossy WebP's quality, 1–100. */
  quality: number
}

// Neither step is on: whether the art needs denoising, cleaning or both is the user's call.
export const DEFAULT_SETTINGS: Settings = {
  denoise: false,
  denoiser: 'grd',
  translator: false,
  passes: 1,
  maxQuality: false,
  clean: false,
  cleaner: 'fast',
  keepUpscaled: false,
  format: 'png',
  quality: 95,
}

/** Saved settings, each field checked; anything invalid gets its default. */
export function parseSettings(saved: unknown): Settings {
  const s = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  const int = (v: unknown, lo: number, hi: number, fallback: number) =>
    Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : fallback
  const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T) =>
    options.includes(v as T) ? (v as T) : fallback
  return {
    denoise: bool(s.denoise, d.denoise),
    denoiser: oneOf(s.denoiser, ['grd', 'gan'], d.denoiser),
    translator: bool(s.translator, d.translator),
    passes: int(s.passes, 1, 3, d.passes),
    maxQuality: bool(s.maxQuality, d.maxQuality),
    clean: bool(s.clean, d.clean),
    cleaner: oneOf(s.cleaner, ['fast', 'full'], d.cleaner),
    keepUpscaled: bool(s.keepUpscaled, d.keepUpscaled),
    format: oneOf(s.format, ['png', 'webp-lossless', 'webp'], d.format),
    quality: int(s.quality, 1, 100, d.quality),
  }
}

export function stepsOf(s: Settings): Steps {
  return {
    ...(s.denoise && {
      // DenoiseGAN needs about 0.6 GB per tile: 8 at once is past WebAssembly's 4 GB.
      denoise: { passes: s.passes, maxQuality: s.maxQuality, ...(s.denoiser === 'gan' && { batch: 1 }) },
    }),
    ...(s.clean && { clean: { keepUpscaled: s.keepUpscaled } }),
  }
}

/** Fast is about six times quicker than Full for about 95% of the quality. */
export function cleanerModel(choice: CleanerChoice): ModelId {
  return choice === 'full' ? 'cleaner' : 'cleanerFast'
}

/** In the order they run. */
export function denoiserModels(s: Settings): ModelId[] {
  if (s.denoiser === 'grd') return ['denoiser']
  return s.translator ? ['translator', 'denoiserGan'] : ['denoiserGan']
}

export function modelsNeeded(s: Settings): ModelId[] {
  return [...(s.denoise ? denoiserModels(s) : []), ...(s.clean ? [cleanerModel(s.cleaner)] : [])]
}
