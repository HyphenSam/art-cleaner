"""Stores float32 initializers that are exactly fp16 values as fp16, each followed by a Cast to float32.
The maths stays fp32; ONNX Runtime folds the Casts when it loads the model."""
import sys, numpy as np, onnx
from onnx import helper, numpy_helper, TensorProto
src, out = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph
casts, kept, moved = [], [], 0
for init in g.initializer:
    a = numpy_helper.to_array(init)
    if a.dtype == np.float32 and a.size > 16 and np.array_equal(a.astype(np.float16).astype(np.float32), a):
        name16 = init.name + "__fp16"
        kept.append(numpy_helper.from_array(a.astype(np.float16), name16))
        casts.append(helper.make_node("Cast", [name16], [init.name], to=TensorProto.FLOAT, name=init.name + "__cast"))
        moved += 1
    else:
        kept.append(init)
del g.initializer[:]
g.initializer.extend(kept)
nodes = list(g.node)
del g.node[:]
g.node.extend(casts + nodes)
onnx.checker.check_model(m)
onnx.save(m, out)
print("fp16-stored initializers:", moved)
