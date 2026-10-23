import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_ASSETS, assetUrl, MODELS, ORT_VERSION, ORT_WASM } from './manifest'

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('manifest', () => {
  it("matches the installed ONNX Runtime's version and wasm", () => {
    const pkg = JSON.parse(readFileSync('node_modules/onnxruntime-web/package.json', 'utf8'))
    expect(ORT_VERSION).toBe(pkg.version)
    const wasm = `node_modules/onnxruntime-web/dist/${ORT_WASM.file}`
    expect(readFileSync(wasm).byteLength).toBe(ORT_WASM.size)
    expect(sha256(wasm)).toBe(ORT_WASM.sha256)
  })

  it('puts every file under a path that changes with its contents', () => {
    expect(MODELS.denoiser.path).toBe(`models/${MODELS.denoiser.sha256.slice(0, 12)}/grd_denoiser.onnx`)
    expect(ORT_WASM.path).toBe(`ort/${ORT_VERSION}/${ORT_WASM.file}`)
    expect(new Set(ALL_ASSETS.map((a) => a.path)).size).toBe(ALL_ASSETS.length)
  })

  it('joins the base and path', () => {
    expect(assetUrl('https://asset.example/art-cleaner/', ORT_WASM)).toBe(
      `https://asset.example/art-cleaner/ort/${ORT_VERSION}/${ORT_WASM.file}`,
    )
    expect(assetUrl('/__assets', ORT_WASM)).toBe(`/__assets/ort/${ORT_VERSION}/${ORT_WASM.file}`)
  })

  it('cleans with IllustrationJaNai only, the AnimeSharp files gone', () => {
    const cleaners = Object.values(MODELS).filter((m) => m.step === 'clean')
    expect(cleaners.map((m) => m.file)).toEqual(['illustrationjanai_v3detail_fdat_m_2x.onnx'])
    expect(MODELS.cleaner.path).toBe('models/6e6824dcd1be/illustrationjanai_v3detail_fdat_m_2x.onnx')
  })

  for (const model of Object.values(MODELS)) {
    it.skipIf(!existsSync(`models/${model.file}`))(`matches models/${model.file}`, () => {
      expect(readFileSync(`models/${model.file}`).byteLength).toBe(model.size)
      expect(sha256(`models/${model.file}`)).toBe(model.sha256)
    })
  }
})
