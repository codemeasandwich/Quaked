"""Author one source-bound layered relief master before shared tier derivation.

Reuse the existing layered-veneer mask, wrapped blur and ordered-plane policy.
Unlike the historical 4x publisher, compose full-precision craft detail at the
sole 8x master, with one final float32 cast. RGB stays byte-identical. No model
call, compressed tier input, runtime registration or independent tier authoring.
"""
import argparse
import io
import json
import math
from pathlib import Path
import re
import sys

import numpy as np
import PIL
from PIL import Image, features

from prepare_texture_master import craft, finish, landmarks_from
from derive_texture_tiers import bounded_bytes, require, rgb_image, sha
from update_level_sheets import brick_mask
from craft_normals import gblur


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_layering(value, native):
    require(set(value) == {'referenceSize', 'facingHeight', 'brickHeight', 'chipFloor',
                          'microAmplitude', 'bevelPixels', 'brickRegions'}, 'Unknown layering fields')
    require(value['referenceSize'] == list(native), 'Layer coordinates must reference native dimensions')
    keys = ('facingHeight', 'brickHeight', 'chipFloor', 'microAmplitude', 'bevelPixels')
    require(all(number(value[k]) for k in keys), 'Finite non-Boolean layer parameters required')
    upper, lower, floor, micro, bevel = (value[k] for k in keys)
    require(0 <= lower < floor <= upper <= 1 and 0 <= micro <= .1
            and floor > lower + 2*micro and lower >= micro and upper+micro <= 1,
            'Ordered clipping-safe material planes required')
    require(0 < bevel <= 4, 'Invalid 256-reference interface bevel')
    regions = value['brickRegions']
    require(isinstance(regions, list) and 0 < len(regions) <= 256, 'Bounded substrate regions required')
    for region in regions:
        require(isinstance(region, dict) and set(region) == {'polygon'}, 'Only explicit substrate polygons supported')
        points = region['polygon']
        require(isinstance(points, list) and 3 <= len(points) <= 64, 'Polygon requires three to64 vertices')
        require(all(isinstance(p, list) and len(p) == 2 and all(number(x) for x in p)
                    and 0 <= p[0] <= native[0] and 0 <= p[1] <= native[1] for p in points),
                'Polygon coordinates must be finite and inside native bounds')
        require(len(set(map(tuple, points))) >= 3, 'Degenerate polygon')
        area = sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(points, points[1:]+points[:1]))
        require(abs(area) > 1e-8, 'Zero-area polygon')


def compose_layered(detail, layering):
    """Existing layered-veneer plane formula with unquantized master detail."""
    mask = brick_mask(detail.shape, layering)
    require(np.any(mask > .5) and np.any(mask <= .5), 'Require both substrate and facing')
    sigma = layering['bevelPixels'] * math.sqrt(detail.size) / 256
    bevel = gblur(mask, sigma)
    upper, lower, floor = (layering[k] for k in ('facingHeight', 'brickHeight', 'chipFloor'))
    facing = upper - (upper-floor)*np.minimum(bevel*2, 1)
    height = np.where(mask > .5, lower, facing)
    height += (detail-.5)*(2*layering['microAmplitude'])
    require(np.isfinite(height).all() and height.min() >= 0 and height.max() <= 1,
            'Layer composition would require clipping')
    return height.astype('float32'), mask, sigma


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    require(not args.output.exists() and not args.output.is_symlink(), 'Output already exists')
    recipe_bytes = bounded_bytes(args.recipe)
    require(len(recipe_bytes) <= 262144, 'Layer recipe exceeds byte budget')
    recipe = json.loads(recipe_bytes)
    require(type(recipe['schemaVersion']) is int and recipe['schemaVersion'] == 1
            and recipe['policy'] == 'layered-veneer', 'Unsupported layer recipe')
    require(all(isinstance(recipe[k], str) and recipe[k].strip() and len(recipe[k]) <= 128
                for k in ('name', 'edition')), 'Bounded material labels required')
    require(isinstance(recipe['nativeIdentity'], str)
            and re.fullmatch('[0-9a-f]{64}', recipe['nativeIdentity']), 'Native identity is required')
    package = Path(recipe['sourceMasterPackage'])
    if not package.is_absolute():
        package = Path(__file__).resolve().parents[2] / package
    package_bytes = bounded_bytes(package)
    require(sha(package_bytes) == recipe['sourceMasterPackageSha256'], 'Source package hash mismatch')
    proof_path = Path(recipe['sourceVerification']['file'])
    if not proof_path.is_absolute():
        proof_path = Path(__file__).resolve().parents[2] / proof_path
    proof_bytes = bounded_bytes(proof_path)
    require(len(proof_bytes) <= 2097152 and sha(proof_bytes) == recipe['sourceVerification']['sha256'],
            'Source verification hash mismatch')
    proof = json.loads(proof_bytes)
    require(proof['verdict'].startswith('PASS'), 'Source verification did not pass')
    matches = [m for m in proof['materials'] if m['nativeIdentity'] == recipe['nativeIdentity']]
    require(len(matches) == 1 and matches[0]['name'] == recipe['name']
            and matches[0]['edition'] == recipe['edition']
            and matches[0]['masterPackage']['sha256'] == sha(package_bytes),
            'Native identity does not match verified source package')
    proof_package = Path(matches[0]['masterPackage']['file'])
    if not proof_package.is_absolute():
        proof_package = Path(__file__).resolve().parents[2] / proof_package
    require(proof_package.resolve() == package.resolve(), 'Verified source package path differs')
    source = json.loads(package_bytes)
    require(type(source['schemaVersion']) is int and source['schemaVersion'] == 1
            and type(source['generationCount']) is int and source['generationCount'] == 1
            and source['canonicalMasterFactor'] == 8 and 'masterRevision' not in source,
            'Require an unrevised single-source 8x prepare package')
    require(source['name'] == recipe['name'] and source['edition'] == recipe['edition']
            and source['nativeDimensions'] == recipe['nativeDimensions'], 'Layering belongs to another material')
    require(source['color']['file'] == 'color.png' and source['height']['file'] == 'height.npy'
            and source['height']['authoredOnce'] is True and source['height']['quantizedTo8Bit'] is False
            and source['height']['dtype'] == 'float32' and 'authoringPolicy' not in source['height'],
            'Unsupported or already layered source')
    registration = source['registration']
    require(registration['method'] == 'photographic' and registration['factor'] == 8
            and registration['comparisonDivisor'] == 2 and not registration.get('edgeAnchor')
            and 'periodicBoundary' not in registration, 'Unsupported prior registration')
    expected = {role: Path(__file__).with_name(name).resolve() for role, name in (
        ('prepare', 'prepare_texture_master.py'), ('finish', 'finish_official_texture.py'),
        ('derive', 'derive_texture_tiers.py'))}
    expected['craft'] = Path(__file__).resolve().parents[1] / 'craft_normals.py'
    require(set(source['tools']) == set(expected), 'Missing or additional source tools')
    watched = {args.recipe.resolve(): recipe_bytes, package.resolve(): package_bytes,
               proof_path.resolve(): proof_bytes}
    for role, row in source['tools'].items():
        path = Path(row['file']).resolve()
        require(path == expected[role], 'Unexpected source tool path')
        data = bounded_bytes(path)
        require(sha(data) == row['sha256'], 'Source tool changed')
        watched[path] = data
    require(set(source['inputs']) in ({'original', 'generated', 'prompt'},
                                      {'original', 'generated', 'prompt', 'landmarks'}), 'Unexpected source roles')
    inputs = {}
    for role, row in source['inputs'].items():
        path = Path(row['file']).resolve()
        data = bounded_bytes(path)
        require(sha(data) == row['sha256'], 'Source input hash mismatch: '+role)
        inputs[role] = data
        watched[path] = data
    require(len(inputs['prompt']) <= 65536 and inputs['prompt'].decode('utf8').strip(), 'Invalid prompt')
    original, generated = rgb_image(inputs['original']), rgb_image(inputs['generated'], master=True)
    native, dimensions = original.size, (original.width*8, original.height*8)
    require(min(native) >= 8 and all(v % 4 == 0 for v in native)
            and list(native) == recipe['nativeDimensions'] == source['nativeDimensions'], 'Invalid native dimensions')
    require(list(dimensions) == source['masterDimensions'] == recipe['authoredAtMasterDimensions'],
            'Layering must be authored at the sole 8x master')
    require(list(generated.size) == source['generatedDimensions']
            and generated.width >= dimensions[0] and generated.height >= dimensions[1]
            and generated.width*native[1] == generated.height*native[0], 'Undersized or wrong-aspect source')
    require(sha(inputs['original']) == recipe['originalSha256'], 'Layer native hash mismatch')
    validate_layering(recipe['layering'], native)
    measured = landmarks_from(inputs['landmarks'], original) if 'landmarks' in inputs else None
    axis = measured['axis'] if measured else None
    require(axis == registration.get('axis')
            and registration.get('verticalLandmarks') == (measured['points'] if measured else None),
            'Contradictory landmark registration')
    a, b = original, generated
    if axis == 'x':
        a, b = a.transpose(Image.Transpose.TRANSPOSE), b.transpose(Image.Transpose.TRANSPOSE)
    color, _ = finish(a, b, factor=8, comparison_divisor=2, method='photographic',
        vertical_landmarks=measured['points'] if measured else None,
        color_strength=registration['colorStrength'], field_sigma=registration['fieldSigma'])
    if axis == 'x':
        color = color.transpose(Image.Transpose.TRANSPOSE)
    color_data = io.BytesIO()
    color.save(color_data, 'PNG')
    require(sha(color_data.getvalue()) == recipe['authoringDiffuseSha256'] == source['color']['sha256'],
            'Photographic RGB replay mismatch')
    profile = source['height']['profile']
    require(len(profile['bands']) == 4 and all(number(v) and 0 <= v <= 4 for v in profile['bands'])
            and all(number(profile[k]) and 0 <= profile[k] <= 4 for k in ('groove', 'bump'))
            and number(profile['glow']) and 0 <= profile['glow'] <= 1
            and all(number(profile[k]) and 0 < profile[k] <= 4 for k in ('strength', 'cap')), 'Invalid detail profile')
    detail, _ = craft(np.asarray(color, dtype=float)/255, profile, quantize_height=False)
    baseline = io.BytesIO()
    np.save(baseline, detail.astype('float32'), allow_pickle=False)
    require(sha(baseline.getvalue()) == source['height']['sha256'], 'Original full-precision detail replay mismatch')
    height, mask, sigma = compose_layered(detail, recipe['layering'])
    require(height[mask > .5].max() < height[mask <= .5].min(), 'Layer hierarchy failed')
    for role, path in {'layeredAuthoring': Path(__file__).resolve(),
                       'layeredPolicy': Path(__file__).with_name('update_level_sheets.py').resolve()}.items():
        data = bounded_bytes(path)
        watched[path] = data
        source['tools'][role] = {'file': str(path), 'sha256': sha(data)}
    require(all(path.read_bytes() == data for path, data in watched.items()), 'Input changed during authoring')
    args.output.mkdir(parents=True, exist_ok=False)
    with (args.output/'color.png').open('xb') as file:
        file.write(color_data.getvalue())
    with (args.output/'height.npy').open('xb') as file:
        np.save(file, height, allow_pickle=False)
    source['masterRevision'] = {'replacesUnqualifiedPackageSha256': sha(package_bytes),
        'previousHeightSha256': source['height']['sha256'], 'generatorOutputUnchanged': True,
        'RGBUnchanged': True, 'notAnotherGeneration': True}
    source['height'].update({'sha256': sha((args.output/'height.npy').read_bytes()),
        'authoringPolicy': 'layered-veneer', 'uniqueSamples': int(np.unique(height).size)})
    source['inputs']['heightLayering'] = {'file': str(args.recipe.resolve()), 'sha256': sha(recipe_bytes)}
    source['layeredRelief'] = {'nativeIdentity': recipe['nativeIdentity'], 'recipe': recipe,
        'recipeSha256': sha(recipe_bytes), 'bevelSigmaMasterPixels': sigma,
        'precisionOrder': 'craft float64 -> ordered planes and microrelief float64 -> one final float32 cast',
        'substrateRange': [float(height[mask > .5].min()), float(height[mask > .5].max())],
        'facingRange': [float(height[mask <= .5].min()), float(height[mask <= .5].max())],
        'mortarQualification': 'Requires semantic face/joint samples and decoded tier art review; not implied by plane bounds'}
    source['environment'] = {'python': sys.version, 'executable': sys.executable,
        'pillow': PIL.__version__, 'numpy': np.__version__, 'libwebp': features.version('webp')}
    source['qualification'] = 'Sole layered master prepared; decoded both-tier material and public checks remain required'
    require(all(path.read_bytes() == data for path, data in watched.items()), 'Input changed during package writing')
    with (args.output/'master.json').open('x') as file:
        file.write(json.dumps(source, indent=2)+'\n')
    print(json.dumps({'master': str(args.output/'master.json'), 'dimensions': list(dimensions),
                      'RGBUnchanged': True, 'policy': 'layered-veneer'}))


if __name__ == '__main__':
    main()
