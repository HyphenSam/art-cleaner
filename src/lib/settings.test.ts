import { describe, expect, it } from 'vitest'
import { cleanerModel, DEFAULT_SETTINGS, modelsNeeded, parseSettings, stepsOf } from './settings'

describe('settings', () => {
  it('defaults to denoising and cleaning at the original size, as PNG', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      denoise: true,
      passes: 1,
      maxQuality: false,
      clean: true,
      cleaner: 'auto',
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
    expect(parseSettings({ passes: 9, format: 'gif', quality: 500, clean: 'yes', cleaner: 'turbo' })).toEqual(
      DEFAULT_SETTINGS,
    )
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS)
  })

  it('turns settings into pipeline steps', () => {
    expect(stepsOf(DEFAULT_SETTINGS)).toEqual({
      denoise: { passes: 1, maxQuality: false },
      clean: { keepUpscaled: false },
    })
    expect(stepsOf({ ...DEFAULT_SETTINGS, denoise: false, keepUpscaled: true })).toEqual({
      clean: { keepUpscaled: true },
    })
    expect(stepsOf({ ...DEFAULT_SETTINGS, clean: false })).toEqual({ denoise: { passes: 1, maxQuality: false } })
  })

  it('picks the full cleaner on the GPU and the fast one on the CPU, unless told', () => {
    expect(cleanerModel('auto', 'webgpu')).toBe('cleaner')
    expect(cleanerModel('auto', 'wasm')).toBe('cleanerFast')
    expect(cleanerModel('fast', 'webgpu')).toBe('cleanerFast')
    expect(cleanerModel('full', 'wasm')).toBe('cleaner')
  })

  it('lists the models a job needs', () => {
    expect(modelsNeeded(DEFAULT_SETTINGS, 'webgpu')).toEqual(['denoiser', 'cleaner'])
    expect(modelsNeeded({ ...DEFAULT_SETTINGS, denoise: false }, 'wasm')).toEqual(['cleanerFast'])
    expect(modelsNeeded({ ...DEFAULT_SETTINGS, clean: false }, 'wasm')).toEqual(['denoiser'])
  })
})
