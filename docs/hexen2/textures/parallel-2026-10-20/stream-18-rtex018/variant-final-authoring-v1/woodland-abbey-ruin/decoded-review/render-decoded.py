"""Actual delivered WebP views only; no authoring/repair/transcode inputs."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
R=Path('/Users/bri/SOURCE/Quaked');A=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018';T=A/'art-variants/woodland-abbey-ruin/tiers/final-v1';D=Path(__file__).parent;native=Image.open(A/'originals/01-rtex018-7e009202100d.png').convert('RGB');rows=[];rgbtiers=[]
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();bind=lambda p:{'file':str(p.relative_to(R)),'sha256':hashfile(p)}
for tier,factor in [('Mid',4),('High',8)]:
 key=tier.lower();rgb=Image.open(T/(key+'-diffuse.webp')).convert('RGB');height=Image.open(T/(key+'-height.webp')).convert('RGB');rgbtiers.append(rgb)
 vector=np.stack([np.array(Image.open(T/(key+'-normal'+c+'.webp')).convert('RGB'))[:,:,0].astype(float)for c in 'XYZ'],axis=2)/127.5-1;vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
 views={'RGB':rgb,'height':height,'XYZ':Image.fromarray(np.rint(np.clip(vector*.5+.5,0,1)*255).astype('uint8'))}
 for label,direction in [('neutral-A',[-.55,-.55,.63]),('neutral-B',[.55,.55,.63])]:
  light=np.array(direction);light/=np.linalg.norm(light);shade=.35+.65*np.clip(vector@light,0,1);views[label]=Image.fromarray(np.rint(180*shade).astype('uint8')).convert('RGB');views['textured-'+label[-1]]=Image.fromarray(np.rint(np.clip(np.asarray(rgb)*shade[:,:,None],0,255)).astype('uint8'))
 for name,im in views.items():
  im.save(D/(tier+'-'+name+'-full.png'));a=np.asarray(im);w,h=im.size;strip=8*factor
  Image.fromarray(np.concatenate([a[:,-strip:],a[:,:strip]],1)).save(D/(tier+'-'+name+'-Xjoin-1to1.png'));Image.fromarray(np.concatenate([a[-strip:],a[:strip]],0)).save(D/(tier+'-'+name+'-Yjoin-1to1.png'));Image.fromarray(np.roll(np.roll(a,h//2,0),w//2,1)[h//2-strip:h//2+strip,w//2-strip:w//2+strip]).save(D/(tier+'-'+name+'-corner-1to1.png'))
  if name in ['RGB','XYZ','neutral-A']:Image.fromarray(np.tile(a,(2,2,1))).save(D/(tier+'-'+name+'-repeat-1to1.png'))
 samples=[]
 for label,x,y in [('upperpaint',100,610),('lowerwoodland',100,1530),('sceneart',150,1705),('mullion',255,650),('came',100,701),('restoredpetalcame',230,273)]:
  xx=int(x*factor/8);yy=int(y*factor/8);a=np.asarray(height)[:,:,0];r=2;samples.append({'role':label,'tierXY':[xx,yy],'decodedHeightMedian5x5':float(np.median(a[yy-r:yy+r+1,xx-r:xx+r+1])),'decodedHeightPoint':int(a[yy,xx])})
 rows.append({'tier':tier,'dimensions':list(rgb.size),'decodedSamples':samples})
for div in [2,4]:
 size=(64//div,256//div);panel=Image.new('RGB',(size[0]*3,size[1]))
 for i,im in enumerate([native,*rgbtiers]):panel.paste(im.resize(size,Image.Resampling.BOX),(size[0]*i,0))
 panel.save(D/('native-Mid-High-BOX'+str(size[0])+'.png'))
# Literal canonical-size mainpetal panel, Mid is shownatitsactualpixel scale (nocropupscale).
panel=Image.new('RGB',(512,310),(28,30,33));draw=ImageDraw.Draw(panel)
for n,(tier,factor)in enumerate([('Mid',4),('High',8)]):
 for k,role in enumerate(['RGB','height','neutral-A','neutral-B']):
  im=Image.open(D/(tier+'-'+role+'-full.png'));box=tuple(int(v*factor/8)for v in [192,192,320,320]);crop=im.crop(box);draw.text((k*128,n*155+2),tier+' '+role,fill='white');panel.paste(crop,(k*128,n*155+22))
panel.save(D/'actual-central-petal-both-tiers-1to1.png')
j={'status':'ACTUAL_DECODED_ART_DIAGNOSTICS_PENDING_AUTHOR_ROOT06_REVIEW','tierManifest':bind(T/'manifest.json'),'normalAndLight':'ActualdecodedXYZchannels /127.5-1 thenrenormalized. Fixedgray180*(.35+.65maxdot)withnormalizedopposed±.55,±.55,.63. No amplitude/contrast hiding. PackedXYZPNGdiagnosticonly.','BOX':'SameBOXfilter nativeleft/Midmiddle/Highright at32x128 and16x64. No sourcealteration.','tiers':rows,'images':[bind(p)for p in sorted(D.glob('*.png'))],'limitations':['micro0physicalsurfaceomitsfineglass/framewear;artworkcolourisflatglass','Q92height/XYZquantizationmustbejudgedfromactualdecodedimages','No registration/runtime/owner/releaseacceptance bythisdiagnostic']}
(D/'actual-decoded-observations.json').write_text(json.dumps(j,indent=2)+'\n');print(json.dumps({'tiers':rows,'receipt':hashfile(D/'actual-decoded-observations.json')}))
