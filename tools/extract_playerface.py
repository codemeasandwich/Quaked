"""Extract the owner's complete v4.4.0 face kit without changing PNG bytes."""
import base64
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'player-face-layers-v4.4.0.html'
EXPECTED = '90c759c0051f2fd3dc19d752f24e220a39aece467f13aeff370605e871f073a3'

def main():
    raw = SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError('Face source identity changed; review before extraction')
    text = raw.decode()
    data, _ = json.JSONDecoder().raw_decode(text.split('const DATA = ', 1)[1])
    manifest = data['manifest']
    assert manifest['version'] == '4.4.0' and len(manifest['assets']) == 285
    assert len(manifest['poses']) == 25 and len(data['images']) == 271
    output = ROOT / 'newer/hud/playerface'
    output.mkdir(parents=True, exist_ok=True)
    images = {}
    for name, url in data['images'].items():
        if '/' in name or '\\' in name or name in ('.', '..'):
            raise ValueError('Unsafe embedded image name')
        assert url.startswith('data:image/png;base64,')
        png = base64.b64decode(url.split(',', 1)[1], validate=True)
        assert png.startswith(b'\x89PNG\r\n\x1a\n')
        (output / (name + '.png')).write_bytes(png)
        images[name] = {'sha256': hashlib.sha256(png).hexdigest(), 'bytes': len(png)}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (output / 'SOURCE.json').write_text(json.dumps({
        'source': SOURCE.name, 'sha256': EXPECTED, 'version': '4.4.0',
        'manifestNodes': 285, 'poses': 25, 'images': images,
        'method': 'Exact embedded PNG decoding; no raster edits. Historical unused files retained.'
    }, indent=2) + '\n')
    print('Extracted 285 nodes, 25 poses, 271 unchanged PNG payloads')

if __name__ == '__main__':
    main()
