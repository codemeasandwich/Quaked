"""Seal actual offline decoded ART observations and current frozen custody."""
from pathlib import Path
import datetime
import hashlib
import json

ROOT=Path(__file__).resolve().parents[6];D=Path(__file__).resolve().parent;S=D.parent;V=D/'verified-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def load(p):return json.loads(p.read_bytes())

def w(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p)}

def write(p,value):
    with p.open('x') as file:json.dump(value,file,indent=2);file.write('\n')
    return w(p)


def main():
    actual=load(V/'actual-v1.json');assert sha(V/'actual-v1.json')=='67d7a03465b3970884ca8526e1647c195e4216ef99dfc6446683573c91499b9e'
    assert actual['verdict'].startswith('PASS') and actual['inputsStable']
    for row in actual['inputs']:assert sha(ROOT/row['file'])==row['sha256'],row['file']
    frozen=load(S/'CANDIDATE_FREEZE.json');assert len(frozen['frozenInputs'])==187
    for path,digest in frozen['frozenInputs'].items():assert sha(ROOT/path)==digest,path
    assert len(actual['decodedWitnesses'])==24
    for row in actual['decodedWitnesses']:
        assert row['independentlyReconstructedPNGBytesExact'] and sha(ROOT/row['file'])==row['sha256']
    preview=load(V/'preview-v1.json');assert preview['HTMLBytesExact'] and preview['all4JPEGBytesExact']
    assert sum(len(row['panels']) for row in preview['files'])==34 and all(row['changedPixels']==0 for row in preview['files'])
    maps=[row for tier in actual['materials'][0]['tiers'] for row in tier['maps']];assert len(maps)==10
    for row in maps:assert sha(ROOT/row['file'])==row['sha256']
    art={'schemaVersion':1,'verdict':'PASS independent offline decoded material/layout/distance/tiling/relief ART for both tiers; root registration and runtime/owner acceptance separate',
      'reviewer':'texture06 independent reviewer, not the rtex054 author','reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'nativeIdentity':'d007ea021eb38aceb69f2236c61cae889628abe4d1abc49beffd18c529bbee27','technicalProof':w(V/'actual-v1.json'),
      'masterPackage':actual['materials'][0]['masterPackage'],'tierReceipt':actual['materials'][0]['tierReceipt'],
      'actualViewsInspected':actual['decodedWitnesses'],'actualReviewJPEGsInspected':[w(ROOT/row['file']) for row in preview['files']],
      'material':'Both256 and512 decoded colour images depict convincing aged painted iron: coherent coating flakes, local oxide layers, pits, worn metal and eight rounded fastener heads. Detail is physical material rather than uniform synthetic grain or sharpened native contours.',
      'layoutAndPalette':'Eight perimeter heads, uninterrupted broad centre, subdued green-grey iron and brown/orange oxide retain the native plate intention and feature scale. Actual original/replacement BOX32 and16 pairs at both tiers remain representative; colour and small head differences are visible but do not change the material/layout. This is similarity, not pixel equality.',
      'literalTiling':'Both full1:1X/Y contact strips, four-corner contacts and2x2repeats inspected. The native intended panel joints remain coherent. No extra break through a continuous plate interior, invented edge hardware or added scalar perimeter bevel was observed. A visible intended plate boundary is not being relabelled as a seamless organic surface.',
      'physicalRelief':'Actual decoded height/XYZ, full neutral/textured opposed lights and all eight close head views inspected at both tiers. Heads now have shallow rounded interior response, continuous contact and the correct centre/shoulder/plate relationship. No pointed polygon tip, washer/inverted centre or ring-only cap remains apparent. Broad oxide/green coating stays near the plate rather than becoming a deep basin. Opposed lighting reverses the expected subtle cap shading.',
      'physicalLimits':'This is relative C0 paraboloid geometry, not C1 or a calibrated hemisphere. Shallow strength, retained photographic baked shading, bounded microdetail and mixed coating/contact neighborhoods are disclosed. Every-pixel radial monotonicity and pure-material claims are not required or inferred.',
      'preview':'Actual local review HTML bytes, all four JPEG files and34 content/label panels reproduced exactly in this independent replay (zero changed pixels). All24 existing diagnostic PNGs were freshly reconstructed byte-exact from decoded delivered maps before inspection; no duplicate PNG copies needed. No live browser rendering or interaction is claimed.',
      'sourceAndMathScope':'Source/raw/initial/current RGB+float/public wrapper proof378463ec is carried via fresh exact read/file/archive custody. This final run independently rebuilt all10 direct master-derived Q92/method6 maps and replayed actual tier/review CLIs in removed private outputs. No compressed-tier authoring source used.',
      'oldFailuresRetained':'Initial tonal and two-plane physical HOLDs, tiny H3 old annulus failure and author verifier syntax failure remain frozen history. They were not rewritten into current acceptance.',
      'limits':['Offline asset qualification only. No engine/GPU/pack/runtime/camera visibility, owner acceptance, Git landing, CI, build or release claim.','Root may register only this exact candidate after its own decision; this reviewer did not mutate shared state.']}
    art_ref=write(V/'art-review-v1.json',art)
    custody={'schemaVersion':1,'verdict':'PASS exact frozen rtex054 offline candidate source/math/10map/preview/ART/custody; ready for root independent registration decision',
      'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nativeIdentity':art['nativeIdentity'],'handoff':w(S/'handoff.json'),'freeze':w(S/'CANDIDATE_FREEZE.json'),'frozenInputCount':187,'all187FrozenInputsStable':True,
      'sourceMathPublicProof':w(D/'source-master-partial-v1.json'),'sourcePartialCustody':w(D/'partial-custody-v1.json'),'actual':w(V/'actual-v1.json'),'preview':w(V/'preview-v1.json'),'ART':art_ref,
      'batch':actual['batch'],'masterPackage':actual['materials'][0]['masterPackage'],'tierReceipt':actual['materials'][0]['tierReceipt'],'physicalMapFiles':10,'allMapBytesExactQ92Method6':True,
      'decodedWitnesses':24,'publicContentLabelPanels':34,'all4PreviewJPEGBytesExactThisRun':True,'oldHoldsAndSourceUnchanged':True,'privateVerificationOutputsRemoved':True,
      'newModelCalls':0,'authorOrSharedAssetMutations':0,'GitBuildReleaseActions':0,'sealer':w(Path(__file__)),'nextOwner':'root','nextAction':'Independently inspect exact proof/ART and decide registration, then owner-authorized owned Dev checkpoint through maintained gate. No automatic registration or release by this receipt.'}
    ref=write(V/'final-custody-v1.json',custody)
    print(json.dumps({'ART':art_ref,'custody':ref,'freeze':custody['freeze'],'maps':10,'panels':34}))

if __name__=='__main__':main()
