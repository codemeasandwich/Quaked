"""Prepare source-bound analytic rounded caps, preserving the verified RGB.

The fixed public prepare CLI must reproduce the unrevised source package first.
Architecture is a continuous paraboloid, never a brightness threshold. Compose
float64 geometry and restrained unquantized craft detail, then cast once. This
tool creates no image source, tier, registry entry or artistic acceptance.
"""
import argparse
import copy
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
import numpy as np
import PIL
from PIL import features

from derive_texture_tiers import bounded_bytes, require, rgb_image, scalar_master, sha, MAX_PIXELS
from prepare_texture_master import craft
from register_layered_texture_boundary import publish_exclusive

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
MAX_CAPS = 64
MAX_CAP_EVALUATIONS = MAX_PIXELS
HEX = re.compile(r'[0-9a-f]{64}')


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON key')
        result[key] = value
    return result


def document(data):
    return json.loads(data.decode('utf8'), object_pairs_hook=unique_object)


def digest(value):
    return isinstance(value, str) and HEX.fullmatch(value) is not None


def label(value):
    return isinstance(value, str) and bool(value.strip()) and len(value) <= 128


def validate_caps(caps, native):
    require(isinstance(caps, dict) and set(caps) == {
        'referenceSize', 'profile', 'plateHeight', 'capAmplitude', 'microAmplitude', 'heads'},
        'Unknown cap policy fields')
    require(caps['referenceSize'] == list(native)
            and all(type(v) is int for v in caps['referenceSize']), 'Wrong native cap reference size')
    require(caps['profile'] == 'paraboloid', 'Only the reviewed paraboloid profile is supported')
    plate, amplitude, micro = (caps[k] for k in ('plateHeight', 'capAmplitude', 'microAmplitude'))
    require(all(number(v) for v in (plate, amplitude, micro)), 'Finite non-Boolean cap parameters required')
    require(amplitude > 0 and 0 <= micro <= .1 and plate-micro >= 0
            and plate+amplitude+micro <= 1, 'Cap composition would require clipping')
    heads = caps['heads']
    require(isinstance(heads, list) and 1 <= len(heads) <= MAX_CAPS, 'Bounded nonempty cap list required')
    require(len(heads)*native[0]*native[1]*64 <= MAX_CAP_EVALUATIONS, 'Cap evaluation pixel budget exceeded')
    names, boxes = set(), []
    for head in heads:
        require(isinstance(head, dict) and set(head) == {'label', 'centre', 'radii'}, 'Unknown head fields')
        require(label(head['label']) and head['label'] not in names, 'Missing or duplicate head label')
        names.add(head['label'])
        require(all(isinstance(head[k], list) and len(head[k]) == 2
                    and all(number(v) for v in head[k]) for k in ('centre', 'radii')),
                'Finite centre and radii pairs required')
        cx, cy = head['centre']
        rx, ry = head['radii']
        require(rx*8 >= 2 and ry*8 >= 2, 'Cap radii need at least two canonical texels')
        box = (cx-rx, cy-ry, cx+rx, cy+ry)
        # No cap contribution on the outermost texel centres; no perimeter frame.
        require(box[0] >= .5/8 and box[1] >= .5/8
                and box[2] <= native[0]-.5/8 and box[3] <= native[1]-.5/8,
                'Cap support must be strictly interior to the sampled image border')
        for old in boxes:
            require(box[2] < old[0] or old[2] < box[0] or box[3] < old[1] or old[3] < box[1],
                    'Overlapping or touching head bounding boxes are unsupported')
        boxes.append(box)


def compose_caps(detail, caps):
    """Float64 paraboloids plus the same unquantized photographic microdetail.

    Geometry is C0 at each support boundary, not C1. Near that boundary cap
    heights meet plate heights; global head/plate range separation is invalid.
    """
    require(detail.dtype == np.float64 and np.isfinite(detail).all()
            and detail.min() >= 0 and detail.max() <= 1, 'Full float64 detail required')
    h, w = detail.shape
    require([w, h] == [8*v for v in caps['referenceSize']], 'Require the canonical 8x detail grid')
    x = (np.arange(w, dtype=np.float64)[None, :]+.5)/8
    y = (np.arange(h, dtype=np.float64)[:, None]+.5)/8
    geometry = np.full((h, w), caps['plateHeight'], dtype=np.float64)
    stats = []
    for head in caps['heads']:
        cx, cy = head['centre']
        rx, ry = head['radii']
        r2 = ((x-cx)/rx)**2+((y-cy)/ry)**2
        q = np.maximum(0, 1-r2)
        geometry += caps['capAmplitude']*q
        stats.append({'label': head['label'], 'positiveSupportPixels': int((q > 0).sum()),
                      'maximumSampledCapTerm': float((caps['capAmplitude']*q).max())})
    height = geometry+(detail-.5)*(2*caps['microAmplitude'])
    require(np.isfinite(height).all() and height.min() >= 0 and height.max() <= 1,
            'Invalid cap scalar; clipping is not permitted')
    return height.astype('float32'), stats


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = Path(os.path.abspath(args.output))
    require(not output.exists() and not output.is_symlink(), 'Output already exists')
    require(output.parent.is_dir() and output.parent.resolve() == output.parent,
            'Output needs an existing real parent directory')
    watched = {}
    unsealed = object()

    def read(path, expected=unsealed, limit=None):
        path = Path(path)
        path = Path(os.path.abspath(path if path.is_absolute() else ROOT/path))
        require(not path.is_symlink() and path.resolve() == path, 'Redirected input path')
        data = bounded_bytes(path)
        require(limit is None or len(data) <= limit, 'Metadata exceeds byte budget')
        require(expected is unsealed or digest(expected) and sha(data) == expected, 'Input hash mismatch: '+str(path))
        require(path not in watched or watched[path] == data, 'Input changed between observations: '+str(path))
        watched[path] = data
        return data

    def verify():
        for path, data in watched.items():
            require(not path.is_symlink() and path.resolve() == path
                    and bounded_bytes(path) == data, 'Input changed during authoring: '+str(path))

    recipe_bytes = read(args.recipe.absolute(), limit=262144)
    recipe = document(recipe_bytes)
    required = {'schemaVersion', 'policy', 'nativeIdentity', 'name', 'edition', 'nativeDimensions',
                'sourceMasterPackage', 'sourceMasterPackageSha256', 'sourceVerification',
                'originalSha256', 'authoringDiffuseSha256', 'authoredAtMasterDimensions', 'baselineProfile', 'caps'}
    require(isinstance(recipe, dict) and set(recipe) == required, 'Unknown or missing recipe fields')
    require(type(recipe['schemaVersion']) is int and recipe['schemaVersion'] == 1
            and recipe['policy'] == 'rounded-caps-v1', 'Unsupported rounded-cap recipe')
    require(digest(recipe['nativeIdentity']) and all(label(recipe[k]) for k in ('name', 'edition', 'baselineProfile')),
            'Valid source identity and labels required')
    native = recipe['nativeDimensions']
    require(isinstance(native, list) and len(native) == 2 and all(type(v) is int and v >= 8 and v % 4 == 0 for v in native)
            and native[0]*native[1]*64 <= MAX_PIXELS, 'Invalid native dimensions')
    dimensions = [8*v for v in native]
    require(recipe['authoredAtMasterDimensions'] == dimensions
            and all(type(v) is int for v in recipe['authoredAtMasterDimensions']), 'Wrong canonical master dimensions')
    validate_caps(recipe['caps'], native)
    require(isinstance(recipe['sourceMasterPackage'], str) and bool(recipe['sourceMasterPackage'].strip())
            and len(recipe['sourceMasterPackage']) <= 4096, 'Source package path required')
    package = Path(recipe['sourceMasterPackage'])
    package = Path(os.path.abspath(package if package.is_absolute() else ROOT/package))
    package_bytes = read(package, recipe['sourceMasterPackageSha256'], limit=1048576)
    source = document(package_bytes)
    initial_keys = {'schemaVersion', 'name', 'edition', 'generationCount', 'generatorPolicy', 'inputs',
                    'nativeDimensions', 'generatedDimensions', 'masterDimensions', 'canonicalMasterFactor',
                    'color', 'height', 'registration', 'tools', 'environment', 'qualification'}
    require(isinstance(source, dict) and set(source) == initial_keys, 'Require an unrevised initial prepare package')
    require(type(source['schemaVersion']) is int and source['schemaVersion'] == 1
            and type(source['generationCount']) is int and source['generationCount'] == 1
            and type(source['canonicalMasterFactor']) is int and source['canonicalMasterFactor'] == 8,
            'Require a single-source 8x prepare package')
    require(source['name'] == recipe['name'] and source['edition'] == recipe['edition']
            and source['nativeDimensions'] == native and source['masterDimensions'] == dimensions, 'Source material differs')
    require(source['color']['file'] == 'color.png' and source['height']['file'] == 'height.npy'
            and source['height']['dtype'] == 'float32' and source['height']['authoredOnce'] is True
            and source['height']['quantizedTo8Bit'] is False and 'authoringPolicy' not in source['height'],
            'Unsupported or revised initial height')
    reg = source['registration']
    require(reg['method'] == 'photographic' and reg['factor'] == 8 and reg['comparisonDivisor'] == 2
            and reg.get('edgeAnchor') is False and 'periodicBoundary' not in reg, 'Unsupported or corrected registration')
    verification = recipe['sourceVerification']
    require(isinstance(verification, dict) and set(verification) == {'file', 'sha256'}, 'Closed source proof reference required')
    proof = document(read(verification['file'], verification['sha256'], limit=2097152))
    require(isinstance(proof.get('verdict'), str) and proof['verdict'].startswith('PASS')
            and isinstance(proof.get('materials'), list) and len(proof['materials']) <= 4096, 'Source proof did not pass')
    matches = [row for row in proof['materials'] if row.get('nativeIdentity') == recipe['nativeIdentity']]
    require(len(matches) == 1 and matches[0]['name'] == recipe['name'] and matches[0]['edition'] == recipe['edition']
            and matches[0]['masterPackage']['sha256'] == sha(package_bytes), 'Source proof identity differs')
    proof_package = Path(matches[0]['masterPackage']['file'])
    require((proof_package if proof_package.is_absolute() else ROOT/proof_package).resolve() == package,
            'Source proof package path differs')
    expected_tools = {role: TOOLS/name for role, name in (
        ('prepare', 'prepare_texture_master.py'), ('finish', 'finish_official_texture.py'), ('derive', 'derive_texture_tiers.py'))}
    expected_tools['craft'] = ROOT/'tools/craft_normals.py'
    require(set(source['tools']) == set(expected_tools), 'Unexpected source tool roles')
    for role, path in expected_tools.items():
        row = source['tools'][role]
        require(Path(row['file']).resolve() == path.resolve(), 'Redirected source tool')
        read(path, row['sha256'])
    require(set(source['inputs']) in ({'original', 'generated', 'prompt'}, {'original', 'generated', 'prompt', 'landmarks'}),
            'Unexpected source input roles')
    inputs, input_paths = {}, {}
    for role, row in source['inputs'].items():
        path = Path(row['file'])
        path = path if path.is_absolute() else ROOT/path
        inputs[role] = read(path, row['sha256'], limit=65536 if role in ('prompt', 'landmarks') else None)
        input_paths[role] = path.resolve()
    require(len(set(input_paths.values())) == len(input_paths), 'Source input paths must be distinct')
    original, generated = rgb_image(inputs['original']), rgb_image(inputs['generated'], master=True)
    require(list(original.size) == native and list(generated.size) == source['generatedDimensions']
            and generated.width >= dimensions[0] and generated.height >= dimensions[1]
            and generated.width*native[1] == generated.height*native[0], 'Invalid source size or aspect')
    require(sha(inputs['original']) == recipe['originalSha256'], 'Native PNG hash differs')
    color_bytes = read(package.parent/'color.png', source['color']['sha256'])
    require(sha(color_bytes) == recipe['authoringDiffuseSha256'], 'Authoring RGB hash differs')
    color = rgb_image(color_bytes, master=True)
    require(list(color.size) == dimensions, 'Canonical RGB size differs')
    baseline_height_bytes = read(package.parent/'height.npy', source['height']['sha256'])
    baseline_height = scalar_master(baseline_height_bytes, dimensions)
    require(baseline_height.dtype == np.dtype('float32'), 'Initial height must be float32')
    read(Path(__file__).resolve())
    publisher = TOOLS/'register_layered_texture_boundary.py'
    read(publisher)
    verify()
    with tempfile.TemporaryDirectory(prefix='.rounded-cap-', dir=output.parent) as private:
        private = Path(private)
        # Only this fixed canonical producer executes, never a metadata-provided path.
        argv = [sys.executable, str(TOOLS/'prepare_texture_master.py'),
                '--original', str(input_paths['original']), '--generated', str(input_paths['generated']),
                '--prompt', str(input_paths['prompt']), '--name', recipe['name'], '--edition', recipe['edition'],
                '--profile', recipe['baselineProfile'], '--color-strength', str(reg['colorStrength']),
                '--field-sigma', str(reg['fieldSigma']), '--strength', str(source['height']['profile']['strength']),
                '--cap', str(source['height']['profile']['cap']), '--output', str(private/'baseline')]
        if 'landmarks' in input_paths:
            argv += ['--landmarks', str(input_paths['landmarks'])]
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
        run = subprocess.run(argv, cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)
        require(run.returncode == 0, 'Fixed public prepare replay failed: '+run.stderr[-8000:])
        for name, expected in (('color.png', color_bytes), ('height.npy', baseline_height_bytes), ('master.json', package_bytes)):
            require(bounded_bytes(private/'baseline'/name) == expected, 'Initial package replay differs: '+name)
        verify()
        detail, _ = craft(np.asarray(color, dtype=np.float64)/255, source['height']['profile'], quantize_height=False)
        initial = io.BytesIO()
        np.save(initial, detail.astype('float32'), allow_pickle=False)
        require(initial.getvalue() == baseline_height_bytes, 'Unquantized initial detail replay differs')
        height, stats = compose_caps(detail, recipe['caps'])
        buffer = io.BytesIO()
        np.save(buffer, height, allow_pickle=False)
        height_bytes = buffer.getvalue()
        result = copy.deepcopy(source)
        result['masterRevision'] = {'replacesUnqualifiedPackageSha256': sha(package_bytes),
            'previousHeightSha256': source['height']['sha256'], 'generatorOutputUnchanged': True,
            'RGBUnchanged': True, 'notAnotherGeneration': True}
        result['height'].update(sha256=sha(height_bytes), authoringPolicy='rounded-caps-v1', uniqueSamples=int(np.unique(height).size))
        result['inputs']['roundedCapsRecipe'] = {'file': str(args.recipe.resolve()), 'sha256': sha(recipe_bytes)}
        result['tools']['roundedCapAuthoring'] = {'file': str(Path(__file__).resolve()), 'sha256': sha(watched[Path(__file__).resolve()])}
        result['tools']['exclusivePublication'] = {'file': str(publisher), 'sha256': sha(watched[publisher])}
        result['roundedCaps'] = {'nativeIdentity': recipe['nativeIdentity'], 'recipe': recipe,
            'recipeSha256': sha(recipe_bytes), 'sourceProofSha256': verification['sha256'],
            'coordinateConvention': 'Native pixel edges evaluated at canonical texel centres (i+.5)/8,(j+.5)/8',
            'geometry': 'plate + amplitude*max(0,1-rSquared); disjoint interior ellipses; C0 not C1',
            'precisionOrder': 'verified RGB -> craft float64 -> analytic caps + microdetail float64 -> one float32 cast',
            'headSamples': stats, 'heightRange': [float(height.min()), float(height.max())],
            'qualification': 'Relative geometry only. Bounded micro amplitude does not bound slopes; actual base/final/decoded ART remains required.'}
        result['environment'] = {'python': sys.version, 'executable': sys.executable,
            'pillow': PIL.__version__, 'numpy': np.__version__, 'libwebp': features.version('webp')}
        result['qualification'] = 'Same-RGB analytic cap master prepared; actual physical ART and both-tier public qualification remain required'
        staged = private/'successor'
        staged.mkdir()
        (staged/'color.png').write_bytes(color_bytes)
        (staged/'height.npy').write_bytes(height_bytes)
        (staged/'master.json').write_text(json.dumps(result, indent=2)+'\n')
        verify()
        publish_exclusive(staged, output)
    print(json.dumps({'master': str(output/'master.json'), 'dimensions': dimensions,
                      'generationCount': 1, 'RGBUnchanged': True, 'policy': 'rounded-caps-v1'}))


if __name__ == '__main__':
    main()
