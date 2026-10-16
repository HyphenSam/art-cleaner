"""Kura's pipeline in NumPy on ONNX Runtime (CPU), as a reference for the web port.
Usage: python -I tools/reference.py <models dir> <input> <output.png> [denoise|clean|both] [cleaner .onnx]"""
import sys
import numpy as np
import onnxruntime as ort
from PIL import Image

models, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
steps = sys.argv[4] if len(sys.argv) > 4 else "both"
cleaner = sys.argv[5] if len(sys.argv) > 5 else "animesharp_v4_rcan_2x.onnx"
img = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255  # alpha is re-attached unchanged by the app
x = img.transpose(2, 0, 1).copy()  # planar


def sigma_of(p):
    luma = 0.2989 * p[0] + 0.587 * p[1] + 0.114 * p[2]
    pad = np.pad(luma, 1)
    lap = pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:] - 4 * luma
    r = np.sort(np.abs(lap).ravel())
    s = r[(r.size - 1) // 2] / 0.6745
    s = s if np.isfinite(s) and s > 0 else 25 / 255
    return float(np.clip(s, 0.0005, 1))


def mirror(i, n):
    if n == 1:
        return 0
    m = i % (2 * (n - 1))
    return m if m < n else 2 * (n - 1) - m


def starts(size, tile, overlap):
    stride = tile - overlap
    count = max(1, -(-max(0, size - overlap) // stride))
    return [i * stride for i in range(count)]


def hann(n):
    i = np.arange(n)
    return np.maximum(0.5 - 0.5 * np.cos(2 * np.pi * i / (max(n, 2) - 1)), 1e-3).astype(np.float32)


def tiled(p, tile, overlap, scale, run):
    _, h, w = p.shape
    oh, ow, ot = h * scale, w * scale, tile * scale
    acc = np.zeros((3, oh, ow), np.float32)
    wsum = np.zeros((oh, ow), np.float32)
    win = hann(ot)
    win2 = np.outer(win, win)
    for y0 in starts(h, tile, overlap):
        for x0 in starts(w, tile, overlap):
            ys = [mirror(y, h) for y in range(y0, y0 + tile)]
            xs = [mirror(x, w) for x in range(x0, x0 + tile)]
            t = p[:, ys][:, :, xs][None]
            o = run(t)[0]
            hh, ww = min(ot, oh - y0 * scale), min(ot, ow - x0 * scale)
            acc[:, y0 * scale:y0 * scale + hh, x0 * scale:x0 * scale + ww] += o[:, :hh, :ww] * win2[:hh, :ww]
            wsum[y0 * scale:y0 * scale + hh, x0 * scale:x0 * scale + ww] += win2[:hh, :ww]
    return acc / wsum


sigma = sigma_of(x)
print("sigma", sigma)
if steps in ("denoise", "both"):
    s = ort.InferenceSession(f"{models}/grd_denoiser.onnx", providers=["CPUExecutionProvider"])
    x = tiled(x, 256, 48, 1, lambda t: s.run(None, {"image": t, "sigma": np.full((1, 1), sigma, np.float32)})[0])
if steps in ("clean", "both"):
    s = ort.InferenceSession(f"{models}/{cleaner}", providers=["CPUExecutionProvider"])
    up = tiled(x, 256, 32, 2, lambda t: s.run(None, {"image": t})[0])
    up8 = np.round(np.clip(up, 0, 1) * 255).astype(np.uint8).transpose(1, 2, 0)
    small = Image.fromarray(up8).resize((img.shape[1], img.shape[0]), Image.LANCZOS)
    x = np.asarray(small).astype(np.float32).transpose(2, 0, 1) / 255
Image.fromarray(np.round(np.clip(x, 0, 1) * 255).astype(np.uint8).transpose(1, 2, 0)).save(out)
print("saved", out)
