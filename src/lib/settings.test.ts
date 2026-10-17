import { describe, expect, it } from 'vitest'
import { cleanerModel, DEFAULT_SETTINGS, modelsNeeded, parseSettings, type Settings, stepsOf } from './settings'

const BOTH: Settings = { ...DEFAULT_SETTINGS, denoise: true, clean: true }

describe('settings', () => {
  it('defaults to no steps, with GRD, the fast cleaner and PNG at the original size', () => {
    // No guess at whether the art needs denoising, cleaning or both.
    expect(DEFAULT_SETTINGS).toMatchObject({
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
    })
  })

  it('reads saved settings, falling back to defaults for anything invalid', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, passes: 3, format: 'webp' })).toEqual({
      ...DEFAULT_SETTINGS,
      passes: 3,
      format: 'webp',
    })
    expect(parseSettings({ ...DEFAULT_SETTINGS, denoiser: 'gan', translator: true })).toEqual({
      ...DEFAULT_SETTINGS,
      denoiser: 'gan',
      translator: true,
    })
    expect(
      parseSettings({
        passes: 9,
        format: 'gif',
        quality: 500,
        clean: 'yes',
        cleaner: 'turbo',
        denoiser: 'x',
        translator: 1,
      }),
    ).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    // Auto is gone; it becomes the default.
    expect(parseSettings({ ...DEFAULT_SETTINGS, cleaner: 'auto' })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ ...DEFAULT_SETTINGS, cleaner: 'full', denoise: true })).toEqual({
      ...DEFAULT_SETTINGS,
      cleaner: 'full',
      denoise: true,
    })
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS)
  })

  it('turns settings into pipeline steps', () => {
    expect(stepsOf(BOTH)).toEqual({
      denoise: { passes: 1, maxQuality: false },
      clean: { keepUpscaled: false },
    })
    expect(stepsOf({ ...BOTH, denoise: false, keepUpscaled: true })).toEqual({
      clean: { keepUpscaled: true },
    })
    expect(stepsOf({ ...BOTH, clean: false })).toEqual({ denoise: { passes: 1, maxQuality: false } })
  })

  it('runs DenoiseGAN one tile at a time', () => {
    expect(stepsOf({ ...BOTH, denoiser: 'gan', passes: 2 }).denoise).toEqual({
      passes: 2,
      maxQuality: false,
      batch: 1,
    })
  })

  it('uses the cleaner chosen, on any device', () => {
    expect(cleanerModel('fast')).toBe('cleanerFast')
    expect(cleanerModel('full')).toBe('cleaner')
  })

  it('lists the models a job needs', () => {
    expect(modelsNeeded(BOTH)).toEqual(['denoiser', 'cleanerFast'])
    expect(modelsNeeded(DEFAULT_SETTINGS)).toEqual([])
    expect(modelsNeeded({ ...BOTH, denoise: false })).toEqual(['cleanerFast'])
    expect(modelsNeeded({ ...BOTH, denoise: false, cleaner: 'full' })).toEqual(['cleaner'])
    expect(modelsNeeded({ ...BOTH, clean: false })).toEqual(['denoiser'])
    expect(modelsNeeded({ ...BOTH, denoiser: 'gan' })).toEqual(['denoiserGan', 'cleanerFast'])
    expect(modelsNeeded({ ...BOTH, denoiser: 'gan', translator: true, clean: false })).toEqual([
      'translator',
      'denoiserGan',
    ])
    // The translator only goes with DenoiseGAN.
    expect(modelsNeeded({ ...BOTH, translator: true, clean: false })).toEqual(['denoiser'])
  })
})
