"""Extract one measured two-course trim from its repeated GPT square donor.

A repeated square guide avoids stretching the native128x16/32 aspect for image
creation. These explicit pixel bounds are measured from generated course lips.
The normal source-fit step separately makes exact512x64/128 runtime dimensions.
Raw image, crop and both receipts remain preserved; acceptance is independent.
"""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for flag in ['input','original','output']:p.add_argument('--'+flag,type=Path,required=True)
    p.add_argument('--top',type=int,required=True);p.add_argument('--bottom',type=int,required=True)
    a=p.parse_args();assert not a.output.exists() and not a.output.with_suffix('.json').exists()
    native=Image.open(a.original);raw=Image.open(a.input).convert('RGB')
    assert native.size in [(128,16),(128,32)] and raw.width==raw.height
    assert 0<a.top<a.bottom<raw.height
    crop=raw.crop((0,a.top,raw.width,a.bottom));crop.save(a.output)
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    record=dict(input=str(a.input),inputSha256=sha(a.input),original=str(a.original),originalSha256=sha(a.original),output=str(a.output),outputSha256=sha(a.output),bounds=[0,a.top,raw.width,a.bottom],squareGuideVerticalRepeats=128//native.height,selectedCourseCount=2,targetRuntime=[native.width*4,native.height*4],spatialResampling=False,toolSha256=sha(Path(__file__)),qualification='Explicit measured two-course crop only; source fit, half/quarter, edge and relief checks remain required.')
    a.output.with_suffix('.json').write_text(json.dumps(record,indent=2)+'\n')
if __name__=='__main__':main()
