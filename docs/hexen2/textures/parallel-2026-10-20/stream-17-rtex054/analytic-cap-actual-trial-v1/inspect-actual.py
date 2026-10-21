"""Actual approved analytic trial math/geometry/view evidence, no authoring call."""
from pathlib import Path
import sys,json,hashlib,io,datetime
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[6];DOC=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-17-rtex054';MP=BASE/'masters/rtex054-rounded-v1'
sys.path.insert(0,str(ROOT/'tools'));sys.path.insert(0,str(ROOT/'tests'))
from craft_normals import craft
from hexen2_texture_tiers_test import cyclic_normals
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def w(p):return {'file':str(p.relative_to(ROOT)),'sha256':sha(p)}
receipt=json.loads((DOC/'execution-receipt.json').read_bytes());assert receipt['exitCode']==0 and receipt['actualAnalyticTrials']==1
for path,digest in receipt['firstInputHashes'].items():assert sha(ROOT/path)==digest
m=json.loads((MP/'master.json').read_bytes());source=json.loads((BASE/'masters/rtex054-initial/master.json').read_bytes());recipe_path=ROOT/'docs/hexen2/textures/parallel-2026-10-20/stream-17-rtex054/analytic-cap-actual-plan-v1/rtex054-rounded-caps-v1.json';recipe=json.loads(recipe_path.read_bytes());assert m['roundedCaps']['recipe']==recipe and sha(recipe_path)==m['roundedCaps']['recipeSha256'];assert sha(MP/'color.png')==source['color']['sha256']==recipe['authoringDiffuseSha256'];assert(MP/'color.png').read_bytes()==(BASE/'masters/rtex054-initial/color.png').read_bytes()
rgb=Image.open(MP/'color.png').convert('RGB');colors=np.asarray(rgb);h=np.load(MP/'height.npy',allow_pickle=False);assert h.shape==(512,512)and h.dtype==np.float32 and np.isfinite(h).all();assert sha(MP/'height.npy')==m['height']['sha256']
detail,_=craft(colors.astype(np.float64)/255,source['height']['profile'],quantize_height=False);assert detail.dtype==np.float64
buffer=io.BytesIO();np.save(buffer,detail.astype('float32'),allow_pickle=False);assert hashlib.sha256(buffer.getvalue()).hexdigest()==source['height']['sha256']
y,x=np.mgrid[:512,:512].astype(np.float64);nx,ny=(x+.5)/8,(y+.5)/8;caps=recipe['caps'];base=np.full(h.shape,caps['plateHeight'],dtype=np.float64);squares=[]
for head in caps['heads']:
 cx,cy=head['centre'];rx,ry=head['radii'];square=((nx-cx)/rx)**2+((ny-cy)/ry)**2;squares.append(square);base+=caps['capAmplitude']*np.maximum(0,1-square)
micro=(detail-.5)*(2*caps['microAmplitude']);expected=(base+micro).astype('float32');assert np.array_equal(expected,h),'Actual analytic scalar differs from independent float64 formula'
base_normal=cyclic_normals(base);normal=cyclic_normals(h.astype(float));images={}
def save(name,image):
 path=DOC/(name+'.png');assert not path.exists();image.save(path);images[name]=w(path)
def rgb8(values):return Image.fromarray(np.uint8(np.rint(np.clip(values,0,255))))
base_height=np.repeat(np.rint(base[:,:,None]*255).astype('uint8'),3,2);actual_height=np.repeat(np.rint(h[:,:,None]*255).astype('uint8'),3,2)
xyz=np.rint(np.clip((normal*.5+.5)*255,0,255)).astype('uint8');base_xyz=np.rint(np.clip((base_normal*.5+.5)*255,0,255)).astype('uint8')
save('base-height-absolute',Image.fromarray(base_height));save('actual-height-absolute',Image.fromarray(actual_height));save('actual-XYZ',Image.fromarray(xyz));save('base-XYZ',Image.fromarray(base_xyz))
exaggerated=Image.fromarray(np.rint(np.clip(.5+micro/(2*caps['microAmplitude']),0,1)*255).astype('uint8')).convert('RGB');panel=Image.new('RGB',(512,540),(25,27,30));ImageDraw.Draw(panel).text((4,4),'EXAGGERATED micro only; actual amplitude .004; not physical height display',fill='white');panel.paste(exaggerated,(0,24));save('micro-exaggerated-diagnostic',panel)
neutral=Image.new('RGB',(1024,1080),(25,27,30));nd=ImageDraw.Draw(neutral);textured=Image.new('RGB',(1024,540),(25,27,30));td=ImageDraw.Draw(textured);lights=[]
for i,sign in enumerate((1,-1)):
 light=np.array([sign*.6,sign*.3,.75]);light/=np.linalg.norm(light)
 for row,vectors in enumerate((base_normal,normal)):
  gain=.35+.65*np.maximum(0,np.einsum('ijk,k->ij',vectors,light));pix=np.repeat(np.rint(180*gain).astype('uint8')[:,:,None],3,2);neutral.paste(Image.fromarray(pix),(i*512,row*540+24));nd.text((i*512+4,row*540+4),('Analytic base only'if row==0 else'Actual final float including micro')+' opposed '+str(i),fill='white')
  if row==1:
   lights.append(pix);textured.paste(rgb8(colors*gain[:,:,None]),(i*512,24));td.text((i*512+4,4),'Actual new float + unchanged RGB opposed '+str(i),fill='white')
save('base-versus-actual-neutral-opposed',neutral);save('actual-textured-opposed',textured)
# Separate literal strips preserve full512pixel extent and actual corners.
wrap=Image.new('RGB',(1200,1110),(25,27,30));wd=ImageDraw.Draw(wrap)
for i,(name,a)in enumerate([('RGB',colors),('height',actual_height),('XYZ',xyz)]):
 px=i*136;wd.text((px+2,2),name+' X full height',fill='white');wrap.paste(Image.fromarray(np.concatenate([a[:,-32:],a[:,:32]],1)),(px,24));wd.text((440,4+i*160),name+' Y full width / corner',fill='white');wrap.paste(Image.fromarray(np.concatenate([a[-32:],a[:32]],0)),(440,28+i*160));wrap.paste(Image.fromarray(np.roll(np.roll(a,32,0),32,1)[:64,:64]),(980,28+i*160))
save('actual-full-wrap-contacts',wrap);save('actual-RGB-repeat',Image.fromarray(np.tile(colors,(2,2,1))));save('actual-height-repeat',Image.fromarray(np.tile(actual_height,(2,2,1))));save('actual-XYZ-repeat',Image.fromarray(np.tile(xyz,(2,2,1))))
original=Image.open(BASE/'originals/01-rtex054-d007ea021eb3.png').convert('RGB');comparison=Image.new('RGB',(600,180),(25,27,30));cd=ImageDraw.Draw(comparison)
for i,dim in enumerate((32,16)):
 for j,image in enumerate((original,rgb)):
  tile=image.resize((dim,dim),Image.Resampling.BOX).resize((dim*4,dim*4),Image.Resampling.NEAREST);comparison.paste(tile,(i*300+j*140+4,30));cd.text((i*300+j*140+4,4),('Native 'if j==0 else'Same RGB ')+str(dim)+' BOX',fill='white')
save('both-inputs-BOX32-16',comparison)
heads=[];close=Image.new('RGB',(1280,1096),(25,27,30));cl=ImageDraw.Draw(close)
for i,(head,square)in enumerate(zip(caps['heads'],squares)):
 rho=np.sqrt(square);samples=[]
 for lo,hi in[(0,.15),(.25,.4),(.55,.7),(.8,.95),(1.1,1.35)]:
  mask=(rho>=lo)&(rho<hi);assert mask.any();samples.append({'normalizedRadius':[lo,hi],'pixels':int(mask.sum()),'baseMean':float(base[mask].mean()),'actualMean':float(h[mask].mean()),'actualMedian':float(np.median(h[mask])),'actualRange':[float(h[mask].min()),float(h[mask].max())],'microRange':[float(micro[mask].min()),float(micro[mask].max())]})
 hierarchy=samples[0]['actualMean']>samples[2]['actualMean']>samples[-1]['actualMean'];broad=all(a['actualMean']>b['actualMean']for a,b in zip(samples,samples[1:]));cx,cy=head['centre'];rx,ry=head['radii'];ix,iy=round(cx*8-.5),round(cy*8-.5);x0,x1=max(0,ix-38),min(512,ix+38);y0,y1=max(0,iy-38),min(512,iy+38)
 interfaces=[]
 for tag,px,py in[('E',cx+rx,cy),('W',cx-rx,cy),('N',cx,cy-ry),('S',cx,cy+ry)]:
  xx,yy=round(px*8-.5),round(py*8-.5);ys=(np.arange(yy-2,yy+3)%512)[:,None];xs=(np.arange(xx-2,xx+3)%512)[None,:];values=h[ys,xs];support=square[ys,xs]<1;interfaces.append({'side':tag,'samplePixel':[xx,yy],'radius':2,'headSupportFraction':float(support.mean()),'actualRange':[float(values.min()),float(values.max())],'limit':'Actual ellipse edge/contact/plate neighborhood, not pure material or exact continuous physical measurement'})
 heads.append({'label':head['label'],'centreNativePixelEdges':head['centre'],'radiiNativePixels':head['radii'],'broadProfiles':samples,'centreShoulderPlateHierarchy':hierarchy,'allBroadAnnularMeansDescend':broad,'mixedInterfaces':interfaces})
 px=i%4*320;py=i//4*548;cl.text((px+3,py+3),head['label']+' actual RGB / actual XYZ',fill='white');cl.text((px+3,py+281),head['label']+' actual neutral A / B;2xnearest',fill='white')
 for k,a in enumerate((colors,xyz,lights[0],lights[1])):
  patch=Image.fromarray(a).crop((x0,y0,x1,y1)).resize(((x1-x0)*2,(y1-y0)*2),Image.Resampling.NEAREST);close.paste(patch,(px+k%2*160,py+28+k//2*280))
save('all-eight-heads-RGB-XYZ-actual-neutrals',close)
angles=np.degrees(np.arccos(np.clip(np.sum(base_normal*normal,axis=2),-1,1)))
report={'schemaVersion':1,'state':'ACTUAL OBSERVATIONS AND AUTHOR MATH CHECK; root actual ART separate','nativeIdentity':recipe['nativeIdentity'],'masterPackage':w(MP/'master.json'),'actualHeight':w(MP/'height.npy'),'sameRGB':w(MP/'color.png'),'recipe':w(recipe_path),'actualExecutionReceipt':w(DOC/'execution-receipt.json'),'RGBBytesExact':True,'independentFloat64AnalyticPlusMicroSingleCastBytesExact':True,'initialCraftFloat32GuardBytesExact':True,'geometryProfile':'plate .54 + .07*max(0,1-rSquared), exact approved ellipses; C0 contact not C1','microAmplitude':caps['microAmplitude'],'microRange':[float(micro.min()),float(micro.max())],'baseRange':[float(base.min()),float(base.max())],'actualHeightRange':[float(h.min()),float(h.max())],'allEightCentreShoulderPlateHierarchy':all(q['centreShoulderPlateHierarchy']for q in heads),'allEightBroadAnnularMeansDescend':all(q['allBroadAnnularMeansDescend']for q in heads),'heads':heads,'baseVersusActualNormalDegrees':{'mean':float(angles.mean()),'p99':float(np.percentile(angles,99)),'maximum':float(angles.max())},'views':images,'limits':['Author exact math and diagnostic observations, not independent actual source/ART acceptance.','Base and micro are separated for interpretation; amplified micro image is not physical height.','Amplitude bounds are not slope or material-purity proof; individual pits may vary.','No analytic trial rerun, parameter search, encoded tier, shared registration or runtime observation.'],'tool':w(Path(__file__)),'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
assert all(sha(ROOT/path)==digest for path,digest in receipt['firstInputHashes'].items())
report['allFirstObservedInputsStillExact']=True
with(DOC/'actual-observations-v1.json').open('x')as file:file.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'report':w(DOC/'actual-observations-v1.json'),'range':report['actualHeightRange'],'allEightHierarchy':report['allEightCentreShoulderPlateHierarchy'],'allEightBroadProfilesDescend':report['allEightBroadAnnularMeansDescend'],'views':len(images),'headMeans':[(q['label'],[round(z['actualMean'],6)for z in q['broadProfiles']])for q in heads]}))
