"""Explicit, no-overwrite relocation of the owner's known installed games.

Run with --source <resources> --destination <quaked> --receipt <local JSON>.
Hash every file before mutation, reject links/special files/conflicts, rename each
top-level child on the same filesystem, and verify every destination hash. An
interruption leaves a receipt identifying completed moves; neither endpoint is deleted.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

MAPPING = {'id1':'Quake','hipnotic':'Scourge of Armagon','rogue':'Dissolution of Eternity',
           'dopa':'Dimension of the Past','mg1':'Dimension of the Machine','ad':'Arcane Dimensions',
           'quoth':'Quoth','malice':'Malice','xmen':'X-Men','aopfm_v2':'Abyss of Pandemonium'}
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True);p.add_argument('--destination',type=Path,required=True)
    p.add_argument('--receipt',type=Path,required=True);p.add_argument('--apply',action='store_true')
    args=p.parse_args();source=args.source.resolve(strict=True);dest=args.destination.resolve(strict=True)
    if source.stat().st_dev!=dest.stat().st_dev:raise RuntimeError('Expected same-filesystem atomic moves')
    rows=[];moves=[]
    for name,title in MAPPING.items():
        folder=source/name;target=dest/title
        if folder.is_symlink() or target.is_symlink():raise RuntimeError('Refusing linked game directory')
        if not folder.exists():continue
        for child in folder.iterdir():
            if child.name=='.DS_Store':continue  # Finder metadata is not installed game data.
            destination=target/child.name
            if destination.exists() or destination.is_symlink():raise RuntimeError('Destination conflict: '+str(destination))
            moves.append({'source':str(child),'destination':str(destination),'moved':False})
            for item in ([child] if not child.is_dir() else [child,*child.rglob('*')]):
                if item.is_symlink():raise RuntimeError('Refusing linked content: '+str(item))
                if item.is_dir():continue
                if not item.is_file():raise RuntimeError('Refusing special file: '+str(item))
                rows.append({'source':str(item),'destination':str(target/item.relative_to(folder)),
                             'bytes':item.stat().st_size,'sha256':digest(item)})
    receipt={'status':'inventoried','source':str(source),'destination':str(dest),'files':rows,'moves':moves}
    if args.receipt.exists():raise RuntimeError('Receipt already exists; preserve it and choose a new path')
    args.receipt.parent.mkdir(parents=True,exist_ok=True)
    def save():args.receipt.write_text(json.dumps(receipt,indent=2)+'\n')
    save()
    if args.apply:
        for move in moves:
            target=Path(move['destination']);target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists() or target.is_symlink():raise RuntimeError('Destination changed: '+str(target))
            os.rename(move['source'],target);move['moved']=True;save()
        for row in rows:
            path=Path(row['destination'])
            if path.stat().st_size!=row['bytes'] or digest(path)!=row['sha256']:raise RuntimeError('Verification failed: '+str(path))
        for name in MAPPING:
            folder=source/name
            if folder.exists() and not any(folder.iterdir()):folder.rmdir()
        receipt['status']='verified';save()
    print(json.dumps({'status':receipt['status'],'files':len(rows),'bytes':sum(r['bytes'] for r in rows),'receipt':str(args.receipt)}))
if __name__=='__main__':main()
