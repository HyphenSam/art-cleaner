/** What `assets:prepare` copies and `upload:r2` uploads. */
import { ALL_ASSETS, type Asset, ORT_WASM } from '../src/lib/manifest.ts'

export type Item = { asset: Asset; from: string; to: string }

export const OUT = 'assets-out'

export function plan(): Item[] {
  return ALL_ASSETS.map((asset) => ({
    asset,
    from: asset === ORT_WASM ? `node_modules/onnxruntime-web/dist/${asset.file}` : `models/${asset.file}`,
    to: `${OUT}/${asset.path}`,
  }))
}

/** `wrangler` arguments to upload one item. Paths change with contents, so
 * every file can be cached forever. */
export function uploadArgs(bucket: string, prefix: string, item: Item): string[] {
  const type = item.asset.file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'
  return [
    'r2',
    'object',
    'put',
    `${bucket}/${prefix}/${item.asset.path}`,
    '--file',
    item.to,
    '--content-type',
    type,
    '--cache-control',
    'public, max-age=31536000, immutable',
    '--remote',
  ]
}
