/// <reference types="vitest/config" />
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { oversized } from './scripts/pages-limit.ts'

const root = fileURLToPath(new URL('.', import.meta.url))

// Lets ONNX Runtime use threads (SharedArrayBuffer); `credentialless` still
// allows the assets from R2 without them sending CORP. public/_headers sets
// the same in production.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

/** Serves assets-out/ (`pnpm assets:prepare`) at /__assets in development,
 * standing in for R2. */
function devAssets(): Plugin {
  const dir = join(root, 'assets-out')
  return {
    name: 'dev-assets',
    configureServer(server) {
      server.middlewares.use('/__assets', (req, res, next) => {
        const path = normalize(join(dir, decodeURIComponent((req.url ?? '/').split('?')[0])))
        if (!path.startsWith(dir) || !existsSync(path) || !statSync(path).isFile()) return next()
        res.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
        res.setHeader('Content-Length', statSync(path).size)
        // So a production build in `pnpm preview` can use these too.
        res.setHeader('Access-Control-Allow-Origin', '*')
        createReadStream(path).pipe(res)
      })
    },
  }
}

/** Fails the build if Cloudflare Pages would refuse a file. */
function pagesLimit(): Plugin {
  return {
    name: 'pages-limit',
    apply: 'build',
    closeBundle() {
      const big = oversized(join(root, 'dist'))
      if (big.length) {
        throw new Error(`Over Pages' 25 MiB limit: ${big.map((f) => `${f.path} (${f.size} bytes)`).join(', ')}`)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devAssets(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Art Cleaner',
        short_name: 'Art Cleaner',
        description: 'Removes adversarial noise and JPEG artefacts from art, on your device.',
        lang: 'en-GB',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#141416',
        theme_color: '#141416',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        file_handlers: [
          {
            action: '/',
            accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp'] },
          },
        ],
      },
      workbox: {
        // The app shell and the codecs' wasm. Models and ORT's wasm are
        // cached by the worker (Cache API, checked by sha256), not here.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
    pagesLimit(),
  ],
  resolve: {
    alias: {
      '@': join(root, 'src'),
      // ORT's build that loads its wasm from outside the bundle (R2); the
      // default one would copy the 25.5 MB wasm into dist.
      'onnxruntime-web/webgpu': join(root, 'node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs'),
    },
  },
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['onnxruntime-web', '@jsquash/png', '@jsquash/jpeg', '@jsquash/webp', '@jsquash/oxipng'],
  },
  server: { headers: isolation },
  preview: { headers: isolation },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
})
