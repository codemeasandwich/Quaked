"""Actual source-specific pre-tier diagnostic: initial tonal-height defect, no authoring."""
from pathlib import Path
import json,hashlib,sys,datetime
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-10-rtex441';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-10-rtex441';M=B/'masters/rtex441';sys.path.insert(0,str(R/'tools'));from craft_normals import gblur
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R));c=Image.open(M/'color.png').convert('RGB');h=np.load(M/'height.npy',allow_pickle=False);o=Image.open(next((B/'originals').glob('01-*.png'))).convert('RGB')
coarse=gblur(h,24);x,y=np.meshgrid(np.arange(512)/512,np.arange(512)/512);sl=np.s_[32:480,32:480];A=np.stack([x[sl].ravel(),y[sl].ravel(),np.ones(x[sl].size)],1);coeff=np.linalg.lstsq(A,h[sl].ravel(),rcond=None)[0]
rects={'northWest':[32,32,240,240],'northEast':[272,32,480,240],'southWest':[32,272,240,480],'southEast':[272,272,480,480]};stats={}
for name,(x1,y1,x2,y2)in rects.items():
 v=h[y1:y2,x1:x2];cv=coarse[y1:y2,x1:x2];stats[name]={'bounds':[x1,y1,x2,y2],'mean':float(v.mean()),'median':float(np.median(v)),'coarseMeanSigma24':float(cv.mean())}
pts=[('A',190,100),('B',380,110),('C',230,360),('D',430,350),('E',301,158),('F',113,208),('G',95,447),('H',2,240),('I',510,240),('J',240,2),('K',240,510)];s=Image.new('RGB',(1000,630),(25,27,30));dr=ImageDraw.Draw(s);rows=[]
for i,(label,px,py)in enumerate(pts):
 xx=i%5*200;yy=i//5*210;dr.text((xx+4,yy+4),label+' '+str([px,py]),fill='white');crop=np.roll(np.asarray(c),(-py+40,-px+40),(0,1))[:80,:80];s.paste(Image.fromarray(crop).resize((160,160),Image.Resampling.NEAREST),(xx+10,yy+35));dr.rectangle((xx+84,yy+109,xx+96,yy+121),outline=(255,40,40));v=np.roll(h,(-py+3,-px+3),(0,1))[:7,:7];rows.append({'label':label,'masterPixel':[px,py],'heightMean':float(v.mean()),'range':[float(v.min()),float(v.max())]})
s.save(D/'initial-physical-witness-proposal.png')
s=Image.new('RGB',(560,600),(25,27,30));dr=ImageDraw.Draw(s);distance=[]
for i,div in enumerate((2,4)):
 size=(64//div,64//div);aa=o.resize(size,Image.Resampling.BOX);bb=c.resize(size,Image.Resampling.BOX);e=np.abs(np.asarray(aa,float)-np.asarray(bb,float));distance.append({'divisor':div,'dimensions':list(size),'meanAbsoluteError':float(e.mean()),'maximum':float(e.max())});yy=i*300;dr.text((4,yy+4),f'Original and master, both BOX {size}',fill='white');s.paste(aa.resize((256,256),Image.Resampling.NEAREST),(4,yy+28));s.paste(bb.resize((256,256),Image.Resampling.NEAREST),(280,yy+28))
s.save(D/'pre-tier-distance.png')
for label,im in [('master',c),('native',o.resize((512,512),Image.Resampling.NEAREST))]:
 rep=Image.new('RGB',(1024,1024))
 for yy in(0,512):
  for xx in(0,512):rep.paste(im,(xx,yy))
 rep.save(D/f'pre-tier-{label}-repeat.png')
r={'verdict':'HOLD initial tonal scalar field: broad pigment/illumination ramp conflicts with planned near-flat stone slab','sourceMaterialScope':'Actual photographic RGB is readable dense stone; master relief not accepted, no tier encoded.','masterPackage':{'file':rel(M/'master.json'),'sha256':sha(M/'master.json')},'coarseFaceStats':stats,'interiorPlaneFit':{'domain':'master x/y32..479; x/y normalized0..1','heightChangeAcrossUnitX':float(coeff[0]),'heightChangeAcrossUnitY':float(coeff[1]),'intercept':float(coeff[2]),'notMeasuredGeometry':True},'coarseSigma24InteriorRange':[float(coarse[sl].min()),float(coarse[sl].max())],'unclassifiedWitnesses':rows,'distance':distance,'nextAction':'Obtain genuine independent source/master-only replay proof. Propose same-RGB existing guarded layered wrapper for near-flat broad face with narrow existing joint mask and bounded source microrelief; do not encode initial height.','inputs':{rel(p):sha(p)for p in[Path(__file__),M/'color.png',M/'height.npy',M/'master.json']},'views':{rel(p):sha(p)for p in[D/'pre-tier-master.png',D/'initial-physical-witness-proposal.png',D/'pre-tier-distance.png',D/'pre-tier-master-repeat.png',D/'pre-tier-native-repeat.png']},'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};(D/'initial-relief-hold.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'coarseFaceStats':stats,'plane':r['interiorPlaneFit'],'distance':distance,'proofSha256':sha(D/'initial-relief-hold.json')},indent=2))
