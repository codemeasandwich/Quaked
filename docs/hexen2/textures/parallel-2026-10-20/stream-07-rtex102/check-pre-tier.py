"""Actual source-specific pre-tier physical and edge review; no output map authoring."""
from pathlib import Path
import json,hashlib,sys,datetime
import numpy as np
from PIL import Image,ImageDraw
R=Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-07-rtex102';B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-07-rtex102';M=B/'masters/rtex102';sys.path.insert(0,str(R/'tools'));from craft_normals import normals_from_height
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(R));c=Image.open(M/'color.png').convert('RGB');h=np.load(M/'height.npy',allow_pickle=False);o=Image.open(next((B/'originals').glob('01-*.png'))).convert('RGB');_,n=normals_from_height(h,.3,.5)
# Classes assigned from actual visible geometry, not from measured height. All unclassified proposal points remain retained.
pts=[('B','coherent grey mineral face',380,80),('P','coherent grey mineral face',216,435),('I','rough mineral face',75,222),('D','black pit beside chipped mineral rim',151,143),('F','black fissure/pit',273,170),('M','small dark physical pit',208,232),('N','dark recess between mineral edges',308,298),('A','mixed oxide-stained rough face, not pure depth class',83,195),('J','thin brown stain / mineral-face transition, not pure depth class',256,250),('G','oxide-stained depression / mixed edge, not pure depth class',284,93)]
s=Image.new('RGB',(1000,420),(25,27,30));dr=ImageDraw.Draw(s);rows=[]
for i,(label,kind,x,y)in enumerate(pts):
 xx=i%5*200;yy=i//5*210;dr.text((xx+4,yy+4),label+' '+str([x,y]),fill='white');dr.text((xx+4,yy+18),kind[:28],fill='white');s.paste(c.crop((x-40,y-40,x+40,y+40)).resize((160,160),Image.Resampling.NEAREST),(xx+10,yy+35));dr.rectangle((xx+84,yy+109,xx+96,yy+121),outline=(255,40,40));v=h[y-3:y+4,x-3:x+4];rows.append({'label':label,'physicalClass':kind,'masterPixel':[x,y],'nativeEquivalent':[x/8,y/8],'radiusMasterPixels':3,'heightMean':float(v.mean()),'heightRange':[float(v.min()),float(v.max())]})
s.save(D/'pre-tier-physical-witnesses.png')
parts=[('RGB',np.asarray(c)),('height',np.repeat(np.uint8(np.clip(h[:,:,None]*255,0,255)),3,2)),('XYZ',np.uint8(np.clip((n*.5+.5)*255,0,255)))];lights=[]
for sign in(-1,1):
 l=np.array([sign*.6,sign*.3,.75]);l/=np.linalg.norm(l);a=.35+.65*np.clip((n*l).sum(2),0,1);im=np.uint8(np.asarray(c)*a[:,:,None]);parts.append(('light '+str(sign),im));lights.append(im)
s=Image.new('RGB',(950,510),(25,27,30));dr=ImageDraw.Draw(s)
for ai,axis in enumerate(('X','Y','XY')):
 y=ai*170;dr.text((4,y+3),axis+' seam/corner at 1:1',fill='white')
 for pi,(label,a)in enumerate(parts):
  a=np.roll(a,(256 if'Y'in axis else 0,256 if'X'in axis else 0),(0,1));x=pi*190;dr.text((x+4,y+20),label,fill='white');s.paste(Image.fromarray(a[192:320,192:320]),(x+4,y+38))
s.save(D/'pre-tier-seams-corners-1to1.png')
for label,im in [('master',c),('native',o.resize((512,512),Image.Resampling.NEAREST)),('light-minus',Image.fromarray(lights[0])),('light-plus',Image.fromarray(lights[1]))]:
 tile=Image.new('RGB',(1024,1024))
 for y in(0,512):
  for x in(0,512):tile.paste(im,(x,y))
 tile.save(D/f'pre-tier-{label}-repeat.png')
s=Image.new('RGB',(560,600),(25,27,30));dr=ImageDraw.Draw(s);distance=[]
for i,div in enumerate((2,4)):
 size=(64//div,64//div);a=o.resize(size,Image.Resampling.BOX);b=c.resize(size,Image.Resampling.BOX);err=np.abs(np.asarray(a,float)-np.asarray(b,float));distance.append({'divisor':div,'dimensions':list(size),'meanAbsoluteError':float(err.mean()),'maximum':float(err.max())});y=i*300;dr.text((4,y+4),f'Both inputs BOX at native/{div}: {size}',fill='white');s.paste(a.resize((256,256),Image.Resampling.NEAREST),(4,y+28));s.paste(b.resize((256,256),Image.Resampling.NEAREST),(280,y+28))
s.save(D/'pre-tier-distance.png');face=[x['heightMean']for x in rows[:3]];pit=[x['heightMean']for x in rows[3:7]];assert min(face)>max(pit)
r={'verdict':'PASS author numeric pre-tier pit/face hierarchy; actual material/edge/relief review recorded separately','scope':'Actual single ordinary RGB/float master; no tier or semantic repair authored. Mixed stain/edge observations are explicitly not pure depth witnesses.','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'masterPackage':{'file':rel(M/'master.json'),'sha256':sha(M/'master.json')},'samples':rows,'distance':distance,'faceAbovePitMeans':True,'geometryUncertainty':'Fine dark volcanic rock cannot establish every microfacet from shading. Independent final ART must inspect coherent faces/pits and stain transitions; no all-brown-is-deep rule or historical geological certainty claimed.','views':{rel(p):sha(p)for p in [D/'pre-tier-master.png',D/'pre-tier-physical-witnesses.png',D/'pre-tier-seams-corners-1to1.png',D/'pre-tier-master-repeat.png',D/'pre-tier-native-repeat.png',D/'pre-tier-light-minus-repeat.png',D/'pre-tier-light-plus-repeat.png',D/'pre-tier-distance.png']},'inputs':{rel(p):sha(p)for p in [Path(__file__),D/'physical-witness-proposal.json',D/'physical-witness-proposal-second.json',M/'color.png',M/'height.npy']}}
(D/'pre-tier-self-check.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'distance':distance,'faceMeans':face,'pitMeans':pit,'proofSha256':sha(D/'pre-tier-self-check.json')},indent=2))
