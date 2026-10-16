# Art Cleaner

A static web app (Cloudflare Pages) that removes adversarial noise and JPEG artefacts from art,
entirely on the user's device, with ONNX Runtime Web. Installable (PWA) and works offline once its
files are downloaded. The name may change: it lives in `src/lib/brand.ts` and `vite.config.ts`
(manifest) only.

## Test-driven development is mandatory

Every change to behaviour follows red, green, refactor:

1. **Red.** Write or change a test that states the behaviour. Run it (`pnpm test <file>`) and watch it
   fail for the reason you expect. A test you never saw fail proves nothing.
2. **Green.** Write the least code that makes it pass.
3. **Refactor** with the tests green, then run the whole suite (`pnpm test`) and `pnpm typecheck`.

Rules:

- No production code without a failing test first. That includes bug fixes: reproduce the bug in a
  test, then fix it.
- Don't weaken, skip or delete a test to get green. If a test is wrong, say why in the change.
- Keep logic testable: image maths, the pipeline, asset caching, EXIF handling, file naming and
  settings are pure modules in `src/lib/` with injected dependencies (models, `fetch`, caches). They
  never import ONNX Runtime, codecs or the DOM. The worker (`src/worker/`) and React components are
  thin wiring over them.
- Fakes over mocks: the pipeline is tested with an identity denoiser and a nearest-neighbour 2×
  upscaler (`src/lib/testing.ts`), not with ONNX Runtime.
- Components get React Testing Library tests for behaviour users see (`// @vitest-environment jsdom`
  at the top of the file). Test what the user does and sees, not implementation details.
- Things only a real browser can show (WebGPU, ORT sessions, codecs' wasm, the service worker) are
  checked by hand in the browser after the unit tests pass; say so when you report.
- Pipeline changes are also checked for parity against `tools/reference.py` (Kura's algorithm in
  NumPy on ONNX Runtime CPU): browser output must stay within 1/255 of it.

## Commands

```bash
pnpm install
pnpm dev              # http://localhost:5173, serves assets-out/ at /__assets
pnpm test             # Vitest, once
pnpm test:watch
pnpm typecheck
pnpm build            # typecheck + build to dist/; fails if any file is over Pages' 25 MiB limit
pnpm preview          # serves dist/ with the same headers as production
pnpm assets:prepare   # copies models/ and ORT's wasm into assets-out/ (checks every sha256)
pnpm upload:r2        # uploads assets-out/ to R2 (needs `wrangler login`, R2_BUCKET)
```

## Design

PRODUCT.md (who it's for, voice, principles) and DESIGN.md (tokens and rules, sidecar in
`.impeccable/design.json`) are the authorities for UI work; tokens live in `src/index.css`. Keep
to them: zinc neutrals, one indigo accent for action, selection, focus and progress, a neutral stage
so the art's colours can be judged, sentence-case labels, state shown by form as well as colour,
light and dark both first-class.

## Code style

- KISS. Small modules, plain functions, no premature abstraction.
- TypeScript strict, Prettier (no semicolons, single quotes, 120 columns).
- Comment the why, briefly, in the style of the existing code.
- UI copy uses British spelling ("artefacts", "colour", "optimise").
- Stack: Vite, React 19, Tailwind v4, Radix primitives (`radix-ui`), lucide icons, Vitest.
- pnpm only.

## Layout

- `src/lib/` pure logic: `tiles.ts` (tiling, Hann blending, ensemble, noise estimate), `lanczos.ts`,
  `pipeline.ts` (the steps, banding), `orientation.ts` (EXIF), `assets.ts` (download, cache,
  sha256), `manifest.ts` (asset URLs, sizes, hashes), `zoom.ts`, `settings.ts`, `names.ts`.
- `src/worker/` the Web Worker: owns ORT sessions, decoding and encoding, runs the pipeline, posts
  progress, cancels between model runs. `src/lib/engine.ts` is its logic, testable with fakes.
- `src/components/` the UI (`ui/` holds the primitives). `src/App.tsx` puts it together; it takes
  the engine client as a prop so tests pass a fake. `src/main.tsx` creates the real worker.
- `src/hooks/useBatch.ts` the queue: one image at a time, settings read when each image starts.
- `scripts/` Node scripts (run with Node's type stripping, so they import `src/lib/manifest.ts`).
- `tools/onnx/` the Python scripts that exported the models (run with uv, not part of the build).

## The pipeline (keep it matching Kura's)

Planar RGB f32 0–1. Alpha is kept aside and re-attached unchanged (resized with Lanczos3 when
keeping the 2× size).

1. Decode upright (EXIF orientation applied; exact RGBA via jSquash, never via a 2D canvas when
   alpha matters, since canvas premultiplies).
2. `sigma` once, from the original: luma `0.2989R + 0.5870G + 0.1140B`, |3×3 Laplacian| with zero
   padding, *lower* median / 0.6745, 25/255 if not finite or ≤ 0, clamped 0.0005–1.
3. Denoise `passes` times (1–3): 256 px tiles, 48 overlap, batch 8. Maximum quality runs each batch
   24 times (8 rotations/flips × gains 0.95/1/1.05) and averages.
4. Clean (always last): 256 px tiles, 32 overlap, batch 1, output at 2×; quantise to 8 bits; then
   Lanczos3 back to the original size unless "Keep 2× size" is on (off by default).
5. Tiles start at `0, stride, …`, `count = max(1, ceil((size - overlap) / stride))`; edges mirror
   without repeating the edge pixel; blending uses a 2D Hann window floored at 1e-3.
6. The cleaner streams finished rows (band processing), so memory stays flat for any image size.

Models: `grd_denoiser.onnx` (inputs `image` `[N,3,H,W]`, `sigma` `[N,1]`; H, W multiples of 4),
`animesharp_v4_rcan_2x.onnx` and `animesharp_v4_fast_rcan_pu_2x.onnx` (input `image`, output
`upscaled` at 2×, clamp it; fp32 only; the fast one needs even H, W). The cleaner model is Full on
WebGPU and Fast on the CPU by default.

## Hosting facts that bite

- Pages caps every file at 25 MiB. Models and ORT's WebGPU wasm (25.5 MB) live on R2 at
  `https://asset.hyphensam.com/art-cleaner/` (`models/<sha256[:12]>/<file>`,
  `ort/<version>/<file>`), immutable, cached forever. `vite.config.ts` aliases
  `onnxruntime-web/webgpu` to ORT's extern-wasm build so the wasm is never bundled.
- Every asset has a sha256 in `src/lib/manifest.ts`; downloads and cached copies are checked
  before use. Upgrading `onnxruntime-web` means updating `ORT_VERSION` and the wasm's hash and size
  (a test fails until you do), then `pnpm assets:prepare && pnpm upload:r2`.
- `public/_headers` sets COOP `same-origin` and COEP `credentialless` so ORT can use threads;
  R2 needs a CORS rule for the site's origins (`r2-cors.json`).
- Models are cached with the Cache API by the worker, not the service worker; the service worker
  precaches the app shell only.

## Licences

The code is MIT OR Apache-2.0. The models are not: AnimeSharp V4 (both variants, Kim2091) is
CC BY-NC-SA 4.0, so the site must stay non-commercial (no ads, no paid tier) while it ships them,
and must credit and link the source and licence and say they were converted to ONNX. GRDDenoiser
(livinginparadise) is redistributed with the author's permission. Keep the credits in the UI.

## Don't commit

`enhance-web-handoff/` (reference notes), `models/`, `assets-out/`. They're in `.gitignore`.
