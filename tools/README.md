# Tools

- `onnx/`: the Python scripts that made the ONNX models (run with `uv`; see the comments at the top of each).
  `convert_janai.py` converts IllustrationJaNai's released bf16 ONNX file to the fp32, opset 18
  one the site ships (a copy of Kura's `scripts/convert-janai.py`).
  `export_animesharp.py` and `export_animesharp_fast.py` exported the AnimeSharp V4 cleaners
  the site used before, from PyTorch via spandrel,
  `fp16_storage.py` stores weights that are exactly fp16 as fp16 with a Cast to fp32 (identical
  output, half the download), `verify.py` compares ONNX Runtime with PyTorch,
  `patch_denoiser_allowzero.py` is the DirectML fix already in `grd_denoiser.onnx`.
  `export_denoisegan.py` exports DenoiseGAN and its noise translator from a checkout of
  [OmniGAN](https://github.com/livinginparadise/OmniGAN), wrapped to take and return 0–1;
  `verify_denoisegan.py` compares them with PyTorch. `denoisegan.onnx` is then
  `fp16_storage.py --round` (within 1/255 of fp32 on test images); the translator stays fp32.
- `lanczos_fixture.py`: writes `src/lib/fixtures/lanczos.json` (Pillow's Lanczos as the reference).
- `icon-maskable.svg`: source of `public/icon-maskable-512.png` and `apple-touch-icon.png`. The
  icons were rendered with ImageMagick:
  `magick -background none -density 1600 icon.svg -resize 512x512 icon-512.png`.
