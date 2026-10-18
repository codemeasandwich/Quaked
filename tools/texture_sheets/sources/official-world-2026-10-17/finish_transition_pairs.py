"""Apply the existing paired colour finisher to a two-texture vertical cycle.

_02 ends in rust, _03 starts in rust; _03 ends in steel, _02 starts in steel.
Individual vertical self-wrapping would destroy this directional contract.
Concatenation and a half-cycle roll let the established quiet-edge implementation
repair both real joins without resampling or inventing new detail. Its 1/8-cycle
bands cover 1/4 of each endpoint image; the middle half stays byte-identical.
Inputs remain preserved. Visual review and lossy encoding are separate checks.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image

IMPLEMENTATION=Path(__file__).parent.parent/'official-world-2026-10-12/finish_quiet_edges.py'
spec=importlib.util.spec_from_file_location('quiet_edges',IMPLEMENTATION)
implementation=importlib.util.module_from_spec(spec)
spec.loader.exec_module(implementation)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--first',type=Path,required=True)
    p.add_argument('--second',type=Path,required=True)
    p.add_argument('--first-output',type=Path,required=True)
    p.add_argument('--second-output',type=Path,required=True)
    args=p.parse_args()
    inputs=[args.first,args.second];outputs=[args.first_output,args.second_output]
    assert all(not p.exists() and not p.with_suffix('.json').exists() for p in outputs)
    original=[np.asarray(Image.open(p).convert('RGB')) for p in inputs]
    assert original[0].shape==original[1].shape
    h,w=original[0].shape[:2]
    cycle=np.concatenate(original,axis=0)
    repaired,_,_=implementation.finish(cycle,'y')
    repaired=np.roll(repaired,h,axis=0)
    repaired,_,_=implementation.finish(repaired,'y')
    repaired=np.roll(repaired,-h,axis=0)
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    for i,out in enumerate(outputs):
        pixels=repaired[i*h:(i+1)*h]
        band=h//4
        assert np.array_equal(pixels[band:h-band],original[i][band:h-band])
        Image.fromarray(pixels).save(out)
        receipt={'source':str(inputs[i]),'sourceSha256':sha(inputs[i]),'pairedSource':str(inputs[1-i]),'pairedSourceSha256':sha(inputs[1-i]),'output':str(out),'outputSha256':sha(out),'toolSha256':sha(Path(__file__)),'implementation':str(IMPLEMENTATION),'implementationSha256':sha(IMPLEMENTATION),'cycleOrder':[str(p) for p in inputs],'axes':'paired-y-only','endpointBandPixels':band,'unchangedMiddleHalf':True,'spatialResampling':False,'qualification':'Two directed joins use the existing smooth paired colour correction. Not individual vertical self-tiling; art/Q92/relief/public checks remain required.'}
        out.with_suffix('.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print('Two directed joins finished:',*[str(p) for p in outputs])

if __name__=='__main__':main()
