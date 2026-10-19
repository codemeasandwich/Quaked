"""Prepare one active eight-native-times RGB/relief package per native texture.

One prior built-in GPT generation per texture. Registration/photographic fitting
happens ONCE here, before either tier exists. Old4x images are never inputs.
"""
from pathlib import Path
import sys,json,hashlib
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[5]
sys.path.insert(0,str(ROOT/'tools'))
sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
from craft_normals import craft,profile_for
from finish_official_texture import finish
HERE=Path(__file__).resolve().parent
RECIPES=[
 ('rtex337','base','01-rtex337-3bbe64a968db.png','rtex337-generated-v1.png','rtex337-prompt-v1.txt','stone',[[0,0],[30.5,26.66065388951522],[64,64]]),
 ('rtex450','portals','13-rtex450-4f3556a977d8.png','rtex450-generated-v1.png','rtex450-prompt-v1.txt','stone',None),
 ('rtex041','base','07-rtex041-8defb77be8c0.png','rtex041-generated-master.png','rtex041-prompt-master.txt','wood',None),
 ('ttex016','portals','14-ttex016-44b57bef065e.png','ttex016-generated-master.png','ttex016-prompt-master.txt','ground',None)]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for name,edition,original_file,generated_file,prompt,profile_name,horizontal in RECIPES:
 original_path=HERE/'originals'/original_file; generated_path=HERE/generated_file
 original=Image.open(original_path).convert('RGB'); generated=Image.open(generated_path).convert('RGB')
 assert generated.width>=original.width*8 and generated.height>=original.height*8, 'Never upscale a generated source to claim8x'
 inputs={str(p.relative_to(ROOT)):sha(p) for p in (original_path,generated_path,HERE/prompt)}
 target=HERE/'masters'/name
 assert not target.exists(), 'Never overwrite a retained master'
 if horizontal:
  color,registration=finish(original.transpose(Image.Transpose.TRANSPOSE),generated.transpose(Image.Transpose.TRANSPOSE),factor=8,vertical_landmarks=horizontal,comparison_divisor=2,method='photographic',color_strength=.65)
  color=color.transpose(Image.Transpose.TRANSPOSE)
  registration['landmarkAxis']='x; finisher receipt axes are transposed'
 else:
  color,registration=finish(original,generated,factor=8,comparison_divisor=2,method='photographic',color_strength=.65)
 assert color.size==(original.width*8,original.height*8)
 profile={**profile_for(profile_name),'strength':.3,'cap':.5}
 height,_=craft(np.asarray(color,dtype=float)/255,profile,quantize_height=False)
 assert np.isfinite(height).all() and height.min()>=0 and height.max()<=1
 height=height.astype('float32')
 target.mkdir(parents=True,exist_ok=False)
 color_path=target/'color.png'; height_path=target/'height.npy'
 color.save(color_path)
 with height_path.open('xb') as file: np.save(file,height,allow_pickle=False)
 receipt={'schemaVersion':1,'name':name,'edition':edition,'generationCount':1,
  'generator':'built-in image_gen; one retained generation output, no per-tier generation',
  'inputs':inputs,'masterDimensions':list(color.size),'nativeDimensions':list(original.size),
  'generatedDimensions':list(generated.size),'canonicalMasterFactor':8,
  'sourcePolicy':'Retained generation is provenance; this single canonical RGB/height package is the only tier authoring source',
  'color':{'file':str(color_path.relative_to(ROOT)),'sha256':sha(color_path)},
  'height':{'file':str(height_path.relative_to(ROOT)),'sha256':sha(height_path),'dtype':'float32','authoredOnce':True,
            'quantizedTo8Bit':False,'profile':profile,'uniqueSamples':int(np.unique(height).size)},
  'registration':registration,'tools':{str(p.relative_to(ROOT)):sha(p) for p in (Path(__file__),ROOT/'tools/craft_normals.py',ROOT/'tools/texture_sheets/finish_official_texture.py')},
  'qualification':'Master preparation only; both tier art and decoded-map validation remain separate'}
 (target/'master.json').write_text(json.dumps(receipt,indent=2)+'\n')
 assert all(sha(ROOT/path)==digest for path,digest in inputs.items())
 print(name,edition,list(color.size),'single master; fullprecisionheight',receipt['height']['uniqueSamples'])
