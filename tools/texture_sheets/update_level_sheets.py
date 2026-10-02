#!/usr/bin/env python3
"""Install the reviewed level-atlas crops through the existing texture pipeline.

Source PNGs remain unchanged. Only listed diffuse/height files and their existing
catalogue records change. Normals are derived by the engine from stored heights.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
import craft_normals


def brick_mask(shape, layering):
    height, width = shape; rw, rh = layering['referenceSize']
    canvas = Image.new('L', (width, height)); draw = ImageDraw.Draw(canvas)
    for region in layering['brickRegions']:
        # Wrapped copies keep regions crossing the registered tile seam whole.
        for dy in (-height, 0, height):
            for dx in (-width, 0, width):
                if 'polygon' in region:
                    points = [(x * width / rw + dx, y * height / rh + dy) for x, y in region['polygon']]
                    draw.polygon(points, fill=255)
                else:
                    x0, y0, x1, y1 = region['ellipse']
                    draw.ellipse((x0 * width / rw + dx, y0 * height / rh + dy,
                                  x1 * width / rw + dx, y1 * height / rh + dy), fill=255)
    return np.asarray(canvas, dtype=float) / 255


def authored_height(rgb, name, policy, layering=None):
    profile = dict(craft_normals.profile_for(name))
    if policy == 'layered-veneer':
        if layering is None: raise ValueError('Layered material requires reviewed structural regions')
        detail, _ = craft_normals.craft(rgb, profile)
        mask = brick_mask(rgb.shape[:2], layering)
        scale = np.sqrt(rgb.shape[0] * rgb.shape[1]) / 256
        bevel = craft_normals.gblur(mask, layering['bevelPixels'] * scale)
        upper, lower = layering['facingHeight'], layering['brickHeight']
        # Material identity, not brightness, sets depth. Fine texture relief is
        # bounded so even the brightest brick stays below the darkest facing.
        # Keep the substrate on its lower plane. Chip bevels live on the
        # facing side, with a floor above the brightest substrate microrelief.
        floor = layering['chipFloor']
        if floor <= lower + 2 * layering['microAmplitude']:
            raise ValueError('Chip floor must keep facing above substrate')
        facing = upper - (upper - floor) * np.minimum(bevel * 2, 1)
        height = np.where(mask > .5, lower, facing)
        height += (detail - .5) * (2 * layering['microAmplitude'])
        return np.clip(height, 0, 1), profile
    if policy == 'flat-polished':
        # Marble veining is pigment, not a relief carving. Height 1 also keeps
        # the renderer's parallax depth at zero instead of shifting a flat tile.
        return np.ones(rgb.shape[:2]), dict(profile, strength=0.0, cap=1.1)
    if policy == 'carved': profile = dict(craft_normals.profile_for('carch'))
    elif policy == 'pebbles': profile = dict(craft_normals.profile_for('metal1_1'))
    elif policy == 'roots': profile = dict(craft_normals.profile_for('wswamp'))
    elif policy == 'fine-checker':
        # Remove broad colour-panel relief: retain grain and actual dark grout.
        profile.update(bands=(.35, 1, 0, 0), groove=.9, bump=.4, strength=1.2, cap=1.1)
    elif policy != 'existing': raise ValueError('Unreviewed material policy: ' + policy)
    height, _ = craft_normals.craft(rgb, profile)
    return height, profile


def update(manifest_path, output=None, preview=None):
    recipe = json.loads(manifest_path.read_text())
    index_path = ROOT / 'newer/textures/index.json'
    index = json.loads(index_path.read_text())
    target = output or ROOT / 'newer/textures'
    target.mkdir(parents=True, exist_ok=True); (target / 'normals').mkdir(exist_ok=True)
    if preview: preview.mkdir(parents=True, exist_ok=True)
    sources = {}
    for filename, spec in recipe['sources'].items():
        path = manifest_path.parent / filename
        if hashlib.sha256(path.read_bytes()).hexdigest() != spec['sha256']:
            raise ValueError('Source artwork changed; review crop recipe: ' + filename)
        image = Image.open(path).convert('RGB')
        if list(image.size) != spec['size']: raise ValueError('Wrong atlas dimensions')
        sources[filename] = image
    records = {}
    for name, spec in recipe['tiles'].items():
        if name not in index['textures']: raise ValueError('Unknown native texture: ' + name)
        if spec['rotation'] or spec['flipX'] or spec['flipY']: raise ValueError('Unreviewed orientation change')
        box = spec['crop']; source = sources[spec['source']]
        if not (0 <= box[0] < box[2] <= source.width and 0 <= box[1] < box[3] <= source.height):
            raise ValueError('Crop outside source: ' + name)
        image = source.crop(box).resize(tuple(recipe['outputSize']), Image.Resampling.LANCZOS)
        phase = spec.get('phaseNative', [0, 0])
        scale = np.array(recipe['outputSize']) / np.array(recipe['nativeSize'])
        shift = np.array(phase) * scale
        if not np.all(shift == np.round(shift)): raise ValueError('Phase must land on whole output texels')
        # Periodic registration moves authored pixels, not map UVs. Height
        # derives from these same registered pixels, so all maps stay aligned.
        image = Image.fromarray(np.roll(np.array(image), (int(shift[1]), int(shift[0])), (0, 1)))
        # Lossless storage preserves the reviewed resampled diffuse exactly.
        image.save(target / index['textures'][name], 'WEBP', lossless=True, method=6)
        rgb = np.asarray(image, dtype=np.float64) / 255
        height, profile = authored_height(rgb, name, spec['policy'], spec.get('layering'))
        height_file = index['normals'][name]['file']
        encoded = np.round(height * 255).astype(np.uint8)
        Image.fromarray(encoded).save(target / height_file, 'WEBP', lossless=True, method=6)
        index['normals'][name] = {'file': height_file, 'strength': profile['strength'], 'cap': profile.get('cap', 1.1)}
        records[name] = {'source': spec['source'], 'crop': box, 'phaseNative': phase, 'policy': spec['policy'],
                         'diffuse': index['textures'][name], **index['normals'][name]}
        if preview:
            stored = np.asarray(Image.open(target / height_file).convert('L'), dtype=float) / 255
            _, normals = craft_normals.normals_from_height(stored, profile['strength'], profile.get('cap', 1.1))
            craft_normals.preview(rgb, stored, normals, str(preview / (name + '.png')))
            repeat = Image.new('RGB', (image.width * 2, image.height * 2))
            for y in range(2):
                for x in range(2): repeat.paste(image, (x * image.width, y * image.height))
            repeat.save(preview / (name + '-repeat.png'))
    index['version'] = max(int(index['version']) + 1, 2026100201)
    # A dry run writes a candidate catalogue, never the production catalogue.
    (target / 'index.json').write_text(json.dumps(index, indent=1) + '\n')
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=Path(__file__).parent / 'sources/level-2026-10-02/manifest.json')
    parser.add_argument('--output', type=Path, help='Dry-run directory instead of production texture folder')
    parser.add_argument('--preview', type=Path)
    args = parser.parse_args()
    result = update(args.manifest, args.output, args.preview)
    print('Prepared', len(result), 'reviewed diffuse/height pairs; original 64x64 UV period unchanged.')
