"""One source-specific wider cap proposal; no new master or scalar file."""
from pathlib import Path
import json,hashlib,sys
import numpy as np
ROOT=Path(__file__).resolve().parents[5];DOC=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
from update_level_sheets import brick_mask
from craft_normals import gblur
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def w(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p)}
p=DOC/'shallow-fastener-proposal-v2.json';j=json.loads(p.read_bytes());proof=DOC/'independent-source-master/source-master-proof-v1.json';pf=json.loads(proof.read_bytes());assert pf['verdict'].startswith('PASS')
assert pf['materials'][0]['nativeIdentity']==j['nativeIdentity']and pf['materials'][0]['masterPackage']['sha256']==j['sourceMasterPackage']['sha256']
j['proposedLayering']['bevelPixels']=4;j['bevelSigmaMasterPixels']=8
j['state']='REVISED PROPOSAL ONLY; root exact wider rounded-cap review before one source-specific trial'
j['sourceVerification']=w(proof);j['supersedesPlanningProposal']=w(p)
j['revision']='Root actual source review rejected v2 1.2-master-pixel shoulder as too narrow for convex heads. V3 changes only bevelPixels to4 (8masterpixel sigma), preserving exact v2 polygon supports and .61/.54/.57/.004 planes/detail. One chosen source-specific wider cap trial, not parameter search.'
j['parameterBasis']['bevel']='Source head outline radii are listed individually below, before inclusive polygon raster edges. Sigma8 is roughly one third of these radii, spreading the shoulder substantially through each cap instead of leaving a near-flat plateau. Unchanged guard maximum4 at256reference gives8masterpixels at512. No support outside the eight existing heads is raised; all perimeter remains lower plate.'
j['supportedPolicyLimit']='Existing wrapped Gaussian cap rounding is not calibrated dome reconstruction. The wider shoulder is one source-specific convexity trial. Actual neutral opposed lights and scalar profiles must establish convex shape; preserve a HOLD if flat plateaus, rings or colour-driven hollows remain. No automatic second trial or geometry PASS.'
mask=brick_mask((512,512),j['proposedLayering']);blur=gblur(mask,8);plane=np.where(mask>.5,.54,.61-(.61-.57)*np.minimum(blur*2,1));oldblur=gblur(mask,1.2);oldplane=np.where(mask>.5,.54,.61-(.61-.57)*np.minimum(oldblur*2,1));heads=[]
centres=[('H1',45,44),('H2',255,44),('H3',466,44),('H4',44,255),('H5',466,255),('H6',45,466),('H7',255,466),('H8',466,466)]
for label,x,y in centres:
 outline=next(q['outlineMasterPixels']for q in j['sourceMeasuredUpperHeadOutlines']if q['label']==label);xs,ys=zip(*outline);xr=(max(xs)-min(xs))/2;yr=(max(ys)-min(ys))/2;rad=[]
 for radius in[0,4,8,12,16,20,24]:
  xy=[(x+radius,y),(x-radius,y),(x,y+radius),(x,y-radius)]
  rad.append({'radiusMasterPixels':radius,'fourDirections':[{'pixel':[xx,yy],'lowerPlateMask':bool(mask[yy,xx]>.5),'relativeRoundedHeadPlane':float(plane[yy,xx]),'oldNarrowPlane':float(oldplane[yy,xx])}for xx,yy in xy]})
 heads.append({'label':label,'measuredCapCentreMaster':[x,y],'outlineApproximateRadiiMaster':[xr,yr],'sigmaToRadius':[8/xr,8/yr],'expectedShoulder':'Smooth inward shoulder across the head at8masterpixel Gaussian sigma; actual source detail and convexity remain subject to one reviewed guarded trial.','predictedPlaneProfilesNoPhotoDetail':rad})
j['perHeadRoundingBasis']=heads
j['predictionScope']='In-memory existing mask/blur plane values only. No source-detail scalar was composed and no master/NPY/map was written. This prediction is not actual final convexity evidence.'
j['diagnosticViews']=[w(DOC/'proposed-head-plate-overlay-v2.png'),w(DOC/'proposed-eight-head-details-v2.png')]
j['overlayBinding']='Exact v2 RGB/support overlays are unchanged because v3 changes only cap-rounding sigma.'
j['geometryBuilder']=j.pop('tool');j['tool']=w(Path(__file__))
j['draftHistory']=w(DOC/'shallow-fastener-proposal-v3-initial-draft.json')
j['draftCorrection']='Initial v3 draft described approximate radii too narrowly and linked the v2 geometry builder as its tool. Final v3 retains exact per-head radii and this actual revision script; the initial draft remains historical and unreviewed.'
j['nextAction']='Root exact wider rounded-cap trial review; then one guarded existing CLI successor bound to genuine proof. Actual float and neutral convexity before tiers.'
p=DOC/'shallow-fastener-proposal-v3.json'
with p.open('x')as f:f.write(json.dumps(j,indent=2)+'\n')
print(json.dumps({'proposal':w(p),'sourceProof':w(proof),'perHeadRadii':[(q['label'],q['outlineApproximateRadiiMaster'])for q in heads]}))
