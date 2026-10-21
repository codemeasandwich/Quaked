from pathlib import Path
import importlib.util,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[5];out=Path(__file__).parent
spec=importlib.util.spec_from_file_location('oracle',root/'tests/hexen2_texture_tiers_test.py');o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
b=root/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/parallel-020/wwall1_1/master'
a=Image.open(b/'color.png').convert('RGB');h=np.load(b/'height.npy');n=o.cyclic_normals(h.astype(float))
sheet=Image.new('RGB',(1024,1064));d=ImageDraw.Draw(sheet)
entries=[('master colour',a),('float height visualisation',Image.fromarray(np.uint8(np.round(h*255))).convert('RGB'))]
for label,l in [('light A',np.array([.6,.3,.75])),('light B',np.array([-.6,-.3,.75]))]:
 l=l/np.linalg.norm(l);v=.35+.65*np.clip((n*l).sum(2),0,1);entries.append((label,Image.fromarray(np.uint8(np.clip(np.asarray(a)*v[:,:,None],0,255)))))
for i,(label,im) in enumerate(entries):
 x=(i%2)*512;y=(i//2)*532;sheet.paste(im,(x,y+20));d.text((x+4,y+3),label,fill='white')
sheet.save(out/'pre-tier.png')
pairs=[{'face':[210,120],'joint':[258,120]},{'face':[310,175],'joint':[259,175]},{'face':[200,215],'joint':[200,254]},{'face':[285,290],'joint':[285,254]},{'face':[85,375],'joint':[130,375]},{'face':[350,385],'joint':[391,385]}]
for row in pairs:
 for role in ('face','joint'):
  x,y=row[role];row[role+'MeanHeight']=float(h[y-2:y+3,x-2:x+3].mean())
 row['faceAboveJoint']=row['faceMeanHeight']>row['jointMeanHeight']
r={'scope':'Pre-tier semantic samples classified on actual master RGB and native layout, independent of brightness thresholds. Six local face/joint witnesses, not exhaustive art acceptance.','coordinateSpace':'512x512 master pixels;5x5 means','samples':pairs,'allSampledFacesAboveJoints':all(x['faceAboveJoint'] for x in pairs),'heightDtype':str(h.dtype),'finite':bool(np.isfinite(h).all()),'range':[float(h.min()),float(h.max())],'masterSha256':hashlib.sha256((b/'master.json').read_bytes()).hexdigest(),'diagnostic':'pre-tier.png'}
(out/'pre-tier.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
