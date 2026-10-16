/** 38978681 → "39.0 MB" (decimal, as browsers' download UIs show). */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1e6) return `${Math.round(bytes / 1000)} kB`
  return `${(bytes / 1e6).toFixed(1)} MB`
}
