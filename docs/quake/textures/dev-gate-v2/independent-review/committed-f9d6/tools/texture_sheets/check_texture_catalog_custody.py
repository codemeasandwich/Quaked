"""Check staged Hexen catalog custody without reading unstaged repository bytes.

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
HEX = re.compile(r'^[a-f0-9]{64}$')


def verify(root, source_root, baseline):
    root, source_root = Path(root).resolve(), Path(source_root).absolute()
    hashes, external, observed = {}, set(), {}

    def path(value, sibling=None):
        value = Path(value)
        if value.is_absolute():
            try:
                value = value.relative_to(source_root)
            except ValueError:
                return None
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

    catalog = load(CATALOG)
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
        required = {row['masterPackageSha256'], row['tierReceiptSha256']}
        for name, factor in [('Mid', 4), ('High', 8)]:
            tier, recorded = row['tiers'][name], receipt['tiers'][name]
            if tier['factor'] != factor or tier['dimensions'] != [factor*x for x in master['nativeDimensions']] or tier['dimensions'] != recorded['dimensions'] or recorded['factor'] != factor or set(tier['outputs']) != {'diffuse', 'height', 'normalX', 'normalY', 'normalZ'}:
                raise ValueError('Tier role/dimension mismatch')
            tiers.add(tier_file + ':' + name)
            for role, output in tier['outputs'].items():
                seal(output['file'], output['sha256'])
                target = recorded['outputs'][role]
                if path(target['file'], path(tier_file).parent) != path(output['file']) or target['sha256'] != output['sha256'] or (target['quality'], target['method'], target['lossless']) != (92, 6, False):
                    raise ValueError('Map/codec binding differs')
                maps.add(output['file'])
                required.add(output['sha256'])
        for file, expected in row['reviews'].items():
            seal(file, expected)
        if old.get(row['id']) != row:
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
    counts = dict(reviewedWorldNativeIdentities=len(ids), masterPackages=len(masters), enhancedTiers=len(tiers), enhancedMaps=len(maps), enhancedTierBindings=2*len(rows), enhancedMapBindings=10*len(rows))
    if counts != catalog['counts']:
        raise ValueError('Catalog counts differ from physical references')
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
    return dict(verdict='PASS snapshot catalog custody', counts=counts, changedRegistrations=changed, checkedFiles=len(observed), externalHistoricalWitnesses=sorted(external), limits='Sealed custody only; no new artwork/native/provider/runtime/release acceptance')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--source-root', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(Path.cwd(), args.source_root, json.loads(args.baseline.read_bytes())), indent=2))
