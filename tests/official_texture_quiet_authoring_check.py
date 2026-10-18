"""Independent quiet-edge CLI replay and cable crest/phase audit; no registration."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(ROOT / 'tools'))
from resource_paths import resource_path

SOURCE=ROOT/'tools/texture_sheets/sources/official-world-2026-10-12'
CANDIDATES=resource_path(ROOT, 'newer/textures/candidates-2026-10-12')
CONFIG={'TF_Metal_02':'xy','metal1_2c':'x','TF_Metal4_6a':'x','cable1_1':'x'}
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def rgb(p):return np.asarray(Image.open(p).convert('RGB'))
def spatial_smooth(line,sigma):
    # Periodic Gaussian in spatial coordinates, independent of tool's FFT filter.
    radius=int(np.ceil(6*sigma)); offsets=np.arange(-radius,radius+1);weights=np.exp(-offsets**2/(2*sigma*sigma));weights/=weights.sum()
    return sum(weight*np.roll(line,int(offset),axis=0) for offset,weight in zip(offsets,weights))
rows=[]
with tempfile.TemporaryDirectory(prefix='quaked-quiet-edge-audit-') as temp:
    subprocess.run(['/usr/bin/python3',str(SOURCE/'finish_quiet_edges.py'),'--output-dir',temp],check=True,capture_output=True)
    for name,axes in CONFIG.items():
        actual=CANDIDATES/f'{name}-quiet-seam-v2-4x.png';record=json.loads(actual.with_suffix('.json').read_text());before=rgb(record['source']);after=rgb(actual);h,w=before.shape[:2]
        assert record['axes']==axes and record['spatialResampling'] is False
        assert sha(actual)==sha(Path(temp)/actual.name)==record['outputSha256']
        assert sha(record['source'])==record['sourceSha256'] and sha(SOURCE/'finish_quiet_edges.py')==record['toolSha256']
        y,x=np.mgrid[:h,:w];allowed=(x<w//8)|(x>=w-w//8)
        if axes=='xy':allowed|=(y<h//8)|(y>=h-h//8)
        assert np.array_equal(before[~allowed],after[~allowed]),name+' interior changed'
        expected=before.astype(float)
        for axis in axes:
            plane=expected if axis=='x' else expected.transpose(1,0,2);along,across=plane.shape[:2]
            delta=spatial_smooth(plane[:,0]-plane[:,-1],max(1,along/128));u=np.minimum(np.arange(across)/(across//8),1);fade=1-3*u*u+2*u*u*u
            plane[:]+=.5*delta[:,None,:]*(fade[::-1]-fade)[None,:,None]
        independently_composed=np.rint(np.clip(expected,0,255)).astype('uint8')
        error=np.abs(independently_composed.astype(int)-after.astype(int))
        assert error.max()<=1,name+' not same-coordinate additive smooth correction'
        rows.append(dict(name=name,axes=axes,outputSha256=sha(actual),unchangedInteriorPixels=int((~allowed).sum()),independentSpatialConvolutionMaxError=int(error.max()),noGeometryResampling=True))
phase_path=SOURCE/'cable1_1-phase-v3.json';phase=json.loads(phase_path.read_text());donor=rgb(ROOT/phase['donor']);fitted=rgb(ROOT/phase['output']);native=rgb(SOURCE/'native-cable1_1.png');h,w=donor.shape[:2]
with tempfile.TemporaryDirectory(prefix='quaked-cable-cli-replay-') as temp:
    replay=Path(temp)/'phase.png'
    subprocess.run(['/usr/bin/python3',str(SOURCE/'replay_cable_phase.py'),'--output',str(replay)],check=True,capture_output=True)
    assert sha(replay)==phase['outputSha256'],'production phase CLI replay differs'
assert donor.shape==fitted.shape and h==w
assert sha(ROOT/phase['donor'])==phase['donorSha256'] and sha(ROOT/phase['output'])==phase['outputSha256']
original=np.array(phase['originalCrestNativeY']);measured=np.array(phase['measuredDonorCrestNativeY']);assert np.all(np.diff(original)>0) and np.all(np.diff(measured)>0)
assert np.array_equal(original,[0,6,12,18,24,30,36,43,49,55,61,64])
assert np.allclose(measured[-2:],measured[:2]+64), 'final visible crest and endpoint must reuse cyclic donor'
y=np.interp(np.arange(h)*64/h,original,measured)*h/64;lo=np.floor(y).astype(int);fraction=y-lo
expected=np.rint(donor[lo%h].astype(float)*(1-fraction[:,None,None])+donor[(lo+1)%h].astype(float)*fraction[:,None,None]).astype('uint8')
assert np.array_equal(fitted,expected),'phase mapping fails exact bilinear-row replay'
def crests(image,interior=False):
    height,width=image.shape[:2];profile=image[:,width//4:3*width//4].mean(axis=(1,2));sigma=height/64*.3;freq=np.fft.fftfreq(height);q=np.fft.ifft(np.fft.fft(profile)*np.exp(-2*np.pi**2*sigma**2*freq*freq)).real
    candidates=np.where((q>=np.roll(q,1))&(q>np.roll(q,-1)))[0];chosen=[]
    for at in sorted(candidates,key=lambda at:-q[at]):
        if interior and not .5<at*64/height<63.5:continue
        if all(abs(at-other)>=height/64*3.5 for other in chosen):chosen.append(at)
    return np.sort(chosen)*64/height
native_crests=crests(native);donor_crests=crests(donor,True);fitted_crests=crests(fitted)
assert len(native_crests)==len(fitted_crests)==11 and len(donor_crests)==10,'independent visible crest count differs'
assert np.array_equal(native_crests,original[:-1]),'recorded native crests not found in original pixels'
assert np.max(np.abs(fitted_crests-native_crests))<.25,'fitted crest phase differs from native'
assert np.max(np.abs(donor_crests-measured[:10]))<.1,'recorded donor peaks not found in donor pixels'
print(json.dumps(dict(qualification='Independent candidate authoring replay and feature-count verification; visual acceptance separate',testSha256=sha(__file__),edges=rows,cable=dict(phaseReceiptSha256=sha(phase_path),phaseReplayToolSha256=sha(SOURCE/'replay_cable_phase.py'),productionPhaseCLIReplay=True,outputSha256=sha(ROOT/phase['output']),exactRowReplay=True,horizontalSamplesUnchanged=True,nativeCrests=native_crests.tolist(),donorInteriorCrests=donor_crests.tolist(),fittedCrests=fitted_crests.tolist(),maximumCrestErrorNativePixels=float(np.max(np.abs(fitted_crests-native_crests))))),indent=2))
