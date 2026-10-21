"""Independent X-math/clipping and existing craft-contract replay for one trial.

No adapter/operator numerical helper is imported. New scalar replay deliberately
uses the unchanged contractual physical-height author, not an independent ART
oracle. All source/master data is read-only. Evidence cannot clear an ART HOLD.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[6]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    a=parser.parse_args()
    assert not a.output.exists()
    recipe_path=Path(__file__).with_name('recipe.json')
    recipe=json.loads(recipe_path.read_text())
    old=ROOT/recipe['sourceMasterPackage']
    source=json.loads(old.read_text())
    paths=[recipe_path,old,old.parent/'color.png',old.parent/'height.npy',
           ROOT/recipe['sourceVerification']['file'],ROOT/recipe['artHold']['file'],
           ROOT/recipe['operator']['file'],ROOT/'tools/texture_sheets/register_texture_boundary_x.py',
           Path(__file__)]
    paths += [Path(v['file']) for v in source['inputs'].values()]
    paths += [Path(v['file']) for v in source['tools'].values()]
    watched={p.resolve():p.read_bytes()for p in paths}
    sha=lambda b:hashlib.sha256(b).hexdigest()
    assert sha(watched[old.resolve()])==recipe['sourceMasterPackageSha256']
    for value in source['inputs'].values():assert sha(watched[Path(value['file']).resolve()])==value['sha256']
    for value in source['tools'].values():assert sha(watched[Path(value['file']).resolve()])==value['sha256']
    original=np.asarray(Image.open(old.parent/'color.png').convert('RGB'),dtype=float)
    h,w,_=original.shape
    forcing=np.zeros_like(original)
    forcing[:,0]=original[:,-1]-original[:,0]
    forcing[:,-1]=-forcing[:,0]
    # Direct X forcing in original orientation and independently indexed
    # Laplacian spectrum; no transposed production/operator call is used.
    eigen=2*np.cos(2*np.pi*np.arange(h)[:,None]/h)+2*np.cos(2*np.pi*np.arange(w)[None,:]/w)-4
    eigen[0,0]=1
    spectrum=np.fft.fft2(forcing,axes=(0,1))/eigen[:,:,None]
    spectrum[0,0]=0
    smooth=np.fft.ifft2(spectrum,axes=(0,1)).real
    residual=np.roll(smooth,1,0)+np.roll(smooth,-1,0)+np.roll(smooth,1,1)+np.roll(smooth,-1,1)-4*smooth-forcing
    assert np.max(np.abs(residual))<1e-9
    assert np.max(np.abs(smooth.mean((0,1))))<1e-9
    raw=original-smooth
    corrected=np.rint(np.clip(raw,0,255)).astype('uint8')
    actual=Image.open(a.candidate/'color.png')
    assert actual.mode=='RGB' and np.array_equal(np.asarray(actual),corrected)
    rgb_bytes=io.BytesIO();Image.fromarray(corrected).save(rgb_bytes,'PNG')
    assert (a.candidate/'color.png').read_bytes()==rgb_bytes.getvalue()
    sys.path.insert(0,str(ROOT/'tools'))
    from craft_normals import craft
    height,_=craft(corrected.astype(float)/255,source['height']['profile'],quantize_height=False)
    height=height.astype('float32')
    scalar_bytes=io.BytesIO();np.save(scalar_bytes,height,allow_pickle=False)
    assert (a.candidate/'height.npy').read_bytes()==scalar_bytes.getvalue()
    revised=json.loads((a.candidate/'master.json').read_text())
    assert revised['inputs']==source['inputs'] and revised['generationCount']==1
    assert revised['height']['profile']==source['height']['profile']
    assert revised['color']['sha256']==sha((a.candidate/'color.png').read_bytes())
    assert revised['height']['sha256']==sha((a.candidate/'height.npy').read_bytes())
    assert all(p.read_bytes()==data for p,data in watched.items())
    a.output.mkdir(parents=True,exist_ok=False)
    negative,overflow=raw<0,raw>255
    mask=np.zeros((h,w,3),dtype='uint8')
    mask[:,:,0]=negative.any(2)*255
    mask[:,:,2]=overflow.any(2)*255
    Image.fromarray(mask).save(a.output/'clipping-locations.png')
    def stats(a):return {'negativeChannels':int((a<0).sum()),'overflowChannels':int((a>255).sum())}
    report={'verdict':'PASS bounded independent X Poisson and existing craft-contract replay only; ART remains unqualified',
      'scope':'One source-bound wwall1_1 candidate, no generation/geometry/art/tier/runtime acceptance',
      'independentXPoisson':{'laplacianResidualMax':float(np.abs(residual).max()),'meanFieldRGB':smooth.mean((0,1)).tolist(),
        'exactPNGBytes':True,'exactCorrectedPixels':True,'maxAbsoluteCorrection':float(np.abs(smooth).max()),
        'meanAbsoluteCorrection':float(np.abs(smooth).mean())},
      'clipping':{**stats(raw),'negativePixels':int(negative.any(2).sum()),'overflowPixels':int(overflow.any(2).sum()),
        'upperCourse':stats(raw[:256]),'lowerCourse':stats(raw[256:]),'mask':'clipping-locations.png',
        'rawMinimum':float(raw.min()),'rawMaximum':float(raw.max()),
        'sourceMeanRGB':original.mean((0,1)).tolist(),'correctedMeanRGB':corrected.mean((0,1)).tolist()},
      'scalarReplay':{'method':'Unchanged contractual craft producer using corrected RGB and same recorded profile; no independent physical ART assertion',
        'exactFloat32NPYBytes':True,'heightMinimum':float(height.min()),'heightMaximum':float(height.max())},
      'candidate':{'file':str(a.candidate/'master.json'),'sha256':sha((a.candidate/'master.json').read_bytes())},
      'watchedInputs':[{'file':str(p),'sha256':sha(data)}for p,data in watched.items()],
      'allWatchedInputsUnchanged':True,'nextGate':'Actual RGB/float material/topology/clipping/joint review before any tier export'}
    (a.output/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'output':str(a.output),'verdict':report['verdict']}))


if __name__=='__main__':main()
