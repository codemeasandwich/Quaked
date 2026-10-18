"""Repeat one reviewed GPT32px rivet motif at the original16x16 grid pitch.

The full native128px source and eight-native-texel motif establish layout.
This operation adds no procedural material, noise, resampling or new geometry.
The final original-specific colour fit and Q92 relief encoding are separate.
"""
import argparse,hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for flag in ['original','motif','output']:p.add_argument('--'+flag,type=Path,required=True)
    a=p.parse_args();assert not a.output.exists() and not a.output.with_suffix('.json').exists()
    assert Image.open(a.original).size==(128,128)
    pixels=np.asarray(Image.open(a.motif).convert('RGB'));assert pixels.shape==(32,32,3)
    result=np.tile(pixels,(16,16,1));Image.fromarray(result).save(a.output)
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    record=dict(original=str(a.original),originalSha256=sha(a.original),motif=str(a.motif),motifSha256=sha(a.motif),output=str(a.output),outputSha256=sha(a.output),dimensions=[512,512],count=[16,16],nativePitch=8,runtimePitch=32,spatialResampling=False,toolSha256=sha(Path(__file__)),qualification='Source-phase photographic motif layout only; finalcolourfit/Q92/art/relief/public qualification separate.')
    a.output.with_suffix('.json').write_text(json.dumps(record,indent=2)+'\n')
if __name__=='__main__':main()
