import sys; sys.stdout.reconfigure(encoding="utf-8"); sys.stderr.reconfigure(encoding="utf-8")
"""Export 2x-AnimeSharpV4_Fast_RCAN_PU.pth to ONNX (same interface as the full model).
Input image f32 [N,3,H,W] RGB 0-1, H and W even (PixelUnshuffle). Output upscaled f32 [N,3,2H,2W]."""
import sys
from pathlib import Path
import spandrel, torch

src, out = sys.argv[1], Path(sys.argv[2])
d = spandrel.ModelLoader().load_from_file(src)
print(d.architecture.name, d.scale, d.size_requirements)
model = d.model.eval()
image = torch.rand(1, 3, 128, 128)
batch = torch.export.Dim("batch", min=1, max=64)
h2 = torch.export.Dim("h2", min=8, max=1024)
w2 = torch.export.Dim("w2", min=8, max=1024)
with torch.no_grad():
    program = torch.onnx.export(model, (image,), input_names=["image"], output_names=["upscaled"],
        dynamic_shapes={"x": {0: batch, 2: 2 * h2, 3: 2 * w2}}, opset_version=18, dynamo=True)
program.save(str(out), external_data=False)
print(f"Saved {out} ({out.stat().st_size} bytes)")
