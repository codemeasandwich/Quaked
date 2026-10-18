"""Reuse approved photographic rail material and eight unrotated fasteners.

Only authoring output is written. Plain vertical source transposes to horizontal;
fasteners retain their portrait shape and measured native target centres.
The mask leaves horizontal lower rail (native y13) completely unchanged.
Height and XYZ maps must be regenerated from each completed horizontal diffuse.
"""
import argparse,hashlib,json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from resource_paths import resource_path
import numpy as np
from PIL import Image

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source-root',type=Path,required=True)
    p.add_argument('--output-root',type=Path,required=True)
    a=p.parse_args();s=Path('tools/texture_sheets/sources/official-world-2026-10-17')
    source_name='newer/textures/candidates-2026-10-17/tech04_8-photographic-rails-seam-v4-4x.png'
    source=resource_path(a.source_root,source_name)
    fastener=a.source_root/s/'trim-fastener-photographic-fitted-v2.png'
    targets=[a.output_root/s/(n+'-reviewed-photo-base-v1.png') for n in ['tech04_6','tech04_5']]
    receipt=a.output_root/s/'horizontal-trim-reuse-v1.json'
    assert not any(p.exists() for p in targets+[receipt])
    base=Image.open(source).convert('RGB');assert base.size==(64,512)
    plain=np.asarray(base.transpose(Image.Transpose.TRANSPOSE))
    patch=np.asarray(Image.open(fastener).convert('RGB'));assert patch.shape==(56,48,3)
    y,x=np.mgrid[:56,:48]
    radius=np.sqrt(((x+.5-22)/15)**2+((y+.5-30)/18)**2)
    t=np.clip((1-radius)/.25,0,1);alpha=t*t*(3-2*t)
    # Fade only the surrounding photographic shadow before target rail y52.
    tail=np.clip((44-(y+.5))/4,0,1);alpha*=tail*tail*(3-2*tail)
    marked=plain.astype(float).copy();allowed=np.zeros(plain.shape[:2],bool)
    for k in range(8):
        top,left=8,12+64*k
        region=marked[top:top+56,left:left+48]
        region[:]=region*(1-alpha[:,:,None])+patch*alpha[:,:,None]
        allowed[top:top+56,left:left+48]|=alpha>0
    marked=np.rint(np.clip(marked,0,255)).astype('uint8')
    assert np.array_equal(marked[~allowed],plain[~allowed])
    assert np.array_equal(marked[52:],plain[52:])
    assert np.array_equal(marked[:8],plain[:8])
    for target,array in zip(targets,[plain,marked]):Image.fromarray(array).save(target)
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    record={'source':source_name,'sourceSha256':sha(source),'fastener':str(fastener.relative_to(a.source_root)),'fastenerSha256':sha(fastener),'toolSha256':sha(Path(__file__)),'dimensions':[512,64],'plainTransform':'transpose only; no fastener transformation','markedCentresNative':[[8.5+16*k,9.5] for k in range(8)],'markedPatchTopLefts':[[12+64*k,8] for k in range(8)],'railRowsPreserved':[list(range(8)),list(range(52,64))],'unchangedOutsidePatches':True,'outputs':[{'file':str(p.relative_to(a.output_root)),'sha256':sha(p)} for p in targets],'qualification':'Photographic material reuse, not pixel alias or runtime registration; source fitting/art/edge/relief review required'}
    receipt.write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'receipt':str(receipt),'centres':record['markedCentresNative']}))
if __name__=='__main__':main()
