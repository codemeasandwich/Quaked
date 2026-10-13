"""Independent wall offset-repair and metal tonal-correction CLI replay."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/texture_sheets/sources/official-world-2026-10-12'
CANDIDATES=ROOT/'newer/textures/candidates-2026-10-12'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rgb(p):return np.asarray(Image.open(p).convert('RGB'))
def smooth_spatial(line,sigma):
    offsets=np.arange(-int(np.ceil(6*sigma)),int(np.ceil(6*sigma))+1);weights=np.exp(-offsets**2/(2*sigma*sigma));weights/=weights.sum()
    return sum(weight*np.roll(line,int(offset),axis=0) for offset,weight in zip(offsets,weights))
rows=[]
with tempfile.TemporaryDirectory(prefix='quaked-aged-authoring-') as temp:
    for name in ['wall14_5','metal7_1']:
        actual=CANDIDATES/f'{name}-photographic-seam-v2-4x.png';record=json.loads(actual.with_suffix('.json').read_text());master=ROOT/record['source'];output=Path(temp)/actual.name
        assert sha(master)==record['sourceSha256'] and sha(SOURCE/'finish_character_stone.py')==record['toolSha256']
        assert sha(record['implementation'])==record['implementationSha256']
        command=['/usr/bin/python3',str(SOURCE/'finish_character_stone.py'),'--input',str(master),'--output',str(output)]
        if 'generatedRepair' in record:
            repair=ROOT/record['generatedRepair'];assert sha(repair)==record['generatedRepairSha256'];command+=['--offset-repair',str(repair)]
        subprocess.run(command,check=True,capture_output=True)
        assert sha(output)==sha(actual)==record['outputSha256'],'CLI output changed'
        before,after=rgb(master),rgb(actual);assert before.shape==after.shape==(256,256,3)
        h,w=before.shape[:2];y,x=np.mgrid[:h,:w];dx=np.minimum(x+.5,w-x-.5);dy=np.minimum(y+.5,h-y-.5);allowed=(dx<w/8)|(dy<h/8)
        assert record['axes']=='xy' and record['bandFraction']==1/8 and record['spatialResampling'] is False
        assert np.array_equal(before[~allowed],after[~allowed]),name+' protected interior changed'
        changed=np.any(after!=before,axis=2);assert changed.any() and not np.any(changed&~allowed)
        if name=='wall14_5':
            donor=np.asarray(Image.open(repair).convert('RGB').resize((w,h),Image.Resampling.LANCZOS));unshifted=np.roll(donor,(-h//2,-w//2),axis=(0,1));core=(dx<=w*12/512)|(dy<=h*12/512)
            assert np.array_equal(after[core],unshifted[core]),'wall photographic boundary core phase changed'
            operation='Recorded photographic repair confined to XY boundary bands'
        else:
            assert 'generatedRepair' not in record,'metal should use colour-only correction'
            expected=before.astype(float)
            for axis in ['x','y']:
                plane=expected if axis=='x' else expected.transpose(1,0,2);along,across=plane.shape[:2];delta=smooth_spatial(plane[:,0]-plane[:,-1],max(1,along/128));t=np.minimum(np.arange(across)/(across//8),1);fade=1-3*t*t+2*t*t*t
                plane[:]+=.5*delta[:,None,:]*(fade[::-1]-fade)[None,:,None]
            error=np.abs(np.rint(np.clip(expected,0,255)).astype(int)-after.astype(int));assert error.max()<=1,'metal differs from same-coordinate paired tonal correction'
            operation='Independent spatial Gaussian validates paired colour correction without resampling'
        rows.append(dict(name=name,outputSha256=sha(actual),sourceSha256=sha(master),toolSha256=sha(SOURCE/'finish_character_stone.py'),implementationSha256=sha(record['implementation']),protectedPixels=int((~allowed).sum()),changedPixels=int(changed.sum()),outsideBandUnchanged=True,operation=operation))
print(json.dumps(dict(qualification='Independent candidate authoring replay; visual and installed acceptance separate',testSha256=sha(__file__),rows=rows),indent=2))
