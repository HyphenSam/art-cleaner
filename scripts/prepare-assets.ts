/** Copies the models and ORT's wasm into assets-out/ at their R2 paths,
 * checking each one's size and sha256 against the manifest. */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { plan } from './plan.ts'

let failed = false
for (const { asset, from, to } of plan()) {
  if (!existsSync(from)) {
    console.error(`missing ${from}`)
    failed = true
    continue
  }
  const bytes = readFileSync(from)
  const sha = createHash('sha256').update(bytes).digest('hex')
  if (bytes.byteLength !== asset.size || sha !== asset.sha256) {
    console.error(`${from} doesn't match the manifest (size ${bytes.byteLength}, sha256 ${sha})`)
    failed = true
    continue
  }
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  console.log(`${to} (${(asset.size / 1e6).toFixed(1)} MB)`)
}
process.exit(failed ? 1 : 0)
