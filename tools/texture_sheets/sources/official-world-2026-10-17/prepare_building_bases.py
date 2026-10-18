"""Reuse reviewed photographic material for source-specific building variants.

The independent native-reference plan supports the concrete family reuse. The
quiet painted-steel donor replaces rejected granular drafts; its two courses
are repeated at half height to establish the original four-course layout.
Source colour fitting, edge review and relief qualification remain separate.
"""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-root', type=Path, required=True)
    args = p.parse_args()
    folder = Path(__file__).parent
    recipes = [
        ('TF_Conc_07', 'newer/textures/candidates-2026-10-13/TF_Conc_07b-photographic-seam-v2-4x.png',
         '61c801ddc59c8c34c04959d607e4cf0ec3960726d4624efb13a45ee7b0e29090', False),
        ('wmet4_4_JM', 'newer/textures/candidates-2026-10-17/TF_MetWall2_02-photographic-seam-v2-4x.png',
         'de895a408ac43b6a8803b2285d4aa8ceecbad24528184b527591c4c7dbf0f2c8', True),
    ]
    for name, source, expected, repeat in recipes:
        path = args.source_root / source
        data = path.read_bytes()
        assert hashlib.sha256(data).hexdigest() == expected
        image = Image.open(path).convert('RGB')
        assert image.size == (512, 512)
        target = folder / (name + '-approved-base-v1.png')
        record = target.with_suffix('.json')
        assert not target.exists() and not record.exists()
        if repeat:
            course_pair = image.resize((512, 256), Image.Resampling.LANCZOS)
            image = Image.new('RGB', (512, 512))
            image.paste(course_pair, (0, 0))
            image.paste(course_pair, (0, 256))
        image.save(target)
        record.write_text(json.dumps(dict(source=source, sourceSha256=expected,
            output=target.name, outputSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
            dimensions=[512, 512], repeatedVerticalPairs=2 if repeat else 1,
            verticalPairDimensions=[512, 256] if repeat else [512, 512],
            recipe='approved photographic base; separate original-specific colour fit',
            generator='reused built-in GPT photographic source',
            toolSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            qualification='Unregistered authoring input. Not an exact native alias or accepted runtime material.'), indent=2)+'\n')
        assert path.read_bytes() == data
        print(target.name)


if __name__ == '__main__':
    main()
