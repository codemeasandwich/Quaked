"""Read-only source joint measurements and exact existing-operator plan review.

Outputs diagnostic coordinates/plots only; no finisher/warp/authoring call.
"""
import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[6];D=Path(__file__).resolve().parent;S=D.parent
B=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-16-rtex020'
sha=lambda data:hashlib.sha256(data).hexdigest();watched={}

def read(p):
    p=Path(p);p=p if p.is_absolute() else ROOT/p;data=p.read_bytes()
    assert p not in watched or watched[p]==sha(data),'Changed input witness'
    watched[p]=sha(data);return data

def witness(p):
    p=Path(p);p=p if p.is_absolute() else ROOT/p
    return {'file':str(p.relative_to(ROOT)),'sha256':sha(read(p))}


def measure(rgb,xrange,yrange):
    h,w=rgb.shape[:2];xs=(np.arange(w)+.5)*64/w;ys=(np.arange(h)+.5)*128/h
    columns=(xs>=xrange[0])&(xs<xrange[1]);lum=(rgb.astype(float)@np.array([.2126,.7152,.0722]))[:,columns].mean(1)
    sigma=.25*h/128;r=max(1,math.ceil(4*sigma));k=np.arange(-r,r+1);kernel=np.exp(-.5*(k/sigma)**2);kernel/=kernel.sum()
    smooth=np.convolve(np.pad(lum,r,mode='reflect'),kernel,mode='valid')
    ids=np.flatnonzero((ys>=yrange[0])&(ys<yrange[1]));at=int(ids[np.argmin(smooth[ids])])
    threshold=float(smooth[at]+.25*(np.percentile(smooth[ids],90)-smooth[at]))
    lo,hi=at,at
    while lo>ids[0] and smooth[lo-1]<=threshold:lo-=1
    while hi<ids[-1] and smooth[hi+1]<=threshold:hi+=1
    return {'xSpanNative':list(xrange),'searchedYSpanNative':list(yrange),'darkJointCentreNativeEquivalent':float(ys[at]),
      'contiguousQuarterContrastBandNativeEquivalent':[lo*128/h,(hi+1)*128/h],'sourcePixelRow':at,
      'metric':'Rec709 RGB-weighted luminance mean over independent inner joint span, Gaussian sigma.25native pixels; near-minimum contiguous25percent contrast band. Visual mortar interpretation still required.'}


def main():
    files={'native':B/'originals/01-rtex020-e000f2f3924b.png','raw':B/'generated/rtex020.png','master':B/'masters/rtex020-v1/color.png'}
    images={k:np.asarray(Image.open(io.BytesIO(read(p))).convert('RGB')) for k,p in files.items()}
    # Inner spans exclude left crop and the central vertical interface. These
    # are independently selected from actual visible black joint runs.
    specs=[('leftTop',(4,30),{'native':(20,27),'raw':(28,35),'master':(28,35)}),
      ('rightTop',(40,61),{'native':(42,49),'raw':(42,49),'master':(42,49)}),
      ('leftBottom',(4,30),{'native':(70,79),'raw':(70,79),'master':(70,79)}),
      ('rightBottom',(40,61),{'native':(78,86),'raw':(78,86),'master':(78,86)})]
    measured=[]
    for label,xspan,ranges in specs:
        rows={name:measure(image,xspan,ranges[name]) for name,image in images.items()}
        measured.append({'landmark':label,'measurements':rows,'rawMinusNative':rows['raw']['darkJointCentreNativeEquivalent']-rows['native']['darkJointCentreNativeEquivalent']})
    anchors_file=B/'registration/measured-y-landmarks-proposal-v1.json';landmarks=json.loads(read(anchors_file))
    assert landmarks['axis']=='y';pairs=np.asarray(landmarks['points']);assert np.array_equal(pairs[[0,-1]],[[0,0],[128,128]]) and np.all(np.diff(pairs,axis=0)>0)
    intervals=[]
    raw_height=images['raw'].shape[0]
    for a,b in zip(pairs,pairs[1:]):
        target,source=b-a;slope=source/target
        intervals.append({'targetNativeSpan':[float(a[0]),float(b[0])],'sourceNativeEquivalentSpan':[float(a[1]),float(b[1])],
          'canonicalDonorRowsPerOutputRow':float(slope),'outputRowsPerCanonicalDonorRow':float(1/slope),
          'canonicalDonorDetailSamplesPerNativeY':float(8*slope),
          'hypotheticalRawSamplesPerOutputRowBeforePrematureResize':float(raw_height/128*slope/8),
          'caveat':'Existing finisher resizes raw to512x1024 FIRST, then linearly interpolates canonical donor. Raw density is not retained through the operator and does not prove final sharpness.'})
    for path in (ROOT/'tools/texture_sheets/prepare_texture_master.py',ROOT/'tools/texture_sheets/finish_official_texture.py',S/'pre-tier-review/layout-registration-proposal-v1.json',B/'masters/rtex020-v1/master.json'):read(path)
    # Independently make exact BOX comparison evidence from the actual unwarped inputs.
    for divisor in (2,4):
        dims=(64//divisor,128//divisor);panel=Image.new('RGB',(3*dims[0],dims[1]));refs=[]
        for i,(name,a) in enumerate(images.items()):panel.paste(Image.fromarray(a).resize(dims,Image.Resampling.BOX),(i*dims[0],0));refs.append(name)
        path=D/('unwarped-native-raw-master-BOX'+str(dims[0])+'.png');assert not path.exists();panel.save(path)
    assert all(sha(Path(path).read_bytes())==value for path,value in watched.items())
    report={'schemaVersion':1,'state':'READ_ONLY_LAYOUT_MEASUREMENT_NO_WARP','checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputs':[witness(p) for p in files.values()],
      'measurements':measured,'proposedExistingLandmarks':witness(anchors_file),'anchors':landmarks,'existingOperatorOrder':['raw LANCZOS resize to512x1024','piecewise monotoneY coordinates using native target->source pairs','linear interpolation of resized donor with periodic row indexing','existing photographic coarse colour field, then scalar preparation'],
      'intervals':intervals,'rawDimensions':[images['raw'].shape[1],raw_height],'sourceAdequacyDoesNotProvePostWarpSharpness':True,'warpExecuted':False,'newSourceOrProducerChanges':0,'witnesses':{str(p.relative_to(ROOT)):h for p,h in watched.items()},'verifier':witness(Path(__file__))}
    out=D/'measurement-v1.json'
    with out.open('x') as file:json.dump(report,file,indent=2);file.write('\n')
    print(json.dumps({'file':str(out.relative_to(ROOT)),'sha256':sha(out.read_bytes()),'jointDeltas':[(r['landmark'],r['rawMinusNative']) for r in measured],'minimumCanonicalDonorSlope':min(i['canonicalDonorRowsPerOutputRow'] for i in intervals)}))

if __name__=='__main__':main()
