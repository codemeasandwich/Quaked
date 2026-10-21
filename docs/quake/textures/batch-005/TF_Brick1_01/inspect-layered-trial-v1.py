"""Author self-review of one frozen layered scalar; no height or tier authoring."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,json,hashlib,datetime,sys
R=Path(__file__).resolve().parents[5];H=Path(__file__).parent;O=H/'layered-trial-v1-review';O.mkdir(exist_ok=True);P=R/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-005/TF_Brick1_01/master-layered-v1';M=json.loads((P/'master.json').read_text());recipe_path=H/'layered-recipe-proposal-v4.json';recipe=json.loads(recipe_path.read_text())
def bind(p):return {'file':str(p.relative_to(R)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
assert bind(recipe_path)['sha256']=='8793c794047079196d81c50c7b0436fae7a6d54fcdab1ab5f79e2535211a73fc';assert bind(P/'master.json')['sha256']=='dc7e0239301e724363f432739960a6342276adcf9a2cfdf34cefe770a84cf3c6';assert bind(P/'height.npy')['sha256']=='718d211590d99dd90e908dbd26abf950a60d2de90c729af9272534d3ad9fae64'
parent=R/recipe['sourceMasterPackage'];assert (P/'color.png').read_bytes()==(parent.parent/'color.png').read_bytes();rgb=Image.open(P/'color.png').convert('RGB');wpath=H/'layered-trial-v1-rgb-witnesses.json';w=json.loads(wpath.read_text());assert w['registeredRGB']==bind(P/'color.png');height=np.load(P/'height.npy',allow_pickle=False);assert height.dtype==np.float32 and height.shape==(1024,1024)and np.isfinite(height).all()and height.min()>=0 and height.max()<=1
mask=np.asarray(Image.open(H/'layer-plan-rgb-v4/proposed-mortar-mask.png').convert('L'))/255;stats=[]
for row in w['samples']:
 x0,y0,x1,y1=row['rectMasterPixelEdges'];v=height[y0:y1,x0:x1];stats.append({**row,'lowerMaskFraction':float((mask[y0:y1,x0:x1]>.5).mean()),'meanHeight':float(v.mean()),'medianHeight':float(np.median(v)),'minMax':[float(v.min()),float(v.max())],'p10p90':[float(np.percentile(v,p))for p in (10,90)]})
sys.path.insert(0,str(R/'tools'));from craft_normals import normals_from_height
_,normal=normals_from_height(height,.3,.5);Image.fromarray(np.uint8(np.round(np.clip(normal*.5+.5,0,1)*255))).save(O/'actual-float-UVXYZ-display.png')
# Labelled diagnostic scales. These PNGs are not authoring maps or tier exports.
Image.fromarray(np.uint8(np.round(height*255))).save(O/'actual-float-height-absolute-display.png');range_display=np.clip((height-.93)/.06,0,1);Image.fromarray(np.uint8(np.round(range_display*255))).save(O/'actual-float-height-range-093-099-display.png')
lights=[]
for name,vector in [('standard-A',[.65,.35,.68]),('standard-B',[-.65,-.35,.68]),('grazing-A',[.95,.25,.18]),('grazing-B',[-.95,-.25,.18])]:
 l=np.asarray(vector);l/=np.linalg.norm(l);shade=.2+.8*np.maximum(0,np.einsum('ijk,k->ij',normal,l));grey=Image.fromarray(np.uint8(np.round(np.clip(shade*255,0,255)))).convert('RGB');grey.save(O/('actual-float-grey-'+name+'.png'));lights.append((name,grey))
for label,im in [('RGB',rgb),('height-range-093-099',Image.fromarray(np.uint8(np.round(range_display*255))).convert('RGB')),('UVXYZ',Image.fromarray(np.uint8(np.round(np.clip(normal*.5+.5,0,1)*255))))]+lights:
 rep=Image.new('RGB',(2048,2048))
 for x in (0,1024):
  for y in (0,1024):rep.paste(im,(x,y))
 rep.crop((960,0,1088,1024)).save(O/(label+'-literal-X.png'));rep.crop((0,960,1024,1088)).save(O/(label+'-literal-Y.png'));rep.crop((960,960,1088,1088)).save(O/(label+'-literal-corners.png'))
profiles=[]
for label,y,x0,x1 in [('c14j3-physical-mortar',928,434,475),('c15j2-physical-mortar',993,96,126)]:
 cols=[]
 for x in range(x0,x1):cols.append({'masterX':x,'RGB':list(map(int,np.asarray(rgb)[y,x])),'height':float(height[y,x]),'lowerMask':bool(mask[y,x]>.5),'normalXYZ':list(map(float,normal[y,x]))})
 profiles.append({'label':label,'masterY':y,'samples':cols})
 # Literal RGB/height/UVXYZ/lights crop shown at6xnearest only for reading pixels.
 y0=max(0,y-24);y1=min(1024,y+24);panels=[('RGB',rgb),('height .93-.99',Image.fromarray(np.uint8(np.round(range_display*255))).convert('RGB')),('UVXYZ',Image.fromarray(np.uint8(np.round(np.clip(normal*.5+.5,0,1)*255))))]+lights
 cellw=(x1-x0)*6;cellh=(y1-y0)*6;sheet=Image.new('RGB',(cellw*len(panels),cellh+28),(20,20,20));d=ImageDraw.Draw(sheet)
 for i,(name,im)in enumerate(panels):sheet.paste(im.crop((x0,y0,x1,y1)).resize((cellw,cellh),Image.Resampling.NEAREST),(i*cellw,28));d.text((i*cellw+2,3),name,fill='white')
 sheet.save(O/(label+'-actual-geometry-contact.png'))
physical={'lowerMaskScalarRange':[float(height[mask>.5].min()),float(height[mask>.5].max())],'outsideMaskScalarRange':[float(height[mask<=.5].min()),float(height[mask<=.5].max())],'strictMaskPlaneOrdering':bool(height[mask>.5].max()<height[mask<=.5].min()),'normalTiltDegreesP50P95P99Max':[float(np.percentile(np.degrees(np.arccos(np.clip(normal[:,:,2],-1,1))),p))for p in (50,95,99,100)]}
report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewType':'Author self-review, not independent','verdict':'Actual frozen layeredtrial measured; physicalART decision in accompanying review, no tiers authorised','approval':bind(H/'root-layer-trial-approval-v1.json'),'execution':bind(H/'layered-trial-v1-execution.json'),'masterPackage':bind(P/'master.json'),'RGB':bind(P/'color.png'),'height':bind(P/'height.npy'),'RGBByteIdenticalParent':True,'actualRecipePinned':bind(recipe_path),'fieldParameters':{k:recipe['layering'][k]for k in recipe['layering']if k!='brickRegions'},'RGBWitnessesFixedBeforeHeightRead':bind(wpath),'samples':stats,'physical':physical,'sourceRGBRowProfiles':profiles,'normalMath':{'file':str((R/'tools/craft_normals.py').relative_to(R)),'sha256':bind(R/'tools/craft_normals.py')['sha256'],'function':'normals_from_height actualfullfloat1024, strength.3, cap.5; cyclicUVscaledsc38.4; PNGdisplayquantizationonly'},'producer':bind(Path(__file__)),'outputs':[bind(p)for p in sorted(O.glob('*.png'))],'historicalLimits':'Old pigment-heightHOLD and V3falsefacecuts/mixedwitness retained; originalimageinvocation/calltotalunknown; currenttrial made0generations and0tiers.','remaining':'IndependentphysicalART/root review before any512/1024 tier.'};(H/'layered-trial-v1-observations.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'physical':physical,'samples':[{'label':x['label'],'role':x['classification'],'meanHeight':x['meanHeight'],'minMax':x['minMax']}for x in stats]}))
