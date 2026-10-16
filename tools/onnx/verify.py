import sys, numpy as np, spandrel, torch, onnxruntime as ort, hashlib
pth, onnx_path = sys.argv[1], sys.argv[2]
model = spandrel.ModelLoader().load_from_file(pth).model.eval()
sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
print("inputs", [(i.name, i.shape) for i in sess.get_inputs()], "outputs", [(o.name, o.shape) for o in sess.get_outputs()])
rng = np.random.default_rng(0)
for n, h, w in [(1, 256, 256), (2, 64, 96), (1, 32, 16)]:
    x = rng.random((n, 3, h, w), dtype=np.float32)
    with torch.no_grad():
        ref = model(torch.from_numpy(x)).numpy()
    got = sess.run(None, {"image": x})[0]
    q = lambda a: np.round(np.clip(a, 0, 1) * 255)
    off = (q(ref) != q(got)).mean()
    print((n, h, w), got.shape, "max abs", float(np.abs(ref - got).max()), "8-bit off fraction", float(off), "max 8-bit diff", float(np.abs(q(ref) - q(got)).max()))
data = open(onnx_path, "rb").read()
print("size", len(data), "sha256", hashlib.sha256(data).hexdigest())
