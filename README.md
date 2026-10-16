# Art Cleaner

Removes adversarial noise and JPEG artefacts from art, in your browser. Images never leave your
device: the models run locally with [ONNX Runtime Web](https://onnxruntime.ai) on WebGPU, or on the
CPU where WebGPU isn't available. Install it as an app and it works offline once its files are saved.

- **Denoise** removes adversarial noise with GRDDenoiser (1–3 passes, optional "maximum quality",
  which averages 24 rotated and flipped runs).
- **Clean** removes JPEG artefacts with 2x-AnimeSharpV4: the image is upscaled 2× and scaled back
  down with Lanczos3, or kept at 2× if you choose. Full on WebGPU, Fast (about 6× quicker) on the
  CPU, by default.
- Batches, a before/after comparison (slider, toggle, side by side, with zoom), PNG, lossless WebP or
  lossy WebP output with transparency kept, and a zip of every result.

## Models and licences

The app's code is licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at
your option. **The models are not covered by that licence:**

| Model | Author | Licence |
|---|---|---|
| GRDDenoiser (`grd_denoiser.onnx`) | [livinginparadise](https://github.com/livinginparadise/GRDDenoiser) | Redistributed with the author's permission |
| 2x-AnimeSharpV4 RCAN and Fast RCAN PU (`animesharp_v4_rcan_2x.onnx`, `animesharp_v4_fast_rcan_pu_2x.onnx`) | [Kim2091](https://huggingface.co/Kim2091/2x-AnimeSharpV4) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |

The AnimeSharp models were converted to ONNX (fp32 maths, weights stored as fp16, which they
already were in the original files, so the output is identical); the converted files are under the
same CC BY-NC-SA 4.0 licence. Because of the NonCommercial term, a deployment that ships them can't
be used commercially (no ads, no paid tier). The scripts that made the files are in
[`tools/onnx/`](tools/onnx).

## Development

Needs Node 24+ and pnpm.

```bash
pnpm install
pnpm test          # Vitest
pnpm dev           # http://localhost:5173
```

The models aren't in the repository. Put the three `.onnx` files in `models/`, then run
`pnpm assets:prepare` to copy them and ONNX Runtime's wasm into `assets-out/` (checking every
sha256 against [`src/lib/manifest.ts`](src/lib/manifest.ts)); the dev server serves that folder at
`/__assets`.

This project is test-driven: see [CLAUDE.md](CLAUDE.md) for the rules and the architecture.

## Deploying

The site is static and goes on Cloudflare Pages; the large files (the models and ONNX Runtime's
25.5 MB WebGPU wasm, over Pages' 25 MiB limit) go on R2.

1. **R2.** `pnpm assets:prepare`, then `pnpm exec wrangler login` and `pnpm upload:r2`. It uploads to
   bucket `asset` under `art-cleaner/` (override with `R2_BUCKET` and `R2_PREFIX`), with paths that
   change whenever a file does, so they're cached forever. Give the bucket the CORS rule in
   [`r2-cors.json`](r2-cors.json) (merge it with any rules the bucket already has):
   `pnpm exec wrangler r2 bucket cors set asset --file r2-cors.json`.
2. **Pages.** Build command `pnpm build`, output directory `dist`. `public/_headers` sets the
   cross-origin isolation headers ONNX Runtime needs for threads. The build fails if any file would
   exceed Pages' limit.
3. Assets load from `https://asset.hyphensam.com/art-cleaner` by default; set `VITE_ASSET_BASE` at
   build time to use another host.
