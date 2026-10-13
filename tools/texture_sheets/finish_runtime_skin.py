"""Encode a reviewed fitted skin for the owner's WebP92 runtime-image rule.

The original image-generation sources stay untouched. This runs only when the
recipe explicitly requests runtimeEncoding; older recipes retain their exact path.
Normals are baked separately from the decoded encoded maps, not from these masters.
"""
from pathlib import Path
from io import BytesIO
import hashlib
import json
import os
import array
import sys
from PIL import Image

ENCODING = {'format': 'webp', 'quality': 92}
def digest(data):
    return hashlib.sha256(data).hexdigest()

def encoded(path, size):
    original = path.read_bytes()
    with Image.open(BytesIO(original)) as image:
        if list(image.size) != size:
            raise ValueError('Runtime image size differs: ' + str(path))
        mode = 'RGBA' if 'A' in image.getbands() else 'RGB'
        buffer = BytesIO()
        image.convert(mode).save(buffer, 'WEBP', quality=92, lossless=False, method=6)
    result = buffer.getvalue()
    with Image.open(BytesIO(result)) as decoded:
        if list(decoded.size) != size:
            raise ValueError('Encoded runtime image size differs')
        rgba = decoded.convert('RGBA').tobytes()
    return result, dict(masterSha256=digest(original), sha256=digest(result),
                       pillowDecodedRgbaSha256=digest(rgba), bytes=len(result))

def effective_height_receipt(encoded_bytes, policy):
    """Authoring receipt only; runtime and baker share EnemyHeightScalars."""
    if policy is None:
        return {}
    with Image.open(BytesIO(encoded_bytes)) as image:
        width, height = image.size
        rgba = image.convert('RGBA').tobytes()
    if policy.get('policy') != 'armagon-flash-v1' or policy.get('modelSha256') != 'e827535032c8e83609fedf07c9989c504e7eaa6772ce0d5cf73788e00980f151' or [policy.get('width'), policy.get('height')] != [width, height]:
        raise ValueError('Invalid authored Armagon flash policy')
    previous = -1
    for y, start, end in policy['spans']:
        if not all(type(n) is int for n in [y, start, end]) or not (0 <= y < height and 0 <= start < end <= width) or y * width + start < previous:
            raise ValueError('Invalid authored Armagon flash span')
        previous = y * width + end
    scalar = array.array('f', (rgba[i] / 255 for i in range(0, len(rgba), 4)))
    for y, start, end in policy['spans']:
        scalar[y * width + start:y * width + end] = array.array('f', [1.0]) * (end - start)
    if sys.byteorder != 'little':
        scalar.byteswap()
    return dict(pillowEffectiveScalarSha256=digest(scalar.tobytes()), scalarEncoding='float32-le',
                heightPolicySha256=digest(json.dumps(policy, sort_keys=True, separators=(',', ':')).encode()))

def finish_runtime_skin(output, key, recipe):
    request = recipe.get('runtimeEncoding')
    if request is None:
        return
    if request != ENCODING:
        raise ValueError('Runtime skin encoding must be explicit WebP quality92')
    folder = output / key / recipe.get('outputVariant', 'custom')
    record = folder / 'SOURCE.json'
    report = json.loads(record.read_text())
    pending = []
    receipts = {}
    for source, target in [('diffuse.png', 'diffuse.webp'), ('height.webp', 'height.webp')]:
        path = folder / source
        if digest(path.read_bytes()) != report['files'][source]:
            raise ValueError('Fitted master changed before encoding: ' + source)
        data, receipt = encoded(path, report['dimensions'])
        if source == 'height.webp':
            receipt.update(effective_height_receipt(data, report.get('flatHeight', {}).get('runtime')))
        pending.append((folder / target, data))
        receipts[target] = receipt
    native = report.get('nativeHeight')
    if native:
        path = output / native['file']
        path.resolve().relative_to(output.resolve())
        if digest(path.read_bytes()) != native['sha256']:
            raise ValueError('Native height master changed before encoding')
        data, receipt = encoded(path, native['dimensions'])
        receipt.update(effective_height_receipt(data, (native.get('flatHeight') or {}).get('runtime')))
        pending.append((path, data))
        native['sha256'] = receipt['sha256']
        native['encoding'] = dict(format='webp', quality=92, lossless=False, **receipt)
    # Validate every encoded image before replacing any runtime destination.
    temporaries = []
    try:
        for target, data in pending:
            temp = target.with_name(target.name + '.q92-tmp')
            if temp.exists():
                raise ValueError('Unresolved previous encode output: ' + str(temp))
            temp.write_bytes(data)
            temporaries.append((temp, target))
        for temp, target in temporaries:
            os.replace(temp, target)
        report['files'] = {name: row['sha256'] for name, row in receipts.items()}
        report['runtimeEncoding'] = dict(format='webp', quality=92, lossless=False,
                                         maps=receipts, authoringSourceUnchanged=True)
        record.write_text(json.dumps(report, indent=2) + '\n')
        (folder / 'diffuse.png').unlink()
    finally:
        for temp, _ in temporaries:
            if temp.exists():
                temp.unlink()
