"""Derive Quake/Hexen Mid4x and High8x maps directly from one retained master.

This offline tool never authors material, changes native Low, generates images,
loads another compressed tier or registers runtime resources. A single RGB PNG
and full-precision scalar height master are the sole enhanced-tier sources.
Height amplitude is shared; cyclic normal slopes scale with target texel density
using the established engine convention. All distributed maps use WebP92/method6.
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
from craft_normals import normals_from_height

MAX_PIXELS = 16_777_216
MAX_INPUT_BYTES = MAX_PIXELS * 8 + 65_536
ROLES = ('diffuse', 'height', 'normalX', 'normalY', 'normalZ')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def bounded_bytes(path):
    require(path.is_file(), 'Input file is missing: ' + str(path))
    require(path.stat().st_size <= MAX_INPUT_BYTES, 'Input exceeds byte budget')
    data = path.read_bytes()
    require(len(data) <= MAX_INPUT_BYTES, 'Input changed beyond byte budget')
    return data


def rgb_image(data, master=False):
    with Image.open(io.BytesIO(data)) as image:
        require(image.width * image.height <= MAX_PIXELS, 'Image exceeds pixel budget')
        if master:
            require(image.format == 'PNG' and image.mode == 'RGB', 'Master must be lossless RGB PNG')
        return image.convert('RGB').copy()


def scalar_master(data, dimensions):
    # Inspect dimensions/type before array allocation; no pickles or trailing data.
    stream = io.BytesIO(data)
    version = np.lib.format.read_magic(stream)
    require(version in ((1, 0), (2, 0)), 'Unsupported scalar master NPY format')
    reader = (np.lib.format.read_array_header_1_0 if version == (1, 0)
              else np.lib.format.read_array_header_2_0)
    shape, fortran, dtype = reader(stream)
    require(shape == (dimensions[1], dimensions[0]), 'Height master shape differs from RGB master')
    require(dtype in (np.dtype('float32'), np.dtype('float64')), 'Height master must be float32/float64')
    require(not fortran, 'Height master must use C array order')
    require(len(data) - stream.tell() == math.prod(shape) * dtype.itemsize, 'Truncated/trailing height master data')
    values = np.frombuffer(data, dtype=dtype, offset=stream.tell()).reshape(shape)
    require(np.isfinite(values).all() and values.min() >= 0 and values.max() <= 1,
            'Height master must be finite scalar values in [0,1]')
    return values


def periodic_rgb(master, size):
    if master.size == size:
        return master.copy()
    # Reconstruct with the true wrapped neighbourhood. No clamped frame or
    # artificial edge bevel is introduced by the reduction filter.
    cells = np.tile(np.asarray(master), (3, 3, 1))
    image = Image.fromarray(cells).resize((size[0] * 3, size[1] * 3), Image.Resampling.LANCZOS)
    return image.crop((size[0], size[1], size[0] * 2, size[1] * 2))


def float_height(master, size):
    if master.shape == (size[1], size[0]):
        return master.astype(np.float64)
    # Area average full-precision scalar samples before any 8-bit map encoding.
    return np.asarray(Image.fromarray(master.astype('float32')).resize(
        size, Image.Resampling.BOX), dtype=np.float64)


def encode(image):
    stream = io.BytesIO()
    image.save(stream, 'WEBP', quality=92, lossless=False, method=6)
    return stream.getvalue()


def decoded_normal(images):
    vector = np.stack([np.asarray(images[role], dtype=float)[:, :, 0]
                       for role in ROLES[2:]], axis=2) / 127.5 - 1
    return vector / np.maximum(np.linalg.norm(vector, axis=2, keepdims=True), 1e-12)


def angles(first, second):
    error = np.degrees(np.arccos(np.clip(np.sum(first * second, axis=2), -1, 1)))
    return {'mean': float(error.mean()), 'p99': float(np.percentile(error, 99)), 'maximum': float(error.max())}


def edges(pixels):
    values = np.asarray(pixels, dtype=float)
    return {'wrapX': float(np.abs(values[:, 0] - values[:, -1]).mean()),
            'wrapY': float(np.abs(values[0] - values[-1]).mean()),
            'interiorX': float(np.abs(np.diff(values, axis=1)).mean()),
            'interiorY': float(np.abs(np.diff(values, axis=0)).mean())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original', type=Path, required=True)
    parser.add_argument('--master', type=Path, required=True)
    parser.add_argument('--height-master', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--strength', type=float, default=.3)
    parser.add_argument('--cap', type=float, default=.5)
    args = parser.parse_args()
    require(math.isfinite(args.strength) and 0 < args.strength <= 4, 'Invalid normal strength')
    require(math.isfinite(args.cap) and 0 < args.cap <= 4, 'Invalid normal cap')
    require(not args.output.exists() and not args.output.is_symlink(), 'Output already exists')
    paths = {'original': args.original.resolve(), 'master': args.master.resolve(),
             'heightMaster': args.height_master.resolve()}
    require(len(set(paths.values())) == 3, 'Three distinct native/master/height inputs required')
    source = {key: bounded_bytes(path) for key, path in paths.items()}
    original, master = rgb_image(source['original']), rgb_image(source['master'], master=True)
    require(original.width >= 8 and original.height >= 8 and original.width % 4 == 0
            and original.height % 4 == 0, 'Native dimensions must be divisible by four and >=8')
    require(master.width >= original.width * 8 and master.height >= original.height * 8,
            'Master must support at least8x native dimensions; never upscale to High')
    require(master.width * original.height == master.height * original.width, 'Master aspect differs from native')
    height_master = scalar_master(source['heightMaster'], master.size)
    records = {key: {'file': str(path), 'sha256': sha(source[key]),
                      'dimensions': list(original.size if key == 'original' else master.size)}
               for key, path in paths.items()}
    manifest = {'schemaVersion': 1, 'defaultTier': 'Mid', 'inputs': records,
                'Low': {'source': 'original', 'unchanged': True, 'sha256': records['original']['sha256']},
                'strength': args.strength, 'cap': args.cap,
                'tools': {'deriverSha256': sha(Path(__file__).read_bytes()),
                          'normalMathSha256': sha(Path(__file__).resolve().parents[1].joinpath('craft_normals.py').read_bytes())},
                'policy': 'Independent direct-master reductions; no compressed tier is an authoring source',
                'tiers': {}}
    # Validation completes before creating any output. A later failure retains
    # partial evidence in this NEW directory; it never overwrites existing work.
    args.output.mkdir(parents=True, exist_ok=False)
    for name, factor in (('Mid', 4), ('High', 8)):
        size = (original.width * factor, original.height * factor)
        rgb = periodic_rgb(master, size)
        height = float_height(height_master, size)
        _, normal = normals_from_height(height, args.strength, args.cap)
        packed = np.round(np.clip(normal * .5 + .5, 0, 1) * 255).astype('uint8')
        raw_images = {'diffuse': rgb, 'height': Image.fromarray(np.round(height * 255).astype('uint8'))}
        raw_images.update({role: Image.fromarray(packed[:, :, c]) for c, role in enumerate(ROLES[2:])})
        outputs, decoded = {}, {}
        for role, image in raw_images.items():
            data = encode(image)
            require(b'VP8 ' in data[:64] and b'VP8L' not in data[:64], 'Expected lossy VP8 map')
            filename = name.lower() + '-' + role + '.webp'
            with (args.output / filename).open('xb') as file:
                file.write(data)
            decoded[role] = Image.open(io.BytesIO(data)).convert('RGB')
            require(decoded[role].size == size, 'Decoded map size changed')
            outputs[role] = {'file': filename, 'sha256': sha(data), 'bytes': len(data),
                             'dimensions': list(size), 'quality': 92, 'method': 6, 'lossless': False,
                             'sourceMaster': 'master' if role == 'diffuse' else 'heightMaster'}
        checks = []
        for divisor in (2, 4):
            dims = (original.width // divisor, original.height // divisor)
            error = np.abs(np.asarray(original.resize(dims, Image.Resampling.BOX), dtype=float)
                           - np.asarray(decoded['diffuse'].resize(dims, Image.Resampling.BOX), dtype=float))
            checks.append({'divisor': divisor, 'dimensions': list(dims),
                           'meanAbsoluteError': float(error.mean()), 'maximum': float(error.max())})
        encoded_normal = decoded_normal(decoded)
        decoded_height = np.asarray(decoded['height'], dtype=float)[:, :, 0] / 255
        _, from_decoded_height = normals_from_height(decoded_height, args.strength, args.cap)
        manifest['tiers'][name] = {'factor': factor, 'dimensions': list(size), 'outputs': outputs,
                                   'distanceChecks': checks, 'normalSource': 'Uncompressed height master reduced directly to tier',
                                   'heightQuantizationCompressionMAE': float(np.abs(decoded_height - height).mean()),
                                   'authoredNormalVsDecodedXYZDegrees': angles(normal, encoded_normal),
                                   'authoredNormalVsDecodedHeightDegrees': angles(normal, from_decoded_height),
                                   'decodedHeightNormalVsDecodedXYZDegrees': angles(from_decoded_height, encoded_normal),
                                   'edges': {role: edges(image) for role, image in decoded.items()},
                                   'qualification': 'Decoded diagnostics only; both-tier art/repeats/relief require review'}
    require(all(path.read_bytes() == source[key] for key, path in paths.items()), 'Source input changed during derivation')
    with (args.output / 'manifest.json').open('x') as file:
        file.write(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'manifest': str(args.output / 'manifest.json'), 'defaultTier': 'Mid',
                      'tierDimensions': {name: row['dimensions'] for name, row in manifest['tiers'].items()}}))


if __name__ == '__main__':
    main()
