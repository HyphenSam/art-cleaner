"""Export DenoiseGAN (livinginparadise/OmniGAN, weights orangepegasus/DenoiseGAN) to ONNX.

The networks work in [-1, 1]; the export wraps them so they take and return RGB in [0, 1] like the app's
other models.

denoisegan.onnx             image f32 [N, 3, H, W] in [0, 1], H and W multiples of 16 -> denoised, same shape
denoisegan_translator.onnx  image f32 [N, 3, H, W] in [0, 1] -> translated, same shape (run before the denoiser)

Usage (from a checkout of https://github.com/livinginparadise/OmniGAN, for `denoisegan.models`):
    uv pip install torch onnx onnxscript onnxruntime
    uv run python export_denoisegan.py <OmniGAN dir> psnr_final.pt translator_0020000.pt <out dir>
"""

import sys
from pathlib import Path

import torch

sys.stdout.reconfigure(encoding="utf-8")  # the exporter prints emoji

repo, denoiser_pt, translator_pt, out_dir = sys.argv[1], sys.argv[2], sys.argv[3], Path(sys.argv[4])
sys.path.insert(0, repo)
from denoisegan.models import DenoiseGenerator, LayerNorm2d, NoiseTranslator  # noqa: E402


def layer_norm_2d(self, x):
    # The original wraps this in autocast(enabled=False), which the exporter doesn't need: it's all fp32.
    mean = x.mean(dim=1, keepdim=True)
    var = x.var(dim=1, keepdim=True, unbiased=False)
    return (x - mean) / torch.sqrt(var + self.eps) * self.weight[None, :, None, None] + self.bias[None, :, None, None]


LayerNorm2d.forward = layer_norm_2d


class ZeroOne(torch.nn.Module):
    def __init__(self, net):
        super().__init__()
        self.net = net

    def forward(self, image):
        return (self.net(image * 2 - 1) + 1) * 0.5


def load(net, path):
    missing, unexpected = net.load_state_dict(torch.load(path, map_location="cpu", weights_only=False)["ema"])
    assert not missing and not unexpected, (missing, unexpected)
    return ZeroOne(net).eval()


def export(model, out, output, multiple):
    batch = torch.export.Dim("batch", min=1, max=64)
    h = torch.export.Dim("h", min=1, max=4096 // multiple)
    w = torch.export.Dim("w", min=1, max=4096 // multiple)
    shapes = {"image": {0: batch, 2: multiple * h, 3: multiple * w}}
    with torch.no_grad():
        program = torch.onnx.export(model, (torch.rand(2, 3, 128, 128),), input_names=["image"],
                                    output_names=[output], dynamic_shapes=shapes, opset_version=18, dynamo=True)
    program.save(str(out), external_data=False)
    print(f"Saved {out} ({out.stat().st_size} bytes)")


out_dir.mkdir(parents=True, exist_ok=True)
denoiser = load(DenoiseGenerator(channels=(48, 96, 192, 320, 448), drop_path_rate=0.0, use_checkpoint=False), denoiser_pt)
export(denoiser, out_dir / "denoisegan.onnx", "denoised", 16)
translator = load(NoiseTranslator(nc=3, dim=64, num_blocks=10), translator_pt)
export(translator, out_dir / "denoisegan_translator.onnx", "translated", 1)
