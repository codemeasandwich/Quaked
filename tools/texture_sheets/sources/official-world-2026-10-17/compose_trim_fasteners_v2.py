"""Place one source-fitted GPT fastener at all eight original mark positions.

The native plain and marked trims differ only at x6..10,y6..12+16*k.
Retain the accepted plain photograph outside small smooth elliptical patches;
keep both edge rails, native1:8 aspect and original16-texel vertical spacing.
No runtime registration or acceptance is implied by this authoring operation.
"""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--base',type=Path,required=True)
    p.add_argument('--fastener',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();assert not a.output.exists() and not a.output.with_suffix('.json').exists()
    base=np.asarray(Image.open(a.base).convert('RGB'));patch=np.asarray(Image.open(a.fastener).convert('RGB'))
    assert base.shape==(512,64,3) and patch.shape==(56,48,3)
    y,x=np.mgrid[:56,:48];radius=np.sqrt(((x+.5-22)/15)**2+((y+.5-30)/18)**2)
    t=np.clip((1-radius)/.25,0,1);alpha=t*t*(3-2*t)
    out=base.astype(float).copy();allowed=np.zeros(base.shape[:2],dtype=bool)
    for k in range(8):
        top=8+64*k;left=12
        region=out[top:top+56,left:left+48]
        region[:]=region*(1-alpha[:,:,None])+patch*alpha[:,:,None]
        allowed[top:top+56,left:left+48]|=alpha>0
    result=np.rint(np.clip(out,0,255)).astype('uint8');assert np.array_equal(result[~allowed],base[~allowed])
    Image.fromarray(result).save(a.output);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    record=dict(base=str(a.base),baseSha256=sha(a.base),fastener=str(a.fastener),fastenerSha256=sha(a.fastener),output=str(a.output),outputSha256=sha(a.output),toolSha256=sha(Path(__file__)),dimensions=[64,512],markCount=8,patchTopLefts=[[12,8+64*k] for k in range(8)],nativeMarkCentres=[[8.5,9.5+16*k] for k in range(8)],unchangedOutsidePatches=True,unchangedOuterEdges=True,qualification='Eight photographed fasteners at source phase; full/distance/edge/relief review remains required')
    a.output.with_suffix('.json').write_text(json.dumps(record,indent=2)+'\n')

if __name__=='__main__':main()
