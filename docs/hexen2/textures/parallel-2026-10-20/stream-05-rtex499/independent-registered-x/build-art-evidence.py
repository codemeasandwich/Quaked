"""Read-only decoded-map inspection artifacts, no source or tier authoring."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw,ImageFont
DOC=Path(__file__).resolve().parent
ROOT=next(p for p in DOC.parents if (p/'tools/texture_sheets/prepare_texture_master.py').is_file())
B=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-05-rtex499'
OUT=DOC/'art-evidence'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def bound(p):return dict(file=str(p.relative_to(ROOT)),sha256=sha(p),bytes=p.stat().st_size)
def main():
 assert not OUT.exists()
 batch=json.loads((B/'batch-registered-x.json').read_text());item,=batch['items']
 inputs=[B/'batch-registered-x.json',DOC/'actual-v1.json',DOC/'preview-v1.json',B/'masters/rtex499-registered-x/master.json',B/'masters/rtex499-registered-x/color.png',B/'masters/rtex499-registered-x/height.npy']
 inputs += [ROOT/item['original']]+[ROOT/path for t in item['tiers'].values() for path in t['files'].values()]
 before={p:sha(p) for p in inputs};OUT.mkdir()
 f=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',16)
 classification_path=DOC/'source-witness-classification.json'
 inputs.append(classification_path);before[classification_path]=sha(classification_path)
 samples=json.loads(classification_path.read_text())['samples']
 semantic={};compositions=[]
 for tier in ('Mid','High'):
  paths={r:ROOT/p for r,p in item['tiers'][tier]['files'].items()}
  maps={r:Image.open(p).convert('RGB') for r,p in paths.items()};d=maps['diffuse'];side=d.width
  H=np.asarray(maps['height'],float)[:,:,0]/255
  vector=np.stack([np.asarray(maps['normal'+c],float)[:,:,0] for c in 'XYZ'],2)/127.5-1
  vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
  light=[];neutral=[]
  for sign in (1,-1):
   direction=np.array([sign*.6,sign*.3,.75]);direction/=np.linalg.norm(direction)
   illumination=.35+.65*np.clip((vector*direction).sum(2),0,1)
   light.append(Image.fromarray(np.uint8(np.clip(np.asarray(d,float)*illumination[:,:,None],0,255))))
   neutral.append(Image.fromarray(np.uint8(np.clip(illumination*255,0,255))))
  for tag,im in zip(('A','B'),neutral):im.save(OUT/(tier.lower()+'-neutral-opposed-'+tag+'-1to1.png'))
  # Actual central physical crop, each panel copied at1:1 with no filtering.
  detail=min(256,side);box=(side//2-detail//2,side//2-detail//2,side//2+detail//2,side//2+detail//2)
  board=Image.new('RGB',(1330,620),'#191919');draw=ImageDraw.Draw(board)
  entries=[('actual diffuse',d),('height',maps['height']),('decoded XYZ',Image.fromarray(np.uint8(np.clip((vector*.5+.5)*255,0,255)))),('opposed A',light[0]),('opposed B',light[1])]
  for i,(label,image) in enumerate(entries):
   x=10+i*264;draw.text((x,10),tier+' '+label,font=f,fill='white');board.paste(image.crop(box),(x,40))
  # Extra face crops use the same actual256px dimensions (no resize) and
  # deliberately different face locations to avoid judging only the joint.
  c=min(256,side//2);boxes=[(0,0,c,c),(side-c,0,side,c),(side//2-c//2,side-c,side//2+c//2,side)]
  for i,b in enumerate(boxes):
   x=10+i*330;draw.text((x,330),'diffuse mineral/pit crop '+str(list(b)),font=f,fill='white');board.paste(d.crop(b),(x,360))
  p=OUT/(tier.lower()+'-one-to-one.png');board.save(p)
  compositions.append(dict(**bound(p),panelScale='1 source pixel = 1 output pixel; no resize',centralCrop=list(box),faceCrops=[list(x) for x in boxes]))
  # Literal wrapped neighborhoods. The crop's middle is the tile boundary;
  # origin is never interpolated or patched.
  pixels=np.asarray(d);tiled=Image.fromarray(np.tile(pixels,(3,3,1)))
  crossing=tiled.crop((side-256,side-256,side+256,side+256))
  jh=min(256,side//2);jw=min(512,side)
  xjoin=tiled.crop((side-256,side+side//2-jh//2,side+256,side+side//2+jh//2))
  yjoin=tiled.crop((side+side//2-jw//2,side-jh//2,side+side//2+jw//2,side+jh//2))
  repeat=d.resize((256,256),Image.Resampling.LANCZOS)
  rb=Image.new('RGB',(512,512))
  for yy in (0,256):
   for xx in (0,256):rb.paste(repeat,(xx,yy))
  rb.save(OUT/(tier.lower()+'-two-by-two-overview.png'))
  board=Image.new('RGB',(1050,870),'#191919');draw=ImageDraw.Draw(board)
  draw.text((10,10),tier+' literal corner crossing (1:1)',font=f,fill='white');board.paste(crossing,(10,40))
  draw.text((530,10),'X-wrap crossing (1:1)',font=f,fill='white');board.paste(xjoin,(530,40))
  draw.text((530,325),'Y-wrap crossing (1:1)',font=f,fill='white');board.paste(yjoin,(530,355))
  draw.text((10,645),'Boundary locations: centreX/Y of each crop; no blending, borders or resampling.',font=f,fill='white')
  p=OUT/(tier.lower()+'-wraps-and-corner.png');board.save(p);compositions.append(dict(**bound(p),literalRepeatedMap=True,noBoundaryAlteration=True))
  rows=[];annotation=d.copy();ad=ImageDraw.Draw(annotation)
  factor=side/1024
  for sample in samples:
   sx,sy=sample['masterPixel'];x,y=int(round(sx*factor)),int(round(sy*factor))
   values=H[np.ix_(np.arange(y-3,y+4)%side,np.arange(x-3,x+4)%side)]
   assert values.shape==(7,7)
   rows.append(dict(label=sample['label'],sourceClassification=sample['physicalClass'],orderingGroup=sample['orderingGroup'],sourceMasterPixel=[sx,sy],tierPixelCentre=[x,y],pixelBox=[x-3,y-3,x+4,y+4],mean=float(values.mean()),minimum=float(values.min()),maximum=float(values.max())))
   color={'pit':'cyan','face':'yellow','mixed':'magenta'}[sample['orderingGroup']]
   ad.rectangle((x-3,y-3,x+3,y+3),outline=color,width=1)
  annotation.save(OUT/(tier.lower()+'-semantic-witnesses.png'))
  pits=[r['mean'] for r in rows if r['orderingGroup']=='pit'];faces=[r['mean'] for r in rows if r['orderingGroup']=='face']
  semantic[tier]=dict(samples=rows,allSampledPurePitMeansBelowPureFaceMeans=max(pits)<min(faces),meanSeparation=min(faces)-max(pits),mixedSamplesExcludedOnlyFromPureClassAssertion=True,limitation='Bounded ordering at independently RGB-classified pure pit/face samples. All3interpreted hidden contact points retained without a measured-source claim. No all-pixel depth or exact runtime amplitude claim.')
 assert before=={p:sha(p) for p in inputs}
 manifest=dict(scope='Actual decoded artifact inspection support only, pending independent visual verdict',
    inputs=[bound(p) for p in inputs],inputsStable=True,compositions=compositions,
    semanticWitnessConvention='Source1024master continuous point x,y -> nearest tier index round(source*side/1024); cyclic7x7patches. Visible mortar/stone ordering only; interpreted hidden contacts retained separately.',
    semanticWitnesses=semantic,
    sourceClassification='Actual grey stone/pale face/visible contact review; latent contact A/B/C are interpreted under the sealed v3a plan, not measured truth or inferred from brightness.',
    opposedLightFormula='Actual decodedXYZ normalized; [.6,.3,.75] and[-.6,-.3,.75] unit directions; brightness .35+.65*max(dot,0), multiplied by actual decoded diffuse. Diagnostic only.',
    outputs=[bound(p) for p in sorted(OUT.iterdir())])
 (DOC/'art-evidence-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps(dict(manifest=bound(DOC/'art-evidence-manifest.json'),semanticMeanOrdering={t:r['allSampledPurePitMeansBelowPureFaceMeans'] for t,r in semantic.items()})))
if __name__=='__main__':main()
