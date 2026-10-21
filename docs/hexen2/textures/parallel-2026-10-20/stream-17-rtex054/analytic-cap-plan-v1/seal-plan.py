"""Seal planning evidence only; no policy implementation or scalar trial."""
from pathlib import Path
import hashlib,json,datetime
ROOT=Path(__file__).resolve().parents[6]
DOC=Path(__file__).resolve().parent
PARENT=DOC.parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-17-rtex054'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def w(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p)}
measure=json.loads((DOC/'ellipse-measurements-v1.json').read_bytes())
freeze=json.loads((PARENT/'PHYSICAL_HOLD_FREEZE.json').read_bytes())
assert all(sha(ROOT/f)==h for f,h in freeze['frozenInputs'].items())
tools=[ROOT/q for q in[
 'tools/texture_sheets/prepare_texture_master.py',
 'tools/texture_sheets/finish_official_texture.py',
 'tools/texture_sheets/derive_texture_tiers.py',
 'tools/craft_normals.py',
 'tools/texture_sheets/prepare_layered_texture_master.py',
 'tools/texture_sheets/update_level_sheets.py',
 'tools/texture_sheets/register_layered_texture_boundary.py',
 'tools/texture_sheets/prepare_motif_texture_master.py',
 'tools/texture_sheets/check_texture_catalog_custody.py']]
plan={
 'schemaVersion':1,
 'state':'PLAN_ONLY_AWAITING_INDEPENDENT_REVIEW_NO_IMPLEMENTATION_OR_TRIAL',
 'nativeIdentity':measure['nativeIdentity'],'name':'rtex054','edition':'base',
 'sourceMasterPackage':w(BASE/'masters/rtex054-initial/master.json'),
 'sourceVerification':w(PARENT/'independent-source-master/source-master-proof-v1.json'),
 'priorHold':w(PARENT/'rounded-trial-physical-hold-v1.json'),
 'priorHoldFreeze':w(PARENT/'PHYSICAL_HOLD_FREEZE.json'),
 'measurement':w(DOC/'ellipse-measurements-v1.json'),
 'plan':w(DOC/'PLAN.md'),
 'proposedCanonicalTool':'tools/texture_sheets/prepare_rounded_cap_texture_master.py',
 'proposedPublicFixture':'tests/texture_rounded_cap_master_test.py',
 'prospectivePolicy':{
  'name':'rounded-caps-v1','referenceSize':[64,64],
  'profile':'paraboloid','plateHeight':.54,'capAmplitude':.07,'microAmplitude':.004,
  'heads':[{'label':h['label'],'centre':h['centreNativePixelEdges'],'radii':h['radiiNativePixels']}for h in measure['heads']]
 },
 'formula':'float64 plate + amplitude*max(0,1-rSquared) + (unquantizedCraftDetail-.5)*(2*micro), then one float32 cast',
 'coordinateConvention':'Evaluate native pixel-edge coordinates at canonical texel centres; x=(i+.5)/8,y=(j+.5)/8 for actual512master.',
 'continuity':'Geometry term is C0 at ellipse edge; finite inward slope but not C1. No binary height jump.',
 'publicationReuse':'Existing register_layered_texture_boundary.publish_exclusive, unchanged; complete private package and first-observation custody before no-replace publication.',
 'sourceReplayReuse':'Unchanged actual prepare CLI replay of all3initial package bytes plus genuine source/master row; frozen craft/finish/derive remain unchanged.',
 'inspectedTools':[w(q)for q in tools],
 'verificationPlan':'Seven public fixture groups in PLAN.md plus independent actual one-trial math/material/physical/preview/custody. No production code or fixtures run by this planning task.',
 'priorFrozenInputsStable':True,'priorFrozenInputCount':82,
 'generationCount':1,'newSourceCount':0,'tierMaps':0,
 'nextOwner':'Root coordinator and designated independent planner',
 'nextAction':'Independent exact ellipse/formula/guard/publication/fixture review before implementation, recipe trial or tier derivation.',
 'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()
}
path=DOC/'analytic-cap-plan.json'
with path.open('x')as f:f.write(json.dumps(plan,indent=2)+'\n')
inputs={str(q.relative_to(ROOT)):sha(q)for q in sorted(DOC.iterdir())if q.is_file()}
handoff={
 'schemaVersion':1,'state':plan['state'],'plan':w(path),'narrative':w(DOC/'PLAN.md'),
 'measurement':w(DOC/'ellipse-measurements-v1.json'),'frozenPlanInputs':inputs,
 'inputCount':len(inputs),'priorHoldFreezeStable':True,'priorHoldFrozenInputs':82,
 'nextAction':plan['nextAction']
}
path=DOC/'plan-handoff.json'
with path.open('x')as f:f.write(json.dumps(handoff,indent=2)+'\n')
assert all(sha(ROOT/f)==h for f,h in freeze['frozenInputs'].items())
for path in [DOC/'analytic-cap-plan.json',DOC/'PLAN.md',DOC/'ellipse-measurements-v1.json',DOC/'plan-handoff.json']:
 print(str(path.relative_to(ROOT)),sha(path))
print('Plan inputs',len(inputs),'prior82inputs unchanged; no implementation/trial/tiers.')
