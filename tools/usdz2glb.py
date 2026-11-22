"""Convert an unpacked USDZ car (scene.usdc + textures) into a game-ready GLB:
- drops interior meshes, bakes world transforms, converts to meters
- splits wheel meshes into 4 nodes (wheel_FL/FR/RL/RR) centred on the hub
- textures resized; metallic/roughness maps reduced to scalar factors
Usage: python3 usdz2glb.py <dir_with_scene.usdc> <out.glb> [maxTex]
"""
import sys, os, re, numpy as np, trimesh
from pxr import Usd, UsdGeom, UsdShade
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
MAXTEX = int(sys.argv[3]) if len(sys.argv) > 3 else 512
SKIP = re.compile(r'cockpit|interior|seat|steering|Internal_Engine|gauge|undercarriage', re.I)
WHEEL = re.compile(r'wheel|rim|tire|brakedisc|breaks', re.I)

stage = Usd.Stage.Open(os.path.join(src, 'scene.usdc'))
mpu = UsdGeom.GetStageMetersPerUnit(stage) or 0.01
texcache = {}

def tex_path(shader_input):
    srcs = shader_input.GetConnectedSources()
    if not srcs or not srcs[0]:
        return None, None
    s = srcs[0][0]
    tex = UsdShade.Shader(s.source.GetPrim())
    f = tex.GetInput('file')
    if not f:
        return None, None
    p = f.Get().path
    return os.path.join(src, p), s.sourceName

def load_img(path, size=MAXTEX):
    key = (path, size)
    if key not in texcache:
        im = Image.open(path)
        im.thumbnail((size, size))
        texcache[key] = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    return texcache[key]

def avg_channel(path):
    im = Image.open(path).convert('RGB').resize((32, 32))
    return float(np.asarray(im)[..., 0].mean() / 255.0)

matcache = {}
def material_for(prim):
    mat = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0]
    name = mat.GetPath().name if mat else 'default'
    if name in matcache:
        return matcache[name]
    kw = dict(name=name, metallicFactor=0.0, roughnessFactor=0.6, baseColorFactor=[200, 200, 200, 255], doubleSided=False)
    surf = None
    if mat:
        for p in Usd.PrimRange(mat.GetPrim()):
            if p.IsA(UsdShade.Shader) and UsdShade.Shader(p).GetIdAttr().Get() == 'UsdPreviewSurface':
                surf = UsdShade.Shader(p); break
    if surf:
        dc = surf.GetInput('diffuseColor')
        tp, _ = tex_path(dc) if dc else (None, None)
        if tp and os.path.exists(tp):
            kw['baseColorTexture'] = load_img(tp, MAXTEX * 2 if re.search('paint|body|chassis', name, re.I) else MAXTEX)
            kw['baseColorFactor'] = [255, 255, 255, 255]
        elif dc and dc.Get() is not None:
            c = dc.Get(); kw['baseColorFactor'] = [int(min(1, c[0] ** (1 / 2.2)) * 255), int(min(1, c[1] ** (1 / 2.2)) * 255), int(min(1, c[2] ** (1 / 2.2)) * 255), 255]
        for key, inp in (('metallicFactor', 'metallic'), ('roughnessFactor', 'roughness')):
            i = surf.GetInput(inp)
            if not i: continue
            tp, _ = tex_path(i)
            if tp and os.path.exists(tp): kw[key] = avg_channel(tp)
            elif i.Get() is not None: kw[key] = float(i.Get())
        em = surf.GetInput('emissiveColor')
        if em:
            tp, _ = tex_path(em)
            if tp and os.path.exists(tp): kw['emissiveTexture'] = load_img(tp, 256); kw['emissiveFactor'] = [1, 1, 1]
            elif em.Get() is not None and sum(em.Get()) > 0: kw['emissiveFactor'] = list(em.Get())
        op = surf.GetInput('opacity')
        o = None
        if op:
            o = op.Get()
        if (o is not None and o < 0.99) or re.search('glass|window|windwos|glaass', name, re.I):
            kw['alphaMode'] = 'BLEND'; kw['baseColorFactor'][3] = int(255 * (o if o is not None and o < 0.99 else 0.55))
            kw['doubleSided'] = True
    m = trimesh.visual.material.PBRMaterial(**kw)
    matcache[name] = m
    return m

def mesh_arrays(prim):
    mesh = UsdGeom.Mesh(prim)
    pts = np.array(mesh.GetPointsAttr().Get(), dtype=np.float64)
    counts = np.array(mesh.GetFaceVertexCountsAttr().Get())
    idx = np.array(mesh.GetFaceVertexIndicesAttr().Get())
    M = np.array(UsdGeom.Xformable(prim).ComputeLocalToWorldTransform(0), dtype=np.float64)
    pts = np.c_[pts, np.ones(len(pts))] @ M
    pts = pts[:, :3]
    pv = UsdGeom.PrimvarsAPI(prim)
    uv = None
    for nm in ('st', 'st0', 'UVMap', 'uv'):
        p = pv.GetPrimvar(nm)
        if p and p.HasValue():
            vals = np.array(p.ComputeFlattened(), dtype=np.float64)
            interp = p.GetInterpolation()
            uv = vals[idx] if interp in ('vertex', 'varying') else vals if interp == 'faceVarying' else None
            break
    nrm = None
    na = mesh.GetNormalsAttr()
    nv = na.Get() if na else None
    ninterp = mesh.GetNormalsInterpolation() if nv is not None else None
    if nv is None:
        pn = pv.GetPrimvar('normals')
        if pn and pn.HasValue(): nv = pn.ComputeFlattened(); ninterp = pn.GetInterpolation()
    if nv is not None:
        nv = np.array(nv, dtype=np.float64)
        nm = np.linalg.inv(M[:3, :3])  # строки-векторы: n' = n * inv(M)^T^T
        nv = nv @ nm.T
        nv /= np.linalg.norm(nv, axis=1, keepdims=True) + 1e-12
        if ninterp in ('vertex', 'varying') and len(nv) == len(pts): nrm = nv[idx]
        elif ninterp == 'faceVarying' and len(nv) == len(idx): nrm = nv
    # триангуляция веером
    tri = []
    start = 0
    for c in counts:
        for k in range(1, c - 1):
            tri.append((start, start + k, start + k + 1))
        start += c
    tri = np.array(tri)
    if mesh.GetOrientationAttr().Get() == 'leftHanded':
        tri = tri[:, [0, 2, 1]]
    if np.linalg.det(M[:3, :3]) < 0:
        tri = tri[:, [0, 2, 1]]
    corner_pos = pts[idx]
    if nrm is not None and mesh.GetOrientationAttr().Get() == 'leftHanded': nrm = -nrm
    return corner_pos, uv, tri, nrm

parts = {'body': [], 'wheel': []}
for prim in stage.Traverse():
    if not prim.IsA(UsdGeom.Mesh):
        continue
    path = str(prim.GetPath())
    if SKIP.search(path):
        continue
    pos, uv, tri, nrm = mesh_arrays(prim)
    if nrm is None: nrm = trimesh.Trimesh(vertices=pos, faces=tri, process=False).vertex_normals
    kind = 'wheel' if WHEEL.search(path) and not re.search('caliper|body', path, re.I) else 'body'
    parts[kind].append((pos, uv, tri, material_for(prim), path, nrm))

allpos = np.vstack([p[0] for k in parts for p in parts[k]])
ext = (allpos.max(axis=0) - allpos.min(axis=0)).max()
k_scale = 4.6 / ext if ext > 50 or ext < 1 else 1.0  # приводим к метрам (машина ~4-5 м)
k_scale = mpu if ext > 50 and abs(ext * mpu - 4.6) < 2 else k_scale
for k in parts:
    parts[k] = [(p[0] * k_scale,) + p[1:] for p in parts[k]]
allpos = allpos * k_scale
print('scale', k_scale)
wpos = np.vstack([p[0] for p in parts['wheel']])
cx, cz = (allpos[:, 0].min() + allpos[:, 0].max()) / 2, (allpos[:, 2].min() + allpos[:, 2].max()) / 2
ground = wpos[:, 1].min()
off = np.array([cx, ground, cz])

PAINT = re.compile(sys.argv[4] if len(sys.argv) > 4 else r'^(body|body_2|carpaint|paint)$', re.I)
GLASS = re.compile(r'glass|window|windwos|glaass', re.I)
REDL = re.compile(r'red', re.I)
HEADL = re.compile(r'^(light|head_light|reflector|textured_reflector)$', re.I)

def group_of(mat):
    n = mat.name
    if PAINT.search(n): return 'paint'
    if REDL.search(n) and GLASS.search(n): return 'taillight'
    if GLASS.search(n): return 'glass'
    if HEADL.search(n): return 'headlight'
    if getattr(mat, 'baseColorTexture', None) is not None: return 'tex_' + n
    return 'misc'

# палитра для простых материалов
pal_names = {}
def pal_index(mat):
    if mat.name not in pal_names: pal_names[mat.name] = (len(pal_names), mat)
    return pal_names[mat.name][0]
groups = {}  # (node, group) -> list of (pos, uv, tri, mat)
def collect(node, pos, uv, tri, mat, nrm):
    g = group_of(mat)
    groups.setdefault((node, g), []).append((pos, uv, tri, mat, nrm))

for pos, uv, tri, mat, path, nrm in parts['body']:
    collect('body', pos - off, uv, tri, mat, nrm)

hubs = {}
quad = {}
for pos, uv, tri, mat, path, nrm in parts['wheel']:
    p = pos - off
    cen = p[tri].mean(axis=1)
    for qn, sel in (('FL', (cen[:, 0] > 0) & (cen[:, 2] > 0)), ('FR', (cen[:, 0] <= 0) & (cen[:, 2] > 0)),
                    ('RL', (cen[:, 0] > 0) & (cen[:, 2] <= 0)), ('RR', (cen[:, 0] <= 0) & (cen[:, 2] <= 0))):
        if sel.any():
            quad.setdefault(qn, []).append((p, uv, tri[sel], mat, path, nrm))
for qn, items in quad.items():
    tirepts = [it[0][np.unique(it[2])] for it in items if re.search('tire', it[4], re.I)] or [it[0][np.unique(it[2])] for it in items]
    tp = np.vstack(tirepts)
    hub = (tp.min(axis=0) + tp.max(axis=0)) / 2
    hubs[qn] = (hub, float((tp[:, 1].max() - tp[:, 1].min()) / 2))
    for p, uv, tri, mat, path, nrm in items:
        used = np.unique(tri)
        remap = -np.ones(len(p), dtype=int); remap[used] = np.arange(len(used))
        collect('wheel_' + qn, p[used] - hub, uv[used] if uv is not None else None, remap[tri], mat, nrm[used])
    print('wheel_' + qn, 'hub', np.round(hub, 3), 'radius', round(hubs[qn][1], 3))

for key, items in groups.items():
    for it in items:
        if key[1] in ('misc', 'glass', 'taillight', 'headlight') and getattr(it[3], 'baseColorTexture', None) is None: pal_index(it[3])
PS = 16  # клетка палитры
side = int(np.ceil(np.sqrt(max(1, len(pal_names)))))
pal = Image.new('RGBA', (side * PS, side * PS), (255, 255, 255, 255))
for name, (i, m) in pal_names.items():
    c = tuple(int(v) for v in np.array(m.baseColorFactor).flatten()[:4]) if m.baseColorFactor is not None else (200, 200, 200, 255)
    pal.paste(c, ((i % side) * PS, (i // side) * PS, (i % side + 1) * PS, (i // side + 1) * PS))
def pal_uv(i, n):
    u = ((i % side) + 0.5) / side; v = 1 - ((i // side) + 0.5) / side
    return np.tile([u, v], (n, 1))

def avg(items, attr, dflt):
    vals = [getattr(it[3], attr) for it in items if getattr(it[3], attr) is not None]
    return float(np.mean(vals)) if vals else dflt

scene = trimesh.Scene()
for qn, (hub, r) in hubs.items():
    scene.graph.update(frame_from='world', frame_to='wheel_' + qn, matrix=trimesh.transformations.translation_matrix(hub))
for (node, g), items in groups.items():
    P, UV, F, NR, n0 = [], [], [], [], 0
    for pos, uv, tri, mat, nrm in items:
        P.append(pos); NR.append(nrm)
        if g.startswith('tex_') or g == 'paint':
            UV.append(uv if uv is not None else np.zeros((len(pos), 2)))
        elif getattr(mat, 'baseColorTexture', None) is not None:
            UV.append(np.full((len(pos), 2), 0.5))
        else:
            UV.append(pal_uv(pal_names[mat.name][0], len(pos)))
        F.append(tri + n0); n0 += len(pos)
    P, UV, F, NR = np.vstack(P), np.vstack(UV), np.vstack(F), np.vstack(NR)
    if g.startswith('tex_'):
        mat = items[0][3]; mat.name = g[4:]
    elif g == 'paint':
        m0 = items[0][3]
        tex = getattr(m0, 'baseColorTexture', None)
        mat = trimesh.visual.material.PBRMaterial(name='paint', baseColorFactor=[255, 255, 255, 255], baseColorTexture=tex, metallicFactor=0.55, roughnessFactor=0.3)
        if tex is None: UV = np.zeros((len(P), 2)); mat.baseColorTexture = Image.new('RGB', (4, 4), (255, 255, 255))
    else:
        blend = g in ('glass', 'taillight')
        mat = trimesh.visual.material.PBRMaterial(name=g, baseColorTexture=pal, baseColorFactor=[255, 255, 255, 255],
            metallicFactor=avg(items, 'metallicFactor', 0.2), roughnessFactor=avg(items, 'roughnessFactor', 0.5),
            alphaMode='BLEND' if blend else 'OPAQUE', doubleSided=blend, emissiveFactor=[0, 0, 0])
    vis = trimesh.visual.TextureVisuals(uv=UV, material=mat)
    m = trimesh.Trimesh(vertices=P, faces=F, visual=vis, vertex_normals=NR, process=False)
    nm = f'{node}__{g}'
    scene.add_geometry(m, node_name=nm, geom_name=nm, parent_node_name=node if node != 'body' else 'world')

tot = sum(len(g.faces) for g in scene.geometry.values())
b = scene.bounds
print('tris', tot, 'meshes', len(scene.geometry), 'size', np.round(b[1] - b[0], 3))
scene.export(out, include_normals=True)
print('wrote', out, os.path.getsize(out) // 1024, 'KB')
