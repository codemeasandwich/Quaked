"""Diagnostic only: actual base seam and source/native top hardware support."""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image,ImageDraw
P=Path(__file__).resolve().parent;ROOT=P.parents[5];TOP=P.parents[1];INTAKE=TOP/'screenshot-scene-intake';TRIAL=TOP/'tech-family-colour-trial-v1'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rel(p):return str(Path(p).relative_to(ROOT))
paths={'native08':INTAKE/'base-native-tech08_1.png','donor08':ROOT/'assets/authoring/texture_sheets/sources/official-world-2026-10-17/legacy-tech-q92-masters/tech08_1-4x-diffuse.png','retained6x08':ROOT/'assets/authoring/texture_sheets/sources/official-world-2026-10-12/legacy-tech-pre-4x/diffuse/tech08_1.webp','candidate08':TRIAL/'tech08_1-colour.png','native09':INTAKE/'base-native-tech09_3.png','donor09':ROOT/'assets/authoring/texture_sheets/sources/official-world-2026-10-17/legacy-tech-q92-masters/tech09_3-4x-diffuse.png','candidate09':TRIAL/'tech09_3-colour.png','joins':INTAKE/'wall-joins.json','UVproof':INTAKE/'scene-proof.json','finisher':ROOT/'tools/texture_sheets/finish_official_texture.py'}
inputs=[{'name':n,'file':rel(p),'sha256':sha(p)}for n,p in paths.items()];images={n:Image.open(p).convert('RGB')for n,p in paths.items()if n not in ['joins','UVproof','finisher']};edge=next(j for j in json.loads(paths['joins'].read_text())['exactSharedEdgeJoins']if j['source']=='base'and j['aFace']==2818 and j['bFace']==2830)
profiles={};components={}
for name in ['native08','donor08','candidate08','retained6x08']:
 im=images[name].resize((512,512),Image.Resampling.NEAREST if name=='native08'else Image.Resampling.BOX);a=np.asarray(im.convert('L')).astype(float);row=a[:,32*4:96*4].mean(1);g=np.diff(row);k=int(np.argmax(abs(g[:80])));profiles[name]={'topOliveU32to96MeanLuminanceByQuarterNativeRow':row[:80].tolist(),'strongestTopGradientNativeT':(k+1)/4,'strongestTopGradient':float(g[k]),'leftVentU0to16UpperBorderDarkestWithinT16to24':(int(np.argmin(a[64:96,:64].mean(1)))+64)/4,'method':'Luminance source BOX resized to4x; native nearest4x. Gradient is adjacent4x rows, T=(i+1)/4. Broadfeature location diagnostic; not automatic semantic acceptance.'}
 # Dark regions cut by top boundary: robust bounded discriminator, not a hardware classifier.
 mask=a[:20]<30;seen=set();out=[]
 for y,x in zip(*np.where(mask)):
  start=(int(y),int(x))
  if start in seen:continue
  stack=[start];seen.add(start);comp=[]
  while stack:
   cy,cx=stack.pop();comp.append((cy,cx))
   for yy,xx in [(cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)]:
    if 0<=yy<20 and 0<=xx<512 and mask[yy,xx]and(yy,xx)not in seen:seen.add((yy,xx));stack.append((yy,xx))
  c=np.array(comp)
  if c[:,0].min()==0 and len(comp)>=10:out.append({'boundsNative':[float(c[:,1].min()/4),0,float((c[:,1].max()+1)/4),float((c[:,0].max()+1)/4)],'darkPixelsAt4x':len(comp)})
 components[name]=out
# Direct unchanged source crops, nearest enlarged only for native. No reconstructed/filled artwork.
for material in ['08','09']:
 names=['native'+material,'donor'+material,'candidate'+material];sheet=Image.new('RGB',(3*528+16,160),(25,25,25));d=ImageDraw.Draw(sheet)
 for k,name in enumerate(names):
  im=images[name].resize((512,512),Image.Resampling.NEAREST if name.startswith('native')else Image.Resampling.BOX);crop=im.crop((0,0,512,96))if material=='08'else im.crop((0,464,512,512));x=16+k*528;sheet.paste(crop,(x,40));d.text((x,8),name+(' T0..24'if material=='08'else ' T116..128'),fill='white')
  if material=='08':d.line((x,40+80,x+511,40+80),fill=(255,180,0));d.text((x+220,122),'T20 support limit',fill='white')
 sheet.save(P/(material+'-native-donor-candidate-contact-crops.png'))
report={'scope':'Geometry-only source/contact measurement. No repaired pixels, mask package, height, generation, runtime, installation or acceptance.','inputs':inputs,'actualBaseSeam':edge,'samplingAt4x':'At worldZ=-32 the seam has both nativeT128. Last upper09sample atZ=-31.875 usesT127.875. First lower08sample atZ=-32.125 usesT128.125, modulo128=0.125. DoorSrange modulo128 is16..112. Thus lower cut caps originate in08top source rows, not from a native mapping offset.','sourceSupportBand':{'nativeCoordinateRect':[0,0,128,20],'donor512PixelRectExclusive':[0,0,512,80],'retained768PixelRectExclusive':[0,0,768,120],'content':'Top-boundary clipped bolt caps, invented horizontal rail nearT5.0..6.25, and extra full studs aroundT12..14. Entireband is olive substrate in native except naturalpatina; native louver upper structural contact begins nearT20. Donor louverborder dark core continuesT20..24, outside admittedtopband.','preserve':'All existing source pixels at nativeT>=20 must stay byte-identical under any later bounded repair. Preserve native/HD louveroutline and all acceptedlower photograph. Proposed support only, not an authored mask or repair approval.','sourceAdequacy':'512 is4x; retained768 is6x; neither qualifiesHigh8x.'},'profiles':profiles,'topBoundaryDarkComponentDiagnostic':{'thresholdL':30,'sourceBandAt4x':[0,0,512,20],'fourConnectedMinimumArea':10,'components':components,'interpretation':'Native haszero such cut darkregions; donor/candidate have multiple edge-cutcap-shaped regions visible in the directcrops. Threshold is supplementary diagnostic, not hardware semantic proof.'},'decision':{'globalPhase':'REJECT as minimal correction: shifting away top hardware moves otherwise approximatelycorrect louverenvelope and every existing join; it doesnot remove repeated extraobjects.','existingVerticalLandmarks':'CANNOT remove extra topobjects: finish_official_texture requires strictly increasing [0,0]...[128,128] mapping. It resamples source rows and pinsouterboundary; no selective object removal. Compressing hardware would distort physical feature scale. Internalrail registration is a separate question.','smallestDefensibleSpatialOperation':'Local source-content correction confined to nativeT[0,20), preservingT>=20 exactly, to retain olive substrate/material while removing only the extra rail/boltcaps/studs. This is not a phase/UV offset. No existing reviewed generic colour/landmark control performs that object-selective operation. Exact pixel operation or new source-edit call remains separately reviewed/authorized.','noRecoveredOriginalClaim':'Surviving sourcealreadycontains hardware; original owneratlas not recovered in sourceintake. No claim it originated specifically from historicaloffset rather than atlas/crop/generation. Both768retained and512donor show it.'},'inputsStableAfter':all(sha(ROOT/r['file'])==r['sha256']for r in inputs),'driverSha256':sha(__file__)}
assert report['inputsStableAfter'];(P/'geometry-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'supportNative':[0,0,128,20],'cutDarkRegions':{n:len(v)for n,v in components.items()},'topGradient':{n:v['strongestTopGradientNativeT']for n,v in profiles.items()},'inputsStable':True}))
