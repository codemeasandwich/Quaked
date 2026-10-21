"""Author pre-tier actual scalar replay and physical source diagnostics only."""
import hashlib,json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5];DOC=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-14-rtex336';MASTER=BASE/'masters-layered/rtex336'
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
from prepare_texture_master import craft
from prepare_layered_texture_master import compose_layered
from craft_normals import normals_from_height
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def w(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p)}
recipe=json.loads((BASE/'relief/rtex336-shallow-masonry-v1.json').read_bytes());review=json.loads((DOC/'root-shallow-masonry-plan-review-v1.json').read_bytes());assert review['verdict'].startswith('PASS')and review['approvedLayering']==recipe['layering']
mp=json.loads((MASTER/'master.json').read_bytes());rgb=np.asarray(Image.open(MASTER/'color.png').convert('RGB'));h=np.load(MASTER/'height.npy',allow_pickle=False)
assert (MASTER/'color.png').read_bytes()==(BASE/'masters/rtex336-initial/color.png').read_bytes()
detail, _ = craft(rgb.astype(float)/255, mp['height']['profile'], quantize_height=False)
expected, mask, sigma = compose_layered(detail, recipe['layering'])
assert np.array_equal(expected, h) and h.dtype == np.float32 and np.isfinite(h).all()
assert h[mask>.5].max()<h[mask<=.5].min()
initial=json.loads((DOC/'initial-physical-check.json').read_bytes());samples=[]
# Additional actual support-edge witnesses; do not amend initial sealed HOLD samples.
initial_h=np.load(BASE/'masters/rtex336-initial/height.npy',allow_pickle=False)
for label,kind,x,y in [('I1','horizontal soil/stone edge',200,270),('I2','top vertical soil/stone edge',297,150),('IX','second-course side contact edge',12,400),('IY','bottom/top soil/stone edge',350,6)]:
 ys=(np.arange(y-3,y+4)%1024)[:,None];xs=(np.arange(x-3,x+4)%512)[None,:]
 initial['samples'].append({'label':label,'sourceClassCandidate':kind,'masterPixel':[x,y],'heightMean':float(initial_h[ys,xs].mean())})
for row in initial['samples']:
 x,y=row['masterPixel'];ys=(np.arange(y-3,y+4)%1024)[:,None];xs=(np.arange(x-3,x+4)%512)[None,:];v=h[ys,xs];m=mask[ys,xs]
 samples.append({'label':row['label'],'sourceClass':row['sourceClassCandidate'],'masterPixel':[x,y],'radius':3,'heightCenter':float(h[y,x]),'heightMean':float(v.mean()),'heightRange':[float(v.min()),float(v.max())],'maskFraction':float(m.mean()),'initialHeightMean':row['heightMean'],'semanticLimit':'actual contact window can be mixed; mask is raster support, not material purity'if row['label']in('H1','H2','H3','V1','V3','X2','Y','I1','I2','IX','IY')else'grey/black marks remain face-plane variation, not broad basins'})
by={p['label']:p for p in samples};assert min(by[k]['heightMean']for k in('A','B','C','D','E','F','S1','S2','S3'))>max(by[k]['heightMean']for k in('H1','H2','H3','V1','V3','X2','Y'))
_,normal=normals_from_height(h,.3,.5);neutral=Image.new('RGB',(1024,1024));textured=Image.new('RGB',(1024,1024));views=[]
for i,sign in enumerate((1,-1)):
 l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);gain=.35+.65*np.maximum(0,(normal*l).sum(2));neutral.paste(Image.fromarray(np.rint(180*gain).astype('uint8')).convert('RGB'),(i*512,0));textured.paste(Image.fromarray(np.rint(np.clip(rgb*gain[:,:,None],0,255)).astype('uint8')),(i*512,0))
neutral.save(DOC/'layered-master-neutral-opposed.png');textured.save(DOC/'layered-master-textured-opposed.png')
height_rgb=np.repeat(np.rint(h[:,:,None]*255).astype('uint8'),3,2);xyz=np.rint(np.clip((normal*.5+.5)*255,0,255)).astype('uint8')
for name,a in [('RGB',rgb),('height',height_rgb),('XYZ',xyz)]:
 Image.fromarray(np.tile(a,(2,2,1))).save(DOC/('layered-master-'+name+'-repeat.png'))
panel=Image.new('RGB',(1200,1110),(25,27,30));draw=ImageDraw.Draw(panel)
for i,(name,a)in enumerate([('RGB',rgb),('height',height_rgb),('XYZ',xyz)]):
 x=i*136;draw.text((x+2,2),name+' X fullheight',fill='white');panel.paste(Image.fromarray(np.concatenate([a[:,-32:],a[:,:32]],1)),(x,24))
 draw.text((440,4+i*120),name+' Y fullwidth and corner',fill='white');panel.paste(Image.fromarray(np.concatenate([a[-32:],a[:32]],0)),(440,28+i*120));panel.paste(Image.fromarray(np.roll(np.roll(a,32,axis=0),32,axis=1)[:64,:64]),(980,28+i*120))
panel.save(DOC/'layered-master-literal-contacts.png')
report={'schemaVersion':1,'verdict':'PASS author exact layered scalar replay and sampled body/stain/contact hierarchy; actual ART separately reviewed','scope':'Canonical pre-tier only; not independent final source/ART acceptance','masterPackage':w(MASTER/'master.json'),'height':{'sha256':sha(MASTER/'height.npy'),'range':[float(h.min()),float(h.max())],'float32':True,'RGBUnchanged':True,'maskFraction':float(mask.mean()),'sigmaMasterPixels':sigma},'samples':samples,'sourceClassification':w(DOC/'initial-physical-witnesses.png'),'reviewedRecipe':w(BASE/'relief/rtex336-shallow-masonry-v1.json'),'independentPlan':w(DOC/'root-shallow-masonry-plan-review-v1.json'),'views':{str(p.relative_to(ROOT)):sha(p)for p in DOC.glob('layered-master-*.png')},'limits':['H/V/X/Y windows are actual radius3 interfaces; mixed support fractions retained.','Second/fourth X source-visible contacts only; upper/third X faces unmasked. Full X/Y/corners separately viewed.','Subtle relative scalar geometry is not measured photogrammetry or calibrated displacement.']}
with(DOC/'layered-pre-tier-check.json').open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'masterPackage':report['masterPackage'],'height':report['height'],'samples':samples},indent=2))
