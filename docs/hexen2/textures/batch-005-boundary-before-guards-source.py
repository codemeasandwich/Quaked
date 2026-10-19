"""Register a reviewed vertical texture join before final relief/tier derivation.

An opt-in correction for an unqualified, source-bound prepare_texture_master
package. Replay its photographic finish, remove a zero-mean Poisson field for
the Y boundary mismatch, then author scalar relief once from the corrected RGB.
No generation, feature relocation, strip cloning or compressed tier input.
Existing authoring tools and earlier packages remain unchanged.
"""
import argparse
from io import BytesIO
import json
from pathlib import Path
import sys

import numpy as np
import PIL
from PIL import Image, features

from prepare_texture_master import craft, finish, landmarks_from
from derive_texture_tiers import bounded_bytes, require, rgb_image, sha
from finish_official_texture import area, metrics


def periodic_y(image):
    """Subtract the periodic Poisson solution of the top/bottom mismatch.

    The discrete Laplacian eigenvalue is 2cos(kx)+2cos(ky)-4. The forcing
    has zero sum; fixing DC to zero chooses the unique zero-mean solution.
    It changes intensities without moving features. This is not a universal
    tiler: both axes, corners, clipping and final relief require visual review.
    """
    value = np.asarray(image.convert('RGB'), dtype=np.float64)
    height, width, _ = value.shape
    forcing = np.zeros_like(value)
    forcing[0] = value[-1] - value[0]
    forcing[-1] = -forcing[0]
    eigenvalue = (2*np.cos(2*np.pi*np.fft.fftfreq(height))[:, None]
                  + 2*np.cos(2*np.pi*np.fft.fftfreq(width))[None, :] - 4)
    eigenvalue[0, 0] = 1
    smooth = np.fft.ifft2(np.fft.fft2(forcing, axes=(0, 1))
                          / eigenvalue[:, :, None], axes=(0, 1)).real
    smooth -= smooth.mean((0, 1))
    raw = value - smooth
    pixels = np.rint(np.clip(raw, 0, 255)).astype('uint8')
    return Image.fromarray(pixels, 'RGB'), {
        'algorithm': 'periodic-plus-smooth discrete Poisson, zero-mean, v1',
        'axes': ['y'], 'featureRelocation': False, 'perimeterBand': False,
        'meanAbsoluteCorrection': float(np.abs(smooth).mean()),
        'maxAbsoluteCorrection': float(np.abs(smooth).max()),
        'clippedChannelFraction': float(np.mean((raw < 0) | (raw > 255))),
        'before': metrics(value), 'after': metrics(pixels.astype(float)),
        'meanRGBChange': (pixels.mean((0, 1)) - value.mean((0, 1))).tolist()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    require(not args.output.exists() and not args.output.is_symlink(), 'Output already exists')
    package_bytes = bounded_bytes(args.package)
    recipe = json.loads(package_bytes)
    require(recipe['schemaVersion'] == 1 and recipe['generationCount'] == 1
            and recipe['canonicalMasterFactor'] == 8, 'A single-source 8x prepare package is required')
    registration = recipe['registration']
    require(registration['method'] == 'photographic'
            and registration['factor'] == 8 and registration['comparisonDivisor'] == 2
            and not registration.get('edgeAnchor')
            and not registration.get('periodicBoundary'), 'Already registered or unsupported source package')
    require(set(recipe['inputs']) in ({'original', 'generated', 'prompt'},
                                      {'original', 'generated', 'prompt', 'landmarks'}),
            'Unexpected source roles')
    sources = {}
    watched = {args.package.resolve(): package_bytes}
    for role, row in recipe['inputs'].items():
        path = Path(row['file']).resolve()
        data = bounded_bytes(path)
        require(sha(data) == row['sha256'], 'Source hash mismatch: ' + role)
        watched[path] = data
        sources[role] = data
    require(len(sources['prompt']) <= 65536 and sources['prompt'].decode('utf8').strip(),
            'Nonempty UTF8 prompt of at most64KiB required')
    for role, row in recipe['tools'].items():
        path = Path(row['file']).resolve()
        data = bounded_bytes(path)
        require(sha(data) == row['sha256'], 'Source tool hash mismatch: ' + role)
        watched[path] = data
    original = rgb_image(sources['original'])
    generated = rgb_image(sources['generated'], master=True)
    dimensions = (original.width*8, original.height*8)
    require(list(original.size) == recipe['nativeDimensions']
            and list(generated.size) == recipe['generatedDimensions']
            and list(dimensions) == recipe['masterDimensions'], 'Source dimensions changed')
    require(generated.width >= dimensions[0] and generated.height >= dimensions[1]
            and generated.width*original.height == generated.height*original.width,
            'Undersized or wrong-aspect source; never upscale')
    color_path = args.package.parent / recipe['color']['file']
    height_path = args.package.parent / recipe['height']['file']
    for path, row in ((color_path, recipe['color']), (height_path, recipe['height'])):
        data = bounded_bytes(path)
        require(sha(data) == row['sha256'], 'Unqualified master hash changed')
        watched[path.resolve()] = data
    old_color = rgb_image(watched[color_path.resolve()], master=True)
    old_height = np.load(BytesIO(watched[height_path.resolve()]), allow_pickle=False)
    require(old_color.size == dimensions and old_height.shape == dimensions[::-1]
            and old_height.dtype == np.dtype('float32') and np.isfinite(old_height).all()
            and old_height.min() >= 0 and old_height.max() <= 1, 'Malformed original master data')
    measured = landmarks_from(sources['landmarks'], original) if 'landmarks' in sources else None
    axis = measured['axis'] if measured else None
    require(axis == registration.get('axis'), 'Landmark axis changed')
    native_image, generated_image = original, generated
    if axis == 'x':
        native_image = original.transpose(Image.Transpose.TRANSPOSE)
        generated_image = generated.transpose(Image.Transpose.TRANSPOSE)
    replay, _ = finish(native_image, generated_image, factor=8,
        vertical_landmarks=measured['points'] if measured else None,
        comparison_divisor=2, method='photographic',
        color_strength=registration['colorStrength'], field_sigma=registration['fieldSigma'])
    if axis == 'x':
        replay = replay.transpose(Image.Transpose.TRANSPOSE)
    require(replay.tobytes() == old_color.tobytes(), 'Original photographic finish does not replay exactly')
    color, correction = periodic_y(replay)
    profile = recipe['height']['profile']
    require(len(profile['bands']) == 4
            and all(np.isfinite(x) and 0 <= x <= 4 for x in profile['bands'])
            and all(np.isfinite(profile[k]) and 0 <= profile[k] <= 4
                    for k in ('groove', 'bump'))
            and np.isfinite(profile['glow']) and 0 <= profile['glow'] <= 1
            and all(np.isfinite(profile[k]) and 0 < profile[k] <= 4
                    for k in ('strength', 'cap')), 'Invalid scalar relief profile')
    height, _ = craft(np.asarray(color, dtype=float)/255, profile, quantize_height=False)
    height = height.astype('float32')
    require(np.isfinite(height).all() and height.min() >= 0 and height.max() <= 1,
            'Malformed final scalar relief')
    native = np.asarray(original, dtype=float)
    correction['distanceChecks'] = {str(d): {
        'dimensions': [original.width//d, original.height//d],
        'RGBMeanAbsoluteError': float(np.abs(area(np.asarray(color, dtype=float), 8*d)
                                              - area(native, d)).mean())} for d in (2, 4)}
    tool = Path(__file__).resolve()
    tool_bytes = bounded_bytes(tool)
    watched[tool] = tool_bytes
    require(all(p.read_bytes() == data for p, data in watched.items()), 'Input changed during registration')
    args.output.mkdir(parents=True, exist_ok=False)
    with (args.output / 'color.png').open('xb') as file:
        color.save(file, 'PNG')
    with (args.output / 'height.npy').open('xb') as file:
        np.save(file, height, allow_pickle=False)
    recipe['masterRevision'] = {
        'replacesUnqualifiedPackageSha256': sha(package_bytes),
        'previousColorSha256': recipe['color']['sha256'],
        'previousHeightSha256': recipe['height']['sha256'],
        'generatorOutputUnchanged': True, 'notAnotherGeneration': True}
    recipe['color']['sha256'] = sha((args.output / 'color.png').read_bytes())
    recipe['height'].update({'sha256': sha((args.output / 'height.npy').read_bytes()),
        'uniqueSamples': int(np.unique(height).size), 'authoredOnce': True,
        'quantizedTo8Bit': False})
    recipe['registration']['periodicBoundary'] = correction
    recipe['tools']['boundaryRegistration'] = {'file': str(tool), 'sha256': sha(tool_bytes)}
    recipe['environment'] = {'python': sys.version, 'executable': sys.executable,
        'pillow': PIL.__version__, 'numpy': np.__version__, 'libwebp': features.version('webp')}
    recipe['qualification'] = 'Revised sole master; both-tier decoded visual/public checks remain required'
    require(all(p.read_bytes() == data for p, data in watched.items()), 'Input changed during package writing')
    with (args.output / 'master.json').open('x') as file:
        file.write(json.dumps(recipe, indent=2) + '\n')
    print(json.dumps({'master': str(args.output/'master.json'), 'dimensions': list(dimensions),
                      'generationCount': 1, 'periodicAxes': ['y']}))


if __name__ == '__main__':
    main()
