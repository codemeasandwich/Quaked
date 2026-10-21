"""Author-side actual canonical layered replay/physical diagnostics, before tiers."""
import sys,json,hashlib,datetime,io
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-06-mtex470';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-06-mtex470';S=B/'masters/mtex470';M=B/'masters-layered/mtex470';sys.path.insert(0,str(R/'tools/texture_sheets'));from prepare_texture_master import craft,finish;from update_level_sheets import brick_mask;from craft_normals import gblur,normals_from_height
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R));mp=json.loads((M/'master.json').read_text());source=json.loads((S/'master.json').read_text());recipe=json.loads((B/'relief/mtex470-mortar-proposal-v1.json').read_text());layer=recipe['layering'];assert sha(B/'relief/mtex470-mortar-proposal-v1.json')=='d12b11332eaf9fce471146bf5123a8a6476031dd94d882af63bd0df42349a2bc'
assert (S/'color.png').read_bytes()==(M/'color.png').read_bytes();c=Image.open(M/'color.png').convert('RGB');h=np.load(M/'height.npy',allow_pickle=False);assert h.dtype==np.float32 and h.shape==(512,512)and np.isfinite(h).all()
# Replay existing public operations, retaining craft float64 until the one final cast.
o=Image.open(source['inputs']['original']['file']).convert('RGB');raw=Image.open(source['inputs']['generated']['file']).convert('RGB');color,_=finish(o,raw,factor=8,comparison_divisor=2,method='photographic',color_strength=.65,field_sigma=.75);assert color.tobytes()==c.tobytes();detail,_=craft(np.asarray(color,float)/255,source['height']['profile'],quantize_height=False);mask=brick_mask(detail.shape,layer);sigma=layer['bevelPixels']*np.sqrt(detail.size)/256;bl=gblur(mask,sigma);facing=layer['facingHeight']-(layer['facingHeight']-layer['chipFloor'])*np.minimum(bl*2,1);expected=(np.where(mask>.5,layer['brickHeight'],facing)+(detail-.5)*(2*layer['microAmplitude'])).astype('float32');assert np.array_equal(expected,h);buf=io.BytesIO();np.save(buf,expected,allow_pickle=False);assert hashlib.sha256(buf.getvalue()).hexdigest()==sha(M/'height.npy');assert h[mask>.5].max()<h[mask<=.5].min()
regions=json.loads((D/'pre-tier-self-check.json').read_text())['coarseFaceStatistics'];stats={}
for k,row in regions.items():
 x1,y1,x2,y2=row['bounds'];v=h[y1:y2,x1:x2];assert np.all(mask[y1:y2,x1:x2]==0);stats[k]={'bounds':row['bounds'],'mean':float(v.mean()),'median':float(np.median(v)),'range':[float(v.min()),float(v.max())]}
witnesses=[]
for p in json.loads((D/'pre-tier-self-check.json').read_text())['samples']:
 x,y=p['masterPixel'];v=h[y-3:y+4,x-3:x+4];witnesses.append({**{k:p[k]for k in ['label','physicalClass','masterPixel','nativeEquivalent']},'heightMean':float(v.mean()),'heightRange':[float(v.min()),float(v.max())],'maskFraction':float(mask[y-3:y+4,x-3:x+4].mean())})
_,n=normals_from_height(h,.3,.5);parts=[('Exact unchanged canonical RGB',c),('Actual full precision height display',Image.fromarray(np.uint8(np.clip(h*255,0,255)))),('Actual XYZ diagnostic',Image.fromarray(np.uint8(np.clip((n*.5+.5)*255,0,255))))];lights=[]
for sign in (1,-1):
 l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);a=.35+.65*np.clip((n*l).sum(2),0,1);im=Image.fromarray(np.uint8(np.clip(np.asarray(c,float)*a[:,:,None],0,255)));parts.append(('Actual opposed light '+str(sign),im));lights.append(im)
s=Image.new('RGB',(1560,1100),(25,27,30));dr=ImageDraw.Draw(s)
for i,(label,im)in enumerate(parts):x=i%3*520;y=i//3*550;dr.text((x+4,y+5),label,fill='white');s.paste(im,(x+4,y+25))
s.save(D/'layered-pre-tier-master.png')
# Literal full-resolution corner wrap, not resampled contact image.
cornerparts=[('RGB wrap corner',c),('Height wrap corner',parts[1][1].convert('RGB')),('Light + wrap corner',lights[0]),('Light - wrap corner',lights[1])];z=Image.new('RGB',(1024,540),(25,27,30));zd=ImageDraw.Draw(z)
for i,(label,im)in enumerate(cornerparts):
 wrapped=Image.new('RGB',(1024,1024))
 for yy in (0,512):
  for xx in (0,512):wrapped.paste(im,(xx,yy))
 x=i%2*512;y=i//2*270;zd.text((x+4,y+4),label,fill='white');z.paste(wrapped.crop((392,392,632,632)),(x+4,y+25))
z.save(D/'layered-pre-tier-corners-1to1.png')
for label,im in [('height',parts[1][1]),('light-plus',lights[0]),('light-minus',lights[1])]:
 repeated=Image.new('RGB',(1024,1024))
 for yy in (0,512):
  for xx in (0,512):repeated.paste(im,(xx,yy))
 repeated.save(D/f'layered-pre-tier-{label}-repeat.png')
r={'verdict':'PASS author exact replay and numeric hierarchy; actual ART/root physical review still pending','scope':'Canonical shared master only, no tier encoded. Full craft float64 -> reviewed planes and bounded detail float64 -> one final float32 cast. Existing producer functions reused; this author-side check is not independent qualification.','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'masterPackage':{'file':rel(M/'master.json'),'sha256':sha(M/'master.json')},'canonicalRgb':{'file':rel(M/'color.png'),'sha256':sha(M/'color.png'),'byteIdenticalToInitial':True},'height':{'file':rel(M/'height.npy'),'sha256':sha(M/'height.npy'),'dtype':'float32','range':[float(h.min()),float(h.max())],'replayArrayAndNpyBytesExact':True},'mortarRange':[float(h[mask>.5].min()),float(h[mask>.5].max())],'allFacingRange':[float(h[mask<=.5].min()),float(h[mask<=.5].max())],'coarseInteriorFaceStatistics':stats,'maximumInteriorMedianSpread':max(x['median']for x in stats.values())-min(x['median']for x in stats.values()),'witnesses':witnesses,'sigmaMasterPixels':float(sigma),'views':{rel(p):sha(p)for p in [D/'layered-pre-tier-master.png',D/'layered-pre-tier-corners-1to1.png',D/'layered-pre-tier-height-repeat.png',D/'layered-pre-tier-light-plus-repeat.png',D/'layered-pre-tier-light-minus-repeat.png']},'inputs':{rel(p):sha(p)for p in [Path(__file__),S/'master.json',M/'master.json',B/'relief/mtex470-mortar-proposal-v1.json',D/'root-source-master-proof-v2.json',D/'root-mortar-plan-review.json']}}
(D/'layered-pre-tier-check.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'master':r['masterPackage'],'height':r['height'],'interiorFaceStats':stats,'medianSpread':r['maximumInteriorMedianSpread'],'mortarRange':r['mortarRange'],'allFacingRange':r['allFacingRange']},indent=2))
