#!/usr/bin/env python3
"""Reproducible read-only master probes; writes diagnostics, never tier maps."""
import hashlib
import io
import json
import math
from pathlib import Path
import shutil
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[3]
BATCH=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
OUT=ROOT/'docs/hexen2/textures/batch-008-pre-tier-semantic-diagnostics'
OUT.mkdir(exist_ok=True)
watched={}

def read(path):
    path=Path(path).resolve(); data=path.read_bytes(); watched[path]=data; return data

def witness(path):
    path=Path(path).resolve(); data=read(path)
    return dict(file=str(path.relative_to(ROOT)) if ROOT in path.parents else str(path),sha256=hashlib.sha256(data).hexdigest(),bytes=len(data))

def blur(a,sigma):
    h,w=a.shape
    f=np.fft.rfftfreq(w)[None,:]**2+np.fft.fftfreq(h)[:,None]**2
    return np.fft.irfft2(np.fft.rfft2(a)*np.exp(-2*np.pi**2*sigma**2*f),s=a.shape)

def norm(a):
    s=np.std(a);return a/s if s>1e-6 else a*0

def extreme(a,r,fn):
    v=a.copy()
    for k in range(1,r+1):
        for axis in (0,1):v=fn(v,fn(np.roll(a,k,axis),np.roll(a,-k,axis)))
    return v

def detail64(rgb,profile):
    L=rgb.astype(float)/255 @ np.array([.299,.587,.114]);k=math.sqrt(L.size)/256
    L=L-blur(L,40*k)*.85
    g=[blur(L,s*k) for s in (1.2,3.5,9,22,60)]
    b=[L-g[0],g[0]-g[1],g[1]-g[2],g[2]-g[3]]
    H=sum(w*norm(a) for w,a in zip(profile['bands'],b))+.25*norm(g[3]-g[4])*profile['bands'][3]
    r=max(1,int(round(3*k)));groove=extreme(g[0],r,np.maximum)-g[0];top=g[0]-extreme(g[0],r,np.minimum)
    H=H-profile['groove']*1.5*norm(groove)+profile['bump']*norm(top)
    H=np.tanh(norm(H)*.9);assert profile['glow']==0
    return (H-H.min())/(H.max()-H.min()+1e-6)

def normals(height,strength=.3,cap=.5):
    def derivative(axis):
        pos=np.roll(height,-1,axis);neg=np.roll(height,1,axis)
        return (3*(pos-neg)+np.roll(pos,1,1-axis)+np.roll(pos,-1,1-axis)-np.roll(neg,1,1-axis)-np.roll(neg,-1,1-axis))/10
    scale=strength*math.sqrt(height.size)/8
    sx=-derivative(1)*.5*scale;sy=-derivative(0)*.5*scale
    limiting=1/np.sqrt(1+(np.sqrt(sx*sx+sy*sy)/cap)**2)
    sx*=limiting;sy*=limiting
    length=np.sqrt(sx*sx+sy*sy+1)
    return np.stack([sx/length,sy/length,1/length],axis=2)

def preview(name,rgb,height,samples,mask=None):
    n=normals(height)
    panels=[]
    annotated=Image.fromarray(rgb);draw=ImageDraw.Draw(annotated)
    for label,xy in samples.items():
        x,y=[v*8 for v in xy]
        draw.ellipse([x-3,y-3,x+3,y+3],outline='yellow',width=1)
        draw.text((x+4,y-10),label,fill='yellow',stroke_width=1,stroke_fill='black')
    if mask is not None:
        # Boundary only, preserving visible RGB underneath for alignment review.
        border=(mask!=np.roll(mask,1,0))|(mask!=np.roll(mask,1,1))
        a=np.array(annotated);a[border]=[255,0,255];annotated=Image.fromarray(a)
    panels.append(annotated)
    panels.append(Image.fromarray(np.rint(height*255).astype('uint8')).convert('RGB'))
    for light in ([-.55,-.55,.63],[.55,.55,.63]):
        v=np.array(light);v/=np.linalg.norm(v)
        lam=np.clip(n@v,0,1)
        # Neutral albedo avoids baked-color confusion; unsaturated exposure.
        panels.append(Image.fromarray(np.rint((.15+.75*lam)*255).astype('uint8')).convert('RGB'))
    sheet=Image.new('RGB',(1024,1064))
    dr=ImageDraw.Draw(sheet)
    for i,(panel,label) in enumerate(zip(panels,['RGB with classified probes / mask boundary','Uncompressed scalar height','Neutral opposed light NW','Neutral opposed light SE'])):
        x=(i%2)*512;y=(i//2)*532;sheet.paste(panel,(x,y+20));dr.text((x+4,y+4),label,fill='white')
    path=OUT/(name+'-master-semantic.png');sheet.save(path)
    measurements={}
    for label,(x,y) in samples.items():
        px,py=round(x*8),round(y*8);a=height[py-2:py+3,px-2:px+3]
        measurements[label]=dict(nativeEdgeCoordinates=[x,y],masterPixel=[px,py],radiusMasterPixels=2,mean=float(a.mean()),median=float(np.median(a)),minimum=float(a.min()),maximum=float(a.max()))
    return dict(preview=witness(path),samples=measurements)

def main():
    materials={}
    samples306=dict(CNW=[22,22],CNE=[42,22],CSW=[22,42],CSE=[42,42],FN=[32,13],FE=[51,32],FS=[32,51],FW=[13,32])
    samples006=dict(VJ=[30,15],VFL=[27,15],VFR=[33,15],HJW=[15,32.5],HFWU=[15,29],HFWL=[15,36],HJE=[46,32.5],HFEU=[46,29],HFEL=[46,36])
    for name,folder,samples in [('rtex306','masters-layered',samples306),('rtex006','masters',samples006)]:
        package=BATCH/folder/name/'master.json';meta=json.loads(read(package));rgbpath=package.parent/meta['color']['file'];hp=package.parent/meta['height']['file']
        rgb=np.array(Image.open(io.BytesIO(read(rgbpath))));height=np.load(io.BytesIO(read(hp)),allow_pickle=False)
        assert hashlib.sha256(read(rgbpath)).hexdigest()==meta['color']['sha256']
        assert hashlib.sha256(read(hp)).hexdigest()==meta['height']['sha256']
        for role,row in meta['inputs'].items():assert hashlib.sha256(read(row['file'])).hexdigest()==row['sha256']
        for role,row in meta['tools'].items():assert hashlib.sha256(read(row['file'])).hexdigest()==row['sha256']
        mask=None;checks={}
        detail=detail64(rgb,meta['height']['profile'])
        if name=='rtex306':
            recipe=json.loads(read(meta['inputs']['heightLayering']['file']));l=recipe['layering']
            assert recipe==meta['layeredRelief']['recipe']
            assert l['brickRegions']==[{'polygon':[[18,18],[46.5,18],[46.5,47],[18,47]]}]
            # Independent rectangle oracle for Pillow's inclusive polygon raster.
            yy,xx=np.indices(height.shape);mask=(xx>=144)&(xx<=372)&(yy>=144)&(yy<=376)
            sigma=l['bevelPixels']*math.sqrt(height.size)/256
            smooth=blur(mask.astype(float),sigma)
            facing=l['facingHeight']-(l['facingHeight']-l['chipFloor'])*np.minimum(smooth*2,1)
            reconstructed=np.where(mask,l['brickHeight'],facing)+(detail-.5)*(2*l['microAmplitude'])
            reconstructed=reconstructed.astype('float32')
            assert np.array_equal(reconstructed,height),'Independent plane/detail reconstruction mismatch'
            baseline=BATCH/'masters/rtex306'
            assert read(rgbpath)==read(baseline/'color.png'),'RGB changed'
            baseline_meta=json.loads(read(baseline/'master.json'))
            assert hashlib.sha256(read(baseline/'master.json')).hexdigest()==recipe['sourceMasterPackageSha256']
            assert hashlib.sha256(read(ROOT/recipe['sourceVerification']['file'])).hexdigest()==recipe['sourceVerification']['sha256']
            assert np.array_equal(detail.astype('float32'),np.load(io.BytesIO(read(baseline/'height.npy')),allow_pickle=False))
            checks=dict(independentLayerCompositionFloat32Exact=True,RGBBytesUnchanged=True,maskInclusiveMasterBounds=[144,144,372,376],bevelSigmaMasterPixels=sigma,substrateRange=[float(height[mask].min()),float(height[mask].max())],facingRange=[float(height[~mask].min()),float(height[~mask].max())])
        else:
            assert np.array_equal(detail.astype('float32'),height),'Independent ordinary height mismatch'
            checks=dict(independentOrdinaryCraftFloat32Exact=True)
        materials[name]=dict(masterPackage=witness(package),checks=checks,**preview(name,rgb,height,samples,mask))
    failures=[]
    failure_dest=ROOT/'docs/hexen2/textures/batch-008-source-master-diagnostics'
    failure_dest.mkdir(exist_ok=True)
    for name in ['quaked-rtex306-source-master-verifier-failed-attempt1.py','quaked-rtex306-source-master-verification-attempt1.json','quaked-rtex306-source-master-verification-attempt2.json']:
        source=Path('/private/tmp')/name;destination=failure_dest/name
        if not destination.exists():shutil.copyfile(source,destination)
        assert read(source)==read(destination)
        failures.append(dict(original=witness(source),retained=witness(destination),byteIdentical=True))
    report=dict(scope='Pre-tier master diagnostics only; visual decision is in separate semantic review JSON.',materials=materials,earlierVerifierFailureCustody=failures,probe=witness(Path(__file__)),inputsStable=True)
    report['inputs']=[witness(p) for p in list(watched)]
    assert all(p.read_bytes()==b for p,b in watched.items())
    target=OUT/'probe.json';target.write_text(json.dumps(report,indent=2)+'\n');print(target)
    for name,m in materials.items():print(name,json.dumps(m['samples']))

if __name__=='__main__':main()
