"""Validate only existing neutral role-mask geometry. No height composition."""
from pathlib import Path
import json,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
import matplotlib
matplotlib.use('Agg')
from matplotlib import pyplot as plt
R=Path.cwd();D=Path(__file__).resolve().parent;B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-12-ttex255';M=B/'masters/ttex255-v1';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();ref=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p)}
sys.path.insert(0,str(R/'tools/texture_sheets'))
from update_level_sheets import brick_mask
from prepare_layered_texture_master import validate_layering
baseline={p:sha(p)for p in[M/'color.png',M/'height.npy',M/'master.json',B/'generated/ttex255.png']}
g=json.loads((D/'snow-complement-geometry-draft-v6.json').read_text());regions=g['brickRegions'];holes=np.asarray(Image.open(D/'enclosed-snow-pocket-evidence-v6.png'))>0;labels,n=ndi.label(holes);hole_regions=[]
# Keep source-visible large snow pockets distinct; no silent fill into rock face.
for ident in range(1,n+1):
 fig,ax=plt.subplots();cs=ax.contour(np.pad((labels==ident).astype(float),1),levels=[.5]);paths=[p-np.array([1,1])for p in cs.allsegs[0]];plt.close(fig)
 assert len(paths)==1
 from matplotlib.path import Path as MPath
 path=MPath(paths[0]);poly=path.cleaned(simplify=True,curves=False,stroke_width=1).vertices
 # Matplotlib clean appends CLOSEPOLY marker; remove it, not geometric vertices.
 pp=paths[0][::3]
 if np.linalg.norm(pp[0]-pp[-1])<1e-9:pp=pp[:-1]
 # Use exact source contour through RDP1pixel to fit existing polygon schema.
 def dp(p,tol):
  if len(p)<3:return p
  a,b=p[0],p[-1];v=b-a;ds=np.linalg.norm(p-a,axis=1)if np.linalg.norm(v)<1e-12 else np.abs(np.cross(v,p-a))/np.linalg.norm(v);i=int(np.argmax(ds))
  if ds[i]<=tol:return np.array([a,b])
  return np.vstack((dp(p[:i+1],tol)[:-1],dp(p[i:],tol)))
 p=paths[0][:-1]+.5;k=int(np.argmax(np.linalg.norm(p-p[0],axis=1)));p=np.vstack((dp(p[:k+1],1.)[:-1],dp(np.vstack((p[k:],p[:1])),1.)[:-1]));assert 3 <= len(p) <= 64
 region={'polygon':(p/8).tolist()};hole_regions.append({'pocketId':ident,'region':region,'role':'Proposed lower snow-filled recess' if ident==1 else 'Uncertain cap/crevice or boundary pocket; retained with upper parent body, not included in lower recipe'})
regions=regions+[x['region']for x in hole_regions if x['pocketId']==1]
lay={'referenceSize':[128,128],'facingHeight':.80,'brickHeight':.55,'chipFloor':.70,'microAmplitude':.05,'bevelPixels':.5,'brickRegions':regions};validate_layering(lay,(128,128))
mask=brick_mask((1024,1024),lay);rock=np.asarray(Image.open(D/'rock-body-proposal-v6.png'))>0;rock |= holes & (labels!=1);expected=~rock;changed=(mask>.5)!=expected
edge=np.zeros_like(rock)
for axis in(0,1):edge|=rock!=np.roll(rock,1,axis);edge|=rock!=np.roll(rock,-1,axis)
dist=ndi.distance_transform_edt(~np.tile(edge,(3,3)))[1024:2048,1024:2048];rim=np.zeros_like(rock);rim[0]=True;rim[-1]=True;rim[:,0]=True;rim[:,-1]=True
maxdist=float(dist[changed&~rim].max());bad=changed&(dist>5)&~rim
Image.fromarray(np.round(mask*255).astype('uint8')).save(D/'refined-lower-snow-mask-v6.png')
col=np.zeros((1024,1024,3),dtype='uint8');col[changed&expected]=[0,200,255];col[changed&~expected]=[255,100,0];Image.fromarray(col).save(D/'refined-complement-error-v6.png')
c=Image.open(M/'color.png').convert('RGBA');ov=np.zeros((1024,1024,4),dtype='uint8');ov[mask<=.5]=[230,0,230,70];ov[holes & (labels==1)]=[0,230,255,90];ov[holes & (labels!=1)]=[255,210,0,100];Image.alpha_composite(c,Image.fromarray(ov)).convert('RGB').save(D/'refined-complement-source-overlay-v6.png')
mp=json.loads((M/'master.json').read_text());proof=D.parent/'independent-source-master/source-master-proof-v1.json';assert sha(proof)=='b5df3663628aab06857345947cbcb4675a00a820b825995487d90772b46eeba9'
recipe={'schemaVersion':1,'policy':'layered-veneer','nativeIdentity':'3d7ed8a7e273c65f769cc6e87f06c7291c2d206e69ba0d05d7813c154819eb8e','name':'ttex255','edition':'portals','nativeDimensions':[128,128],'sourceMasterPackage':str((M/'master.json').relative_to(R)),'sourceMasterPackageSha256':sha(M/'master.json'),'sourceVerification':ref(proof),'originalSha256':mp['inputs']['original']['sha256'],'authoringDiffuseSha256':mp['color']['sha256'],'authoredAtMasterDimensions':[1024,1024],'layering':lay}
rp=B/'relief/recipe-proposal-v4.json';rp.write_text(json.dumps(recipe,indent=2)+'\n');assert all(sha(p)==s for p,s in baseline.items())
r={'schemaVersion':1,'verdict':'PASS bounded existing mask-schema and local contour representation ONLY; independent physical plan review pending','recipeProposal':ref(rp),'sourceGuide':ref(D/'rock-feature-guide-v6.json'),'physicalRoleReview':ref(D/'physical-pocket-topology-review-v5.json'),'unchangedComplementMethod':ref(D/'diagnose-complement-geometry-v6.py'),'sameSourceRoleBitmapsV3V6Exact':all((D/(name+'-v3.png')).read_bytes()==(D/(name+'-v6.png')).read_bytes()for name in('rock-body-proposal','ground-snow-evidence','unresolved-contact-evidence','enclosed-snow-pocket-evidence','pale-specks-on-rock-body')),'lowerPolygonCount':len(regions),'maxPolygonVertices':max(len(x['polygon'])for x in regions),'snowPocketPolygons':hole_regions,'lowerPocketIds':[1],'retainedUpperPocketIds':[2,3,4],'sourceRoleComparison':{'changedPixels':int(changed.sum()),'changedFraction':float(changed.mean()),'maximumDistanceAwayFromClassBoundaryExcludingOutermostImagePixel':maxdist,'differenceBeyondFiveMasterPixelsAndNotImageEdge':int(bad.sum()),'fivePixelBoundMeaning':'3-master-pixel contour representation plus source smoothing/raster interface. Diagnostic locality check, not a material tolerance or relaxed production guard.'},'outermostPixelContactUnqualified':True,'sourceContactMeaning':'Actual native and source have contact phase differences. This is context, not a score failure; no source edge equality is imposed. Root must inspect actual intent and any new visibly straight cuts.','currentUpperLowerRoleEdgeMismatch':{'X':float((mask[:,0]!=mask[:,-1]).mean()),'Y':float((mask[0]!=mask[-1]).mean())},'diagnosticScript':ref(Path(__file__)),'edgeMaskObservations':ref(D/'wrapped-edge-mask-role-observations-v6.json'),'noHeightComposition':True,'sourceRGBFloatRawPackageUnchanged':{str(p.relative_to(R)):s for p,s in baseline.items()},'remainingHolds':['Actual native/source edge phase differences are contextual observations, not a score failure. Do not force edge equality; inspect any new straight cuts against actual intent.','Pocket1 alone is proposed lower recess; Pocket2 cap/crevice and tiny pockets3/4 remain with upper body as uncertain. Underlying bed elevations unmeasured.','9002 ambiguous source transition pixels and17 tiny pale frost/mineral speck pixels are explicit review evidence.','No actual corrected scalar or opposed lights exists; shared-detail rock facet preservation remains unproved.'],'notRun':'compose_layered, guarded CLI, tiers, new generation, producer/API changes, Git/shared/build effects'}
assert not bad.any(),'Contour representation escaped local boundary support';(D/'refined-guide-complement-validation-v6.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({k:r[k]for k in('verdict','lowerPolygonCount','maxPolygonVertices','sameSourceRoleBitmapsV3V6Exact','sourceRoleComparison','currentUpperLowerRoleEdgeMismatch')},indent=2))
