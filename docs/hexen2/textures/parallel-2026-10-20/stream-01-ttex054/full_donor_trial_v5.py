#!/usr/bin/env python3
"""Approved whole-image ttex054 diagnostic, never a canonical asset producer."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import numpy as np
from PIL import Image,ImageDraw

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
sys.path.insert(0,str(ROOT/'tools'))
import craft_normals as craft
spec=importlib.util.spec_from_file_location('donor_plan_v4',HERE/'donor_microdetail_diagnostic_v4.py')
plan=importlib.util.module_from_spec(spec);spec.loader.exec_module(plan)
OUT=HERE/'whole-donor-trial-v5'
BATCH=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
PROFILE=dict(bands=[1.,.35,0.,0.],groove=0.,bump=0.,glow=0.,strength=.3,cap=.5)


def stamp(path):return dict(file=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size)


def rgb_image(value):return Image.fromarray(np.rint(np.clip(value,0,1)*255).astype('uint8')).convert('RGB')


def light_image(normals,light):
    light=np.asarray(light,dtype=float);light/=np.linalg.norm(light)
    return rgb_image(np.clip(normals@light,0,1))


def corner_joint(image,pixels=128):
    # Literal1:1 four-tile junction, no resampling or averaged seam samples.
    w,h=image.size
    result=Image.new('RGB',(pixels*2,pixels*2))
    result.paste(image.crop((w-pixels,h-pixels,w,h)),(0,0))
    result.paste(image.crop((0,h-pixels,pixels,h)),(pixels,0))
    result.paste(image.crop((w-pixels,0,w,pixels)),(0,pixels))
    result.paste(image.crop((0,0,pixels,pixels)),(pixels,pixels))
    return result


def repeats(name,image):
    w,h=image.size
    x=Image.new('RGB',(w*2,h));x.paste(image,(0,0));x.paste(image,(w,0));x.save(OUT/(name+'-X-repeat-1to1.png'))
    y=Image.new('RGB',(w,h*2));y.paste(image,(0,0));y.paste(image,(0,h));y.save(OUT/(name+'-Y-repeat-1to1.png'))
    corner_joint(image).save(OUT/(name+'-corner-junction-1to1.png'))
    #Source-edge strips both sides of seams remain literal1:1 for direct view.
    x.crop((w-128,0,w+128,h)).save(OUT/(name+'-X-seam-strip-1to1.png'))
    y.crop((0,h-128,w,h+128)).save(OUT/(name+'-Y-seam-strip-1to1.png'))


def main():
    OUT.mkdir(exist_ok=False)
    watched=[BATCH/'masters/ttex054/color.png',BATCH/'masters/ttex054/height.npy',BATCH/'masters/ttex054/master.json',
        BATCH/'originals/05-ttex054-cddf441f348f.png',BATCH/'generated/ttex054.png',BATCH/'prompts/ttex054-material-v2.txt',
        HERE/'root-donor-plan-review.json',HERE/'donor_microdetail_diagnostic_v4.py',HERE/'actual_boundary_trial_v2.py',
        ROOT/'tools/craft_normals.py',Path(__file__).resolve()]
    before=[stamp(p) for p in watched]
    rgb=Image.open(watched[0]).convert('RGB')
    J=np.load(plan.TRIAL/'J-before.npy');Ji=np.load(plan.TRIAL/'J-after.npy');weight=np.load(plan.TRIAL/'interpolation-weight.npy')
    N=J/(1+J);Ni=Ji/(1+Ji);R=plan.photographic_band(N);patches=[]
    for x0,y0,x1,y1 in plan.DONORS:
        patch=R[y0:y1,x0:x1].copy();patch-=patch.mean();patches.append(patch)
    donor=plan.blend_donors(patches,N.shape)
    restored,stats=plan.augment(N,Ni,weight,donor)
    support=weight>0
    #The restored J is useful only for the exact outside-input contract; craft
    #consumes N directly. Copy outside instead of a lossy float round trip.
    restoredJ=J.copy();restoredJ[support]=restored[support]/(1-restored[support])
    if not np.array_equal(restoredJ[~support],J[~support]):raise ValueError('Outside J changed')
    def authored(signal):
        F=craft.craft(np.repeat(signal[:,:,None],3,axis=2),PROFILE,quantize_height=False)[0]
        H=(.98+.02*(F-np.median(F))).astype('float32')
        return F,H
    F,H=authored(restored);Fi,Hi=authored(Ni)
    fine_before=plan.photographic_band(N);fine_interp=plan.photographic_band(Ni);fine_restored=plan.photographic_band(restored)
    for name,array in [('restored-J-DIAGNOSTIC',restoredJ),('restored-N-DIAGNOSTIC',restored),
        ('restored-fine-DIAGNOSTIC',fine_restored),('restored-crafted-F-DIAGNOSTIC',F),('height-TRIAL',H),('interpolated-height-TRIAL',Hi),
        ('same-master-donor-residual',donor),('reviewed-weight',weight)]:np.save(OUT/(name+'.npy'),array,allow_pickle=False)
    images={}
    for label,f,h in [('interpolated',Fi,Hi),('restored',F,H)]:
        rgb_image(f).save(OUT/(label+'-crafted-F-1to1.png'))
        for scale_name,array,strength in [('unscaled-F',f,.3),('shallow-H',h,.3),('shallow-H-strength1-review',h,1.)]:
            _,normal=craft.normals_from_height(array,strength,.5)
            for side,light in [('A',[.65,-.4,.6]),('B',[-.65,.4,.6])]:
                name=label+'-'+scale_name+'-light'+side
                images[name]=light_image(normal,light)
                images[name].save(OUT/(name+'-1to1.png'))
    rgb.save(OUT/'unchanged-source-RGB-1to1.png')
    images['restored-fine']=rgb_image(.5+4*fine_restored)
    images['restored-fine'].save(OUT/'restored-fine-1to1.png')
    for label,a in [('before',fine_before),('interpolated',fine_interp)]:rgb_image(.5+4*a).save(OUT/(label+'-fine-1to1.png'))
    for name in ['restored-unscaled-F-lightA','restored-unscaled-F-lightB','restored-shallow-H-lightA','restored-fine']:
        repeats(name,images[name])
    repeats('unchanged-source-RGB',rgb)
    #One RGB/fine/opposed contact for locating findings; separate literal1:1
    #images above are the actual full-resolution inspection inputs.
    contact=Image.new('RGB',(512*4,1052),'#202020');draw=ImageDraw.Draw(contact)
    for i,(label,image) in enumerate([('unchanged RGB',rgb),('restored fine',images['restored-fine']),('unscaled F lightA',images['restored-unscaled-F-lightA']),('unscaled F lightB',images['restored-unscaled-F-lightB'])]):
        draw.text((i*512+6,7),label,fill='white');contact.paste(image,(i*512,28))
    contact.save(OUT/'whole-source-fine-opposed-contact.png')
    patches_proof=[]
    for index,(x0,y0,x1,y1) in enumerate(plan.PROTECTED,1):
        a=J[y0:y1,x0:x1];b=restoredJ[y0:y1,x0:x1]
        patches_proof.append(dict(label='P'+str(index),box=[x0,y0,x1,y1],
            JExact=bool(np.array_equal(a,b)),beforeJHash=hashlib.sha256(a.tobytes()).hexdigest(),afterJHash=hashlib.sha256(b.tobytes()).hexdigest(),
            craftedHeightBeforeAfterCorrelation=float(np.corrcoef(Fi[y0:y1,x0:x1].ravel(),F[y0:y1,x0:x1].ravel())[0,1])))
    after=[stamp(p) for p in watched]
    if before!=after:raise ValueError('Canonical/review/code input changed during trial')
    report=dict(schemaVersion=1,status='WHOLE IMAGE DIAGNOSTIC ONLY - actual material/repeat review pending',
        sourceIdentity='cddf441f348f0a3182edadeeeb9028ece70c2eadbef541955e7197f8213c9752',
        inputsBefore=before,inputsAfter=after,inputsUnchanged=True,
        maskSupportPixels=int(support.sum()),maskSupportFraction=float(support.mean()),outsideJExact=True,
        protectedPatches=patches_proof,varianceStatistics=stats,donorSampling='Exact approved v4 tiny diagnostic coordinate/math; same two retained-master fine-only patches, scale1.',
        donorPSD=plan.psd(donor),donorAxisCorrelations=plan.correlations(donor),
        profile=PROFILE,commonFixedHeightBase=.98,commonFixedHeightAmplitude=.02,
        comparisonLimits='No per-panel amplitude change. Unscaled F and strength.3 shallow H retained; strength1 shallow H is explicitly labelled diagnostic magnification matching older trial views.',
        downstreamFiltering=dict(maximumFineChangeOutsideMask=float(np.abs((fine_restored-fine_before)[~support]).max()),
            rmsFineChangeOutsideMask=float(np.sqrt(np.mean((fine_restored-fine_before)[~support]**2))),
            statement='Outside J is exact. Downstream filters and normal slopes couple nearby pixels; final filtered height is not claimed outside-bit-identical.'),
        literalInspection='512x1024 individual lights/fine/scalar, X1024x1024 and Y512x2048 repeats;256px corner joints and seam strips contain unchanged-size source pixels.',
        limits='No canonical wrapper, master package, tiers, RGB change, generation, registration or release. Whole-image art and repeated-grain sampling remain unqualified until root review.',
        outputs=[stamp(p) for p in sorted(OUT.glob('*')) if p.is_file()],
        nextAction='Inspect full individual lights/fine and literal repeats/corners for residual raised/recessed paint, smooth rails or donor-grid/stamps, then report actual PASS/HOLD before production code.')
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(output=str(OUT),outsideJExact=True,protectedExact=[x['JExact'] for x in patches_proof],stats=stats)))


if __name__=='__main__':main()
