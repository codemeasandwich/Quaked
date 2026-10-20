"""Manual source-measured network proposal; diagnostics only, not a recipe.

Run /usr/bin/python3 docs/hexen2/textures/batch-008-ttex153-propose-mortar-network.py.
No master, map, generated artwork or production recipe is modified.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
OUT=ROOT/'docs/hexen2/textures/batch-008-ttex153-pre-tier-diagnostics'
OUT.mkdir(exist_ok=True)
# Actual native-coordinate traces. The varying arrises and staggered vertical
# channels follow registered RGB, independently of mortar's white pigmentation.
REGIONS=[
('H0-top-periodic',[[0,0],[64,0],[64,1.4],[56,1.2],[48,1.3],[40,1.2],[32,1.2],[24,1.1],[16,1.2],[8,1.5],[0,1.4]]),
('H1-first-course',[[0,8.5],[4,8.6],[8,8.4],[12,8.5],[16,8.7],[20,8.5],[24,8.6],[28,8.9],[32,9.1],[36,9.5],[40,9.2],[44,10],[48,10],[52,9.7],[56,9.2],[60,8.7],[64,8.8],[64,11],[60,11.2],[56,11.8],[52,11.5],[48,11.9],[44,11.8],[40,11.6],[36,11.6],[32,11.8],[28,11.8],[24,11.6],[20,11.5],[16,11.4],[12,11.1],[8,10.8],[4,11],[0,11.1]]),
('H2-below-large-course',[[0,27],[8,27.4],[16,27.4],[24,27.6],[32,27.4],[40,27.6],[48,27.7],[56,27.8],[64,27.8],[64,29.4],[56,30],[48,29.7],[40,29.6],[32,29.5],[24,29.7],[16,29.5],[8,29.4],[0,29.2]]),
('H3-below-middle-course',[[0,37],[8,37.4],[16,37.7],[24,37.9],[32,38.3],[40,38.1],[48,38.5],[56,38],[64,37.5],[64,39.7],[56,40.2],[48,40.4],[40,40.1],[32,40.1],[24,39.8],[16,39.4],[8,39.6],[0,39.5]]),
('H4-below-narrow-course',[[0,44.6],[8,45.1],[16,45.3],[24,45.3],[32,45.5],[40,45],[48,45.1],[56,45.1],[64,45.2],[64,47.9],[56,47.7],[48,47.8],[40,47.7],[32,48],[24,47.4],[16,47.6],[8,47.7],[0,47.8]]),
('H5-bottom-periodic',[[0,61.8],[8,61.8],[16,61.5],[24,61.9],[32,61.7],[40,61.8],[48,61.6],[56,61.4],[64,61.6],[64,64],[0,64]]),
('V1-top-left',[[8,1.1],[10.4,1.1],[10.1,4],[10.2,7],[10.8,10.4],[8,10.7],[8.2,7],[7.9,4]]),
('V2-top-centre',[[40.2,1.1],[42.1,1.1],[42.3,4.5],[42,7.5],[42.5,11.5],[40,11.6],[40,8],[40.3,5]]),
('V3-top-right',[[46.8,1.2],[48.8,1.1],[48.4,4.5],[48.4,7.5],[49.1,11.7],[46.6,11.8],[46.5,8],[46.8,4.5]]),
('V4-large-course',[[32.2,11],[34.7,11.3],[34.5,15],[34.3,19],[34,23],[34.2,27.7],[31.5,28],[31.8,24],[32,20],[32.2,16]]),
('V5-middle-left',[[4.4,28.7],[7.2,29.1],[7.3,32],[7.3,35],[7.9,38],[5,38.3],[4.8,35],[4.6,32]]),
('V6-middle-right',[[55.4,29.4],[57.8,29.7],[57.7,32],[57.6,35],[57.9,38.6],[55.6,38.6],[55.4,35],[55.4,32]]),
('V7-narrow-left',[[26.2,39.2],[27.8,39.5],[27.7,42],[27.6,45.9],[25.9,45.8],[26.1,42.5]]),
('V8-narrow-centre',[[35.7,39.5],[37.5,39.7],[37.1,42.5],[37,45.9],[35.3,46],[35.5,43]]),
('V9-narrow-right',[[46.4,39.8],[48.2,39.5],[47.7,42.3],[47.9,45.8],[46.1,45.7],[46.3,43]]),
('V10-bottom-left',[[17,47],[19.8,47.3],[19.4,51],[19.2,55],[19.1,59],[18.8,63],[16.6,63],[17.1,59],[17.4,55],[17.6,51]]),
('V11-bottom-right',[[53.1,47.1],[55.2,47.3],[55,51],[54.7,55],[55.1,59],[55.4,62.8],[53.2,63],[53,59],[53.1,55],[53.1,51]])]
def witness(p):
 p=Path(p);data=p.read_bytes();return dict(file=str(p.relative_to(ROOT)),sha256=hashlib.sha256(data).hexdigest(),bytes=len(data))
def main():
 master=BASE/'masters/ttex153/master.json';m=json.loads(master.read_bytes());rgbp=master.parent/'color.png';height=np.load(master.parent/'height.npy',allow_pickle=False)
 im=Image.open(rgbp).convert('RGB');overlay=im.copy();draw=ImageDraw.Draw(overlay);mask=Image.new('L',(512,512));md=ImageDraw.Draw(mask)
 for label,polygon in REGIONS:
  assert 3<=len(polygon)<=64 and all(0<=x<=64 and 0<=y<=64 for x,y in polygon)
  pts=[(x*8,y*8) for x,y in polygon];md.polygon(pts,fill=255);draw.line(pts+[pts[0]],fill=(255,0,255),width=1)
 mask=np.asarray(mask)>0
 points=dict(J1=[22,10],F1A=[22,6],F1B=[22,15],J2=[42,28.5],F2A=[42,25],F2B=[42,32],J3=[37,46.5],F3A=[40,43],F3B=[37,51],drip1=[19,17],drip2=[12.3,33],drip3=[36.5,51])
 classes={}
 for label,(x,y) in points.items():
  px,py=round(x*8),round(y*8);inside=bool(mask[py,px]);values=height[py-3:py+4,px-3:px+4]
  assert inside if label.startswith('J') else not inside,(label,'wrong physical mask class')
  classes[label]=dict(nativeEdgeCoordinates=[x,y],proposedLowerMask=inside,currentHeightMean=float(values.mean()),currentHeightMedian=float(np.median(values)))
  draw.ellipse((px-2,py-2,px+2,py+2),outline='yellow');draw.text((px+3,py-9),label,fill='yellow',stroke_width=1,stroke_fill='black')
 preview=OUT/'proposed-mortar-network-boundary.png';overlay.resize((1024,1024),Image.Resampling.NEAREST).save(preview)
 report=dict(schemaVersion=1,scope='Source-measured semantic mask/plane proposal only, not an authored production recipe/master or acceptance receipt.',name='ttex153',edition='portals',nativeIdentity='b0d888d2faaedfc77346980aefcce52f620cabf34f80365bbbd17fd7835e10c6',
  sourceMasterPackage=witness(master),sourceRGB=witness(rgbp),sourceHeight=witness(master.parent/'height.npy'),referenceSize=[64,64],
  sourceMeasurement='Inspected actual64px native,1254px raw and512px registered RGB, with enlarged native-coordinate grid. Continuous physical arrises/course offsets traced manually. No whiteness threshold, regular rectangular grid or copied other-material coordinates.',
  physicalInterpretation='Ochre limestone facing stands above pale lime-mortar channels. White deposits terminating within stone faces remain facing surface color; they are not structural joints.',
  regions=[dict(label=label,polygon=p) for label,p in REGIONS],
  planeProposal=dict(facingHeight=.70,brickHeight=.30,chipFloor=.55,microAmplitude=.035,bevelPixels=.5),
  planeExplanation='Existing layered-veneer brickRegions/brickHeight denote lower mortar substrate here. No additional literal bricks. .5 reference bevel gives sigma1masterpx at512, on interface only; RGB stays unchanged. Conservative normalized ranges mortar .265..335, facing .515..735. Full-precision photograph-derived fine detail is retained within those ranges.',
  wrapExplanation='H0/H5 represent observed top/bottom periodic mortar, with connected actual staggered vertical channels. No new image-perimeter bevel is requested; decoded repeats/corners remain required.',
  proposalWitnessClassifications=classes,
  excludedSurfaceDeposits=['drip1(19,17): downward white tongue inside second-course left face.','drip2(12.3,33): white smear inside middle-course facing, away from actual structural vertical joint atx~6.','drip3(36.5,51): white tongue inside broad bottom face, between actual structural vertical joints atx~18 and54.'],
  correctedWitness=dict(priorLabel='F3A',priorCoordinate=[37,43],actualClass='narrow-course vertical mortar joint, not face',correctedFaceCoordinate=[40,43],effect='Earlier source/master-only replay PASS unchanged; its third upper-neighbor art label was wrong and is explicitly superseded here. First two correctly classified local inversions and overall semantic HOLD stand.'),
  coordinateLimits='Manual chipped-arrise boundary uncertainty approximately .25nativepx/2masterpx. Inspect the proposal overlay; actual successor mixed interfaces and opposed lights must pass before tier derivation. Sample classes alone do not qualify every boundary.',
  currentReliefStatus='HOLD: exact tonal craft raises pale physical joint centres. Do not encode current bad height.',
  nextChecks=['Root can bind source/master proof to existing guarded layered wrapper after approving measured plan; no guard weakening/new pipeline.','Before tiers inspect exact full-precision successor composition, RGB preservation, all network interfaces/junctions, actual face/joint witnesses and opposed lights.','Retain three marked white face deposits on facing.','Then inspect both actual decoded tiers, native-half/quarter BOX, repeats/corners and relief.'],
  preview=witness(preview),probeSource=witness(Path(__file__)),proposalNotExecutionAuthority=True)
 target=OUT/'mortar-network-proposal.json';assert not target.exists();target.write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(dict(proposal=witness(target),preview=witness(preview),regionCount=len(REGIONS),samples=classes)))
if __name__=='__main__':main()
