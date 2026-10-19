"""Read-only independent composition/FFT diagnostic for batch006 layered plan."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT/'tools'), str(ROOT/'tools/texture_sheets')]
from craft_normals import craft, gblur
from update_level_sheets import brick_mask

B = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-006'
paths = [ROOT/'docs/hexen2/textures/BATCH-006-REPAIRS.md', B/'relief/rtex001-layered-draft.json',
 B/'relief/rtex001-layered-draft-height.npy', B/'relief/rtex001-layered-draft-overlay.png',
 B/'masters/rtex001/master.json', B/'masters/rtex001/color.png',
 ROOT/'tools/craft_normals.py', ROOT/'tools/texture_sheets/update_level_sheets.py',
 ROOT/'tools/texture_sheets/prepare_texture_master.py',
 ROOT/'tools/texture_sheets/encode_official_maps.py', Path(__file__).resolve()]
raw = {p:p.read_bytes() for p in paths}
sha = lambda b:hashlib.sha256(b).hexdigest()
r = json.loads(raw[paths[1]]); m = json.loads(raw[paths[4]]); L = r['layering']
assert sha(raw[paths[4]]) == r['sourceMasterPackageSha256']
assert sha(raw[paths[5]]) == r['authoringDiffuseSha256'] == m['color']['sha256']
assert r['originalSha256'] == m['inputs']['original']['sha256']
rgb = np.asarray(Image.open(paths[5]).convert('RGB'), dtype=float)/255
D,_ = craft(rgb,m['height']['profile'],quantize_height=False)
M = brick_mask(rgb.shape[:2],L)
sigma = L['bevelPixels'] * np.sqrt(M.shape[0]*M.shape[1])/256
# Full complex FFT is an independent transform path from reused rfft gblur.
ky = np.fft.fftfreq(M.shape[0])[:,None]
kx = np.fft.fftfreq(M.shape[1])[None,:]
blur = np.fft.ifft2(np.fft.fft2(M)*np.exp(-2*np.pi**2*sigma*sigma*(kx*kx+ky*ky))).real
blur_error = float(abs(blur-gblur(M,sigma)).max())
assert blur_error < 2e-15
upper,lower,floor,mu = [L[k] for k in ('facingHeight','brickHeight','chipFloor','microAmplitude')]
base = np.where(M>.5,lower,upper-(upper-floor)*np.minimum(2*blur,1))
H = base+(D-.5)*2*mu
assert np.isfinite(H).all() and 0 < H.min() and H.max() < 1
assert floor-mu > lower+mu
stored = np.load(paths[2],allow_pickle=False)
# The draft's float32 detail staging is diagnostic history, not final policy.
draft_staging = np.where(M>.5,lower,upper-(upper-floor)*np.minimum(2*gblur(M,sigma),1))
draft_staging += (D.astype('float32')-.5)*(2*mu)
assert np.array_equal(stored,draft_staging.astype('float32'))
assert all(p.read_bytes()==b for p,b in raw.items())
report = {
 'scope':'Independent plan composition/FFT check; no authoring, codec or art acceptance',
 'inputs':[{'file':str(p.relative_to(ROOT)), 'sha256':sha(b),'bytes':len(b)} for p,b in raw.items()],
 'inputsStable':True, 'canonicalDimensions':list(M.shape[::-1]),
 'maskPixels':int(M.sum()),'maskFraction':float(M.mean()),
 'sigmaMasterPixels':float(sigma),'fullComplexVsExistingBlurMax':blur_error,
 'theoreticalBands':{'substrate':[lower-mu,lower+mu],'facing':[floor-mu,upper+mu]},
 'observedBands':{'substrate':[float(H[M>.5].min()),float(H[M>.5].max())],
 'facing':[float(H[M<.5].min()),float(H[M<.5].max())]},
 'observedGap':float(H[M<.5].min()-H[M>.5].max()),'clippedSamples':0,
 'draftFloat32DetailReplayExact':True,
 'draftVsFullPrecisionBeforeFinalCastMax':float(abs(stored-H).max()),
 'recommendation':'Final authoring: craft quantize_height=False, plane composition in full precision, one final float32 cast. Diagnostic draft used float32 detail staging; do not require final bytes to match draft.',
 'limits':['Mask rasterization reuses brick_mask; semantic polygon/image alignment is separate independent art review.',
 'Two planes guarantee facing/substrate separation, not brick/mortar separation inside the substrate.',
 'No Mid/High or compressed maps authored; post-code public CLI and actual tier proofs still required.'],
 'verdict':'PASS plan algebra and existing-policy reuse; implementation and artistic qualification pending'}
out = ROOT/'docs/hexen2/textures/batch-006-repair-plan-public-math.json'
with out.open('x') as f:f.write(json.dumps(report,indent=2)+'\n')
print(json.dumps({'receipt':str(out.relative_to(ROOT)),'sha256':sha(out.read_bytes())}))
