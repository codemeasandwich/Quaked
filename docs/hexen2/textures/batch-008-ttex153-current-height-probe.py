"""Render current ttex153 uncompressed height under opposed neutral lights.

Only diagnostic PNG is written; no master/tier/recipe mutation.
"""
import ast,json,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
DIAG=ROOT/'docs/hexen2/textures/batch-008-ttex153-pre-tier-diagnostics'
source=ROOT/'docs/hexen2/textures/batch-008-pre-tier-semantic-probe.py'
tree=ast.parse(source.read_bytes())
definitions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='normals'],type_ignores=[])
env=dict(np=np,math=math);exec(compile(definitions,str(source),'exec'),env)
master=BASE/'masters/ttex153/master.json';meta=json.loads(master.read_bytes())
height=np.load(master.parent/'height.npy',allow_pickle=False)
rgb=Image.open(master.parent/'color.png').convert('RGB');normal=env['normals'](height)
panels=[rgb,Image.fromarray(np.rint(height*255).astype('uint8')).convert('RGB')]
for light in [np.array([-.55,-.55,.63]),np.array([.55,.55,.63])]:
 light/=np.linalg.norm(light);lam=np.clip(normal@light,0,1)
 panels.append(Image.fromarray(np.rint((.15+.75*lam)*255).astype('uint8')).convert('RGB'))
sheet=Image.new('RGB',(1024,1064));draw=ImageDraw.Draw(sheet)
for i,label in enumerate(['Actual registered RGB','Current tonal height: semantic HOLD','Neutral NW light from current height','Neutral SE light from current height']):
 x=i%2*512;y=i//2*532;sheet.paste(panels[i],(x,y+20));draw.text((x+3,y+4),label,fill='white')
DIAG.mkdir(exist_ok=True);path=DIAG/'initial-tonal-height-opposed.png'
sheet.save(path);print(path)
