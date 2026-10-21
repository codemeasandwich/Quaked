"""City8_2 one-shot X candidate diagnostics; no authoring or acceptance."""
from pathlib import Path
import hashlib,importlib.util,json,sys
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[6];E=Path(__file__).resolve().parent
A=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/parallel-020/city8_2'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('x_public_oracle',ROOT/'tests/texture_boundary_x_registration_test.py');o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
sys.path.insert(0,str(ROOT/'tools'));from craft_normals import normals_from_height,craft
old=Image.open(A/'master/color.png').convert('RGB');new=Image.open(A/'master-x-v1/color.png').convert('RGB');h=np.load(A/'master-x-v1/height.npy',allow_pickle=False);oldh=np.load(A/'master/height.npy',allow_pickle=False)
expected,raw,smooth=o.x_oracle(old);assert expected.tobytes()==new.tobytes()
m=json.loads((A/'master-x-v1/master.json').read_text());replay,_=craft(np.asarray(new,dtype=float)/255,m['height']['profile'],quantize_height=False);np.testing.assert_array_equal(h,replay.astype('float32'))

def save(image,name):
 p=E/name;assert not p.exists();image.save(p);return {'file':str(p.relative_to(ROOT)),'sha256':sha(p)}
def join(im,axis):
 a=np.asarray(im);return Image.fromarray(np.concatenate((a[:,-64:],a[:,:64]),axis=1)if axis=='x'else np.concatenate((a[-64:],a[:64]),axis=0))
def side(a,b,label_a,label_b):
 canvas=Image.new('RGB',(a.width+b.width+20,max(a.height,b.height)+30),(28,30,33));d=ImageDraw.Draw(canvas);d.text((0,5),label_a,fill='white');d.text((a.width+20,5),label_b,fill='white');canvas.paste(a,(0,30));canvas.paste(b,(a.width+20,30));return canvas
records=[]
records.append(save(side(join(old,'x').resize((256,1024),Image.Resampling.NEAREST),join(new,'x').resize((256,1024),Image.Resampling.NEAREST),'old X at1:1x2','one-shot X at1:1x2'),'master-x-join.png'))
records.append(save(side(join(old,'y'),join(new,'y'),'old Y','new Y (no Y operator)'),'master-y-join.png'))
records.append(save(Image.fromarray(np.tile(np.asarray(new),(2,2,1))),'master-repeat-2x2.png'))
records.append(save(Image.fromarray(np.roll(np.asarray(new),(256,256),(0,1))),'master-rolled-corners.png'))
for name,mask in [('negative',np.any(raw<0,axis=2)),('overflow',np.any(raw>255,axis=2))]:records.append(save(Image.fromarray((mask*255).astype('uint8')),'master-clipping-'+name+'.png'))
_,normal=normals_from_height(h,.3,.5)
lights=[]
for direction in(np.array([.6,.3,.75]),np.array([-.6,-.3,.75])):
 direction/=np.linalg.norm(direction);light=.35+.65*np.clip((normal*direction).sum(2),0,1);lights.append(Image.fromarray(np.uint8(np.clip(np.asarray(new,dtype=float)*light[:,:,None],0,255))))
records.append(save(side(lights[0],lights[1],'master opposed A','master opposed B'),'master-opposed-lights.png'))
records.append(save(side(join(lights[0],'x').resize((256,1024),Image.Resampling.NEAREST),join(lights[1],'x').resize((256,1024),Image.Resampling.NEAREST),'X opposed A','X opposed B'),'master-x-opposed-lights.png'))
records.append(save(Image.fromarray(np.round(h*255).astype('uint8')),'master-height-diagnostic.png'))
prior=json.loads((ROOT/'docs/quake/textures/parallel-020/root-independent-art-diagnostics/selected-visible-depth-witnesses.json').read_text())['textures']['city8_2'];witnesses=[];annotated=new.copy();draw=ImageDraw.Draw(annotated)
for index,pair in enumerate(prior):
 def sample(a,key):
  x,y=pair[key];return float(a[y-2:y+3,x-2:x+3].mean())
 face,joint=sample(h,'faceMasterXY'),sample(h,'jointMasterXY')
 witnesses.append({'faceMasterXY':pair['faceMasterXY'],'jointMasterXY':pair['jointMasterXY'],'oldFace':sample(oldh,'faceMasterXY'),'oldJoint':sample(oldh,'jointMasterXY'),'newFace':face,'newJoint':joint,'faceAboveJoint':face>joint,'locationsUnchanged':True})
 for key,color in [('faceMasterXY','lime'),('jointMasterXY','red')]:
  x,y=pair[key];draw.ellipse((x-5,y-5,x+5,y+5),outline=color,width=2);draw.text((x+7,y-5),str(index+1),fill=color)
records.append(save(annotated,'master-physical-witnesses.png'))
report={'scope':'One city8_2 X-only trial, independent correctedRGB/float replay, clipping and physical point diagnostics before tier export; no art acceptance','nativeIdentity':'712726be7f599dd7d1d755bcb3c7de16bd36fd19e2d619c6305f48979abce772','masterPackage':{'file':str((A/'master-x-v1/master.json').relative_to(ROOT)),'sha256':sha(A/'master-x-v1/master.json')},'exactIndependentXRGB':True,'exactFinalFloatHeightReplay':True,'negativeChannels':int((raw<0).sum()),'overflowChannels':int((raw>255).sum()),'negativePixels':int(np.any(raw<0,2).sum()),'overflowPixels':int(np.any(raw>255,2).sum()),'meanAbsoluteCorrection':float(np.abs(smooth).mean()),'maximumAbsoluteCorrection':float(np.abs(smooth).max()),'postRoundMeanRGBChange':(np.asarray(new,dtype=float).mean((0,1))-np.asarray(old,dtype=float).mean((0,1))).tolist(),'physicalWitnesses':witnesses,'diagnostics':records,'qualification':'Diagnostics only; actual material/geometry/repeats/physical-lighting review required; no score accepts ART.'}
p=E/'master-diagnostics.json';assert not p.exists();p.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
