"""Actual padded-canvas diagnostics only; no selected/extracted authoring texture."""
from pathlib import Path
from PIL import Image,ImageDraw
import numpy as np,hashlib,json,datetime
R=Path('/Users/bri/SOURCE/Quaked');A=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018';D=Path(__file__).parent;F=A/'revisions/r1/rtex018-r1-padded-canvas.png'
im=Image.open(F).convert('RGB');a=np.array(im);w,h=im.size;lum=a.astype(float)@np.array([.2126,.7152,.0722]);diff=np.diff(lum,axis=1)
# Detect strong literal grey-to-dark-jamb steps within visually bounded windows,
# not a general colour/material classifier.
left=np.argmin(diff[:,80:120],axis=1)+80+1
right=np.argmax(diff[:,600:650],axis=1)+600+1
rows=[]
for y in [0,20,200,600,1086,1600,2100,2171]:rows.append({'y':y,'leftDarkStepColumn':int(left[y]),'rightGreyStepColumn':int(right[y]),'luminanceSamples':{str(x):float(lum[y,x]) for x in [90,96,98,99,100,101,622,623,624,625,627,632]}})
roi=[(w-h//4)//2,0,(w-h//4)//2+h//4,h]
# Entire source stays in overlay; this is not a selected or extracted texture.
over=im.copy();draw=ImageDraw.Draw(over)
for x,color in [(roi[0],(255,80,80)),(roi[2],(255,80,80)),(100,(70,255,100)),(624,(70,255,100))]:draw.line((x,0,x,h-1),fill=color,width=1)
draw.rectangle((5,5,700,33),fill=(25,25,25));draw.text((9,10),'DIAGNOSTIC: red exact1:4ROI x90/633; green observed jamb steps x100/624',fill='white');over.save(D/'whole-canvas-ROI-boundary-overlay.png')
# Native and canvas distance views. Canvas comparison includes pads; do not
# silently crop/resize an active texture from this held return.
native=Image.open(A/'originals/01-rtex018-7e009202100d.png').convert('RGB')
for div in [2,4]:
 nw,nh=64//div,256//div;cw=round(nh*w/h);panel=Image.new('RGB',(nw+cw,nh),(35,35,35));panel.paste(native.resize((nw,nh),Image.Resampling.BOX),(0,0));panel.paste(im.resize((cw,nh),Image.Resampling.BOX),(nw,0));panel.save(D/('native-BOX'+str(nw)+'-and-whole-carrier.png'))
# Boundary witnesses at literal source scale, no selected whole-texture crop.
panel=Image.new('RGB',(2*96,3*280),(35,35,35));draw=ImageDraw.Draw(panel)
for row,y in enumerate([0,958,1916]):
 for col,(label,x0) in enumerate([('left x64..160',64),('right x588..684',588)]):
  draw.text((col*96,row*280+3),label,fill='white');panel.paste(im.crop((x0,y,x0+96,y+256)),(col*96,row*280+24))
panel.save(D/'boundary-strips-top-middle-bottom-1to1.png')
locations=[('upper glass scene',(140,580,396,836)),('woodland',(160,1390,416,1646)),('bridge',(220,1690,476,1946)),('bottom no rosette',(320,1916,576,2172))]
panel=Image.new('RGB',(512,560),(35,35,35));draw=ImageDraw.Draw(panel)
for i,(label,box) in enumerate(locations):x=i%2*256;y=i//2*280;draw.text((x,y+3),label+' literal256px',fill='white');panel.paste(im.crop(box),(x,y+24))
panel.save(D/'scene-material-bottom-witnesses-1to1.png')
# Pad statistics are evidence only, not an automatic extraction mask.
stats=[]
for name,(x0,x1) in [('left unambiguous pad',(0,96)),('right unambiguous pad',(628,724)),('grey retained by nominalROI-left',(90,98)),('grey retained by nominalROI-right',(627,633))]:
 z=a[:,x0:x1].astype(float);stats.append({'name':name,'xSpanHalfOpen':[x0,x1],'meanRGB':z.mean((0,1)).tolist(),'stdRGB':z.std((0,1)).tolist(),'meanChannelRange':float(np.ptp(z,axis=2).mean())})
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();bind=lambda p:{'file':str(p.relative_to(R)),'sha256':hashfile(p)}
j={'schemaVersion':1,'status':'ACTUAL_PADDED_CANVAS_DIAGNOSTIC_NO_EXTRACTION','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'canvas':bind(F),'dimensions':[w,h],'expectedExact1to4ROI':roi,'requiredTextureWH':[h//4,h],'strongBoundaryStepMethod':'Rec709 luminance horizontal firstdifference, argmin overleft80:120 /argmax overright600:650 per actualrow. These windows were chosen from viewed exteriorpad/solidjamb boundaries, not fitted to inside glass. Step columns denote transitions into nextcolumn.','leftStepColumnCounts':{str(x):int(np.count_nonzero(left==x)) for x in np.unique(left)},'rightStepColumnCounts':{str(x):int(np.count_nonzero(right==x)) for x in np.unique(right)},'literalRows':rows,'observedCoreXYXY':[100,0,624,h],'observedCoreWH':[524,h],'conservativeBoundaryUncertaintyXYXY':[98,0,627,h],'conservativeWidth':529,'requiredWidth':h//4,'maxConservativeMissingWidth':h//4-529,'padStatistics':stats,'conclusion':'No qualified exact1:4fullheightROI exists that both includes complete window and excludes externalgrey. Nominal543pxwideROI includes real externalpads. Cropping height to4*actualwidth would remove native top/bottom content. These are not authorised remedies.','limits':['RGB derivative marks visual architectural transitions, not physical measurement or an exact alpha segmentation. Boundary antialias/ringing uncertainty98..100 and624..627 is explicit.','Diagnostic boxes/overlays are never authoring inputs or selected source extraction.','No master/height/pointer/tier/composition/resample produced.'], 'images':[bind(p) for p in sorted(D.glob('*.png'))]}
(D/'measurement.json').write_text(json.dumps(j,indent=2)+'\n');print(json.dumps({k:j[k] for k in ['leftStepColumnCounts','rightStepColumnCounts','requiredTextureWH','observedCoreWH','conservativeWidth','maxConservativeMissingWidth']},indent=2))
