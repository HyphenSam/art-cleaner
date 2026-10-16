import type { OutputFormat, Settings } from './settings'

export const EXTENSIONS: Record<OutputFormat, string> = { png: 'png', 'webp-lossless': 'webp', webp: 'webp' }

/** `art.jpg` → `art-denoised-cleaned.png`. */
export function outputName(original: string, s: Settings): string {
  const stem = original.replace(/\.[^.]+$/, '')
  const done = [s.denoise && 'denoised', s.clean && 'cleaned', s.clean && s.keepUpscaled && '2x'].filter(Boolean)
  return `${stem}-${done.join('-')}.${EXTENSIONS[s.format]}`
}

/** Numbers repeats (`a (2).png`), ignoring case, as file systems may. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const key = name.toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    return count === 1 ? name : name.replace(/(\.[^.]+)?$/, (ext) => ` (${count})${ext}`)
  })
}
