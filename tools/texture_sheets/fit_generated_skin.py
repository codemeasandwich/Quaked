#!/usr/bin/env python3
"""Fit a reviewed generated atlas with the existing native-layout importer.

Recipes pin the actual native model and generated-image bytes. Generation is a
separate owner-authorized ChatGPT imagegen step; this command never calls a model.
"""
import argparse
import json
import hashlib
from pathlib import Path
import numpy as np
from fit_rogue_skins import ROOT, fit_one, flatten_height, member
from update_enemy_heights import native_skins, height_for

if __name__ == '__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('recipe',type=Path)
 parser.add_argument('--pack',type=Path,required=True)
 parser.add_argument('--output',type=Path,default=ROOT/'newer/enemies')
 parser.add_argument('--palette-pack',type=Path,default=ROOT/'resources/id1/pak0.pak')
 args=parser.parse_args();recipe=json.loads(args.recipe.read_text())
 key=recipe['key']
 # A superseded recipe would write an old fit over the shipped skin; fit its successor instead.
 if recipe.get('supersededBy'):raise SystemExit(f"{args.recipe} is superseded by {recipe['supersededBy']}")
 if not key.replace('_','').isalnum():raise ValueError('Invalid model key')
 fit_one(key,args.pack,ROOT,args.output,recipe)
 if recipe.get('nativeHeightFile'):
  relative=Path(recipe['nativeHeightFile'])
  if relative.is_absolute() or '..' in relative.parts:raise ValueError('Native height must stay in the output directory')
  data=member(args.pack,'progs/'+key+'.mdl')
  if hashlib.sha256(data).hexdigest()!=recipe['modelSha']:raise ValueError('Native model changed during authoring')
  palette=np.frombuffer(member(args.palette_pack,'gfx/palette.lmp'),np.uint8).reshape(256,3)
  image=native_skins(data,palette)[0][0];target=args.output/relative
  height_for(image,target,key+'/native')
  flat=flatten_height(target,data,1,recipe['flatHeightVertices']) if recipe.get('flatHeightVertices') else None
  path=args.output/key/recipe.get('outputVariant','custom')/'SOURCE.json';report=json.loads(path.read_text())
  report['nativeHeight']=dict(file=relative.as_posix(),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),dimensions=list(image.size),flatHeight=flat)
  path.write_text(json.dumps(report,indent=2)+'\n')
