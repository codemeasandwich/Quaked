#!/usr/bin/env python3
"""Same-master fine scalar-detail PLAN trial; no RGB or asset package edits.

Only photographic band-limited residuals are transported. Coordinate rules and
overlap windows choose/mix retained samples; they do not synthesize noise values.
Outputs are a tiny actual region and analytical/photographic fixtures for root
review before any production producer or whole-material qualification.
"""
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
spec=importlib.util.spec_from_file_location('boundary_helpers',HERE/'boundary_interpolation_diagnostic.py')
helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
SOURCE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008/masters/ttex054/color.png'
TRIAL=HERE/'actual-boundary-trial-v2'
OUT=HERE/'donor-microdetail-plan-v1'
DONORS=[[144,272,192,320],[416,280,464,328],[80,112,128,160],[352,240,400,288]]
PROTECTED=[[47,376,86,416],[92,224,145,270],[307,135,353,177],[175,32,212,59]]
ACTUAL_BOX=[32,560,160,688]


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def photographic_band(signal):
    return craft.gblur(signal,.5)-craft.gblur(signal,2.)


def robust_sigma(values):
    return float(1.4826*np.median(np.abs(values-np.median(values))))


def blend_donors(patches,shape):
    h,w=shape
    accumulated=np.zeros(shape);weights=np.zeros(shape)
    #48px patches overlap16px at32px stride. C1 cos ramps preserve scale1:1.
    t=np.arange(48,dtype=float)
    window=np.ones(48)
    window[:8]=.5-.5*np.cos(np.pi*(t[:8]+.5)/8)
    window[-8:]=window[:8][::-1]
    window2=window[:,None]*window[None,:]
    for cy in range(-1,(h+31)//32+1):
        for cx in range(-1,(w+31)//32+1):
            donor=(17*cx+29*cy+(cx*cy)%7)%len(patches)
            x0=cx*32-8;y0=cy*32-8
            x1=max(0,x0);y1=max(0,y0);x2=min(w,x0+48);y2=min(h,y0+48)
            if x2<=x1 or y2<=y1:continue
            sx=x1-x0;sy=y1-y0
            v=patches[donor][sy:sy+y2-y1,sx:sx+x2-x1]
            weight=window2[sy:sy+y2-y1,sx:sx+x2-x1]
            accumulated[y1:y2,x1:x2]+=v*weight;weights[y1:y2,x1:x2]+=weight
    if (weights<=0).any():raise ValueError('Uncovered donor field')
    result=accumulated/weights
    # Crop/window mixture can leave a slow mean; remove it rather than copying
    # a broad photographic shape. This is a scalar fine filter, not new detail.
    result-=craft.gblur(result,8.)
    result-=result.mean()
    return result


def psd(array):
    power=np.abs(np.fft.rfft2(array-array.mean()))**2
    fy=np.fft.fftfreq(array.shape[0])[:,None];fx=np.fft.rfftfreq(array.shape[1])[None,:]
    f=np.sqrt(fx*fx+fy*fy);total=float(power.sum())
    return dict(totalPower=total,belowOnePer16Fraction=float(power[(f>0)&(f<1/16)].sum()/total) if total else 0.,
        onePer16ToOnePer4Fraction=float(power[(f>=1/16)&(f<1/4)].sum()/total) if total else 0.,
        aboveOnePer4Fraction=float(power[f>=1/4].sum()/total) if total else 0.)


def augment(normalized_before,normalized_interpolated,weight,donor_field):
    #Exclude filtered paint tails from the clean variance estimate. A flat
    #fixture therefore has exactly zero material variance and gets no donor.
    known=~helpers.dilate(weight>0,8)
    residual=photographic_band(normalized_before)
    target=robust_sigma(residual[known])
    core=weight==1
    present=robust_sigma(photographic_band(normalized_interpolated)[core])
    donor_sigma=robust_sigma(donor_field[core])
    gain=np.sqrt(max(target*target-present*present,0.))/donor_sigma if donor_sigma>1e-12 else 0.
    if target<1e-12:gain=0.
    result=normalized_interpolated.copy()
    support=weight>0
    addition=weight*gain*donor_field
    # Preserve mean over the authored support; no broad positive/negative plane.
    addition[support]-=weight[support]*addition[support].sum()/weight[support].sum()
    result[support]+=addition[support]
    if result.min()<0 or result.max()>1:raise ValueError('Would require clipping normalized signal')
    if not np.array_equal(result[~support],normalized_before[~support]):raise ValueError('Outside normalized signal changed')
    return result,dict(targetRobustFineSigma=target,presentCoreRobustFineSigma=present,
        donorCoreRobustFineSigma=donor_sigma,gain=float(gain),additionMeanOnSupport=float(addition[support].mean()),
        resultingCoreRobustFineSigma=robust_sigma(photographic_band(result)[core]),
        outsideNormalizedSignalBitExact=True,addedMaximumAbsolute=float(np.abs(addition).max()))


def image(array,scale=4):
    return Image.fromarray(np.rint(np.clip(.5+scale*array,0,1)*255).astype('uint8')).convert('RGB')


def write_case(prefix,before,interpolated,augmented,box=None):
    fields=[photographic_band(v) for v in [before,interpolated,augmented]]
    names=['before','interpolated','same-master fine restored']
    if box:
        x0,y0,x1,y1=box;fields=[f[y0:y1,x0:x1] for f in fields]
    h,w=fields[0].shape
    scalar=Image.new('RGB',(3*w,h+24),'#202020');draw=ImageDraw.Draw(scalar)
    lights=Image.new('RGB',(6*w,h+24),'#202020');ld=ImageDraw.Draw(lights)
    for i,(name,field) in enumerate(zip(names,fields)):
        draw.text((i*w+3,5),name,fill='white');scalar.paste(image(field),(i*w,24))
        # Fixed physical scalar/lighting scale for all candidates; no per-panel
        # contrast normalization or amplitude reduction.
        _,normal=craft.normals_from_height(.5+field,.6,.5)
        for j,light in enumerate([np.array([.65,-.4,.6]),np.array([-.65,.4,.6])]):
            light/=np.linalg.norm(light);value=np.clip(normal@light,0,1)
            x=(i*2+j)*w;ld.text((x+3,5),name+f' L{j+1}',fill='white');lights.paste(Image.fromarray(np.rint(value*255).astype('uint8')).convert('RGB'),(x,24))
    scalar.save(OUT/(prefix+'-fine-contact.png'));lights.save(OUT/(prefix+'-opposed-lights.png'))
    for i,(name,field) in enumerate(zip(['before','interpolated','augmented'],fields)):
        np.save(OUT/(prefix+'-'+name+'-fine.npy'),field,allow_pickle=False)


def main():
    rgb=Image.open(SOURCE).convert('RGB')
    N0=np.load(TRIAL/'J-before.npy');N0=N0/(1+N0)
    Ni=np.load(TRIAL/'J-after.npy');Ni=Ni/(1+Ni)
    weight=np.load(TRIAL/'interpolation-weight.npy')
    residual=photographic_band(N0)
    patches=[];donor_rows=[]
    contact=Image.new('RGB',(4*240,504),'#202020');draw=ImageDraw.Draw(contact)
    protected=helpers.box_mask(N0.shape,PROTECTED)
    for i,box in enumerate(DONORS):
        x0,y0,x1,y1=box
        if protected[y0:y1,x0:x1].any() or (weight[y0:y1,x0:x1]>0).any():raise ValueError('Donor intersects protected feature or unknown paint boundary')
        p=residual[y0:y1,x0:x1].copy();p-=p.mean();patches.append(p)
        donor_rows.append(dict(label=f'D{i+1}',sourceBoxMasterPixels=box,sourceScale=1.,
            originalFineMeanRemoved=float(residual[y0:y1,x0:x1].mean()),zeroMeanResidualSha256=hashlib.sha256(p.tobytes()).hexdigest(),
            protectedAndBoundaryOverlapPixels=0,robustSigma=robust_sigma(p),psd=psd(p)))
        draw.text((i*240+3,5),f'D{i+1} {box}',fill='white')
        contact.paste(rgb.crop(box).resize((240,240),Image.Resampling.NEAREST),(i*240,24))
        contact.paste(image(p).resize((240,240),Image.Resampling.NEAREST),(i*240,264))
    contact.save(OUT/'qualified-patch-proposal-contact.png')
    field=blend_donors(patches,N0.shape)
    restored,actual_stats=augment(N0,Ni,weight,field)
    write_case('actual-tiny-crop',N0,Ni,restored,ACTUAL_BOX)
    x0,y0,x1,y1=ACTUAL_BOX
    rgb.crop(ACTUAL_BOX).save(OUT/'actual-tiny-crop-unchanged-RGB.png')
    # Small flat-paint and source-photographic nonconstant field fixtures.
    yy,xx=np.mgrid[:256,:256];paint=(xx>=80)&(xx<176)&(yy>=48)&(yy<208)
    albedo=.2+.35*craft.gblur(paint.astype(float),.55)
    edge=helpers.edge_of(paint);core=helpers.dilate(edge,2);fixture_weight=helpers.feather_core(core,2)
    false_rim=np.zeros((256,256));rim=helpers.dilate(edge,1)
    false_rim[rim]=.22*np.sin(xx[rim]*.31+yy[rim]*.27)
    fixture_donor=blend_donors(patches,(256,256))
    fixtures=[]
    for label,truthN in [('flat',np.full((256,256),.5)),('photographic',.5+fixture_donor)]:
        truthJ=truthN/(1-truthN);photographed=albedo*(truthJ+false_rim)
        beforeJ=photographed/albedo;interpolatedJ,_=helpers.reconstruct(beforeJ,fixture_weight,4.)
        beforeN=beforeJ/(1+beforeJ);interpN=interpolatedJ/(1+interpolatedJ)
        result,stats=augment(beforeN,interpN,fixture_weight,fixture_donor)
        if label=='flat':stats['flatPlaneMaximumError']=float(np.abs(result-.5).max());stats['flatPlanePass']=bool(np.abs(result-.5).max()<1e-12)
        stats['truthFineSigma']=robust_sigma(photographic_band(truthN).ravel())
        stats['outsideTruthMaximumError']=float(np.abs((result-truthN)[fixture_weight==0]).max())
        fixtures.append(dict(name=label,**stats));write_case('fixture-'+label,beforeN,interpN,result)
    # Keep this deliberately tiny diagnostic: do not save a restored whole
    #image scalar/height or a master recipe. Parent reviews the actual crop first.
    current_sha=sha(SOURCE)
    report=dict(schemaVersion=1,status='PLAN/TINY DIAGNOSTIC ONLY - source patch/material/outline review required',
        source=dict(file=str(SOURCE.relative_to(ROOT)),sha256=current_sha),
        soleAuthoringSource='Same retained ttex054 master; no new generation or unrelated texture.',
        donorPatches=donor_rows,
        math=dict(fineFilter='wrapped Gsigma0.5(N)-Gsigma2.0(N), each patch mean removed',
            sampling='48x48 master-pixel patches at scale1,32px tile stride,8px C1 cosine edge ramps; donor index=(17cx+29cy+(cx*cy)%7)%4; no rotation/warp/no random values',
            assembly='Weighted overlap normalized by weights; subtract wrapped8px slow mean then global mean. No RGB copied.',
            variance='Target robust sigma from genuine source residual outside mask expanded8px; gain=sqrt(max(target^2-presentCore^2,0))/donorSigma. Flat material variance gives gain0.',
            addition='Inside reviewed support only: weight*gain*photographic donor field, weighted zero-mean correction. Outside normalized signal exact; no clipping or per-panel amplitude change.'),
        actualTinyBoxMasterPixels=ACTUAL_BOX,actualStats=actual_stats,assembledDonorPSD=psd(field),fixtures=fixtures,
        actualCanonicalRgbUnchanged=current_sha=='75735d60f4199165c89f02f38d96a021ce471ddd4acd4ca5196a6fae6abf1eba',
        macroCloneLimit='Fine-only clean patches and low-frequency PSD constrain copied large forms; actual contact/lighting review still required. Not a numerical claim of no recognizable artefact.',
        effects='Tiny scalar diagnostics and fixtures only. No restored whole-image height, producer, master recipe/tier/catalog/Git/source change.',
        nextAction='Root independently view proposed patch source/fine contact, actual tiny fine/opposed lights and PSD/stats. Reject synthetic-grain appearance, recognizable copied feature or persistent coherent paint outline before whole-image/production implementation.')
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(actualStats=actual_stats,assembledDonorPSD=report['assembledDonorPSD'],fixtures=fixtures)))


if __name__=='__main__':main()
