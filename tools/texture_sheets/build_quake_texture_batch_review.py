"""Review bound Quake mixed-codec maps using the unchanged panel builder."""
import argparse
import html
import json
import math
from pathlib import Path
import re

import numpy as np
from PIL import Image
import build_texture_batch_review as panels
import derive_quake_texture_tiers as quake


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--batch', type=Path, required=True)
    parser.add_argument('--paths-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    shared = quake.shared
    require, sha = shared.require, shared.sha
    require(not args.output.exists() and not args.output.is_symlink(), 'Output already exists')
    root = args.paths_root.resolve()
    watched = {}

    def read(path):
        path = path.resolve()
        data = shared.bounded_bytes(path)
        if path in watched:
            require(watched[path] == data, 'Input changed during validation')
        watched[path] = data
        return data

    def reference(value):
        require(isinstance(value, str) and 0 < len(value) <= 4096, 'Invalid reference')
        path = (root/value).resolve()
        path.relative_to(root)
        return path

    batch = json.loads(read(args.batch))
    encoding = {role: quake.policy(role) for role in quake.ROLES}
    require(type(batch['schemaVersion']) is int and batch['schemaVersion'] == 3
            and batch['family'] == 'quake' and batch['pathsBase'] == 'repository'
            and batch['defaultTier'] == 'Mid' and batch['tierFactors'] == {'Mid': 4, 'High': 8}
            and 'lossless' not in batch and batch['encodingByRole'] == encoding,
            'Wrong mixed-codec batch policy')
    items = batch['items']
    require(isinstance(items, list) and 0 < len(items) <= 128, 'Invalid item count')
    require(len({i['name'] for i in items}) == len(items), 'Duplicate review names')
    for item in items:
        require(isinstance(item['name'], str) and re.fullmatch(r'[A-Za-z0-9_+*.-]{1,128}', item['name'])
                and item['name'] not in ('.', '..'), 'Unsafe material name')
        require(isinstance(item['edition'], str) and len(item['edition']) <= 128, 'Invalid edition')
        native_path = reference(item['original'])
        native_bytes = read(native_path)
        native = shared.rgb_image(native_bytes)
        with Image.open(native_path) as source_native:
            require(source_native.format == 'PNG'
                    and np.asarray(source_native.convert('RGBA'))[:, :, 3].min() == 255,
                    'Native transparency requires separate qualified semantics')
        dims = [item['nativeIdentity']['width'], item['nativeIdentity']['height']]
        require(list(native.size) == dims and min(dims) >= 8 and all(v % 4 == 0 for v in dims),
                'Native dimensions differ or unsupported')
        mp, tp = reference(item['masterPackage']), reference(item['tierReceipt'])
        mb, tb = read(mp), read(tp)
        require(sha(mb) == item['masterPackageSha256'] and sha(tb) == item['tierReceiptSha256'],
                'Package/receipt hash differs')
        master, tiers = json.loads(mb), json.loads(tb)
        require(master['nativeDimensions'] == dims and master['generationCount'] == 1,
                'Wrong native master package')
        master_native = master['inputs']['original']
        require(reference(master_native['file']) == native_path
                and master_native['sha256'] == sha(native_bytes), 'Master was authored against another native')
        require(tiers['schemaVersion'] == 2 and tiers['family'] == 'quake'
                and tiers['defaultTier'] == 'Mid' and tiers['encodingByRole'] == encoding,
                'Wrong tier receipt policy')
        require(set(tiers['tiers']) == set(item['tiers']) == {'Mid', 'High'}, 'Missing tier')
        require(tiers['Low']['unchanged'] is True and tiers['Low']['sha256'] == sha(native_bytes), 'Low differs')
        for role, expected_path in [('original', native_path),
                ('master', mp.parent/master['color']['file']),
                ('heightMaster', mp.parent/master['height']['file'])]:
            expected_path = expected_path.resolve()
            expected_path.relative_to(root)
            row = tiers['inputs'][role]
            require(reference(row['file']) == expected_path and sha(read(expected_path)) == row['sha256'],
                    'Tier input differs from source package')
        color_path = reference(tiers['inputs']['master']['file'])
        height_path = reference(tiers['inputs']['heightMaster']['file'])
        require(sha(read(color_path)) == master['color']['sha256']
                and sha(read(height_path)) == master['height']['sha256'], 'Master bytes changed')
        rgb = shared.rgb_image(read(color_path), master=True)
        require(list(rgb.size) == master['masterDimensions'] and rgb.width >= native.width*8
                and rgb.height >= native.height*8 and rgb.width*native.height == rgb.height*native.width,
                'Master cannot support native aspect and8x dimensions')
        scalar = shared.scalar_master(read(height_path), rgb.size)
        strength, cap = tiers['strength'], tiers['cap']
        require(all(isinstance(x, (float, int)) and not isinstance(x, bool) and math.isfinite(x)
                    and 0 < x <= 4 for x in (strength, cap)), 'Invalid normal parameters')
        for tier, factor in [('Mid', 4), ('High', 8)]:
            row, receipt = item['tiers'][tier], tiers['tiers'][tier]
            size = (native.width*factor, native.height*factor)
            require(row['factor'] == receipt['factor'] == factor
                    and row['dimensions'] == receipt['dimensions'] == list(size), 'Tier dimensions differ')
            require(set(row['files']) == set(receipt['outputs']) == set(quake.ROLES), 'Missing or extra role')
            height = shared.float_height(scalar, size)
            _, normal = shared.normals_from_height(height, strength, cap)
            packed = np.round(np.clip(normal*.5+.5, 0, 1)*255).astype('uint8')
            intended = {'diffuse': shared.periodic_rgb(rgb, size),
                        'height': Image.fromarray(np.round(height*255).astype('uint8'))}
            intended.update({role: Image.fromarray(packed[:, :, c]) for c, role in enumerate(quake.ROLES[2:])})
            for role, value in row['files'].items():
                path, record = reference(value), receipt['outputs'][role]
                require(path == (tp.parent/record['file']).resolve(), 'Map/receipt path differs')
                data = read(path)
                require(sha(data) == record['sha256'] and len(data) == record['bytes']
                        and record['dimensions'] == list(size) and record['bitDepth'] == 8,
                        'Map hash/size/depth differs')
                require(all(record.get(key) == val for key, val in encoding[role].items()), 'Map policy differs')
                quake.check_codec(data, role)
                require(data == quake.encode_role(intended[role], role), 'Map is not a direct-master role export')
    # Preserve producer bytes and all watched sources through review generation.
    for module in (quake, shared, panels):
        read(Path(module.__file__))
    read(Path(shared.__file__).resolve().parents[1]/'craft_normals.py')
    read(Path(__file__))
    require(all(path.read_bytes() == data for path, data in watched.items()), 'Input changed before review')
    args.output.mkdir(parents=True, exist_ok=False)
    parts = ['<!doctype html><html lang="en"><meta charset="utf-8"><title>Quake texture review</title>',
        '<style>body{background:#191b1e;color:#eee;font:16px system-ui;max-width:1450px;margin:25px auto}img{max-width:100%;height:auto}section{border-top:1px solid #555;margin:25px 0}details{margin:15px 0}</style>',
        '<h1>Quake: shared-master Mid4× / High8× review</h1><p>Low is unchanged. Colour is lossy WebP Q92/method6; height and XYZ normals are lossless WebP/method6 with exact exported8-bit channels. Float quantization is distinct from compression. Both tiers come directly from one retained master. Offline review, not game integration or owner acceptance.</p>']
    for item in items:
        parts.append('<section><h2>'+html.escape(item['name'])+' / '+html.escape(item['edition'])+'</h2>')
        for tier, row, review, relief in panels.build(item, root, args.output):
            parts.append('<h3>'+tier+(' (default)' if tier == 'Mid' else '')+' '+str(row['dimensions'])
                +'</h3><img src="'+html.escape(review.name)+'" alt="Actual colour, native, detail, repeats and distance comparisons">'
                +'<details><summary>Lossless data, height, normals and opposed lighting</summary><img src="'
                +html.escape(relief.name)+'" alt="Actual decoded relief"></details>')
        parts.append('</section>')
    require(all(path.read_bytes() == data for path, data in watched.items()), 'Source/tool changed during review')
    (args.output/'index.html').write_text('\n'.join(parts+['</html>'])+'\n')
    print(json.dumps({'review': str(args.output/'index.html'), 'materials': len(items), 'sheets': len(items)*4}))


if __name__ == '__main__':
    main()
