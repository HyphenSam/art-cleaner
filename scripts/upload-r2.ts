/** Uploads assets-out/ to R2 with wrangler. Run `pnpm assets:prepare` first
 * and `pnpm wrangler login` once. R2_BUCKET and R2_PREFIX override the
 * defaults (bucket `asset`, served at asset.hyphensam.com, under art-cleaner/).
 * Given file paths (`pnpm upload:r2 <file>…`), uploads only those, each to
 * models/<sha256[:12]>/<name>. */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileItem, plan, uploadCommand } from './plan.ts'

const bucket = process.env.R2_BUCKET ?? 'asset'
const prefix = process.env.R2_PREFIX ?? 'art-cleaner'

const files = process.argv.slice(2)
for (const file of files) {
  if (!existsSync(file)) {
    console.error(`missing ${file}`)
    process.exit(1)
  }
}
const items = files.length > 0 ? files.map((file) => fileItem(file, readFileSync(file))) : plan()

for (const item of items) {
  if (!existsSync(item.to)) {
    console.error(`missing ${item.to}: run pnpm assets:prepare`)
    process.exit(1)
  }
  console.log(`uploading ${item.asset.path} (sha256 ${item.asset.sha256})`)
  const { command, args, options } = uploadCommand(bucket, prefix, item)
  const { status } = spawnSync(command, args, options)
  if (status !== 0) process.exit(status ?? 1)
}
