"""Pack a Rocketbox avatar (FBX2glTF output + *_color.tga textures) into one game-ready GLB.
- textures downscaled and stored as WebP (EXT_texture_webp)
- the *_opacity material (hair, eyelashes) gets alpha-tested
- normal/specular maps are dropped to stay inside the phone budget
Usage: python rocketbox2glb.py <dir with out_out/out.gltf and *_color.tga> <out.glb> [maxTex]
Get the gltf first:  FBX2glTF -i Male_Adult_XX.fbx -o out   (npm package fbx2gltf)
"""
import sys, os, io, json, glob, struct
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
MAXTEX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
g = json.load(open(os.path.join(src, 'out_out', 'out.gltf')))
binbuf = bytearray(open(os.path.join(src, 'out_out', g['buffers'][0]['uri']), 'rb').read())

def pad4(b):
    while len(b) % 4: b.append(0)

def add_view(data):
    pad4(binbuf); off = len(binbuf); binbuf.extend(data)
    g['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    return len(g['bufferViews']) - 1

images, textures = [], []
for mi, m in enumerate(g['materials']):
    name = m['name']                       # e.g. m250_body
    tga = os.path.join(src, name + '_color.tga')
    m.pop('extensions', None)
    pbr = {'metallicFactor': 0.0, 'roughnessFactor': 0.85}
    if os.path.exists(tga):
        im = Image.open(tga)
        alpha = name.endswith('_opacity')
        im = im.convert('RGBA' if alpha else 'RGB')
        size = MAXTEX if not alpha else MAXTEX // 2
        if 'keffiyeh' in name: size = MAXTEX // 2
        im.thumbnail((size, size), Image.LANCZOS)
        bio = io.BytesIO(); im.save(bio, 'WEBP', quality=82, method=6)
        images.append({'bufferView': add_view(bio.getvalue()), 'mimeType': 'image/webp'})
        textures.append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(images) - 1}}})
        pbr['baseColorTexture'] = {'index': len(textures) - 1}
        if alpha:
            m['alphaMode'] = 'MASK'; m['alphaCutoff'] = 0.5; m['doubleSided'] = True
    m['pbrMetallicRoughness'] = pbr
    for k in ('normalTexture', 'occlusionTexture', 'emissiveTexture'): m.pop(k, None)

g['images'], g['textures'] = images, textures
g['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
g['extensionsUsed'] = sorted(set(g.get('extensionsUsed', [])) - {'KHR_materials_pbrSpecularGlossiness'} | {'EXT_texture_webp'})
g['extensionsRequired'] = ['EXT_texture_webp']
g.pop('extensionsRequired', None) if not images else None
pad4(binbuf)
g['buffers'] = [{'byteLength': len(binbuf)}]

js = json.dumps(g, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(out, 'wb') as f:
    total = 12 + 8 + len(js) + 8 + len(binbuf)
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(binbuf), 0x004E4942)); f.write(binbuf)
print(out, os.path.getsize(out) // 1024, 'KB')
