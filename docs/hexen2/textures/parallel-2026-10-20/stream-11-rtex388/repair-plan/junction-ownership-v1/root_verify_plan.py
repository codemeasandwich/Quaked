"""Independent static geometry/budget review; never runs DP or authors pixels."""
from pathlib import Path
from fractions import Fraction as F
import datetime
import hashlib
import json

D = Path(__file__).parent
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
plan = json.loads((D/'plan-receipt.json').read_text())
corr = json.loads((D/'correct-owner-corridors-plan-v1.json').read_text())
result = D.parent/'diagnostic-v2/runs/actual-v1/result.json'
assert sha(result) == 'c73841bfaa46f963cff1afce06e877baabbd8656eba96cabd2d142f7ca70877e'
r = json.loads(result.read_text())['candidates'][2]
assert sha(D/'PLAN.md') == plan['plan']['sha256']
for file, digest in plan['evidence'].items():
    assert sha(file) == digest
signed = lambda x: x-512 if x >= 256 else x
cross = lambda a,b: a[0]*b[1]-a[1]*b[0]

def intersect(a,b,c,d):
    u = (b[0]-a[0], b[1]-a[1]); v = (d[0]-c[0], d[1]-c[1])
    den = cross(u,v)
    if not den:
        return None
    z = (c[0]-a[0], c[1]-a[1])
    t,q = F(cross(z,v),den), F(cross(z,u),den)
    return (F(a[0])+t*u[0], F(a[1])+t*u[1]) if 0<=t<=1 and 0<=q<=1 else None

found = {}
for sx,sy in ((1,1),(-1,1),(1,-1),(-1,-1)):
    h = r['caps']['capY'+('+' if sy>0 else '-')]['suggestions'][0]
    v = r['caps']['capX'+('+' if sx>0 else '-')]['suggestions'][0]
    h = h['positiveHalf' if sx>0 else 'negativeHalf']['lookups']
    v = v['positiveHalf' if sy>0 else 'negativeHalf']['lookups']
    h = [tuple(signed(x) for x in row[:2]) for row in h]
    v = [tuple(signed(x) for x in row[:2]) for row in v]
    hits = {p for a,b in zip(h,h[1:]) for c,d in zip(v,v[1:]) if (p:=intersect(a,b,c,d)) is not None}
    key = ('p' if sx>0 else 'm')+('p' if sy>0 else 'm')
    expected = {tuple(F(x) for x in plan['junctions'][key])}
    if key == 'mm':
        expected.add((F(-36),F(-35)))
    assert hits == expected, (key,hits)
    found[key] = [[float(x),float(y)] for x,y in sorted(hits)]
assert len(corr['branches']) == 8
for b in corr['branches']:
    kind = b['kind']; progress = 1 if kind=='X' else 0; state = 1-progress
    rows = abs(b['end'][progress]-b['start'][progress])+1
    assert rows == b['progressRowsInclusive'] and rows*25 == b['latticeStatesProposed']
    assert abs(b['end'][state]-b['start'][state]) <= rows-1
    key = kind+('+' if b['quadrant'][state]>0 else '-')
    old = [row for row in r['longPaths'][key]['lookups'] if row[progress]==b['end'][progress]%512]
    assert len(old)==1 and [signed(x) for x in old[0][:2]]==b['end']
    assert b['ownerA']=='P' and b['ownerB']==kind
assert sum(b['latticeStatesProposed'] for b in corr['branches']) == 8725
freeze = D.parent.parent/'CANDIDATE_FREEZE.json'
frozen = json.loads(freeze.read_text())['files']
assert len(frozen)==80
for row in frozen:
    assert sha(row['file'])==row['sha256']
out = D/'root-plan-review-v1.json'
assert not out.exists()
review = dict(schemaVersion=1, verdict='PASS bounded continuation/atlas implementation plan; no production authoring or ART acceptance', reviewer='root independent planner', reviewedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), nativeIdentity='ddf78c81cf519fbda0afc975b11b42f42949e3f9297a2e8f8dc3310c183b8d24', plan={'file':str(D/'PLAN.md'),'sha256':sha(D/'PLAN.md')}, receipt={'file':str(D/'plan-receipt.json'),'sha256':sha(D/'plan-receipt.json')}, independentStaticIntersections=found, independentlyCheckedEightFixedLongEndpointsAndStateBounds=True, previousStates=844800, maximumAdditionalStates=8725, maximumCumulativeStates=853525, remainingAfterAuthorizedOnce=146475, verifier={'file':str(Path(__file__)),'sha256':sha(__file__)}, authorization='Implement narrow diagnostic helper and isolated guard fixtures. Root code/public-fixture review precedes ONE actual8continuation run. Fixed C2/rank1/80..432/protectedcentralrect, correct P/X/P/Y costs and sole declared one-cellP tie. No canonical RGB/height/tier authoring.', diagnosticCompositeBoundary='After actual vector/ownership/torus/support/source guards pass, root receives atlas/actual result before separate unqualified source-only binary diagnostic composite authorization. No composite authorized by this receipt.', mandatoryGuards=['Four degree-four junctions; only declared first crossings; no extra intersections, retraces, overlaps or dangling ends; correct incident owner cycle.','Every raster pixel has one owner, protected P rectangle exact, shared wrap source families and corner chart; only declared one-cell tie.','80 frozen inputs stable; pin previous844800 journal/code; no state reset or implicit retry.','8725 additional states once; no new donor/rank/offset/cap/long search. Route or topology failure remains HOLD.'], limits='Static geometry and bounded plan only. Coherent blade crossings remain actual ART risks; numerical/corner topology success cannot close F1 or permit rtex080 reuse.', retainedRootFailure='First static reviewer used corner-only signed threshold464 for long station432; endpoint assertion stopped before receipt/search. Corrected chart threshold256 and rechecked all eight endpoints; no asset or search mutation.')
out.write_text(json.dumps(review,indent=2)+'\n')
print(json.dumps({'file':str(out),'sha256':sha(out),'intersections':found}))
