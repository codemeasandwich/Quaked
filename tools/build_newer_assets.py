#!/usr/bin/env python3
"""Builds newer/enemies/ (the Quake Reforged skins used by Newer Game) from the
original downloads, and writes newer/enemies/index.json which the game reads.

  python3 tools/build_newer_assets.py SOURCE_DIR

SOURCE_DIR holds the extracted archives, either
  - a "QR_<Name>_alt_NN" folder with "For Darkplaces/id1/progs/<model>.mdl_0*.jpg"
    (diffuse, _norm, _luma, _gloss), or
  - a folder of loose "<model>_0.jpg|tga" diffuse skins.
Every skin found becomes a variant of its model; a monster picks one at random.
Skins without a normal map get one generated from the skin (tools/gen_normal.mjs).

Needs Pillow and Node.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'newer', 'enemies')
MAXES = {'diffuse': 2048, 'normal': 2048, 'luma': 1024, 'gloss': 1024}
QUALITY = {'diffuse': 86, 'normal': 90, 'luma': 80, 'gloss': 70}
GEN_MAX = 1024  # generated normal maps are built at this size

def find_skins(src):
    """{model: [ {maps: {name: path}, provided_normal: bool} ]} in a stable order."""
    found = {}
    for entry in sorted(os.listdir(src)):
        path = os.path.join(src, entry)
        prog = os.path.join(path, 'For Darkplaces', 'id1', 'progs')
        if os.path.isdir(prog):
            per = {}
            for f in sorted(os.listdir(prog)):
                if not f.endswith('.jpg') or '.mdl_0' not in f: continue
                model, rest = f.split('.mdl_0', 1)
                kind = {'.jpg': 'diffuse', '_norm.jpg': 'normal', '_luma.jpg': 'luma', '_gloss.jpg': 'gloss'}.get(rest)
                if kind: per.setdefault(model, {})[kind] = os.path.join(prog, f)
            for model, maps in per.items():
                found.setdefault(model, []).append({'maps': maps, 'provided_normal': 'normal' in maps})
        elif os.path.isdir(path):
            for f in sorted(os.listdir(path)):
                base, ext = os.path.splitext(f)
                if ext.lower() in ('.jpg', '.tga', '.png') and base.endswith('_0'):
                    found.setdefault(base[:-2], []).append({'maps': {'diffuse': os.path.join(path, f)}, 'provided_normal': False})
    return found

def save(im, path, kind):
    m = MAXES[kind]
    if max(im.size) > m:
        s = m / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(path, 'WEBP', quality=QUALITY[kind], method=6)

def generate_normal(diffuse_path, out_path):
    im = Image.open(diffuse_path).convert('RGB')
    if max(im.size) > GEN_MAX:
        s = GEN_MAX / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    rgba = im.convert('RGBA')
    with tempfile.TemporaryDirectory() as t:
        a, b = os.path.join(t, 'in.rgba'), os.path.join(t, 'out.rgba')
        open(a, 'wb').write(rgba.tobytes())
        subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gen_normal.mjs'),
                        a, str(im.width), str(im.height), b], check=True)
        n = Image.frombytes('RGBA', im.size, open(b, 'rb').read()).convert('RGB')  # alpha (height) is dropped
    n.save(out_path, 'WEBP', quality=QUALITY['normal'], method=6)

def main():
    src = sys.argv[1]
    found = find_skins(src)
    if os.path.isdir(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    index = {'version': 1, 'models': {}}
    for model in sorted(found):
        seen, n = set(), 0
        for skin in found[model]:
            # the same skin can be in several archives
            digest = hashlib.md5(open(skin['maps']['diffuse'], 'rb').read()).hexdigest()
            if digest in seen: continue
            seen.add(digest); n += 1
            vdir = f'{model}/v{n}'
            os.makedirs(os.path.join(OUT, vdir))
            maps = {}
            for kind, p in skin['maps'].items():
                save(Image.open(p).convert('RGB'), os.path.join(OUT, vdir, kind + '.webp'), kind)
                maps[kind] = kind + '.webp'
            if 'normal' not in maps:
                generate_normal(skin['maps']['diffuse'], os.path.join(OUT, vdir, 'normal.webp'))
                maps['normal'] = 'normal.webp'
            index['models'].setdefault(model, []).append({'dir': vdir, 'maps': maps,
                                                          'flipGreen': skin['provided_normal']})
            print(f'{vdir:14} ' + ' '.join(sorted(maps)) + ('' if skin['provided_normal'] else '  (normal generated)'))
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), indent=1, sort_keys=True)

if __name__ == '__main__':
    main()
