#!/usr/bin/env python3
"""Fit the supplied complete Shub atlas through existing skin/height helpers.

Both authored sides already share the native atlas proportions. A full-atlas
transform preserves their placement; triangle/onseam coverage drives edge bleed.
No native pigment, generated anatomy or model modification enters the output.
"""
import argparse, hashlib, json, struct, sys
from pathlib import Path
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from fit_vore import member
from update_head_skins import fit, uv_footprint
from update_enemy_heights import height_for
SOURCE_SHA = 'cdafa316b50ab65c2a48f38d5354da34ae190eebc1bb69954bd0d3342ddc5a6d'
MODEL_SHA = '81966deede395272b220ae664ccdbf1c78fc5db79b56d19eb9b45dc2f807e407'
PARTS = [dict(name='complete authored front/back atlas', src=[0,0,1120,958], dst=[0,0,228,195])]
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--source',type=Path,required=True);parser.add_argument('--pack',type=Path,required=True)
 parser.add_argument('--out',type=Path,default=ROOT/'newer/enemies/oldone/custom');args=parser.parse_args()
 if hashlib.sha256(args.source.read_bytes()).hexdigest()!=SOURCE_SHA:raise ValueError('Supplied source changed; review fit recipe')
 data=member(args.pack,'progs/oldone.mdl')
 if hashlib.sha256(data).hexdigest()!=MODEL_SHA:raise ValueError('Native model differs from this fit recipe')
 skins,width,height,vertices,triangles,frames=struct.unpack_from('<6i',data,48)
 if (skins,width,height,vertices,triangles,frames)!=(1,228,195,182,364,67) or struct.unpack_from('<i',data,84)[0]!=0:raise ValueError('Unexpected native model layout')
 source=Image.open(args.source).convert('RGB')
 if source.size!=(1120,958):raise ValueError('Unexpected source dimensions')
 # Blank destination and source-only masks prohibit native fallback pigment.
 result,coverage=fit(Image.new('RGB',(width,height)),source,dict(parts=PARTS,background=[20,20,15]),data,5,10)
 if coverage['surface_coverage']!=1 or coverage['source_matte_seed_pixels']!=0:raise ValueError('Incomplete supplied UV coverage')
 args.out.mkdir(parents=True,exist_ok=True);result.save(args.out/'diffuse.webp','WEBP',lossless=True,method=6)
 height_for(result,args.out/'height.webp','oldone/custom')
 report=dict(schema=1,model='progs/oldone.mdl',nativeModelSha256=MODEL_SHA,source=args.source.name,sourceSha256=SOURCE_SHA,
  skin=0,skinFrame=0,poses=frames,vertices=vertices,triangles=triangles,factor=5,dimensions=list(result.size),parts=PARTS,
  background=[20,20,15],bleed=10,fit=coverage,nativeTexturePixelsUsed=0,
  authoredBlackSurfacePixels=int((np.max(np.asarray(result),2)[uv_footprint(data,5)]==0).sum()),
  normalProfile=dict(strength=.65,cap=.55),reuse=['update_head_skins.fit','fit_skin.spread','uv_footprint','height_for'],
  files={p:hashlib.sha256((args.out/p).read_bytes()).hexdigest() for p in ['diffuse.webp','height.webp']})
 (args.out/'SOURCE.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
