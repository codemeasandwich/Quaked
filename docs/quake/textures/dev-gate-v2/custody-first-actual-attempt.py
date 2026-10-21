"""Check staged Hexen or Quake catalog custody, reading only snapshot bytes.

Canonical absolute repository references are remapped to this snapshot. External
native/provider witnesses remain historical claims inside sealed receipts, never
an excuse to read live assets. No generation, encoding, artwork or release gate.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import re

CATALOG = 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
QUAKE_CATALOG = 'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/catalog.json'
HEX = re.compile(r'^[a-f0-9]{64}$')
ROLES = ('diffuse', 'height', 'normalX', 'normalY', 'normalZ')


def encoding(role):
    return ({'lossless': False, 'quality': 92, 'method': 6} if role == 'diffuse'
            else {'lossless': True, 'compressionEffort': 92, 'method': 6})


def verify(root, source_root, baseline, family='hexen2', reference_roots=()):
    if family not in ('hexen2', 'quake'):
        raise ValueError('Unknown catalog family')
    root, source_root = Path(root).resolve(), Path(source_root).absolute()
    origins = [source_root, *map(Path, reference_roots)]
    for i, origin in enumerate(origins):
        if not origin.is_absolute() or '..' in origin.parts:
            raise ValueError('Invalid reference root')
        if any(origin.is_relative_to(other) or other.is_relative_to(origin) for other in origins[:i]):
            raise ValueError('Overlapping reference roots')
    hashes, external, observed = {}, set(), {}

    def path(value, sibling=None):
        value = Path(value)
        if value.is_absolute():
            matches = [value.relative_to(origin) for origin in origins if value.is_relative_to(origin)]
            if not matches:
                return None
            value = matches[0]
            if not value.parts or value.parts[0] not in {'assets', 'docs', 'tools', 'tests', 'skills'}:
                raise ValueError('Not a repository reference: ' + str(value))
        if not value.parts:
            raise ValueError('Empty reference')
        elif value.parts[0] not in {'assets', 'docs', 'tools', 'tests', 'skills'} and sibling:
            value = sibling.relative_to(root) / value
        target = root / value
        if not target.resolve().is_relative_to(root):
            raise ValueError('Reference escapes snapshot: ' + str(value))
        for item in [target, *target.parents]:
            if item == root:
                break
            if item.is_symlink():
                raise ValueError('Symlink reference: ' + str(value))
        return target

    def seal(file, expected, sibling=None, required=True):
        target = path(file, sibling)
        if target is None:
            if required:
                raise ValueError('Required input is external: ' + str(file))
            external.add(str(file))
            return
        if not isinstance(expected, str) or not HEX.fullmatch(expected):
            raise ValueError('Invalid SHA256 for ' + str(file))
        if target not in hashes:
            hashes[target] = hashlib.sha256(target.read_bytes()).hexdigest()
        if hashes[target] != expected:
            raise ValueError('Snapshot hash mismatch: ' + str(file))
        observed[str(target.relative_to(root))] = expected

    def load(file):
        target = path(file)
        return json.loads(target.read_bytes())

    def proof_seals(value, found):
        if isinstance(value, dict):
            file, expected = value.get('file', value.get('path')), value.get('sha256')
            if isinstance(file, str) and isinstance(expected, str) and HEX.fullmatch(expected):
                seal(file, expected, required=False)
                found.add(expected)
            for key, item in value.items():
                if '/' in key and isinstance(item, str) and HEX.fullmatch(item):
                    seal(key, item, required=False)
                    found.add(item)
                elif isinstance(item, (dict, list)):
                    proof_seals(item, found)
        elif isinstance(value, list):
            for item in value:
                proof_seals(item, found)

    def same(reference, file, expected):
        if not isinstance(reference, dict) or reference.get('sha256') != expected or path(reference.get('file', '')) != path(file):
            raise ValueError('Proof reference differs: ' + str(file))
        seal(reference['file'], expected)

    def refs(values):
        for value in values:
            seal(value['file'], value['sha256'])

    def quake_pixels(row, master, receipt):
        # Custody checks channel bytes and actual codec; independent numerical
        # replay remains in the sealed public proof, not a second encoder here.
        import io
        import numpy as np
        from PIL import Image
        policy = {role: encoding(role) for role in ROLES}
        if catalog.get('schemaVersion') != 1 or catalog.get('family') != 'quake' or catalog.get('pathsBase') != 'repository' or catalog.get('defaultTier') != 'Mid' or catalog['standard'].get('encodingByRole') != policy:
            raise ValueError('Wrong Quake catalog policy')
        if receipt.get('schemaVersion') != 2 or receipt.get('family') != 'quake' or receipt.get('defaultTier') != 'Mid' or receipt.get('encodingByRole') != policy:
            raise ValueError('Wrong Quake receipt policy')
        if 'sourceComposition' in row or 'originalPrepareReceipt' in row or 'sourceComposition' in master['inputs']:
            raise ValueError('Unreviewed composed-source custody schema')
        if set(master['inputs']) != {'original', 'generated', 'prompt'} or master.get('generatorPolicy') != 'One retained generator output; this CLI never calls a generator':
            raise ValueError('Unreviewed Quake master source policy')
        protected = load('tests/fixtures/quake_codec_protected_producers.json')
        pins = protected['protectedSourceBindings']
        expected_producers = {'derive_texture_tiers.py', 'craft_normals.py', 'prepare_texture_master.py', 'finish_official_texture.py', 'register_texture_boundary.py', 'prepare_layered_texture_master.py', 'build_texture_batch_review.py'}
        if protected.get('schemaVersion') != 1 or len(pins) != 7 or {Path(v['file']).name for v in pins} != expected_producers:
            raise ValueError('Wrong protected producer fixture')
        refs(pins)
        native = row['nativeIdentity']
        if native.get('id') != row['id'] or not HEX.fullmatch(row['id']) or [native['width'], native['height']] != master['nativeDimensions'] or native.get('materialFlags') != [0]:
            raise ValueError('Quake native identity differs')
        with Image.open(path(row['Low']['original'])) as image:
            rgba = np.asarray(image.convert('RGBA'))
            if image.format != 'PNG' or list(image.size) != master['nativeDimensions'] or rgba[:, :, 3].min() != 255 or hashlib.sha256(rgba.tobytes()).hexdigest() != native['rgbaSha256']:
                raise ValueError('Quake native PNG binding differs')
        with Image.open(path(master['color']['file'], path(row['masterPackage']).parent)) as image:
            if image.format != 'PNG' or image.mode != 'RGB' or list(image.size) != master['masterDimensions']:
                raise ValueError('Quake RGB master differs')
        scalar = np.load(io.BytesIO(path(master['height']['file'], path(row['masterPackage']).parent).read_bytes()), allow_pickle=False)
        if scalar.dtype.kind != 'f' or scalar.shape != tuple(reversed(master['masterDimensions'])) or not np.isfinite(scalar).all() or scalar.min() < 0 or scalar.max() > 1 or master['height'].get('quantizedTo8Bit') is not False:
            raise ValueError('Quake full-float master differs')
        for key, expected_target in [('original', path(row['Low']['original'])), ('master', path(master['color']['file'], path(row['masterPackage']).parent)), ('heightMaster', path(master['height']['file'], path(row['masterPackage']).parent))]:
            if path(receipt['inputs'][key]['file']) != expected_target:
                raise ValueError('Quake receipt input path differs')
        if path(master['inputs']['original']['file']) != path(row['Low']['original']) or master['inputs']['original']['sha256'] != row['Low']['sha256']:
            raise ValueError('Quake master native binding differs')
        for tools in (master.get('tools', {}), receipt.get('tools', {})):
            for value in tools.values():
                seal(value['file'], value['sha256'])

    def quake_map(role, target, output, dimensions):
        from PIL import Image
        import numpy as np
        if any(target.get(k) != v or output.get(k) != v for k, v in encoding(role).items()) or target.get('bitDepth') != 8 or target.get('pixelLayout') != ('RGB' if role == 'diffuse' else 'L'):
            raise ValueError('Quake role encoding/layout differs')
        data = path(output['file']).read_bytes()
        if data[:4] != b'RIFF' or data[8:12] != b'WEBP' or int.from_bytes(data[4:8], 'little') + 8 != len(data):
            raise ValueError('Malformed WebP RIFF')
        at, chunks = 12, []
        while at < len(data):
            if at + 8 > len(data):
                raise ValueError('Truncated WebP')
            size = int.from_bytes(data[at+4:at+8], 'little')
            chunks.append(data[at:at+4]); at += 8 + size + size % 2
        expected, forbidden = (b'VP8 ', b'VP8L') if role == 'diffuse' else (b'VP8L', b'VP8 ')
        if at != len(data) or chunks.count(expected) != 1 or forbidden in chunks:
            raise ValueError('Actual WebP codec differs from role')
        with Image.open(path(output['file'])) as image:
            pixels = np.asarray(image.convert('RGBA'))
            if image.format != 'WEBP' or list(image.size) != dimensions or pixels[:, :, 3].min() != 255:
                raise ValueError('Decoded Quake map dimensions/alpha differ')
            if role != 'diffuse':
                if not np.array_equal(pixels[:, :, 0], pixels[:, :, 1]) or not np.array_equal(pixels[:, :, 0], pixels[:, :, 2]):
                    raise ValueError('Decoded Quake data is not scalar')
                digest = hashlib.sha256(pixels[:, :, 0].tobytes()).hexdigest()
                if digest != target.get('intendedPixelSha256') or digest != target.get('decodedPixelSha256') or any(output.get(k) != target.get(k) for k in ('intendedPixelSha256', 'decodedPixelSha256', 'bitDepth', 'pixelLayout')) or target.get('integerCompression') != {'mismatchCount': 0, 'meanAbsoluteError': 0, 'maximum': 0}:
                    raise ValueError('Decoded intended Quake data differs')

    def quake_proofs(row):
        # Two reviewed evidence structures exist today. Scope/member selection,
        # current package bindings and explicit ART verdicts matter, not names
        # such as "art-review" or a collective PASS shared with held materials.
        source = numeric = preview = art = final = False
        numeric_files, art_files, final_refs = set(), set(), set()
        expected_maps = {(name, role): value for name, tier in row['tiers'].items() for role, value in tier['outputs'].items()}
        def package(value, tier_key='tierReceipt'):
            same(value['masterPackage'], row['masterPackage'], row['masterPackageSha256'])
            same(value[tier_key], row['tierReceipt'], row['tierReceiptSha256'])
        def maps(values, name):
            if set(values) != set(ROLES):
                raise ValueError('Proof map roles differ')
            for role, value in values.items():
                expected = expected_maps[name, role]
                same(value, expected['file'], expected['sha256'])
        for file in row['reviews']:
            proof = load(file)
            if not isinstance(proof, dict):
                raise ValueError('Invalid Quake proof')
            for value in proof.get('items', []):
                if value.get('name') != row['name'] or value.get('nativeIdentity', value.get('nativeId')) != row['id']:
                    continue
                if 'newManifest' in value and 'nativeProofs' in value:
                    package(value, 'newManifest'); same(value['original'], row['Low']['original'], row['Low']['sha256'])
                    refs(value['nativeProofs'])
                    if not proof.get('verdict', '').startswith('PASS bounded five-package actual codec/source custody'):
                        raise ValueError('Unaccepted codec/source proof')
                    for name in ('Mid', 'High'):
                        values = {v['role']: v for v in value['tiers'][name]['outputs']}
                        maps(values, name)
                        if not all(v.get('exactIndependentEncoderBytes') is True for v in values.values()):
                            raise ValueError('Missing independent export proof')
                    source = numeric = True; numeric_files.add(file)
                elif 'tierReceipt' in value and isinstance(value.get('tiers'), list):
                    package(value)
                    if not proof.get('verdict', '').startswith('PASS bounded actual schema3 review'):
                        raise ValueError('Unaccepted preview proof')
                    if {v['name'] for v in value['tiers']} != {'Mid', 'High'}:
                        raise ValueError('Preview tiers differ')
                    for tier in value['tiers']:
                        maps({v['role']: v for v in tier['actualMapBindings']}, tier['name'])
                        for sheet in tier['sheets']:
                            seal(sheet['file'], sheet['sha256'])
                            if sheet['independentPanelCanvas']['everyPixelOutsideEmptyTailExact'] is not True:
                                raise ValueError('Unbound preview material pixels')
                    preview = True
                elif 'carryForward' in value:
                    if proof.get('verdict') != 'PASS_AFFECTED_OFFLINE_ART_TWO_STONES_BOTH_TIERS' or value.get('verdict') != 'PASS_AFFECTED_OFFLINE_ART_BOTH_TIERS':
                        raise ValueError('Material ART is not accepted')
                    carry = value['carryForward']; same(carry['inputs']['masterReceipt'], row['masterPackage'], row['masterPackageSha256']); same(carry['newTierReceipt'], row['tierReceipt'], row['tierReceiptSha256'])
                    if {v['tier'] for v in value['tiers']} != {'Mid', 'High'}:
                        raise ValueError('ART tiers differ')
                    for tier in value['tiers']:
                        if tier['verdict'] != 'PASS_AFFECTED_OFFLINE_ART':
                            raise ValueError('Tier ART is held')
                        maps(tier['actualDecodedMapInputs'], tier['tier'])
                    art = final = True; art_files.add(file)
            for value in proof.get('materials', []):
                if value.get('name') != row['name'] or value.get('nativeIdentity') != row['id']:
                    continue
                if value.get('sourceMasterOnly') is True:
                    same(value['masterPackage'], row['masterPackage'], row['masterPackageSha256'])
                    if not value.get('verdict', '').startswith('PASS exact initial source/master replay'):
                        raise ValueError('Source/master proof is not accepted')
                    refs(value['sourceInputs']); source = True
                if value.get('exactDirectMasterRoleExports') == 10 and value.get('losslessExactDataMaps') == 8 and value.get('colourQ92Method6') == 2:
                    package(value)
                    if proof.get('verdict') != 'PASS independent actual candidate public checks':
                        raise ValueError('Public numerical proof is not accepted')
                    numeric = True; numeric_files.add(file)
            if proof.get('name') == row['name'] and proof.get('nativeIdentity') == row['id'] and 'browserCoverage' in proof:
                package(proof)
                if not proof.get('verdict', '').startswith('PASS independent ART within currentMid/High') or not proof.get('artFindings'):
                    raise ValueError('Independent material ART is not accepted')
                candidate = proof['candidateBatch']; seal(candidate['file'], candidate['sha256'])
                batch = load(candidate['file'])
                selected = [v for v in batch['items'] if v['name'] == row['name'] and v['nativeIdentity']['id'] == row['id']]
                if len(selected) != 1 or batch.get('schemaVersion') != 3 or batch.get('family') != 'quake':
                    raise ValueError('ART candidate member differs')
                selected = selected[0]
                if selected['masterPackageSha256'] != row['masterPackageSha256'] or selected['tierReceiptSha256'] != row['tierReceiptSha256']:
                    raise ValueError('ART candidate package differs')
                for name in ('Mid', 'High'):
                    for role in ROLES:
                        if path(selected['tiers'][name]['files'][role]) != path(expected_maps[name, role]['file']):
                            raise ValueError('ART candidate map path differs')
                coverage = proof['browserCoverage']; snapshot = coverage['receiptSnapshot']; seal(snapshot['file'], snapshot['sha256']); browser = load(snapshot['file'])
                if browser['shaderErrors'] or not browser['draws'] or browser.get('state') != 'ready':
                    raise ValueError('Browser proof not ready')
                for value in expected_maps.values():
                    actual = browser['inputs'].get(value['file'])
                    if not actual or actual['sha256'] != value['sha256']:
                        raise ValueError('Browser proof does not bind current maps')
                refs(coverage['actualCapturesAndDraws'])
                from PIL import Image
                draw_hashes = {v['framebufferRgbaBottomUpSha256'] for v in browser['draws']}
                if not coverage['rawGPUBindings']:
                    raise ValueError('Missing actual framebuffer proof')
                for value in coverage['rawGPUBindings']:
                    seal(value['file'], value['sha256'])
                    with Image.open(path(value['file'])) as image:
                        digest = hashlib.sha256(image.convert('RGBA').transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes()).hexdigest()
                    if digest != value['actualBottomUpRGBApixelSha256'] or digest not in draw_hashes:
                        raise ValueError('GPU capture differs from framebuffer proof')
                preview = art = True; art_files.add(file)
            if proof.get('name') == row['name'] and proof.get('nativeIdentity') == row['id'] and proof.get('verdict') == 'PASS within authoring and finite hardware web-material scope':
                refs(proof['evidence']); final_refs.update(v['file'] for v in proof['evidence'])
        if art_files & final_refs and numeric_files & final_refs:
            final = True
        if not all((source, numeric, preview, art, final)):
            raise ValueError('Changed Quake registration lacks typed source, current preview/export, independent ART or final proof')

    catalog = load(QUAKE_CATALOG if family == 'quake' else CATALOG)
    rows, old = catalog['materials'], {row['id']: row for row in baseline['materials']}
    ids, masters, tiers, maps, changed = set(), set(), set(), set(), []
    for row in rows:
        if row['id'] in ids:
            raise ValueError('Duplicate native ID')
        ids.add(row['id'])
        master_file, tier_file = row['masterPackage'], row['tierReceipt']
        seal(master_file, row['masterPackageSha256'])
        seal(tier_file, row['tierReceiptSha256'])
        seal(row['Low']['original'], row['Low']['sha256'])
        master, receipt = load(master_file), load(tier_file)
        masters.add(master_file)
        if master['generationCount'] != 1 or master['canonicalMasterFactor'] != 8 or master['masterDimensions'] != [8*x for x in master['nativeDimensions']] or row['Low']['unchanged'] is not True:
            raise ValueError('Single-source master/Low contract differs')
        for key, value in master['inputs'].items():
            seal(value['file'], value['sha256']) if isinstance(value, dict) else seal(key, value)
        for role in ('color', 'height'):
            seal(master[role]['file'], master[role]['sha256'], path(master_file).parent)
        if receipt['inputs']['master']['sha256'] != master['color']['sha256'] or receipt['inputs']['heightMaster']['sha256'] != master['height']['sha256']:
            raise ValueError('Master/receipt binding differs')
        for value in receipt['inputs'].values():
            seal(value['file'], value['sha256'])
        if family == 'quake':
            quake_pixels(row, master, receipt)
        required = {row['masterPackageSha256'], row['tierReceiptSha256']}
        for name, factor in [('Mid', 4), ('High', 8)]:
            tier, recorded = row['tiers'][name], receipt['tiers'][name]
            if tier['factor'] != factor or tier['dimensions'] != [factor*x for x in master['nativeDimensions']] or tier['dimensions'] != recorded['dimensions'] or recorded['factor'] != factor or set(tier['outputs']) != {'diffuse', 'height', 'normalX', 'normalY', 'normalZ'}:
                raise ValueError('Tier role/dimension mismatch')
            tiers.add(tier_file + ':' + name)
            for role, output in tier['outputs'].items():
                seal(output['file'], output['sha256'])
                target = recorded['outputs'][role]
                if path(target['file'], path(tier_file).parent) != path(output['file']) or target['sha256'] != output['sha256']:
                    raise ValueError('Map/codec binding differs')
                if family == 'quake':
                    quake_map(role, target, output, tier['dimensions'])
                elif (target['quality'], target['method'], target['lossless']) != (92, 6, False):
                    raise ValueError('Map/codec binding differs')
                maps.add(output['file'])
                required.add(output['sha256'])
        for file, expected in row['reviews'].items():
            seal(file, expected)
        if family == 'quake':
            for file, expected in row.get('historicalReviews', {}).items():
                seal(file, expected)
            if 'historicalTierReceipt' in row:
                seal(row['historicalTierReceipt']['file'], row['historicalTierReceipt']['sha256'])
        if old.get(row['id']) != row:
            if family == 'quake':
                quake_proofs(row)
                changed.append(row['id'])
                continue
            found = set()
            if not all(any(marker in Path(file).name for file in row['reviews']) for marker in ('actual-', 'preview-', 'art-review', 'final-custody')):
                raise ValueError('Changed registration needs actual, preview, ART and custody receipts')
            for file in row['reviews']:
                proof = load(file)
                if not proof.get('verdict', '').startswith('PASS'):
                    raise ValueError('Changed registration lacks PASS proof: ' + file)
                proof_seals(proof, found)
            if not required <= found:
                raise ValueError('Changed registration proofs do not bind all current package/map bytes')
            changed.append(row['id'])
    if not set(old) <= ids:
        raise ValueError('Previously registered native identities removed')
    counts = dict(masterPackages=len(masters), enhancedTiers=len(tiers), enhancedMaps=len(maps), enhancedTierBindings=2*len(rows), enhancedMapBindings=10*len(rows))
    counts['reviewedNativeIdentities' if family == 'quake' else 'reviewedWorldNativeIdentities'] = len(ids)
    if counts != catalog['counts']:
        raise ValueError('Catalog counts differ from physical references')
    if family == 'quake':
        progress = load('docs/quake/textures/progress.json')
        qualified = progress.get('authoringQualified', {})
        if progress['qualified8xMaterials'] != len(ids) or progress['qualifiedMasterPackages'] != len(masters) or progress['qualifiedPhysicalMaps'] != len(maps) or (qualified and (qualified['materials'], qualified['enhancedTiers'], qualified['physicalMaps']) != (len(ids), len(tiers), len(maps))):
            raise ValueError('Quake progress counts differ')
    else:
        campaign = load('docs/hexen2/textures/campaign-status.json')
        progress = load('docs/hexen2/textures/progress.json')
        if campaign['reviewed'] != counts or progress['reviewedWorldNativeIdentities'] != len(ids) or progress['sourceMasterPackages'] != len(masters) or progress['maps'] != len(maps) or progress['enhancedMapBindings'] != 10*len(rows):
            raise ValueError('Campaign/progress counts differ')
        queue = list(csv.DictReader(path('docs/hexen2/textures/world-queue.csv').open()))
        if {row['native_id'] for row in queue if row['state'] == 'reviewed'} != ids:
            raise ValueError('Queue reviewed IDs differ from catalog')
    # Re-observe every input after checks; a concurrent reread cannot replace a witness.
    if not all(hashlib.sha256((root/file).read_bytes()).hexdigest() == expected for file, expected in observed.items()):
        raise ValueError('Snapshot input changed during custody check')
    return dict(verdict='PASS snapshot catalog custody', family=family, counts=counts, changedRegistrations=changed, checkedFiles=len(observed), externalHistoricalWitnesses=sorted(external), limits='Sealed custody only; no new artwork/native/provider/runtime/release acceptance')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--reference-root', type=Path, action='append', default=[])
    parser.add_argument('--family', choices=['hexen2', 'quake'], default='hexen2')
    args = parser.parse_args()
    print(json.dumps(verify(Path.cwd(), args.source_root, json.loads(args.baseline.read_bytes()), args.family, args.reference_root), indent=2))
