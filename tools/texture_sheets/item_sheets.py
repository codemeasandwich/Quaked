#!/usr/bin/env python3
"""Merge the extracted pickup textures (extract_items.py) into one sheet per object, variations together.

    python3 item_sheets.py item_dir out_dir

Writes <object>.png (tiles on black, 4 px apart, native size) and manifest.json (tile name -> sheet, x, y, w, h).
Identical pictures (the rocket box top is in every ammo box) appear once. Objects with one picture are copied as they are.
"""
import glob, hashlib, json, os, sys
from PIL import Image

GROUPS = {
    'armor': ['armor_skin*'],
    'health_boxes': ['b_bh10__*', 'b_bh25__*', 'b_bh100__*'],
    'ammo_shells': ['b_shell0__*', 'b_shell1__*'],
    'ammo_nails': ['b_nail0__*', 'b_nail1__*'],
    'ammo_rockets': ['b_rock0__*', 'b_rock1__*'],
    'ammo_cells': ['b_batt0__*', 'b_batt1__*'],
    'explosive_box': ['b_explob__*'],
    'nailguns': ['g_nail_skin*', 'g_nail2_skin*'],
    'rocket_launchers': ['g_rock_skin*', 'g_rock2_skin*'],
    'keys': ['w_g_key_skin*', 'w_s_key_skin*'],
}
PAD = 4; MAXW = 400

def pack(tiles):
    x = y = PAD; rowh = 0; pos = []; W = 0
    for n, im in tiles:
        if x + im.width + PAD > MAXW and x > PAD: x = PAD; y += rowh + PAD; rowh = 0
        pos.append((n, x, y, im)); x += im.width + PAD; rowh = max(rowh, im.height); W = max(W, x)
    return pos, W, y + rowh + PAD

def main(src, out):
    os.makedirs(out, exist_ok=True); manifest = {'pad': PAD, 'sheets': {}, 'textures': {}}; used = set()
    for obj, pats in GROUPS.items():
        files = sorted({f for p in pats for f in glob.glob(os.path.join(src, p + '.png'))})
        seen = {}; tiles = []
        for f in files:
            used.add(f); im = Image.open(f).convert('RGB'); h = hashlib.md5(im.tobytes() + str(im.size).encode()).hexdigest()
            if h in seen: continue
            seen[h] = 1; tiles.append((os.path.basename(f)[:-4], im))
        tiles.sort(key=lambda t: -t[1].height)
        pos, W, H = pack(tiles)
        sheet = Image.new('RGB', (W, H)); 
        for n, x, y, im in pos:
            sheet.paste(im, (x, y)); manifest['textures'][n] = {'sheet': obj + '.png', 'x': x, 'y': y, 'w': im.width, 'h': im.height}
        sheet.save(os.path.join(out, obj + '.png')); manifest['sheets'][obj + '.png'] = [W, H]
        print(obj, len(tiles), 'tiles', W, 'x', H)
    for f in sorted(glob.glob(os.path.join(src, '*.png'))):
        if f in used: continue
        im = Image.open(f).convert('RGB'); n = os.path.basename(f)
        im.save(os.path.join(out, n)); print('single', n, im.size)
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)

if __name__ == '__main__': main(*sys.argv[1:3])
