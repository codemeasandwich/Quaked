"""Author pre-tier actual scalar replay and physical source diagnostics only."""
import hashlib,json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5];DOC=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-13-ttex262';MASTER=BASE/'masters-layered/ttex262'
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
from prepare_texture_master import craft
from prepare_layered_texture_master import compose_layered
from craft_normals import normals_from_height
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def w(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p)}
recipe=json.loads((BASE/'relief/ttex262-flat-masonry-v1.json').read_bytes());review=json.loads((DOC/'root-flat-masonry-plan-review-v1.json').read_bytes());assert review['verdict'].startswith('PASS')and review['approvedLayering']==recipe['layering']
mp=json.loads((MASTER/'master.json').read_bytes());rgb=np.asarray(Image.open(MASTER/'color.png').convert('RGB'));h=np.load(MASTER/'height.npy',allow_pickle=False)
assert (MASTER/'color.png').read_bytes()==(BASE/'masters/ttex262-initial/color.png').read_bytes()
detail,_=craft(rgb.astype(float)/255,mp['height']['profile'],quantize_height=False);expected,mask,sigma=compose_layered(detail,recipe['layering']);assert np.array_equal(expected,h)and h.dtype==np.float32and np.isfinite(h).all()
assert h[mask>.5].max()<h[mask<=.5].min()
initial=json.loads((DOC/'initial-physical-check.json').read_bytes());samples=[]
for row in initial['samples']:
 x,y=row['masterPixel'];ys=(np.arange(y-3,y+4)%512)[:,None];xs=(np.arange(x-3,x+4)%512)[None,:];v=h[ys,xs];m=mask[ys,xs]
 samples.append({'label':row['label'],'sourceClass':row['sourceClassCandidate'],'masterPixel':[x,y],'radius':3,'heightCenter':float(h[y,x]),'heightMean':float(v.mean()),'heightRange':[float(v.min()),float(v.max())],'maskFraction':float(m.mean()),'initialHeightMean':row['heightMean'],'semanticLimit':'contact mixed/inferred; mask is raster support, not proof of material purity'if row['label']in('H','V','X','Y')else'grey/black marks remain face-plane variation, not broad basins'})
by={p['label']:p for p in samples};assert min(by[k]['heightMean']for k in('A','B','C','D','S1','S2'))>max(by[k]['heightMean']for k in('H','V','X','Y'))
_,normal=normals_from_height(h,.3,.5);neutral=Image.new('RGB',(1024,512));textured=Image.new('RGB',(1024,512));views=[]
for i,sign in enumerate((1,-1)):
 l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);gain=.35+.65*np.maximum(0,(normal*l).sum(2));neutral.paste(Image.fromarray(np.rint(180*gain).astype('uint8')).convert('RGB'),(i*512,0));textured.paste(Image.fromarray(np.rint(np.clip(rgb*gain[:,:,None],0,255)).astype('uint8')),(i*512,0))
neutral.save(DOC/'layered-master-neutral-opposed.png');textured.save(DOC/'layered-master-textured-opposed.png')
height_rgb=np.repeat(np.rint(h[:,:,None]*255).astype('uint8'),3,2);xyz=np.rint(np.clip((normal*.5+.5)*255,0,255)).astype('uint8')
for name,a in [('RGB',rgb),('height',height_rgb),('XYZ',xyz)]:
 Image.fromarray(np.tile(a,(2,2,1))).save(DOC/('layered-master-'+name+'-repeat.png'))
panel=Image.new('RGB',(1024,1080),(25,27,30));draw=ImageDraw.Draw(panel)
for i,(name,a)in enumerate([('RGB',rgb),('height',height_rgb),('XYZ',xyz)]):
 x=i*272;draw.text((x+2,2),name+' X fullheight',fill='white');panel.paste(Image.fromarray(np.concatenate([a[:,-64:],a[:,:64]],1)),(x,24));draw.text((2,550+i*160),name+' Y fullwidth',fill='white');panel.paste(Image.fromarray(np.concatenate([a[-64:],a[:64]],0)),(0,574+i*160));panel.paste(Image.fromarray(np.roll(np.roll(a,64,axis=0),64,axis=1)[:128,:128]),(528,574+i*160))
panel.save(DOC/'layered-master-literal-contacts.png')
report={'schemaVersion':1,'verdict':'PASS author exact layered scalar replay and sampled body/stain/contact hierarchy; actual ART separately reviewed','scope':'Canonical pre-tier only; not independent final source/ART acceptance','masterPackage':w(MASTER/'master.json'),'height':{'sha256':sha(MASTER/'height.npy'),'range':[float(h.min()),float(h.max())],'float32':True,'RGBUnchanged':True,'maskFraction':float(mask.mean()),'sigmaMasterPixels':sigma},'samples':samples,'sourceClassification':w(DOC/'initial-physical-witnesses.png'),'reviewedRecipe':w(BASE/'relief/ttex262-flat-masonry-v1.json'),'independentPlan':w(DOC/'root-flat-masonry-plan-review-v1.json'),'views':{str(p.relative_to(ROOT)):sha(p)for p in DOC.glob('layered-master-*.png')},'limits':['H/V windows are interface samples, not pure material proof.','LowerX is disclosed native-intent inference; review full upperX/lowerX/Y/corners for addedframe.','Subtle relative scalar geometry is not measured photogrammetry or calibrated displacement.']}
with(DOC/'layered-pre-tier-check.json').open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'masterPackage':report['masterPackage'],'height':report['height'],'samples':samples},indent=2))
