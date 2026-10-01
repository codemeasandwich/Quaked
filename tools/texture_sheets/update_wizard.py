#!/usr/bin/env python3
"""Reproduce the owner's 2026-10-01 wizard texture replacement.

Crops are individually measured, exclusive-right/bottom pixel bounds. The atlas
has uneven gaps and replicated edge bleed, so the original sheet's grid cannot
be scaled uniformly. Only crop and resize the supplied art; preserve game UVs,
texture names, normal profiles, and every unrelated asset/manifest entry.

Run from any directory: python3 tools/texture_sheets/update_wizard.py
Requires Pillow and NumPy, as do the existing texture tools. Height generation
and version invalidation use the existing craft_normals.main implementation.
"""
import json
import sys
sys.dont_write_bytecode = True
from pathlib import Path
from PIL import Image
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE.parent))
import craft_normals
from align_frames import shifted


def main():
    recipe = json.loads((HERE / 'sources/wizard-2026-10-01.json').read_text())
    source = Image.open(HERE / 'sources' / recipe['source']).convert('RGB')
    index = json.loads((ROOT / 'newer/textures/index.json').read_text())
    # Check the entire batch before overwriting any asset. Existing profile
    # metadata is retained, so a future profile change needs an explicit review.
    for tile in recipe['textures']:
        name = tile['name']
        profile = craft_normals.profile_for(name)
        existing = index['normals'][name]
        if existing['strength'] != profile['strength'] or existing.get('cap', 1.1) != profile.get('cap', 1.1):
            raise ValueError(f'Normal profile changed; review metadata before updating: {name}')
        box = tile['box']
        if name not in index['textures'] or not (0 <= box[0] < box[2] <= source.width and 0 <= box[1] < box[3] <= source.height):
            raise ValueError(f'Invalid texture or source bounds: {name}')
        if Image.open(ROOT / 'newer/textures' / index['textures'][name]).size != tuple(recipe['output_size']):
            raise ValueError(f'Refusing to change existing resolution: {name}')
    for tile in recipe['textures']:
        name, box = tile['name'], tile['box']
        target = ROOT / 'newer/textures' / index['textures'][name]
        # Lossless WebP retains the extracted/resized pixels without another
        # lossy pass. Never include black unused atlas cells in a replacement.
        image = source.crop(box).resize(recipe['output_size'], Image.Resampling.LANCZOS)
        if 'uv_shift_texels' in tile:
            # Correct a measured phase offset against the original 64x64 BSP
            # texture. Periodic padding preserves repeats; no UV/material edits.
            dx, dy = (v * 4 for v in tile['uv_shift_texels'])
            pad = int(max(abs(dx), abs(dy))) + 8
            pixels = np.asarray(image, dtype=np.float32)
            padded = np.pad(pixels, ((pad, pad), (pad, pad), (0, 0)), 'wrap')
            image = Image.fromarray(shifted(padded, dx, dy)[pad:-pad, pad:-pad].astype(np.uint8))
        image.save(target, 'WEBP', lossless=True, method=6)
        print(f'{name}: {box} -> {target.name} (256x256)')
    names = [tile['name'] for tile in recipe['textures']]
    craft_normals.main(names)
    # The existing profile metadata already carries the effective strength/cap.
    # Keep its exact representation (including an implicit default cap) intact.
    manifest_path = ROOT / 'newer/textures/index.json'
    updated = json.loads(manifest_path.read_text())
    for name in names:
        updated['normals'][name] = index['normals'][name]
    manifest_path.write_text(json.dumps(updated, indent=1))


if __name__ == '__main__':
    main()
