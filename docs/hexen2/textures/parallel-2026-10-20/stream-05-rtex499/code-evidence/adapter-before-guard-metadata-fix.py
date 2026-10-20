"""Register one source-bound layered master's X or Y join, then rebuild relief.

The existing guarded layered CLI must reproduce the supplied parent exactly.
Existing Poisson registration and full-precision layer composition are reused;
this adapter never generates an image or authors either enhanced tier.
"""
import argparse
import copy
import ctypes
import errno
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

import numpy as np
import PIL
from PIL import Image, features

from derive_texture_tiers import bounded_bytes, require, rgb_image, scalar_master, sha
from finish_official_texture import area, metrics
from prepare_layered_texture_master import compose_layered, craft
from register_texture_boundary import periodic_y

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent


def publish_exclusive(source, destination):
    """Atomically publish a complete directory without replacing any destination.

    Fail closed when the native no-replace primitive is unavailable. Plain rename
    would overwrite a late empty directory or symlink and is never a fallback.
    """
    libc = ctypes.CDLL(None, use_errno=True)
    if sys.platform == 'darwin':
        # Current macOS SDK sys/stdio.h: RENAME_EXCL = 0x00000004.
        fn = getattr(libc, 'renamex_np', None)
        require(fn is not None, 'Atomic no-replace publication unavailable')
        fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        args = [os.fsencode(source), os.fsencode(destination), 4]
    elif sys.platform.startswith('linux'):
        # Linux renameat2(2), UAPI fs.h: RENAME_NOREPLACE = (1 << 0).
        fn = getattr(libc, 'renameat2', None)
        require(fn is not None, 'Atomic no-replace publication unavailable')
        fn.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                       ctypes.c_char_p, ctypes.c_uint]
        args = [-100, os.fsencode(source), -100, os.fsencode(destination), 1]
    else:
        raise OSError(errno.ENOTSUP, 'Atomic no-replace publication unsupported')
    fn.restype = ctypes.c_int
    if fn(*args) != 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code), str(destination))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--axis', choices=('x', 'y'), required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.absolute()
    require(not output.exists() and not output.is_symlink(), 'Output already exists')
    require(output.parent.is_dir() and output.parent.resolve() == output.parent,
            'Output needs an existing real parent directory')
    require(not args.package.is_symlink(), 'Parent package cannot be redirected')
    package = args.package.resolve()
    watched = {}

    def read(path, digest=None):
        path = Path(path)
        path = (path if path.is_absolute() else ROOT/path).resolve()
        data = bounded_bytes(path)
        require(digest is None or sha(data) == digest, 'Input hash mismatch: '+str(path))
        watched[path] = data
        return data

    parent_bytes = read(package)
    require(len(parent_bytes) <= 1048576, 'Parent package exceeds byte budget')
    parent = json.loads(parent_bytes)
    expected_keys = {'schemaVersion', 'name', 'edition', 'generationCount', 'generatorPolicy',
                     'inputs', 'nativeDimensions', 'generatedDimensions', 'masterDimensions',
                     'canonicalMasterFactor', 'color', 'height', 'registration', 'tools',
                     'environment', 'qualification', 'masterRevision', 'layeredRelief'}
    require(set(parent) == expected_keys and type(parent['schemaVersion']) is int
            and parent['schemaVersion'] == 1 and type(parent['generationCount']) is int
            and parent['generationCount'] == 1 and parent['canonicalMasterFactor'] == 8,
            'Require an unrepeated single-source layered package')
    require('periodicBoundary' not in parent['registration']
            and parent['height'].get('authoringPolicy') == 'layered-veneer'
            and parent['height']['authoredOnce'] is True
            and parent['height']['quantizedTo8Bit'] is False
            and parent['height']['dtype'] == 'float32', 'Unsupported prior correction or height')
    roles = {'original', 'generated', 'prompt', 'heightLayering'}
    require(set(parent['inputs']) in (roles, roles | {'landmarks'}), 'Unexpected input roles')
    expected_tools = {k: TOOLS/n for k, n in (
        ('prepare', 'prepare_texture_master.py'), ('finish', 'finish_official_texture.py'),
        ('derive', 'derive_texture_tiers.py'), ('layeredAuthoring', 'prepare_layered_texture_master.py'),
        ('layeredPolicy', 'update_level_sheets.py'))}
    expected_tools['craft'] = ROOT/'tools/craft_normals.py'
    require(set(parent['tools']) == set(expected_tools), 'Unexpected tool roles')
    for role, row in parent['tools'].items():
        require(Path(row['file']).resolve() == expected_tools[role].resolve(), 'Redirected tool')
        read(row['file'], row['sha256'])
    for row in parent['inputs'].values():
        read(row['file'], row['sha256'])
    recipe_row = parent['inputs']['heightLayering']
    recipe_bytes = read(recipe_row['file'], recipe_row['sha256'])
    recipe = json.loads(recipe_bytes)
    require(parent['layeredRelief']['recipe'] == recipe
            and parent['layeredRelief']['recipeSha256'] == sha(recipe_bytes),
            'Baseline recipe differs')
    read(recipe['sourceMasterPackage'], recipe['sourceMasterPackageSha256'])
    proof = recipe['sourceVerification']
    read(proof['file'], proof['sha256'])
    require(parent['color']['file'] == 'color.png' and parent['height']['file'] == 'height.npy',
            'Canonical sibling filenames required')
    color_bytes = read(package.parent/'color.png', parent['color']['sha256'])
    height_bytes = read(package.parent/'height.npy', parent['height']['sha256'])
    old_color = rgb_image(color_bytes, master=True)
    dimensions = tuple(parent['masterDimensions'])
    old_height = scalar_master(height_bytes, dimensions)
    require(old_color.size == dimensions and old_height.dtype == np.dtype('float32')
            and np.isfinite(old_height).all(), 'Invalid current master')
    read(Path(__file__).resolve())
    read(TOOLS/'register_texture_boundary.py')
    with tempfile.TemporaryDirectory(prefix='.layered-boundary-', dir=output.parent) as work:
        work = Path(work)
        run = subprocess.run([sys.executable, str(TOOLS/'prepare_layered_texture_master.py'),
            '--recipe', str(Path(recipe_row['file']).resolve()), '--output', str(work/'baseline')],
            cwd=ROOT, capture_output=True, text=True, timeout=120)
        require(run.returncode == 0, 'Guarded baseline replay failed: '+run.stderr[-8000:])
        for name, expected in (('color.png', color_bytes), ('height.npy', height_bytes),
                               ('master.json', parent_bytes)):
            require((work/'baseline'/name).read_bytes() == expected,
                    'Parent does not replay byte-exactly: '+name)
        working = old_color.transpose(Image.Transpose.TRANSPOSE) if args.axis == 'x' else old_color
        color, correction = periodic_y(working)
        if args.axis == 'x':
            color = color.transpose(Image.Transpose.TRANSPOSE)
        correction.update(axes=[args.axis], computationAxes=['y'], transposed=args.axis == 'x',
            before=metrics(np.asarray(old_color, dtype=float)),
            after=metrics(np.asarray(color, dtype=float)))
        original = rgb_image(read(parent['inputs']['original']['file']))
        correction['distanceChecks'] = {str(d): {
            'dimensions': [original.width//d, original.height//d],
            'RGBMeanAbsoluteError': float(np.abs(area(np.asarray(color, dtype=float), 8*d)
                - area(np.asarray(original, dtype=float), d)).mean())} for d in (2, 4)}
        detail, _ = craft(np.asarray(color, dtype=float)/255,
                          parent['height']['profile'], quantize_height=False)
        height, mask, sigma = compose_layered(detail, recipe['layering'])
        require(height[mask > .5].max() < height[mask <= .5].min(), 'Layer hierarchy failed')
        buffer = io.BytesIO()
        color.save(buffer, 'PNG')
        new_color_bytes = buffer.getvalue()
        buffer = io.BytesIO()
        np.save(buffer, height, allow_pickle=False)
        new_height_bytes = buffer.getvalue()
        result = copy.deepcopy(parent)
        result['masterRevision'] = {'replacesUnqualifiedPackageSha256': sha(parent_bytes),
            'previousColorSha256': parent['color']['sha256'],
            'previousHeightSha256': parent['height']['sha256'],
            'generatorOutputUnchanged': True, 'notAnotherGeneration': True,
            'RGBUnchanged': color_bytes == new_color_bytes, 'priorRevision': parent['masterRevision']}
        result['color']['sha256'] = sha(new_color_bytes)
        result['height'].update(sha256=sha(new_height_bytes), uniqueSamples=int(np.unique(height).size),
            authoringPolicy='periodic-layered-veneer-v1')
        result['inputs']['boundaryParent'] = {'file': str(package), 'sha256': sha(parent_bytes)}
        result['registration']['periodicBoundary'] = correction
        result['tools']['layeredBoundaryRegistration'] = {
            'file': str(Path(__file__).resolve()), 'sha256': sha(watched[Path(__file__).resolve()])}
        result['tools']['boundaryPolicy'] = {'file': str(TOOLS/'register_texture_boundary.py'),
            'sha256': sha(watched[(TOOLS/'register_texture_boundary.py').resolve()])}
        result['layeredRelief'] = {'nativeIdentity': recipe['nativeIdentity'],
            'baselineRecipe': recipe, 'baselineRecipeSha256': sha(recipe_bytes),
            'baselineRecipeAuthoringDiffuseSha256': recipe['authoringDiffuseSha256'],
            'detailRGBSourceSha256': sha(new_color_bytes), 'sourceMeasuredGeometryReused': True,
            'bevelSigmaMasterPixels': sigma,
            'precisionOrder': 'corrected RGB -> craft float64 -> layers float64 -> one float32 cast',
            'substrateRange': [float(height[mask > .5].min()), float(height[mask > .5].max())],
            'facingRange': [float(height[mask <= .5].min()), float(height[mask <= .5].max())],
            'qualification': 'Baseline recipe identifies original RGB; final geometry/colour needs ART review'}
        result['qualification'] = 'Same-source periodic layered successor; both-tier public and ART checks required'
        result['environment'] = {'python': sys.version, 'executable': sys.executable,
            'pillow': PIL.__version__, 'numpy': np.__version__, 'libwebp': features.version('webp')}
        staged = work/'successor'
        staged.mkdir()
        (staged/'color.png').write_bytes(new_color_bytes)
        (staged/'height.npy').write_bytes(new_height_bytes)
        (staged/'master.json').write_text(json.dumps(result, indent=2)+'\n')
        require(all(path.read_bytes() == data for path, data in watched.items()),
                'Input changed during authoring')
        publish_exclusive(staged, output)
    print(json.dumps({'master': str(output/'master.json'), 'axis': args.axis,
                      'generationCount': 1, 'policy': 'periodic-layered-veneer-v1'}))


if __name__ == '__main__':
    main()
