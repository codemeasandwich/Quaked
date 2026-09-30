#!/usr/bin/env python3
"""Extract the status bar's sprites from pak0.pak (gfx.wad) and pack them into sheets.

    python3 hud_sprites.py pak0.pak out_dir

out_dir/individual/<name>.png   every sprite on its own, with transparency
out_dir/sheets/<group>_<n>.png  themed sheets (transparent pixels black, 4 px border)
out_dir/sheets/<group>_<n>_alpha.png   each sheet's transparency, white = solid
out_dir/manifest.json           where each sprite sits on its sheet
"""
import json, os, re, struct, sys
from PIL import Image

PAD = 4
MAX_W = 400

GROUPS = [
    ('bars', r'(SBAR|IBAR|SCOREBAR)$'),
    ('numbers', r'(NUM_|ANUM_)'),
    ('faces', r'FACE'),
    ('ammo_armor', r'(SB_ARMOR|SB_ROCKET|SB_SHELLS|SB_NAILS|SB_CELLS)'),
    ('keys_powerups', r'(SB_KEY|SB_INVIS|SB_INVULN|SB_SUIT|SB_QUAD|SB_SIGIL)'),
    ('keys_powerups_flash', r'(SBA\d_)'),
    ('weapons', r'(INV_|INV2_)'),
    ('weapons_flash', r'INVA\d_'),
]

def read_pak(path):
    d = open(path, 'rb').read()
    _, ofs, ln = struct.unpack('<4sii', d[:12])
    files = {}
    for i in range(ln // 64):
        n, p, l = struct.unpack('<56sii', d[ofs + i * 64:ofs + i * 64 + 64])
        files[n.split(b'\0')[0].decode()] = d[p:p + l]
    return files

def main(pak, out):
    files = read_pak(pak)
    pal = files['gfx/palette.lmp']; pal = [tuple(pal[i * 3:i * 3 + 3]) for i in range(256)]
    wad = files['gfx.wad']
    _, num, dirofs = struct.unpack('<4sii', wad[:12])
    sprites = {}
    for i in range(num):
        fp, dsz, sz, t, c, _, nm = struct.unpack('<iiibbh16s', wad[dirofs + i * 32:dirofs + i * 32 + 32])
        nm = nm.split(b'\0')[0].decode()
        if t != 0x42: continue
        w, h = struct.unpack('<ii', wad[fp:fp + 8]); px = wad[fp + 8:fp + 8 + w * h]
        for g, pat in GROUPS:
            if re.match(pat, nm):
                im = Image.new('RGBA', (w, h))
                im.putdata([(0, 0, 0, 0) if p == 255 else pal[p] + (255,) for p in px])
                sprites[nm] = (g, im); break
    os.makedirs(os.path.join(out, 'individual'), exist_ok=True); os.makedirs(os.path.join(out, 'sheets'), exist_ok=True)
    for nm, (g, im) in sprites.items(): im.save(os.path.join(out, 'individual', nm.lower() + '.png'))
    manifest = {'pad': PAD, 'sheets': {}, 'sprites': {}}
    for group, _ in GROUPS:
        items = [(n, im) for n, (g, im) in sprites.items() if g == group]
        if not items: continue
        items.sort(key=lambda t: (-t[1].height, t[0]))
        x = y = row = 0; placed = []; H = 0; Wm = 0
        for n, im in items:
            w, h = im.width + 2 * PAD, im.height + 2 * PAD
            if x + w > MAX_W: x = 0; y += row; row = 0
            placed.append((n, im, x, y)); x += w; row = max(row, h); Wm = max(Wm, x); H = max(H, y + h)
        fn = f'{group}_1.png'
        sheet = Image.new('RGB', (Wm, H), (0, 0, 0)); alpha = Image.new('L', (Wm, H), 0)
        for n, im, px_, py_ in placed:
            rgb = Image.new('RGB', im.size, (0, 0, 0)); rgb.paste(im, mask=im.getchannel('A'))
            tile = Image.new('RGB', (im.width + 2 * PAD, im.height + 2 * PAD)); tile.paste(rgb, (PAD, PAD))
            tile.paste(rgb.crop((0, 0, im.width, 1)).resize((im.width, PAD)), (PAD, 0))
            tile.paste(rgb.crop((0, im.height - 1, im.width, im.height)).resize((im.width, PAD)), (PAD, im.height + PAD))
            tile.paste(tile.crop((PAD, 0, PAD + 1, tile.height)).resize((PAD, tile.height)), (0, 0))
            tile.paste(tile.crop((PAD + im.width - 1, 0, PAD + im.width, tile.height)).resize((PAD, tile.height)), (PAD + im.width, 0))
            sheet.paste(tile, (px_, py_))
            alpha.paste(im.getchannel('A'), (px_ + PAD, py_ + PAD))
            manifest['sprites'][n] = {'sheet': fn, 'x': px_ + PAD, 'y': py_ + PAD, 'w': im.width, 'h': im.height}
        sheet.save(os.path.join(out, 'sheets', fn)); alpha.save(os.path.join(out, 'sheets', f'{group}_1_alpha.png'))
        manifest['sheets'][fn] = [Wm, H]
        print(fn, Wm, H, len(placed))
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)
    print(len(sprites), 'sprites')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
