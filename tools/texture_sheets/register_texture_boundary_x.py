"""One guarded X-boundary trial reusing the unchanged qualified Y operator.

The source master is replayed exactly before one transpose/periodic_y/transpose
operation. No FFT, spatial resampling, mask, strength tuning or Y correction is
introduced here. This intensity operation cannot accept geometric seam repair.
"""
import argparse
import copy
import inspect
import io
import json
import math
from pathlib import Path
import re
import sys

import numpy as np
import PIL
from PIL import Image,features

import register_texture_boundary as operator
from prepare_texture_master import craft,finish,landmarks_from
from derive_texture_tiers import bounded_bytes,require,rgb_image,scalar_master,sha
from finish_official_texture import area,metrics

ROOT=Path(__file__).resolve().parents[2]
# The reviewed v1 operator is intentionally immutable, including its source bytes.
# Changing it requires another explicitly reviewed adapter version, never a
# self-updated recipe hash or a silent migration of historical producer receipts.
Y_OPERATOR_SHA256='3a96c0d1588060e0465b40763d4c9d19371e8113c91a0a89058e1dfb4e9658ee'
MAX_META_BYTES=2_097_152
RECIPE_KEYS={'schemaVersion','policy','nativeIdentity','name','edition','nativeDimensions',
             'sourceMasterPackage','sourceMasterPackageSha256','sourceVerification','artHold','operator'}


def resolve(value):
    require(isinstance(value,str)and 0<len(value)<=4096,'Bounded path string required')
    path=Path(value);return(path if path.is_absolute()else ROOT/path).resolve()


def number(value,lo,hi,exclusive=False):
    return(type(value)in(int,float)and math.isfinite(value)
           and(lo<value if exclusive else lo<=value)and value<=hi)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    require(not args.output.exists()and not args.output.is_symlink(),'Output already exists')
    watched={}
    def read(path,metadata=False):
        path=Path(path).resolve();data=bounded_bytes(path)
        require(not metadata or len(data)<=MAX_META_BYTES,'Metadata exceeds byte budget')
        require(path not in watched or watched[path]==data,'Input changed during validation')
        watched[path]=data;return data
    def record(row,expected=None,metadata=False):
        path=resolve(row['file']);require(expected is None or path==expected,'Unexpected record path')
        data=read(path,metadata);require(sha(data)==row['sha256'],'Recorded bytes changed: '+str(path));return path,data
    recipe_bytes=read(args.recipe,True);recipe=json.loads(recipe_bytes)
    require(set(recipe)==RECIPE_KEYS and type(recipe['schemaVersion'])is int and recipe['schemaVersion']==1
            and recipe['policy']=='periodic-boundary-x','Unsupported X-only recipe schema')
    require(isinstance(recipe['nativeIdentity'],str)and re.fullmatch('[0-9a-f]{64}',recipe['nativeIdentity']), 'Native identity required')
    require(all(isinstance(recipe[key],str)and recipe[key].strip()and len(recipe[key])<=128 for key in('name','edition')),'Bounded source labels required')
    native_dims=recipe['nativeDimensions']
    require(isinstance(native_dims,list)and len(native_dims)==2 and all(type(v)is int and v>=8 and v%4==0 for v in native_dims),'Invalid native dimensions')
    package=resolve(recipe['sourceMasterPackage']);package_bytes=read(package,True)
    require(sha(package_bytes)==recipe['sourceMasterPackageSha256'],'Source package hash changed')
    proof_path,proof_bytes=record(recipe['sourceVerification'],metadata=True);proof=json.loads(proof_bytes)
    require(isinstance(proof.get('verdict'),str)and proof['verdict'].startswith('PASS')
            and isinstance(proof.get('scope'),str)and proof['scope'].strip(),'Source/master proof did not pass')
    require(isinstance(proof.get('materials'),list)and 0<len(proof['materials'])<=128,'Missing source/master material rows')
    matches=[row for row in proof['materials']if row.get('nativeIdentity')==recipe['nativeIdentity']]
    require(len(matches)==1,'Ambiguous or missing native proof row');verified=matches[0]
    require(verified.get('sourceMasterOnly')is True and verified['name']==recipe['name']and verified['edition']==recipe['edition']
            and isinstance(verified.get('verdict'),str)and verified['verdict'].startswith('PASS'),'Require explicit source/master-only proof')
    require(resolve(verified['masterPackage']['file'])==package
            and verified['masterPackage']['sha256']==sha(package_bytes),'Proof/source package binding changed')
    art_path,art_bytes=record(recipe['artHold'],metadata=True);art=json.loads(art_bytes)
    holds=[row for row in art['textures']if row.get('texture')==recipe['name']]
    require(len(holds)==1 and holds[0]['artVerdict']=='HOLD'
            and holds[0]['nativeIdentityReportedByCandidate']==recipe['nativeIdentity'],'Require this native sealed ART HOLD')
    source=json.loads(package_bytes)
    require(type(source['schemaVersion'])is int and source['schemaVersion']==1
            and type(source['generationCount'])is int and source['generationCount']==1
            and type(source['canonicalMasterFactor'])is int and source['canonicalMasterFactor']==8
            and 'masterRevision'not in source and 'authoringPolicy'not in source['height']
            and 'authoringPolicy'not in source['color'],'Require initial unrevised one-source8x package')
    require(source['name']==recipe['name']and source['edition']==recipe['edition']and source['nativeDimensions']==native_dims,'Recipe/source labels or dimensions differ')
    registration=source['registration']
    require(registration['method']=='photographic'and type(registration['factor'])is int and registration['factor']==8
            and type(registration['comparisonDivisor'])is int and registration['comparisonDivisor']==2
            and registration['edgeAnchor']is False and 'periodicBoundary'not in registration,'Unsupported or previously corrected registration')
    require(number(registration['colorStrength'],0,1)and number(registration['fieldSigma'],.25,4),'Invalid photographic controls')
    require(source['color']['file']=='color.png'and source['height']['file']=='height.npy','Canonical filenames required')
    require(source['height']['dtype']=='float32'and source['height']['authoredOnce']is True
            and source['height']['quantizedTo8Bit']is False,'Require full-precision scalar authoring master')
    profile=source['height']['profile']
    require(set(profile)=={'bands','groove','bump','glow','strength','cap'}and isinstance(profile['bands'],list)and len(profile['bands'])==4
            and all(number(x,0,4)for x in profile['bands'])and all(number(profile[k],0,4)for k in('groove','bump'))
            and number(profile['glow'],0,1)and all(number(profile[k],0,4,True)for k in('strength','cap')),'Invalid physical-height profile')
    require(verified['replayedProfileExact']==profile,'Profile differs from source/master proof')
    require(set(source['inputs'])in({'original','generated','prompt'},{'original','generated','prompt','landmarks'}),'Unexpected source roles')
    sources,source_paths={},{}
    for role,row in source['inputs'].items():source_paths[role],sources[role]=record(row)
    require(len(set(source_paths.values()))==len(source_paths),'Distinct source paths required')
    require(0<len(sources['prompt'])<=65536 and sources['prompt'].decode('utf8').strip(),'Bounded nonempty UTF8 prompt required')
    proof_inputs=verified['sourceInputs']
    require(isinstance(proof_inputs,list)and len(proof_inputs)==len(source_paths)
            and {r['role']for r in proof_inputs}==set(source_paths),'Proof source roles differ')
    for row in proof_inputs:
        require(resolve(row['file'])==source_paths[row['role']]and row['sha256']==sha(sources[row['role']]),'Proof original/raw/prompt identity differs')
    expected_tools={role:Path(__file__).with_name(name).resolve()for role,name in(
        ('prepare','prepare_texture_master.py'),('finish','finish_official_texture.py'),('derive','derive_texture_tiers.py'))}
    expected_tools['craft']=Path(__file__).resolve().parents[1]/'craft_normals.py'
    require(set(source['tools'])==set(expected_tools)and verified['producerBindings']==source['tools'],'Unexpected producer witnesses')
    for role,row in source['tools'].items():record(row,expected_tools[role])
    expected_operator=Path(__file__).with_name('register_texture_boundary.py').resolve()
    require(recipe['operator']['sha256']==Y_OPERATOR_SHA256,'Unreviewed operator source version')
    operator_path,operator_bytes=record(recipe['operator'],expected_operator)
    require(Path(operator.__file__).resolve()==operator_path
            and Path(inspect.getsourcefile(operator.periodic_y)).resolve()==operator_path
            and inspect.getmodule(operator.periodic_y)is operator,'Imported operator does not belong to pinned module')
    adapter=Path(__file__).resolve();adapter_bytes=read(adapter)
    require(all(p!=package for p in source_paths.values()),'Source/package paths overlap')
    original=rgb_image(sources['original']);generated=rgb_image(sources['generated'],master=True)
    with Image.open(io.BytesIO(sources['original']))as im:
        require(im.format=='PNG'and np.asarray(im.convert('RGBA'))[:,:,3].min()==255,'Require opaque native PNG')
    dimensions=(original.width*8,original.height*8)
    require(list(original.size)==native_dims and list(generated.size)==source['generatedDimensions']
            and list(dimensions)==source['masterDimensions'],'Native/raw/master dimensions differ')
    require(generated.width>=dimensions[0]and generated.height>=dimensions[1]
            and generated.width*original.height==generated.height*original.width,'Inadequate raw source; never upscale')
    color_path=(package.parent/'color.png').resolve();height_path=(package.parent/'height.npy').resolve()
    require(len({*source_paths.values(),package,color_path,height_path})==len(source_paths)+3,'Source/master paths overlap')
    _,old_color_bytes=record({'file':str(color_path),'sha256':source['color']['sha256']})
    _,old_height_bytes=record({'file':str(height_path),'sha256':source['height']['sha256']})
    record(verified['storedMasterRGB'],color_path);record(verified['storedMasterScalar'],height_path)
    old_color=rgb_image(old_color_bytes,master=True);old_height=scalar_master(old_height_bytes,dimensions)
    require(old_color.size==dimensions and old_height.dtype==np.dtype('float32'),'Malformed initial RGB/float32 master')
    measured=landmarks_from(sources['landmarks'],original)if'landmarks'in sources else None
    axis=measured['axis']if measured else None
    require(registration['axis']==axis and registration['verticalLandmarks']==(measured['points']if measured else None),'Contradictory landmark metadata')
    native_image,generated_image=original,generated
    if axis=='x':native_image=original.transpose(Image.Transpose.TRANSPOSE);generated_image=generated.transpose(Image.Transpose.TRANSPOSE)
    replay,_=finish(native_image,generated_image,factor=8,vertical_landmarks=measured['points']if measured else None,
        comparison_divisor=2,method='photographic',color_strength=registration['colorStrength'],field_sigma=registration['fieldSigma'])
    if axis=='x':replay=replay.transpose(Image.Transpose.TRANSPOSE)
    require(replay.tobytes()==old_color.tobytes(),'Original photographic RGB does not replay')
    replay_height,_=craft(np.asarray(replay,dtype=float)/255,profile,quantize_height=False)
    baseline=io.BytesIO();np.save(baseline,replay_height.astype('float32'),allow_pickle=False)
    require(baseline.getvalue()==old_height_bytes,'Original float-height bytes do not replay')
    # This is the complete correction: one unchanged operator, one permutation
    # each way. No Y correction, image resampling, masks or tunable art controls.
    transposed,correction=operator.periodic_y(replay.transpose(Image.Transpose.TRANSPOSE))
    color=transposed.transpose(Image.Transpose.TRANSPOSE)
    height,_=craft(np.asarray(color,dtype=float)/255,profile,quantize_height=False);height=height.astype('float32')
    require(np.isfinite(height).all()and height.min()>=0 and height.max()<=1,'Invalid final scalar relief')
    correction.update({'axes':['x'],'operatorAxes':['y'],'applicationCount':1,'axisPermutationOnly':True,
        'before':metrics(np.asarray(replay,dtype=float)),'after':metrics(np.asarray(color,dtype=float)),
        'meanRGBChange':(np.asarray(color,dtype=float).mean((0,1))-np.asarray(replay,dtype=float).mean((0,1))).tolist(),
        'distanceChecks':{str(d):{'dimensions':[original.width//d,original.height//d],
            'beforeRGBMeanAbsoluteError':float(np.abs(area(np.asarray(replay,dtype=float),8*d)-area(np.asarray(original,dtype=float),d)).mean()),
            'afterRGBMeanAbsoluteError':float(np.abs(area(np.asarray(color,dtype=float),8*d)-area(np.asarray(original,dtype=float),d)).mean())}for d in(2,4)}})
    require(all(p.read_bytes()==data for p,data in watched.items()),'Input/tool changed before writing')
    args.output.mkdir(parents=True,exist_ok=False)
    with(args.output/'color.png').open('xb')as f:color.save(f,'PNG')
    with(args.output/'height.npy').open('xb')as f:np.save(f,height,allow_pickle=False)
    result=copy.deepcopy(source)
    result['masterRevision']={'replacesUnqualifiedPackage':str(package),'replacesUnqualifiedPackageSha256':sha(package_bytes),
        'previousColorSha256':source['color']['sha256'],'previousHeightSha256':source['height']['sha256'],
        'generatorOutputUnchanged':True,'notAnotherGeneration':True,'operation':'X-only transpose/periodic_y/transpose-back',
        'recipe':{'file':str(args.recipe.resolve()),'sha256':sha(recipe_bytes)},'sourceVerification':recipe['sourceVerification'],'sealedArtHold':recipe['artHold']}
    result['color']['sha256']=sha((args.output/'color.png').read_bytes())
    result['height'].update({'sha256':sha((args.output/'height.npy').read_bytes()),'uniqueSamples':int(np.unique(height).size)})
    result['registration']['periodicBoundary']=correction
    result['toolsScope']='Historical initial-source producer witnesses; current correction producers are revisionTools'
    result['revisionTools']={'adapter':{'file':str(adapter),'sha256':sha(adapter_bytes)},
        'periodicY':{'file':str(operator_path),'sha256':sha(operator_bytes),'callable':'periodic_y'},
        'finish':source['tools']['finish'],'craft':source['tools']['craft'],'sharedValidation':source['tools']['derive']}
    result['sourceEnvironment']=source.get('environment')
    result['environment']={'python':sys.version,'executable':sys.executable,'pillow':PIL.__version__,'numpy':np.__version__,'libwebp':features.version('webp')}
    result['qualification']='Unqualified X-only candidate; actual material/repeats/relief and both-tier independent public/art review required'
    require(all(p.read_bytes()==data for p,data in watched.items()),'Input/tool changed during package writing')
    with(args.output/'master.json').open('x')as f:f.write(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'master':str(args.output/'master.json'),'dimensions':list(dimensions),'generationCount':1,'periodicAxes':['x'],'qualification':result['qualification']}))


if __name__=='__main__':main()
