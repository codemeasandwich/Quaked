"""Quake per-role exports using the unchanged shared texture mathematics.

Colour is VP8 Q92; height/XYZ data is VP8L with exact eight-bit channels.
The legacy deriver and its source-hash-bound consumers remain unchanged.
"""
import argparse
import io
import json
import math
from pathlib import Path
import sys

import numpy as np
import PIL
from PIL import Image, features
import derive_texture_tiers as shared

ROLES = shared.ROLES
DATA_ROLES = (*ROLES[1:], 'mask')


def policy(role):
    shared.require(role in (*ROLES, 'mask'), 'Unknown texture role')
    return ({'lossless': False, 'quality': 92, 'method': 6} if role == 'diffuse'
            else {'lossless': True, 'compressionEffort': 92, 'method': 6})


def codec_chunks(data):
    shared.require(data[:4] == b'RIFF' and data[8:12] == b'WEBP'
                   and int.from_bytes(data[4:8], 'little') + 8 == len(data), 'Malformed WebP RIFF')
    kinds, at = [], 12
    while at < len(data):
        shared.require(at + 8 <= len(data), 'Truncated WebP chunk')
        size = int.from_bytes(data[at+4:at+8], 'little')
        shared.require(at + 8 + size <= len(data), 'Invalid WebP chunk bounds')
        kinds.append(data[at:at+4])
        at += 8 + size + size % 2
    shared.require(at == len(data), 'Invalid WebP padding')
    return kinds


def check_codec(data, role):
    p = policy(role)
    kinds = codec_chunks(data)
    expected, forbidden = (b'VP8L', b'VP8 ') if p['lossless'] else (b'VP8 ', b'VP8L')
    shared.require(expected in kinds and forbidden not in kinds, 'Actual codec differs from role policy')


def encode_role(image, role):
    p = policy(role)
    shared.require(image.mode == ('RGB' if role == 'diffuse' else 'L'), 'Unsupported role pixel layout')
    if role == 'diffuse':
        data = shared.encode(image)
    else:
        stream = io.BytesIO()
        image.save(stream, 'WEBP', quality=92, lossless=True, method=6)
        data = stream.getvalue()
    check_codec(data, role)
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('original', 'master', 'height-master', 'output'):
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--strength', type=float, default=.3)
    parser.add_argument('--cap', type=float, default=.5)
    args = parser.parse_args()
    require, sha = shared.require, shared.sha
    require(math.isfinite(args.strength) and 0 < args.strength <= 4, 'Invalid normal strength')
    require(math.isfinite(args.cap) and 0 < args.cap <= 4, 'Invalid normal cap')
    require(not args.output.exists() and not args.output.is_symlink(), 'Output already exists')
    paths = {'original': args.original.resolve(), 'master': args.master.resolve(),
             'heightMaster': args.height_master.resolve()}
    require(len(set(paths.values())) == 3, 'Three distinct inputs required')
    source = {key: shared.bounded_bytes(path) for key, path in paths.items()}
    with Image.open(io.BytesIO(source['original'])) as native:
        require(native.format == 'PNG' and native.width*native.height <= shared.MAX_PIXELS,
                'Require bounded lossless native PNG')
        require(np.asarray(native.convert('RGBA'))[:, :, 3].min() == 255,
                'Transparent native needs separate qualified semantics')
    original, master = shared.rgb_image(source['original']), shared.rgb_image(source['master'], master=True)
    require(min(original.size) >= 8 and all(v % 4 == 0 for v in original.size), 'Invalid native dimensions')
    require(master.width >= original.width*8 and master.height >= original.height*8,
            'Master must support8x; never upscale')
    require(master.width*original.height == master.height*original.width, 'Master aspect differs')
    height_master = shared.scalar_master(source['heightMaster'], master.size)
    tool_paths = {'adapter': Path(__file__).resolve(), 'sharedDeriver': Path(shared.__file__).resolve(),
                  'normalMath': Path(__file__).resolve().parents[1]/'craft_normals.py'}
    watched = {**{path: source[key] for key, path in paths.items()},
               **{path: shared.bounded_bytes(path) for path in tool_paths.values()}}
    records = {key: {'file': str(path), 'sha256': sha(source[key]),
                    'dimensions': list(original.size if key == 'original' else master.size)}
               for key, path in paths.items()}
    manifest = {'schemaVersion': 2, 'family': 'quake', 'defaultTier': 'Mid', 'inputs': records,
        'Low': {'source': 'original', 'unchanged': True, 'sha256': records['original']['sha256']},
        'strength': args.strength, 'cap': args.cap, 'encodingByRole': {role: policy(role) for role in ROLES},
        'tools': {key: {'file': str(path), 'sha256': sha(watched[path])} for key, path in tool_paths.items()},
        'environment': {'python': sys.version, 'executable': sys.executable, 'Pillow': PIL.__version__,
                        'NumPy': np.__version__, 'WebP': features.version('webp')},
        'policy': 'Both tiers directly from uncompressed masters; scalar reduction precedes quantization and normals',
        'maskAuthoring': 'Not supported by this opaque-surface CLI; encoder role alone qualifies no native mask family',
        'tiers': {}}
    args.output.mkdir(parents=True, exist_ok=False)
    for name, factor in (('Mid', 4), ('High', 8)):
        size = (original.width*factor, original.height*factor)
        height = shared.float_height(height_master, size)
        _, normal = shared.normals_from_height(height, args.strength, args.cap)
        packed = np.round(np.clip(normal*.5+.5, 0, 1)*255).astype('uint8')
        images = {'diffuse': shared.periodic_rgb(master, size),
                  'height': Image.fromarray(np.round(height*255).astype('uint8'))}
        images.update({role: Image.fromarray(packed[:, :, c]) for c, role in enumerate(ROLES[2:])})
        outputs, decoded = {}, {}
        for role, image in images.items():
            data = encode_role(image, role)
            decoded[role] = Image.open(io.BytesIO(data)).convert('RGB')
            require(decoded[role].size == size, 'Decoded size changed')
            intended = np.asarray(image.convert('RGB'))
            observed = np.asarray(decoded[role])
            error = np.abs(observed.astype(int)-intended.astype(int))
            if role != 'diffuse':
                require(np.array_equal(observed, intended), 'Lossless data channel mismatch')
            filename = name.lower()+'-'+role+'.webp'
            with (args.output/filename).open('xb') as file:
                file.write(data)
            outputs[role] = {'file': filename, 'sha256': sha(data), 'bytes': len(data),
                'dimensions': list(size), **policy(role), 'bitDepth': 8, 'pixelLayout': image.mode,
                'intendedPixelSha256': sha(image.tobytes()),
                'decodedPixelSha256': sha(decoded[role].convert(image.mode).tobytes()),
                'integerCompression': {'mismatchCount': int(np.count_nonzero(error)),
                    'meanAbsoluteError': float(error.mean()), 'maximum': int(error.max())},
                'sourceMaster': 'master' if role == 'diffuse' else 'heightMaster'}
        checks = []
        for divisor in (2, 4):
            dims = (original.width//divisor, original.height//divisor)
            error = np.abs(np.asarray(original.resize(dims, Image.Resampling.BOX), dtype=float)
                         - np.asarray(decoded['diffuse'].resize(dims, Image.Resampling.BOX), dtype=float))
            checks.append({'divisor': divisor, 'dimensions': list(dims),
                           'meanAbsoluteError': float(error.mean()), 'maximum': float(error.max())})
        decoded_height = np.asarray(decoded['height'], dtype=float)[:, :, 0]/255
        encoded_normal = shared.decoded_normal(decoded)
        _, height_normal = shared.normals_from_height(decoded_height, args.strength, args.cap)
        manifest['tiers'][name] = {'factor': factor, 'dimensions': list(size), 'outputs': outputs,
            'distanceChecks': checks, 'normalSource': 'Uncompressed reduced scalar before8bit height export',
            'quantization': {'bitDepth': 8, 'rounding': 'NumPy ties-to-even',
                'height': 'round(reduced full-precision scalar *255)',
                'normalXYZ': 'round(clip(normal*.5+.5,0,1)*255)',
                'heightReduction': 'float32 BOX when size differs; full precision otherwise'},
            'heightQuantizationCompressionMAE': float(np.abs(decoded_height-height).mean()),
            'authoredNormalVsDecodedXYZDegrees': shared.angles(normal, encoded_normal),
            'authoredNormalVsDecodedHeightDegrees': shared.angles(normal, height_normal),
            'decodedHeightNormalVsDecodedXYZDegrees': shared.angles(height_normal, encoded_normal),
            'edges': {role: shared.edges(image) for role, image in decoded.items()},
            'qualification': 'Role codec/decoded diagnostics only; actual material/edge/relief acceptance separate'}
    require(all(path.read_bytes() == data for path, data in watched.items()), 'Source/tool changed during export')
    with (args.output/'manifest.json').open('x') as file:
        file.write(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps({'manifest': str(args.output/'manifest.json'), 'defaultTier': 'Mid',
                     'encodingByRole': manifest['encodingByRole']}))


if __name__ == '__main__':
    main()
