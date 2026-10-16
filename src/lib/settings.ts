/** What the user picks, its defaults, and what it means for a job. */
import type { ModelId } from './manifest'
import type { Steps } from './pipeline'

export type Backend = 'webgpu' | 'wasm'
export type CleanerChoice = 'auto' | 'full' | 'fast'
export type OutputFormat = 'png' | 'webp-lossless' | 'webp'

export type Settings = {
  denoise: boolean
  passes: number
  maxQuality: boolean
  clean: boolean
  cleaner: CleanerChoice
  keepUpscaled: boolean
  format: OutputFormat
  /** Lossy WebP's quality, 1–100. */
  quality: number
}

export const DEFAULT_SETTINGS: Settings = {
  denoise: true,
  passes: 1,
  maxQuality: false,
  clean: true,
  cleaner: 'auto',
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
    passes: int(s.passes, 1, 3, d.passes),
    maxQuality: bool(s.maxQuality, d.maxQuality),
    clean: bool(s.clean, d.clean),
    cleaner: oneOf(s.cleaner, ['auto', 'full', 'fast'], d.cleaner),
    keepUpscaled: bool(s.keepUpscaled, d.keepUpscaled),
    format: oneOf(s.format, ['png', 'webp-lossless', 'webp'], d.format),
    quality: int(s.quality, 1, 100, d.quality),
  }
}

export function stepsOf(s: Settings): Steps {
  return {
    ...(s.denoise && { denoise: { passes: s.passes, maxQuality: s.maxQuality } }),
    ...(s.clean && { clean: { keepUpscaled: s.keepUpscaled } }),
  }
}

/** The full model on the GPU; on the CPU the fast one, which is about six
 * times quicker for about 95% of the quality. */
export function cleanerModel(choice: CleanerChoice, backend: Backend): ModelId {
  if (choice === 'full') return 'cleaner'
  if (choice === 'fast') return 'cleanerFast'
  return backend === 'webgpu' ? 'cleaner' : 'cleanerFast'
}

export function modelsNeeded(s: Settings, backend: Backend): ModelId[] {
  return [...(s.denoise ? (['denoiser'] as const) : []), ...(s.clean ? [cleanerModel(s.cleaner, backend)] : [])]
}
