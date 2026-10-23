import { describe, expect, it } from 'vitest'
import { ALL_ASSETS, MODELS, ORT_WASM } from '../src/lib/manifest.ts'
import { existsSync } from 'node:fs'
import { sep } from 'node:path'
import { fileItem, plan, uploadArgs, uploadCommand } from './plan.ts'

describe('plan', () => {
  it('copies every asset from where it lives to its path in assets-out', () => {
    const items = plan()
    expect(items.map((i) => i.asset.id)).toEqual(ALL_ASSETS.map((a) => a.id))
    expect(items[0]).toEqual({
      asset: ORT_WASM,
      from: `node_modules/onnxruntime-web/dist/${ORT_WASM.file}`,
      to: `assets-out/${ORT_WASM.path}`,
    })
    expect(items.find((i) => i.asset.id === 'denoiser')).toMatchObject({
      from: 'models/grd_denoiser.onnx',
      to: `assets-out/${MODELS.denoiser.path}`,
    })
  })
})

describe('fileItem', () => {
  it('uploads a file from where it is to models/<sha256[:12]>/<name>, like the manifest', () => {
    // sha256("abc")
    const sha = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    const item = fileItem('../Kura/onnx/new_model.onnx', new TextEncoder().encode('abc'))
    expect(item).toEqual({
      asset: {
        id: 'new_model.onnx',
        file: 'new_model.onnx',
        sha256: sha,
        size: 3,
        path: `models/${sha.slice(0, 12)}/new_model.onnx`,
      },
      from: '../Kura/onnx/new_model.onnx',
      to: '../Kura/onnx/new_model.onnx',
    })
    expect(uploadArgs('asset', 'art-cleaner', item).slice(3, 8)).toEqual([
      `asset/art-cleaner/models/${sha.slice(0, 12)}/new_model.onnx`,
      '--file',
      '../Kura/onnx/new_model.onnx',
      '--content-type',
      'application/octet-stream',
    ])
  })

  it('takes the name from a Windows path too', () => {
    expect(fileItem('C:\\models\\m.onnx', new Uint8Array()).asset.file).toBe('m.onnx')
  })
})

describe('uploadArgs', () => {
  it('puts the file under the prefix, cached forever', () => {
    const [item] = plan()
    expect(uploadArgs('asset', 'art-cleaner', item)).toEqual([
      'r2',
      'object',
      'put',
      `asset/art-cleaner/${ORT_WASM.path}`,
      '--file',
      `assets-out/${ORT_WASM.path}`,
      '--content-type',
      'application/wasm',
      '--cache-control',
      'public, max-age=31536000, immutable',
      '--remote',
    ])
    expect(uploadArgs('asset', 'art-cleaner', plan()[1])).toContain('application/octet-stream')
  })
})

describe('uploadCommand', () => {
  it('runs wrangler with Node directly, so no shell splits the arguments', () => {
    // A shell (as Windows needs for pnpm.cmd) split "public, max-age=…, immutable" at its spaces.
    const [item] = plan()
    const { command, args, options } = uploadCommand('asset', 'art-cleaner', item)
    expect(command).toBe(process.execPath)
    expect(args[0].split(sep).join('/')).toMatch(/node_modules\/wrangler\/bin\/wrangler\.js$/)
    expect(existsSync(args[0])).toBe(true)
    expect(args.slice(1)).toEqual(uploadArgs('asset', 'art-cleaner', item))
    expect(args).toContain('public, max-age=31536000, immutable')
    expect(options).not.toHaveProperty('shell')
  })
})
