import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Cloudflare Pages refuses any single file larger than this. */
export const PAGES_LIMIT = 25 * 1024 * 1024

export function oversized(dir: string, limit = PAGES_LIMIT): { path: string; size: number }[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const full = join(entry.parentPath, entry.name)
      return { path: relative(dir, full).split(sep).join('/'), size: statSync(full).size }
    })
    .filter((file) => file.size > limit)
}
