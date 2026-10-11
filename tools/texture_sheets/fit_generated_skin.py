#!/usr/bin/env python3
"""Fit a reviewed generated atlas with the existing native-layout importer.

Recipes pin the actual native model and generated-image bytes. Generation is a
separate owner-authorized ChatGPT imagegen step; this command never calls a model.
"""
import argparse
import json
from pathlib import Path
from fit_rogue_skins import ROOT, fit_one

if __name__ == '__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('recipe',type=Path)
 parser.add_argument('--pack',type=Path,required=True)
 parser.add_argument('--output',type=Path,default=ROOT/'newer/enemies')
 args=parser.parse_args();recipe=json.loads(args.recipe.read_text())
 key=recipe['key']
 if not key.replace('_','').isalnum():raise ValueError('Invalid model key')
 fit_one(key,args.pack,ROOT,args.output,recipe)
