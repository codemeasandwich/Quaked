#!/usr/bin/env python3
"""Extract the original pickup-item textures from pak0.pak at native size, in the game palette.

    python3 extract_items.py games/shareware/pak0.pak out_dir

Two kinds of pickup: models (armor, weapons, keys, powerups, backpack, runes: the skin sheet of each
progs/*.mdl) and boxes (health and ammo boxes: the textures inside maps/b_*.bsp).
"""
import os, struct, sys
from PIL import Image

MODEL_PICKUPS = ['armor','g_shot','g_nail','g_nail2','g_rock','g_rock2','g_light','quaddama','invulner','suit','invisibl',
                 'backpack','w_g_key','w_s_key','end1','end2','end3','end4','flame','flame2','bolt','bolt2','bolt3']

def read_pak(path):
    d = open(path, 'rb').read()
    magic, off, ln = struct.unpack('<4sii', d[:12]); assert magic == b'PACK'
    files = {}
    for i in range(ln // 64):
        name, pos, size = struct.unpack('<56sii', d[off + i * 64: off + i * 64 + 64])
        files[name.split(b'\0')[0].decode()] = d[pos:pos + size]
    return files

def main(pak, out):
    files = read_pak(pak); os.makedirs(out, exist_ok=True)
    pal = files['gfx/palette.lmp']; palette = [tuple(pal[i*3:i*3+3]) for i in range(256)]
    def img(data, w, h):
        im = Image.new('RGB', (w, h)); im.putdata([palette[b] for b in data]); return im
    n = 0
    for name in sorted(files):
        if name.startswith('progs/') and name.endswith('.mdl') and os.path.basename(name)[:-4] in MODEL_PICKUPS:
            d = files[name]
            if d[:4] != b'IDPO': continue
            nskins, sw, sh = struct.unpack('<3i', d[48:60])
            p = 84; base = os.path.basename(name)[:-4]
            for s in range(nskins):
                group = struct.unpack('<i', d[p:p+4])[0]; p += 4
                if group == 0:
                    img(d[p:p+sw*sh], sw, sh).save(f'{out}/{base}_skin{s}.png'); p += sw * sh; n += 1
                else:
                    cnt = struct.unpack('<i', d[p:p+4])[0]; p += 4 + 4 * cnt
                    for k in range(cnt):
                        img(d[p:p+sw*sh], sw, sh).save(f'{out}/{base}_skin{s}_{k}.png'); p += sw * sh; n += 1
        elif name.startswith('maps/b_') and name.endswith('.bsp'):
            d = files[name]
            off, ln = struct.unpack('<2i', d[4 + 2 * 8: 4 + 2 * 8 + 8])  # lump 2 = miptex
            cnt = struct.unpack('<i', d[off:off+4])[0]
            for i in range(cnt):
                o = struct.unpack('<i', d[off+4+i*4: off+8+i*4])[0]
                if o < 0: continue
                tn, w, h, o0 = struct.unpack('<16sIII', d[off+o: off+o+28])
                tn = tn.split(b'\0')[0].decode()
                img(d[off+o+o0: off+o+o0+w*h], w, h).save(f'{out}/{os.path.basename(name)[:-4]}__{tn.replace("*","star_").replace("+","anim")}.png'); n += 1
    print(n, 'images')

if __name__ == '__main__': main(*sys.argv[1:3])
