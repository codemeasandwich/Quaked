from pathlib import Path
from PIL import Image, ImageDraw
import json, hashlib, numpy as np
r=Path('/Users/bri/.codex/worktrees/fc24/Quaked')
d=r/'docs/quake/textures/batch-002/woodflr1_6';o=Path(__file__).parent
a=r/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-002/woodflr1_6'
im=Image.open(a/'master-layered-v1/color.png').convert('RGB')
mid=Image.open(a/'tiers-layered-v1/mid-diffuse.webp').convert('RGB');high=Image.open(a/'tiers-layered-v1/high-diffuse.webp').convert('RGB')
h=np.load(a/'master-layered-v1/height.npy',allow_pickle=False)
sheet=Image.new('RGB',(1000,480),(25,26,28));dr=ImageDraw.Draw(sheet)
for k,(name,img,box,region,extra) in enumerate([('MasterRGB',im,(340,355,390,405),(350,374,380,379),(350,379,380,380)),('DecodedHigh',high,(340,355,390,405),(350,374,380,379),None),('DecodedMid',mid,(170,177,195,203),(175,187,190,190),None)]):
 c=img.crop(box);c.save(o/(name.lower()+'-right-contact-unmodified.png'));scale=6 if k<2 else 12
 disp=c.resize((c.width*scale,c.height*scale),Image.Resampling.NEAREST);dd=ImageDraw.Draw(disp);x0,y0,_,_=box;x1,y1,x2,y2=region
 dd.rectangle(((x1-x0)*scale,(y1-y0)*scale,(x2-x0)*scale-1,(y2-y0)*scale-1),outline='cyan',width=1)
 if extra:
  x1,y1,x2,y2=extra;dd.rectangle(((x1-x0)*scale,(y1-y0)*scale,(x2-x0)*scale-1,(y2-y0)*scale-1),outline='red',width=1)
 sheet.paste(disp,(k*330,24));dr.text((k*330,0),name+' nearest display',fill='white')
 dr.text((k*330,350),f'Actual crop {box}\nCyan=fixed contact ROI\n'+('Red=extra Mid footprint row379' if extra else 'No sample coordinates moved'),fill='white')
sheet.save(o/'right-contact-filter-context.png')
report={'scope':'Actual fixed right contact footprint; original master ROI unchanged, no acceptance threshold','originalContactPixelEdges':[350,374,380,379],'MidTierOutwardRoundedPixelEdges':[175,187,190,190],'fullMasterSupportOfTheseMidPixels':[350,374,380,380],'originalContactMean':float(h[374:379,350:380].mean()),'expandedSupportMean':float(h[374:380,350:380].mean()),'perMasterRowMeans':[{'y':y,'mean':float(h[y,350:380].mean()),'inOriginalROI':y<379} for y in range(374,380)],'lastRow379Meaning':'Outside original contact rectangle; first woodside/blended interface row per actual RGB and approved mask boundary y379. Mid last pixel row189 filters master rows378 and379.','finding':'Mid fixed rectangle includes mixed boundary support, not only the original five-pixel contact. Strict contactBelowBoth remains false; no PASS because gap is small. Appearance and wood/stone hierarchy judged separately.'}
(o/'fixed-right-contact-support.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
paths=[d/'candidate-batch.json',d/'result.json',d/'root-layered-plan-review.json',d/'layered-recipe-root-approved.json',d/'source-master-status.json',d/'master-layered-v1-diagnostics/root-interface-review.json',d/'decoded-layered-v1/decoded-public-physical.json',d/'decoded-layered-v1/mid-horizontal-contact-right-decomposition.json',a/'master-v1/color.png',a/'master-v1/height.npy',a/'master-layered-v1/color.png',a/'master-layered-v1/height.npy',a/'master-layered-v1/master.json',a/'tiers-layered-v1/manifest.json',a/'source-v1/native.png',a/'source-v1/generated/a47bf72a420b107f8363ff0f73038393ca0c60673b95f98f465d4a1c296f4b46.png']+list((a/'tiers-layered-v1').glob('*.webp'))+list((d/'decoded-layered-v1').glob('*.png'))
assert (a/'master-v1/color.png').read_bytes()==(a/'master-layered-v1/color.png').read_bytes()
for key in ('mid','high'):
 for role,png,mode in [('diffuse','diffuse','RGB'),('height','height','L')]:
  assert np.array_equal(np.asarray(Image.open(a/f'tiers-layered-v1/{key}-{role}.webp').convert(mode)),np.asarray(Image.open(d/f'decoded-layered-v1/{key}-{png}.png').convert(mode)))
 xyz=np.stack([np.asarray(Image.open(a/f'tiers-layered-v1/{key}-{role}.webp').convert('L')) for role in ('normalX','normalY','normalZ')],axis=-1)
 Image.fromarray(xyz).save(o/f'actual-{key}-XYZ-channel-bytes.png')
 # Existing worker PNG is explicitly a normalized/truncated display, not raw channels.
 vector=xyz.astype(float)/127.5-1
 vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
 normalized_display=np.uint8(np.clip((vector*.5+.5)*255,0,255))
 assert np.array_equal(normalized_display,np.asarray(Image.open(d/f'decoded-layered-v1/{key}-XYZ.png').convert('RGB')))
 assert np.array_equal(xyz,np.asarray(Image.open(o/f'actual-{key}-XYZ-channel-bytes.png').convert('RGB')))
rec=lambda p:{'file':str(p.relative_to(r)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
(o/'review-inputs-before.json').write_text(json.dumps([rec(p) for p in paths],indent=2)+'\n')
print(json.dumps({'boundInputs':len(paths),'actualDiffuseHeightAndOwnedRawXYZPixelExact':True,'workerXYZDisplayExplicitlyNormalizedAndTruncated':True,'RGBLayeredUnmodified':True}))
