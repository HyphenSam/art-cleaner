# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite, React 19, TypeScript, Tailwind v4, Radix primitives, Vitest; pnpm. Static site on Cloudflare
Pages; models and ONNX Runtime's WebGPU wasm on Cloudflare R2 (asset.hyphensam.com). Installable
PWA that works offline once its files are downloaded.

## Users

Art collectors and archivists cleaning up art they have saved, often many images at once from
galleries and boorus, who want the cleanest copy of each image to keep.

## Product Purpose

Removes adversarial noise (GRDDenoiser) and JPEG artefacts (2x-AnimeSharpV4, upscale 2× then
Lanczos back down) from art, entirely on the user's device. Success: drop a batch in, get clean
files out, with a side-by-side check that nothing was lost.

## Positioning

Runs in the browser with ONNX Runtime Web (WebGPU, CPU fallback): no uploads, no account, no
server, and it keeps working offline once installed. Free and open source (MIT OR Apache-2.0).

## Operating Context

- Batches of images added by drag and drop, file picker or paste; processed one at a time in a
  queue; each result downloadable on its own or all as a zip.
- A comparison view (toggle, slider, side by side with shared zoom and pan) for checking results
  at the pixel level.
- First use downloads ONNX Runtime (27 MB) and the models (9 to 39 MB each), cached for later
  visits and offline use.
- The cleaner is slow without WebGPU (minutes per image on the CPU); the app picks the fast
  cleaner model there.

## Capabilities and Constraints

- Steps: Denoise (passes 1–3, optional maximum quality, about 24× slower) and Clean (model
  Auto / Full / Fast; "Keep 2× size" off by default). Clean always runs after Denoise.
- Output: PNG (default, optimised), WebP lossless, WebP lossy (quality, default 95). Alpha kept.
- Any image size (band processing); WebP output is capped at 16383 px a side.
- Name "Art Cleaner" may change. The site is entirely separate from Kura: never link to it.
- Non-commercial while it ships the AnimeSharp models (CC BY-NC-SA 4.0): no ads, no paid tier.

## Brand Commitments

- Name: Art Cleaner (provisional).
- Voice: plain and quiet. Short, factual labels; explains only when asked; a tool that gets out of
  the way. British spelling.
- Credits must stay visible: GRDDenoiser by livinginparadise (redistributed with permission);
  2x-AnimeSharpV4 and its Fast variant by Kim2091, CC BY-NC-SA 4.0, converted to ONNX.

## Evidence on Hand

No testimonials, benchmarks or sample images are provided; don't invent them. Measured speeds
(October 2026, one Windows PC, WebGPU): denoiser about 45 ms per 256 px tile, full cleaner about
0.7 s per tile.

## Product Principles

1. The artwork is the hero; the interface recedes around it.
2. Nothing leaves the device, and the app says so plainly once.
3. Batches first: adding twenty images should be as easy as adding one.
4. Show the trade-offs honestly (download sizes, CPU slowness) without nagging.
5. Sensible defaults; options stay out of sight until wanted.

## Accessibility & Inclusion

Keyboard operable throughout, visible focus, WCAG AA contrast in light and dark themes, reduced
motion respected.
