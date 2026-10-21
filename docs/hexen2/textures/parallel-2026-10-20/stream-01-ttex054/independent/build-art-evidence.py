"""Independent decoded ttex054 inspection support; candidate data read only."""
from pathlib import Path
import hashlib,json,runpy,datetime
import numpy as np
from PIL import Image,ImageDraw
D=Path(__file__).resolve().parent;R=next(p for p in D.parents if(p/'tools/texture_sheets/derive_texture_tiers.py').is_file());B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008';O=D/'art-evidence';assert not O.exists();O.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rec=lambda p:dict(file=str(p.relative_to(R)),sha256=sha(p),bytes=p.stat().st_size)
it,=json.loads((D.parent/'ttex054-raised-ornament-v1-batch.json').read_text())['items'];M=R/it['masterPackage']['file'];mp=json.loads(M.read_text());H0=np.load(M.parent/'height.npy',allow_pickle=False);rgb=Image.open(M.parent/'color.png').convert('RGB');original=Image.open(R/it['original']).convert('RGB');recipe=mp['layeredRelief']['recipe'];layer=recipe['layering']
inputs=[D.parent/'ttex054-raised-ornament-v1-batch.json',M,M.parent/'color.png',M.parent/'height.npy',R/it['original'],D/'actual-v1.json',D/'preview-v1.json']+[R/p for t in it['tiers'].values()for p in t['files'].values()];before={p:sha(p)for p in inputs}
# Rebuild the complement independently rather than treating the author's mask as truth.
maskim=Image.new('L',(512,1024));dr=ImageDraw.Draw(maskim)
for region in layer['brickRegions']:
 for dx in(-512,0,512):
  for dy in(-1024,0,1024):dr.polygon([(x*8+dx,y*8+dy)for x,y in region['polygon']],fill=255)
base_mask=np.asarray(maskim,float)/255;gold_mask=1-base_mask
# Points independently interpreted from visible source; scalar values measured afterwards.
points=[('G1','upper gold meander horizontal stroke','gold',50,587),('G2','lower gold meander horizontal stroke','gold',186,640),('G3','right gold meander vertical stroke','gold',426,607),('B1','green lime-plaster background','base',220,360),('B2','red lower painted plaster','base',350,740),('B3','red horizontal painted band','base',250,535),('B4','dark recess inside meander','base',325,601)]
classification=dict(description='Source RGB was inspected before scalar measurements. Gold points are centers of visible raised Greek-key ornament; green/red backgrounds and dark meander interior are one common plaster substrate. Exact historical plaster recipe is uncertain.',samples=[dict(label=a,physicalClass=b,group=c,masterPixel=[x,y])for a,b,c,x,y in points],retainedWearPatches={'P1':[47,376,86,416],'P2':[92,224,145,270],'P3':[307,135,353,177],'P4':[175,32,212,59]})
(D/'source-witness-classification.json').write_text(json.dumps(classification,indent=2)+'\n')
# Source registration overlay at literal scale, for independent physical classification.
ann=rgb.copy();ad=ImageDraw.Draw(ann)
for label,cl,group,x,y in points:ad.rectangle((x-2,y-2,x+2,y+2),outline='yellow'if group=='gold'else'cyan');ad.text((x+5,y),label,fill='yellow'if group=='gold'else'cyan')
ann.save(O/'source-physical-witnesses.png')
semantics={};outputs=[];distance=Image.new('RGB',(1000,540),(24,26,28));dd=ImageDraw.Draw(distance);dd.text((10,10),'Native and decoded tier independently BOX reduced, then nearest enlarged only for display',fill='white')
for ti,tier in enumerate(('Mid','High')):
 maps={r:Image.open(R/p).convert('RGB')for r,p in it['tiers'][tier]['files'].items()};w,h=maps['diffuse'].size;scale=w/512;v=np.stack([np.asarray(maps['normal'+c],float)[:,:,0]for c in'XYZ'],2)/127.5-1;v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-12);height=np.asarray(maps['height'],float)[:,:,0]/255
 xyz=Image.fromarray(np.uint8(np.clip((v*.5+.5)*255,0,255)));lights=[];textured=[]
 for sign in(1,-1):
  direction=np.array([sign*.65,sign*-.4,.6]);direction/=np.linalg.norm(direction);illum=np.maximum(np.sum(v*direction,axis=2),0)
  lights.append(Image.fromarray(np.rint(illum*255).astype('uint8')).convert('RGB'))
  textured.append(Image.fromarray(np.uint8(np.clip(np.asarray(maps['diffuse'],float)*(.35+.65*illum[:,:,None]),0,255))))
 def board(name,entries):
  width=max(im.width for _,im in entries);high=max(im.height for _,im in entries);sheet=Image.new('RGB',((width+12)*len(entries)+12,high+42),(24,26,28));draw=ImageDraw.Draw(sheet)
  for i,(label,im)in enumerate(entries):draw.text((12+i*(width+12),8),tier+' '+label+' 1:1',fill='white');sheet.paste(im,(12+i*(width+12),30))
  p=O/(tier.lower()+'-'+name+'.png');sheet.save(p);outputs.append(rec(p))
 board('diffuse-height',[('actual diffuse',maps['diffuse']),('height unscaled',maps['height'])])
 board('xyz-neutral',[('decoded XYZ',xyz),('neutral A',lights[0]),('neutral B',lights[1])])
 # Fixed-height contrast is diagnostic only; it must not imply amplified displacement.
 fixed=Image.fromarray(np.rint(np.clip((height-.965)/.04,0,1)*255).astype('uint8')).convert('RGB')
 board('height-textured-light',[('height fixed .965..1.005',fixed),('textured A',textured[0]),('textured B',textured[1])])
 # Both1:1 horizontal ornament repeats and literal boundary crops expose misjoined glyphs.
 y0,y1=int(560*scale),int(680*scale);band=maps['diffuse'].crop((0,y0,w,y1));band2=Image.new('RGB',(w*2,band.height));band2.paste(band,(0,0));band2.paste(band,(w,0));band2.save(O/(tier.lower()+'-literal-glyph-repeat.png'))
 sheet=Image.new('RGB',(740,680),(24,26,28));draw=ImageDraw.Draw(sheet)
 entries=[('diffuse',maps['diffuse']),('height',fixed),('XYZ',xyz),('neutral A',lights[0]),('neutral B',lights[1])]
 for ai,(label,cx,cy)in enumerate([('X green',0,h//3),('X gold',0,int(610*scale)),('Y',w//2,0),('XY',0,0)]):
  for pi,(role,im)in enumerate(entries):
   a=np.asarray(im);yy=(np.arange(cy-64,cy+64)%h);xx=(np.arange(cx-64,cx+64)%w);crop=Image.fromarray(a[np.ix_(yy,xx)]);x=6+pi*148;y=30+ai*170;draw.text((x,y-22),label+' '+role,fill='white');sheet.paste(crop,(x,y))
 sheet.save(O/(tier.lower()+'-literal-wraps-corner.png'))
 # Aspect-preserving 2x2 overview; only this overview is resampled.
 tile=maps['diffuse'].resize((256,512),Image.Resampling.LANCZOS);repeat=Image.new('RGB',(512,1024))
 for yy in(0,512):
  for xx in(0,256):repeat.paste(tile,(xx,yy))
 repeat.save(O/(tier.lower()+'-two-by-two-overview.png'))
 sm=np.asarray(Image.fromarray(gold_mask.astype('float32')).resize((w,h),Image.Resampling.BOX));gold=sm>.99;base=sm<.01;witnesses=[]
 annotation=maps['diffuse'].copy();ad=ImageDraw.Draw(annotation)
 for label,cl,group,sx,sy in points:
  x,y=int((sx+.5)*scale),int((sy+.5)*scale);rad=1;vals=height[y-rad:y+rad+1,x-rad:x+rad+1];witnesses.append(dict(label=label,physicalClass=cl,group=group,masterPixel=[sx,sy],tierPixel=[x,y],radius=rad,mean=float(vals.mean()),minimum=float(vals.min()),maximum=float(vals.max())))
  ad.rectangle((x-1,y-1,x+1,y+1),outline='yellow'if group=='gold'else'cyan');ad.text((x+4,y),label,fill='yellow'if group=='gold'else'cyan')
 annotation.save(O/(tier.lower()+'-physical-witnesses.png'))
 wear=[]
 for label,box in classification['retainedWearPatches'].items():
  x0,y0,x1,y1=[int(p*scale)for p in box];a=height[y0:y1,x0:x1];xy=np.stack([np.asarray(maps['normal'+c])[:,:,0]for c in'XY'],2)[y0:y1,x0:x1];wear.append(dict(label=label,tierRectangle=[x0,y0,x1,y1],decodedHeightValues=int(np.unique(a).size),decodedHeightRange=[float(a.min()),float(a.max())],decodedHeightStd=float(a.std()),distinctStoredXYVectors=int(np.unique(xy.reshape(-1,2),axis=0).shape[0])))
 semantics[tier]=dict(sourceClassifiedWitnesses=witnesses,decodedGoldMedian=float(np.median(height[gold])),decodedBaseMedian=float(np.median(height[base])),goldBaseMedianSeparation=float(np.median(height[gold])-np.median(height[base])),globalHeightUniqueValues=int(np.unique(height).size),retainedWearPatches=wear,limitation='Gold is shallow actual ornament, not flat paint by owner decision. Common-substrate wear remains weak and can quantize away; no fine-wear recovery or measured pigment-neutral geometry claim.')
 for j,div in enumerate((2,4)):
  size=(64//div,128//div);a=original.resize(size,Image.Resampling.BOX);b=maps['diffuse'].resize(size,Image.Resampling.BOX);x=10+j*490;y=40+ti*245;dd.text((x,y),tier+' both native/'+str(div)+' '+str(size),fill='white');distance.paste(a.resize((size[0]*3,size[1]*3),Image.Resampling.NEAREST),(x,y+22));distance.paste(b.resize((size[0]*3,size[1]*3),Image.Resampling.NEAREST),(x+size[0]*3+12,y+22))
distance.save(O/'half-quarter-both-tiers.png')
assert before=={p:sha(p)for p in inputs}
r=dict(scope='Independent actual decoded artifact support; only review evidence written',timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),inputs=[rec(p)for p in inputs],inputsStable=True,sourceClassification=rec(D/'source-witness-classification.json'),semanticWitnesses=semantics,opposedLights='Actual decoded normalized XYZ; unit[+.65,-.4,.6] and[-.65,+.4,.6]. Neutral max(dot,0); textured uses.35+.65*neutral. Offline diagnostics only.',fixedHeightDisplay='One fixed .965..1.005 scalar display, not a displacement multiplier or fine-wear claim.',literalCrops='Actual unfiltered cyclic128px crops at X green, X gold, Y and XY, for both tiers; band repeated at1:1. Only the labelled overview uses Lanczos resizing.',outputs=[rec(p)for p in sorted(O.iterdir())])
(D/'art-evidence-manifest.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'manifest':rec(D/'art-evidence-manifest.json'),'semantics':semantics}))
