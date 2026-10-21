#!/usr/bin/env python3
"""Bounded actual candidate replay, independent of producer entry points.

Reconstruct photographic registration from documented field math, scalar stone
relief from documented bands/grooves, and use maintained public fixture oracles
for periodic colour, float BOX, cyclic normals and Q92 encoding. Never authors
production outputs, accepts art, or modifies the source/master/maps.
"""
import datetime
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys

import numpy as np
import PIL
from PIL import Image, features

ROOT = Path(__file__).resolve().parents[5]
EVIDENCE = Path(__file__).resolve().parent
ASSET = ROOT / 'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/parallel-020/rock3_2'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
spec = importlib.util.spec_from_file_location('fixture_oracles', ROOT / 'tests/hexen2_texture_tiers_test.py')
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


def lossless_bytes(image):
    b = io.BytesIO()
    image.save(b, 'PNG')
    return b.getvalue()


def field_blur(a, sigma):
    h, w, _ = a.shape
    frequency = np.fft.fftfreq(w)[None, :] ** 2 + np.fft.fftfreq(h)[:, None] ** 2
    kernel = np.exp(-2 * np.pi * np.pi * sigma * sigma * frequency)
    return np.fft.ifft2(np.fft.fft2(a, axes=(0, 1)) * kernel[:, :, None], axes=(0, 1)).real


def photographic_rgb(native, generated):
    source = np.asarray(native, dtype=np.float64)
    donor = np.asarray(generated.resize((512, 512), Image.Resampling.LANCZOS), dtype=np.float64)
    target = source.reshape(32, 2, 32, 2, 3).mean((1, 3))
    coarse = donor.reshape(32, 16, 32, 16, 3).mean((1, 3))
    delta = field_blur(target - coarse, .75)
    channels = []
    for c in range(3):
        a = np.tile(delta[:, :, c], (3, 3)).astype(np.float32)
        resized = np.asarray(Image.fromarray(a, 'F').resize((1536, 1536), Image.Resampling.BICUBIC))
        channels.append(resized[512:1024, 512:1024])
    result = donor + np.stack(channels, 2) * .65
    return Image.fromarray(np.rint(np.clip(result, 0, 255)).astype('uint8'))


def scalar_relief(rgb):
    # Explicitly reconstruct the selected stone profile rather than consulting
    # the producer receipt for labels/weights or calling craft().
    def blur(a, sigma):
        h, w = a.shape
        f = np.fft.rfftfreq(w)[None, :] ** 2 + np.fft.fftfreq(h)[:, None] ** 2
        return np.fft.irfft2(np.fft.rfft2(a) * np.exp(-2 * np.pi ** 2 * sigma ** 2 * f), s=a.shape)
    def norm(a):
        s = np.std(a)
        return a / s if s > 1e-6 else a * 0
    def extreme(a, radius, fn):
        value = a.copy()
        for offset in range(1, radius + 1):
            for axis in (0, 1):
                value = fn(value, fn(np.roll(a, offset, axis), np.roll(a, -offset, axis)))
        return value
    rgb = np.asarray(rgb, dtype=float) / 255
    light = rgb @ np.array([.299, .587, .114])
    k = 2.0
    light = light - blur(light, 40 * k) * .85
    g = [blur(light, s * k) for s in (1.2, 3.5, 9, 22, 60)]
    bands = [light - g[0], g[0] - g[1], g[1] - g[2], g[2] - g[3]]
    height = sum(weight * norm(band) for weight, band in zip((.35, 1, 1.4, 1), bands))
    height = height + .25 * norm(g[3] - g[4]) * 1
    groove = extreme(g[0], 6, np.maximum) - g[0]
    top = g[0] - extreme(g[0], 6, np.minimum)
    height = height - 1.4 * 1.5 * norm(groove) + .7 * 1.0 * norm(top)
    height = np.tanh(norm(height) * .9)
    return ((height - height.min()) / (height.max() - height.min() + 1e-6)).astype('float32')


def main():
    row = next(x for x in json.loads((ROOT / 'docs/quake/textures/parallel-020/workstreams.json').read_text())['streams'] if x['texture'] == 'rock3_2')
    master = json.loads((ASSET / 'master/master.json').read_text())
    tier_manifest = json.loads((ASSET / 'tiers/manifest.json').read_text())
    native_proof = json.loads((EVIDENCE / 'native-selected-source-proof.json').read_text())
    source_rows = {}
    for role, field in [('original', 'original'), ('generated', 'generated'), ('prompt', 'prompt')]:
        path = ROOT / row[field]
        digest = sha(path)
        assert digest == row[field + 'Sha256'] == master['inputs'][role]['sha256']
        assert Path(master['inputs'][role]['file']).resolve() == path.resolve()
        source_rows[role] = {'file': row[field], 'sha256': digest}
    native = Image.open(ROOT / row['original']).convert('RGB')
    raw = Image.open(ROOT / row['generated'])
    assert raw.mode == 'RGB' and raw.size == (1254, 1254) and native.size == (64, 64)
    assert native_proof['nativeIdentity'] == '70fdd089e566c1cf477b4d1a484c1ab8aea7b29952ec1c01d289b7da7af60f23'
    assert native_proof['identity']['materialFlags'] == [0]
    assert hashlib.sha256(native.convert('RGBA').tobytes()).hexdigest() == native_proof['identity']['rgbaSha256']
    assert master['registration']['colorStrength'] == .65 and master['registration']['fieldSigma'] == .75
    assert master['registration']['axis'] is None and master['registration']['verticalLandmarks'] is None
    expected = photographic_rgb(native, raw)
    color_path = ASSET / 'master/color.png'
    assert expected.tobytes() == Image.open(color_path).tobytes()
    assert lossless_bytes(expected) == color_path.read_bytes()
    height = np.load(ASSET / 'master/height.npy', allow_pickle=False)
    expected_h = scalar_relief(expected)
    np.testing.assert_array_equal(height, expected_h)
    stream = io.BytesIO()
    np.save(stream, expected_h, allow_pickle=False)
    assert stream.getvalue() == (ASSET / 'master/height.npy').read_bytes()
    assert height.dtype == np.float32 and np.isfinite(height).all() and 0 <= height.min() <= height.max() <= 1
    assert np.any(np.abs(height * 255 - np.round(height * 255)) > 1e-5)
    maps, distances, semantic = [], [], []
    probes = json.loads((EVIDENCE / 'pre-tier-semantic-review.json').read_text())['probes']
    for tier, factor in [('Mid', 4), ('High', 8)]:
        size = (64 * factor, 64 * factor)
        row_t = tier_manifest['tiers'][tier]
        assert row_t['dimensions'] == list(size) and row_t['factor'] == factor
        reduced = oracle.float_box(height, size)
        f = 512 // size[0]
        np.testing.assert_allclose(reduced, height.astype('float64').reshape(size[1], f, size[0], f).mean((1, 3)), rtol=0, atol=8e-8)
        n = oracle.cyclic_normals(reduced)
        nb = np.round(np.clip(n * .5 + .5, 0, 1) * 255).astype('uint8')
        payloads = {'diffuse': oracle.q92(oracle.periodic_rgb(expected, size)), 'height': oracle.q92(Image.fromarray(np.round(reduced * 255).astype('uint8')))}
        for c, role in enumerate(('normalX', 'normalY', 'normalZ')):
            payloads[role] = oracle.q92(Image.fromarray(nb[:, :, c]))
        for role, payload in payloads.items():
            rec = row_t['outputs'][role]
            path = ASSET / 'tiers' / rec['file']
            assert payload == path.read_bytes(), tier + '/' + role
            assert sha(path) == rec['sha256'] and len(payload) == rec['bytes']
            assert (rec['quality'], rec['method'], rec['lossless']) == (92, 6, False)
            assert rec['sourceMaster'] == ('master' if role == 'diffuse' else 'heightMaster')
            oracle.vp8_only(payload)
            maps.append({'tier': tier, 'role': role, 'file': str(path.relative_to(ROOT)), 'sha256': sha(path), 'exactQ92FixtureOracleReplay': True})
        diffuse = Image.open(io.BytesIO(payloads['diffuse'])).convert('RGB')
        for rec in row_t['distanceChecks']:
            divisor = rec['divisor']
            size_d = (64 // divisor, 64 // divisor)
            error = np.abs(np.asarray(native.resize(size_d, Image.Resampling.BOX), dtype=float) - np.asarray(diffuse.resize(size_d, Image.Resampling.BOX), dtype=float))
            assert error.mean() == rec['meanAbsoluteError'] and error.max() == rec['maximum']
            distances.append({'tier': tier, **rec, 'sameBOXBothInputs': True})
        decoded_h = np.asarray(Image.open(io.BytesIO(payloads['height'])).convert('L'), dtype=float) / 255
        for probe in probes:
            jx, jy = [int(v / f) for v in probe['jointXY']]
            fx, fy = [int(v / f) for v in probe['faceXY']]
            radius = 1 if f == 2 else 2
            j = float(decoded_h[jy-radius:jy+radius+1, jx-radius:jx+radius+1].mean())
            face = float(decoded_h[fy-radius:fy+radius+1, fx-radius:fx+radius+1].mean())
            assert face > j, 'Decoded fracture sample is above face'
            semantic.append({'tier': tier, 'jointXY': [jx, jy], 'faceXY': [fx, fy], 'faceMinusJoint': face-j, 'radius': radius})
    report = {'schemaVersion': 1, 'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'verdict': 'PASS bounded source/master/codec/math replay only; root art review pending', 'verifier': {'file': str(Path(__file__).relative_to(ROOT)), 'sha256': sha(__file__)}, 'fixtureOracles': {'file': 'tests/hexen2_texture_tiers_test.py', 'sha256': sha(ROOT / 'tests/hexen2_texture_tiers_test.py')}, 'nativeIdentity': native_proof['nativeIdentity'], 'sources': source_rows, 'masterPackage': {'file': str((ASSET / 'master/master.json').relative_to(ROOT)), 'sha256': sha(ASSET / 'master/master.json')}, 'master': {'rgbExactPNGBytes': True, 'heightExactNPYBytes': True, 'heightDtype': str(height.dtype), 'heightUniqueSamples': int(np.unique(height).size)}, 'maps': maps, 'distances': distances, 'decodedPhysicalSamples': semantic, 'environment': {'python': sys.version, 'executable': sys.executable, 'pillow': PIL.__version__, 'numpy': np.__version__, 'libwebp': features.version('webp')}, 'limits': ['Candidate worker verifier is independent of producer entry points; root independent review remains required.', 'No provider service-side generation count audit, new call, runtime binding, owner acceptance or release.', 'Native proof scope is current effective baseline locator occurrences, not complete native-family enumeration.', 'Numeric replay cannot overrule an art/tiling/semantic finding.']}
    out = EVIDENCE / 'actual-replay.json'
    assert not out.exists()
    out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'report': str(out.relative_to(ROOT)), 'sha256': sha(out), 'exactMaps': len(maps), 'distanceComparisons': len(distances), 'decodedSemanticProbes': len(semantic)}))


if __name__ == '__main__':
    main()
