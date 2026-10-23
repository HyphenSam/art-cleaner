# Art Cleaner

Removes adversarial noise and JPEG artefacts from art, in your browser. Images never leave your
device: the models run locally with [ONNX Runtime Web](https://onnxruntime.ai) on WebGPU, or on the
CPU where WebGPU isn't available. Install it as an app and it works offline once its files are saved.

- **Denoise** removes adversarial noise with GRDDenoiser or DenoiseGAN (about 2.5× slower, with an
  optional noise translator for Gaussian and other unfamiliar noise); 1–3 passes, optional "maximum
  quality", which averages 24 rotated and flipped runs.
- **Clean** removes JPEG artefacts with 2x IllustrationJaNai V3detail: the image is upscaled 2× and
  scaled back down with Lanczos3, or kept at 2× if you choose.
- Batches, a before/after comparison (slider, toggle, side by side, with zoom), PNG, lossless WebP or
  lossy WebP output with transparency kept, and a zip of every result.
- Results keep the original's colour profile (a Display P3 image stays P3). AVIF, GIF and BMP are
  converted to sRGB first.

## Models and licences

The app's code is licensed under either of [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at
your option. **The models are not covered by that licence:**

| Model | Author | Licence |
|---|---|---|
| GRDDenoiser (`grd_denoiser.onnx`) | [livinginparadise](https://github.com/livinginparadise/GRDDenoiser) ([weights](https://huggingface.co/pegasiukas/GRDDenoiser)) | Redistributed with the author's permission |
| DenoiseGAN and its noise translator (`denoisegan.onnx`, `denoisegan_translator.onnx`) | [livinginparadise](https://github.com/livinginparadise/OmniGAN) ([weights](https://huggingface.co/orangepegasus/DenoiseGAN)) | [MIT, with extra liability and indemnification terms](https://github.com/livinginparadise/OmniGAN/blob/main/LICENSE), © 2026 Algis |
| 2x IllustrationJaNai V3detail (FDAT M) (`illustrationjanai_v3detail_fdat_m_2x.onnx`) | [the-database](https://github.com/the-database/mangajanai) ([release 3.0.0](https://github.com/the-database/mangajanai/releases/tag/3.0.0)) | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |

The IllustrationJaNai file is modified from the released ONNX file: its weights and arithmetic were
converted from bfloat16 to 32-bit floats (exact, since bfloat16 is the top half of a 32-bit float),
its operator set lowered to 18 with GELU written out in elementary operations, and its batch size
made variable (output within 1e-5 of the original's). Because of the NonCommercial term, a
deployment that ships it can't be used commercially (no ads, no paid tier). DenoiseGAN was converted to ONNX with its weights
rounded to fp16 (fp32 maths; output within 1/255 of the original). The scripts that made the files are in
[`tools/onnx/`](tools/onnx).

## Development

Needs Node 24+ and pnpm 11 (pinned in `package.json` and `.node-version`, which Cloudflare Pages reads too).

```bash
pnpm install
pnpm test          # Vitest
pnpm dev           # http://localhost:5173
```

The models aren't in the repository. Put the `.onnx` files listed above in `models/`, then run
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
