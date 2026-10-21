"""Independent partial rtex054 source/RGB/float/public CLI replay; no tiers/ART."""
import ast
import datetime
import hashlib
import io
import json
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[6];D=Path(__file__).resolve().parent;S=D.parent
B=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-17-rtex054'
MP=B/'masters/rtex054-rounded-v1/master.json'
IDENTITY='d007ea021eb38aceb69f2236c61cae889628abe4d1abc49beffd18c529bbee27'
MP_SHA='5eead8ad9bd8fbd84b45a5905cba9b36fbd4de00371761b8c16e82389d5869b4'
WRAPPER_SHA='50820aab8136fac2a432e584874d5db2d4e9e9be5e35fae33e7838467694e2c9'
watched={};sha=lambda b:hashlib.sha256(b).hexdigest()


def read(p):
    p=Path(p);p=(p if p.is_absolute() else ROOT/p).resolve();data=p.read_bytes()
    digest=sha(data);assert p not in watched or watched[p]==digest,'Input changed after first observation: '+str(p)
    watched[p]=digest;return data


def load(p):return json.loads(read(p))


def w(p):
    p=Path(p);p=(p if p.is_absolute() else ROOT/p).resolve()
    return {'file':str(p.relative_to(ROOT)) if ROOT in p.parents else str(p),'sha256':sha(read(p))}


def npy(a):
    out=io.BytesIO();np.save(out,a,allow_pickle=False);return out.getvalue()


def png(a):
    out=io.BytesIO();Image.fromarray(a).save(out,'PNG');return out.getvalue()


def functions(path,names,scope):
    module=ast.parse(read(path));nodes=[n for n in module.body if isinstance(n,ast.FunctionDef) and n.name in names]
    assert {n.name for n in nodes}==set(names)
    exec(compile(ast.Module(body=nodes,type_ignores=[]),str(path),'exec'),scope)


def archive_digest(p):
    value=hashlib.sha256()
    with Path(p).open('rb') as file:
        for chunk in iter(lambda:file.read(1024*1024),b''):value.update(chunk)
    return value.hexdigest()


def main():
    out=D/'source-master-partial-v1.json';assert not out.exists(),'Preserve prior receipt'
    report={'schemaVersion':1,'scope':'Independent partial current rounded source/master/RGB/full-float/actual CLI proof only; no direct tiers or final ART/custody accepted','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'HOLD'}
    temp=None
    try:
        master=load(MP);assert sha(read(MP))==MP_SHA
        assert master['name']=='rtex054' and master['edition']=='base' and master['generationCount']==1
        assert master['height']['authoringPolicy']=='rounded-caps-v1' and master['height']['dtype']=='float32'
        assert master['height']['authoredOnce'] is True and master['height']['quantizedTo8Bit'] is False
        assert master['nativeDimensions']==[64,64] and master['masterDimensions']==[512,512] and master['canonicalMasterFactor']==8
        assert set(master['inputs'])=={'original','generated','prompt','roundedCapsRecipe'} and 'layeredRelief' not in master
        for group in ('inputs','tools'):
            for row in master[group].values():assert sha(read(row['file']))==row['sha256']
        assert sha(read(ROOT/'tools/texture_sheets/prepare_rounded_cap_texture_master.py'))==WRAPPER_SHA
        recipe_path=master['inputs']['roundedCapsRecipe']['file'];recipe=load(recipe_path)
        assert recipe['nativeIdentity']==master['roundedCaps']['nativeIdentity']==IDENTITY
        assert recipe==master['roundedCaps']['recipe'] and sha(read(recipe_path))==master['roundedCaps']['recipeSha256']=='a8647745f8399f80a6978c1b5f1f6612c92dbdbee080c8105a70dbcdbfeb4489'
        initial_path=recipe['sourceMasterPackage'];initial=load(initial_path)
        assert sha(read(initial_path))==recipe['sourceMasterPackageSha256']=='eacb48c1a29970e6ca95ac093fb276c5dedc6eebf42951913b65edf16d8db189'
        assert 'masterRevision' not in initial and 'authoringPolicy' not in initial['height']
        assert master['masterRevision']=={'replacesUnqualifiedPackageSha256':recipe['sourceMasterPackageSha256'],'previousHeightSha256':initial['height']['sha256'],'generatorOutputUnchanged':True,'RGBUnchanged':True,'notAnotherGeneration':True}
        for key in ('nativeDimensions','generatedDimensions','masterDimensions','registration','canonicalMasterFactor'):
            assert master[key]==initial[key]
        assert {k:v for k,v in master['inputs'].items() if k!='roundedCapsRecipe'}==initial['inputs']
        assert {k:v for k,v in master['tools'].items() if k not in ('roundedCapAuthoring','exclusivePublication')}==initial['tools']
        proof_path=recipe['sourceVerification']['file'];proof=load(proof_path)
        assert sha(read(proof_path))==recipe['sourceVerification']['sha256']=='86284d4b4cfff5b049082c94069193a7995e43e1af9d097120d590ebb0053ebd'
        mat,=[row for row in proof['materials'] if row['nativeIdentity']==IDENTITY]
        assert proof['verdict'].startswith('PASS') and proof['inputsStable'] and mat['name']=='rtex054' and mat['edition']=='base'
        assert mat['masterPackage']['sha256']==recipe['sourceMasterPackageSha256'] and mat['masterPackage']['file']==initial_path
        for row in proof['inputs']:assert sha(read(row['file']))==row['sha256']
        for p,digest in proof['archiveInputsStable'].items():assert archive_digest(p)==digest
        assert len(proof['nativePhysicalOccurrences'])==19 and proof['nativeUniqueContentSlotCount']==14
        freeze=load(S/'PHYSICAL_HOLD_FREEZE.json');assert len(freeze['frozenInputs'])==82
        for p,digest in freeze['frozenInputs'].items():assert sha(read(p))==digest
        review=load(S/'analytic-cap-actual-plan-v1/root-actual-recipe-review-v1.json')
        assert review['verdict'].startswith('PASS') and review['recipe']['sha256']==sha(read(recipe_path))
        sealed_inputs=load(S/'analytic-cap-actual-plan-v1/source-code-review-inputs.json')
        # Existing receipt schemas are retained verbatim; only their exact file/hash
        # bindings are carried, never a substitute synthetic source proof.
        journal,=load(B/'selection.json')['items']
        assert journal['id']==IDENTITY and journal['generationCount']==1 and journal['generationState']=='generated-retained'
        for role in ('original','generated','prompt'):
            assert Path(master['inputs'][role]['file']).resolve()==(ROOT/journal[role]).resolve()
            assert master['inputs'][role]['sha256']==journal[role+'Sha256']
        assert read(journal['generated'])==read(journal['builtInOutput'])
        original=Image.open(io.BytesIO(read(journal['original']))).convert('RGB');raw=Image.open(io.BytesIO(read(journal['generated'])))
        assert original.size==(64,64) and raw.size==(1254,1254) and raw.mode=='RGB' and raw.format=='PNG'
        profile=initial['height']['profile'];assert profile=={'bands':[.6,1,.8,.5],'groove':.5,'bump':.5,'glow':.2,'strength':.3,'cap':.5}
        # Photographic .65/.75 registration reconstructed without producer imports.
        donor=np.asarray(raw.resize((512,512),Image.Resampling.LANCZOS),float)
        delta=np.asarray(original,float).reshape(32,2,32,2,3).mean((1,3))-donor.reshape(32,16,32,16,3).mean((1,3))
        frequency=np.fft.fftfreq(32)[:,None]**2+np.fft.fftfreq(32)[None,:]**2
        field=np.fft.ifft2(np.fft.fft2(delta,axes=(0,1))*np.exp(-2*np.pi**2*.75**2*frequency)[:,:,None],axes=(0,1)).real
        channels=[np.asarray(Image.fromarray(np.tile(field[:,:,c],(3,3)).astype('float32'),'F').resize((1536,1536),Image.Resampling.BICUBIC))[512:1024,512:1024] for c in range(3)]
        rgb=np.rint(np.clip(donor+np.stack(channels,axis=2)*.65,0,255)).astype('uint8')
        initial_dir=(ROOT/initial_path).parent
        assert png(rgb)==read(initial_dir/'color.png')==read(MP.parent/'color.png') and sha(png(rgb))==master['color']['sha256']=='20ab4d43c4c4cf7877629ff231a1bb15acfd4b136ce4a5373ffc7696873d0951'
        oracle={'np':np,'math':math};oracle_file=ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py'
        functions(oracle_file,{'blur','unit','extreme','smooth','craft64'},oracle)
        detail=oracle['craft64'](rgb,profile);assert detail.dtype==np.float64 and np.isfinite(detail).all()
        assert npy(detail.astype('float32'))==read(initial_dir/'height.npy')
        # Independent explicit texel-centre analytic equation, not compose_caps.
        caps=recipe['caps'];assert caps['profile']=='paraboloid' and caps['referenceSize']==[64,64]
        assert (caps['plateHeight'],caps['capAmplitude'],caps['microAmplitude'])==(.54,.07,.004) and len(caps['heads'])==8
        xx=(np.arange(512,dtype=np.float64)[None,:]+.5)/8;yy=(np.arange(512,dtype=np.float64)[:,None]+.5)/8
        geometry=np.full((512,512),caps['plateHeight'],dtype=np.float64);stats=[];radii={}
        for head in caps['heads']:
            cx,cy=head['centre'];rx,ry=head['radii'];r2=((xx-cx)/rx)**2+((yy-cy)/ry)**2;radii[head['label']]=r2
            q=np.maximum(0,1-r2);geometry+=caps['capAmplitude']*q
            stats.append({'label':head['label'],'positiveSupportPixels':int((q>0).sum()),'maximumSampledCapTerm':float((caps['capAmplitude']*q).max())})
        assert stats==master['roundedCaps']['headSamples']
        scalar=(geometry+(detail-.5)*(2*caps['microAmplitude'])).astype('float32')
        assert npy(scalar)==read(MP.parent/'height.npy') and sha(npy(scalar))==master['height']['sha256']=='08d26484861cb80836bbacb6ecfef7b0e82e7c27c4f6c979673686f08b12385b'
        assert np.isfinite(scalar).all() and scalar.min()>=0 and scalar.max()<=1 and np.unique(scalar).size==master['height']['uniqueSamples']
        assert master['roundedCaps']['heightRange']==[float(scalar.min()),float(scalar.max())]
        assert np.all(geometry[0]==.54) and np.all(geometry[-1]==.54) and np.all(geometry[:,0]==.54) and np.all(geometry[:,-1]==.54)
        profiles=[]
        for label,r2 in radii.items():
            masks={'centre':r2<.2**2,'shoulder':(r2>=.65**2)&(r2<.85**2),'surroundingPlate':(r2>=1.15**2)&(r2<1.35**2)}
            values={name:{'samples':int(mask.sum()),'mean':float(scalar[mask].mean()),'range':[float(scalar[mask].min()),float(scalar[mask].max())]} for name,mask in masks.items()}
            assert values['centre']['mean']>values['shoulder']['mean']>values['surroundingPlate']['mean']
            profiles.append({'label':label,'ellipticBands':{'centre':[0,.2],'shoulder':[.65,.85],'surroundingPlate':[1.15,1.35]},'values':values,'classificationLimit':'Relative geometric bands, not pure metal/oxide/contact segmentation or actual ART.'})
        premature=(geometry.astype('float32')+(detail.astype('float32')-.5)*(2*caps['microAmplitude'])).astype('float32')
        precision_difference=int(np.count_nonzero(premature!=scalar))
        # Both maintained public interfaces run into entirely new private outputs.
        commands=[]
        with tempfile.TemporaryDirectory(prefix='quaked-rtex054-rounded-independent-',dir='/private/tmp') as td:
            temp=Path(td)
            def run(args):
                argv=['/usr/bin/python3',*map(str,args)];p=subprocess.run(argv,cwd=ROOT,capture_output=True,text=True,timeout=120)
                commands.append({'command':argv,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert p.returncode==0,p.stderr
            run([ROOT/'tools/texture_sheets/prepare_texture_master.py','--original',ROOT/journal['original'],'--generated',ROOT/journal['generated'],'--prompt',ROOT/journal['prompt'],'--name','rtex054','--edition','base','--profile','metal','--color-strength','.65','--field-sigma','.75','--strength','.3','--cap','.5','--output',temp/'initial'])
            for name in ('color.png','height.npy','master.json'):assert (temp/'initial'/name).read_bytes()==read(initial_dir/name)
            run([ROOT/'tools/texture_sheets/prepare_rounded_cap_texture_master.py','--recipe',recipe_path,'--output',temp/'rounded'])
            for name in ('color.png','height.npy','master.json'):assert (temp/'rounded'/name).read_bytes()==read(MP.parent/name)
        assert not temp.exists()
        assert all(sha(p.read_bytes())==digest for p,digest in watched.items())
        assert all(archive_digest(p)==digest for p,digest in proof['archiveInputsStable'].items())
        report.update({'verdict':'PASS independent partial source/current RGB/full-float rounded geometry and actual unchanged public CLI3-file replay; final tiers/ART/custody separate',
          'materials':[{'nativeIdentity':IDENTITY,'name':'rtex054','edition':'base','masterPackage':w(MP),'color':w(MP.parent/'color.png'),'height':w(MP.parent/'height.npy'),'sourceVerification':w(proof_path),'rootPhysicalAcceptanceIsSeparate':True,'finalDecodedTierARTAcceptedByThisReceipt':False}],
          'nativeCustodyCarry':{'priorActuallyExecutedProof':w(proof_path),'physicalSlots':19,'contentSlots':14,'contentFaces':1296,'currentAllPriorInputAndArchiveBytesExact':True,'scope':'Fresh exact custody of prior actual19slot/all4mip/flags/paletteRGBA proof, not a new BSP occurrence parse.'},
          'initialPackage':w(initial_path),'initialMetalScalarExact':True,'oneRetainedDeclaredPrimarySource':True,'rawEqualsBuiltInBytes':True,
          'recipe':w(recipe_path),'rootActualRecipeReview':w(S/'analytic-cap-actual-plan-v1/root-actual-recipe-review-v1.json'),
          'sameRGBPhotographicReconstructionExact':True,'analyticFullFloatOneCastNPYExact':True,'prematureFloat32ChangedSamples':precision_difference,
          'eightBroadProfiles':profiles,'all82PriorHoldInputsUnchanged':True,'publicCLIReplay':commands,'allInitialAndCurrentThreeFilesExact':True,
          'currentInputsStable':True,'archiveInputsStable':proof['archiveInputsStable'],'ownedPrivateReplayRemoved':True,'privateReplay':str(temp),
          'candidateOverwrite':False,'tierMapsCreatedByVerifier':0,'modelCallsByVerifier':0,'noProviderGitOrBuildActions':True,
          'limits':['Partial offline source/math/public wrapper replay only. No new tier encoding or final decoded physical/material/preview/custody acceptance.','Native source proof carried only through current exact original19slot proof/readset/archive custody; not another full native parse.','Declared retained primary source count and built-in bytes are not a provider-side invocation audit.','Broad scalar band ordering is not photogrammetry, material purity or actual head appearance. Root physical approval and final ART are separate evidence.'],
          'verifier':w(Path(__file__))})
        report['inputs']=[w(p) for p in sorted(watched)]
    except BaseException as error:
        report.update({'verdict':'HOLD independent partial rounded verification failure','error':repr(error),'ownedPrivateReplayRemoved':temp is None or not temp.exists(),'privateReplay':str(temp) if temp else None})
        raise
    finally:
        report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        with out.open('x') as file:json.dump(report,file,indent=2);file.write('\n')
        print(json.dumps({'proof':str(out.relative_to(ROOT)),'sha256':sha(out.read_bytes()),'verdict':report['verdict']}))

if __name__=='__main__':main()
