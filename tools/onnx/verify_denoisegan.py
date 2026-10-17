"""Compares the DenoiseGAN ONNX models with the original PyTorch code (as the OmniGAN GUI runs it).
Usage: uv run python verify_denoisegan.py <OmniGAN dir> psnr_final.pt translator_0020000.pt denoisegan.onnx translator.onnx"""
import hashlib
import sys

import numpy as np
import onnxruntime as ort
import torch

repo, denoiser_pt, translator_pt, denoiser_onnx, translator_onnx = sys.argv[1:6]
sys.path.insert(0, repo)
from denoisegan.models import DenoiseGenerator, NoiseTranslator  # noqa: E402

D = DenoiseGenerator(channels=(48, 96, 192, 320, 448), drop_path_rate=0.0, use_checkpoint=False).eval()
D.load_state_dict(torch.load(denoiser_pt, map_location="cpu", weights_only=False)["ema"])
T = NoiseTranslator().eval()
T.load_state_dict(torch.load(translator_pt, map_location="cpu", weights_only=False)["ema"])
d = ort.InferenceSession(denoiser_onnx, providers=["CPUExecutionProvider"])
t = ort.InferenceSession(translator_onnx, providers=["CPUExecutionProvider"])

q = lambda a: np.round(np.clip(a, 0, 1) * 255)
rng = np.random.default_rng(0)
for n, h, w in [(1, 256, 256), (2, 64, 96), (1, 16, 16)]:
    # Noisy-ish content: smooth gradients plus noise, so the model has something to remove.
    yy, xx = np.mgrid[0:h, 0:w] / max(h, w)
    base = np.stack([yy, xx, (yy + xx) / 2])[None].repeat(n, 0)
    x = np.clip(base + rng.normal(0, 0.08, (n, 3, h, w)), 0, 1).astype(np.float32)
    for name, use_t in [("denoiser", False), ("translator + denoiser", True)]:
        with torch.no_grad():
            inp = torch.from_numpy(x) * 2 - 1
            ref = ((D(T(inp) if use_t else inp) + 1) / 2).numpy()
        got = d.run(None, {"image": t.run(None, {"image": x})[0] if use_t else x})[0]
        print(f"{(n, h, w)} {name}: max abs {np.abs(ref - got).max():.2e}, "
              f"max 8-bit diff {np.abs(q(ref) - q(got)).max():.0f}, mean change from input {np.abs(got - x).mean():.4f}")
for path in (denoiser_onnx, translator_onnx):
    data = open(path, "rb").read()
    print(path, "size", len(data), "sha256", hashlib.sha256(data).hexdigest())
