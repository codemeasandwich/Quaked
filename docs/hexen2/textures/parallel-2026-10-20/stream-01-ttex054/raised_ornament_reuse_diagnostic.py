#!/usr/bin/env python3
"""New owner-directed raised-ornament plan: unchanged-policy diagnostics only.

Replay the actual initial source detail, validate explicit complement geometry,
then call existing layered-veneer composition directly for diagnostic comparisons.
No guard-proof fabrication, canonical recipe/package, encoded tier or code edit.
"""
from pathlib import Path
import hashlib
import io
import json
import sys
import numpy as np
from PIL import Image,ImageDraw

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
from prepare_layered_texture_master import compose_layered,validate_layering
from update_level_sheets import brick_mask
import craft_normals as craft
BATCH=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
OUT=HERE/'raised-ornament-plan-2026-10-20'


def stamp(p):return dict(file=str(p.relative_to(ROOT)),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)


def image(a):return Image.fromarray(np.rint(np.clip(a,0,1)*255).astype('uint8')).convert('RGB')


def complements(gold):
    #Group equal horizontal rows, then split only common-base intervals. No
    #colour/luminance threshold, pixel wear fitting or failed donor-array input.
    rects=[];top=0
    while top<gold.shape[0]:
        bottom=top+1
        while bottom<gold.shape[0] and np.array_equal(gold[top],gold[bottom]):bottom+=1
        base=~gold[top]
        edge=np.diff(np.pad(base.astype(int),(1,1)))
        for left,right in zip(np.flatnonzero(edge==1),np.flatnonzero(edge==-1)):
            rects.append([int(left),int(top),int(right),int(bottom)])
        top=bottom
    #PIL polygon vertices are raster coordinates, not half-open crop edges.
    #The .01px inset retains positive-area one-pixel strips while avoiding an
    #inclusive extra pixel on right/bottom. Exact raster proof follows below.
    regions=[]
    for x0,y0,x1,y1 in rects:
        regions.append(dict(polygon=[[x0/8,y0/8],[(x1-.01)/8,y0/8],[(x1-.01)/8,(y1-.01)/8],[x0/8,(y1-.01)/8]]))
    return rects,regions


def main():
    candidate=OUT/'layered-policy-diagnostics'
    candidate.mkdir(exist_ok=False)
    package=BATCH/'masters/ttex054/master.json'
    source=json.loads(package.read_text());rgb_file=package.parent/'color.png';height_file=package.parent/'height.npy'
    watched=[package,rgb_file,height_file,BATCH/'originals/05-ttex054-cddf441f348f.png',BATCH/'generated/ttex054.png',
        BATCH/'prompts/ttex054-material-v2.txt',ROOT/'tools/texture_sheets/prepare_layered_texture_master.py',
        ROOT/'tools/texture_sheets/update_level_sheets.py',ROOT/'tools/craft_normals.py',Path(__file__).resolve()]
    before=[stamp(p) for p in watched]
    rgb=np.asarray(Image.open(rgb_file).convert('RGB'),dtype=float)/255
    detail=craft.craft(rgb,source['height']['profile'],quantize_height=False)[0]
    replay=io.BytesIO();np.save(replay,detail.astype('float32'),allow_pickle=False)
    if hashlib.sha256(replay.getvalue()).hexdigest()!=source['height']['sha256']:raise ValueError('Initial source-detail replay mismatch')
    assessment=json.loads((OUT/'source-initial-height-assessment.json').read_text())
    gold=np.zeros(detail.shape,dtype=bool)
    for x0,y0,x1,y1 in assessment['sourceBounds']['ornamentProposalRects']:gold[y0:y1,x0:x1]=True
    common_rects,regions=complements(gold)
    base=dict(referenceSize=[64,128],facingHeight=.995,brickHeight=.975,chipFloor=.9751,
        microAmplitude=0.,bevelPixels=.25,brickRegions=regions)
    validate_layering(base,(64,128))
    mask=brick_mask(detail.shape,base)>.5
    differences=int(np.count_nonzero(mask != ~gold))
    if differences:raise ValueError('Existing polygon raster differs from intended complement: '+str(differences))
    #This is a plan fragment, not a canonical recipe: it intentionally lacks
    #source/master proof and cannot be passed off as an accepted CLI package.
    geometry=dict(schemaVersion=1,status='Source-specific layering PROPOSAL fragment; independent geometry/source proof required',
        positiveGeometry='Gold Greek-key strokes only; surrounding ochre/red/green bands remain on common plaster base.',
        commonBaseComplementRectanglesMaster=common_rects,existingLayeringFields=base,
        lowerMaskEqualsComplement=True,lowerPolygonCount=len(regions),goldPixels=int(gold.sum()),goldFraction=float(gold.mean()),
        bevelSigmaMasterPixels=.25*np.sqrt(gold.size)/256,
        maskConvention='Nominal actual-source stroke geometry; straight measured boundaries and fixed return corners, not exact material-alpha recovery.')
    (candidate/'proposed-layering-fragment-NOT-CANONICAL-RECIPE.json').write_text(json.dumps(geometry,indent=2)+'\n')
    image(gold.astype(float)).save(candidate/'positive-gold-only-mask.png')
    image(mask.astype(float)).save(candidate/'existing-substrate-complement-mask.png')
    regions_for_stats={'green':[0,90,512,480],'upper_red':[0,25,512,70],'middle_red':[0,510,512,550],
        'lower_red':[0,690,512,1024],'ochre_top':[0,0,512,14],'ochre_upper_border':[0,558,512,568],'ochre_lower_border':[0,654,512,663]}
    P={'P1':[47,376,86,416],'P2':[92,224,145,270],'P3':[307,135,353,177],'P4':[175,32,212,59]}
    candidates=[]
    for micro in [0.,.00025,.001,.003]:
        layering={**base,'microAmplitude':micro,'chipFloor':.975+2*micro+.0001}
        validate_layering(layering,(64,128))
        height,_,sigma=compose_layered(detail,layering)
        name='micro-'+str(micro).replace('.','p')
        np.save(candidate/(name+'-height-DIAGNOSTIC.npy'),height,allow_pickle=False)
        _,normal=craft.normals_from_height(height,.3,.5)
        for side,light in [('A',np.array([.65,-.4,.6])),('B',np.array([-.65,.4,.6]))]:
            light/=np.linalg.norm(light);image(np.clip(normal@light,0,1)).save(candidate/(name+'-neutral-light'+side+'-1to1.png'))
        #Scalar comparison display fixed across all candidates; no auto contrast.
        image((height-.965)/.04).save(candidate/(name+'-fixed-scalar-display.png'))
        data={}
        for region,(x0,y0,x1,y1) in regions_for_stats.items():
            a=height[y0:y1,x0:x1];data[region]=dict(median=float(np.median(a)),mean=float(a.mean()),std=float(a.std()))
        patches={}
        for label,(x0,y0,x1,y1) in P.items():
            a=height[y0:y1,x0:x1];patches[label]=dict(mean=float(a.mean()),std=float(a.std()),peakToPeak=float(np.ptp(a)),detailCorrelation=float(np.corrcoef(detail[y0:y1,x0:x1].ravel(),a.ravel())[0,1]) if micro else None)
        common_medians=[v['median'] for v in data.values()]
        candidates.append(dict(name=name,layeringParameters={k:v for k,v in layering.items() if k!='brickRegions'},
            heightRange=[float(height.min()),float(height.max())],goldHeightMedian=float(np.median(height[gold])),
            commonBaseColourRegionMeasurements=data,maximumCommonColourMedianDifference=max(common_medians)-min(common_medians),
            protectedPhysicalPatchMeasurements=patches,
            interpretation='micro0 omits scalar fine detail; nonzero exactly reuses initial RGB-derived source detail including known colour-related structure. Bounds are not physical acceptance.'))
    #Independent of any amplitude, quantify whether global scalar detail can
    #separate physical wear from unrelated colour-region medians.
    dmed=[float(np.median(detail[y0:y1,x0:x1])) for x0,y0,x1,y1 in regions_for_stats.values()]
    pstd={label:float(detail[y0:y1,x0:x1].std()) for label,(x0,y0,x1,y1) in P.items()}
    after=[stamp(p) for p in watched]
    if before!=after:raise ValueError('Source/tool input changed')
    report=dict(schemaVersion=1,status='NEW INTERPRETATION diagnostic plan only; independent root geometry/material review required',
        ownerDecisionDate='2026-10-20',ownerDecision='Gold Greek-key should be shallow plaster relief, rather than flat painted plaster.',
        historicalNativeAmbiguity='This is current owner-directed artistic geometry, not historical native-depth proof. Earlier flat-paint HOLDs remain unchanged.',
        initialSourceDetailReplayExact=True,inputsBefore=before,inputsAfter=after,inputsUnchanged=True,
        geometry=geometry,candidates=candidates,
        amplitudeIndependentLimitation=dict(initialCommonColourMedianSpan=max(dmed)-min(dmed),initialPhysicalPatchDetailStd=pstd,
            meaning='With any nonzero microAmplitude, colour-region median steps and genuine physical-patch wear are multiplied by the SAME2micro. Lower amplitude cannot selectively remove pigment emboss while retaining wear.'),
        exactExistingCliRoute='python3 tools/texture_sheets/prepare_layered_texture_master.py --recipe REVIEWED_SOURCE_BOUND_RECIPE --output NEW_8X_MASTER; requires real independent original source/master proof. Then derive_texture_tiers.py only after master art acceptance.',
        gap='The existing CLI accepts no independently qualified pigment-neutral microdetail signal. micro0 gives semantic macrogeometry but omits all fine scalar plaster; nonzero imports known colour effects. No parameter bounds imply that tradeoff is acceptable.',
        effects='Unchanged existing policy called only for diagnostic arrays/lights. No canonical recipe/master/tiers/producer edits or failed donor scalar inputs.',
        outputs=[stamp(p) for p in sorted(candidate.glob('*')) if p.is_file()])
    (candidate/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(polygons=len(regions),maskDifferences=differences,goldFraction=float(gold.mean()),candidateBandMedianSpans={c['name']:c['maximumCommonColourMedianDifference'] for c in candidates},amplitudeIndependentLimitation=report['amplitudeIndependentLimitation'])))


if __name__=='__main__':main()
