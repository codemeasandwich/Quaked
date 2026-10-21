import json,pathlib,sys,hashlib
from PIL import Image,ImageDraw
import numpy as np
sys.path.insert(0,'tools');from craft_normals import normals_from_height
base=pathlib.Path('assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-001/masters');out=pathlib.Path('docs/quake/textures/batch-001-pre-tier-art-diagnostics')
# Actual visually identified material regions in prepared-master pixels; no global brightness selector.
regions={
'church1':{'upper_vertical_joint':[505,125,518,410],'upper_left_adjacent_stone':[456,125,482,410],'upper_right_adjacent_stone':[540,125,568,410],'lower_vertical_joint':[236,600,248,910],'lower_left_adjacent_stone':[191,600,219,910],'lower_right_adjacent_stone':[269,600,297,910],'middle_horizontal_joint':[570,505,910,520],'middle_above_stone':[570,461,910,485],'middle_below_stone':[570,543,910,568]},
'maya1_9':{'course1_vertical_joint':[272,48,282,210],'course1_left_adjacent_stone':[235,48,255,210],'course1_right_adjacent_stone':[299,48,319,210],'course2_vertical_joint':[389,295,401,465],'course2_left_adjacent_stone':[352,295,374,465],'course2_right_adjacent_stone':[420,295,442,465],'row1_horizontal_joint':[42,249,117,260],'row1_above_stone':[42,218,117,236],'row1_below_stone':[42,278,117,296],'row2_horizontal_joint':[570,505,620,518],'row2_above_stone':[570,475,620,490],'row2_below_stone':[570,541,620,558]},
'cop2_5':{'turquoise_corrosion':[24,275,44,300],'oxide_transition':[55,275,75,300],'brown_copper_sheet':[338,182,369,212]},
'metal9_4':{'dark_metal_streak':[180,306,193,333],'orange_corrosion':[140,305,150,333],'grey_weathered_metal':[83,191,106,228],'visually_identified_pit':[97,335,101,340]}}
results={}
for name,rs in regions.items():
 d=base/name;m=json.load(open(d/'master.json'));c=Image.open(d/'color.png').convert('RGB');a=np.asarray(c);h=np.load(d/'height.npy');_,n=normals_from_height(h,.3,.5)
 stats={}
 ann=c.copy();draw=ImageDraw.Draw(ann)
 for i,(key,(x0,y0,x1,y1)) in enumerate(rs.items()):
  r=h[y0:y1,x0:x1];stats[key]={'rectMasterPixels':[x0,y0,x1,y1],'meanHeight':float(r.mean()),'medianHeight':float(np.median(r)),'heightP10P90':[float(np.percentile(r,p)) for p in (10,90)],'meanRGB':a[y0:y1,x0:x1].mean((0,1)).tolist()};draw.rectangle((x0,y0,x1,y1),outline=(255,0,255),width=2);draw.text((x0+2,y0+2),str(i+1),fill=(0,255,255))
 ann.save(out/(name+'-samples.png'))
 tile=c.resize((512,512),Image.Resampling.LANCZOS);rep=Image.new('RGB',(1024,1024))
 for y in (0,512):
  for x in (0,512):rep.paste(tile,(x,y))
 rep.save(out/(name+'-repeat.png'))
 imgs=[c,Image.fromarray(np.round(h*255).astype('uint8')).convert('RGB'),Image.fromarray(np.round((n*.5+.5)*255).astype('uint8'))]
 lights=[np.array([.65,.35,.68]),np.array([-.65,-.35,.68])]
 for l in lights:
  l/=np.linalg.norm(l);shade=.2+.8*np.maximum(0,np.einsum('ijk,k->ij',n,l));imgs.append(Image.fromarray(np.uint8(np.clip(shade*255,0,255))).convert('RGB'))
 sheet=Image.new('RGB',(1536,1088),(32,32,32));dr=ImageDraw.Draw(sheet)
 for i,(im,label) in enumerate(zip(imgs,['RGB overview','float height linear0..1','XYZ normal .3/.5','opposed light A','opposed light B'])):
  x=(i%3)*512;y=(i//3)*544;sheet.paste(im.resize((512,512),Image.Resampling.LANCZOS),(x,y+24));dr.text((x+4,y+4),name+' '+label,fill='white')
 sheet.save(out/(name+'-relief.png'))
 tilt=np.degrees(np.arccos(np.clip(n[:,:,2],-1,1)))
 results[name]={'samples':stats,'heightRange':[float(h.min()),float(h.max())],'tiltDegreesP50P90P99Max':[float(np.percentile(tilt,p)) for p in (50,90,99,100)],'inputs':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [d/'master.json',d/'color.png',d/'height.npy']},'normalsDiagnosticOnly':'.3 strength .5 cap same default derive math; not encoded tiers'}
(out/'probe.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
