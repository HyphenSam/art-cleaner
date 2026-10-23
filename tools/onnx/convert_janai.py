# Converts 2x IllustrationJaNai V3detail (FDAT M) from mangajanai's 3.0.0
# release (which computes in bf16, which ONNX Runtime doesn't run) to
# illustrationjanai_v3detail_fdat_m_2x.onnx: weights and maths in fp32,
# opset 18 with Gelu written out (DirectML runs Conv, Gelu and
# GlobalAveragePool on the CPU at opset 22), any batch size, and the input
# and output named `image` and `upscaled`. Prints the difference from the
# fp32 graph before lowering. Copied from Kura's scripts/convert-janai.py;
# it reproduces the file byte for byte.
#   uv run --with onnx --with onnxruntime --with numpy python convert_janai.py <src.onnx> <dst.onnx>
import math, sys
import numpy as np, onnx, onnxruntime as ort
from onnx import TensorProto as T, helper as h, numpy_helper as nh

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph


def to_f32(t):
    raw = np.frombuffer(t.raw_data, np.uint16) if t.raw_data else np.array(t.int32_data, np.uint32).astype(np.uint16)
    return nh.from_array((raw.astype(np.uint32) << 16).view(np.float32).reshape(tuple(t.dims)), t.name)


for t in g.initializer:
    if t.data_type == T.BFLOAT16:
        t.CopyFrom(to_f32(t))
for vi in [*g.input, *g.output, *g.value_info]:
    if vi.type.tensor_type.elem_type == T.BFLOAT16:
        vi.type.tensor_type.elem_type = T.FLOAT
for n in g.node:
    for a in n.attribute:
        if n.op_type == "Cast" and a.name == "to" and a.i == T.BFLOAT16:
            a.i = T.FLOAT
        if a.type == onnx.AttributeProto.TENSOR and a.t.data_type == T.BFLOAT16:
            a.t.CopyFrom(to_f32(a.t))
        assert a.type != onnx.AttributeProto.GRAPH, "subgraphs aren't handled"

fp32 = onnx.ModelProto()
fp32.CopyFrom(m)

g.initializer.extend([
    nh.from_array(np.array(1 / math.sqrt(2), np.float32), "gelu_inv_sqrt2"),
    nh.from_array(np.array(1.0, np.float32), "gelu_one"),
    nh.from_array(np.array(0.5, np.float32), "gelu_half"),
])
nodes = []
for i, n in enumerate(g.node):
    if n.op_type != "Gelu":
        nodes.append(n)
        continue
    assert all(a.name != "approximate" or a.s == b"none" for a in n.attribute)
    x, y, p = n.input[0], n.output[0], f"gelu{i}"
    nodes += [
        h.make_node("Mul", [x, "gelu_inv_sqrt2"], [p + "_a"]),
        h.make_node("Erf", [p + "_a"], [p + "_b"]),
        h.make_node("Add", [p + "_b", "gelu_one"], [p + "_c"]),
        h.make_node("Mul", [x, p + "_c"], [p + "_d"]),
        h.make_node("Mul", [p + "_d", "gelu_half"], [y]),
    ]
del g.node[:]
g.node.extend(nodes)
for o in m.opset_import:
    if o.domain in ("", "ai.onnx"):
        o.version = 18
m.ir_version = min(m.ir_version, 8)

batch = g.input[0].type.tensor_type.shape.dim[0]
batch.Clear()
batch.dim_param = "batch"
for old, new in [(g.input[0].name, "image"), (g.output[0].name, "upscaled")]:
    for n in g.node:
        n.input[:] = [new if i == old else i for i in n.input]
        n.output[:] = [new if o == old else o for o in n.output]
g.input[0].name, g.output[0].name = "image", "upscaled"

onnx.checker.check_model(m, full_check=True)
onnx.save(m, dst)

x = np.random.default_rng(0).random((1, 3, 96, 128), dtype=np.float32)
a = ort.InferenceSession(fp32.SerializeToString(), providers=["CPUExecutionProvider"]).run(None, {fp32.graph.input[0].name: x})[0]
b = ort.InferenceSession(dst, providers=["CPUExecutionProvider"]).run(None, {"image": np.concatenate([x, x])})[0]
print("max abs diff", float(np.abs(a[0] - b[0]).max()), float(np.abs(a[0] - b[1]).max()))
