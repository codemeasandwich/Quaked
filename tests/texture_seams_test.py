"""Seam lines at the edges of the Newer Game wall textures (tools/texture_sheets/fix_seams.py).

Checks the installed textures, not the tool's own report: no clear dark line is left at
any edge (against the original Quake texture from pak0.pak), each repair changed only the
edge rows it recorded, everything reviewed as authored is untouched, and the catalogue
only changed its version. BASE is the last commit before the repairs.

    python3 -m unittest tests/texture_seams_test.py
"""
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/texture_sheets'))
import fix_seams  # noqa: E402  (pak reading and the edge measurement)

BASE = 'd780a96'
TEXTURES = ROOT / 'newer/textures'
INDEX = json.loads((TEXTURES / 'index.json').read_text())
FIXED = json.loads((ROOT / 'tools/texture_sheets/seam_fixes.json').read_text())['fixed']
NATIVES = fix_seams.native_textures()


def at_base(path):
    return Image.open(io.BytesIO(subprocess.check_output(['git', 'show', f'{BASE}:newer/textures/{path}'], cwd=ROOT)))


def rgb(image):
    return np.asarray(image.convert('RGB'), dtype=int)


def touched_mask(name, shape, key):
    mask = np.zeros(shape[:2], dtype=bool)
    for fix in FIXED.get(name, []):
        n = fix[key] or 0
        if fix['side'] == 't': mask[:n] = True
        elif fix['side'] == 'b': mask[mask.shape[0] - n:] = True
        elif fix['side'] == 'l': mask[:, :n] = True
        else: mask[:, mask.shape[1] - n:] = True
    return mask


def clear_line(image, name):
    """edges with a clear dark line: under 0.7 of the inside where the original's edge is
    not dark; where the original has a groove, under 0.75 of its darkness over a native
    texel or under 0.4 of it in one row (a black line, not a sharper groove)."""
    L = fix_seams.lum(rgb(image))
    found = []
    for side in 'tblr':
        got = fix_seams.measure(L, side, NATIVES[name.lower()])
        if got is None: continue
        d, band, dn = got[:3]
        if (dn >= .8 and d < .7) or (dn < .8 and (band < .75 * dn or d < .4 * dn)):
            found.append((side, round(d, 2), round(dn, 2)))
    return found


class TextureSeams(unittest.TestCase):
    def test_no_clear_line_at_any_mended_texture_edge(self):
        checked = 0
        for name, file in INDEX['textures'].items():
            if name.lower() not in NATIVES or name in fix_seams.AUTHORED: continue
            with self.subTest(texture=name):
                self.assertEqual(clear_line(Image.open(TEXTURES / file), name), [])
            checked += 1
        self.assertGreater(checked, 290, 'every replacement with an original is checked')

    def test_the_check_finds_the_lines_that_were_there(self):
        before = [name for name in FIXED if clear_line(at_base(INDEX['textures'][name]), name)]
        # the rest had fainter lines, found by the tool's more sensitive detector
        self.assertGreaterEqual(len(before), .75 * len(FIXED), 'the same check fails on most mended textures before the repair')
        for name in ('mmetal1_1', 'metal4_4', 'metal4_2', 'metal5_1', 'metalt2_1', 'wswamp2_2', 'wall16_7', 'wizwood1_7', 'city6_4'):
            self.assertIn(name, before, name + ' had a visible line')
            self.assertIn(name, FIXED, name + ' was mended')

    def test_repairs_change_only_the_rows_they_record(self):
        for name, fixes in FIXED.items():
            self.assertNotIn(name, fix_seams.AUTHORED)
            for key, path in (('touched', INDEX['textures'][name]), ('heightTouched', INDEX['normals'][name]['file'])):
                with self.subTest(texture=name, map=key):
                    new, old = Image.open(TEXTURES / path), at_base(path)
                    self.assertEqual(new.size, old.size, 'size (and so UVs) unchanged')
                    a, b = rgb(new), rgb(old)
                    keep = ~touched_mask(name, a.shape, key)
                    if key == 'heightTouched' and not any(f['heightRows'] for f in fixes):
                        self.assertEqual((TEXTURES / path).read_bytes(), subprocess.check_output(['git', 'show', f'{BASE}:newer/textures/{path}'], cwd=ROOT), 'height not rewritten')
                        continue
                    for fix in fixes:
                        across = a.shape[0] if fix['side'] in 'tb' else a.shape[1]
                        self.assertLessEqual(fix[key] or 0, across // 6 + 1, 'a repair stays at the edge')
                    diff = np.abs(a - b)[keep]
                    if (TEXTURES / path).read_bytes()[12:16] == b'VP8L':
                        self.assertEqual(int(diff.max()), 0, 'lossless file identical outside the repair')
                    else:
                        self.assertLess(float(diff.mean()), 3, 'lossy file: re-encoding noise only outside the repair')

    def test_authored_crates_and_untouched_files_are_byte_identical(self):
        changed = set(subprocess.check_output(['git', 'diff', '--name-only', BASE, '--', 'newer/textures'], cwd=ROOT, text=True).splitlines())
        changed |= set(subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', 'newer/textures'], cwd=ROOT, text=True).splitlines())
        allowed = {'newer/textures/index.json', 'newer/textures/CREDITS.txt'}
        for name, fixes in FIXED.items():
            allowed.add('newer/textures/' + INDEX['textures'][name])
            if any(f['heightRows'] for f in fixes): allowed.add('newer/textures/' + INDEX['normals'][name]['file'])
        self.assertEqual(changed, allowed, 'only mended textures (and their heights where mended) changed')
        for name in list(fix_seams.AUTHORED) + [n for n in INDEX['textures'] if n.lower() not in NATIVES]:
            self.assertNotIn('newer/textures/' + INDEX['textures'][name], changed, name)

    def test_catalogue_changes_only_its_version(self):
        base = json.loads(subprocess.check_output(['git', 'show', f'{BASE}:newer/textures/index.json'], cwd=ROOT))
        self.assertEqual(INDEX['textures'], base['textures'])
        self.assertEqual(INDEX['normals'], base['normals'])
        self.assertGreater(INDEX['version'], base['version'], 'browsers fetch the mended pictures')


if __name__ == '__main__':
    unittest.main()
