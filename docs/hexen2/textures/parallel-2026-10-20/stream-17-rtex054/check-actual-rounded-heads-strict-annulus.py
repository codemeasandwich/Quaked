"""Actual one-trial float/normal head curvature witnesses; no map encoding."""
from pathlib import Path
import json,hashlib,sys
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5];DOC=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-17-rtex054';MP=BASE/'masters-layered/rtex054'
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
sys.path.insert(0,str(ROOT/'tools'))
from craft_normals import normals_from_height
from update_level_sheets import brick_mask
w=lambda p:{'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
h=np.load(MP/'height.npy',allow_pickle=False);recipe=json.loads((BASE/'relief/rtex054-shallow-fastener-v1.json').read_bytes());mask=brick_mask(h.shape,recipe['layering']);_,n=normals_from_height(h,.3,.5)
rgb=np.asarray(Image.open(MP/'color.png').convert('RGB'));coords=[('H1',45,44),('H2',255,44),('H3',466,44),('H4',44,255),('H5',466,255),('H6',45,466),('H7',255,466),('H8',466,466)]
lights=[]
for sign in(1,-1):
 v=np.array([sign*.6,sign*.3,.75]);v/=np.linalg.norm(v);gain=.35+.65*np.maximum(0,(n*v).sum(2));lights.append(np.repeat(np.rint(180*gain).astype('uint8')[:,:,None],3,2))
xyz=np.rint(np.clip((n*.5+.5)*255,0,255)).astype('uint8');canvas=Image.new('RGB',(1280,1056),(25,27,30));dr=ImageDraw.Draw(canvas);reports=[]
for i,(label,x,y)in enumerate(coords):
 vals=[];yy,xx=np.mgrid[-34:35,-34:35];dist=np.sqrt(xx**2+yy**2);ys=(y+yy)%512;xs=(x+xx)%512;v=h[ys,xs];m=mask[ys,xs]
 for lo,hi in[(0,3.001),(4,8),(8,12),(12,16),(16,20),(30,34)]:
  q=(dist>=lo)&(dist<hi);values=v[q];vals.append({'annulusMasterPixels':[lo,hi],'pixels':int(q.sum()),'mean':float(values.mean()),'median':float(np.median(values)),'range':[float(values.min()),float(values.max())],'lowerPlateSupportFraction':float(m[q].mean())})
 assert all(a['mean']>b['mean']for a,b in zip(vals,vals[1:])),label+' actual mean radial descent'
 assert vals[0]['lowerPlateSupportFraction']==0 and vals[3]['lowerPlateSupportFraction']==0 and vals[-1]['lowerPlateSupportFraction']==1
 reports.append({'label':label,'centre':[x,y],'actualScalarAnnuli':vals,'centreShoulderPlateMeanHierarchy':True,'interpretation':'Source-aligned raised centre smoothly descends through broad interior shoulder to lower plate, with bounded local source variation. Annular means do not erase individual pit/highlight variations.'})
 px=i%4*320;py=i//4*528;dr.text((px+4,py+4),label+' actual RGB / XYZ',fill='white');dr.text((px+4,py+278),label+' actual neutral A / B',fill='white')
 for k,a in enumerate((rgb,xyz,lights[0],lights[1])):
  patch=np.roll(a,(-y+38,-x+38),(0,1))[:76,:76];im=Image.fromarray(patch).resize((152,152),Image.Resampling.NEAREST);canvas.paste(im,(px+(k%2)*160,py+28+(k//2)*280))
canvas.save(DOC/'actual-eight-rounded-heads-RGB-XYZ-neutral.png')
out={'schemaVersion':1,'verdict':'PASS actual one-trial float radial head hierarchy; actual neutral ART observation separate','masterPackage':w(MP/'master.json'),'height':w(MP/'height.npy'),'recipe':w(BASE/'relief/rtex054-shallow-fastener-v1.json'),'radiusMethod':'Concentric actual-master annuli around source-specific head centres; near0..3pixel centre,12..16shoulder and30..34plate explicitly checked against raster support. Additional radial intervals verify mean descent.','allEightCentreShoulderPlatePassed':True,'heads':reports,'views':[w(DOC/'actual-eight-rounded-heads-RGB-XYZ-neutral.png')],'limits':['Relative shallow cap geometry, not calibrated hemisphere or photogrammetric depth.','Pitting and highlights may vary individual samples; no claim every radial point is monotone.','No tier or final ART acceptance from numerical annular means.'],'tool':w(Path(__file__))}
p=DOC/'actual-rounded-heads-check.json'
with p.open('x')as f:f.write(json.dumps(out,indent=2)+'\n')
print(json.dumps({'proof':w(p),'means':[(q['label'],[round(z['mean'],6)for z in q['actualScalarAnnuli']])for q in reports]}))
