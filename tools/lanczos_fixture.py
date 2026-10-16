"""Pillow Lanczos reference outputs for src/lib/lanczos.test.ts."""
import sys, json, numpy as np
from PIL import Image
rng = np.random.default_rng(7)
cases = []
for (w, h, dw, dh) in [(24, 16, 12, 8), (23, 17, 11, 8), (12, 8, 24, 16), (40, 6, 20, 3)]:
    # Smooth-ish content plus noise, so both ringing and averaging show.
    yy, xx = np.mgrid[0:h, 0:w]
    base = np.stack([(xx * 9 + yy * 4) % 256, (yy * 13) % 256, ((xx ^ yy) * 17) % 256], -1)
    img = np.clip(base + rng.integers(-40, 40, base.shape), 0, 255).astype(np.uint8)
    out = np.asarray(Image.fromarray(img, "RGB").resize((dw, dh), Image.LANCZOS))
    cases.append({"width": w, "height": h, "dw": dw, "dh": dh, "input": img.reshape(-1).tolist(), "output": out.reshape(-1).tolist()})
json.dump(cases, open(sys.argv[1], "w"))
