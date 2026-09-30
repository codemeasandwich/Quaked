#!/usr/bin/env python3
"""Pack the world (wall, door, panel, switch...) textures of pak0.pak into sheets.

    python3 make_sheets.py pak0.pak out_dir

Writes out_dir/<group>_<n>.png and out_dir/manifest.json (where each texture is).
Every texture has a border around it (its own edge pixels repeated) so an upscaler
does not smear one texture into the next; slice_sheets.py cuts them out again.
"""
import json, os, re, struct, sys
from PIL import Image

PAD = 4
MAX_W = 400
MAX_H = 400

def read_pak(path):
    d = open(path, 'rb').read()
    _, ofs, ln = struct.unpack('<4sii', d[:12])
    files = {}
    for i in range(ln // 64):
        n, p, l = struct.unpack('<56sii', d[ofs + i * 64:ofs + i * 64 + 64])
        files[n.split(b'\0')[0].decode()] = d[p:p + l]
    return files

THEMES = [
    ('doors', r'(door|adoor|edoor|dr0|enter|wenter|exit|z_exit|window|plat)'),
    ('keys', r'(key|wkey)'),
    ('switches_medieval', r'(\+.)?(butn|button|shoot)'),
    ('switches_base', r'(\+.)?(basebtn|basebutn|floorsw|switch|swtch|mswtch)'),
    ('slipgates_signs', r'(\+.)?(slip|skill|rune|altar|arrow|planet)'),
    ('lights', r'(\+.)?(light|tlight)'),
    ('tech_computers', r'(tech|comp|cop|ecop|m5_|elwall|uwall)'),
    ('metal', r'(metal|mmetal|nmetal|lgmetal|wmet|met5|metalt)'),
    ('base_walls', r'(twall|dem|sfloor|afloor|ceiling)'),
    ('wizard', r'(wiz|wizmet|wizwood)'),
    ('city_church', r'(city|carch|church|column|bricka|wbrick|stone|wall)'),
    ('rock_ground_wood', r'(rock|ground|wgrnd|wood|wswamp|vine)'),
    ('items_boxes', r'(_?med|batt|nail|shot|crate|_?box)'),
]

def group_of(name):
    if name.startswith('*') or name.lstrip('+').startswith('sky') or name in ('clip', 'trigger', 'black', 'quake', 'muh_bad', 'skip'): return None
    n = name[2:] if name.startswith('+') and len(name) > 2 else name
    for g, pat in THEMES:
        if re.match(pat, name) or re.match(pat, n): return g
    return 'misc'

def main(pak, out):
    files = read_pak(pak)
    pal = files['gfx/palette.lmp']; pal = [tuple(pal[i * 3:i * 3 + 3]) for i in range(256)]
    tex = {}
    for n, b in files.items():
        if not (n.startswith('maps/') and n.endswith('.bsp')): continue
        lo, ll = struct.unpack('<ii', b[4 + 2 * 8:4 + 2 * 8 + 8])
        lump = b[lo:lo + ll]; nt = struct.unpack('<i', lump[:4])[0]
        for i in range(nt):
            o = struct.unpack('<i', lump[4 + i * 4:8 + i * 4])[0]
            if o < 0: continue
            name = lump[o:o + 16].split(b'\0')[0].decode()
            w, h, o0 = struct.unpack('<iii', lump[o + 16:o + 28])
            if o0 == 0 or name in tex: continue
            g = group_of(name)
            if g is None: continue
            px = lump[o + o0:o + o0 + w * h]
            im = Image.new('RGB', (w, h)); im.putdata([pal[x] for x in px])
            tex[name] = (g, im)
    os.makedirs(out, exist_ok=True)
    manifest = {'pad': PAD, 'sheets': {}, 'textures': {}}
    for group in [g for g, _ in THEMES] + ['misc']:
        items = sorted(((n, im) for n, (g, im) in tex.items() if g == group), key=lambda t: (-t[1].height, t[0]))
        if not items: continue
        sheets = []; cur = None
        def new():
            return {'x': 0, 'y': 0, 'row': 0, 'items': []}
        cur = new()
        for n, im in items:
            w, h = im.width + 2 * PAD, im.height + 2 * PAD
            if cur['x'] + w > MAX_W: cur['x'] = 0; cur['y'] += cur['row']; cur['row'] = 0
            if cur['y'] + h > MAX_H: sheets.append(cur); cur = new()
            cur['items'].append((n, im, cur['x'], cur['y'])); cur['x'] += w; cur['row'] = max(cur['row'], h)
        sheets.append(cur)
        for si, s in enumerate(sheets):
            W = max(x + im.width + 2 * PAD for _, im, x, _ in s['items'])
            H = max(y + im.height + 2 * PAD for _, im, _, y in s['items'])
            sheet = Image.new('RGB', (W, H), (0, 0, 0))
            for n, im, x, y in s['items']:
                p = Image.new('RGB', (im.width + 2 * PAD, im.height + 2 * PAD))
                p.paste(im, (PAD, PAD))
                p.paste(im.crop((0, 0, im.width, 1)).resize((im.width, PAD)), (PAD, 0))
                p.paste(im.crop((0, im.height - 1, im.width, im.height)).resize((im.width, PAD)), (PAD, im.height + PAD))
                p.paste(p.crop((PAD, 0, PAD + 1, p.height)).resize((PAD, p.height)), (0, 0))
                p.paste(p.crop((PAD + im.width - 1, 0, PAD + im.width, p.height)).resize((PAD, p.height)), (PAD + im.width, 0))
                sheet.paste(p, (x, y))
                manifest['textures'][n] = {'sheet': f'{group}_{si + 1}.png', 'x': x + PAD, 'y': y + PAD, 'w': im.width, 'h': im.height}
            fn = f'{group}_{si + 1}.png'; sheet.save(os.path.join(out, fn))
            manifest['sheets'][fn] = [W, H]
            print(fn, W, H, len(s['items']), 'textures')
    json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
