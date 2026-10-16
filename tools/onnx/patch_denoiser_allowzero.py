import sys, onnx, numpy as np, onnxruntime as ort
src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
for n in m.graph.node:
    if n.op_type == 'Reshape':
        for a in n.attribute:
            if a.name == 'allowzero' and a.i == 1:
                a.i = 0
onnx.checker.check_model(m)
onnx.save(m, dst)
rng = np.random.default_rng(0)
x = rng.random((2, 3, 96, 128), dtype=np.float32)
s = np.full((2, 1), 0.1, np.float32)
a = ort.InferenceSession(src).run(None, {'image': x, 'sigma': s})[0]
b = ort.InferenceSession(dst).run(None, {'image': x, 'sigma': s})[0]
print('max abs diff', float(np.abs(a - b).max()))
