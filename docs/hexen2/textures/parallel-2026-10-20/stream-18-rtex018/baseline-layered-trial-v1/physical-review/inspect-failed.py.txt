"""Render actual existing layered scalar only. No scalar/recipe mutation or tier."""
from pathlib import Path
import sys,json,hashlib
from PIL import Image,ImageDraw
import numpy as np
R=Path('/Users/bri/SOURCE/Quaked');A=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018';D=Path(__file__).parent;M=A/'art-variants/woodland-bridge/masters/layered-v1';sys.path.insert(0,str(R/'tools'));from craft_normals import normals_from_height
H=np.load(M/'height.npy',allow_pickle=False);rgb=Image.open(M/'color.png').convert('RGB');_,n=normals_from_height(H.astype(float),.3,.5)
views={'height':Image.fromarray(np.rint(H*255).astype('uint8')).convert('RGB'),'XYZ':Image.fromarray(np.rint(np.clip(n*.5+.5,0,1)*255).astype('uint8'))}
for label,vector in [('neutral-A',[-.55,-.55,.63]),('neutral-B',[.55,.55,.63])]:
 light=np.array(vector);light/=np.linalg.norm(light);v=np.rint(180*(.35+.65*np.clip(n@light,0,1))).astype('uint8');views[label]=Image.fromarray(v).convert('RGB')
for name,im in views.items():
 im.save(D/(name+'-full.png'));a=np.asarray(im);x=np.concatenate([a[:,-64:],a[:,:64]],axis=1);y=np.concatenate([a[-64:],a[:64]],axis=0);corner=np.roll(np.roll(a,1024,axis=0),256,axis=1)[896:1152,128:384]
 Image.fromarray(x).save(D/(name+'-Xjoin-1to1.png'));Image.fromarray(y).save(D/(name+'-Yjoin-1to1.png'));Image.fromarray(corner).save(D/(name+'-corner-1to1.png'))
# Literal matched source/height/neutral crops, no display contrast/strength amplification.
boxes=[('upper glass',(50,550,178,678)),('dark woodland',(50,1478,178,1606)),('painted bridge',(80,1640,208,1768)),('mullion/came',(192,630,320,758)),('corrected upper wedges',(100,136,228,264)),('mainpetal newHOLD',(195,195,323,323))]
panel=Image.new('RGB',(512,len(boxes)*150),(30,30,30));draw=ImageDraw.Draw(panel)
for i,(label,box)in enumerate(boxes):
 for k,(name,im)in enumerate([('RGB',rgb),('height0..1',views['height']),('fixed A',views['neutral-A']),('fixed B',views['neutral-B'])]):
  draw.text((k*128,i*150+2),label+' '+name,fill='white');panel.paste(im.crop(box),(k*128,i*150+22))
panel.save(D/'source-height-opposed-witnesses-1to1.png')
points=[('upper glass',100,610),('right glass',390,980),('bridgepaint',150,1705),('dark woodland',100,1530),('mullion',255,650),('came',100,701),('mainpetal cameHOLD',230,273),('mainpetal cameHOLD2',286,247),('mainpetal cameHOLD3',292,259),('mainpetal cameHOLD4',271,280)]
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();b=lambda p:{'file':str(p.relative_to(R)),'sha256':hashfile(p)}
j={'status':'ACTUAL_LAYERED_V1_PHYSICAL_TRIAL_HOLD_MAINPETAL_MASK','master':b(M/'master.json'),'RGB':b(M/'color.png'),'height':b(M/'height.npy'),'fixedMath':'Existingnormals_from_height(fullfloat,.3,.5), packedXYZonlydiagnostic; heightdisplayfixed0..1; gray180*(.35+.65maxdot) with normalizedopposed±.55,±.55,.63 lights. No contrast/amplitude amplification.','samples':[{'role':role,'masterXY':[x,y],'heightPoint':float(H[y,x]),'heightMedian9x9':float(np.median(H[y-4:y+5,x-4:x+5]))}for role,x,y in points],'finding':'Intendedglassscene nowflatcommon.5 ratherthanpaintedterrain; frame raised. However03androotactualsource6xreview confirmedmaincentralfour-petal maskstillcontainsdarkstructuralcame atfourcoordinates. Thatcameisincorrectlyloweredto.5. ActualtrialretainedHOLD, nofinalART orencodedtiers. V2guideand49regionsunchanged; futurev3changesonepetalregiononlyafter03trace+06/rootreview.','RGBUnchangedFromInitial':(M/'color.png').read_bytes()==(A/'art-variants/woodland-bridge/masters/initial-v1/color.png').read_bytes(),'scalarRange':[float(H.min()),float(H.max())],'fineDetailLimitation':'microAmplitude0omitsfinephysicalglass/framewear; paintedsceneisflatcolour, no scalarpigmentrelief.','images':[b(p)for p in sorted(D.glob('*.png'))]}
(D/'physical-HOLD.json').write_text(json.dumps(j,indent=2)+'\n');print(json.dumps({'HOLD':hashfile(D/'physical-HOLD.json'),'range':j['scalarRange'],'RGBExact':j['RGBUnchangedFromInitial']}))
