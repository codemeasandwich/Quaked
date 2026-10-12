#!/usr/bin/env python3
"""Resample finished art to exactly 4x its original Quake resolution (owner ruling, 12 October 2026:
"resize the images skins and textures to the 4X so that then becomes the standard ... only one
version"; docs/texture-standard-4x-2026-10-12.md).

    /usr/bin/python3 tools/texture_sheets/standardise_4x.py <plan.json> [--check]

Used only where no generator reproduces the committed file (an upscaler that cannot be re-run, or a
tool that has since changed): where one does (the generated-skin importer, fit_generated_skin.py),
re-run that at factor 4 instead. Each plan entry names a file and its exact target size (4 x the
native texture or skin). The file keeps its format: lossless WebP and PNG stay lossless, lossy WebP is
re-encoded at quality 95 (to keep generational loss small), alpha is kept. Height maps are scalar and
resampled the same way. --check only reports what would change. The plan is updated with each file's
before/after size and SHA-256, and is committed as the record.
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent


def webp_lossless(path):
    """Whether a WebP's image chunk is VP8L, walking the RIFF chunks (ICCP/EXIF may come first)."""
    data = path.read_bytes(); offset = 12
    while offset + 8 <= len(data):
        tag, size = data[offset:offset + 4], int.from_bytes(data[offset + 4:offset + 8], 'little')
        if tag in (b'VP8L', b'VP8 '): return tag == b'VP8L'
        offset += 8 + size + (size & 1)
    raise ValueError('No WebP image chunk in ' + str(path))


def resample(entry, check):
    path = ROOT/entry['file']; before = path.read_bytes(); image = Image.open(path); image.load()
    target = tuple(entry['target'])
    record = dict(file=entry['file'], target=list(target), before=dict(size=list(image.size), sha256=hashlib.sha256(before).hexdigest(), bytes=len(before)))
    if image.size == target:
        record['unchanged'] = True; return record, None
    if image.size[0] < target[0] or image.size[1] < target[1]:
        raise ValueError(f"{entry['file']} is {image.size}, smaller than its 4x target {target}")
    transparent = 'A' in image.getbands() or 'transparency' in image.info
    mode = image.mode if image.mode in ('RGB', 'RGBA', 'L', 'LA') else ('RGBA' if transparent else 'RGB')
    out = image.convert(mode).resize(target, Image.Resampling.LANCZOS)
    if check: return record, None
    # Written beside the original; every file is renamed into place only after all succeed.
    temp = path.with_name(path.name + '.standard-4x'); suffix = path.suffix.lower()
    if suffix == '.png': out.save(temp, 'PNG', optimize=True)
    elif suffix == '.webp':
        if webp_lossless(path): out.save(temp, 'WEBP', lossless=True, method=6)
        else: out.save(temp, 'WEBP', quality=95, method=6)
    else: raise ValueError('Unsupported format '+entry['file'])
    after = temp.read_bytes(); record['after'] = dict(size=list(Image.open(temp).size), sha256=hashlib.sha256(after).hexdigest(), bytes=len(after))
    return record, temp


def main(argv):
    plan_path = Path(argv[0]); check = '--check' in argv; plan = json.loads(plan_path.read_text())
    if plan.get('results') and not check and '--force' not in argv:
        raise SystemExit(f'{plan_path} already records results; re-running would overwrite the record (use --force)')
    done = []
    try:
        for entry in plan['files']: done.append(resample(entry, check))
    except BaseException:
        for _, temp in done:
            if temp: temp.unlink(missing_ok=True)
        raise
    for record, temp in done:
        if temp: temp.replace(ROOT/record['file'])
    plan['results'] = [record for record, _ in done]
    if not check: plan_path.write_text(json.dumps(plan, indent=1)+'\n')
    for r in plan['results']: print(r['file'], r['before']['size'], '->', r['target'], 'unchanged' if r.get('unchanged') else '')


if __name__ == '__main__':
    main(sys.argv[1:])
