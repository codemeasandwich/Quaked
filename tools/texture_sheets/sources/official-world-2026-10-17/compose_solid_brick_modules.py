"""Reuse the correct wide photograph at the native narrow texture's module scale.

The complete narrow original equals wide columns [0:32] + [96:128]. Apply that
same operation at 4x, then reuse colour-only quiet-edge balancing at the internal
join. Side blocks are protected, no brick or jamb is squeezed, and no missing
brick cavity is painted. Inputs and failed earlier photographs remain intact.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('source-root', 'wide-native', 'narrow-native', 'wide-photo',
                 'wide-output', 'narrow-output', 'receipt'):
        p.add_argument('--'+name, type=Path, required=True)
    a = p.parse_args()
    assert all(not path.exists() for path in (a.wide_output, a.narrow_output, a.receipt))
    wide_native = np.asarray(Image.open(a.wide_native).convert('RGBA'))
    narrow_native = np.asarray(Image.open(a.narrow_native).convert('RGBA'))
    assert wide_native.shape == (64, 128, 4) and narrow_native.shape == (64, 64, 4)
    native_crop = np.concatenate((wide_native[:, :32], wide_native[:, 96:]), axis=1)
    assert np.array_equal(native_crop, narrow_native), 'Source must prove exact module relation'
    tool = a.source_root/'tools/texture_sheets/sources/official-world-2026-10-12/finish_quiet_edges.py'
    spec = importlib.util.spec_from_file_location('quiet_brick_join', tool)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    photo = Image.open(a.wide_photo).convert('RGB')
    assert photo.width == 2*photo.height
    wide = np.asarray(photo.resize((512, 256), Image.Resampling.LANCZOS))
    narrow = np.concatenate((wide[:, :128], wide[:, 384:]), axis=1)
    fixed, mask, clipping = module.finish(np.roll(narrow, -128, axis=1), 'x')
    fixed = np.roll(fixed, 128, axis=1)
    mask = np.roll(mask, 128, axis=1)
    assert np.array_equal(fixed[:, :96], narrow[:, :96])
    assert np.array_equal(fixed[:, 160:], narrow[:, 160:])
    assert not np.any(mask[:, :96]) and not np.any(mask[:, 160:])
    Image.fromarray(wide).save(a.wide_output)
    Image.fromarray(fixed).save(a.narrow_output)
    sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    record = {
        'qualification': 'Source-proven photographic module reuse; art, distance, edge and layered-relief acceptance remain separate.',
        'producer': str(Path(__file__)), 'producerSha256': sha(Path(__file__)),
        'wideNative': str(a.wide_native), 'wideNativeSha256': sha(a.wide_native),
        'narrowNative': str(a.narrow_native), 'narrowNativeSha256': sha(a.narrow_native),
        'nativeCropColumns': [[0, 32], [96, 128]], 'nativeDifferentRgbaPixels': 0,
        'photo': str(a.wide_photo), 'photoSha256': sha(a.wide_photo),
        'photoDimensions': list(photo.size), 'normalization': 'One uniform Lanczos resize to 512x256',
        'runtimeCropColumns': [[0, 128], [384, 512]],
        'compositionSpatialResampling': False, 'brickModuleRuntime': [64, 32],
        'internalJoinRuntimeX': 128, 'internalQuietEdgeAxes': 'x',
        'quietEdgeTool': str(tool), 'quietEdgeToolSha256': sha(tool),
        'internalColourCorrectionColumns': [96, 160], 'clippingFraction': clipping,
        'protectedFirstAndLastColumns': 96, 'protectedPixelsByteExact': True,
        'wideOutput': str(a.wide_output), 'wideOutputSha256': sha(a.wide_output),
        'narrowOutput': str(a.narrow_output), 'narrowOutputSha256': sha(a.narrow_output),
    }
    a.receipt.write_text(json.dumps(record, indent=2)+'\n')
    print(json.dumps({'wide': str(a.wide_output), 'narrow': str(a.narrow_output),
                      'nativeDifferentRgbaPixels': 0, 'protectedPixelsByteExact': True}))


if __name__ == '__main__':
    main()
