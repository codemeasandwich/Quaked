"""Once-only bounded C2 continuation and nonmaterial ownership diagnostic.

Default/--describe is source-free. Actual source DP requires a separate root
code/public-fixture approval, exact input pins and exclusive cumulative journal.
This command cannot create repaired RGB, scalar, master or texture tiers.
"""
import argparse
from fractions import Fraction as F
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys

sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
from anchor_bridge import amend_anchor, require, point
from atlas_geometry import (JUNCTIONS, OWNERS, canonical, first_mutual_intersection,
                            clip_progress, validate_graph, rasterize, validate_raster)

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[7]
PLAN=HERE.parent
OLD=PLAN.parent/'diagnostic-v2'
OLD_CODE_SHA='7c86892020be694258bb0613bae80675bef6b27889c5603c849a7ca6f62ca485'
OLD_RESULT_SHA='c73841bfaa46f963cff1afce06e877baabbd8656eba96cabd2d142f7ca70877e'
OLD_JOURNAL_SHA='2edeb522da651a828ee4cd19159cde7ec846c01daa003b5df5f4c166e146cd2a'
PLAN_SHA='57b2ccbe34b3b174d119ea575ad24b6e96a4fdae096074c9fa80599d19ae8884'
PLAN_REVIEW_SHA='8e243c876e615a552f340995cbe8d4a9b083ca29a2a0e34a8f481fb487056ae6'
CORRIDOR_SHA='672e5eb841873ea8cd4259bd5aaa5d579e974e7f84c12eea9412c2408e4835bb'
ADDENDUM_SHA='ac1b0a86f593d7cab2e26883478499c8b6a620bf170d84a0fa831864dd46f815'
PREVIOUS=844800
ADDITIONAL=8725
CUMULATIVE=853525
GLOBAL_LIMIT=1000000
# Immutable approved bounds; source plans must match every tuple exactly.
BOUNDS=(
 ('pp-X','X',(1,1),(25,42),(25,43),(26,80),(24,48),38,950),
 ('pp-Y','Y',(1,1),(25,41),(26,41),(80,46),(24,48),55,1375),
 ('mp-X','X',(-1,1),(-40,38),(-40,39),(-39,80),(-48,-24),42,1050),
 ('mp-Y','Y',(-1,1),(-40,38),(-41,38),(-80,45),(24,48),40,1000),
 ('pm-X','X',(1,-1),(31,-46),(31,-47),(30,-80),(24,48),34,850),
 ('pm-Y','Y',(1,-1),(31,-46),(32,-46),(80,-32),(-48,-24),49,1225),
 ('mm-X','X',(-1,-1),(-35,-34),(-35,-35),(-45,-80),(-48,-24),46,1150),
 ('mm-Y','Y',(-1,-1),(-35,-34),(-36,-34),(-80,-42),(-48,-24),45,1125),
)


def sha(data):return hashlib.sha256(data).hexdigest()


def prior_module():
    file=OLD/'source_path_diagnostic.py'
    require(sha(file.read_bytes())==OLD_CODE_SHA,'Pinned parent diagnostic code changed')
    spec=importlib.util.spec_from_file_location('reviewed388_parent_diagnostic',file)
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
    return module


def branches_from_plan(plan):
    branches=plan['branches'];require(len(branches)==8,'Require exactly eight fixed branches')
    for row,bound in zip(branches,BOUNDS):
        key,kind,quad,bridge,start,end,states,rows,charge=bound
        actual=(row['id'],row['kind'],tuple(row['quadrant']),tuple(row['bridge']),tuple(row['start']),tuple(row['end']),tuple(row['states']),row['progressRowsInclusive'],row['latticeStatesProposed'])
        require(actual==bound,'Fixed continuation bounds changed')
        require(row['ownerA']=='P' and row['ownerB']==kind,'Continuation uses wrong owners')
        axis=1 if kind=='X' else 0
        step=1 if end[axis]>start[axis] else -1
        require(row['progressStep']==step and abs(end[axis]-start[axis])+1==rows and rows*25==charge,
                'Invalid inclusive rows/state charge')
        require(abs(end[1-axis]-start[1-axis])<=rows-1,'Unreachable fixed endpoint')
    require(sum(b[-1] for b in BOUNDS)==ADDITIONAL,'State allowance changed')
    return branches


def continuation_grid(module,row):
    """Actual P/X or P/Y source comparisons on one fixed closed probe lattice."""
    kind=row['kind'];axis=1 if kind=='X' else 0;other=1-axis
    start,end=row['start'],row['end'];step=row['progressStep']
    progress=np.arange(start[axis],end[axis]+step,step,dtype=np.int64)
    values=np.arange(row['states'][0],row['states'][1]+1,dtype=np.int64)
    require(len(values)==25 and len(progress)==row['progressRowsInclusive'],'Fixed grid dimensions differ')
    p,v=np.meshgrid(progress,values,indexing='ij')
    signed=np.stack((v,p) if kind=='X' else (p,v),axis=2)
    dest=signed%512;a=dest.copy();b=dest.copy()
    b[:,:,other]=signed[:,:,other]+(384 if kind=='X' else 128)
    grid=module.checked_grid(row['id'],dest,a,b,values)
    first=start[other]-row['states'][0];last=end[other]-row['states'][0]
    return grid,first,last,signed


def deduplicate(points):
    out=[]
    for p in map(point,points):
        if not out or p!=out[-1]:out.append(p)
    return out


def signed_lookup(row):
    return tuple(F(v-512 if v>=256 else v) for v in row[:2])


def cap_curve(candidate,name):
    cap=candidate['caps'][name]['suggestions'][0]
    require(cap['sharedAnchorAdjacentSourceCells'],'Parent shared cap anchor failed')
    rows=cap['negativeHalf']['lookups']+cap['positiveHalf']['lookups']
    curve=[signed_lookup(row) for row in rows];axis=0 if name.startswith('capY') else 1
    require([p[axis] for p in curve]==list(range(-48,48)),'Parent cap progress changed')
    amended,receipt=amend_anchor(curve,axis)
    require(receipt['maximumDeviation']<=F(1,2),'Anchor amendment exceeds half pixel')
    return amended,receipt


def outward(curve,axis,sign):
    zero=next(i for i,p in enumerate(curve) if p[axis]==0)
    return curve[zero:] if sign>0 else list(reversed(curve[:zero+1]))


def retained_long(candidate,name):
    rows=candidate['longPaths'][name]['lookups'];axis=1 if name.startswith('X') else 0
    require(len(rows)==416 and [r[axis] for r in rows]==list(range(48,464)),
            'Original retained long extent differs')
    rows=[r for r in rows if 80<=r[axis]<=432]
    require(len(rows)==353,'Require exact353 inclusive retained nodes')
    other=1-axis;points=[]
    for r in rows:
        p=list(map(F,r[:2]));p[other]=F(int(p[other])-512 if p[other]>=256 else int(p[other]));points.append(tuple(p))
    return points


def branch_arc(row,path):
    points=list(map(point,path))
    require(bool(points),'Missing continuation nodes')
    require(points[0]==point(row['start']) and points[-1]==point(row['end']),'Exact continuation endpoints differ')
    axis=1 if row['kind']=='X' else 0;other=1-axis
    require(len(points)==row['progressRowsInclusive'] and all(b[axis]-a[axis]==row['progressStep'] and abs(b[other]-a[other])<=1 for a,b in zip(points,points[1:])), 'Continuation escaped monotone three-neighbour lattice')
    require(all(row['states'][0]<=p[other]<=row['states'][1] for p in points),'Continuation escaped state band')
    prefix=[JUNCTIONS[row['id'][:2]],point(row['bridge']),point(row['start'])]
    return {'id':row['id'],'owners':('P',row['kind']),
            'points':deduplicate(prefix+points[1:])}


def assemble(candidate,branch_paths,branches):
    """Only retained curves plus fixed prefixes/new correct-owner paths."""
    require(candidate['candidate']=='C2' and candidate['centre']==[384,128],'Donor/rank changed')
    curves={};bridge_receipts={}
    for name in ('capY+','capY-','capX+','capX-'):
        curves[name],bridge_receipts[name]=cap_curve(candidate,name)
    events={}
    for key,(sx,sy) in {'pp':(1,1),'mp':(-1,1),'pm':(1,-1),'mm':(-1,-1)}.items():
        a=outward(curves['capY'+('+' if sy>0 else '-')],0,sx)
        b=outward(curves['capX'+('+' if sx>0 else '-')],1,sy)
        chosen,all_events=first_mutual_intersection(a,b)
        require(chosen==JUNCTIONS[key],'First mutual junction changed')
        events[key]={'chosen':chosen,'allIncomingEvents':[{'point':p,'orders':order} for p,order in all_events.items()]}
    arcs=[]
    for name,start,end,axis,pair in (
        ('capY+','mp','pp',0,('C','X')),('capY-','mm','pm',0,('C','X')),
        ('capX+','pm','pp',1,('C','Y')),('capX-','mm','mp',1,('C','Y'))):
        arcs.append({'id':name,'owners':pair,'points':clip_progress(curves[name],axis,JUNCTIONS[start],JUNCTIONS[end])})
    longs={name:retained_long(candidate,name) for name in ('X+','X-','Y+','Y-')}
    for name,points in longs.items():arcs.append({'id':'long'+name,'owners':('P',name[0]),'points':points})
    require(set(branch_paths)=={r['id'] for r in branches},'Missing/additional continuation')
    for row in branches:
        arc=branch_arc(row,branch_paths[row['id']]);points=arc['points']
        axis=1 if row['kind']=='X' else 0;other=1-axis
        long_name=row['kind']+('+' if row['quadrant'][other]>0 else '-')
        require(canonical(points[-1]) in (canonical(longs[long_name][0]),canonical(longs[long_name][-1])),
                'Continuation missed fixed retained long endpoint')
        arcs.append(arc)
    anchors={name:bridge_receipts[name]['anchor'] for name in bridge_receipts}
    return arcs,events,bridge_receipts,anchors


def owner_runs(labels):
    """Compact exact per-row integer ownership, no material image/compositor."""
    rows=[]
    for row in labels:
        runs=[];start=0
        for x in range(1,len(row)+1):
            if x==len(row) or row[x]!=row[start]:
                runs.append([start,x,OWNERS[int(row[start])]]);start=x
        rows.append(runs)
    return rows


def exact_json(value):
    if isinstance(value,F):return int(value) if value.denominator==1 else {'numerator':value.numerator,'denominator':value.denominator}
    if isinstance(value,dict):return {str(k):exact_json(v) for k,v in value.items()}
    if isinstance(value,(tuple,list)):return [exact_json(v) for v in value]
    return value


def approval_inputs():
    return [PLAN/'PLAN.md',PLAN/'root-plan-review-v1.json',PLAN/'correct-owner-corridors-plan-v1.json',
            PLAN/'ANCHOR-BRIDGE-ADDENDUM.md',HERE/'anchor_bridge.py',HERE/'atlas_geometry.py',
            HERE/'junction_diagnostic.py',HERE/'test_anchor_bridge.py',HERE/'test_junction_diagnostic.py',
            HERE/'full-fixture-report-v2.json',HERE/'full-fixture-run-v2.log',
            OLD/'source_path_diagnostic.py',OLD/'runs/actual-v1/result.json',OLD/'actual-run-journal.json']


def validate_authority(path):
    """Root's code/fixture approval pins exact reviewed code; not plan-only PASS."""
    require(path.resolve()==(PLAN/'root-code-fixture-review-v1.json').resolve(),
            'Actual run requires the fixed independent root code/fixture receipt')
    require(path.is_file() and not path.is_symlink(),'Root code/public-fixture approval absent')
    approval=json.loads(path.read_bytes())
    require(approval.get('verdict','').startswith('PASS'),'Code/fixture review did not pass')
    require(approval.get('authorizedOperation')=='ONE_SOURCE_ONLY_CONTINUATION_ATLAS_NO_COMPOSITE', 'No actual continuation/atlas authority')
    require(approval.get('parameters')=={'candidate':'C2','capRank':1,'previousStates':PREVIOUS,
            'maximumAdditionalStates':ADDITIONAL,'maximumCumulativeStates':CUMULATIVE,
            'protectedCentralRectangle':[48,48,464,464],'strictAdjacentWrapFamilyAgreement':True},
            'Approved parameters differ')
    inputs=approval.get('inputs');require(isinstance(inputs,dict),'Missing reviewed code/input seals')
    require(set(inputs)=={str(file.relative_to(ROOT)) for file in approval_inputs()},
            'Unexpected or missing reviewed input paths')
    for file in approval_inputs():
        relative=str(file.relative_to(ROOT));require(inputs.get(relative)==sha(file.read_bytes()),'Code/fixture/input pin changed: '+relative)
    return approval


def actual_context(approval_path,module):
    # First identity/hash snapshots preserve every parent witness, plus exact new inputs.
    old_snapshot,rgb,stream=module.production_context();expected=dict(old_snapshot.first)
    pinned={OLD/'runs/actual-v1/result.json':OLD_RESULT_SHA,OLD/'actual-run-journal.json':OLD_JOURNAL_SHA,
            PLAN/'PLAN.md':PLAN_SHA,PLAN/'root-plan-review-v1.json':PLAN_REVIEW_SHA,
            PLAN/'correct-owner-corridors-plan-v1.json':CORRIDOR_SHA,PLAN/'ANCHOR-BRIDGE-ADDENDUM.md':ADDENDUM_SHA}
    for file,digest in pinned.items():require(sha(file.read_bytes())==digest,'Sealed plan/parent changed')
    approval=validate_authority(approval_path)
    for relative,digest in approval['inputs'].items():
        require(relative not in expected or expected[relative]==digest,'Conflicting first input witness')
        expected[relative]=digest
    expected[str(approval_path.relative_to(ROOT))]=sha(approval_path.read_bytes())
    snapshot=module.Snapshot(ROOT,expected);old_snapshot.verify()
    parent=json.loads(snapshot.read(str((OLD/'runs/actual-v1/result.json').relative_to(ROOT))))
    journal=json.loads(snapshot.read(str((OLD/'actual-run-journal.json').relative_to(ROOT))))
    require(parent['latticeStateEvaluations']==PREVIOUS and journal['usedStates']==PREVIOUS and journal['state']=='COMPLETED_SOURCE_ONLY_SUGGESTIONS_ART_HOLD','Parent state allowance unresolved')
    return snapshot,rgb,parent,approval


def retain_failure(directory,snapshot,result,payloads,error,budget):
    """Retain spent paths/crops even when topology fails; never a PASS receipt."""
    directory=Path(directory)
    require(directory.parent.is_dir() and not directory.parent.is_symlink(),
            'Failure parent is not an ordinary owned directory')
    require(not directory.exists() and not directory.is_symlink(),'Failure output already exists')
    directory.mkdir(mode=0o700)
    stable=False;verification_error=None
    try:
        stable=snapshot.verify()
    except Exception as changed:
        verification_error=repr(changed)
    rows={}
    for name,data in sorted(payloads.items()):
        require(name.endswith('.png') and '/' not in name and '\\' not in name,
                'Unsafe failed-crop filename')
        with (directory/name).open('xb') as file:file.write(data)
        rows[name]={'sha256':sha(data),'bytes':len(data)}
    receipt={**result,'status':'FAILED_UNQUALIFIED_SOURCE_ONLY_DIAGNOSTIC_ART_F1_HOLD',
             'error':repr(error),'knownChargedAdditionalStates':budget.used-PREVIOUS,
             'usedCumulativeStates':budget.used,'firstInputHashes':dict(snapshot.first),
             'sourceInputsStillExact':bool(stable),'sourceRecheckFailure':verification_error,
             'separateOriginalCropFiles':rows,'noCompositeOrMaterialRGB':True,
             'automaticRetry':False,'acceptance':'Failure evidence only; F1 remains HOLD.'}
    with (directory/'failure.json').open('x') as file:json.dump(receipt,file,indent=2);file.write('\n')
    return {'directory':str(directory),'sha256':sha((directory/'failure.json').read_bytes())}


def run_source(approval_path):
    validate_authority(approval_path)  # Refuse before native/source access or journal issuance.
    module=prior_module();snapshot,rgb,parent,approval=actual_context(approval_path,module)
    rows=branches_from_plan(json.loads(snapshot.read(str((PLAN/'correct-owner-corridors-plan-v1.json').relative_to(ROOT)))))
    candidate,=[r for r in parent['candidates'] if r['candidate']=='C2']
    output=HERE/'actual-v1';journal=HERE/'actual-continuation-journal.json'
    require(not output.exists() and not journal.exists(),'Once-only actual run already issued; no retry/reset')
    snapshot.verify()
    initial={'state':'ISSUED_ONCE_NO_COMPOSITE','previousStates':PREVIOUS,'additionalReserved':ADDITIONAL,
             'maximumCumulativeStates':CUMULATIVE,'globalLimit':GLOBAL_LIMIT,'automaticRetry':False,
             'parentJournalSha256':OLD_JOURNAL_SHA,'parentResultSha256':OLD_RESULT_SHA,
             'rootCodeFixtureApproval':str(approval_path.relative_to(ROOT)),
             'rootCodeFixtureApprovalSha256':sha(approval_path.read_bytes())}
    with journal.open('x') as file:json.dump(initial,file,indent=2);file.write('\n')
    budget=module.Budget(limit=CUMULATIVE,used=PREVIOUS)
    result={'status':'HOLD_UNQUALIFIED_PATH_ATLAS_DIAGNOSTIC','scope':'No repaired/compositedRGB, scalar/master/height/tier; source indices and binary labels only.'}
    paths={};records={};payloads={};views={}
    try:
        gradient=module.luminance_gradient(rgb)
        result['paths']=records;result['sourceCropViews']=views
        for row in rows:
            grid,first,last,signed=continuation_grid(module,row);cost=module.grid_cost(rgb,gradient,grid)
            solution=module.minimum_path(cost,budget,start=first,end=last)
            record=module.path_record(grid,cost,solution);records[row['id']]=record
            paths[row['id']]=[tuple(map(int,signed[i,col])) for i,col in enumerate(solution['columns'])]
            for marked in (False,True):
                name=row['id']+('-annotated' if marked else '-unmarked')+'.png'
                payloads[name],views[name]=module.pair_evidence(Image.fromarray(rgb),grid,[record['lookups']],marked)
        require(budget.used==CUMULATIVE,'Unexpected charged continuation state total')
        arcs,events,bridges,anchors=assemble(candidate,paths,rows)
        graph,edges=validate_graph(arcs)
        low,high=anchors['capY-'],anchors['capY+']
        def seed(cy):
            signed=cy-512 if cy>=256 else cy
            return 'C' if low<signed<high else 'X'
        labels=rasterize(edges,seed);raster=validate_raster(labels)
        # No material RGB use below. Labels retain source chart recipe, exact runs and checksum.
        result.update({'status':'SOURCE_ONLY_CONTINUATION_ATLAS_GUARDS_PASS_ART_F1_HOLD',
            'candidate':'C2','capRank':1,'previousStates':PREVIOUS,'additionalStates':budget.used-PREVIOUS,
            'cumulativeStates':budget.used,'remainingGlobalStates':GLOBAL_LIMIT-budget.used,
            'paths':records,'incomingEvents':exact_json(events),'anchorBridges':exact_json(bridges),
            'vectorArcs':exact_json(arcs),'graphGuards':graph,'rasterGuards':raster,
            'ownerOrder':list(OWNERS),'ownershipRowRuns':owner_runs(labels),'ownerLabelsSHA256':sha(labels.tobytes()),
            'sourceChartRecipe':{'P':'(x,y)','X':'(384+signedx,y)','Y':'(x,128+signedy)','C':'(384+signedx,128+signedy)','signedCollar':'indices464..511 -> -48..-1; indices0..47 unchanged; half-open'},
            'sourceCropViews':views,'noCompositeOrMaterialPNG':True,
            'acceptance':'Algorithm/atlas guard result only; real fibre cuts, material naturalness, BOX32/16 and ART remain HOLD.'})
        output=module.publish_outputs(snapshot,HERE,'actual-v1',payloads,result)
        final={**initial,'state':'COMPLETED_SOURCE_ONLY_ATLAS_ART_F1_HOLD','knownChargedAdditionalStates':budget.used-PREVIOUS,
               'usedCumulativeStates':budget.used,'resultSha256':sha((output/'result.json').read_bytes())}
    except BaseException as error:
        final={**initial,'state':'FAILED_OR_UNRESOLVED_NO_RETRY_ART_F1_HOLD','knownChargedAdditionalStates':budget.used-PREVIOUS,'error':repr(error)}
        try:
            final['partialFailureEvidence']=retain_failure(HERE/'actual-failure-v1',snapshot,result,payloads,error,budget)
        except Exception as retention_error:
            final['failureEvidenceRetentionError']=repr(retention_error)
        raise
    finally:
        journal.write_text(json.dumps(final,indent=2)+'\n')
    print(json.dumps(final))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--describe',action='store_true')
    parser.add_argument('--run-source',action='store_true')
    parser.add_argument('--approval',type=Path,default=PLAN/'root-code-fixture-review-v1.json')
    args=parser.parse_args()
    require(not(args.describe and args.run_source),'Choose describe or separately approved actual run')
    if not args.run_source:
        print(json.dumps({'mode':'SOURCE_FREE_DESCRIPTION_ONLY','candidate':'C2','capRank':1,
              'previousStates':PREVIOUS,'additionalOnceMaximum':ADDITIONAL,'maximumCumulative':CUMULATIVE,
              'actualRunRequires':'independent root code/public-fixture approval with all input/code pins',
              'compositeAllowed':False,'materialOrReliefAuthoringAllowed':False}));return
    run_source(args.approval)


if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError) as error:
        print('Continuation diagnostic refused: '+str(error),file=sys.stderr);raise SystemExit(1)
