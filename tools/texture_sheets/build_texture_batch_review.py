"""Build review-only sheets from decoded delivered maps; never author assets.

Preserve source aspect in repeated tiles. Preview images are diagnostics, not
masters or additional tiers. Every colour/height/normal comes from the selected
batch receipt; the native is displayed unchanged apart from labelled enlargement.
"""
import argparse
import html
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def build(item, root, output):
    original = Image.open(root / item['original']).convert('RGB')
    refs = []
    for tier, row in item['tiers'].items():
        name = item['name']
        tag = name + '-' + tier.lower()
        maps = {role: Image.open(root / path).convert('RGB') for role, path in row['files'].items()}
        diffuse = maps['diffuse']
        sheet = Image.new('RGB', (1400, 1100), (28, 30, 33))
        draw = ImageDraw.Draw(sheet)
        draw.text((12, 8), f'{name} {tier}: unchanged native (left), actual Q92 (middle), 1:1 detail (right)', fill='white')
        size = (round(512 * original.width / original.height), 512)
        sheet.paste(original.resize(size, Image.Resampling.NEAREST), (12, 32))
        sheet.paste(diffuse.resize(size, Image.Resampling.LANCZOS), (540, 32))
        cx, cy = diffuse.width // 2, diffuse.height // 2
        sheet.paste(diffuse.crop((cx-128, cy-128, cx+128, cy+128)), (1068, 32))
        # Fixed physical tile aspect, unlike a square stretch of a portrait2x2.
        tile_width = round(256 * original.width / original.height)
        tile = diffuse.resize((tile_width, 256), Image.Resampling.LANCZOS)
        repeated = Image.new('RGB', (512, 512))
        for y in range(0, 512, 256):
            for x in range(0, 512, tile_width):
                repeated.paste(tile, (x, y))
        sheet.paste(repeated, (12, 570))
        for i, divisor in enumerate((2, 4)):
            dims = (original.width // divisor, original.height // divisor)
            a = original.resize(dims, Image.Resampling.BOX)
            b = diffuse.resize(dims, Image.Resampling.BOX)
            draw.text((540, 570+i*235), f'Both at native/{divisor} {dims}: original / {tier}', fill='white')
            a = a.resize((dims[0]*3, dims[1]*3), Image.Resampling.NEAREST)
            b = b.resize(a.size, Image.Resampling.NEAREST)
            sheet.paste(a, (540, 595+i*235)); sheet.paste(b, (550+a.width, 595+i*235))
        review_file = output / (tag + '-review.jpg')
        sheet.save(review_file, quality=92)
        vector = np.stack([np.asarray(maps['normal'+c], dtype=float)[:, :, 0] for c in 'XYZ'], 2) / 127.5 - 1
        vector /= np.maximum(np.linalg.norm(vector, axis=2, keepdims=True), 1e-12)
        normal = Image.fromarray(np.uint8(np.clip((vector*.5+.5)*255, 0, 255)))
        entries = [('Decoded height', maps['height']), ('Decoded XYZ normals', normal)]
        colors = np.asarray(diffuse, dtype=float)
        for direction in (np.array([.6, .3, .75]), np.array([-.6, -.3, .75])):
            direction /= np.linalg.norm(direction)
            light = .35 + .65*np.clip((vector*direction).sum(2), 0, 1)
            entries.append(('Opposed light '+('A' if direction[0]>0 else 'B'),
                            Image.fromarray(np.uint8(np.clip(colors*light[:, :, None], 0, 255)))))
        sheet = Image.new('RGB', (1200, 1100), (28, 30, 33)); draw = ImageDraw.Draw(sheet)
        for i, (label, image) in enumerate(entries):
            x = (i % 2)*600; y = (i // 2)*550
            draw.text((x+10, y+8), name+' '+tier+' '+label, fill='white')
            image = image.copy(); image.thumbnail((512, 512)); sheet.paste(image, (x+10, y+30))
        relief_file = output / (tag + '-relief.jpg'); sheet.save(relief_file, quality=92)
        refs.append((tier, row, review_file, relief_file))
    return refs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', type=Path, required=True)
    parser.add_argument('--paths-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError('Never overwrite prior review evidence')
    batch = json.loads(args.batch.read_text()); root = args.paths_root.resolve()
    # Validate all referenced files before creating review output.
    for item in batch['items']:
        for path in [item['original'], *[p for row in item['tiers'].values() for p in row['files'].values()]]:
            resolved = (root / path).resolve()
            resolved.relative_to(root)
            if not resolved.is_file(): raise ValueError('Missing review input '+path)
    args.output.mkdir(parents=True, exist_ok=False)
    parts = ['<!doctype html><html lang="en"><meta charset="utf-8"><title>Single-master texture review</title><style>body{background:#191b1e;color:#eee;font:16px system-ui;max-width:1450px;margin:25px auto}img{max-width:100%;height:auto}a{color:#9cdaff}section{border-top:1px solid #555;margin:25px 0}details{margin:15px 0}</style><h1>Single-master Mid4× / High8× review</h1><p>Low is the unchanged game source. Every enhanced map is lossy WebP92/method6, derived directly from its sole master package. Repeats preserve native aspect. These are offline art review files, not game integration.</p>']
    for item in batch['items']:
        parts.append('<section><h2>'+html.escape(item['name'])+' / '+html.escape(item['edition'])+'</h2>')
        for tier, row, review_file, relief_file in build(item, root, args.output):
            parts.append('<h3>'+tier+(' (default)' if tier=='Mid' else '')+' '+str(row['dimensions'])+'</h3><img src="'+html.escape(review_file.name)+'" alt="Native, delivered texture, detail, repeats and both distance comparisons"><details><summary>Height, normals and opposed lighting</summary><img src="'+html.escape(relief_file.name)+'" alt="Actual decoded relief"></details>')
        parts.append('</section>')
    parts.append('</html>'); (args.output/'index.html').write_text('\n'.join(parts))
    print(json.dumps({'review': str(args.output/'index.html'), 'materials': len(batch['items']), 'sheets': len(batch['items'])*4}))


if __name__ == '__main__':
    main()
