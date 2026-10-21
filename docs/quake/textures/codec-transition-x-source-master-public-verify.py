"""Public CLI replay of three unrevised retained source/master packages only.

Writes one new report plus temporary replay outputs; never changes assets,
masters, tiers, source inputs, tools or art status. PASS is suitable as a guarded
source/master proof, and explicitly does not accept the held X seams or relief.
"""
import argparse
import datetime
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import traceback

import numpy as np
import PIL
from PIL import Image,features

ROOT=Path(__file__).resolve().parents[3]
PREPARE=ROOT/'tools/texture_sheets/prepare_texture_master.py'
ACTUAL=ROOT/'docs/quake/textures/codec-transition-actual-public.json'
ART=ROOT/'docs/quake/textures/parallel-020/root-independent-art-before-codec.json'
NAMES=('city8_2','rock3_2','wwall1_1')
sha=lambda b:hashlib.sha256(b).hexdigest()


def need(ok,message):
    if not ok:raise AssertionError(message)


def path(value):
    p=(ROOT/value).resolve();p.relative_to(ROOT);return p


def bind(p):return {'file':str(Path(p).resolve().relative_to(ROOT)),'sha256':sha(Path(p).read_bytes())}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--report',type=Path,required=True);args=parser.parse_args()
    need(not args.report.exists()and not args.report.is_symlink(),'Never overwrite retained proof')
    watched={}
    def read(p):
        p=Path(p).resolve();p.relative_to(ROOT);b=p.read_bytes()
        need(p not in watched or watched[p]==sha(b),'Source changed during proof');watched[p]=sha(b);return b
    def load(p):return json.loads(read(p))
    report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'verdict':'HOLD source/master replay incomplete','workspace':str(ROOT),
        'scope':'Exactly three original unrevised source/master packages; source custody and public prepare-CLI byte replay only. No ART, seam, physical relief, tier/runtime/owner/release acceptance.',
        'verifier':bind(__file__),'actualSourceCustody':bind(ACTUAL),'materials':[],
        'environment':{'python':sys.version,'executable':sys.executable,'Pillow':PIL.__version__,'NumPy':np.__version__,'WebP':features.version('webp')},
        'counts':{'sourceMasterPackages':0,'freshPublicCLIReplays':0,'productionAssetWrites':0},
        'limits':['Replaying the declared original producer proves source/master consistency; it is not an independent artistic or physical-depth oracle.',
                  'Native identities rebind unchanged retained proof bytes; no new PAK audit or cross-identity alias claim.',
                  'One retained source and original producer pins remain unchanged. Temporary identical master replay is verification, not a new active authored package.',
                  'All three X seam/material art HOLDs remain; this proof is eligible only for a source/master guard.']}
    try:
        read(Path(__file__));actual,art=load(ACTUAL),load(ART)
        need(actual['verdict'].startswith('PASS'),'Prior bounded source custody did not pass')
        materials={x['name']:x for x in actual['items']};held={x['texture']:x['artVerdict']for x in art['textures']}
        need(held=={name:'HOLD'for name in NAMES},'Recorded art HOLDs differ');report['retainedArtHolds']={'proof':bind(ART),'materials':held,'changed':False}
        for p in [ROOT/'tools/resource_paths.py',ROOT/'assets/layout.json']:read(p)
        with tempfile.TemporaryDirectory(prefix='quake-x-source-master-public-')as tmp:
            for name in NAMES:
                prior=materials[name];mp=path(prior['masterPackage']['file']);mb=read(mp);m=json.loads(mb)
                need(sha(mb)==prior['masterPackage']['sha256'],'Actual initial master package changed')
                need(m['schemaVersion']==1 and m['generationCount']==1 and m['canonicalMasterFactor']==8
                     and 'masterRevision'not in m and 'authoringPolicy'not in m['height'],'Require an unrevised initial master')
                need(m['name']==name and m['height']['dtype']=='float32'and m['height']['authoredOnce']is True
                     and m['height']['quantizedTo8Bit']is False,'Initial scalar precision differs')
                need(set(m['inputs'])=={'original','generated','prompt'},'Unexpected initial source roles')
                need(set(m['tools'])=={'prepare','finish','derive','craft'},'Initial producer set differs')
                source_inputs=[]
                for key,row in m['inputs'].items():
                    p=path(row['file']);need(sha(read(p))==row['sha256'],'Retained source bytes differ');source_inputs.append({'role':key,**bind(p)})
                for row in m['tools'].values():need(sha(read(path(row['file'])))==row['sha256'],'Pinned producer changed')
                need(path(m['tools']['prepare']['file'])==PREPARE,'Wrong master entry producer')
                native=Image.open(path(m['inputs']['original']['file'])).convert('RGBA')
                raw=Image.open(path(m['inputs']['generated']['file']))
                need(raw.format=='PNG'and raw.mode=='RGB'and raw.width>=native.width*8 and raw.height>=native.height*8
                     and raw.width*native.height==raw.height*native.width,'Retained raw source is inadequate')
                need(list(native.size)==m['nativeDimensions']and list(raw.size)==m['generatedDimensions'],'Source dimensions changed')
                colorp=(mp.parent/m['color']['file']).resolve();heightp=(mp.parent/m['height']['file']).resolve()
                color,height=read(colorp),read(heightp)
                need(sha(color)==m['color']['sha256']and sha(height)==m['height']['sha256'],'Stored master pixels/data changed')
                reg=m['registration'];profile=m['height']['profile']
                need(reg['method']=='photographic'and reg['factor']==8 and reg['comparisonDivisor']==2
                     and reg.get('axis')is None and not reg['edgeAnchor']and'periodicBoundary'not in reg,'Unsupported revised registration')
                out=Path(tmp)/name
                command=[sys.executable,str(PREPARE),'--original',m['inputs']['original']['file'],
                    '--generated',m['inputs']['generated']['file'],'--prompt',m['inputs']['prompt']['file'],
                    '--name',m['name'],'--edition',m['edition'],'--profile','stone',
                    '--color-strength',str(reg['colorStrength']),'--field-sigma',str(reg['fieldSigma']),
                    '--strength',str(profile['strength']),'--cap',str(profile['cap']),'--output',str(out)]
                result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=60,check=False)
                need(result.returncode==0,'Prepare public replay failed: '+result.stderr)
                expected={'color.png':color,'height.npy':height,'master.json':mb}
                need({p.name for p in out.iterdir()}==set(expected),'Unexpected replay output set')
                for filename,payload in expected.items():need((out/filename).read_bytes()==payload,'Full public replay byte mismatch '+name+'/'+filename)
                replay_height=np.load(out/'height.npy',allow_pickle=False);original_height=np.load(io.BytesIO(height),allow_pickle=False)
                need(np.array_equal(replay_height,original_height),'Float32 samples differ')
                native_selection={'scope':'Selected used ordinary WORLD identity only','proofs':prior['nativeProofs']}
                for proof in prior['nativeProofs']:need(sha(read(path(proof['file'])))==proof['sha256'],'Native proof changed')
                if name=='rock3_2':
                    selected=load(ROOT/'docs/quake/textures/parallel-020/rock3_2/native-selected-source-proof.json')
                    need(selected['nativeIdentity']==prior['nativeIdentity']and selected['identity']['materialFlags']==[0]
                         and selected['identity']['rgbaSha256']==sha(native.tobytes()),'Selected rock native identity/flags differ')
                    excluded=[row['id']for row in selected['unusedExcludedIdentities']]
                    need(prior['nativeIdentity']not in excluded and all(row['identity']['materialFlags']==[]for row in selected['unusedExcludedIdentities']),'Used/unused rock variants conflated')
                    native_selection.update(materialFlags=[0],unusedExcludedIdentityIDs=excluded,noUsedUnusedAliasClaim=True)
                row={'nativeIdentity':prior['nativeIdentity'],'name':m['name'],'edition':m['edition'],
                    'masterPackage':bind(mp),'sourceMasterOnly':True,'verdict':'PASS source/master public CLI replay only',
                    'nativeSelection':native_selection,'sourceInputs':source_inputs,'producerBindings':m['tools'],
                    'profileSelector':'stone','replayedProfileExact':profile,'registrationControls':{'colorStrength':reg['colorStrength'],'fieldSigma':reg['fieldSigma'],'strength':profile['strength'],'cap':profile['cap']},
                    'masterDimensions':m['masterDimensions'],'storedMasterRGB':bind(colorp),'storedMasterScalar':bind(heightp),
                    'publicCLIReplay':{'command':command,'returnCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr,
                        'exactPNGBytes':True,'exactFloatNPYBytes':True,'exactFloat32Samples':True,'exactMasterJSONBytes':True,
                        'temporaryOutputsRemovedAfterHashComparison':True},'ART':'HOLD unchanged; this is not art/edge/relief acceptance'}
                report['materials'].append(row);report['counts']['sourceMasterPackages']+=1;report['counts']['freshPublicCLIReplays']+=1
                print(name+': original source/master public CLI replay byte-exact; ART remains HOLD',flush=True)
        need(tuple(row['name']for row in report['materials'])==NAMES,'Source/master proof scope differs')
        for p,digest in watched.items():need(sha(p.read_bytes())==digest,'Source/producer changed during proof')
        report['watchedInputs']={'files':len(watched),'allByteHashesUnchanged':True}
        report['verdict']='PASS bounded three unrevised source/master public CLI replays only; ART HOLDs unchanged'
    except Exception as error:
        report['verdict']='HOLD source/master public replay failed';report['failure']={'type':type(error).__name__,'message':str(error)};traceback.print_exc()
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with args.report.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'verdict':report['verdict'],'counts':report['counts'],'report':str(args.report)}));return 0 if report['verdict'].startswith('PASS')else 1


if __name__=='__main__':raise SystemExit(main())
