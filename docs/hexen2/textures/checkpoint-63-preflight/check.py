"""Read-only current catalog custody preflight. Writes only this folder's result.json.

Does not replay producers, compile/build, alter Git, accept artwork or authorize a gate.
"""
import csv
import datetime
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
CATALOG = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
checks = []
observed = {}
cache = {}


def check(condition, label, detail=None):
    checks.append({'pass': bool(condition), 'check': label, 'detail': detail})


def resolve(path, base=ROOT):
    path = Path(path)
    if path.is_absolute():
        return path
    # Historic package references use repository paths; current ones use siblings.
    if path.parts[0] in {'assets', 'tools', 'docs', 'tests', 'skills'}:
        return ROOT / path
    return base / path


def digest(path):
    path = resolve(path)
    if path not in cache:
        cache[path] = hashlib.sha256(path.read_bytes()).hexdigest()
    observed[str(path)] = cache[path]
    return cache[path]


def sealed(path, expected, label, base=ROOT):
    path = resolve(path, base)
    if not path.is_file():
        check(False, label, {'file': str(path), 'error': 'missing'})
        return False
    actual = digest(path)
    check(actual == expected, label, {'file': str(path), 'expected': expected, 'actual': actual})
    return actual == expected


def load(path):
    path = resolve(path)
    digest(path)
    return json.loads(path.read_bytes())


def nested_seals(value, label):
    """Proof paths are repository-relative or absolute, unlike manifest siblings."""
    if isinstance(value, dict):
        path = value.get('file', value.get('path'))
        expected = value.get('sha256')
        if isinstance(path, str) and isinstance(expected, str) and re.fullmatch('[a-f0-9]{64}', expected):
            sealed(path, expected, label)
        for key, item in value.items():
            if isinstance(key, str) and ('/' in key or key.startswith('assets')) and isinstance(item, str) and re.fullmatch('[a-f0-9]{64}', item):
                sealed(key, item, label + '/' + key)
            elif isinstance(item, (dict, list)):
                nested_seals(item, label + '/' + str(key))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            nested_seals(item, label + '/' + str(index))


def main():
    catalog = load(CATALOG)
    materials = catalog['materials']
    master_paths, map_paths, tier_paths, identities = set(), set(), set(), []
    new_summary = []
    all_review_seals = 0
    for material in materials:
        name = material['name'] + '/' + material['id'][:12]
        identities.append(material['id'])
        master_path = resolve(material['masterPackage'])
        manifest_path = resolve(material['tierReceipt'])
        master_paths.add(str(master_path))
        sealed(master_path, material['masterPackageSha256'], name + '/master')
        sealed(manifest_path, material['tierReceiptSha256'], name + '/tierReceipt')
        sealed(material['Low']['original'], material['Low']['sha256'], name + '/Low')
        master, manifest = load(master_path), load(manifest_path)
        for key, row in master['inputs'].items():
            if isinstance(row, dict):
                sealed(row['file'], row['sha256'], name + '/masterInput')
            else:
                sealed(key, row, name + '/masterInput')
        with Image.open(resolve(material['Low']['original'])) as original:
            dimensions = list(original.size)
        native = material['nativeIdentity']
        if isinstance(native, dict):
            check([native['width'], native['height']] == dimensions and native['id'] == material['id'],
                  name + '/catalogNativeIdentity')
        else:
            check(native == material['id'], name + '/catalogNativeIdentity')
        check(master['nativeDimensions'] == dimensions, name + '/nativeDimensions')
        check(master['generationCount'] == 1, name + '/oneGeneration')
        check(master['masterDimensions'] == [x * 8 for x in dimensions], name + '/master8x')
        for role, sibling in [('color', 'color.png'), ('height', 'height.npy')]:
            row = master[role]
            check(resolve(row['file'], master_path.parent) == master_path.parent / sibling,
                  name + '/canonicalSibling/' + role)
            sealed(row['file'], row['sha256'], name + '/canonicalHash/' + role, master_path.parent)
        color = resolve(master['color']['file'], master_path.parent)
        height = resolve(master['height']['file'], master_path.parent)
        with Image.open(color) as image:
            check(list(image.size) == master['masterDimensions'] and image.mode == 'RGB', name + '/RGBMasterHeader')
        scalar = np.load(height, allow_pickle=False)
        check(scalar.dtype == np.float32 and list(scalar.shape) == master['masterDimensions'][::-1]
              and np.isfinite(scalar).all(), name + '/finiteFloat32Master')
        check(manifest['inputs']['master']['sha256'] == master['color']['sha256'], name + '/receiptRGBBinding')
        check(manifest['inputs']['heightMaster']['sha256'] == master['height']['sha256'], name + '/receiptHeightBinding')
        for row in manifest['inputs'].values():
            sealed(row['file'], row['sha256'], name + '/receiptInput')
        for tier_name, factor in [('Mid', 4), ('High', 8)]:
            tier, receipt_tier = material['tiers'][tier_name], manifest['tiers'][tier_name]
            tier_paths.add(str(manifest_path) + ':' + tier_name)
            expected_size = [x * factor for x in dimensions]
            check(tier['factor'] == factor and tier['dimensions'] == expected_size
                  and receipt_tier['factor'] == factor and receipt_tier['dimensions'] == expected_size,
                  name + '/' + tier_name + '/dimensions')
            check(set(tier['outputs']) == {'diffuse', 'height', 'normalX', 'normalY', 'normalZ'}, name + '/' + tier_name + '/roles')
            for role, row in tier['outputs'].items():
                path = resolve(row['file'])
                map_paths.add(str(path))
                sealed(path, row['sha256'], name + '/' + tier_name + '/' + role)
                receipt_row = receipt_tier['outputs'][role]
                check(resolve(receipt_row['file'], manifest_path.parent) == path
                      and receipt_row['sha256'] == row['sha256'], name + '/' + tier_name + '/' + role + '/receiptBinding')
                check(receipt_row['quality'] == 92 and receipt_row['method'] == 6 and receipt_row['lossless'] is False,
                      name + '/' + tier_name + '/' + role + '/declaredCodec')
                with Image.open(path) as image:
                    check(image.format == 'WEBP' and list(image.size) == expected_size,
                          name + '/' + tier_name + '/' + role + '/encodedHeader')
        for path, expected in material['reviews'].items():
            sealed(path, expected, name + '/catalogReviewSeal')
            all_review_seals += 1
        if material['name'] in {'rtex499', 'rtex053', 'rtex256'}:
            proofs = {}
            for path in material['reviews']:
                proof = load(path)
                verdict = proof.get('verdict', '')
                check(verdict.startswith('PASS'), name + '/' + Path(path).name + '/verdict')
                nested_seals(proof, name + '/' + Path(path).name + '/nestedSeals')
                proofs[Path(path).name] = {'file': path, 'sha256': digest(path), 'verdict': verdict}
            actual = load(next(path for path in material['reviews'] if Path(path).name == 'actual-v1.json'))
            candidate = actual['materials'][0]
            check(candidate['nativeIdentity'] == material['id']
                  and candidate['masterPackage']['sha256'] == material['masterPackageSha256']
                  and candidate['tierReceipt']['sha256'] == material['tierReceiptSha256'], name + '/actualExactCandidate')
            for tier in candidate['tiers']:
                for row in tier['maps']:
                    expected_row = material['tiers'][tier['tier']]['outputs'][row['role']]
                    check(row['file'] == expected_row['file'] and row['sha256'] == expected_row['sha256'], name + '/actualExactMap')
            new_summary.append({'name': material['name'], 'id': material['id'], 'master': material['masterPackage'],
                                'proofs': proofs, 'qualificationLimits': material.get('qualificationLimits')})
    counts = {'reviewedWorldNativeIdentities': len(materials), 'masterPackages': len(master_paths),
              'enhancedTiers': len(tier_paths), 'enhancedMaps': len(map_paths),
              'enhancedTierBindings': 2 * len(materials), 'enhancedMapBindings': 10 * len(materials)}
    check(counts == catalog['counts'], 'currentCatalogCounts', counts)
    check(len(set(identities)) == len(identities), 'nativeIDsUnique')
    progress, campaign = load('docs/hexen2/textures/progress.json'), load('docs/hexen2/textures/campaign-status.json')
    check(campaign['reviewed'] == counts, 'campaignCounts')
    check(progress['reviewedWorldNativeIdentities'] == counts['reviewedWorldNativeIdentities']
          and progress['sourceMasterPackages'] == counts['masterPackages'] and progress['maps'] == counts['enhancedMaps']
          and progress['enhancedMapBindings'] == counts['enhancedMapBindings'], 'progressCounts')
    queue_path = ROOT / 'docs/hexen2/textures/world-queue.csv'
    digest(queue_path)
    queue = list(csv.DictReader(queue_path.open()))
    reviewed = {row['native_id'] for row in queue if row['state'] == 'reviewed'}
    ordinary = [row for row in queue if row['category'] == 'ordinary']
    check(reviewed == set(identities), 'queueReviewedIDsMatchCatalog')
    check(len(ordinary) == 887 and sum(row['state'] != 'reviewed' for row in ordinary) == 824,
          'ordinaryQueue887AndRemaining824')
    registration = load('docs/hexen2/textures/parallel-2026-10-20/registration-499-053-256.json')
    check(registration['catalogSha256'] == digest(CATALOG), 'registrationCatalogSeal')
    nested_seals(registration, 'registration')
    baseline = json.loads(subprocess.check_output(['git', 'show', 'HEAD:' + str(CATALOG.relative_to(ROOT))], cwd=ROOT))
    current_by_id = {row['id']: row for row in materials}
    check(len(baseline['materials']) == 59 and all(current_by_id.get(row['id']) == row for row in baseline['materials']),
          'allExact59CheckpointRowsUnchanged')
    adapter_base = ROOT / 'docs/hexen2/textures/parallel-2026-10-20/stream-05-rtex499/independent'
    adapter_review = load(adapter_base / 'adapter-code-review-v2.json')
    adapter_public = load(adapter_base / 'adapter-public-review-v2.json')
    adapter_tests = load(adapter_base / 'adapter-maintained-tests-v2.json')
    for name, proof in [('code', adapter_review), ('public', adapter_public)]:
        check(proof['verdict'].startswith('PASS'), 'adapter/' + name + '/verdict')
        nested_seals(proof, 'adapter/' + name)
    check(adapter_review['requiredIssuesRemaining'] == [] and adapter_public['requiredFindings'] == [], 'adapter/noRequiredFindings')
    check(adapter_tests['exitCode'] == 0 and adapter_tests['sourceStable'] is True, 'adapter/maintainedTestsRecordedSuccess')
    sealed('tools/texture_sheets/register_layered_texture_boundary.py', adapter_tests['subjectSha256'], 'adapter/testedSubjectCurrent')
    sealed('tests/texture_layered_boundary_test.py', adapter_tests['testSha256'], 'adapter/testSourceCurrent')
    for path in ['skills/quaked-texture-authoring/SKILL.md', 'skills/quaked-texture-authoring/references/repairs-and-verification.md']:
        digest(path)
        text = (ROOT / path).read_text()
        check('register_layered_texture_boundary.py' in text, 'skill/routesCurrentAdapter/' + path)
    repair = (ROOT / 'skills/quaked-texture-authoring/references/repairs-and-verification.md').read_text()
    check('tests/texture_layered_boundary_test.py' in repair and 'retain' in repair.lower(), 'skill/testAndPreservationLink')
    for path in ['AGENTS.md', '/Users/bri/agent.md', '/Users/bri/Furver/TODO/ONBOARDING.md', '.githooks/pre-commit',
                 'tools/distribution/precommit.mjs', 'package.json', 'skills/quaked-texture-authoring/references/workflow.md']:
        digest(path)
    result = {'scope': 'Read-only current63 catalog closure and three new proof/custody seals; not new art/math/native qualification or checkpoint gate',
              'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'counts': counts, 'allCatalogReviewSealsChecked': all_review_seals, 'newMaterials': new_summary,
              'exact59BaselineRowsUnchanged': True, 'adapterCodeProof': adapter_review['verdict'],
              'adapterPlatformLimit': adapter_review['platformLimits'],
              'checks': checks, 'observedFileSHA256': observed,
              'failures': [row for row in checks if not row['pass']]}
    result['inputsStableAtEnd'] = all(hashlib.sha256(Path(path).read_bytes()).hexdigest() == expected for path, expected in observed.items())
    result['verdict'] = 'PASS bounded custody preflight' if not result['failures'] and result['inputsStableAtEnd'] else 'FAIL'
    (OUT / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ['verdict', 'counts', 'allCatalogReviewSealsChecked', 'inputsStableAtEnd', 'failures']}, indent=2))


if __name__ == '__main__':
    main()
