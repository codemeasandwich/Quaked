#!/usr/bin/env python3
"""Bounded diagnostic guide proposal, not a texture/height producer.

The UNRESOLVED channel and identity sentinel prohibit using this incomplete
proposal as an albedo-normalization input. No height or tier is produced.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import textwrap

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[3]
BATCH = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
OUT = BATCH / 'relief/ttex054-guide-draft'
REPORT = ROOT / 'docs/hexen2/textures/batch-008-ttex054-guide-proposal.json'
SOURCE = BATCH / 'masters/ttex054/color.png'
EXPECTED_RGB = '75735d60f4199165c89f02f38d96a021ce471ddd4acd4ca5196a6fae6abf1eba'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def rel(path):
    return str(path.relative_to(ROOT))

def bound(path):
    return {'file': rel(path), 'sha256': sha(path), 'bytes': path.stat().st_size}

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')

def font(size=16):
    return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', size)

def lines(draw, xy, content, width=68, fill='white', size=16):
    x, y = xy
    for line in textwrap.wrap(content, width=width):
        draw.text((x, y), line, font=font(size), fill=fill)
        y += size + 5
    return y

def main():
    if OUT.exists() or REPORT.exists():
        raise SystemExit('Refusing to overwrite existing proposal/evidence')
    assert sha(SOURCE) == EXPECTED_RGB
    source = Image.open(SOURCE).convert('RGB')
    assert source.size == (512, 1024)
    rgb = np.asarray(source, dtype=np.float64) / 255
    luminance = rgb @ np.array([.299, .587, .114])
    protected_inputs = [SOURCE, BATCH/'masters/ttex054/height.npy',
                        BATCH/'masters/ttex054/master.json',
                        BATCH/'generated/ttex054.png',
                        BATCH/'originals/05-ttex054-cddf441f348f.png',
                        BATCH/'prompts/ttex054-material-v2.txt',
                        ROOT/'docs/hexen2/textures/batch-008-ttex054-relief-reuse-plan.json']
    before = [bound(p) for p in protected_inputs]

    # Rectangles are actual registered-master pixel-edge coordinates, half-open.
    # They sample colour within visually inspected bands; they do not claim
    # reflectance has been uniquely separated from illumination/microgeometry.
    patch_specs = [
        ('G1', 'green', (96,160,132,196)), ('G2','green',(326,240,362,276)),
        ('G3','green',(185,375,221,411)),
        ('U1','upper-red',(72,32,108,56)), ('U2','upper-red',(246,32,282,56)),
        ('U3','upper-red',(400,32,436,56)),
        ('M1','middle-red',(72,516,108,540)), ('M2','middle-red',(246,516,282,540)),
        ('M3','middle-red',(400,516,436,540)),
        ('O1','ochre',(72,3,108,11)), ('O2','ochre',(278,3,314,11)),
        ('O3','ochre',(72,559,108,566)), ('O4','ochre',(278,559,314,566)),
        ('O5','ochre',(44,583,76,591)), ('O6','ochre',(170,583,202,591)),
        ('O7','ochre',(294,583,326,591)),
        ('D1','dark-ornament',(44,596,76,603)),
        ('D2','dark-ornament',(171,596,201,603)),
        ('D3','dark-ornament',(294,596,326,603)),
        ('L1','lower-red-unresolved',(100,842,116,858)),
        ('L2','lower-red-unresolved',(318,750,334,766)),
        ('L3','lower-red-unresolved',(408,940,424,956)),
    ]
    patches = []
    for label, cls, box in patch_specs:
        x0,y0,x1,y1 = box
        a, l = rgb[y0:y1,x0:x1], luminance[y0:y1,x0:x1]
        patches.append({'label': label, 'class': cls, 'masterPixelEdgeBox': list(box),
                        'nativePixelEdgeBox': [v/8 for v in box],
                        'pixels': l.size, 'medianRGB': np.median(a,axis=(0,1)).tolist(),
                        'medianLuminance': float(np.median(l)),
                        'p10p90Luminance': np.quantile(l,[.1,.9]).tolist(),
                        'status': 'PROPOSED calibration; independent review required',
                        'lowerFieldAmbiguity': cls == 'lower-red-unresolved'})

    class_names = ['UNRESOLVED', 'green', 'upper-red', 'middle-red', 'ochre', 'dark-ornament']
    palette = [(255,0,220), (42,205,148), (255,105,60), (255,55,60), (255,214,35), (112,150,255)]
    calibrations = []
    for name in class_names:
        if name == 'UNRESOLVED':
            calibrations.append({'class':name, 'value':1.0,
                                 'meaning':'IDENTITY SENTINEL, not measured pigment albedo; ineligible for height'})
            continue
        same = [p for p in patches if p['class'] == name]
        values = [p['medianLuminance'] for p in same]
        calibrations.append({'class':name, 'value':float(np.median(values)),
                             'method':'median of equal-weight patch medians, no per-pixel fit',
                             'patches':[p['label'] for p in same],
                             'minMaxPatchMedians':[min(values),max(values)],
                             'relativePatchMedianSpread':float((max(values)-min(values))/np.median(values)),
                             'status':'Unaccepted empirical reflectance proxy; illumination confounded'})

    # Broad conservative supports only, measured against the actual RGB.
    # Supersampling creates fractional region coverage, not inferred paint edges.
    # Boundaries/shadows are deliberately not silently filled or classified.
    ss = 4
    labels = Image.new('L', (512*ss,1024*ss), 0)
    draw = ImageDraw.Draw(labels)
    supports = [
        ('ochre',[0,0,512,15]), ('upper-red',[0,22,512,72]),
        ('green',[0,82,512,489]), ('middle-red',[0,506,512,552]),
        ('ochre',[0,560,512,569]), ('dark-ornament',[0,575,512,651]),
        ('ochre',[0,655,512,663]),
    ]
    for name, box in supports:
        x0,y0,x1,y1 = box
        draw.rectangle((x0*ss,y0*ss,x1*ss-1,y1*ss-1), fill=class_names.index(name))
    # Manual geometric hypothesis for broad ochre stroke centres. The exact
    # boundary is NOT established: a 3 px uncertainty guard surrounds all label
    # transitions. No image-derived hue/luminance thresholds trace pores.
    motif_lines = [
        [(-8,632),(13,632),(13,586),(103,586),(103,610),(139,610),
         (139,586),(231,586),(231,632),(270,632),(270,586),
         (361,586),(361,610),(397,610),(397,586),(491,586),(491,632),(520,632)],
        [(74,610),(44,610),(44,632),(196,632),(196,610),(171,610)],
        [(330,610),(300,610),(300,632),(453,632),(453,610),(428,610)],
    ]
    for points in motif_lines:
        draw.line([(int(x*ss),int(y*ss)) for x,y in points],fill=4,width=10*ss,joint='curve')
    high = np.asarray(labels)
    provisional = np.stack([np.asarray(Image.fromarray((high==i).astype('uint8')*255)
                      .resize((512,1024),Image.Resampling.BOX),dtype=np.float32)/255
                      for i in range(len(class_names))])
    # BOX byte rounding can slightly perturb sums; normalize once explicitly.
    provisional /= provisional.sum(axis=0,keepdims=True)
    hard = np.argmax(provisional,axis=0)
    boundary = np.zeros((1024,512),dtype=bool)
    boundary[1:] |= hard[1:] != hard[:-1]
    boundary[:-1] |= hard[1:] != hard[:-1]
    boundary |= hard != np.roll(hard,1,axis=1)
    boundary |= hard != np.roll(hard,-1,axis=1)
    boundary_guard = np.asarray(Image.fromarray(boundary.astype('uint8')*255)
                               .filter(ImageFilter.MaxFilter(7))) > 0
    weights = provisional.copy()
    weights[:,boundary_guard] = 0
    weights[0,boundary_guard] = 1
    valid = weights[0] == 0
    guide = (weights*np.asarray([c['value'] for c in calibrations],dtype=np.float32)[:,None,None]).sum(axis=0)
    assert weights.shape == (6,1024,512)
    assert np.isfinite(weights).all() and np.isfinite(guide).all() and (guide>0).all()
    assert np.max(np.abs(weights.sum(axis=0)-1)) < 2e-7

    witness_specs = [
        ('P1','green raised flake / dark adjacent pore',(47,376,86,416),'green'),
        ('P2','green granular aggregate / pores',(92,224,145,270),'green'),
        ('P3','green pale worn aggregate cluster',(307,135,353,177),'green'),
        ('P4','upper red pitted plaster',(175,32,212,59),'upper-red'),
        ('A1','lower red / dark green islands - ambiguous',(12,690,90,770),'UNRESOLVED'),
        ('A2','lower mixed wear/pigment/shadow - ambiguous',(304,772,382,850),'UNRESOLVED'),
        ('A3','red/green dark rim - pigment vs shadow unresolved',(185,68,263,88),'UNRESOLVED'),
        ('A4','middle green/red dark rim - unresolved',(185,484,263,511),'UNRESOLVED'),
        ('E1','ochre stroke and dark ground boundary',(43,581,84,608),'edge-review'),
        ('E2','meander inside corner',(94,583,150,620),'edge-review'),
    ]
    protected = np.zeros((1024,512),dtype='uint8')
    witnesses=[]
    for label, desc, box, cls in witness_specs:
        x0,y0,x1,y1=box
        if label.startswith('P'):
            protected[y0:y1,x0:x1]=255
        a=guide[y0:y1,x0:x1]
        witnesses.append({'label':label,'description':desc,'masterPixelEdgeBox':list(box),
                          'nativePixelEdgeBox':[v/8 for v in box], 'proposedClass':cls,
                          'validGuideFraction':float(np.mean(valid[y0:y1,x0:x1])),
                          'guideRange':[float(a.min()),float(a.max())],
                          'meaning':'P witnesses are protected from guide fitting; A/E remain unqualified semantic/edge witnesses'})
    for p in patches:
        x0,y0,x1,y1=p['masterPixelEdgeBox']
        p['physicalWitnessOverlapPixels']=int((protected[y0:y1,x0:x1]>0).sum())
    assert all(p['physicalWitnessOverlapPixels']==0 for p in patches)

    OUT.mkdir(parents=True)
    np.save(OUT/'albedo-guide.npy',guide.astype('float32'),allow_pickle=False)
    np.savez_compressed(OUT/'class-weights.npz',weights=weights.astype('float32'),classes=np.array(class_names))
    Image.fromarray(valid.astype('uint8')*255).save(OUT/'validity-mask.png')
    Image.fromarray(boundary_guard.astype('uint8')*255).save(OUT/'unresolved-boundary-mask.png')
    Image.fromarray(protected).save(OUT/'protected-physical-witness-mask.png')
    # Grey image is ALBEDO guide display only; never a relief/height image.
    Image.fromarray(np.rint(guide*255).astype('uint8')).save(OUT/'albedo-guide-display-not-height.png')
    colors=np.asarray(palette,dtype=np.float32)
    cls_rgb=np.einsum('chw,cd->hwd',weights,colors)
    overlay=np.rint(.58*np.asarray(source,dtype=float)+.42*cls_rgb).clip(0,255).astype('uint8')
    overlay=Image.fromarray(overlay)
    overlay_draw=ImageDraw.Draw(overlay)
    for p in patches:
        x0,y0,x1,y1=p['masterPixelEdgeBox']
        overlay_draw.rectangle((x0,y0,x1-1,y1-1),outline='white',width=1)
        overlay_draw.text((x0,y0-12),p['label'],fill='white',font=font(10))
    overlay.save(OUT/'class-overlay.png')

    # Side-by-side source + label proposal with explicit legend and HOLD label.
    page=Image.new('RGB',(1400,1160),'#191919');pd=ImageDraw.Draw(page)
    pd.text((20,12),'TTEX054 SOURCE / PARTIAL PIGMENT GUIDE - HOLD, NOT HEIGHT AUTHORING',font=font(22),fill='white')
    page.paste(source,(20,60));page.paste(overlay,(552,60))
    y=65
    for name,col in zip(class_names,palette):
        pd.rectangle((1080,y,1100,y+20),fill=col);pd.text((1110,y),name,font=font(15),fill='white');y+=35
    y=lines(pd,(1080,y+15),'Magenta is unresolved, not a dark pigment. A=1 there is only an identity sentinel. Validity mask MUST prohibit use.',width=29,size=17)
    y=lines(pd,(1080,y+20),'Exact soft paint edges are NOT solved. Manual geometric stroke hypotheses have a 3px uncertainty guard.',width=29,size=17)
    y=lines(pd,(1080,y+20),'Lower dark islands: paint loss, exposed material and microshadow cannot be faithfully separated here. No automatic fit.',width=29,size=17)
    lines(pd,(20,1100),'Left: unchanged registered RGB. Right: diagnostic class overlay and calibration boxes. No corrected height or tier exists from this proposal.',width=130,size=17)
    page.save(OUT/'source-classification-review.png')

    # Actual pixel crops with no smoothing/sharpening; labelled nearest zoom.
    cols=4; cellw=320;cellh=210
    contact=Image.new('RGB',(cols*cellw,60+((len(patches)+cols-1)//cols)*cellh),'#191919')
    cd=ImageDraw.Draw(contact);cd.text((15,10),'ACTUAL RGB CALIBRATION PATCHES - proposed, not accepted; nearest pixel zoom',font=font(20),fill='white')
    for i,p in enumerate(patches):
        x=(i%cols)*cellw+12;y=60+(i//cols)*cellh
        crop=source.crop(tuple(p['masterPixelEdgeBox']))
        scale=min(280/crop.width,110/crop.height)
        crop=crop.resize((int(crop.width*scale),int(crop.height*scale)),Image.Resampling.NEAREST)
        contact.paste(crop,(x,y))
        cd.text((x,y+116),p['label']+' '+p['class'],font=font(16),fill='white')
        cd.text((x,y+138),str(p['masterPixelEdgeBox']),font=font(14),fill='white')
        cd.text((x,y+158),'median L %.5f'%p['medianLuminance'],font=font(14),fill='white')
        cd.text((x,y+178),'P10/P90 %.4f / %.4f'%tuple(p['p10p90Luminance']),font=font(14),fill='white')
    contact.save(OUT/'calibration-patch-contact.png')
    wc=Image.new('RGB',(1280,60+((len(witnesses)+3)//4)*300),'#191919');wd=ImageDraw.Draw(wc)
    wd.text((15,10),'ACTUAL RGB PHYSICAL / AMBIGUITY WITNESSES - no inferred height',font=font(20),fill='white')
    for i,w in enumerate(witnesses):
        x=i%4*320+12;y=60+i//4*300
        crop=source.crop(tuple(w['masterPixelEdgeBox']))
        factor=min(290/crop.width,200/crop.height)
        crop=crop.resize((int(crop.width*factor),int(crop.height*factor)),Image.Resampling.NEAREST)
        wc.paste(crop,(x,y))
        lines(wd,(x,y+208),w['label']+' '+w['description'],width=33,size=15)
        wd.text((x,y+262),str(w['masterPixelEdgeBox']),font=font(13),fill='white')
    wc.save(OUT/'physical-and-ambiguity-witnesses.png')

    recipe={'schemaVersion':1,'status':'HOLD - incomplete classification; do not normalize height',
            'source':before[0],'coordinateConvention':'registered master pixel-edge coordinates, [x0,y0,x1,y1) boxes; native=master/8',
            'classOrder':class_names,'calibrations':calibrations,'calibrationPatches':patches,
            'conservativeSupports':[{'class':a,'masterPixelEdgeBox':b} for a,b in supports],
            'manualOchreStrokeHypothesis':{'paths':motif_lines,'widthMasterPixels':10,'supersampleFactor':4,
                                          'warning':'Approximate centreline hypothesis, NOT accepted actual paint-edge trace'},
            'boundaryPolicy':'Any class transition enlarged by square radius3 is UNRESOLVED; all lower field unresolved. No fitting to source microdetail.',
            'witnesses':witnesses,'normalizationAllowed':False,
            'guideMeaning':'A=sum(Wc*medianPatchLuminance_c); UNRESOLVED A=1 identity sentinel is NOT an albedo estimate',
            'requiredValidityPolicy':'Reject this entire proposal for authoring while any source support is unresolved; no silently ignoring/normalizing unknown pixels'}
    write_json(OUT/'classification-and-calibration.json',recipe)
    outputs=[bound(p) for p in sorted(OUT.iterdir()) if p.is_file()]
    after=[bound(p) for p in protected_inputs]
    assert before==after
    guide_reload=np.load(OUT/'albedo-guide.npy',allow_pickle=False)
    weights_reload=np.load(OUT/'class-weights.npz',allow_pickle=False)['weights']
    assert np.array_equal(guide_reload,guide) and np.array_equal(weights_reload,weights)
    report={'schemaVersion':1,'recordedAt':datetime.now(timezone.utc).isoformat(),
            'scope':'Supervised ttex054 source classification/calibration proposal only',
            'verdict':'HOLD - a faithful full albedo guide has NOT been established',
            'eligibleForHeightAuthoring':False,'sourceIdentity':'cddf441f348f0a3182edadeeeb9028ece70c2eadbef541955e7197f8213c9752',
            'sourceInputs':before,'dimensions':[512,1024],
            'guideChecks':{'shape':list(guide.shape),'dtype':str(guide.dtype),'finite':bool(np.isfinite(guide).all()),
                           'strictlyPositive':bool((guide>0).all()),'minMax':[float(guide.min()),float(guide.max())],
                           'weightShape':list(weights.shape),'weightMinMax':[float(weights.min()),float(weights.max())],
                           'maxAbsWeightSumError':float(np.max(np.abs(weights.sum(axis=0)-1))),
                           'unresolvedPixels':int((~valid).sum()),'unresolvedFraction':float((~valid).mean()),
                           'candidateValidPixels':int(valid.sum()),'validMeans':'Conservative class interiors, not independent acceptance',
                           'reloadExact':True,'allProtectedSourceHashesStable':True},
            'calibrations':calibrations,'lowerRedCalibrationOnly':{
                'patches':[p for p in patches if p['class']=='lower-red-unresolved'],
                'reasonNotExtrapolated':'Dark islands are spatially interleaved with red on pore/flake scale. Hue/brightness segmentation would risk fitting real physical wear; no faithful guide claimed.'},
            'protectedPhysicalWitnesses':witnesses,
            'findings':[
                'Broad green, upper red and middle red interiors are visually distinct; upper/middle red have separate measured proxies, not one global red baseline.',
                'Ochre rules/strokes and dark ornament ground have separate measured proxies; this does not prove historic paint chemistry or recover illumination-free albedo.',
                'Manual broad stroke layout is an auditable hypothesis only. Exact antialiased paint boundaries remain unresolved, guarded by 3 master pixels.',
                'Lower red/dark green field remains entirely unresolved; no per-native-cell, luminance-bin or fine hue mask classifies its small islands.',
                'Dark band rims may contain actual cracks/shadows as well as pigment. They remain unresolved, not flattened into albedo.',
                'Within protected green/upper-red material witnesses A is constant. The guide therefore does not track those observed pores/flakes; no resulting physical relief has been generated or accepted.',
                'Calibration patch scatter is visible and retained. Low whole-image error or a small later relief amplitude cannot qualify incorrect paint removal.'
            ],
            'requiredNextAction':{'owner':'Live root coordinator and independent material reviewer',
                'action':'Inspect source overlay/crops. Resolve pigment-versus-physical lower-field islands and dark band rims, plus actual soft-edge locations, before a complete guide or height wrapper. If unresolved retain texture HOLD; do not promote this partial guide.'},
            'laterGatesStillRequired':['Reviewed complete source albedo guide, not just finite values/weights sum',
                'Flat multi-paint fixture gives constant height; nonconstant microfield invariant under recolouring with correct guide',
                'Source-specific paint-edge and pore/flake witnesses before tier encoding; decoded Q92 height/normal/UV-light detail retention after qualification',
                'No amplitude reduction or brightness-only proxy as semantic acceptance'],
            'effects':'Only proposal guide/weights/masks/diagnostics/recipe/report written. No RGB/raw/prompt/height/master/tier/producer/Git edits, new generation or corrected-height computation.',
            'builder':bound(Path(__file__).resolve()),'outputs':outputs}
    write_json(REPORT,report)
    print(json.dumps({'verdict':report['verdict'],'report':bound(REPORT),'guideChecks':report['guideChecks']},indent=2))

if __name__=='__main__':
    main()
