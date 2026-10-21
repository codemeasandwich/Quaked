"""Seal independent observations and current immutable candidate custody."""
import datetime
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
D = Path(__file__).resolve().parent
V = D/'verified-v1'
S = D.parent
sha = lambda data: hashlib.sha256(data).hexdigest()

def load(p):
    return json.loads(p.read_bytes())

def witness(p):
    return {'file':str(p.relative_to(ROOT)), 'sha256':sha(p.read_bytes()), 'bytes':p.stat().st_size}

def write(p,data):
    with p.open('x') as file:
        file.write(json.dumps(data,indent=2)+'\n')
    return witness(p)

class HTML(HTMLParser):
    def __init__(self):
        super().__init__();self.images=[];self.scripts=[]
    def handle_starttag(self,tag,attrs):
        if tag == 'img':self.images.append(dict(attrs))
        if tag == 'script':self.scripts.append(dict(attrs))


def main():
    freeze=load(S/'CANDIDATE_FREEZE.json')
    assert len(freeze['frozenInputs']) == 115
    for file,digest in freeze['frozenInputs'].items():
        assert sha((ROOT/file).read_bytes()) == digest,file
    actual=load(V/'actual-v1.json');source=load(D/'source-master-proof-refresh-v1.json')
    assert actual['verdict'].startswith('PASS') and source['verdict'].startswith('PASS')
    assert len(source['nativePhysicalOccurrences']) == 14 and source['nativeUniqueContentSlotCount'] == 10
    for proof in (actual,source):
        assert proof['inputsStable']
        for row in proof['inputs']:
            assert sha((ROOT/row['file']).read_bytes()) == row['sha256'],row['file']
    for row in actual['diagnosticEvidence']:
        assert sha((ROOT/row['file']).read_bytes()) == row['sha256']
    preview=load(V/'preview-v1.json')
    assert preview['HTMLBytesExact'] and len(preview['files']) == 4
    assert sum(len(row['panels']) for row in preview['files']) == 34
    for row in preview['files']:
        assert row['allChangesOnlyProvenUnusedTail']
    html_path=ROOT/preview['HTML']['file'];html_bytes=html_path.read_bytes()
    html=HTML();html.feed(html_bytes.decode())
    assert not html.scripts and len(html.images) == 4
    assert {r['src'] for r in html.images} == {f'rtex336-{t}-{r}.jpg' for t in ('mid','high') for r in ('review','relief')}
    assert b'Mid (default) [256, 512]' in html_bytes and b'High [512, 1024]' in html_bytes
    for item in html.images:
        path=(html_path.parent/item['src']).resolve()
        assert path.parent == html_path.parent.resolve() and path.is_file()
    sem=actual['independentLayering']['decodedPhysicalSamples']
    for tier,rows in sem.items():
        by={row['label']:row for row in rows}
        faces=('A','B','C','D','E','F','S1','S2','S3')
        joints=('H1','H2','H3','V1','V3','X2','Y')
        assert all(by[k]['uncompressedMaskFraction'] == 0 for k in faces)
        assert all(by[k]['uncompressedMaskFraction'] == 1 for k in joints)
        assert min(by[k]['decodedMean'] for k in faces) > max(by[k]['decodedCenter'] for k in joints)
        assert all(by[k]['notPureSample'] for k in ('I1','I2','IX','IY'))
    art={
        'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'verdict':'PASS independent offline decoded material/layout/distance/repeat/relief ART; root acceptance and registration remain separate',
        'nativeIdentity':freeze['nativeIdentity'],'nativeDimensions':[64,128],
        'actualProof':witness(V/'actual-v1.json'),'previewProof':witness(V/'preview-v1.json'),
        'observedNativeAndRaw':[witness(ROOT/load(S/'handoff.json')[k]['file']) for k in ('raw',)],
        'observedOriginal':witness(ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-14-rtex336/originals/01-rtex336-6879799910e3.png'),
        'observedDecodedEvidence':actual['diagnosticEvidence'],
        'material':'Recognisable rough weathered brown-grey stone masonry: coherent chipped bodies, shallow face wear, pores and embedded aggregate, local blue-grey mineral patches and particulate dark existing joints. Fine detail follows real material forms rather than pixel contours or synthetic uniform grain.',
        'layout':'Two unequal upper bodies, one broad second-course body continuing across X, two third-course bodies and a broad lowest body. Original course heights, offsets, grey patches and subdued brown/grey palette remain representative; no invented small edge stone or new all-course perimeter joint.',
        'distance':'Direct BOX original64x128 and decoded Mid256x512/High512x1024 independently compared at32x64 and16x32. Similar course rhythm, stone divisions and tonal marks persist at both reduced scales. Numerical errors supplement visual review, not an identity demand.',
        'edges':'Actual full-height X strips, full-width Y strips, both decoded corners and2x2 repeats viewed at both tiers. Broad second/fourth course stone remains continuous across X; source-visible side contacts stay in their existing courses. Y returns through the existing dark joint. No coherent added seam, invented small brick or perimeter bevel observed. Fine isolated grains need not be pixel-identical.',
        'relief':'Actual decoded height/XYZ and opposed neutral/textured lights viewed at both tiers. Bodies stay near one broad plane; dark and cool-grey patches remain face colour, not architectural depressions. Narrow existing joints sit below stone. Opposed lights reverse only expected interface/fine relief; no large tonal pillow or broad basin observed.',
        'decodedHierarchy':{'faceAndStainMaskFractions':0,'contactCentreMaskFractions':1,'relativeFacesAboveContactCentres':True,'mixedInterfaces':['I1','I2','IX','IY'],'notCalibratedPhysicalDepth':True},
        'preview':'Actual public review CLI replayed. HTML byte-exact,34 decoded content/label panels exact; fullJPEG differs only in retained proven-unused40x16tail (0/34/164/402 changed pixels by file). No browser rendering/interaction observed or claimed.',
        'limits':['Offline candidate qualification only; no camera-frame visibility, GPU/gameplay, owner acceptance, registration, Git, CI, build or release claim.','Relative scalar planes are artistic physical interpretation, not photogrammetry.','Shared Pillow polygon primitive is disclosed; scalar composition and all map codec/math separately reconstructed.','Initial ordinary tonal-relief HOLD remains retained.'],
        'independence':'Reviewer did not author336. Existing262 verifier and root336 source-only verifier reused as bounded references, adapted for portrait geometry/115-file freeze/all14native slots, actually executed afresh; no verdict copied.',
    }
    art_ref=write(V/'art-review-v1.json',art)
    history={'scope':'Verifier adaptation history','rootPreparation':'Root reported a pre-run clone attempt stopped at changed freeze schema; no verifier/output was produced by that attempt. This reviewer used actual frozenInputs dictionary/nativeIdentity schema before executing.','currentRuns':'Fresh source refresh and first final336 verifier both completed PASS; no failed actual qualification run hidden.','referenceVerifier':witness(ROOT/'docs/hexen2/textures/parallel-2026-10-20/stream-13-ttex262/independent-final/verify-final.py'),'sourceReference':witness(S/'independent-source-master/verify.py'),'currentVerifiers':[witness(D/'verify-source-refresh.py'),witness(D/'verify-final.py')]}
    history_ref=write(D/'verifier-adaptation-history.json',history)
    custody={'schemaVersion':1,'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'PASS current115 frozen inputs and all source/math/preview/ART evidence stable; ready for root independent decision','nativeIdentity':freeze['nativeIdentity'],'freeze':witness(S/'CANDIDATE_FREEZE.json'),'handoff':witness(S/'handoff.json'),'frozenInputCount':115,'frozenInputsStable':True,'actual':witness(V/'actual-v1.json'),'sourceRefresh':witness(D/'source-master-proof-refresh-v1.json'),'preview':witness(V/'preview-v1.json'),'ART':art_ref,'history':history_ref,'HTMLStaticBindingChecks':{'images':4,'scripts':0,'default':'Mid','dimensions':{'Mid':[256,512],'High':[512,1024]},'renderedBrowserClaim':False},'sealer':witness(Path(__file__)),'newGenerations':0,'authorAssetsModified':0,'registryGitBuildActions':0,'nextOwner':'root','nextAction':'Inspect actual independent evidence/ART, decide registration; no agent registration authority inferred.'}
    ref=write(V/'final-custody-v1.json',custody)
    print(json.dumps({'ART':art_ref,'custody':ref}))

if __name__ == '__main__':main()
