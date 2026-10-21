"""Actual source/master views and layout measurement; no tiers or repair."""
from pathlib import Path
import importlib.util,json,hashlib
import numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import gaussian_filter1d
R=Path.cwd();D=Path(__file__).resolve().parent;B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-16-rtex020';M=B/'masters/rtex020-v2';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();ref=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p)}
o=Image.open(B/'originals/01-rtex020-e000f2f3924b.png').convert('RGB');raw=Image.open(B/'generated/rtex020.png').convert('RGB');c=Image.open(M/'color.png').convert('RGB');h=np.load(M/'height.npy',allow_pickle=False)
spec=importlib.util.spec_from_file_location('oracle',R/'tests/hexen2_texture_tiers_test.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a);n=a.cyclic_normals(h)
ims={'RGB':c,'scalar':Image.fromarray(np.round(h*255).astype('uint8')).convert('RGB'),'XYZ':Image.fromarray(np.round((n*.5+.5)*255).astype('uint8'))}
for label,vec in [('neutralA',[-.55,-.45,.7]),('neutralB',[.55,.45,.7])]:
 v=np.asarray(vec,float);v/=np.linalg.norm(v);ims[label]=Image.fromarray(np.round(np.clip(.2+.8*np.maximum(0,(n*v).sum(2)),0,1)*255).astype('uint8')).convert('RGB')
for label,im in ims.items():
 im.save(D/f'master-{label}.png');z=Image.new('RGB',(1024,2048))
 for x in(0,512):
  for y in(0,1024):z.paste(im,(x,y))
 z.save(D/f'master-{label}-repeat-1to1.png');z.crop((448,0,576,2048)).save(D/f'master-{label}-Xjoin-1to1.png');z.crop((0,960,1024,1088)).save(D/f'master-{label}-Yjoin-1to1.png');z.crop((384,896,640,1152)).save(D/f'master-{label}-corner-1to1.png')
z=Image.new('RGB',(768,520));d=ImageDraw.Draw(z)
for row,div in enumerate((2,4)):
 size=(64//div,128//div)
 for col,(name,im)in enumerate([('native',o),('raw',raw),('master',c)]):
  yy=row*260;d.text((col*256,yy),f'{name} BOX {size}',fill='white');z.paste(im.resize(size,Image.Resampling.BOX).resize((size[0]*3,size[1]*3),Image.Resampling.NEAREST),(col*256,yy+24))
z.save(D/'native-raw-master-BOX-half-quarter.png')
# These ROIs were manually selected from visible bed joints, not inferred depth.
features=[('left-large-top',[1,20,33,27],[1,28,33,35]),('right-large-top',[38,42,62,49],[38,43,62,49]),('left-large-bottom',[1,70,33,79],[1,71,33,78]),('right-large-bottom',[38,78,62,86],[38,78,62,85])]
rows=[]
for label,no,so in features:
 r={'label':label}
 for key,im,box in [('native',o,no),('raw',raw,so),('master',c,no)]:
  x0,y0,x1,y1=box;arr=np.asarray(im,float)/255;scaleX=im.width/64;scaleY=im.height/128;ix0,iy0,ix1,iy1=[round(x0*scaleX),round(y0*scaleY),round(x1*scaleX),round(y1*scaleY)];profile=(arr[iy0:iy1,ix0:ix1]@np.array([.299,.587,.114])).mean(1);smooth=gaussian_filter1d(profile,.25*scaleY,mode='nearest');k=int(smooth.argmin());r[key]={'manualBoxNativeReference':box,'minimumSmoothedLuminanceRowCentreNativeReference':(iy0+k+.5)/scaleY,'measurement':'Mean across visible mortar span, Gaussian.25native-pixel profile smoothing; actual joint interpretation requires source view.'}
 rows.append(r)
report={'status':'Actual source/master/layout diagnostics; no ART/height acceptance implied','raw':ref(B/'generated/rtex020.png'),'master':ref(M/'master.json'),'landmarkMeasurements':rows,'approvedMeasuredWarpApplied':True,'fixedNormalStrengthCap':[.3,.5],'fixedLights':{'A':[-.55,-.45,.7],'B':[.55,.45,.7],'ambient':.2,'diffuse':.8},'outputs':[ref(p)for p in sorted(D.glob('*.png'))],'tiersEncoded':0};(D/'registered-source-master-diagnostic-v2.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'raw':report['raw'],'master':report['master'],'landmarks':rows},indent=2))
