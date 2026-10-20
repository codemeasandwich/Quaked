"""Pre-tier author scalar/source diagnostics; no maps or artistic auto-acceptance."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[5]
DOC = Path(__file__).resolve().parent
BASE = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-13-ttex262'
MASTER = BASE/'masters/ttex262-initial'
sha = lambda data: hashlib.sha256(data).hexdigest()
rgb = np.asarray(Image.open(MASTER/'color.png').convert('RGB'))
height = np.load(MASTER/'height.npy',allow_pickle=False)
points = [('A','upper-left stone face',80,80),('B','upper-right stone face',370,120),('C','lower stone face',100,350),('D','lower-right stone face',450,365),('S1','dark weathering/stain candidate',295,365),('S2','dark upper weathering candidate',180,210),('H','pale horizontal contact',350,250),('V','upper vertical contact',230,145),('X','lower X-wrap contact candidate',0,350),('Y','Y-wrap contact candidate',350,0)]
contact = Image.new('RGB',(1000,440),(25,27,30));draw = ImageDraw.Draw(contact);samples=[]
for i,(label,kind,x,y) in enumerate(points):
    xx=i%5*200;yy=i//5*220;draw.text((xx+4,yy+4),label+' '+str([x,y]),fill='white');draw.text((xx+4,yy+18),kind[:27],fill='white')
    patch = np.roll(rgb,(-y+32,-x+32),(0,1))[:64,:64]
    contact.paste(Image.fromarray(patch).resize((192,192),Image.Resampling.NEAREST),(xx+4,yy+42));draw.rectangle((xx+94,yy+132,xx+106,yy+144),outline='red')
    ys=(np.arange(y-3,y+4)%512)[:,None];xs=(np.arange(x-3,x+4)%512)[None,:];values=height[ys,xs]
    samples.append(dict(label=label,sourceClassCandidate=kind,masterPixel=[x,y],radius=3,RGBcenter=rgb[y,x].tolist(),heightCenter=float(height[y,x]),heightMean=float(values.mean()),heightMedian=float(np.median(values)),heightRange=[float(values.min()),float(values.max())]))
contact.save(DOC/'initial-physical-witnesses.png')
report={'schemaVersion':1,'verdict':'HOLD initial tonal scalar pending actual source/physical review; no tiers encoded','masterPackage':{'file':str((MASTER/'master.json').relative_to(ROOT)),'sha256':sha((MASTER/'master.json').read_bytes())},'raw':{'file':str((BASE/'generated/ttex262.png').relative_to(ROOT)),'sha256':sha((BASE/'generated/ttex262.png').read_bytes())},'generationCount':1,'profile':'stone','heightRange':[float(height.min()),float(height.max())],'samples':samples,'views':{str(p.relative_to(ROOT)):sha(p.read_bytes())for p in DOC.glob('initial-*.png')},'limits':['Candidate point classifications require actual RGB/neutral inspection, not a brightness-to-depth rule.','No generated source/master/tier art acceptance or runtime claim. No map encoding or generator call.'],'nextAction':'Root genuine independent source/master-only RGB/float/CLI proof before any needed guarded semantic correction. Independently review actual joint/body/stain mask/planes and literal contacts before tiers.'}
with (DOC/'initial-physical-check.json').open('x')as file:file.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'masterPackage':report['masterPackage'],'samples':samples},indent=2))
