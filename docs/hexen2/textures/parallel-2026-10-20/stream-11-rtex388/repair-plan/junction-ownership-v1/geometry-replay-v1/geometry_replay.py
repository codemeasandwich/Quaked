"""Retained8-path exact geometry replay; no DP, composite or authoring entry point."""
import argparse
from fractions import Fraction as F
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
from types import FunctionType
import math

sys.dont_write_bytecode=True
import numpy as np

HERE=Path(__file__).resolve().parent
PLAN=HERE.parent
IMPL=PLAN/'implementation-v1'
ROOT=HERE.parents[7]
PINS={
 'anchor_bridge.py':'e96b3e14ebb272a5ce09c0f476ec75dbfb8786f089cd8053d1b0443ad15c61eb',
 'atlas_geometry.py':'f5ccdc8a13e250e845af1ce7ed23ba8481276b3b27d7f160215b3ad2f5540d55',
 'junction_diagnostic.py':'0546f4aed89e9ba2f557956dfd5ab4efb7713b70a51cc7dee470a39918c430b3',
 'actual-continuation-journal.json':'e557ecdfbfed70ee0c5dde6260bc2730057df0336a9fd60099e85ef1fb4fc696',
 'actual-failure-v1/failure.json':'8ec1a04118a20f02787fbafa8db6546eac8bd150f9a19599b893e1d13622aee9',
}
sha=lambda data:hashlib.sha256(data).hexdigest()


def load_legacy():
    for name in ('anchor_bridge.py','atlas_geometry.py','junction_diagnostic.py'):
        assert sha((IMPL/name).read_bytes())==PINS[name],'Frozen implementation changed'
    sys.path.insert(0,str(IMPL))
    spec=importlib.util.spec_from_file_location('frozen388_junction_implementation',IMPL/'junction_diagnostic.py')
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
    for name in ('anchor_bridge','atlas_geometry'):
        assert Path(sys.modules[name].__file__).resolve()==IMPL/(name+'.py'),'Wrong frozen geometry import'
    return module


legacy=load_legacy()
from anchor_bridge import point, require
from discarded_tail import first_mutual_discarded_tail


class TailPolicy:
    def __init__(self):self.audits=[]
    def __call__(self,a,b):
        chosen,events,audit=first_mutual_discarded_tail(a,b);self.audits.append(audit)
        return chosen,events


def assemble_retained(candidate,paths,branches):
    """Reuse the exact old assemble bytecode with one explicit pure dependency.

    A copied globals dictionary substitutes only the first-intersection policy.
    No old module globals or source files are mutated. Old clipping, prefixes,
    endpoints, arcs and all later graph/raster/source-chart guards are retained.
    """
    policy=TailPolicy();context=dict(legacy.assemble.__globals__)
    context['first_mutual_intersection']=policy
    assemble=FunctionType(legacy.assemble.__code__,context,'assemble_with_discarded_tail')
    arcs,events,bridges,anchors=assemble(candidate,paths,branches)
    validate_tail_audits(policy.audits)
    return arcs,events,bridges,anchors,policy.audits


def validate_tail_audits(audits):
    require(len(audits)==4,'Require exactly four original junction resolutions')
    intervals=[]
    for key,audit in zip(('pp','mp','pm','mm'),audits):
        require(audit['chosen']==legacy.JUNCTIONS[key],'Exact fixed junction changed')
        require(audit['prefixProof']['retainedPrefixesMeetOnlyAtJunction'] and
                audit['prefixProof']['retainedOverlap'] is False,'Retained overlap proof missing')
        for overlap in audit['discardedCommonTailIntervals']:
            intervals.append({'quadrant':key,**overlap})
    require(len(intervals)==1 and intervals[0]['quadrant']=='mm' and
            intervals[0]['entry']==(F(-35),F(-34)) and intervals[0]['exit']==(F(-36),F(-35)),
            'Replay permits only root-observed mm discarded common tail, no new overlap')
    return True


def literal_paths(failure,branches,rgb,gradient):
    """Verify only349 retained path nodes/costs, never optimize or score a lattice."""
    require(set(failure['paths'])=={r['id'] for r in branches},'Retained path set differs')
    paths={};audits=[];node_count=0
    for row in branches:
        rec=failure['paths'][row['id']];cols=rec['columns'];lookups=rec['lookups']
        require(rec['grid']==row['id'] and len(cols)==len(lookups)==row['progressRowsInclusive'],
                'Retained branch extent differs')
        require(rec['chargedStates']==row['latticeStatesProposed'],'Original charged state receipt changed')
        require(all(type(c) is int and 0<=c<25 for c in cols) and all(abs(a-b)<=1 for a,b in zip(cols,cols[1:])),
                'Retained columns escape original lattice')
        axis=1 if row['kind']=='X' else 0;other=1-axis
        require(cols[0]==row['start'][other]-row['states'][0] and cols[-1]==row['end'][other]-row['states'][0],
                'Retained fixed endpoint columns changed')
        points=[];costs=[];maximum_error=0.0
        for index,(col,lookup) in enumerate(zip(cols,lookups)):
            signed=[0,0];signed[axis]=row['start'][axis]+index*row['progressStep'];signed[other]=row['states'][0]+col
            dest=[v%512 for v in signed];donor=dest.copy();donor[other]=signed[other]+(384 if row['kind']=='X' else 128)
            require(lookup[:6]==dest+dest+donor,'Retained literal source/destination lookup changed')
            ax,ay=dest;bx,by=donor
            require(all(1<=p<=510 for p in (ax,ay,bx,by)),'Retained gradient neighbourhood reaches old source wrap')
            colour=np.abs(rgb[ay,ax].astype(float)-rgb[by,bx].astype(float)).mean()/255
            cost=float(colour+.25*max(gradient[ay,ax],gradient[by,bx]))
            error=abs(cost-lookup[6]);require(error<=1e-14,'Retained literal node cost differs')
            maximum_error=max(maximum_error,error);costs.append(cost);points.append(tuple(signed));node_count+=1
        require(abs(sum(costs)-rec['totalCost'])<=1e-12 and abs(sum(costs)/len(costs)-rec['meanCost'])<=1e-14 and abs(max(costs)-rec['maximumNodeCost'])<=1e-14,
                'Retained cost totals differ')
        legacy.branch_arc(row,points)  # Exact unchanged prefix, endpoints and support checks.
        paths[row['id']]=points;audits.append({'branch':row['id'],'retainedNodesChecked':len(points),
             'maximumNodeCostError':maximum_error,'originalChargedStates':rec['chargedStates'],'newDPStates':0})
    require(node_count==349,'Expected exactly349 retained node lookups')
    return paths,audits


def approval_files():
    return [HERE/'discarded_tail.py',HERE/'geometry_replay.py',HERE/'test_geometry_replay.py',
            HERE/'PLAN.md',HERE/'fixture-report-v1.json',HERE/'fixture-run-v1.log',
            *[IMPL/name for name in PINS],PLAN/'root-code-fixture-review-v1.json',
            PLAN/'PLAN.md',PLAN/'ANCHOR-BRIDGE-ADDENDUM.md',
            PLAN.parent/'diagnostic-v2/runs/actual-v1/result.json',
            PLAN.parent/'diagnostic-v2/actual-run-journal.json']


def authority(path):
    require(path.resolve()==(HERE/'root-geometry-code-review-v1.json').resolve() and path.is_file() and not path.is_symlink(),
            'Fixed independent root geometry-code/public-fixture approval required')
    approval=json.loads(path.read_bytes())
    require(approval.get('verdict','').startswith('PASS') and approval.get('authorizedOperation')=='GEOMETRY_REPLAY_RETAINED8_NO_DP_NO_COMPOSITE',
            'No geometry replay authority')
    require(approval.get('parameters')=={'candidate':'C2','capRank':1,'retainedPaths':8,'newDPStates':0,
            'cumulativeStates':853525,'remainingGlobalStates':146475,'strictAdjacentWrapFamilyAgreement':True,
            'allowedDiscardedTail':{'quadrant':'mm','entry':[-35,-34],'exit':[-36,-35]}},'Reviewed replay bounds differ')
    expected={str(p.relative_to(ROOT)) for p in approval_files()};inputs=approval.get('inputs')
    require(isinstance(inputs,dict) and set(inputs)==expected,'Unexpected replay review input set')
    for p in approval_files():require(inputs[str(p.relative_to(ROOT))]==sha(p.read_bytes()),'Reviewed replay file changed')
    return approval


def actual_context(approval_path):
    review=authority(approval_path)
    for name,digest in PINS.items():require(sha((IMPL/name).read_bytes())==digest,'Frozen failure/implementation changed')
    prior=legacy.prior_module();old_snapshot,rgb,stream=prior.production_context()
    failure=json.loads((IMPL/'actual-failure-v1/failure.json').read_bytes())
    journal=json.loads((IMPL/'actual-continuation-journal.json').read_bytes())
    require(failure['usedCumulativeStates']==853525 and failure['knownChargedAdditionalStates']==8725 and
            journal['knownChargedAdditionalStates']==8725 and journal['automaticRetry'] is False,
            'Original failed-run cumulative clock differs')
    require(failure['sourceInputsStillExact'] and failure['status'].startswith('FAILED_'),'Wrong retained failure')
    expected=dict(old_snapshot.first)
    for relative,digest in failure['firstInputHashes'].items():
        require(relative not in expected or expected[relative]==digest,'Conflicting first input witness')
        expected[relative]=digest
    for relative,digest in review['inputs'].items():
        require(relative not in expected or expected[relative]==digest,'Replay review conflicts with first witness')
        expected[relative]=digest
    for name,row in failure['separateOriginalCropFiles'].items():
        require('/' not in name and name.endswith('.png'),'Unsafe retained crop path')
        expected[str((IMPL/'actual-failure-v1'/name).relative_to(ROOT))]=row['sha256']
    expected[str(approval_path.relative_to(ROOT))]=sha(approval_path.read_bytes())
    snapshot=prior.Snapshot(ROOT,expected);old_snapshot.verify()
    parent=json.loads(snapshot.read(str((PLAN.parent/'diagnostic-v2/runs/actual-v1/result.json').relative_to(ROOT))))
    branches=legacy.branches_from_plan(json.loads(snapshot.read(str((PLAN/'correct-owner-corridors-plan-v1.json').relative_to(ROOT)))))
    return prior,snapshot,rgb,failure,parent,branches


def replay(approval_path):
    authority(approval_path)  # Fail before source access or journal issuance.
    prior,snapshot,rgb,failure,parent,branches=actual_context(approval_path)
    journal=HERE/'geometry-replay-journal.json';out=HERE/'actual-v1'
    require(not journal.exists() and not out.exists(),'Geometry replay already issued; reconcile rather than overwrite')
    issued={'state':'ISSUED_GEOMETRY_ONLY_NO_DP_NO_COMPOSITE','newDPStates':0,'cumulativeStates':853525,
            'remainingGlobalStates':146475,'automaticRetry':False,'originalFailureSha256':PINS['actual-failure-v1/failure.json']}
    with journal.open('x') as file:json.dump(issued,file,indent=2);file.write('\n')
    result={**issued,'status':'HOLD_UNQUALIFIED_GEOMETRY_REPLAY','paths':failure['paths'],
            'retainedCropReferences':failure['separateOriginalCropFiles'],'scope':'No DP, new donor/rank/path, materialRGB/composite/scalar/master/height/tier.'}
    try:
        gradient=prior.luminance_gradient(rgb)
        paths,cost_audit=literal_paths(failure,branches,rgb,gradient)
        result['literalNodeReplay']=cost_audit
        candidate,=[c for c in parent['candidates'] if c['candidate']=='C2']
        arcs,events,bridges,anchors,audits=assemble_retained(candidate,paths,branches)
        result.update({'incomingTailPolicyAudit':legacy.exact_json(audits),'vectorArcs':legacy.exact_json(arcs)})
        graph,edges=legacy.validate_graph(arcs)
        low,high=anchors['capY-'],anchors['capY+']
        def seed(cy):
            signed=cy-512 if cy>=256 else cy
            return 'C' if low<signed<high else 'X'
        labels=legacy.rasterize(edges,seed);raster=legacy.validate_raster(labels)
        result.update({'status':'GEOMETRY_GRAPH_RASTER_GUARDS_PASS_ART_F1_HOLD','graphGuards':graph,
              'rasterGuards':raster,'ownerOrder':list(legacy.OWNERS),'ownershipRowRuns':legacy.owner_runs(labels),
              'ownershipLabelSHA256':sha(labels.tobytes()),'allOldGraphRasterWrapGuardsUnchanged':True,
              'noCompositeOrMaterialPNG':True,'acceptance':'Topology only; actual fibre ART, BOX32/16 and any composite require separate root decision.'})
        output=prior.publish_outputs(snapshot,HERE,'actual-v1',{},result)
        final={**issued,'state':'COMPLETED_GEOMETRY_ONLY_ART_F1_HOLD','resultSha256':sha((output/'result.json').read_bytes())}
    except BaseException as error:
        final={**issued,'state':'FAILED_GEOMETRY_ONLY_ART_F1_HOLD','error':repr(error)}
        try:
            snapshot.verify();out.mkdir(mode=0o700)
            with (out/'failure.json').open('x') as file:json.dump({**result,'status':'FAILED_GEOMETRY_ONLY_ART_F1_HOLD','error':repr(error),'firstInputHashes':snapshot.first},file,indent=2);file.write('\n')
            final['failureSha256']=sha((out/'failure.json').read_bytes())
        except Exception as retained:final['failureRetentionError']=repr(retained)
        raise
    finally:journal.write_text(json.dumps(final,indent=2)+'\n')
    print(json.dumps(final))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replay',action='store_true');parser.add_argument('--describe',action='store_true')
    parser.add_argument('--approval',type=Path,default=HERE/'root-geometry-code-review-v1.json')
    args=parser.parse_args();require(not(args.replay and args.describe),'Choose describe or approved replay')
    if not args.replay:
        print(json.dumps({'mode':'SOURCE_FREE_DESCRIPTION','retainedPaths':8,'newDPStates':0,'cumulativeStates':853525,
              'compositeAllowed':False,'requires':'independent root exact geometry-code/public-fixture approval'}));return
    replay(args.approval)


if __name__=='__main__':
    try:main()
    except (ValueError,OSError,KeyError,AssertionError) as error:
        print('Geometry replay refused: '+str(error),file=sys.stderr);raise SystemExit(1)
