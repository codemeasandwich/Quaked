"""Register the first sandstone's measured upper mortar centre using existing finishing.

Only native/2 coarse colour enters photographic finishing. The x warp reuses
its measured vertical-landmark route on transposed images, keeps both tile
endpoints, and does not reconstruct native pixel edges. All inputs unchanged.
"""
from pathlib import Path
import sys,hashlib,json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[5]
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
from finish_official_texture import finish
HERE=Path(__file__).resolve().parent
source=HERE/'originals/01-rtex337-3bbe64a968db.png'
donor=HERE/'rtex337-generated-v1.png'
out=HERE/'rtex337-photographic-v2.png'
assert not out.exists() and not out.with_suffix('.json').exists()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
inputs={str(p.relative_to(ROOT)):sha(p) for p in (source,donor)}
original=Image.open(source).convert('RGB'); generated=Image.open(donor).convert('RGB')
def joint(im):
 a=np.asarray(im,dtype=float); h,w=a.shape[:2]
 # Same source-normalised upper-course ROI, away from the horizontal joint.
 line=a[round(h*8/128):round(h*54/128)].mean((0,2))
 lo,hi=round(w*20/64),round(w*36/64)
 x=lo+int(np.argmin(line[lo:hi]))
 return (x+.5)/w*64
native_centre,generated_centre=joint(original),joint(generated)
pairs=[[0,0],[native_centre,generated_centre],[64,64]]
image,receipt=finish(original.transpose(Image.Transpose.TRANSPOSE),generated.transpose(Image.Transpose.TRANSPOSE),factor=4,vertical_landmarks=pairs,comparison_divisor=2,method='photographic',color_strength=.65)
image.transpose(Image.Transpose.TRANSPOSE).save(out)
receipt.update(recipe='measured horizontal registration through existing transposed vertical-landmark route',landmarkAxis='x',nativeMortarCentre=native_centre,generatedMortarCentre=generated_centre,measurement='darkest meanRGB column in native-normalised x20:36 and y8:54; use pixel centres',inputs=inputs,output=out.name,outputSha256=sha(out),registrationScriptSha256=sha(Path(__file__)),finisherSha256=sha(ROOT/'tools/texture_sheets/finish_official_texture.py'),metricAxes='finisher measurements are in transposed coordinates; encoder receipt uses delivered orientation')
out.with_suffix('.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert all(sha(ROOT/p)==s for p,s in inputs.items())
print(json.dumps({'nativeMortarCentre':native_centre,'generatedMortarCentre':generated_centre,'dimensions':Image.open(out).size,'output':str(out)}))
