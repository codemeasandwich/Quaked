#!/usr/bin/env python3
"""Fixed-source ttex054 diagnostic trial. Never writes a canonical package.

Nominal colour geometry uses measured long strokes and reviewed source crops,
not per-pore hue classification. Small corner envelopes explicitly author the
unknown microscopic continuation. Source, prompt, RGB and initial height stay
untouched. Root must review the actual trial before production implementation.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import numpy as np
from PIL import Image, ImageDraw

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
sys.path.insert(0,str(ROOT/'tools'))
import craft_normals as craft
spec=importlib.util.spec_from_file_location('boundary_diagnostic',HERE/'boundary_interpolation_diagnostic.py')
diagnostic=importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostic)
BATCH=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
OUT=HERE/'actual-boundary-trial-v2'

# Actual source-measured stroke bounds, pixel-edge/half-open coordinates.
# The initially guessed lower-right hooks were corrected from enlarged source
# crops: the second hook is x460..472, not the old hypothesis x453.
RECTANGLES=[
 [0,628,19,640],[7,581,19,640],[7,581,107,592],
 [96,581,107,615],[96,603,145,615],[129,581,145,615],
 [129,581,238,593],[226,581,238,640],[226,628,275,640],
 [261,581,275,640],[261,581,364,593],[352,581,364,615],
 [352,603,408,615],[393,581,408,615],[393,581,498,593],
 [485,581,498,640],[485,628,512,640],
 [32,604,80,616],[32,604,44,640],[32,628,214,640],
 [202,604,214,640],[170,604,214,616],
 [288,604,334,616],[288,604,299,639],[288,627,472,639],
 [460,604,472,639],[420,604,472,616],
]
CORNERS=[
 [12,586],[101,586],[101,609],[137,609],[137,587],[232,587],
 [232,634],[268,634],[268,587],[358,587],[358,609],[401,609],
 [401,587],[491,587],[491,634],[12,634],
 [38,610],[80,610],[38,634],[208,634],[208,610],[170,610],
 [294,610],[334,610],[294,633],[466,633],[466,610],[420,610],
]
BAND_RIMS=[(14,25),(73,84),(494,506),(552,560),(567,573),(649,656),(662,672)]
BASELINES=dict(green=.2463137254901961,upper_red=.19432941176470586,
 middle_red=.16779607843137256,ochre=.265378431372549,
 dark_ornament=.10851960784313724,lower_red=.10067450980392156)
PROFILE=dict(bands=[1.,.35,0.,0.],groove=0.,bump=0.,glow=0.,strength=.3,cap=.5)


def stamp(path):
    return dict(file=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size)


def panel(array,mode='gray'):
    if mode=='signal':
        array=np.clip(.5+(array-1)*.7,0,1)
    return Image.fromarray(np.rint(np.clip(array,0,1)*255).astype('uint8')).convert('RGB')


def main():
    OUT.mkdir(exist_ok=False)
    paths=[BATCH/'masters/ttex054/color.png',BATCH/'masters/ttex054/height.npy',BATCH/'masters/ttex054/master.json',
        BATCH/'originals/05-ttex054-cddf441f348f.png',BATCH/'generated/ttex054.png',BATCH/'prompts/ttex054-material-v2.txt',
        HERE/'root-boundary-review.json',Path(__file__).resolve(),ROOT/'tools/craft_normals.py']
    before=[stamp(p) for p in paths]
    rgb=np.asarray(Image.open(paths[0]).convert('RGB'),dtype=np.float64)/255
    shape=rgb.shape[:2]
    native='cddf441f348f0a3182edadeeeb9028ece70c2eadbef541955e7197f8213c9752'
    if shape!=(1024,512) or before[0]['sha256']!='75735d60f4199165c89f02f38d96a021ce471ddd4acd4ca5196a6fae6abf1eba':
        raise ValueError('Exact ttex054 source required')
    previous=json.loads((BATCH/'relief/ttex054-guide-draft/classification-and-calibration.json').read_text())
    protected=[(w['label'],w['masterPixelEdgeBox']) for w in previous['witnesses'] if w['label'] in ['P1','P2','P3','P4']]
    protected_mask=diagnostic.box_mask(shape,[box for _,box in protected])
    paint=diagnostic.box_mask(shape,RECTANGLES)
    edge=diagnostic.edge_of(paint)
    core=diagnostic.dilate(edge,1)
    for y0,y1 in BAND_RIMS:core[y0:y1]=True
    corner_boxes=[[max(x-4,0),y-4,min(x+5,512),y+5] for x,y in CORNERS]
    core |= diagnostic.box_mask(shape,corner_boxes)
    weight=diagnostic.feather_core(core,1)
    support=weight>0
    if support.mean()>.12:raise ValueError('Diagnostic source support exceeds reviewed 12 percent bound')
    if (support&protected_mask).any():raise ValueError('Protected witness overlap')
    # Pin nominal paint classes once; fine wear inside any field keeps the
    # same class baseline and is never fitted or relabelled by pixel colour.
    classes=np.full(shape,0,dtype='uint8')
    rows=[(0,20,'ochre'),(20,76,'upper_red'),(76,501,'green'),(501,557,'middle_red'),
        (557,569,'ochre'),(569,652,'dark_ornament'),(652,665,'ochre'),(665,1024,'lower_red')]
    order=list(BASELINES)
    albedo=np.zeros(shape,dtype=float)
    for y0,y1,name in rows:
        albedo[y0:y1]=BASELINES[name];classes[y0:y1]=order.index(name)
    albedo[paint]=BASELINES['ochre'];classes[paint]=order.index('ochre')
    # Every class transition is inside the full-replacement core. This is a
    # support proof, not a claim that nominal geometry recovered exact alpha.
    class_edges=diagnostic.edge_of(classes)
    class_edges[0]=False # native top/bottom endpoints; no invented perimeter rim
    transition_outside_core=int((class_edges&~core).sum())
    if transition_outside_core:raise ValueError('Unsupported nominal class boundary')
    J=(rgb@np.array([.299,.587,.114]))/albedo
    corrected,denominator=diagnostic.reconstruct(J,weight,4.)
    if not np.array_equal(corrected[~support],J[~support]):raise ValueError('Outside signal changed')
    if not np.isfinite(corrected).all() or (corrected<0).any():raise ValueError('Invalid reconstructed signal')
    normalized_before=J/(1+J)
    normalized_after=corrected/(1+corrected)
    fine_before=diagnostic.fine(normalized_before,np.sqrt(np.prod(shape))/256.)
    fine_after=diagnostic.fine(normalized_after,np.sqrt(np.prod(shape))/256.)
    def crafted(signal):
        return craft.craft(np.repeat(signal[:,:,None],3,axis=2),PROFILE,quantize_height=False)[0]
    F_before=crafted(normalized_before)
    F_after=crafted(normalized_after)
    # Fixed preexisting trial amplitude/base, identical before/after. Unscaled
    # crafted F opposed lights are retained to expose any hidden motif outline.
    H_before=(.98+.02*(F_before-np.median(F_before))).astype('float32')
    H_after=(.98+.02*(F_after-np.median(F_after))).astype('float32')
    for name,arr in [('nominal-paint',paint),('nominal-classes',classes),('interpolation-weight',weight),
        ('fixed-class-baseline-not-physical-albedo',albedo),('J-before',J),('J-after',corrected),
        ('fine-before',fine_before),('fine-after',fine_after),('crafted-F-before',F_before),('crafted-F-after',F_after),
        ('height-TRIAL-before',H_before),('height-TRIAL-after',H_after)]:
        np.save(OUT/(name+'.npy'),arr,allow_pickle=False)
    diagnostic.overlay(rgb,weight,protected,'ttex054 nominal geometry + corner envelopes').save(OUT/'source-mask-overlay.png')
    overlay=diagnostic.overlay(rgb,weight,[],'actual source; no hue-wear pockets')
    overlay.crop((0,598,512,679)).resize((1536,243),Image.Resampling.NEAREST).save(OUT/'source-corner-mask-contact.png')
    Image.fromarray(np.rint(weight*255).astype('uint8')).save(OUT/'interpolation-weight.png')
    sheet=Image.new('RGB',(512*4,1024+28),'#202020');draw=ImageDraw.Draw(sheet)
    for index,(label,arr,mode) in enumerate([('same RGB',rgb,'gray'),('J before',J,'signal'),('J corrected',corrected,'signal'),('fixed weight',weight,'gray')]):
        draw.text((index*512+6,7),label,fill='white');sheet.paste(panel(arr,mode),(index*512,28))
    sheet.save(OUT/'normalized-signal-contact.png')
    for label,before_field,after_field,strength in [('unscaled-F',F_before,F_after,.3),('shallow-height',H_before,H_after,1.)]:
        sheets=Image.new('RGB',(512*4,1024+28),'#202020');sd=ImageDraw.Draw(sheets)
        for i,(name,field) in enumerate([('before',before_field),('after',after_field)]):
            _,normals=craft.normals_from_height(field,strength,.5)
            for j,light in enumerate([np.array([.65,-.4,.6]),np.array([-.65,.4,.6])]):
                light=light/np.linalg.norm(light);value=np.clip(normals@light,0,1)
                x=(i*2+j)*512;sd.text((x+6,7),f'{label} {name} opposed {j+1}',fill='white');sheets.paste(panel(value),(x,28))
        sheets.save(OUT/(label+'-opposed-lights.png'))
    # Same-display fine contact includes explicit zero-centred non-height units.
    fine_contact=Image.new('RGB',(1024,1052),'#202020');fd=ImageDraw.Draw(fine_contact)
    for i,(name,value) in enumerate([('before',fine_before),('after',fine_after)]):
        fd.text((i*512+5,7),f'fine residual {name}; display .5+4F',fill='white');fine_contact.paste(panel(.5+4*value),(i*512,28))
    fine_contact.save(OUT/'fine-residual-contact.png')
    patches=[]
    for label,box in protected:
        x0,y0,x1,y1=box;b=J[y0:y1,x0:x1];a=corrected[y0:y1,x0:x1]
        bf=F_before[y0:y1,x0:x1];af=F_after[y0:y1,x0:x1]
        patches.append(dict(label=label,box=box,JBitExact=bool(np.array_equal(a,b)),
            JBeforeSha256=hashlib.sha256(b.tobytes()).hexdigest(),JAfterSha256=hashlib.sha256(a.tobytes()).hexdigest(),
            craftedBeforeAfterCorrelation=float(np.corrcoef(bf.ravel(),af.ravel())[0,1]),
            fineBeforeAfterMaximumDifference=float(np.max(np.abs(fine_before[y0:y1,x0:x1]-fine_after[y0:y1,x0:x1])))))
    after=[stamp(p) for p in paths]
    if before!=after:raise ValueError('Pinned source input changed')
    outputs=[stamp(p) for p in sorted(OUT.glob('*')) if p.is_file()]
    report=dict(schemaVersion=1,status='ACTUAL DIAGNOSTIC TRIAL ONLY - root relief/art review required',nativeIdentity=native,
        authority='root-boundary-review.json plus supervised stream instruction; no canonical master/producer/tiers',
        inputsBefore=before,inputsAfter=after,sourceInputsUnchanged=True,
        nominalGeometry=dict(rectangles=RECTANGLES,cornerCentres=CORNERS,cornerUncertaintyRadius=4,
            interpretation='Source-measured nominal paint paths, not pixel hue wear fitting. All interior wear retains the one regional class baseline.',
            bandRims=BAND_RIMS,classRows=rows,baselines=BASELINES,baselineMeaning='Empirical fixed class reflectance proxies, not physical albedo or per-stroke illumination fit'),
        mask=dict(supportPixels=int(support.sum()),supportFraction=float(support.mean()),corePixels=int(core.sum()),
            protectedWitnessOverlapPixels=int((support&protected_mask).sum()),minimumSafeDenominator=float(denominator[support].min()),
            nominalClassTransitionsOutsideCore=transition_outside_core,outsideJBitExact=bool(np.array_equal(corrected[~support],J[~support]))),
        math=dict(interpolationSigmaMasterPixels=4.,ordering='L/fixed-class-baseline -> narrow normalized-convolution interpolation -> J/(1+J) -> unchanged unquantized fine craft',
            craftProfile=PROFILE,commonTrialHeightBase=.98,commonTrialHeightAmplitude=.02,
            unscaledCraftedFOpposedLightsRetained=True,
            outsideFineMaximumDifference=float(np.max(np.abs((fine_after-fine_before)[~support]))),
            outsideFineRmsDifference=float(np.sqrt(np.mean((fine_after-fine_before)[~support]**2))),
            qualificationLimit='Unknown local microsurface under paint edges is authored interpolation; fixture does not establish actual art acceptance.'),
        protectedPatches=patches,outputs=outputs,
        nextAction='Root view actual source mask/corners, fine residual, unscaled F and shallow-height opposed lights. Reject remaining coherent paint plateaus/rims or lost plaster cues. No wrapper/master/tiers before independent review.')
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(mask=report['mask'],protectedPatches=patches,output=str(OUT))))


if __name__=='__main__':main()
