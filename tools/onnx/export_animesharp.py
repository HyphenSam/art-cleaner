"""Export 2x-AnimeSharpV4_RCAN.pth to ONNX.

Input:   image     float32 [N, 3, H, W], RGB in [0, 1].
Output:  upscaled  float32 [N, 3, 2H, 2W], roughly [0, 1] (clamp it).

Usage:
    uv pip install spandrel onnx onnxscript onnxruntime
    uv run python export_animesharp.py path/to/2x-AnimeSharpV4_RCAN.pth
"""

import sys
from pathlib import Path

import spandrel
import torch

OUTPUT = Path(__file__).resolve().parent / "animesharp_v4_rcan_2x.onnx"


def load_model(path):
    return spandrel.ModelLoader().load_from_file(path).model.eval()


def main():
    model = load_model(sys.argv[1])
    image = torch.rand(1, 3, 128, 128)

    batch = torch.export.Dim("batch", min=1, max=64)
    height = torch.export.Dim("height", min=16, max=2048)
    width = torch.export.Dim("width", min=16, max=2048)

    with torch.no_grad():
        program = torch.onnx.export(
            model,
            (image,),
            input_names=["image"],
            output_names=["upscaled"],
            dynamic_shapes={"x": {0: batch, 2: height, 3: width}},
            opset_version=18,
            dynamo=True,
        )
    program.save(str(OUTPUT), external_data=False)
    print(f"Saved {OUTPUT} ({OUTPUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
