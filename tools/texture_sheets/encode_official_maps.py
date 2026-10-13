"""Publish a reviewed4x diffuse with matching lossy WebP quality92 data maps.

Owner13October explicitly requires lossy92 for every texture map. Authoring
masters remain unchanged. Normals are derived from the DECODED quality92 height,
then encoded at92 themselves, matching the scalar data the engine will consume.
This uses the existing crafted-height/normal maths and existing normalFile route.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from craft_normals import craft, normals_from_height, profile_for


def distance_view(image, target):
    return np.asarray(image.convert('RGB').resize(target, Image.Resampling.BOX), dtype=float)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--original', type=Path, required=True)
    p.add_argument('--diffuse', type=Path, required=True)
    p.add_argument('--name', required=True)
    p.add_argument('--output-stem', type=Path, required=True)
    p.add_argument('--strength', type=float, default=.3)
    p.add_argument('--cap', type=float, default=.5)
    p.add_argument('--normal-layout', choices=['channels', 'rgb'], default='channels',
                   help='Independent grayscale XYZ avoids lossy chroma mixing; rgb replays earlier outputs')
    args = p.parse_args()
    sha = lambda data: hashlib.sha256(data).hexdigest()
    native_bytes, source_bytes = args.original.read_bytes(), args.diffuse.read_bytes()
    native = Image.open(args.original).convert('RGB')
    diffuse = Image.open(args.diffuse).convert('RGB')
    assert diffuse.size == (native.width * 4, native.height * 4), 'Require exact4x authoring input'
    assert 0 < args.strength <= 4 and 0 < args.cap <= 4
    normal_roles = ['normalX', 'normalY', 'normalZ'] if args.normal_layout == 'channels' else ['normal']
    paths = {role: args.output_stem.with_name(args.output_stem.name + '-' + role + '.webp')
             for role in ['diffuse', 'height', *normal_roles]}
    receipt_path = args.output_stem.with_suffix('.json')
    assert all(not path.exists() for path in [*paths.values(), receipt_path]), 'Never overwrite prior assets'
    args.output_stem.parent.mkdir(parents=True, exist_ok=True)
    profile = {**profile_for(args.name), 'strength': args.strength, 'cap': args.cap}
    diffuse.save(paths['diffuse'], 'WEBP', quality=92, lossless=False, method=6)
    decoded_diffuse = Image.open(paths['diffuse']).convert('RGB')
    height, _ = craft(np.asarray(decoded_diffuse, dtype=float) / 255, profile)
    height_pixels = np.round(height * 255).astype('uint8')
    Image.fromarray(height_pixels).save(paths['height'], 'WEBP', quality=92, lossless=False, method=6)
    decoded_height = np.asarray(Image.open(paths['height']).convert('RGB'))[:, :, 0]
    _, normal = normals_from_height(decoded_height.astype(float) / 255, args.strength, args.cap)
    normal_pixels = np.round(np.clip(normal * .5 + .5, 0, 1) * 255).astype('uint8')
    if args.normal_layout == 'channels':
        for channel, role in enumerate(normal_roles):
            Image.fromarray(normal_pixels[:, :, channel]).save(paths[role], 'WEBP', quality=92, lossless=False, method=6)
        decoded_normal = np.stack([np.asarray(Image.open(paths[role]).convert('RGB'), dtype=float)[:, :, 0]
                                   for role in normal_roles], axis=2) / 127.5 - 1
    else:
        Image.fromarray(normal_pixels).save(paths['normal'], 'WEBP', quality=92, lossless=False, method=6)
        decoded_normal = np.asarray(Image.open(paths['normal']).convert('RGB'), dtype=float) / 127.5 - 1
    decoded_normal /= np.maximum(np.linalg.norm(decoded_normal, axis=2, keepdims=True), 1e-8)
    angular = np.degrees(np.arccos(np.clip(np.sum(decoded_normal * normal, axis=2), -1, 1)))
    dimensions = (max(1, native.width // 2), max(1, native.height // 2))
    distance_error = np.abs(distance_view(decoded_diffuse, dimensions) - distance_view(native, dimensions))
    farther_dimensions = (max(1, native.width // 4), max(1, native.height // 4))
    farther_error = np.abs(distance_view(decoded_diffuse, farther_dimensions) - distance_view(native, farther_dimensions))
    colour_error = np.abs(np.asarray(decoded_diffuse, dtype=float) - np.asarray(diffuse, dtype=float))
    height_error = np.abs(decoded_height.astype(float) - height_pixels.astype(float))
    assert args.original.read_bytes() == native_bytes and args.diffuse.read_bytes() == source_bytes
    records = {}
    for role, path in paths.items():
        data = path.read_bytes()
        assert data[:4] == b'RIFF' and data[8:12] == b'WEBP'
        # Opaque RGB/L maps use the lossy VP8 payload, not lossless VP8L.
        assert b'VP8 ' in data[:64] and b'VP8L' not in data[:64]
        assert Image.open(path).size == diffuse.size
        records[role] = dict(file=str(path), sha256=sha(data), bytes=len(data), quality=92,
                             lossless=False, dimensions=list(diffuse.size))
    receipt = dict(schemaVersion=1, name=args.name, factor=4, quality=92, lossless=False,
                   normalLayout=args.normal_layout,
                   original=str(args.original), originalSha256=sha(native_bytes),
                   authoringDiffuse=str(args.diffuse), authoringDiffuseSha256=sha(source_bytes),
                   toolSha256=sha(Path(__file__).read_bytes()),
                   heightToolSha256=sha((Path(__file__).resolve().parents[1] / 'craft_normals.py').read_bytes()),
                   profile=profile, outputs=records, comparisonDivisor=2, comparisonDimensions=list(dimensions),
                   distanceMAE=float(distance_error.mean()), distanceMaximum=float(distance_error.max()),
                   secondaryComparisonDimensions=list(farther_dimensions),
                   secondaryDistanceMAE=float(farther_error.mean()), secondaryDistanceMaximum=float(farther_error.max()),
                   colourCompressionMAE=float(colour_error.mean()),
                   heightCompressionMAE=float(height_error.mean()), heightCompressionMaximum=float(height_error.max()),
                   normalAngularMean=float(angular.mean()), normalAngularP99=float(np.percentile(angular, 99)),
                   normalAngularMaximum=float(angular.max()),
                   qualification='Decoded quality92 diagnostics; visual material/edge review remains required')
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
