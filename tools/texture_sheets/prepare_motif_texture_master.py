#!/usr/bin/env python3
"""Restore source-measured local colour motifs without another generated source.

Reuse the verified photographic replay, full-native periodic colour-field policy
and bounded smooth compositor. Preserve the initial full-precision height exactly:
restoring pigment does not establish new physical geometry. No tier, old decoded
map, unrelated donor or source binary is an authoring input. Unchanged producer
files retain their source-hash contracts. Both-tier art qualification is separate.
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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_texture_master import craft, finish, landmarks_from
from derive_texture_tiers import bounded_bytes, require, rgb_image, sha
from finish_official_texture import area, periodic_blur, periodic_resize


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_motifs(value, native):
    require(isinstance(value, dict) and set(value) == {
        'referenceSize', 'regions', 'featherNativePixels', 'fieldSigmaNativePixels',
        'strength', 'heightPolicy'}, 'Unexpected motif policy fields')
    require(value['referenceSize'] == list(native)
            and value['heightPolicy'] == 'preserve-initial-float32', 'Invalid motif reference/height policy')
    f, sigma, strength = (value[k] for k in
        ('featherNativePixels', 'fieldSigmaNativePixels', 'strength'))
    require(number(f) and .125 <= f <= 4 and number(sigma) and .25 <= sigma <= 4
            and number(strength) and 0 < strength <= 1, 'Invalid motif parameters')
    regions = value['regions']
    require(isinstance(regions, list) and 1 <= len(regions) <= 16, 'Bounded motif regions required')
    w, h = native
    total = 0
    for index, rect in enumerate(regions):
        require(isinstance(rect, list) and len(rect) == 4 and all(number(x) for x in rect),
                'Motif bounds require four finite pixel-edge coordinates')
        x0, y0, x1, y1 = rect
        require(1 <= x0 < x1 <= w-1 and 1 <= y0 < y1 <= h-1,
                'Motifs must stay inside a one-native-pixel perimeter')
        require(x1-x0 > 2*f and y1-y0 > 2*f, 'Motif too small for inward feather')
        for prior in regions[:index]:
            require(min(x1, prior[2]) <= max(x0, prior[0])
                    or min(y1, prior[3]) <= max(y0, prior[1]), 'Overlapping motif supports')
        total += (x1-x0)*(y1-y0)
    require(total <= w*h*.25, 'Motif support exceeds local quarter-image budget')


def restore_motifs(native_rgb, base_rgb, policy):
    require(native_rgb.ndim == base_rgb.ndim == 3
            and native_rgb.shape[2] == base_rgb.shape[2] == 3, 'RGB arrays required')
    h, w = native_rgb.shape[:2]
    validate_motifs(policy, (w, h))
    oh, ow = base_rgb.shape[:2]
    require(ow % w == 0 and oh % h == 0 and ow//w == oh//h, 'Integer same-aspect master required')
    factor = ow//w
    require(factor == 8, 'Restore at the sole 8x canonical master')
    source, base = np.asarray(native_rgb, dtype=float), np.asarray(base_rgb, dtype=float)
    require(np.isfinite(source).all() and np.isfinite(base).all()
            and min(source.min(), base.min()) >= 0 and max(source.max(), base.max()) <= 255,
            'Bounded finite RGB samples required')
    x = (np.arange(ow)+.5)/factor
    y = (np.arange(oh)+.5)/factor
    alpha = np.zeros((oh, ow), dtype=float)
    feather = policy['featherNativePixels']
    def smooth(t):
        t = np.clip(t/feather, 0, 1)
        return t*t*(3-2*t)
    for x0, y0, x1, y1 in policy['regions']:
        # Four multiplied C1 edge ramps, not a min-distance corner field.
        a = (smooth(x-x0)*smooth(x1-x))[None, :] * (smooth(y-y0)*smooth(y1-y))[:, None]
        alpha = np.maximum(alpha, a)  # positive supports are disjoint by validation
    require((alpha > 0).any() and (alpha == 1).any(), 'Empty motif support/plateau')
    delta = source-area(base, factor)
    field = periodic_blur(delta, policy['fieldSigmaNativePixels'])
    correction = periodic_resize(field, ow, oh)*policy['strength']
    raw = base+alpha[:, :, None]*correction
    result = np.rint(np.clip(raw, 0, 255)).astype('uint8')
    support = alpha > 0
    require(np.array_equal(result[~support], base_rgb[~support]), 'Outside RGB changed')
    stats = {'supportPixels': int(support.sum()), 'fullWeightPixels': int((alpha == 1).sum()),
        'supportFraction': float(support.mean()), 'outsideRGBUnchanged': True,
        'edgeRGBUnchanged': all(np.array_equal(a, b) for a, b in
            ((result[0], base_rgb[0]), (result[-1], base_rgb[-1]),
             (result[:, 0], base_rgb[:, 0]), (result[:, -1], base_rgb[:, -1]))),
        'changedPixels': int(np.any(result != base_rgb, axis=2).sum()),
        'meanAbsoluteCorrectionInside': float(np.abs(result.astype(float)-base)[support].mean()),
        'newClippedChannelFractionInside': float((((raw < 0)|(raw > 255))
            & (base > 0) & (base < 255))[support].mean()),
        'spatialResampling': False, 'nativePixelEqualityAcceptance': False}
    require(stats['edgeRGBUnchanged'], 'Image perimeter changed')
    return result, alpha, stats


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    require(not args.output.exists() and not args.output.is_symlink(), 'Output already exists')
    recipe_bytes = bounded_bytes(args.recipe)
    require(len(recipe_bytes) <= 262144, 'Motif recipe exceeds byte budget')
    recipe = json.loads(recipe_bytes)
    require(type(recipe['schemaVersion']) is int and recipe['schemaVersion'] == 1
            and recipe['policy'] == 'native-colour-motifs', 'Unsupported motif recipe')
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
            and source['canonicalMasterFactor'] == 8
            and not {'masterRevision', 'motifRestoration', 'layeredRelief'}.intersection(source),
            'Require an unrevised single-source 8x prepare package')
    require(source['name'] == recipe['name'] and source['edition'] == recipe['edition']
            and source['nativeDimensions'] == recipe['nativeDimensions'], 'Motifs belong to another material')
    require(source['color']['file'] == 'color.png' and source['height']['file'] == 'height.npy'
            and source['height']['authoredOnce'] is True and source['height']['quantizedTo8Bit'] is False
            and source['height']['dtype'] == 'float32' and 'authoringPolicy' not in source['height'],
            'Unsupported or already revised source')
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
            'Motifs must be authored at the sole 8x master')
    require(list(generated.size) == source['generatedDimensions']
            and generated.width >= dimensions[0] and generated.height >= dimensions[1]
            and generated.width*native[1] == generated.height*native[0], 'Undersized or wrong-aspect source')
    require(sha(inputs['original']) == recipe['originalSha256'], 'Motif native hash mismatch')
    validate_motifs(recipe['motifs'], native)
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
    restored, alpha, stats = restore_motifs(np.asarray(original), np.asarray(color), recipe['motifs'])
    final_color = io.BytesIO()
    Image.fromarray(restored, 'RGB').save(final_color, 'PNG')
    # Replayed INITIAL height bytes are preserved, not authored from restored pigment.
    height_data = baseline.getvalue()
    require(sha(height_data) == source['height']['sha256'], 'Preserved height differs')
    references = [Path(__file__).with_name('sources')/'official-world-2026-10-17'/n
                  for n in ('finish_trim_rails.py', 'prepare_horizontal_trims.py')]
    policy_refs = []
    for path in references:
        path = path.resolve()
        data = bounded_bytes(path)
        watched[path] = data
        policy_refs.append({'file': str(path), 'sha256': sha(data),
                            'role': 'Adapted colour-field/compositor policy; not a runtime producer invocation'})
    implementation = Path(__file__).resolve()
    watched[implementation] = bounded_bytes(implementation)
    source['tools']['motifAuthoring'] = {'file': str(implementation), 'sha256': sha(watched[implementation])}
    require(all(path.read_bytes() == data for path, data in watched.items()), 'Input changed during authoring')
    args.output.mkdir(parents=True, exist_ok=False)
    with (args.output/'color.png').open('xb') as file:
        file.write(final_color.getvalue())
    with (args.output/'height.npy').open('xb') as file:
        file.write(height_data)
    source['masterRevision'] = {'replacesUnqualifiedPackageSha256': sha(package_bytes),
        'previousColorSha256': source['color']['sha256'], 'previousHeightSha256': source['height']['sha256'],
        'generatorOutputUnchanged': True, 'heightUnchanged': True, 'RGBUnchanged': False,
        'notAnotherGeneration': True}
    source['color']['sha256'] = sha(final_color.getvalue())
    source['height']['preservationPolicy'] = 'Initial single-authored float32 height bytes retained; no pigment emboss'
    source['inputs']['nativeMotifs'] = {'file': str(args.recipe.resolve()), 'sha256': sha(recipe_bytes)}
    source['motifRestoration'] = {'nativeIdentity': recipe['nativeIdentity'], 'recipe': recipe,
        'recipeSha256': sha(recipe_bytes), 'statistics': stats, 'policyReferences': policy_refs,
        'method': 'One full-native periodic local colour delta; four smooth edge ramps; same photographic detail',
        'heightPolicy': 'Verified initial scalar bytes replayed unchanged; not derived from restored pigment',
        'decodedQualification': 'Canonical outside RGB identity does not imply decoded lossy diffuse identity; review both tiers'}
    source['environment'] = {'python': sys.version, 'executable': sys.executable,
        'pillow': PIL.__version__, 'numpy': np.__version__, 'libwebp': features.version('webp')}
    source['qualification'] = 'Sole colour-motif master prepared; decoded both-tier material and public checks remain required'
    require(all(path.read_bytes() == data for path, data in watched.items()), 'Input changed during package writing')
    with (args.output/'master.json').open('x') as file:
        file.write(json.dumps(source, indent=2)+'\n')
    print(json.dumps({'master': str(args.output/'master.json'), 'dimensions': list(dimensions),
                      'heightUnchanged': True, 'policy': 'native-colour-motifs', 'statistics': stats}))


if __name__ == '__main__':
    main()
