import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PAGES_LIMIT, oversized } from './pages-limit.ts'

describe('oversized', () => {
  it("lists files over Cloudflare Pages' 25 MiB limit, in any folder", () => {
    expect(PAGES_LIMIT).toBe(25 * 1024 * 1024)
    const dir = mkdtempSync(join(tmpdir(), 'pages-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'small.js'), 'x')
    writeFileSync(join(dir, 'assets', 'big.wasm'), new Uint8Array(30))
    expect(oversized(dir, 10)).toEqual([{ path: 'assets/big.wasm', size: 30 }])
    expect(oversized(dir, 100)).toEqual([])
  })
})
