#!/usr/bin/env python3
"""Guard one source request/retention using the existing batch selection journal.

No image service, resizing, conversion, tier authoring, Git mutation or retry is
performed. 'Adequate' describes dimensions/format only, never material quality.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import uuid
from PIL import Image

ISSUED = 'issued; awaiting actual built-in output'

def require(condition, message):
    if not condition:
        raise ValueError(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def now():
    return datetime.now(timezone.utc).isoformat()

def within(path, root):
    path = path.resolve()
    require(path == root or root in path.parents, 'Path escapes the selected workspace/batch')
    return path

def read_bounded(path, limit=67108864):
    require(path.is_file() and path.stat().st_size <= limit, 'Missing or oversized input: '+str(path))
    data = path.read_bytes()
    require(len(data) <= limit, 'Input grew beyond its budget')
    return data

@contextmanager
def locked(selection):
    lock = selection.with_name('.'+selection.name+'.generation.lock')
    token = json.dumps({'token': str(uuid.uuid4()), 'pid': os.getpid(), 'createdAt': now()})
    try:
        with lock.open('x') as file:
            file.write(token)
    except FileExistsError:
        raise ValueError('Generation journal lock exists; inspect its live producer/result. Do not remove it by age or auto-retry.')
    try:
        yield
    finally:
        if lock.is_file() and not lock.is_symlink() and lock.read_text() == token:
            lock.unlink()

def replace_journal(selection, previous, value):
    require(selection.read_bytes() == previous, 'Journal changed concurrently; preserve copied raw and reconcile before retrying')
    temp = selection.with_name('.'+selection.name+'.'+str(uuid.uuid4())+'.tmp')
    try:
        with temp.open('x') as file:
            file.write(json.dumps(value, indent=2)+'\n')
            file.flush()
            os.fsync(file.fileno())
        require(selection.read_bytes() == previous, 'Journal changed concurrently; preserve copied raw and reconcile')
        os.replace(temp, selection)
    finally:
        if temp.exists():
            temp.unlink()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--selection', type=Path, required=True)
    sub = parser.add_subparsers(dest='action', required=True)
    issue = sub.add_parser('issue', help='Record issuance immediately before ONE built-in call')
    issue.add_argument('native_id')
    retain = sub.add_parser('retain', help='Copy the exact returned PNG and record its actual metadata')
    retain.add_argument('native_id')
    retain.add_argument('--generated', type=Path, required=True)
    retain.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    require(root.is_dir(), 'Workspace root missing')
    selection = args.selection if args.selection.is_absolute() else root/args.selection
    require(not selection.is_symlink(), 'Selection journal must not be a symlink')
    selection = within(selection, root)
    batch = selection.parent
    require(re.fullmatch('[0-9a-f]{64}', args.native_id) is not None, 'Use the full native identity, not a texture name')
    with locked(selection):
        previous = read_bounded(selection, 2097152)
        doc = json.loads(previous)
        items = doc['items']
        require(isinstance(items, list) and len({i['id'] for i in items}) == len(items), 'Duplicate/malformed native identities')
        matches = [i for i in items if i['id'] == args.native_id]
        require(len(matches) == 1, 'Native identity not uniquely selected')
        item = matches[0]
        require(type(item['generationCount']) is int, 'Generation count must be an integer')
        original = within(root/item['original'], batch)
        prompt = within(root/item['prompt'], batch)
        require(original.suffix.lower() == '.png' and prompt.suffix.lower() == '.txt', 'Require retained native PNG and exact prompt TXT')
        native_bytes, prompt_bytes = read_bounded(original), read_bounded(prompt, 65536)
        require(sha(native_bytes) == item['originalSha256'] and sha(prompt_bytes) == item['promptSha256'], 'Native/prompt changed since review')
        require(prompt_bytes.decode('utf8').strip(), 'Empty prompt')
        with Image.open(io.BytesIO(native_bytes)) as image:
            native = image.size
        require(list(native) == item['nativeDimensions'] and min(native) >= 8
                and all(x % 4 == 0 for x in native)
                and native[0]*native[1]*64 <= 16777216,
                'Contradictory/unsupported native dimensions or 8x master pixel budget')
        if args.action == 'issue':
            require(item['generationCount'] == 0 and item['generationState'] in ('not-issued', 'not issued')
                    and not item.get('generated') and not item.get('contentAliasOf')
                    and not item.get('candidateContentAliasOf'), 'Source already issued/retained or proposed as an alias; reconcile instead of regenerating')
            item.update(generationCount=1, generationState=ISSUED, generationIssuedAt=now())
            result = {'nativeIdentity': args.native_id, 'promptText': prompt_bytes.decode('utf8'), 'original': str(original)}
        else:
            require(item['generationCount'] == 1 and item['generationState'] == ISSUED, 'No unresolved issued request for this native identity')
            source = args.generated.expanduser().resolve()
            data = read_bounded(source)
            with Image.open(io.BytesIO(data)) as image:
                require(image.format == 'PNG' and image.width*image.height <= 16777216, 'Expected bounded built-in PNG output; preserve issued state and inspect the actual result')
                size, mode = image.size, image.mode
                image.load()
            destination = args.destination if args.destination.is_absolute() else root/args.destination
            require(not destination.is_symlink(), 'Destination must not be a symlink')
            destination = within(destination, batch)
            require(destination.suffix.lower() == '.png' and not destination.exists(), 'PNG destination already exists or has wrong extension')
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open('xb') as file:
                file.write(data)
            require(source.read_bytes() == data and destination.read_bytes() == data, 'Returned raw changed; preserve copies and reconcile')
            dimensions_ok = size[0] >= native[0]*8 and size[1] >= native[1]*8 and size[0]*native[1] == size[1]*native[0]
            supported = dimensions_ok and mode == 'RGB'
            state = 'generated-retained' if supported else ('generated-retained-unqualified-dimensions' if not dimensions_ok else 'generated-retained-unqualified-format')
            item.update(generated=str(destination.relative_to(root)), generatedSha256=sha(data),
                generatedDimensions=list(size), generatedMode=mode, generationState=state,
                generatedAt=now(), builtInOutput=str(source))
            result = {'nativeIdentity': args.native_id, 'dimensions': list(size), 'mode': mode,
                'dimensionsAdequate': dimensions_ok, 'adequateFor8x': supported,
                'materialQualityAccepted': False, 'retained': str(destination), 'sha256': sha(data)}
        require(original.read_bytes() == native_bytes and prompt.read_bytes() == prompt_bytes, 'Native/prompt changed during journal operation')
        replace_journal(selection, previous, doc)
        print(json.dumps(result))

if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print('Generation journal refused: '+str(error), file=sys.stderr)
        sys.exit(1)
