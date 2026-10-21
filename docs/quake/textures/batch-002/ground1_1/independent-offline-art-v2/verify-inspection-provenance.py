"""Read-only candidate inspection; writes only this independent review directory."""
from pathlib import Path
import hashlib,json,datetime
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[6]
OUT=Path(__file__).resolve().parent
DOC=OUT.parent
ASSET=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-002/ground1_1'
checks=[]
def check(label, actual, expected):
    a=np.asarray(actual); b=np.asarray(expected)
    ok=a.shape==b.shape and np.array_equal(a,b)
    checks.append({'check':label,'exactPixels':bool(ok)})
def load(p,mode='RGB'): return Image.open(p).convert(mode)
original=load(ASSET/'originals/native-ground1_1.png')
for n in (32,16):
    check(f'native BOX{n}',original.resize((n,n),Image.Resampling.BOX),load(DOC/f'decoded-review/native-box{n}.png'))
for tier in ('mid','high'):
    rgb=load(ASSET/f'tiers/{tier}-diffuse.webp')
    check(f'{tier} decoded RGB',rgb,load(DOC/f'decoded-review/{tier}-diffuse.png'))
    for n in (32,16):
        check(f'{tier} BOX{n}',rgb.resize((n,n),Image.Resampling.BOX),load(DOC/f'decoded-review/{tier}-box{n}.png'))
    repeated=np.tile(np.asarray(rgb),(2,2,1))
    check(f'{tier} literal 2x2 repeat',repeated,load(DOC/f'decoded-review/{tier}-repeat2.png'))
    corners=np.roll(np.asarray(rgb),(rgb.height//2,rgb.width//2),(0,1))
    check(f'{tier} literal four corners',corners,load(DOC/f'decoded-review/{tier}-four-corners.png'))
    check(f'{tier} decoded height',load(ASSET/f'tiers/{tier}-height.webp','L'),load(DOC/f'decoded-review/{tier}-height.png','L'))
    channels=[np.asarray(load(ASSET/f'tiers/{tier}-normal{axis}.webp','L')) for axis in 'XYZ']
    xyz=np.stack(channels,axis=-1)
    check(f'{tier} assembled decoded XYZ',xyz,load(DOC/f'decoded-review/{tier}-xyz.png'))
    normals=xyz.astype(np.float64)/255*2-1
    normals/=np.linalg.norm(normals,axis=2,keepdims=True)
    light=np.array([.6,.4,.7]); light/=np.linalg.norm(light)
    # Independently save exact decoded lighting for inspection; supplied sheet uses same stated equation.
    frames=[]
    for vec in (light,light*np.array([-1,-1,1])):
        shade=np.clip(np.round(180*(.25+.75*np.maximum(normals@vec,0))),0,255).astype(np.uint8)
        frames.append(np.repeat(shade[:,:,None],3,axis=2))
    flat=int(round(180*(.25+.75*light[2])))
    frames.append(np.full_like(frames[0],flat))
    Image.fromarray(np.concatenate(frames,axis=1)).save(OUT/f'{tier}-independent-opposed-flat.png')
# Preserve fixed semantic witnesses; never move a coordinate or relabel a failure.
selection=json.loads((DOC/'master-review/physical-selection.json').read_text())
height=np.load(ASSET/'master/height.npy'); witnessRows=[]
for index,row in enumerate(selection['witnesses'],1):
    vals=[]
    for key in ('matrixXY','crackXY'):
        x,y=row[key]; vals.append(float(height[y-2:y+3,x-2:x+3].mean()))
    witnessRows.append({'pair':index,**row,'matrixHeight5x5':vals[0],'crackHeight5x5':vals[1],'originalAssumedOrdering':vals[0]>vals[1]})
raw=load(ASSET/'generated/ground1_1-source-v1.png')
raw.crop((371,371,883,883)).save(OUT/'raw-centre512-1to1.png')
receipt=json.loads((ASSET/'tiers/manifest.json').read_text()); receiptChecks=[]
for key,row in receipt['inputs'].items():
    q=Path(row['file']); receiptChecks.append({'check':f'manifest input {key} current hash','pass':hashlib.sha256(q.read_bytes()).hexdigest()==row['sha256']})
for tier,row in receipt['tiers'].items():
    for role,r in row['outputs'].items():
        q=ASSET/'tiers'/r['file']; decoded=np.asarray(Image.open(q).convert('RGB' if role=='diffuse' else 'L'))
        receiptChecks.append({'check':f'{tier} {role} file and decoded hash','pass':hashlib.sha256(q.read_bytes()).hexdigest()==r['sha256'] and hashlib.sha256(decoded.tobytes()).hexdigest()==r['decodedPixelSha256']})
proof=json.loads((DOC/'root-public-tier-proof.json').read_text())
for row in proof['watchedInputs']:
    q=ROOT/row['file'];receiptChecks.append({'check':'prior public proof watch '+row['file'],'pass':hashlib.sha256(q.read_bytes()).hexdigest()==row['sha256']})
paths=[ASSET/'originals/native-ground1_1.png',ASSET/'generated/ground1_1-source-v1.png',ASSET/'selection.json',ASSET/'master/color.png',ASSET/'master/height.npy',ASSET/'master/master.json',ASSET/'tiers/manifest.json',DOC/'candidate-batch.json',DOC/'native-independent-proof.json',DOC/'source-master-review.json',DOC/'root-public-tier-proof.json',DOC/'master-review/physical-selection.json',DOC/'master-review/physical-depth-diagnostics.json',DOC/'master-review/physical-semantic-alternatives.json',DOC/'master-review/root-physical-interpretation.json',DOC/'master-review/physical-context-1to1-rgb.png',DOC/'master-review/physical-context-1to1-layout.json',DOC/'review/ground1_1-high-relief.jpg',DOC/'review/ground1_1-mid-relief.jpg']
paths+=sorted((ASSET/'tiers').glob('*.webp'))
paths+=sorted((DOC/'decoded-review').glob('*.png'))
paths+=sorted(OUT.glob('*.png'))
records=[]
for p in paths:
    row={'file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
    if p.suffix in ('.png','.webp'):
        im=Image.open(p);row.update(dimensions=list(im.size),mode=im.mode)
    records.append(row)
report={'recordType':'Independent offline ART inspection provenance only; not source/codec/math requalification','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewer':'/root/quake_ground_r2_art','allExistingInspectionPixelsExact':all(r['exactPixels'] for r in checks),'checks':checks,'inputsAndImages':records,'receiptRebinding':receiptChecks,'allReceiptBindingsCurrent':all(x['pass'] for x in receiptChecks),'fixedWitnessesReplayed':witnessRows,'diagnosticMethod':'Actual WebP decoded through Pillow; same BOX32/16 on native and enhanced; literal 2x2 tile and half-size roll corner; XYZ assembled from actual L channels. Independent neutral lights normalize decoded XYZ then round(180*(.25+.75*max(dot,0))), normalized (+.6,+.4,.7) and (-.6,-.4,.7); same flat normal.'}
(OUT/'inspection-provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'allExistingInspectionPixelsExact':report['allExistingInspectionPixelsExact'],'checkCount':len(checks),'boundFiles':len(records),'receiptBindingChecks':len(receiptChecks),'allReceiptBindingsCurrent':report['allReceiptBindingsCurrent'],'receiptRebinding':receiptChecks,'allReceiptBindingsCurrent':all(x['pass'] for x in receiptChecks),'fixedWitnessesReplayed':witnessRows},indent=2))
assert report['allExistingInspectionPixelsExact'] and report['allReceiptBindingsCurrent']
