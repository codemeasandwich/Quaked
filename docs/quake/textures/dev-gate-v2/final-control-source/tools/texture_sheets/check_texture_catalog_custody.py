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
COMPOSITION_FIELDS = {'sourceComposition', 'sourceCompositionReview', 'originalGeneratorOutput', 'generationJournal', 'originalPrepareReceipt', 'sourceLineageAttachment'}
RAW_POLICY = 'One retained generator output; this CLI never calls a generator'
DERIVED_POLICY = 'One retained imagegen raw, followed by independently reviewed reversible same-source phase registration. inputs.generated is the registered derivative, not the returned raw. No additional model call or separate tier authoring.'


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

    def historical_external(value):
        # Record unavailable native/provider witnesses without opening them.
        # This never replaces required sealing of current package inputs.
        if isinstance(value, dict):
            file = value.get('file', value.get('path'))
            expected = value.get('sha256')
            if isinstance(file, str) and isinstance(expected, str) and HEX.fullmatch(expected):
                candidate = Path(file)
                if candidate.is_absolute() and not any(candidate.is_relative_to(origin) for origin in origins):
                    external.add(file)
            for item in value.values():
                historical_external(item)
        elif isinstance(value, list):
            for item in value:
                historical_external(item)

    def composed_source(row, master):
        import numpy as np
        from PIL import Image
        if not COMPOSITION_FIELDS <= set(master) or COMPOSITION_FIELDS & (set(row) | set(master['inputs'])) or master.get('generatorPolicy') != DERIVED_POLICY:
            raise ValueError('Unreviewed composed-source custody schema')
        sibling = path(row['masterPackage']).parent
        for key in COMPOSITION_FIELDS:
            ref = master[key]
            if not isinstance(ref, dict) or set(ref) != {'file', 'sha256'}:
                raise ValueError('Invalid composition attachment')
            seal(ref['file'], ref['sha256'], sibling if key == 'originalPrepareReceipt' else None)
        original_path = path(master['originalPrepareReceipt']['file'], sibling)
        original = json.loads(original_path.read_bytes())
        expected = dict(original, generatorPolicy=DERIVED_POLICY, **{key: master[key] for key in COMPOSITION_FIELDS})
        if original.get('generatorPolicy') != RAW_POLICY or COMPOSITION_FIELDS & set(original) or expected != master:
            raise ValueError('Enriched master differs beyond declared attachment')
        lineage = load(master['sourceComposition']['file'])
        if lineage.get('schemaVersion') != 1 or lineage.get('name') != row['name'] or lineage.get('nativeIdentity') != row['id'] or lineage.get('generatorCalls') != 0 or lineage.get('historicalSourceCalls') != 1:
            raise ValueError('Composition identity/call contract differs')
        for ref in (lineage['plan'], lineage['independentPlanReview'], lineage['composer'], lineage['raw'], lineage['native'], lineage['prompt'], lineage['journal'], lineage['output'], lineage['landmarks']):
            seal(ref['file'], ref['sha256'])
        for key, reference in [('raw', master['originalGeneratorOutput']), ('journal', master['generationJournal']), ('native', master['inputs']['original']), ('prompt', master['inputs']['prompt']), ('output', master['inputs']['generated']), ('landmarks', master['inputs']['landmarks'])]:
            same(lineage[key], reference['file'], reference['sha256'])
        plan = load(lineage['plan']['file']); operation = plan['proposedSameSourceComposition']
        if plan.get('schemaVersion') != 1 or plan.get('name') != row['name'] or not operation.get('operation', '').startswith('Exact integer cyclic row permutation ONLY') or path(operation['output']) != path(lineage['output']['file']):
            raise ValueError('Unknown composition operator/plan')
        same(plan['raw'], lineage['raw']['file'], lineage['raw']['sha256']); same(plan['native'], lineage['native']['file'], lineage['native']['sha256'])
        plan_review = load(lineage['independentPlanReview']['file'])
        if not plan_review.get('verdict', '').startswith('PASS bounded same-source composition + existing measured X registration trial'):
            raise ValueError('Composition plan lacks independent approval')
        same(plan_review['plan'], lineage['plan']['file'], lineage['plan']['sha256'])
        cut, roll = operation['cutX'], operation['rollUpRows']
        with Image.open(path(lineage['raw']['file'])) as raw_image, Image.open(path(lineage['output']['file'])) as derived_image:
            if raw_image.format != 'PNG' or derived_image.format != 'PNG' or raw_image.mode != derived_image.mode or raw_image.mode != 'RGB' or raw_image.size != derived_image.size:
                raise ValueError('Composition requires equal lossless RGB sources')
            width, height = raw_image.size
            if type(cut) is not int or type(roll) is not int or not 0 < cut < width or not 0 < roll < height or lineage['dimensions'] != [width, height]:
                raise ValueError('Composition support/shift differs')
            raw, derived = np.asarray(raw_image), np.asarray(derived_image)
            forward = raw.copy(); forward[:, cut:] = raw[(np.arange(height) + roll) % height, cut:]
            inverse = derived.copy(); inverse[:, cut:] = derived[(np.arange(height) - roll) % height, cut:]
            if not np.array_equal(forward, derived) or not np.array_equal(inverse, raw) or not np.array_equal(raw[:, :cut], derived[:, :cut]):
                raise ValueError('Composition PNG permutation/inverse/outside differs')
        if lineage.get('operation') != f'For x>={cut}, result[y,x]=raw[(y+{roll})%{height},x]; all x<{cut} unchanged' or lineage.get('sourcePixelsCreatedOrInterpolated') != 0 or lineage.get('outsideSupportExact') is not True or lineage.get('fullInverseExact') is not True:
            raise ValueError('Composition declared policy differs')
        landmarks = load(lineage['landmarks']['file'])
        if landmarks != {'axis': 'x', 'points': plan['existingXRegistration']['points']}:
            raise ValueError('Composition landmarks differ from reviewed plan')
        journal = load(master['generationJournal']['file'])
        entries = [value for value in journal['items'] if value.get('id') == row['id'] and value.get('name') == row['name']]
        if len(entries) != 1:
            raise ValueError('Composition journal identity differs')
        entry = entries[0]
        if type(entry.get('generationCount')) is not int or entry['generationCount'] != 1 or entry.get('generationState') != 'generated-retained':
            raise ValueError('Composition journal call count differs')
        for key, reference in [('generated', lineage['raw']), ('original', lineage['native']), ('prompt', lineage['prompt'])]:
            if path(entry[key]) != path(reference['file']) or entry[key + 'Sha256'] != reference['sha256']:
                raise ValueError('Journal must bind raw, not derivative')
        if path(lineage['raw']['file']) == path(lineage['output']['file']):
            raise ValueError('Composition overwrote raw source')
        review = load(master['sourceCompositionReview']['file'])
        if review.get('verdict') != 'PASS exact composition and source ART before master; no final master/tier qualification' or not all(review.get(key) is True for key in ('forwardAllPixelsExact', 'fullInverseExact', f'outside{cut}ColumnsPixelExact', 'noNewOrInterpolatedPixels', 'journalUnchangedRawSourceCount1', 'measuredXLandmarksExact')):
            raise ValueError('Composition source ART/replay is not qualified')
        same(review['lineage'], master['sourceComposition']['file'], master['sourceComposition']['sha256'])
        same(review['raw'], lineage['raw']['file'], lineage['raw']['sha256']); same(review['output'], lineage['output']['file'], lineage['output']['sha256'])
        critical = [(path(row['masterPackage']), row['masterPackageSha256']), (original_path, master['originalPrepareReceipt']['sha256'])]
        critical += [(path(master[key]['file']), master[key]['sha256']) for key in COMPOSITION_FIELDS if key != 'originalPrepareReceipt']
        critical += [(path(value['file']), value['sha256']) for value in master['inputs'].values()]
        return {'critical': critical, 'lineage': lineage, 'originalPrepareReceipt': original_path}

    def quake_pixels(row, master, receipt):
        # Custody checks channel bytes and actual codec; independent numerical
        # replay remains in the sealed public proof, not a second encoder here.
        import io
        import numpy as np
        from PIL import Image
        policy = {role: encoding(role) for role in ROLES}
        if receipt.get('schemaVersion') != 2 or receipt.get('family') != 'quake' or receipt.get('defaultTier') != 'Mid' or receipt.get('encodingByRole') != policy:
            raise ValueError('Wrong Quake receipt policy')
        if set(row['tiers']) != {'Mid', 'High'} or set(receipt['tiers']) != {'Mid', 'High'} or any(set(receipt['tiers'][tier]['outputs']) != set(ROLES) for tier in ('Mid', 'High')):
            raise ValueError('Quake tiers differ')
        composed = composed_source(row, master) if COMPOSITION_FIELDS & (set(row) | set(master) | set(master['inputs'])) else None
        if set(master['inputs']) not in ({'original', 'generated', 'prompt'}, {'original', 'generated', 'prompt', 'landmarks'}) or (not composed and master.get('generatorPolicy') != RAW_POLICY):
            raise ValueError('Unreviewed Quake master source policy')
        if 'landmarks' in master['inputs']:
            landmarks = load(master['inputs']['landmarks']['file'])
            axis, points = landmarks['axis'], np.asarray(landmarks['points'], dtype=float)
            end = master['nativeDimensions'][0 if axis == 'x' else 1]
            if set(landmarks) != {'axis', 'points'} or axis not in ('x', 'y') or points.ndim != 2 or points.shape[1] != 2 or not 2 <= len(points) <= 256 or not np.isfinite(points).all() or not np.array_equal(points[0], [0, 0]) or not np.array_equal(points[-1], [end, end]) or not (np.diff(points, axis=0) > 0).all() or master.get('registration', {}).get('axis') != axis or master['registration'].get('verticalLandmarks') != landmarks['points']:
                raise ValueError('Quake landmark registration differs')
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
        tool_sets = [(master.get('tools', {}), {'prepare': 'tools/texture_sheets/prepare_texture_master.py', 'finish': 'tools/texture_sheets/finish_official_texture.py', 'derive': 'tools/texture_sheets/derive_texture_tiers.py', 'craft': 'tools/craft_normals.py'}), (receipt.get('tools', {}), {'adapter': 'tools/texture_sheets/derive_quake_texture_tiers.py', 'sharedDeriver': 'tools/texture_sheets/derive_texture_tiers.py', 'normalMath': 'tools/craft_normals.py'})]
        for tools, expected in tool_sets:
            if set(tools) != set(expected):
                raise ValueError('Quake producer roles differ')
            for role, value in tools.items():
                if path(value['file']) != path(expected[role]):
                    raise ValueError('Quake producer path differs')
                seal(value['file'], value['sha256'])
        return composed

    def quake_map(role, target, output, dimensions):
        from PIL import Image
        import numpy as np
        # Older accepted catalog rows are compact bindings; the sealed manifest
        # carries complete policy/pixel metadata. Reject contradictory duplicate
        # fields without requiring historical rows to be rewritten.
        if any(target.get(k) != v or (k in output and output[k] != v) for k, v in encoding(role).items()) or output.get('lossless') != encoding(role)['lossless'] or output.get('method') != 6 or target.get('bitDepth') != 8 or target.get('pixelLayout') != ('RGB' if role == 'diffuse' else 'L'):
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
                if digest != target.get('intendedPixelSha256') or digest != target.get('decodedPixelSha256') or any(k in output and output[k] != target.get(k) for k in ('intendedPixelSha256', 'decodedPixelSha256', 'bitDepth', 'pixelLayout')) or target.get('integerCompression') != {'mismatchCount': 0, 'meanAbsoluteError': 0, 'maximum': 0}:
                    raise ValueError('Decoded intended Quake data differs')

    def quake_proofs(row, master, composed=None):
        # Two reviewed evidence structures exist today. Scope/member selection,
        # current package bindings and explicit ART verdicts matter, not names
        # such as "art-review" or a collective PASS shared with held materials.
        source = numeric = preview = art = final = False
        numeric_files, art_files, final_refs, art_numeric_refs = set(), set(), set(), []
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
        def check_candidate(reference):
            refs([reference]); batch = load(reference['file'])
            selected = [v for v in batch['items'] if v['name'] == row['name'] and v['nativeIdentity']['id'] == row['id']]
            if batch.get('schemaVersion') != 3 or batch.get('family') != 'quake' or len(selected) != 1:
                raise ValueError('Quake candidate member differs')
            item = selected[0]
            for key in ('masterPackage', 'tierReceipt'):
                if path(item[key]) != path(row[key]) or item[key+'Sha256'] != row[key+'Sha256']:
                    raise ValueError('Quake candidate package path/hash differs')
            if set(item['tiers']) != {'Mid', 'High'}:
                raise ValueError('Quake candidate tiers differ')
            for name in ('Mid', 'High'):
                if set(item['tiers'][name]['files']) != set(ROLES):
                    raise ValueError('Quake candidate map roles differ')
                for role in ROLES:
                    if path(item['tiers'][name]['files'][role]) != path(expected_maps[name, role]['file']):
                        raise ValueError('Quake candidate map path differs')

        def capture_matrix(coverage, candidate_reference, browser):
            # Reuse the sealed independent sixteen-pose verifier; this checker
            # binds its exact inputs/results, without becoming a render oracle.
            public_ref = coverage['capturePublicProof']; refs([public_ref]); public = load(public_ref['file'])
            flags = ('matrixExactAndUnique', 'M2WebGL2AllReceipts', 'allReceiptsReadyNoShaderErrors', 'allInputHashesCurrent', 'packedXYZHeightBothTiersExact', 'all16PNGFlipRGBAMatchActualFramebufferSHA', 'all16ComparisonPNGsPixelExact', 'reliefFlatFramesDifferAllFourPairs', 'halfQuarterRepeatedGPUIdentityExplicit')
            if public.get('schemaVersion') != 1 or public.get('verdict') != 'PASS_INDEPENDENT_ALL16_SAVED_HARDWARE_POSE_STATE_AND_ARTIFACT_BINDINGS' or not all(public.get(k) is True for k in flags) or any(public['counts'].get(k) != v for k, v in {'poses':16, 'Mid':8, 'High':8, 'uniqueFramebuffers':14, 'sourceInputs':13, 'GPUComparisonReceiptTriples':16}.items()):
                raise ValueError('Incomplete sixteen-pose public capture proof')
            refs([public['captureSet'], public['verifier']]); refs(public['watchedInputs'])
            capture_set = load(public['captureSet']['file'])
            same(capture_set['candidateBatch'], candidate_reference['file'], candidate_reference['sha256'])
            if capture_set.get('schemaVersion') != 1 or capture_set.get('material') != row['name'] or any(capture_set['counts'].get(k) != v for k, v in {'poses':16, 'Mid':8, 'High':8}.items()) or any(coverage.get(k) != v for k,v in {'GPUcomparisonPairs':16, 'PNGfiles':32, 'perDrawReceipts':16}.items()):
                raise ValueError('Incomplete sixteen-pose capture set')
            refs(capture_set['boundInputs']); refs(capture_set['codeAtCapture'])
            if {path(v['file']) for v in capture_set['codeAtCapture']} != {path('tests/quake_texture_tiers_trial.html'), path('tests/quake_texture_tiers_trial.js')}:
                raise ValueError('Sixteen-pose capture producer differs')
            poses = {(tier, *state) for tier in ('Mid', 'High') for state in [('close',1,0,'-1',True),('close',1,0,'1',True),('half',3,0,'-1',True),('quarter',3,0,'-1',True),('close',1,-55,'-1',True),('close',1,-55,'-1',False),('close',1,55,'1',True),('close',1,55,'1',False)]}
            captures, attestations, bindings = capture_set['captures'], public['captures'], coverage['rawGPUBindings']
            if any(len(v) != 16 for v in (captures, attestations, bindings)) or len({v['label'] for v in captures}) != 16 or len({v['label'] for v in attestations}) != 16:
                raise ValueError('Sixteen-pose capture/triple count differs')
            attested = {v['label']:v for v in attestations}; seen = set()
            declared = {(path(v['file']),v['sha256']) for v in coverage['actualCapturesAndDraws']}
            watched = {(path(v['file']),v['sha256']) for v in public['watchedInputs']}
            expected_inputs = {(path(v['file']),v['sha256']) for v in expected_maps.values()} | {(path(candidate_reference['file']),candidate_reference['sha256']), (path(row['tierReceipt']),row['tierReceiptSha256']), (path(row['Low']['original']),row['Low']['sha256'])}
            if {(path(v['file']),v['sha256']) for v in capture_set['boundInputs']} != expected_inputs or not expected_inputs <= watched or len({v['actual']['framebufferRgbaBottomUpSha256'] for v in captures}) != 14:
                raise ValueError('Sixteen-pose current input closure differs')
            for capture in captures:
                actual, files = capture['actual'], capture['files']; refs(files.values())
                pose = tuple(actual[k] for k in ('tier','view','repeat','angleDegrees','light','relief'))
                if pose not in poses or pose in seen or actual['name'] != row['name'] or actual not in browser['draws']:
                    raise ValueError('Sixteen-pose state differs')
                seen.add(pose); attestation = attested[capture['label']]
                if attestation['actualPose'] != list(pose) or attestation['receiptSha256'] != files['receipt']['sha256'] or attestation['framebufferRgbaBottomUpSha256'] != actual['framebufferRgbaBottomUpSha256'] or not all(attestation.get(k) is True for k in ('GPUDecodeExactFrameSHA','comparisonPixelsExact','packedAuthoredXYZHeightExact')):
                    raise ValueError('Sixteen-pose attestation differs')
                receipt = load(files['receipt']['file'])
                if receipt.get('state') != 'ready' or receipt['shaderErrors'] or not receipt['checks'] or not all(v.get('passed') is True for v in receipt['checks']) or receipt['lastDraw'] != actual or actual not in receipt['draws']:
                    raise ValueError('Sixteen-pose draw receipt differs')
                for role in ROLES:
                    value = expected_maps[actual['tier'], role]
                    if receipt['inputs'].get(value['file'],{}).get('sha256') != value['sha256']:
                        raise ValueError('Sixteen-pose input differs')
                matches = [v for v in bindings if path(v['file']) == path(files['gpu']['file']) and v['sha256'] == files['gpu']['sha256'] and v.get('perDraw') == files['receipt']]
                state = {k:actual[k] for k in ('tier','view','repeat','angleDegrees','light','relief')}
                if len(matches) != 1 or state not in matches[0].get('matchingStates',[]) or any((path(v['file']),v['sha256']) not in declared or (path(v['file']),v['sha256']) not in watched for v in files.values()):
                    raise ValueError('Sixteen-pose artifact binding differs')
            if seen != poses:
                raise ValueError('Sixteen-pose matrix incomplete')
        for file in row['reviews']:
            proof = load(file)
            if not isinstance(proof, dict):
                raise ValueError('Invalid Quake proof')
            historical_external(proof)
            if proof.get('verdict') == 'PASS_BOUNDED_ALIGNED_SOURCE_PREPARE_ATTACHMENT_AND_BOTH_TIERS_MATH':
                if not composed:
                    raise ValueError('Aligned numerical proof supplied for ordinary source')
                check_candidate(proof['candidateBatch'])
                prepare, attachment, composition, tiers = proof['publicPrepareReplay'], proof['metadataAttachment'], proof['sourceComposition'], proof['tierProof']
                if prepare.get('returnCode') != 0 or not all(prepare.get(k) is True for k in ('exactRGBPNG', 'exactFloatNPY', 'exactOriginalPrepareReceipt')) or attachment.get('exactReconstruction') is not True or not all(composition.get(k) is True for k in ('exactPNGBytes', 'allForwardPixelsExact', 'outsideCutExact', 'inverseAllPixelsExact', 'landmarksExact')) or composition.get('newSourcePixelsOrInterpolation') != 0 or composition.get('rawCallCount') != 1 or (tiers.get('exactRoleByteExports'), tiers.get('exactLosslessDataMaps'), tiers.get('Q92Method6Diffuse')) != (10, 8, 2):
                    raise ValueError('Aligned source/attachment/export proof is incomplete')
                same(attachment['originalPrepareReceipt'], str(composed['originalPrepareReceipt'].relative_to(root)), master['originalPrepareReceipt']['sha256'])
                needed = set(composed['critical']) | {(path(row['tierReceipt']), row['tierReceiptSha256'])} | {(path(v['file']), v['sha256']) for v in expected_maps.values()}
                found = {(path(v['file']), v['sha256']) for v in proof['watchedInputs']}
                if not needed <= found:
                    raise ValueError('Aligned proof lacks current package/map/source closure')
                for target, digest in needed:
                    seal(str(target.relative_to(root)), digest)
                source = numeric = True; numeric_files.add(file)
            for value in proof.get('items', []):
                if value.get('name') != row['name'] or value.get('nativeIdentity', value.get('nativeId')) != row['id']:
                    continue
                if 'newManifest' in value and 'nativeProofs' in value:
                    if composed:
                        raise ValueError('Composed source needs aligned source/numerical proof')
                    package(value, 'newManifest'); same(value['original'], row['Low']['original'], row['Low']['sha256'])
                    if not value['nativeProofs']:
                        raise ValueError('Missing sealed native/source evidence')
                    refs(value['nativeProofs'])
                    for native_proof in value['nativeProofs']:
                        historical_external(load(native_proof['file']))
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
                    if composed:
                        raise ValueError('Composed source needs aligned source/numerical proof')
                    same(value['masterPackage'], row['masterPackage'], row['masterPackageSha256'])
                    if not value.get('verdict', '').startswith('PASS exact initial source/master replay'):
                        raise ValueError('Source/master proof is not accepted')
                    refs(value['sourceInputs']); source = True
                if value.get('exactDirectMasterRoleExports') == 10 and value.get('losslessExactDataMaps') == 8 and value.get('colourQ92Method6') == 2:
                    if composed:
                        raise ValueError('Composed source needs aligned source/numerical proof')
                    package(value)
                    if proof.get('verdict') != 'PASS independent actual candidate public checks':
                        raise ValueError('Public numerical proof is not accepted')
                    numeric = True; numeric_files.add(file)
            if proof.get('name') == row['name'] and proof.get('nativeIdentity') == row['id'] and 'browserCoverage' in proof:
                package(proof)
                gates = proof.get('artFindings', {})
                known_art = proof.get('verdict', '').startswith('PASS independent ART within currentMid/High') or (composed is not None and proof.get('verdict') == 'PASS bounded repaired source, both-tier offline ART and sixteen-pose finite hardware material review')
                if not known_art or not all(isinstance(gates.get(k), str) and gates[k].startswith('PASS') for k in ('realMaterial', 'nativeFormsColourScale', 'repeatGeometry', 'physicalDepth', 'glancingBrowser')):
                    raise ValueError('Independent material ART is not accepted')
                check_candidate(proof['candidateBatch'])
                numeric_reference = proof['publicNumericalProof']
                if isinstance(numeric_reference.get('file'), dict):
                    numeric_reference = numeric_reference['file']
                refs([numeric_reference]); art_numeric_refs.append(numeric_reference)
                coverage = proof['browserCoverage']; snapshot = coverage['receiptSnapshot']; seal(snapshot['file'], snapshot['sha256']); browser = load(snapshot['file'])
                if browser['shaderErrors'] or not browser['draws'] or browser.get('state') != 'ready' or not browser.get('checks') or not all(v.get('passed') is True for v in browser['checks']):
                    raise ValueError('Browser proof not ready')
                for value in expected_maps.values():
                    actual = browser['inputs'].get(value['file'])
                    if not actual or actual['sha256'] != value['sha256']:
                        raise ValueError('Browser proof does not bind current maps')
                refs(coverage['actualCapturesAndDraws'])
                from PIL import Image
                draws = [v for v in browser['draws'] if v['name'] == row['name']]
                if {v['tier'] for v in draws} != {'Mid', 'High'}:
                    raise ValueError('Browser proof lacks both material tiers')
                for name in ('Mid', 'High'):
                    channels = [Image.open(path(expected_maps[name, role]['file'])).convert('L') for role in ('normalX', 'normalY', 'normalZ', 'height')]
                    packed = hashlib.sha256(Image.merge('RGBA', channels).tobytes()).hexdigest()
                    frame_size = max(row['tiers'][name]['dimensions'])
                    if any(v['normalPackedSha256'] != packed or v['framebuffer'] != [frame_size, frame_size] for v in draws if v['tier'] == name):
                        raise ValueError('Browser authored channel payload differs')
                draw_hashes = {v['framebufferRgbaBottomUpSha256'] for v in draws}
                if not coverage['rawGPUBindings']:
                    raise ValueError('Missing actual framebuffer proof')
                for value in coverage['rawGPUBindings']:
                    seal(value['file'], value['sha256'])
                    with Image.open(path(value['file'])) as image:
                        digest = hashlib.sha256(image.convert('RGBA').transpose(Image.Transpose.FLIP_TOP_BOTTOM).tobytes()).hexdigest()
                        dimensions = list(image.size)
                    if digest != value['actualBottomUpRGBApixelSha256'] or digest not in draw_hashes or not any(v['framebuffer'] == dimensions and v['framebufferRgbaBottomUpSha256'] == digest for v in draws):
                        raise ValueError('GPU capture differs from framebuffer proof')
                if composed:
                    capture_matrix(coverage, proof['candidateBatch'], browser)
                preview = art = True; art_files.add(file)
            if proof.get('name') == row['name'] and proof.get('nativeIdentity') == row['id'] and proof.get('verdict') == 'PASS within authoring and finite hardware web-material scope':
                refs(proof['evidence']); final_refs.update(v['file'] for v in proof['evidence'])
        for reference in art_numeric_refs:
            if not any(path(file) == path(reference['file']) and row['reviews'][file] == reference['sha256'] for file in numeric_files):
                raise ValueError('ART public numerical proof differs from accepted current proof')
        if art_files & final_refs and numeric_files & final_refs:
            final = True
        if not all((source, numeric, preview, art, final)):
            raise ValueError('Changed Quake registration lacks typed source, current preview/export, independent ART or final proof')

    catalog = load(QUAKE_CATALOG if family == 'quake' else CATALOG)
    if family == 'quake' and (catalog.get('schemaVersion') != 1 or catalog.get('family') != 'quake' or catalog.get('pathsBase') != 'repository' or catalog.get('defaultTier') != 'Mid' or catalog.get('standard', {}).get('encodingByRole') != {role: encoding(role) for role in ROLES}):
        raise ValueError('Wrong Quake catalog policy')
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
        composed = quake_pixels(row, master, receipt) if family == 'quake' else None
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
                quake_proofs(row, master, composed)
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
