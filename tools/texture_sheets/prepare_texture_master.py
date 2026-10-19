"""Prepare one source-bound RGB/relief master package for shared texture tiers.

No model call, tier authoring or runtime registration occurs here. The retained
single generator output must already contain enough pixels for High. Reuse the
existing photographic finisher and material-aware height function once, before
independent Mid/High derivation with derive_texture_tiers.py.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import numpy as np
import PIL
from PIL import Image, features

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from craft_normals import craft, profile_for
from finish_official_texture import finish
from derive_texture_tiers import bounded_bytes, require, rgb_image, sha, MAX_PIXELS


def landmarks_from(data, native):
    value = json.loads(data.decode('utf8'))
    require(isinstance(value, dict) and set(value) == {'axis', 'points'}, 'Landmarks require axis and points')
    require(value['axis'] in ('x', 'y'), 'Landmark axis must be x or y')
    pairs = np.asarray(value['points'], dtype=float)
    end = native.width if value['axis'] == 'x' else native.height
    require(pairs.ndim == 2 and pairs.shape[1] == 2 and 2 <= len(pairs) <= 256,
            'Landmarks require two to256 coordinate pairs')
    require(np.isfinite(pairs).all() and np.array_equal(pairs[0], [0, 0])
            and np.array_equal(pairs[-1], [end, end])
            and np.all(np.diff(pairs, axis=0) > 0), 'Landmarks must increase from [0,0] to native endpoint')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('original', 'generated', 'prompt', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    for name in ('name', 'edition', 'profile'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--landmarks', type=Path)
    parser.add_argument('--color-strength', type=float, default=.65)
    parser.add_argument('--field-sigma', type=float, default=.75)
    parser.add_argument('--strength', type=float, default=.3)
    parser.add_argument('--cap', type=float, default=.5)
    args = parser.parse_args()
    require(not args.output.exists() and not args.output.is_symlink(), 'Master output already exists')
    require(all(isinstance(v, str) and v.strip() and len(v) <= 128 for v in
                (args.name, args.edition, args.profile)), 'Bounded nonempty source labels required')
    require(math.isfinite(args.color_strength) and 0 <= args.color_strength <= 1, 'Invalid color strength')
    require(math.isfinite(args.field_sigma) and .25 <= args.field_sigma <= 4, 'Invalid field sigma')
    require(math.isfinite(args.strength) and 0 < args.strength <= 4, 'Invalid normal strength')
    require(math.isfinite(args.cap) and 0 < args.cap <= 4, 'Invalid normal cap')
    paths = {role: getattr(args, role).resolve() for role in ('original', 'generated', 'prompt')}
    if args.landmarks:
        paths['landmarks'] = args.landmarks.resolve()
    require(len(set(paths.values())) == len(paths), 'Distinct source inputs required')
    sources = {role: bounded_bytes(path) for role, path in paths.items()}
    require(len(sources['prompt']) <= 65536 and sources['prompt'].decode('utf8').strip(),
            'Nonempty UTF8 prompt of at most64KiB required')
    original = rgb_image(sources['original'])
    generated = rgb_image(sources['generated'], master=True)
    require(original.width >= 8 and original.height >= 8 and original.width % 4 == 0
            and original.height % 4 == 0, 'Native dimensions must be >=8 and divisible by4')
    dimensions = (original.width * 8, original.height * 8)
    require(math.prod(dimensions) <= MAX_PIXELS, 'Canonical master exceeds pixel budget')
    require(generated.width >= dimensions[0] and generated.height >= dimensions[1],
            'Generator output is too small for8x; never upscale it')
    require(generated.width * original.height == generated.height * original.width,
            'Generator output aspect differs from native')
    measured = landmarks_from(sources['landmarks'], original) if args.landmarks else None
    axis = measured['axis'] if measured else None
    native_image, generated_image = original, generated
    if axis == 'x':
        native_image = original.transpose(Image.Transpose.TRANSPOSE)
        generated_image = generated.transpose(Image.Transpose.TRANSPOSE)
    color, registration = finish(native_image, generated_image, factor=8,
        vertical_landmarks=measured['points'] if measured else None,
        comparison_divisor=2, method='photographic', color_strength=args.color_strength,
        field_sigma=args.field_sigma)
    if axis == 'x':
        color = color.transpose(Image.Transpose.TRANSPOSE)
    require(color.size == dimensions, 'Canonical master dimensions changed')
    registration['axis'] = axis
    profile = {**profile_for(args.profile), 'strength': args.strength, 'cap': args.cap}
    # Exactly one material-aware relief authoring operation at master resolution.
    height, _ = craft(np.asarray(color, dtype=float) / 255, profile, quantize_height=False)
    height = height.astype('float32')
    require(np.isfinite(height).all() and height.min() >= 0 and height.max() <= 1,
            'Invalid authored scalar relief')
    require(all(path.read_bytes() == sources[role] for role, path in paths.items()),
            'Source changed during master preparation')
    args.output.mkdir(parents=True, exist_ok=False)
    with (args.output / 'color.png').open('xb') as file:
        color.save(file, 'PNG')
    with (args.output / 'height.npy').open('xb') as file:
        np.save(file, height, allow_pickle=False)
    tool_paths = {'prepare': Path(__file__), 'finish': Path(__file__).with_name('finish_official_texture.py'),
                  'derive': Path(__file__).with_name('derive_texture_tiers.py'),
                  'craft': Path(__file__).resolve().parents[1] / 'craft_normals.py'}
    receipt = {'schemaVersion': 1, 'name': args.name, 'edition': args.edition,
        'generationCount': 1, 'generatorPolicy': 'One retained generator output; this CLI never calls a generator',
        'inputs': {role: {'file': str(path), 'sha256': sha(sources[role])} for role, path in paths.items()},
        'nativeDimensions': list(original.size), 'generatedDimensions': list(generated.size),
        'masterDimensions': list(dimensions), 'canonicalMasterFactor': 8,
        'color': {'file': 'color.png', 'sha256': sha((args.output / 'color.png').read_bytes())},
        'height': {'file': 'height.npy', 'sha256': sha((args.output / 'height.npy').read_bytes()),
                   'dtype': 'float32', 'authoredOnce': True, 'quantizedTo8Bit': False,
                   'profile': profile, 'uniqueSamples': int(np.unique(height).size)},
        'registration': registration,
        'tools': {role: {'file': str(path.resolve()), 'sha256': sha(path.read_bytes())}
                  for role, path in tool_paths.items()},
        'environment': {'python': sys.version, 'executable': sys.executable, 'pillow': PIL.__version__,
                        'numpy': np.__version__, 'libwebp': features.version('webp')},
        'qualification': 'Sole master package prepared; both-tier visual/public qualification remains separate'}
    require(all(path.read_bytes() == sources[role] for role, path in paths.items()),
            'Source changed during package writing')
    with (args.output / 'master.json').open('x') as file:
        file.write(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'master': str(args.output / 'master.json'), 'dimensions': list(dimensions)}))


if __name__ == '__main__':
    main()
