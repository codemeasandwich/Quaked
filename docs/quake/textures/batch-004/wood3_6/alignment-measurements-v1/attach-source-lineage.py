"""Bind the reviewed source derivative while retaining the ordinary CLI receipt."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[6]
HERE = Path(__file__).resolve().parent
BASE = ROOT / 'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-004/wood3_6'
sha = lambda data: hashlib.sha256(data).hexdigest()


def ref(path):
    path = Path(path).resolve()
    path.relative_to(ROOT)
    return {'file': str(path.relative_to(ROOT)), 'sha256': sha(path.read_bytes())}


review_path = HERE / 'independent-composition-review.json'
review = json.loads(review_path.read_bytes())
assert review['verdict'].startswith('PASS exact composition and source ART before master')
lineage_path = BASE / 'source-aligned-v1/source-lineage.json'
assert ref(lineage_path) == review['lineage']
lineage = json.loads(lineage_path.read_bytes())
master_path = BASE / 'master-aligned-v1/master.json'
original_bytes = master_path.read_bytes()
master = json.loads(original_bytes)
assert master['name'] == 'wood3_6' and master['generationCount'] == 1
assert master['inputs']['generated']['sha256'] == lineage['output']['sha256']
assert Path(master['inputs']['generated']['file']).resolve() == (ROOT / lineage['output']['file']).resolve()
assert master['inputs']['landmarks']['sha256'] == lineage['landmarks']['sha256']
assert master['inputs']['original']['sha256'] == lineage['native']['sha256']
assert master['inputs']['prompt']['sha256'] == lineage['prompt']['sha256']
assert master['registration']['axis'] == 'x'
original_path = master_path.with_name('original-prepare-receipt.json')
assert not original_path.exists()
master['generatorPolicy'] = 'One retained imagegen raw, followed by independently reviewed reversible same-source phase registration. inputs.generated is the registered derivative, not the returned raw. No additional model call or separate tier authoring.'
master['sourceComposition'] = ref(lineage_path)
master['sourceCompositionReview'] = ref(review_path)
master['originalGeneratorOutput'] = lineage['raw']
master['generationJournal'] = lineage['journal']
master['originalPrepareReceipt'] = {'file': 'original-prepare-receipt.json', 'sha256': sha(original_bytes)}
master['sourceLineageAttachment'] = ref(__file__)
# Rename preserves the exact producer receipt; the qualified descriptor is new.
assert master_path.read_bytes() == original_bytes
master_path.rename(original_path)
with master_path.open('x') as file:
    json.dump(master, file, indent=2)
    file.write('\n')
assert original_path.read_bytes() == original_bytes
print(json.dumps({'master': ref(master_path), 'originalPrepareReceipt': ref(original_path), 'rawJournalUntouched': True}))
