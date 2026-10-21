"""Planning seals and scalar parameter/coordinate checks only; no height field."""
from pathlib import Path
import datetime
import hashlib
import json
import math

ROOT=Path(__file__).resolve().parents[6];D=Path(__file__).resolve().parent;S=D.parent
A=S/'analytic-cap-plan-v1';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def w(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p)}

def main():
    handoff=json.loads((A/'plan-handoff.json').read_bytes());plan=json.loads((A/'analytic-cap-plan.json').read_bytes())
    first={}
    for rel,digest in handoff['frozenPlanInputs'].items():
        file=ROOT/rel;assert sha(file)==digest,rel;first[rel]=digest
    freeze_file=ROOT/plan['priorHoldFreeze']['file'];assert sha(freeze_file)==plan['priorHoldFreeze']['sha256']
    freeze=json.loads(freeze_file.read_bytes());assert len(freeze['frozenInputs'])==82
    for rel,digest in freeze['frozenInputs'].items():
        assert sha(ROOT/rel)==digest,rel
        assert rel not in first or first[rel]==digest;first[rel]=digest
    assert plan['state']=='PLAN_ONLY_AWAITING_INDEPENDENT_REVIEW_NO_IMPLEMENTATION_OR_TRIAL'
    assert plan['nativeIdentity']=='d007ea021eb38aceb69f2236c61cae889628abe4d1abc49beffd18c529bbee27'
    assert plan['sourceMasterPackage']['sha256']=='eacb48c1a29970e6ca95ac093fb276c5dedc6eebf42951913b65edf16d8db189'
    assert plan['sourceVerification']['sha256']=='86284d4b4cfff5b049082c94069193a7995e43e1af9d097120d590ebb0053ebd'
    for key in ('sourceMasterPackage','sourceVerification','priorHold','priorHoldFreeze','measurement','plan'):
        row=plan[key];assert sha(ROOT/row['file'])==row['sha256'];first[row['file']]=row['sha256']
    proof=json.loads((ROOT/plan['sourceVerification']['file']).read_bytes())
    match,=[r for r in proof['materials'] if r['nativeIdentity']==plan['nativeIdentity']]
    assert proof['verdict'].startswith('PASS') and match['name']=='rtex054' and match['edition']=='base'
    assert match['masterPackage']['file']==plan['sourceMasterPackage']['file'] and match['masterPackage']['sha256']==plan['sourceMasterPackage']['sha256']
    policy=plan['prospectivePolicy'];assert policy['name']=='rounded-caps-v1' and policy['profile']=='paraboloid'
    assert policy['referenceSize']==[64,64] and (policy['plateHeight'],policy['capAmplitude'],policy['microAmplitude'])==(.54,.07,.004)
    heads=policy['heads'];assert [h['label'] for h in heads]==['H'+str(i) for i in range(1,9)]
    measured=json.loads((ROOT/plan['measurement']['file']).read_bytes())
    boxes=[];coordinates=[]
    for head,row in zip(heads,measured['heads']):
        assert head['label']==row['label']
        assert [v*8 for v in head['centre']]==row['centreMasterPixelEdges']
        assert [v*8 for v in head['radii']]==row['radiiMasterPixels']
        assert all(type(v) in (float,int) and math.isfinite(v) for v in head['centre']+head['radii'])
        cx,cy=head['centre'];rx,ry=head['radii'];assert rx*8>=2 and ry*8>=2
        box=[cx-rx,cy-ry,cx+rx,cy+ry];assert 0<box[0]<box[2]<64 and 0<box[1]<box[3]<64
        boxes.append(box);coordinates.append({'label':head['label'],'nativeCentre':head['centre'],'nativeRadii':head['radii'],'masterBounds':[v*8 for v in box],'boundaryUncertaintyMasterPixels':[1,2]})
    for i,a in enumerate(boxes):
        for b in boxes[i+1:]:assert a[2]<b[0] or b[2]<a[0] or a[3]<b[1] or b[3]<a[1]
    for row in plan['inspectedTools']:
        assert sha(ROOT/row['file'])==row['sha256'];first[row['file']]=row['sha256']
    base,micro,amplitude=policy['plateHeight'],policy['microAmplitude'],policy['capAmplitude']
    bounds=[base-micro,base+amplitude+micro];assert bounds[0]>=0 and bounds[1]<=1
    nominal={'plate':base,'apex':base+amplitude,'halfRadiusShoulder':base+amplitude*.75,'globalBoundsIncludingMicro':bounds,'continuity':'C0 not C1 at cap boundary','shapeMeaning':'Analytic relative convex approximation, not calibrated hemisphere.'}
    assert all(sha(ROOT/rel)==digest for rel,digest in first.items())
    report={'schemaVersion':1,'verdict':'PASS exact sealed planning inputs,8source-measured coordinate conversions/interior-disjoint supports and clipping-safe scalar parameters; no heightfield','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'plan':w(A/'analytic-cap-plan.json'),'handoff':w(A/'plan-handoff.json'),'heads':coordinates,'nominalParameterChecks':nominal,'frozen82InputsUnchanged':True,'sealed8PlanInputsUnchanged':True,'allObservedInputsStable':True,'inputSeals':first,'heightFieldCreated':False,'sourceOrProducerChanged':False,'implementationOrTrialQualified':False,'verifier':w(Path(__file__))}
    out=D/'plan-input-proof-v1.json'
    with out.open('x') as file:json.dump(report,file,indent=2);file.write('\n')
    print(json.dumps({'proof':w(out),'frozen':82,'heads':8,'nominal':nominal}))

if __name__=='__main__':main()
