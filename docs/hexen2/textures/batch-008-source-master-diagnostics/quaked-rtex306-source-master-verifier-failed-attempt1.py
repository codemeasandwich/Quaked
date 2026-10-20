#!/usr/bin/env python3
"""Independent rtex306 source/master replay, deliberately before tier encoding.

Run /usr/bin/python3 docs/hexen2/textures/batch-008-rtex306-verify-source-master.py
from the Quaked repository. Replays only into a new /private/tmp directory.
PASS scopes custody and reproducibility; it never accepts tonal relief as art.
"""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

import numpy as np
import PIL
from PIL import Image, features

ROOT = Path(__file__).resolve().parents[3]
BATCH = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
IDENTITY = 'c690e6f1907297bdf1d164689621c07b8f70837282afe898c2eed1e013713482'
OUTPUT = ROOT/'docs/hexen2/textures/batch-008-rtex306-source-master-public-proof.json'
watched = {}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    path = Path(path).resolve()
    data = path.read_bytes()
    watched[path] = data
    return data


def witness(path):
    path = Path(path).resolve()
    data = read(path)
    return dict(file=str(path.relative_to(ROOT)) if ROOT in path.parents else str(path),
                sha256=digest(data), bytes=len(data))


def blur_scalar(values, sigma):
    h, w = values.shape
    frequencies = np.fft.rfftfreq(w)[None, :]**2 + np.fft.fftfreq(h)[:, None]**2
    return np.fft.irfft2(np.fft.rfft2(values)*np.exp(-2*np.pi**2*sigma**2*frequencies), s=values.shape)


def unit_variation(values):
    deviation = np.std(values)
    return values/deviation if deviation > 1e-6 else values*0


def ray_extreme(values, radius, maximum):
    result = values.copy()
    operation = np.maximum if maximum else np.minimum
    for offset in range(1, radius+1):
        for axis in (0, 1):
            result = operation(result, operation(np.roll(values, offset, axis), np.roll(values, -offset, axis)))
    return result


def independent_rgb(native, raw):
    # Independent bounded oracle for this unwarped photographic .65/.75 case.
    source = np.asarray(native, dtype=np.float64)
    donor = np.asarray(raw.resize((512, 512), Image.Resampling.LANCZOS), dtype=np.float64)
    reference = source.reshape(32, 2, 32, 2, 3).mean((1, 3))
    coarse = donor.reshape(32, 16, 32, 16, 3).mean((1, 3))
    delta = reference-coarse
    frequencies = np.fft.fftfreq(32)[:, None]**2 + np.fft.fftfreq(32)[None, :]**2
    kernel = np.exp(-2*np.pi*np.pi*.75*.75*frequencies)
    field = np.fft.ifft2(np.fft.fft2(delta, axes=(0, 1))*kernel[:, :, None], axes=(0, 1)).real
    channels = []
    for channel in range(3):
        tiled = np.tile(field[:, :, channel], (3, 3)).astype(np.float32)
        enlarged = Image.fromarray(tiled, 'F').resize((1536, 1536), Image.Resampling.BICUBIC)
        channels.append(np.asarray(enlarged)[512:1024, 512:1024])
    return np.rint(np.clip(donor+np.stack(channels, axis=2)*.65, 0, 255)).astype('uint8')


def independent_float_height(rgb, profile):
    assert profile == dict(bands=[.4, 1, 1.3, 1], groove=.9, bump=.9, glow=0, strength=.3, cap=.5)
    luminance = rgb.astype(float)/255 @ np.array([.299, .587, .114])
    luminance -= blur_scalar(luminance, 80)*.85
    levels = [blur_scalar(luminance, sigma*2) for sigma in (1.2, 3.5, 9, 22, 60)]
    bands = [luminance-levels[0], levels[0]-levels[1], levels[1]-levels[2], levels[2]-levels[3]]
    surface = sum(weight*unit_variation(band) for weight, band in zip(profile['bands'], bands))
    surface += .25*unit_variation(levels[3]-levels[4])*profile['bands'][3]
    groove = ray_extreme(levels[0], 6, True)-levels[0]
    crest = levels[0]-ray_extreme(levels[0], 6, False)
    surface = surface-profile['groove']*1.5*unit_variation(groove)+profile['bump']*unit_variation(crest)
    surface = np.tanh(unit_variation(surface)*.9)
    return ((surface-surface.min())/(surface.max()-surface.min()+1e-6)).astype('float32')


def main():
    package = BATCH/'masters/rtex306/master.json'
    master = json.loads(read(package))
    native_proof_path = ROOT/'docs/hexen2/textures/batch-008-public-source-proof.json'
    plan_path = ROOT/'docs/hexen2/textures/batch-008-material-plan-v2-public-review.json'
    native_proof, plan = (json.loads(read(p)) for p in (native_proof_path, plan_path))
    assert native_proof['verdict'].startswith('PASS') and plan['verdict'].startswith('PASS')
    native_row, = [r for r in native_proof['materials'] if r['id'] == IDENTITY]
    plan_row, = [r for r in plan['materials'] if r['id'] == IDENTITY]
    journal = BATCH/'selection.json'
    item, = [r for r in json.loads(journal.read_bytes())['items'] if r['id'] == IDENTITY]
    assert item['name'] == master['name'] == 'rtex306' and item['edition'] == master['edition'] == 'base'
    assert item['generationCount'] == master['generationCount'] == 1 and item['generationState'] == 'generated-retained'
    assert master['nativeDimensions'] == [64, 64] and master['masterDimensions'] == [512, 512]
    assert master['canonicalMasterFactor'] == 8 and 'masterRevision' not in master
    assert master['registration']['method'] == 'photographic'
    assert master['registration']['colorStrength'] == .65 and master['registration']['fieldSigma'] == .75
    assert master['registration']['comparisonDivisor'] == 2 and master['registration']['factor'] == 8
    assert master['registration']['axis'] is None and master['registration']['verticalLandmarks'] is None
    assert master['registration']['edgeAnchor'] is False and set(master['inputs']) == {'original', 'generated', 'prompt'}
    inputs = {}
    for role, row in master['inputs'].items():
        inputs[role] = read(row['file'])
        assert digest(inputs[role]) == row['sha256']
    assert digest(inputs['original']) == native_row['original']['sha256'] == plan_row['original']['sha256'] == item['originalSha256']
    assert digest(inputs['prompt']) == plan_row['prompt']['sha256'] == item['promptSha256']
    assert digest(inputs['generated']) == item['generatedSha256']
    assert read(item['builtInOutput']) == inputs['generated'], 'Raw built-in output custody mismatch'
    original, raw = (Image.open(io.BytesIO(inputs[k])) for k in ('original', 'generated'))
    assert original.format == raw.format == 'PNG' and original.mode == raw.mode == 'RGB'
    assert original.size == (64, 64) and raw.size == (1254, 1254)
    assert digest(original.convert('RGBA').tobytes()) == native_row['rgbaSha256'] == item['rgbaSha256']
    expected_tools = dict(prepare=ROOT/'tools/texture_sheets/prepare_texture_master.py',
                          finish=ROOT/'tools/texture_sheets/finish_official_texture.py',
                          derive=ROOT/'tools/texture_sheets/derive_texture_tiers.py', craft=ROOT/'tools/craft_normals.py')
    assert set(master['tools']) == set(expected_tools)
    for role, path in expected_tools.items():
        assert Path(master['tools'][role]['file']).resolve() == path
        assert digest(read(path)) == master['tools'][role]['sha256']
    color_path, height_path = package.parent/master['color']['file'], package.parent/master['height']['file']
    color_bytes, height_bytes = read(color_path), read(height_path)
    assert digest(color_bytes) == master['color']['sha256'] and digest(height_bytes) == master['height']['sha256']
    color = Image.open(io.BytesIO(color_bytes))
    assert color.format == 'PNG' and color.mode == 'RGB' and color.size == (512, 512)
    actual_height = np.load(io.BytesIO(height_bytes), allow_pickle=False)
    assert actual_height.shape == (512, 512) and actual_height.dtype == np.dtype('float32')
    assert np.isfinite(actual_height).all() and 0 <= actual_height.min() <= actual_height.max() <= 1
    rgb = independent_rgb(original, raw)
    assert np.array_equal(rgb, np.asarray(color)), 'Independent RGB oracle mismatch'
    encoded = io.BytesIO(); Image.fromarray(rgb, 'RGB').save(encoded, 'PNG')
    assert encoded.getvalue() == color_bytes, 'Independent RGB PNG byte mismatch'
    replay_height = independent_float_height(rgb, master['height']['profile'])
    assert np.array_equal(replay_height, actual_height), 'Independent full-precision height oracle mismatch'
    encoded = io.BytesIO(); np.save(encoded, replay_height, allow_pickle=False)
    assert encoded.getvalue() == height_bytes, 'Independent NPY byte mismatch'
    temporary = Path(tempfile.mkdtemp(prefix='quaked-rtex306-source-master-', dir='/private/tmp'))
    command = ['/usr/bin/python3', str(expected_tools['prepare'])]
    for role, row in master['inputs'].items(): command += ['--'+role, row['file']]
    command += ['--name','rtex306','--edition','base','--profile','carch','--color-strength','.65','--field-sigma','.75','--output',str(temporary/'master')]
    completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    (temporary/'cli-result.json').write_text(json.dumps(dict(argv=command, returncode=completed.returncode, stdout=completed.stdout, stderr=completed.stderr), indent=2)+'\n')
    assert completed.returncode == 0, completed.stderr
    assert (temporary/'master/color.png').read_bytes() == color_bytes
    assert (temporary/'master/height.npy').read_bytes() == height_bytes
    assert json.loads((temporary/'master/master.json').read_bytes()) == master
    centers = dict(centreNW=[22,22],centreNE=[42,22],centreSW=[22,42],centreSE=[42,42],frameN=[32,13],frameE=[51,32])
    witnesses = {}
    for label, (x,y) in centers.items():
        px, py = int((x+.5)*8), int((y+.5)*8)
        values = actual_height[py-2:py+3, px-2:px+3]
        witnesses[label] = dict(nativePixel=[x,y],sampleMasterCentre=[px,py],mean=float(values.mean()),minimum=float(values.min()),maximum=float(values.max()))
    assert all(path.read_bytes() == data for path,data in watched.items()), 'An immutable input changed'
    current, = [r for r in json.loads(journal.read_bytes())['items'] if r['id'] == IDENTITY]
    assert current == item, 'Selected journal row changed during replay'
    proof = dict(schemaVersion=1, verifiedAt=datetime.now(timezone.utc).isoformat(),
        verdict='PASS independent source/master-only exact replay; semantic relief and final art remain unaccepted',
        scope='Native PNG custody against prior public native proof; exact reviewed prompt/raw/tool binding; independent photographic .65/.75 RGB and unquantized craft oracle; actual prepare CLI replay. No tier encoding.',
        materials=[dict(nativeIdentity=IDENTITY,name='rtex306',edition='base',masterPackage=witness(package),
            original=witness(master['inputs']['original']['file']),generated=witness(master['inputs']['generated']['file']),prompt=witness(master['inputs']['prompt']['file']),
            nativeDimensions=[64,64],generatedDimensions=[1254,1254],masterDimensions=[512,512],
            color=witness(color_path),height=witness(height_path),independentRGBPixelsExact=True,independentRGBPNGBytesExact=True,
            independentFloatHeightExact=True,independentNPYBytesExact=True,actualCLIColorHeightPackageExact=True,
            currentHeightSemanticsAccepted=False,finalArtAccepted=False,currentHeightWitnesses=witnesses)],
        semanticPlanReview=dict(verdict='PASS bounded layered-plan interpretation; successor not yet authored or artistically accepted',
            material='Sandstone facing surrounds a recessed grey-green slate centre; interpretation, not historical material identification.',
            sourceMeasuredNativePolygon=[[18,18],[46.5,18],[46.5,47],[18,47]],referenceSize=[64,64],
            measurementBasis='Viewed actual native 64x64, retained raw 1254x1254 and canonical 512x512 RGB. Inner slate/contact seam lies approximately x144..372,y144..376 in master pixels. Rectangle follows the existing inset boundary, wholly interior; no outer edge or new frame is authored.',
            coordinateUncertaintyNativePixels=.25,
            recommendedPlanes=dict(brickHeight=.30,facingHeight=.70,chipFloor=.55,microAmplitude=.035,bevelPixels=.5),
            planeBounds=dict(substrate=[.265,.335],facing=[.515,.735],minimumGuaranteedSeparation=.18),
            bevelSigmaAt512MasterPixels=1.0,
            contract='Use existing prepare_layered_texture_master.py with a source-bound reviewed recipe. RGB stays byte-identical, original full-precision craft is replayed, compose at master then cast once to float32. Recipe name brickRegions denotes the lower slate inset here, not literal brick.',
            requiredChecks=['Confirm mask aligns to actual slate/contact seam before treating plan as authored acceptance.','Check actual centre witnesses below frame and mixed interfaces on successor; mathematical ranges alone do not establish correct material labels.','Inspect opposed-light response and shallow inset perception; scalar .4 separation has no independently accepted runtime physical-depth meaning.','Then derive both tiers directly; compare decoded heights/normals/lights, native-half/quarter BOX color views, repeats and corners.']),
        nativeProof=witness(native_proof_path),reviewedPlan=witness(plan_path),verifier=witness(Path(__file__)),
        actualCLIReplayDirectory=str(temporary),environment=dict(python=sys.version,executable=sys.executable,pillow=PIL.__version__,numpy=np.__version__,libwebp=features.version('webp')),
        inputs=[witness(p) for p in list(watched)],inputsStable=True,
        exclusions=['Prior PAK/four-mip native proof is source-bound and reused, not physically re-audited here.','Current tonal height is replay-correct but NOT semantically accepted.','No final artwork, tier/codec/GPU/runtime/owner/landing/release acceptance.','No recipe, new master, maps, generation, catalog or Git mutation. Only proof/verifier and isolated CLI replay evidence written.'])
    assert not OUTPUT.exists(), 'Preserve existing proof; choose a successor instead'
    OUTPUT.write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps(dict(verdict=proof['verdict'],proof=str(OUTPUT),proofSha256=digest(OUTPUT.read_bytes()),masterPackage=proof['materials'][0]['masterPackage'],cliReplay=str(temporary))))


if __name__ == '__main__':
    main()
