/** Uploads assets-out/ to R2 with wrangler. Run `pnpm assets:prepare` first
 * and `pnpm wrangler login` once. R2_BUCKET and R2_PREFIX override the
 * defaults (bucket `asset`, served at asset.hyphensam.com, under art-cleaner/). */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { plan, uploadArgs } from './plan.ts'

const bucket = process.env.R2_BUCKET ?? 'asset'
const prefix = process.env.R2_PREFIX ?? 'art-cleaner'

for (const item of plan()) {
  if (!existsSync(item.to)) {
    console.error(`missing ${item.to}: run pnpm assets:prepare`)
    process.exit(1)
  }
  console.log(`uploading ${item.asset.path}`)
  const { status } = spawnSync('pnpm', ['exec', 'wrangler', ...uploadArgs(bucket, prefix, item)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (status !== 0) process.exit(status ?? 1)
}
