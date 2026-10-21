"""Replay the current master from pinned raw, native, prompt and finisher/craft tools; no writes to assets."""
from pathlib import Path
import sys, json, hashlib
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[5];sys.path.insert(0,str(root/'tools/texture_sheets'));sys.path.insert(0,str(root/'tools'))
from finish_official_texture import finish
from craft_normals import craft
out=Path(__file__).parent;b=root/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/parallel-020/city8_2/master';m=json.loads((b/'master.json').read_text())
for row in m['inputs'].values():assert hashlib.sha256(Path(row['file']).read_bytes()).hexdigest()==row['sha256']
a=Image.open(m['inputs']['original']['file']).convert('RGB');g=Image.open(m['inputs']['generated']['file']).convert('RGB');rgb,reg=finish(a,g,factor=8,comparison_divisor=2,method='photographic',color_strength=.65,field_sigma=.75)
assert rgb.tobytes()==Image.open(b/'color.png').convert('RGB').tobytes()
h,_=craft(np.asarray(rgb,float)/255,m['height']['profile'],quantize_height=False);assert np.array_equal(h.astype('float32'),np.load(b/'height.npy'))
report={'verdict':'PASS exact current source-to-master replay','scope':'Master source hashes and recorded producer RGB/fullprecisionheight replay only; independent tier math evidence is public-actual.json; no art acceptance','masterPackage':{'file':str((b/'master.json').relative_to(root)),'sha256':hashlib.sha256((b/'master.json').read_bytes()).hexdigest()},'RGBPixelExact':True,'float32HeightSampleExact':True,'masterDimensions':[512,512],'limits':['Master replay reuses recorded producer functions. Tier and normal math are separately verified through independent public fixture oracles.']}
(out/'master-replay.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
