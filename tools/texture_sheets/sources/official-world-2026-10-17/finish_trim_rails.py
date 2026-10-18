"""Restore the specific physical16-texel trim cross-section in a GPT photograph.

The generic photographic finisher deliberately uses reduced comparison fields;
it cannot retain these narrow rail centres. Keep its acceptance guard unchanged.
Reuse its periodic colour-field helpers for ONE column-only layout correction.
Native Y grain never enters the result; this is no new material generator or
acceptance test. Half/quarter comparison uses the actual native image later.
"""
import argparse,hashlib,importlib.util,json
from pathlib import Path
import numpy as np
from PIL import Image
IMPLEMENTATION=Path(__file__).parents[2]/'finish_official_texture.py'
spec=importlib.util.spec_from_file_location('photographic_finish',IMPLEMENTATION)
implementation=importlib.util.module_from_spec(spec);spec.loader.exec_module(implementation)
def main():
    p=argparse.ArgumentParser(description=__doc__)
    for flag in ['original','generated','output']:p.add_argument('--'+flag,type=Path,required=True)
    a=p.parse_args();assert not a.output.exists() and not a.output.with_suffix('.json').exists()
    source=np.asarray(Image.open(a.original).convert('RGB'),dtype=float)
    donor=np.asarray(Image.open(a.generated).convert('RGB'),dtype=float)
    assert source.shape==(128,16,3) and donor.shape==(512,64,3)
    target=source.mean(axis=0,keepdims=True)
    donor_columns=donor.mean(axis=0).reshape(16,4,3).mean(axis=1)[None]
    field=implementation.periodic_blur(target-donor_columns,.35)
    correction=implementation.periodic_resize(field,64,1)
    raw=donor+correction
    result=np.rint(np.clip(raw,0,255)).astype('uint8');Image.fromarray(result).save(a.output)
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    record=dict(original=str(a.original),originalSha256=sha(a.original),generated=str(a.generated),generatedSha256=sha(a.generated),output=str(a.output),outputSha256=sha(a.output),toolSha256=sha(Path(__file__)),implementation=str(IMPLEMENTATION),implementationSha256=sha(IMPLEMENTATION),method='single column-only physical rail colour correction',sigmaNativeColumns=.35,nativeColumnMeanRGB=target[0].tolist(),outputColumnMeanRGB=result.mean(axis=0).tolist(),newClippedFraction=float(np.mean((raw<0)|(raw>255))),spatialResampling=False,nativeYDetailCopied=False,qualification='Physical layout repair only; full/half/quarter/edge/relief acceptance remains separate and uses actual nativePNG.')
    a.output.with_suffix('.json').write_text(json.dumps(record,indent=2)+'\n')
if __name__=='__main__':main()
