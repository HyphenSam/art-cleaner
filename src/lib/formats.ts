/** Formats with exact WebAssembly decoders; others go through the browser. */
export type Exact = 'png' | 'jpeg' | 'webp'

export function sniff(b: Uint8Array): Exact | null {
  const is = (at: number, bytes: number[]) => bytes.every((v, i) => b[at + i] === v)
  if (is(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (is(0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (is(0, [0x52, 0x49, 0x46, 0x46]) && is(8, [0x57, 0x45, 0x42, 0x50])) return 'webp'
  return null
}

const EXTENSIONS = /\.(png|jpe?g|jfif|webp|avif|gif|bmp)$/i

/** Raster images the app can open. SVG isn't one: it has no pixels to clean. */
export function isImageFile(name: string, type: string): boolean {
  if (type === 'image/svg+xml') return false
  return type.startsWith('image/') || EXTENSIONS.test(name)
}
