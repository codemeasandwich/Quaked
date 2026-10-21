"""Run the maintained nine-test Quake codec suite from a clean source projection.

Reads a pinned Git commit's dependencies and the five pending owned additions.
The scratch tree deliberately has no dated campaign docs, authored assets,
.git directory or inherited untracked motif tool. Only a new report is retained.
"""
import argparse
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import traceback

import numpy as np
import PIL
from PIL import features

ROOT=Path(__file__).resolve().parents[3]
FIXTURE='tests/fixtures/quake_codec_protected_producers.json'
REQUIRED={
    'tools/texture_sheets/derive_texture_tiers.py','tools/craft_normals.py',
    'tools/texture_sheets/prepare_texture_master.py','tools/texture_sheets/finish_official_texture.py',
    'tools/texture_sheets/register_texture_boundary.py','tools/texture_sheets/prepare_layered_texture_master.py',
    'tools/texture_sheets/build_texture_batch_review.py'}
EXTRA_COMMITTED=('tools/resource_paths.py','assets/layout.json','tests/hexen2_texture_tiers_test.py')
OWNED=('tools/texture_sheets/derive_quake_texture_tiers.py',
       'tools/texture_sheets/build_quake_texture_batch_review.py',
       'tests/quake_texture_tiers_test.py','tests/quake_texture_batch_review_test.py',FIXTURE)
FOREIGN='tools/texture_sheets/prepare_motif_texture_master.py'
sha=lambda b:hashlib.sha256(b).hexdigest()


def need(ok,message):
    if not ok:raise AssertionError(message)


def git(args):
    result=subprocess.run(['git',*args],cwd=ROOT,capture_output=True,check=False)
    need(result.returncode==0,'Read-only Git command failed: '+result.stderr.decode())
    return result.stdout


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--report',type=Path,required=True);args=parser.parse_args()
    need(not args.report.exists()and not args.report.is_symlink(),'Never overwrite prior evidence')
    watched={}
    def read(relative):
        p=(ROOT/relative).resolve();p.relative_to(ROOT);data=p.read_bytes()
        need(relative not in watched or watched[relative]==sha(data),'Input changed during portable proof')
        watched[relative]=sha(data);return data
    report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'verdict':'HOLD portable test projection incomplete','workspace':str(ROOT),
        'verifier':{'file':str(Path(__file__).resolve().relative_to(ROOT)),'sha256':sha(Path(__file__).read_bytes())},
        'scope':'Exactly the maintained nine-test derive suite with seven committed producer-preservation pins. No dated campaign evidence or inherited untracked authoring tool dependency.',
        'environment':{'python':sys.version,'executable':sys.executable,'Pillow':PIL.__version__,'NumPy':np.__version__,'WebP':features.version('webp')},
        'committedDependencies':[],'ownedAdditions':[],
        'limits':['This is a clean source projection of a pinned commit plus five owned additions, not a Git checkout or a new commit.',
                  'Pillow/NumPy/libwebp are the recorded installed runtime dependencies; no installation or global environment mutation occurs.',
                  'The portable gate checks seven required committed producers. It does not claim to check the inherited eighth motif producer or the217-file actual custody set.',
                  'Separate immutable plan/actual-custody evidence retains its broader local scope. No asset, master, Hexen, shared producer or Git mutation occurs.']}
    try:
        read(str(Path(__file__).resolve().relative_to(ROOT)))
        revision=git(['rev-parse','HEAD']).decode().strip();report['baseCommit']=revision
        fixture=json.loads(read(FIXTURE));rows=fixture['protectedSourceBindings'];pins={r['file']:r['sha256']for r in rows}
        need(fixture['schemaVersion']==1 and len(rows)==7 and set(pins)==REQUIRED,'Required tracked preservation scope changed')
        dependencies=sorted(REQUIRED|set(EXTRA_COMMITTED))
        need(len(dependencies)==10,'Unexpected committed dependency scope')
        owned_data={name:read(name)for name in OWNED}
        tree=ast.parse(owned_data['tests/quake_texture_tiers_test.py'].decode())
        tests=[node.name for cls in tree.body if isinstance(cls,ast.ClassDef)and cls.name=='QuakeTextureTiersCLI'
               for node in cls.body if isinstance(node,ast.FunctionDef)and node.name.startswith('test_')]
        need(len(tests)==9,'Nine meaningful public tests must execute')
        with tempfile.TemporaryDirectory(prefix='quake-codec-clean-projection-')as tmp:
            scratch=Path(tmp)/'Quaked';scratch.mkdir()
            for name in dependencies:
                git(['ls-files','--error-unmatch','--',name])
                committed=git(['show',revision+':'+name])
                need(read(name)==committed,'Working dependency differs from pinned commit: '+name)
                if name in pins:need(sha(committed)==pins[name],'Committed protected producer hash differs')
                target=scratch/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(committed)
                report['committedDependencies'].append({'file':name,'sha256':sha(committed),'fromCommit':revision})
            for name,data in owned_data.items():
                target=scratch/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
                report['ownedAdditions'].append({'file':name,'sha256':sha(data)})
            forbidden=('docs','.git','assets/authoring',FOREIGN)
            for name in forbidden:need(not(scratch/name).exists(),'Forbidden nonportable dependency copied: '+name)
            expected=set(dependencies)|set(OWNED)
            inventory={str(p.relative_to(scratch))for p in scratch.rglob('*')if p.is_file()}
            need(inventory==expected and len(inventory)==15,'Clean projection contains unexpected source material')
            before={name:sha((scratch/name).read_bytes())for name in inventory}
            report['scratchInventory']=[{'file':name,'sha256':before[name]}for name in sorted(inventory)]
            report['excludedDependencies']={name:True for name in forbidden}
            env=os.environ.copy();env.pop('PYTHONPATH',None);env.pop('PYTHONHOME',None);env['PYTHONDONTWRITEBYTECODE']='1'
            command=[sys.executable,str(scratch/'tests/quake_texture_tiers_test.py')]
            result=subprocess.run(command,cwd=scratch,env=env,capture_output=True,text=True,timeout=150,check=False)
            report['publicSuite']={'command':command,'cwd':str(scratch),'returnCode':result.returncode,
                'stdout':result.stdout,'stderr':result.stderr,'testsRequired':9,'testNamesRequired':tests,
                'PYTHONPATHRemoved':True,'PYTHONHOMERemoved':True,'bytecodeWritesDisabled':True}
            need(result.returncode==0,'Portable nine-test public suite failed')
            need('Ran 9 tests'in result.stderr and'\nOK\n'in result.stderr,'Public suite did not report9passing tests')
            for name in tests:need(name+' ('in result.stderr,'Missing meaningful public test execution: '+name)
            after={name:sha((scratch/name).read_bytes())for name in inventory}
            need(before==after,'Clean copied source changed during test execution')
            need({str(p.relative_to(scratch))for p in scratch.rglob('*')if p.is_file()}==inventory,'Unexpected file appeared in clean source tree')
            for name in forbidden:need(not(scratch/name).exists(),'Forbidden dependency appeared during execution')
            report['scratchSourcesByteExactAfterSuite']=True
            report['temporaryProjectionRemovedAfterVerification']=True
        for name,digest in watched.items():need(sha((ROOT/name).read_bytes())==digest,'Original source changed during proof')
        report['watchedOriginalInputs']={'files':len(watched),'allByteHashesUnchanged':True}
        report['verdict']='PASS clean source projection: nine public tests, seven required committed producer pins, no dated docs or inherited motif dependency'
    except Exception as error:
        report['verdict']='HOLD portable source projection failed';report['failure']={'type':type(error).__name__,'message':str(error)};traceback.print_exc()
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with args.report.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'verdict':report['verdict'],'report':str(args.report)}));return 0 if report['verdict'].startswith('PASS')else 1


if __name__=='__main__':raise SystemExit(main())
