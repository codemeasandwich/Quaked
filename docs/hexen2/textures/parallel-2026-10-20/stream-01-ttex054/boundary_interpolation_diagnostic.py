#!/usr/bin/env python3
"""ttex054-only mask/math experiment, NOT a master/height/tier producer.

No canonical asset is written. Diagnostic unknown-edge interpolation is
explicit artistic authoring, not a claim of recovering hidden pore geometry.
Existing wrapped Gaussian and normalized-convolution policy are reused.
"""
from pathlib import Path
import hashlib
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
sys.path.insert(0, str(ROOT/'tools'))
import craft_normals as craft

BATCH = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
SOURCE = BATCH/'masters/ttex054/color.png'
OUT = HERE/'boundary-diagnostic-v1'


def dilate(mask, radius):
    result = mask.copy()
    for dy in range(-radius,radius+1):
        for dx in range(-radius,radius+1):
            result |= np.roll(np.roll(mask,dy,0),dx,1)
    return result


def edge_of(mask):
    return (mask != np.roll(mask,1,0)) | (mask != np.roll(mask,1,1))


def feather_core(core, pixels=2):
    # Compact support ensures bit-exact preservation outside the declared mask.
    distance = np.full(core.shape, pixels+1, dtype=int)
    for radius in range(pixels,-1,-1):
        distance[dilate(core,radius)] = radius
    return np.where(distance <= pixels,
        .5+.5*np.cos(np.pi*distance/(pixels+1)),0.)


def reconstruct(signal, weight, sigma):
    support = weight > 0
    known = (~support).astype(float)
    denominator = craft.gblur(known,sigma)
    if (denominator[support] < .025).any():
        raise ValueError('Insufficient safe support for narrow interpolation')
    fill = craft.gblur(signal*known,sigma)/np.maximum(denominator,1e-12)
    result = signal.copy()
    # Explicit assignment instead of full-array arithmetic preserves exact
    # original values everywhere outside the reviewed interpolation support.
    result[support] = signal[support]*(1-weight[support])+fill[support]*weight[support]
    return result,denominator


def fine(signal, scale):
    first = craft.gblur(signal,1.2*scale)
    second = craft.gblur(signal,3.5*scale)
    return signal-first+.35*(first-second)


def box_mask(shape, boxes):
    result = np.zeros(shape,dtype=bool)
    for x0,y0,x1,y1 in boxes:
        result[y0:y1,x0:x1] = True
    return result


def overlay(rgb, weight, protected, title):
    support = weight > 0
    color = np.array(rgb,copy=True)
    tint = np.zeros_like(color)
    tint[:] = [0.,.85,1.]
    tint[weight == 1] = [1.,.1,.7]
    color[support] = .4*color[support]+.6*tint[support]
    image = Image.fromarray(np.rint(np.clip(color,0,1)*255).astype('uint8'))
    canvas = Image.new('RGB',(image.width, image.height+28),'#202020')
    canvas.paste(image,(0,28))
    draw = ImageDraw.Draw(canvas)
    draw.text((8,8),title,fill='white')
    for label,box in protected:
        x0,y0,x1,y1=box
        draw.rectangle((x0,y0+28,x1,y1+28),outline='#44ff44',width=2)
        draw.text((x0,y0+30),label,fill='#44ff44')
    return canvas


def fixture():
    shape=(256,256)
    yy,xx=np.mgrid[:256,:256]
    # Analytic fixture only. These fields are never added to the real texture.
    paint=(xx>=80)&(xx<176)&(yy>=48)&(yy<208)
    alpha=craft.gblur(paint.astype(float),.55)
    albedo=.2+.35*alpha
    edges=edge_of(paint)
    rim=dilate(edges,1)
    core=dilate(edges,2)
    weight=feather_core(core,2)
    micro=1+.025*np.sin(xx*.045)+.02*np.cos(yy*.06)
    micro-=.07*np.exp(-((xx-35)**2+(yy-130)**2)/30)
    micro-=.05*np.exp(-((xx-80)**2+(yy-113)**2)/20)
    artifact=np.zeros(shape)
    artifact[rim]=.22*np.sin(xx[rim]*.31+yy[rim]*.27)
    reports=[]
    panels=[]
    light_panels=[]
    for name,truth in [('flat',np.ones(shape)),('nonconstant',micro)]:
        photographed_luminance=albedo*truth*(1+artifact)
        normalized=photographed_luminance/albedo
        corrected,denominator=reconstruct(normalized,weight,4.)
        first=fine(normalized,1.)
        fine_first,_=reconstruct(first,weight,4.)
        corrected_fine=fine(corrected,1.)
        support=weight>0
        true_fine=fine(truth,1.)
        # The false rim is wholly inside core, so a flat field's exact oracle
        # is constant. Nonconstant inside error describes authored continuation.
        errors=corrected-truth
        outside=np.abs(errors[~support])
        report=dict(name=name,supportPixels=int(support.sum()),
            outsideNormalizedSignalBitExact=bool(np.array_equal(corrected[~support],normalized[~support])),
            outsideTruthMaximumError=float(outside.max()),
            authoredInsideRmsError=float(np.sqrt(np.mean(errors[support]**2))),
            minimumSafeDenominator=float(denominator[support].min()),
            correctedSignalRange=[float(corrected.min()),float(corrected.max())],
            truthRange=[float(truth.min()),float(truth.max())],
            preInterpolationFineMaximumError=float(np.abs(fine_first-true_fine).max()),
            interpolateBeforeFineMaximumError=float(np.abs(corrected_fine-true_fine).max()),
            firstOutsideFineTailError=float(np.abs((corrected_fine-true_fine)[~support]).max()),
            interpretation='Inside microgeometry is authored local interpolation. Fine filtering after correction changes neighboring filter responses; normalized signal alone is exact outside support.')
        if name=='flat':
            report['planeOraclePass']=bool(np.max(np.abs(corrected-1))<1e-12 and np.max(np.abs(corrected_fine))<1e-12)
        # Actual opposed-light inspection of an analytic fixture, not an asset
        # normal package. Fixed scale is shared by truth/false-rim/corrected.
        for label,field in [('truth',true_fine),('false rim',first),('corrected',corrected_fine)]:
            _,normals=craft.normals_from_height(.5+.2*field,1.,1.1)
            for light in [np.array([.65,-.4,.6]),np.array([-.65,.4,.6])]:
                light=light/np.linalg.norm(light)
                value=np.clip(normals@light,0,1)
                light_panels.append((name+' '+label,Image.fromarray(np.rint(value*255).astype('uint8')).convert('RGB')))
        edge_span=(yy>=80)&(yy<190)&(xx>=72)&(xx<88)&(np.abs(yy-113)>12)
        report['farFromPoreEdgeContinuationMaximumError']=float(np.abs(errors[edge_span]).max())
        reports.append(report)
        maps=[truth,normalized,weight,corrected,first,fine_first,corrected_fine,errors]
        for index,arr in enumerate(maps):
            if index in (4,5,6,7):v=np.clip(.5+arr*2,0,1)
            elif index==2:v=arr
            else:v=np.clip(arr*.65,0,1)
            panels.append(Image.fromarray(np.rint(v*255).astype('uint8')).convert('RGB'))
    sheet=Image.new('RGB',(4*256,2*2*280),'#202020')
    draw=ImageDraw.Draw(sheet)
    labels=['known truth','normalized with false rim','declared interpolation weight','corrected normalized signal',
            'fine before interpolation','fine-first then interpolate','interpolate-first then fine','continuation error (x2)']
    for k,panel in enumerate(panels):
        block=k//8;local=k%8;x=(local%4)*256;y=(block*2+local//4)*280
        draw.text((x+5,y+5),f'{reports[block]["name"]}: {labels[local]}',fill='white')
        sheet.paste(panel,(x,y+24))
    sheet.save(OUT/'fixture-math-review.png')
    lights=Image.new('RGB',(6*256,2*280),'#202020')
    ld=ImageDraw.Draw(lights)
    for k,(label,panel) in enumerate(light_panels):
        x=(k%6)*256;y=(k//6)*280
        ld.text((x+5,y+5),label+(' lightA' if k%2==0 else ' lightB'),fill='white')
        lights.paste(panel,(x,y+24))
    lights.save(OUT/'fixture-opposed-lights.png')
    return reports


def main():
    OUT.mkdir(exist_ok=False)
    rgb=np.asarray(Image.open(SOURCE).convert('RGB'),dtype=float)/255
    previous=json.loads((BATCH/'relief/ttex054-guide-draft/classification-and-calibration.json').read_text())
    protected=[(w['label'],w['masterPixelEdgeBox']) for w in previous['witnesses'] if w['label'] in ['P1','P2','P3','P4']]
    protected_mask=box_mask(rgb.shape[:2],[box for _,box in protected])
    chroma=(rgb[:,:,0]-rgb[:,:,2])/np.maximum(rgb.sum(2),1e-9)
    hue=chroma>.28
    hue[:575]=False;hue[651:]=False
    # This 7px median tracing is a DIAGNOSTIC approximation only: it makes
    # source contour uncertainty visible and is not a qualified alpha guide.
    paint=np.asarray(Image.fromarray(hue.astype('uint8')*255).filter(ImageFilter.MedianFilter(7)))>0
    edges=edge_of(paint)
    motif_core=dilate(edges,1)
    narrow_bands=[(18,22),(74,79),(498,503),(554,559),(567,571),(650,654),(662,667)]
    full_bands=[(14,25),(73,84),(494,506),(552,560),(567,573),(649,656),(662,672)]
    variants=[]
    for name,bands in [('narrow',narrow_bands),('observed-rim',full_bands)]:
        core=motif_core.copy()
        for lo,hi in bands:core[lo:hi]=True
        weight=feather_core(core,1)
        support=weight>0
        if (support&protected_mask).any():raise ValueError('Protected witness overlap')
        # Support fraction is a real mask measurement, not a quality gate.
        _,denominator=reconstruct(np.ones(support.shape),weight,4.)
        np.save(OUT/f'{name}-weight.npy',weight,allow_pickle=False)
        Image.fromarray(np.rint(weight*255).astype('uint8')).save(OUT/f'{name}-weight.png')
        overlay(rgb,weight,protected,f'{name}: magenta=core, cyan=transition').save(OUT/f'{name}-source-overlay.png')
        corner=overlay(rgb,weight,[],f'{name}: actual source contour').crop((0,598,512,679)).resize((1536,243),Image.Resampling.NEAREST)
        corner.save(OUT/f'{name}-corner-contact.png')
        variants.append(dict(name=name,sourceBandRowsHalfOpen=bands,supportPixels=int(support.sum()),supportFraction=float(support.mean()),
            fullReplacementPixels=int((weight==1).sum()),minimumSafeDenominator=float(denominator[support].min()),
            protectedWitnessOverlapPixels=int((support&protected_mask).sum()),
            sourceContourUncertainty='7px chromaticity median misses some actual paint/corner transitions; color overlay requires independent review. No complete alpha proof claimed.'))
    Image.fromarray(paint.astype('uint8')*255).save(OUT/'diagnostic-paint-shape.png')
    report=dict(schemaVersion=1,status='DIAGNOSTIC HOLD - source contour/support and math ordering require root review',
        source=dict(file=str(SOURCE.relative_to(ROOT)),sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest()),
        scope='Mask, normalized-convolution and analytic fixture only. No real-image corrected height, master, tier or registration.',
        interpretation='Local interpolation of unknown microsurface under narrow paint edges is artistic authoring, not measured physical recovery.',
        proposedMath=['J=L/A with fixed source class baselines; all lower red uses one constant baseline.',
            'Known=1 outside compact support, 0 inside; fill=wrapped G(J*Known)/G(Known).',
            'Inside support Jprime=(1-weight)*J+weight*fill; outside Jprime=J by exact assignment.',
            'Only then apply unchanged fine-band extraction. Fine-first correction fails the flat-plane fixture because its Gaussian tails already escaped the narrow mask.',
            'This ordering preserves normalized photographic signal exactly outside support. It does NOT preserve the already-filtered fine signal there; root must explicitly review that semantic distinction.'],
        rootTargetApproximateMaximumSupportFraction=.08,maskVariants=variants,
        protectedWitnesses=[dict(label=label,box=box) for label,box in protected],
        fixtures=fixture(),
        unresolved=['Complete actual corner/soft-edge trace is not qualified by the median hue contour.',
            'Observed source band rim support and narrow approximate 8 percent target are in tension.',
            'Actual corrected real-image material field has not been authored or art-qualified.',
            'Outside exactness applies before downstream filtering; fine-first has a demonstrated halo failure.'],
        prohibitedEffectsPreserved=['No source generation or color modification','No per-stroke nuisance profile','No production authoring wrapper','No master/height/tier output','No producer/catalog/Git/build/release changes'])
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(output=str(OUT),variants=[dict(name=v['name'],fraction=v['supportFraction']) for v in variants],fixture=report['fixtures'])))


if __name__=='__main__':main()
