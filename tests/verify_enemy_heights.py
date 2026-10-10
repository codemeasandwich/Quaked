#!/usr/bin/env python3
"""Verify enemy height catalogue completeness, actual MDL layouts and source provenance."""
import hashlib
import io
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
from update_enemy_heights import ENEMIES, PROFILE, native_skins
from make_sheets import read_pak
import craft_normals
from enemy_height_authoring import author_height

pak=read_pak(ROOT/'games/shareware/pak0.pak');palette=np.frombuffer(pak['gfx/palette.lmp'],dtype=np.uint8).reshape(256,3)
index=json.loads((ROOT/'newer/enemies/index.json').read_text());records=[];checks=0;stale=[]
source=ROOT/'tools/texture_sheets/sources/shambler-2026-10-01.png'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='f65fd1bcc87f70862cfb7284f216c4b20b89a05ed82fd0cc71f4d7a51033a3e9';checks+=1
available={name[6:-4]:native_skins(data,palette) for name,data in pak.items() if name.startswith('progs/') and name.endswith('.mdl') and name[6:-4] in ENEMIES}
assert set(index['nativeHeights'])==set(available);checks+=1

def verify(model,file,diffuse,spec,kind,authoring_key=None):
 global checks
 path=ROOT/'newer/enemies'/file;height=Image.open(path).convert('L');assert height.size==diffuse.size;checks+=1
 data=np.asarray(height);assert data.max()-int(data.min())>20;checks+=1
 expected=author_height(np.asarray(diffuse.convert('RGB'),dtype=np.float32)/255,PROFILE,authoring_key or model)
 # the stored lossless WebP holds exactly the authored heights; its bytes depend on the encoder's version, so the
 # decoded pixels are compared (card [44m]: byte equality failed under a newer libwebp with every pixel the same)
 if np.array_equal(data,np.round(expected*255).astype('uint8')):checks+=1
 else:stale.append(file) # reported together at the end
 assert spec['strength']==PROFILE['strength'] and spec['cap']==PROFILE['cap'];checks+=1
 records.append(dict(model=model,kind=kind,file=file,dimensions=height.size,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))

for model,groups in available.items():
 assert len(index['nativeHeights'][model])==len(groups);checks+=1
 for skin,frames in enumerate(groups):
  assert len(index['nativeHeights'][model][skin])==len(frames);checks+=1
  for frame,diffuse in enumerate(frames):
   spec=index['nativeHeights'][model][skin][frame];verify(model,spec['file'],diffuse,spec,'native')
for model,variants in index['models'].items():
 for variant in variants:
  if model not in ENEMIES:
   assert 'height' not in variant['maps'];checks+=1;continue
  assert 'height' in variant['maps'];checks+=1
  directory=ROOT/'newer/enemies'/variant['dir'];verify(model,variant['dir']+'/'+variant['maps']['height'],Image.open(directory/variant['maps']['diffuse']),dict(strength=variant['heightStrength'],cap=variant['heightCap']),'custom',variant['dir'])
fit=json.loads((ROOT/'docs/evidence/shambler-uv-fit-2026-10-01.json').read_text());assert fit['surface_coverage']==1.0;checks+=1
report=dict(checks=checks,version=index['version'],source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),stored_height_count=len(records),available_models=sorted(available),runtime_model_keys=sorted(ENEMIES),records=records)
# the dated evidence record is rewritten only on request (--write-evidence); a plain run checks and changes nothing
if '--write-evidence' in sys.argv:(ROOT/'docs/evidence/enemy-height-verification-2026-10-01.json').write_text(json.dumps(report,indent=2)+'\n')
# heights that no longer match their diffuse: ogre and soldier since the owner's new skins (b229ee1f), whose
# heights were not regenerated; regenerating them changes how they look, so it is the owner's call (card [44m])
assert not stale,'heights not authored from their current diffuse: '+', '.join(stale)
print(f'PASS: {checks} checks; {len(records)} stored heights; {len(available)} shipped model layouts; {len(ENEMIES)} runtime model keys')
