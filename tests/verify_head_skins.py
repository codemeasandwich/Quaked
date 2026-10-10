#!/usr/bin/env python3
"""Verify four supplied head skins, UV coverage, exact source/fit and preservation."""
import hashlib,json,struct,sys
from pathlib import Path
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
from update_head_skins import fit,uv_footprint
from update_enemy_heights import native_skins
from make_sheets import read_pak
recipe=json.loads((ROOT/'tools/texture_sheets/sources/head-skins-2026-10-01.json').read_text());index=json.loads((ROOT/'newer/enemies/index.json').read_text());pak=read_pak(ROOT/'games/shareware/pak0.pak');palette=np.frombuffer(pak['gfx/palette.lmp'],dtype=np.uint8).reshape(256,3)
checks=0;reports=[]
for model,spec in recipe['models'].items():
 source=ROOT/'tools/texture_sheets/sources'/spec['source'];assert hashlib.sha256(source.read_bytes()).hexdigest()==spec['source_sha256'];checks+=1
 data=pak['progs/'+model+'.mdl'];original=native_skins(data,palette)[0][0];expected,coverage=fit(original,Image.open(source).convert('RGB'),spec,data,recipe['factor'],recipe['bleed_pixels'])
 variant=index['models'][model][0];assert variant['dir']==model+'/custom' and not variant['flipGreen'];checks+=1
 diffuse=Image.open(ROOT/'newer/enemies'/variant['dir']/variant['maps']['diffuse']).convert('RGB');height=Image.open(ROOT/'newer/enemies'/variant['dir']/variant['maps']['height'])
 assert diffuse.size==height.size==(original.width*4,original.height*4);checks+=1
 assert diffuse.tobytes()==expected.tobytes();checks+=1
 assert coverage['surface_coverage']==1.0;checks+=1
 pixels=np.asarray(diffuse,dtype=np.int16);visible=uv_footprint(data,4)
 # Slate matte flecks must be absent on visible triangles. Burgundy can
 # coincide with legitimate blended blood colours, so verify source-seed
 # exclusion there and retain independent UV/model appearance review.
 matte=(np.max(np.abs(pixels-np.asarray(spec['background'])),axis=2)<=9)&visible
 if spec['background'][2]>spec['background'][0]+10:assert not matte.any(),(model,int(matte.sum()))
 else:assert coverage['source_matte_seed_pixels']==0
 checks+=1
 reports.append(dict(model=model,dimensions=diffuse.size,source_sha256=spec['source_sha256'],visible_pixels=int(visible.sum()),matte_pixels=int(matte.sum())))
old=json.loads((ROOT/'docs/evidence/head-skins-before.json').read_text())
# the files the increment kept are still as they were, in the shipped tree; by name, the ones a later increment changed
# by design (card [44m]): the owner's ogre and soldier skins (b229ee1f), and pak0.pak, which [34a] moved, unchanged
LATER={'newer/enemies/ogre/custom/diffuse.webp':'b229ee1f','newer/enemies/soldier/custom/diffuse.webp':'b229ee1f'}
MOVED={'pak0.pak':'games/shareware/pak0.pak'}
for file,digest in old.items():
 if file in LATER:continue
 assert hashlib.sha256((ROOT/MOVED.get(file,file)).read_bytes()).hexdigest()==digest,file;checks+=1
report=dict(checks=checks,preserved_files=len(old),version=index['version'],models=reports)
# the dated evidence record is rewritten only on request (--write-evidence); a plain run checks and changes nothing
if '--write-evidence' in sys.argv:(ROOT/'docs/evidence/head-skins-verification-2026-10-01.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'PASS: {checks} checks, four supplied atlases, {len(old)-len(LATER)} original assets preserved ({len(LATER)} changed since by design)')
