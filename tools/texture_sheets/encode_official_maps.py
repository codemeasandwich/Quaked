"""Publish a reviewed4x diffuse with matching lossy WebP quality92 data maps.

Owner13October explicitly requires lossy92 for every texture map. Authoring
masters remain unchanged. Normals are derived from the DECODED quality92 height,
then encoded at92 themselves, matching the scalar data the engine will consume.
This uses the existing crafted-height/normal maths and existing normalFile route.
"""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from craft_normals import craft, normals_from_height, profile_for
from resource_paths import resource_path

ROOT = Path(__file__).resolve().parents[2]

def physical(path):
    """Resolve filesystem I/O only; receipts retain the caller's logical labels."""
    return resource_path(ROOT, Path(path).resolve())


def distance_view(image, target):
    return np.asarray(image.convert('RGB').resize(target, Image.Resampling.BOX), dtype=float)



def reviewed_layering(args, native, native_bytes, source_bytes):
    """Validate a source-bound use of the existing layered-veneer authoring policy."""
    from update_level_sheets import brick_mask
    raw = physical(args.height_layering).read_bytes()
    recipe = json.loads(raw)
    assert recipe['schemaVersion'] == 1 and recipe['policy'] == 'layered-veneer'
    assert recipe['name'] == args.name, 'Layering belongs to another material'
    assert recipe['originalSha256'] == hashlib.sha256(native_bytes).hexdigest(), 'Layering native mismatch'
    assert recipe['authoringDiffuseSha256'] == hashlib.sha256(source_bytes).hexdigest(), 'Layering diffuse mismatch'
    layering = recipe['layering']
    assert layering['referenceSize'] == list(native.size), 'Layering coordinates must be native texels'
    for key in ('facingHeight', 'brickHeight', 'chipFloor', 'microAmplitude', 'bevelPixels'):
        assert isinstance(layering[key], (int, float)) and math.isfinite(layering[key]), 'Finite layering parameters required'
    upper, lower, floor, micro = (layering[k] for k in ('facingHeight', 'brickHeight', 'chipFloor', 'microAmplitude'))
    assert 0 <= lower < floor <= upper <= 1 and 0 <= micro <= .1
    assert floor > lower + 2*micro, 'Facing must remain above all substrate microrelief'
    assert 0 < layering['bevelPixels'] <= 4
    regions = layering['brickRegions']
    assert isinstance(regions, list) and 0 < len(regions) <= 256
    for region in regions:
        assert set(region) == {'polygon'} and 3 <= len(region['polygon']) <= 64
        for point in region['polygon']:
            assert len(point) == 2 and all(isinstance(v, (int, float)) and math.isfinite(v) for v in point)
            assert 0 <= point[0] <= native.width and 0 <= point[1] <= native.height
    mask = brick_mask((native.height*4, native.width*4), layering) > .5
    assert mask.any() and (~mask).any(), 'Layering requires both inset and facing material'
    return raw, recipe, mask


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--original', type=Path, required=True)
    p.add_argument('--diffuse', type=Path, required=True)
    p.add_argument('--name', required=True)
    p.add_argument('--output-stem', type=Path, required=True)
    p.add_argument('--strength', type=float, default=.3)
    p.add_argument('--cap', type=float, default=.5)
    p.add_argument('--vertical-neighbour', type=Path,
                   help='Reviewed opposite transition master; top/bottom meet this tile in a two-tile cycle')
    p.add_argument('--neighbour-name', help='Partner material profile; required with --vertical-neighbour')
    p.add_argument('--height-layering', type=Path,
                   help='Source-bound layered-veneer JSON; reuses existing ordered material-plane authoring')
    p.add_argument('--normal-layout', choices=['channels', 'rgb'], default='channels',
                   help='Independent grayscale XYZ avoids lossy chroma mixing; rgb replays earlier outputs')
    args = p.parse_args()
    if args.height_layering and (args.vertical_neighbour or args.neighbour_name):
        p.error('--height-layering cannot be combined with a vertical transition partner')
    sha = lambda data: hashlib.sha256(data).hexdigest()
    native_bytes, source_bytes = physical(args.original).read_bytes(), physical(args.diffuse).read_bytes()
    native = Image.open(physical(args.original)).convert('RGB')
    diffuse = Image.open(physical(args.diffuse)).convert('RGB')
    assert diffuse.size == (native.width * 4, native.height * 4), 'Require exact4x authoring input'
    assert 0 < args.strength <= 4 and 0 < args.cap <= 4
    normal_roles = ['normalX', 'normalY', 'normalZ'] if args.normal_layout == 'channels' else ['normal']
    paths = {role: args.output_stem.with_name(args.output_stem.name + '-' + role + '.webp')
             for role in ['diffuse', 'height', *normal_roles]}
    receipt_path = args.output_stem.with_suffix('.json')
    assert all(not physical(path).exists() for path in [*paths.values(), receipt_path]), 'Never overwrite prior assets'
    layering_input = reviewed_layering(args, native, native_bytes, source_bytes) if args.height_layering else None
    physical(args.output_stem).parent.mkdir(parents=True, exist_ok=True)
    profile = {**profile_for(args.name), 'strength': args.strength, 'cap': args.cap}
    diffuse.save(physical(paths['diffuse']), 'WEBP', quality=92, lossless=False, method=6)
    decoded_diffuse = Image.open(physical(paths['diffuse'])).convert('RGB')
    neighbour = None
    if layering_input:
        from update_level_sheets import authored_height
        # Keep the CLI's reviewed normal strength/cap; only reuse scalar authoring.
        height, _ = authored_height(np.asarray(decoded_diffuse, dtype=float) / 255,
                                   args.name, 'layered-veneer', layering_input[1]['layering'])
    elif args.vertical_neighbour:
        assert args.neighbour_name, 'Require explicit partner profile'
        neighbour_bytes = physical(args.vertical_neighbour).read_bytes()
        neighbour_master = Image.open(physical(args.vertical_neighbour)).convert('RGB')
        assert neighbour_master.size == diffuse.size, 'Pair tiles must have identical dimensions'
        neighbour_profile = {**profile_for(args.neighbour_name), 'strength': args.strength, 'cap': args.cap}
        assert neighbour_profile == profile, 'Pair must share the same height recipe'
        neighbour_webp = io.BytesIO()
        neighbour_master.save(neighbour_webp, 'WEBP', quality=92, lossless=False, method=6)
        neighbour_diffuse_bytes = neighbour_webp.getvalue()
        neighbour_decoded = Image.open(io.BytesIO(neighbour_diffuse_bytes)).convert('RGB')
        cycle = np.concatenate([np.asarray(decoded_diffuse), np.asarray(neighbour_decoded)], axis=0)
        cycle_height, _ = craft(cycle.astype(float) / 255, profile,
                                detail_scale=np.sqrt(diffuse.height * diffuse.width) / 256)
        height = cycle_height[:diffuse.height]
        neighbour_height_buffer = io.BytesIO()
        Image.fromarray(np.round(cycle_height[diffuse.height:] * 255).astype('uint8')).save(
            neighbour_height_buffer, 'WEBP', quality=92, lossless=False, method=6)
        neighbour_height_bytes = neighbour_height_buffer.getvalue()
        neighbour_height = np.asarray(Image.open(io.BytesIO(neighbour_height_bytes)).convert('RGB'))[:, :, 0]
        neighbour = dict(name=args.neighbour_name, authoringDiffuse=str(args.vertical_neighbour),
                         authoringDiffuseSha256=sha(neighbour_bytes),
                         diffuseSha256=sha(neighbour_diffuse_bytes), heightSha256=sha(neighbour_height_bytes),
                         profile=neighbour_profile, tileDetailScale=np.sqrt(diffuse.height * diffuse.width) / 256,
                         normalSlopeScale=args.strength * np.sqrt(diffuse.height * diffuse.width) / 8)
    else:
        assert args.neighbour_name is None, 'Partner name requires its image'
        height, _ = craft(np.asarray(decoded_diffuse, dtype=float) / 255, profile)
    height_pixels = np.round(height * 255).astype('uint8')
    Image.fromarray(height_pixels).save(physical(paths['height']), 'WEBP', quality=92, lossless=False, method=6)
    decoded_height = np.asarray(Image.open(physical(paths['height'])).convert('RGB'))[:, :, 0]
    plane_order = None
    if layering_input:
        mask = layering_input[2]
        facing_min, inset_max = int(decoded_height[~mask].min()), int(decoded_height[mask].max())
        assert facing_min > inset_max, 'Lossy height must preserve ordered material planes'
        plane_order = dict(facingMinimum=facing_min, insetMaximum=inset_max,
                           decodedMinimumGap=facing_min-inset_max, units='decoded red channel 0..255')
    if neighbour:
        decoded_cycle = np.concatenate([decoded_height, neighbour_height], axis=0).astype(float) / 255
        # The cycle has twice the area; compensate only the helper's geometric
        # area factor, preserving the documented strength and per-tile slopes.
        _, cycle_normal = normals_from_height(decoded_cycle, args.strength / np.sqrt(2), args.cap)
        normal = cycle_normal[:diffuse.height]
        assert physical(args.vertical_neighbour).read_bytes() == neighbour_bytes
    else:
        _, normal = normals_from_height(decoded_height.astype(float) / 255, args.strength, args.cap)
    normal_pixels = np.round(np.clip(normal * .5 + .5, 0, 1) * 255).astype('uint8')
    if args.normal_layout == 'channels':
        for channel, role in enumerate(normal_roles):
            Image.fromarray(normal_pixels[:, :, channel]).save(physical(paths[role]), 'WEBP', quality=92, lossless=False, method=6)
        decoded_normal = np.stack([np.asarray(Image.open(physical(paths[role])).convert('RGB'), dtype=float)[:, :, 0]
                                   for role in normal_roles], axis=2) / 127.5 - 1
    else:
        Image.fromarray(normal_pixels).save(physical(paths['normal']), 'WEBP', quality=92, lossless=False, method=6)
        decoded_normal = np.asarray(Image.open(physical(paths['normal'])).convert('RGB'), dtype=float) / 127.5 - 1
    decoded_normal /= np.maximum(np.linalg.norm(decoded_normal, axis=2, keepdims=True), 1e-8)
    angular = np.degrees(np.arccos(np.clip(np.sum(decoded_normal * normal, axis=2), -1, 1)))
    dimensions = (max(1, native.width // 2), max(1, native.height // 2))
    distance_error = np.abs(distance_view(decoded_diffuse, dimensions) - distance_view(native, dimensions))
    farther_dimensions = (max(1, native.width // 4), max(1, native.height // 4))
    farther_error = np.abs(distance_view(decoded_diffuse, farther_dimensions) - distance_view(native, farther_dimensions))
    colour_error = np.abs(np.asarray(decoded_diffuse, dtype=float) - np.asarray(diffuse, dtype=float))
    height_error = np.abs(decoded_height.astype(float) - height_pixels.astype(float))
    assert physical(args.original).read_bytes() == native_bytes and physical(args.diffuse).read_bytes() == source_bytes
    records = {}
    for role, path in paths.items():
        data = physical(path).read_bytes()
        assert data[:4] == b'RIFF' and data[8:12] == b'WEBP'
        # Opaque RGB/L maps use the lossy VP8 payload, not lossless VP8L.
        assert b'VP8 ' in data[:64] and b'VP8L' not in data[:64]
        assert Image.open(physical(path)).size == diffuse.size
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
    if layering_input:
        assert physical(args.height_layering).read_bytes() == layering_input[0], 'Layering input changed'
        receipt.update(normalRecipe='layered-veneer', heightLayering=dict(
            file=str(args.height_layering), sha256=sha(layering_input[0]),
            policy='layered-veneer',
            authoringTool='tools/texture_sheets/update_level_sheets.py',
            authoringToolSha256=sha(Path(__file__).with_name('update_level_sheets.py').read_bytes()),
            decodedPlaneOrdering=plane_order))
    if neighbour:
        receipt.update(normalRecipe='directed-vertical-pair', verticalNeighbour=neighbour)
    physical(receipt_path).write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
