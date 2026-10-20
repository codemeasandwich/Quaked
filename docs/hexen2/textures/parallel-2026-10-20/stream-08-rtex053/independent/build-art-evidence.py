"""Independent actual decoded-map diagnostics only; no authoring outputs."""
from pathlib import Path
import json,hashlib,datetime
import numpy as np
from PIL import Image,ImageDraw
D=Path(__file__).parent;R=next(p for p in D.parents if (p/'tools/texture_sheets').is_dir());B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-08-rtex053';E=D/'art-evidence';E.mkdir(exist_ok=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();ref=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p)}
handoff=json.loads((D.parent/'handoff.json').read_text());frozen=handoff['frozenCandidateInputs'];assert all(sha(R/p)==h for p,h in frozen.items());batch=json.loads((B/'batch.json').read_text());item,=batch['items'];native=Image.open(R/item['original']).convert('RGB');master=Image.open(B/'masters/rtex053/color.png').convert('RGB');height=np.load(B/'masters/rtex053/height.npy',allow_pickle=False);samples=json.loads((D.parent/'pre-tier-self-check.json').read_text())['samples'];observations=[]
annotated=master.copy();draw=ImageDraw.Draw(annotated)
contact=Image.new('RGB',(900,700),(28,30,33));dc=ImageDraw.Draw(contact)
for j,q in enumerate(samples):
 x,y=q['masterPixel'];draw.rectangle((x-4,y-4,x+4,y+4),outline='yellow');draw.text((x+5,y-10),q['label'],fill='yellow');cx=j%5;cy=j//5;crop=master.crop((x-12,y-12,x+12,y+12));contact.paste(crop.resize((144,144),Image.Resampling.NEAREST),(cx*180,cy*320+25));dc.text((cx*180,cy*320+6),q['label']+' actualRGB 24x24',fill='white');patch=height[y-3:y+4,x-3:x+4];dc.text((cx*180,cy*320+175),f'7x7H {patch.mean():.4f}',fill='white');dc.text((cx*180,cy*320+190),f'{patch.min():.4f}..{patch.max():.4f}',fill='white');dc.text((cx*180,cy*320+210),q['physicalClass'][:25],fill='white');observations.append({'label':q['label'],'authorProposedClass':q['physicalClass'],'masterPixel':[x,y],'patchRadius':3,'centerHeight':float(height[y,x]),'mean7x7':float(patch.mean()),'range7x7':[float(patch.min()),float(patch.max())],'centerRGB':list(map(int,master.getpixel((x,y))))})
annotated.save(E/'master-witness-labels-1to1.png');contact.save(E/'witness-crops-observations.png')
for tier,fac in [('Mid',4),('High',8)]:
 row=item['tiers'][tier];maps={r:Image.open(R/p).convert('RGB') for r,p in row['files'].items()};rgb=np.asarray(maps['diffuse'],float);norm=np.stack([np.asarray(maps['normal'+c],float)[:,:,0] for c in 'XYZ'],2)/127.5-1;norm/=np.maximum(np.linalg.norm(norm,axis=2,keepdims=True),1e-12);views={'color':maps['diffuse'],'height':maps['height'],'XYZ':Image.fromarray(np.uint8(np.clip((norm*.5+.5)*255,0,255)))}
 for tag,L in [('A',np.array([.6,.3,.75])),('B',np.array([-.6,-.3,.75]))]:
  L=L/np.linalg.norm(L);amp=.35+.65*np.clip((norm*L).sum(2),0,1);views['textured-light-'+tag]=Image.fromarray(np.uint8(np.clip(rgb*amp[:,:,None],0,255)));neutral=np.repeat(np.uint8(np.clip(amp*210,0,255))[:,:,None],3,axis=2);views['neutral-light-'+tag]=Image.fromarray(neutral)
 for role,im in views.items():im.save(E/(tier.lower()+'-'+role+'-1to1.png'))
 for role in ['color','height','XYZ','neutral-light-A','neutral-light-B']:
  im=views[role];a=np.asarray(im);n=im.width;rep=np.tile(a,(2,2,1));Image.fromarray(rep).save(E/(tier.lower()+'-'+role+'-repeat2x2-1to1.png'))
  half=64;xseam=np.concatenate([a[:,-half:],a[:,:half]],axis=1);yseam=np.concatenate([a[-half:],a[:half]],axis=0);corner=rep[n-half:n+half,n-half:n+half];canvas=Image.new('RGB',(704,574),(28,30,33));dr=ImageDraw.Draw(canvas);dr.text((4,5),tier+' '+role+' actual 1:1 X / Y / four-way corner seams',fill='white');canvas.paste(Image.fromarray(xseam),(4,30));canvas.paste(Image.fromarray(yseam),(160,30));canvas.paste(Image.fromarray(corner),(160,190));canvas.save(E/(tier.lower()+'-'+role+'-seams-1to1.png'))
 comparison=Image.new('RGB',(800,430),(28,30,33));dr=ImageDraw.Draw(comparison)
 for i,div in enumerate((2,4)):
  dims=(64//div,64//div);a=native.resize(dims,Image.Resampling.BOX);b=maps['diffuse'].resize(dims,Image.Resampling.BOX);dr.text((10,i*210+5),tier+f' both BOX native/{div} {dims}: native / decoded '+tier,fill='white');comparison.paste(a.resize((dims[0]*5,dims[1]*5),Image.Resampling.NEAREST),(10,i*210+30));comparison.paste(b.resize((dims[0]*5,dims[1]*5),Image.Resampling.NEAREST),(230,i*210+30))
 comparison.save(E/(tier.lower()+'-bothBOX-distance.png'))
assert all(sha(R/p)==h for p,h in frozen.items());report={'schemaVersion':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Independent evidence from actual frozen decoded maps; not an ART verdict','nativeIdentity':handoff['nativeID'],'handoff':ref(D.parent/'handoff.json'),'code':ref(Path(__file__)),'source':{'original':ref(R/item['original']),'canonicalMaster':ref(R/item['masterPackage'])},'witnessObservations':observations,'artifacts':[ref(p) for p in sorted(E.iterdir())],'frozenInputsStable':True};(D/'art-evidence-manifest.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'artifacts':len(report['artifacts']),'manifest':str((D/'art-evidence-manifest.json').relative_to(R))}))
