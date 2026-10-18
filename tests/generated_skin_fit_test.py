"""Independent public-CLI importer checks; run with /usr/bin/python3.

The existing fit_generated_skin.py CLI is invoked in a separate process. Owned native
assets are read in place; generated candidates and adversarial donor copies live
only in a temporary directory. Coverage is not aesthetic acceptance.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from resource_paths import resource_path


def head_resource_path(logical):
    """Choose a name inside HEAD, including history before the layout move."""
    physical = resource_path(ROOT, logical).relative_to(ROOT).as_posix()
    present = subprocess.run(['git', 'cat-file', '-e', 'HEAD:' + physical], cwd=ROOT,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return physical if present.returncode == 0 else logical


sys.path.insert(0, str(ROOT / 'tools/texture_sheets'))
from fit_vore import member
from update_head_skins import uv_footprint

SOURCE_SHA = '9733ca0523d1edcd2ea5899335d09746b85a907153cdae938abe127c9ef35a31'
MODEL_SHA = 'bdc4443c3a0d0bb30b4302bb7b1d9759344690c6148bea08a747436191325763'
PLACEMENTS = [
    ([1, 3], [410, 389], [23, 14, 802, 894], [22, 10, 599, 671]),
    ([2, 4], [1275, 389], [886, 13, 1669, 894], [638, 10, 1215, 671]),
    ([5], [337, 658], [292, 582, 401, 719], [225, 442, 299, 539]),
    ([6], [476, 659], [411, 582, 521, 720], [310, 442, 387, 543]),
    ([7], [1205, 657], [1160, 582, 1270, 719], [841, 442, 915, 539]),
    ([8], [1343, 659], [1280, 582, 1389, 720], [926, 442, 1003, 543]),
    ([9], [403, 782], [227, 731, 592, 854], [174, 554, 443, 643]),
    ([10], [1271, 783], [1095, 731, 1460, 854], [790, 554, 1059, 643]),
]
FIELDS = ('nativeComponents', 'sourceSeed', 'sourceBox', 'atlasBox')
TOOL = ROOT / 'tools/texture_sheets/fit_generated_skin.py'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def rgba(path):
    with Image.open(path) as image:
        return np.asarray(image.convert('RGBA'))


class GeneratedSkinFitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='quaked-fit-public-')
        cls.work = Path(cls.temp.name)
        cls.recipe = json.loads((ROOT / 'tools/texture_sheets/sources/fidelity-2026-10-12/grem-character.json').read_text())
        cls.pack = Path(os.environ.get('QUAKED_HIPNOTIC_PAK', Path('/Users/bri/quaked/Scourge of Armagon/pak0.pak')))
        cls.bytes = member(cls.pack, 'progs/grem.mdl')
        cls.labels, cls.count = ndimage.label(uv_footprint(cls.bytes, 4))
        cls.output = cls.run_fit(cls.recipe, 'actual')

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def invoke(cls, recipe, name, pack=None):
        path = cls.work / (name + '.json')
        path.write_text(json.dumps(recipe))
        output = cls.work / name
        process = subprocess.run([sys.executable, str(TOOL), str(path), '--pack', str(pack or cls.pack), '--output', str(output)],
                                 cwd=ROOT, text=True, capture_output=True, timeout=180,
                                 env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
        return process, output

    @classmethod
    def run_fit(cls, recipe, name, pack=None):
        process, output = cls.invoke(recipe, name, pack)
        if process.returncode:
            raise AssertionError('Public fit failed: ' + process.stdout + process.stderr)
        print('PUBLIC_FIT', name, process.stdout.strip(), flush=True)
        return output / recipe['key'] / recipe.get('outputVariant', 'custom')

    def test_actual_gremlin_complete_coverage_and_measured_landmarks(self):
        source = resource_path(ROOT, ROOT / self.recipe['sourceFile'])
        self.assertEqual(digest(source.read_bytes()), SOURCE_SHA)
        self.assertEqual(digest(self.bytes), MODEL_SHA)
        actual = [tuple(p[k] for k in FIELDS) for p in self.recipe['piecePlacements']]
        self.assertEqual(actual, PLACEMENTS)
        self.assertEqual(sorted(i for p in actual for i in p[0]), list(range(1, 11)))
        report = json.loads((self.output / 'SOURCE.json').read_text())
        self.assertEqual(report['sourceSha256'], SOURCE_SHA)
        self.assertEqual(report['nativeModelSha256'], MODEL_SHA)
        self.assertEqual(report['nativeTexturePixelsUsed'], 0)
        self.assertEqual(report['dimensions'], [1232, 676])
        self.assertEqual(self.recipe['factor'], 4)
        self.assertEqual(report['factor'], 4)
        self.assertEqual(report['surfacePixels'], 412197)
        self.assertEqual(report['edgePixels'], 5679)
        self.assertEqual(report['piecePlacements'], self.recipe['piecePlacements'])
        self.assertEqual(report['transform'], 'measured source-component crop/resize per native UV component group; original UVs preserved')
        self.assertEqual(self.count, 10)  # Eight source pieces; two extra one-pixel native slivers.
        image = rgba(self.output / 'diffuse.png')
        self.assertEqual(image.shape, (676, 1232, 4))
        self.assertTrue(np.all(image[:, :, 3] == 255))
        source_image = Image.open(source).convert('RGB')
        source_rgb = np.asarray(source_image)
        source_mask = ndimage.binary_fill_holes(ndimage.binary_closing(source_rgb.max(2) > 15, iterations=4))
        source_labels, _ = ndimage.label(source_mask)
        witnesses = []
        for ids, seed, source_box, atlas_box in PLACEMENTS:
            sl, st, sr, sb = source_box
            left, top, right, bottom = atlas_box
            selected = source_labels[seed[1], seed[0]]
            self.assertGreater(selected, 0)
            isolated = source_labels[st:sb, sl:sr] == selected
            placed = np.asarray(Image.fromarray((isolated * 255).astype(np.uint8)).resize((right-left, bottom-top), Image.Resampling.NEAREST)) > 0
            full = np.zeros((676, 1232), bool)
            full[top:bottom, left:right] = placed
            for component in ids:
                surface = self.labels == component
                nearby = ndimage.binary_dilation(surface, iterations=12)
                seeds = full & nearby & ((self.labels == 0) | surface)
                # Chessboard distance independently bounds the existing eight-neighbour 24-pixel reach.
                distance = ndimage.distance_transform_cdt(~seeds, metric='chessboard')
                self.assertLessEqual(int(distance[surface].max()), 24, 'uncovered component ' + str(component))
            resized = source_image.crop(source_box).resize((right-left, bottom-top), Image.Resampling.LANCZOS)
            x = left + int((seed[0]-sl+.5)*(right-left)/(sr-sl))
            y = top + int((seed[1]-st+.5)*(bottom-top)/(sb-st))
            self.assertIn(int(self.labels[y, x]), ids, 'measured part anchor is on its own UV piece')
            self.assertEqual(tuple(image[y, x, :3]), resized.getpixel((x-left, y-top)), 'anchor has its own mapped source pigment')
            witnesses.append({'components': ids, 'sourceSeed': seed, 'mappedAnchor': [x, y]})
        # Independent, manually reviewed face anchors; these bounds are layout checks, not aesthetic grading.
        sl, st, sr, sb = PLACEMENTS[0][2]
        left, top, right, bottom = PLACEMENTS[0][3]
        for name, src, native in [('eye-left', (366.07, 187.71), (272, 138)), ('eye-right', (448.06, 186.62), (340, 138)), ('teeth-centre', (406.86, 228.72), (304, 260 * 2 / 3))]:
            mapped = (left+(src[0]-sl)*(right-left)/(sr-sl), top+(src[1]-st)*(bottom-top)/(sb-st))
            self.assertLess(max(abs(mapped[i]-native[i]) for i in (0, 1)), 7 * 2 / 3, name + ' stays within roughly one native texel')
        print('MAPPED_SOURCE_ANCHORS', json.dumps(witnesses), flush=True)

    def test_detached_source_islands_cannot_colour_body_surfaces(self):
        source = Image.open(resource_path(ROOT, ROOT / self.recipe['sourceFile'])).convert('RGB')
        pixels = np.array(source)
        mask = ndimage.binary_fill_holes(ndimage.binary_closing(pixels.max(2) > 15, iterations=4))
        labels, _ = ndimage.label(mask)
        body_ids = {int(labels[p[1][1], p[1][0]]) for p in PLACEMENTS[:2]}
        detached = (labels != 0) & ~np.isin(labels, list(body_ids))
        self.assertGreater(int(detached.sum()), 80000)
        pixels[detached] = [0, 255, 255]
        path = self.work / 'detached-donor-poison.png'
        Image.fromarray(pixels).save(path)
        altered = copy.deepcopy(self.recipe)
        altered['sourceFile'] = str(path)
        altered['sourceSha'] = digest(path.read_bytes())
        output = self.run_fit(altered, 'isolated-donor-proof')
        before, after = rgba(self.output / 'diffuse.png'), rgba(output / 'diffuse.png')
        bodies = np.isin(self.labels, [1, 2, 3, 4])
        self.assertTrue(np.array_equal(before[bodies], after[bodies]), 'no detached triangle/weapon colour may leak into either body')
        self.assertTrue(np.any(before[self.labels >= 5] != after[self.labels >= 5]), 'poisoned pieces really changed, so isolation is exercised')

    def test_invalid_ownership_and_background_seeds_reject_before_writing(self):
        cases = []
        duplicate = copy.deepcopy(self.recipe); duplicate['piecePlacements'][1]['nativeComponents'].append(1)
        cases.append(('duplicate-native', duplicate, 'Duplicate or invalid native-piece owner'))
        missing = copy.deepcopy(self.recipe); missing['piecePlacements'][0]['nativeComponents'].remove(3)
        cases.append(('unassigned-native', missing, 'Unassigned native UV component'))
        background = copy.deepcopy(self.recipe); background['piecePlacements'][0]['sourceSeed'] = [24, 15]
        cases.append(('background-seed', background, 'Background or duplicated source-piece owner'))
        duplicate_source = copy.deepcopy(self.recipe); duplicate_source['piecePlacements'][1]['sourceBox'] = duplicate_source['piecePlacements'][0]['sourceBox']; duplicate_source['piecePlacements'][1]['sourceSeed'] = duplicate_source['piecePlacements'][0]['sourceSeed']
        cases.append(('duplicate-source', duplicate_source, 'Background or duplicated source-piece owner'))
        conflicting = copy.deepcopy(self.recipe); conflicting['atlasBox'] = [0, 0, 1232, 676]
        cases.append(('mixed-global-placement', conflicting, 'Piece placements cannot combine'))
        for name, recipe, reason in cases:
            with self.subTest(name=name):
                process, output = self.invoke(recipe, name)
                self.assertNotEqual(process.returncode, 0)
                self.assertIn(reason, process.stderr)
                self.assertFalse(output.exists(), 'invalid recipe must not publish partial art')

    def test_legacy_fish_recipe_is_pixel_identical_to_committed_assets(self):
        recipe_path = 'tools/texture_sheets/sources/fidelity-2026-10-12/fish-v2.json'
        recipe = json.loads((ROOT / recipe_path).read_text())
        self.assertNotIn('piecePlacements', recipe)
        pack = Path(os.environ.get('QUAKED_ID1_PAK', Path('/Users/bri/quaked/Quake/pak0.pak')))
        output = self.run_fit(recipe, 'legacy-fish', pack)
        for name in ['diffuse.png', 'height.webp']:
            committed = subprocess.check_output(['git', 'show', 'HEAD:' + head_resource_path('newer/enemies/fish/custom/' + name)], cwd=ROOT)
            path = self.work / ('committed-' + name)
            path.write_bytes(committed)
            self.assertTrue(np.array_equal(rgba(output / name), rgba(path)), 'legacy decoded pixels changed: ' + name)
        print('LEGACY_FISH_PIXEL_IDENTITY diffuse.png height.webp', flush=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
