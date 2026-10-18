"""Materialize explicit inputs for unchanged historical CLI producers in scratch.

Receipts pin these producer bytes and their original workspace identities. Only
the disposable replay fixture uses that layout; the checkout has one image at
its canonical assets path. Lookup always uses the product resource resolver.
"""
from pathlib import Path
import hashlib
import shutil
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools'))
from resource_paths import resource_path


def stage_authoring_inputs(root,directory,logical_paths):
    target=Path(directory)/'retained-inputs'
    for name in logical_paths:
        name=Path(name)
        if name.is_absolute() or '..' in name.parts:
            raise ValueError('Replay inputs must be repository-relative')
        source=resource_path(root,name)
        output=target/name
        output.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(source,output)
        if hashlib.sha256(source.read_bytes()).digest()!=hashlib.sha256(output.read_bytes()).digest():
            raise ValueError('Replay copy changed: '+str(name))
    return target


if __name__=='__main__':
    if len(sys.argv)<4:
        raise SystemExit('Usage: authoring_replay.py ROOT SCRATCH LOGICAL_INPUT...')
    print(stage_authoring_inputs(Path(sys.argv[1]),Path(sys.argv[2]),sys.argv[3:]))
