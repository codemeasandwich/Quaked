#!/usr/bin/env python3
"""Remove the dark lines the upscaler left at texture edges (seams between repeats).

    python3 tools/texture_sheets/fix_seams.py            # mend newer/textures in place
    python3 tools/texture_sheets/fix_seams.py --check    # list edges the detector flags

A wall texture repeats, so a dark line along one of its edges shows as a grid of lines on
every surface it covers. Each replacement in newer/textures/index.json is compared, edge
by edge, with the original Quake texture it replaces (read from pak0.pak); see measure.

Detection is deliberately sensitive (LIMIT = 0.8):
  - where the original's edge is not dark, any edge row under 0.8 of the brightness just
    inside is a line;
  - where the original has an authored groove, the replacement's is a line only if it is
    clearly darker than the original's: over a native texel's width (under 0.8 of it), or
    in a near-black row (under half of it). A sharper groove is fine, a black one is not.
Only lines at the edge count: the dark rows must start within two native texels of the
edge and end within three and a half; a wider dark area is authored (a screen, a slot)
and is left alone. The original is searched one texel further, for registration.

The repair (mend) keeps the texture's size, alignment and UVs: dimmed pixels still hold
their detail and are brightened back, never past the pixels just inside them; near-black
rows hold none and are covered by stretching the good rows next to them outward. An
authored groove keeps the original's relative darkness. The matching height map is
mended the same way where it shows the line too, so relief does not draw it either (never
under an authored groove: some heights are authored relief). At most two passes run; the
edges the detector still flags afterwards are listed (they were reviewed by eye: kept
grooves and ordinary light variation, see docs/texture-seams-2026-10-02.md).

Not mended: textures with no original in pak0 (the custom crate pictures: single crate
faces with a designed frame) and the edges in AUTHORED, reviewed by eye. Every repair is
recorded in seam_fixes.json next to this file, with the rows it touched;
tests/texture_seams_test.py checks that no clear seam line remains.

Re-run this after any tool that regenerates replacements (update_level_sheets.py,
update_wizard.py); it changes nothing where there is no line.
"""
import argparse, io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TEXTURES = ROOT / 'newer/textures'
RECORD = Path(__file__).resolve().parent / 'seam_fixes.json'
SIDES = 'tblr'
LIMIT = 0.8


def native_textures(pak=ROOT / 'games/shareware/pak0.pak'):
    """name -> RGB array of every miptex in pak0's maps (the originals)."""
    data = pak.read_bytes()
    _, off, ln = struct.unpack('<4sii', data[:12])
    files = {}
    for i in range(ln // 64):
        n, o, l = struct.unpack('<56sii', data[off + i * 64:off + i * 64 + 64])
        files[n.split(b'\0')[0].decode()] = data[o:o + l]
    pal = np.frombuffer(files['gfx/palette.lmp'], dtype=np.uint8).reshape(256, 3)
    out = {}
    for name, bsp in files.items():
        if not name.endswith('.bsp') or struct.unpack('<i', bsp[:4])[0] != 29: continue
        lo, ll = struct.unpack('<ii', bsp[20:28])
        lump = bsp[lo:lo + ll]
        count = struct.unpack('<i', lump[:4])[0]
        for o in struct.unpack('<%di' % count, lump[4:4 + 4 * count]):
            if o < 0: continue
            tn, w, h, o0 = struct.unpack('<16sIIi', lump[o:o + 28])
            tn = tn.split(b'\0')[0].decode('latin1').lower()
            if tn in out or not w or w > 1024: continue
            px = np.frombuffer(lump[o + o0:o + o0 + w * h], dtype=np.uint8).reshape(h, w)
            out[tn] = pal[px]
    return out


def lum(a):
    return np.asarray(a, dtype=float)[..., :3] @ [0.299, 0.587, 0.114]


def view(a, side):
    """the array turned so that `side` is row 0 (a view: writes go through)."""
    return {'t': a, 'b': a[::-1], 'l': a.swapaxes(0, 1), 'r': a.swapaxes(0, 1)[::-1]}[side]


def measure(L, side, native, sc=None):
    """(d, band, dn, rows, native texel size in pixels) for one edge, or None when the
    edge has no line: nothing dark starts within one native texel of the edge, or the
    dark area runs more than three native texels in (an authored dark region, such as a
    screen or a slot).

    d is the line's darkest row and band its darkest native texel's worth of rows, both
    against the next three texels in; dn is the original's darkest texel among its outer
    four (one texel of tolerance for registration), or the texel it meets across the
    seam, against the original's next three; rows is the line's width from the edge,
    including its dark halo."""
    A = view(L, side); m = A.mean(1)
    across = 0 if side in 'tb' else 1
    if sc is None: sc = A.shape[0] / native.shape[across] if native is not None else A.shape[0] / 64
    cap = int(max(3, np.ceil(sc * 3.5)))
    ref = max(np.median(m[cap:2 * cap]), 1)
    if m[:max(2, int(round(sc * 2)))].min() >= LIMIT * ref: return None
    k = int(np.argmin(m[:cap]))
    rows = next((i for i in range(k + 1, cap + 1) if m[i] >= 0.75 * ref and m[i + 1] >= 0.7 * ref), None)
    if rows is None: return None
    d = m[k] / ref
    step = max(1, int(round(sc)))
    band = min(m[j:j + step].mean() for j in range(0, cap - step + 1, step)) / ref
    dn = None
    if native is not None:
        nm = view(lum(native), side).mean(1)
        dn = min(nm[0:4].min(), nm[-1]) / max(np.median(nm[4:7]), 1)
    return float(d), float(band), (None if dn is None else float(dn)), int(rows), sc


def is_seam(d, band, dn):
    # an authored groove: too dark over its width, or a near-black row where the
    # original is only somewhat dark
    if dn is not None and dn < LIMIT: return band < LIMIT * dn or d < 0.5 * dn
    return d < LIMIT


BLACK = 0.35  # rows darker than this (against the inside) carry no detail worth keeping


def mend(a, side, rows, t, ref_rows):
    """remove the line over the edge `rows`, keeping detail wherever there is any; returns
    how many edge rows it changed.

    A line with a near-black core (rows under BLACK of the inside on average) holds
    nothing there: the untouched rows beyond the whole line are stretched outward over
    it, in a zone up to four times as wide, so the zone's inner end meets the untouched
    texture exactly (no mirroring, no step); the core rows are then scaled once by t.
    A line that is only dimmed still holds its texture, so nothing is moved: each dark
    pixel is brightened, never past t times the pixels just inside the line at the same
    place (smoothed along the edge), and pixels that are not dark are left exactly as
    they are. t = min(1, dn) keeps an authored groove at the original's darkness."""
    A = view(a, side)
    F = A.astype(float)
    L = lum(F) if F.ndim == 3 else F
    ref = max(np.median(L[ref_rows:2 * ref_rows]), 1)
    black = [i for i in range(rows) if L[i].mean() / ref < BLACK]
    if black:
        core = black[-1] + 1
        zone = max(rows + 1, min(4 * rows, A.shape[0] // 6))
        src = F[:zone + 1]
        pos = rows + np.arange(zone) * (zone - rows) / zone
        i0 = np.floor(pos).astype(int)
        f = (pos - i0).reshape((zone,) + (1,) * (src.ndim - 1))
        new = src[i0] * (1 - f) + src[i0 + 1] * f
        new[:core] *= t
        A[:zone] = np.clip(np.rint(new), 0, 255).astype(a.dtype)
        return zone
    inside = L[rows:rows + 3].mean(0)
    inside = np.convolve(np.pad(inside, 4, mode='wrap'), np.ones(9) / 9, mode='valid')
    for i in range(rows):
        want = t * inside
        g = np.minimum(np.where(L[i] < want, want / np.maximum(L[i], 1), 1.0), 1 / BLACK)
        F[i] = F[i] * (g[:, None] if F.ndim == 3 else g)
    A[:rows] = np.clip(np.rint(F[:rows]), 0, 255).astype(a.dtype)
    return rows


def lossless(path):
    head = path.read_bytes()[:16]
    return head[12:16] == b'VP8L'


def save(img, path, was_lossless):
    buf = io.BytesIO()
    if was_lossless: img.save(buf, 'WEBP', lossless=True, exact=True)
    else: img.save(buf, 'WEBP', quality=92, method=6)
    path.write_bytes(buf.getvalue())


# Edges reviewed by eye (docs/texture-seams-2026-10-02.md) whose dark border is the
# artwork, not an upscaler line, or where mending would damage it. Left alone.
AUTHORED = {
    '+0planet': 'screen panel: black background the original also has',
    '+1planet': 'screen panel: black background the original also has',
    '+2planet': 'screen panel: black background the original also has',
    '+3planet': 'screen panel: black background the original also has',
    'sliplite': 'a different design from the original; its frame is drawn',
    'rock0sid': 'small box side: the dark corners are its panels',
    'rockettop': 'box top: its panel seams are drawn',
    'plat_top1': 'platform top: its grooves are drawn (the original has them)',
    'plat_top2': 'platform top: its grooves are drawn (the original has them)',
    'key03_3': 'key door frame: groove the original has; mending stretches its bolts',
    'tlight11': 'light fixture: its rim is drawn',
    'light1_4': 'light panel: its grooves are drawn (the original has them); mending stretches its bolts',
    '+0_box_side': 'box side: the dark edge is the box outline (the original has it); mending smears its rivets',
    '+1_box_side': 'box side: the dark edge is the box outline (the original has it); mending smears its rivets',
    'door05_2': 'door: the wide gap between the arches is painted black (the original is dark brown), not a line',
}


def scan(index, natives):
    """every seam edge: dicts of name, side, d, dn, rows, scale."""
    found = []
    for name, file in index['textures'].items():
        L = lum(np.asarray(Image.open(TEXTURES / file).convert('RGB')))
        native = natives.get(name.lower())
        if native is None or name in AUTHORED: continue  # crates have no original
        for side in SIDES:
            got = measure(L, side, native)
            if got is None: continue
            d, band, dn, rows, sc = got
            if is_seam(d, band, dn):
                found.append(dict(name=name, side=side, d=round(d, 3), dn=None if dn is None else round(dn, 3), rows=rows, scale=sc))
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--check', action='store_true', help='list the edges the detector flags; change nothing')
    args = ap.parse_args()
    index = json.loads((TEXTURES / 'index.json').read_text())
    natives = native_textures()
    found = scan(index, natives)
    if args.check:
        for f in found: print(f"{f['name']:16s} {f['side']} d={f['d']} native={f['dn']} rows={f['rows']}")
        print(len(found), 'edges flagged'); return
    record = json.loads(RECORD.read_text()) if RECORD.exists() else {'fixed': {}}
    # Two passes at most: the second finishes rows the first only partly brightened.
    # Stretching only ever applies to near-black rows, which the first pass removes.
    for _ in range(2):
        if not found: break
        fix(found, index, record)
        found = scan(index, natives)
    RECORD.write_text(json.dumps(record, indent=1, sort_keys=True) + '\n')
    for f in found: print('still flagged:', f['name'], f['side'], f['d'], f['dn'])
    print(sum(len(v) for v in record['fixed'].values()), 'edge repairs on', len(record['fixed']), 'textures;', len(found), 'edges still flagged')


def fix(found, index, record):
    by_name = {}
    for f in found: by_name.setdefault(f['name'], []).append(f)
    for name, edges in by_name.items():
        dpath = TEXTURES / index['textures'][name]
        diffuse = np.array(Image.open(dpath).convert('RGB'))
        normal = index['normals'].get(name)
        hpath = TEXTURES / normal['file'] if normal else None
        himg = Image.open(hpath) if hpath else None
        height = np.array(himg) if himg else None
        entries = []
        for f in edges:
            t = 1.0 if f['dn'] is None else min(1.0, f['dn'])
            cap = int(max(3, np.ceil(f['scale'] * 3.5)))
            touched = mend(diffuse, f['side'], f['rows'], t, cap)
            hrows = htouched = None
            # The height is mended only where it shows the line itself, and never under an
            # authored groove: some heights are authored relief (city5_1's exposed brick).
            if height is not None and t >= LIMIT:
                across = 0 if f['side'] in 'tb' else 1
                hsc = f['scale'] * height.shape[across] / diffuse.shape[across]
                hl = lum(height) if height.ndim == 3 else height.astype(float)
                got = measure(hl, f['side'], None, hsc)
                if got is not None and got[0] < LIMIT:
                    hrows = got[3]
                    htouched = mend(height, f['side'], hrows, 1.0, int(max(3, np.ceil(hsc * 3.5))))
            entries.append(dict(side=f['side'], rows=f['rows'], touched=touched, heightRows=hrows, heightTouched=htouched,
                                scale=round(t, 3), before=f['d'], native=f['dn']))
        save(Image.fromarray(diffuse), dpath, lossless(dpath))
        if height is not None and any(e['heightRows'] for e in entries): save(Image.fromarray(height, himg.mode), hpath, lossless(hpath))
        record['fixed'].setdefault(name, []).extend(entries)
        print(name, ' '.join(f"{e['side']}:{e['rows']}x{e['scale']}" for e in entries))


if __name__ == '__main__':
    main()
