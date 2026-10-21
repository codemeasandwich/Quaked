"""Source-only rtex054: full native slots, use, alias and retained-source screen."""
import collections
import csv
import datetime
import hashlib
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[5]
DOC = Path(__file__).resolve().parent
BASE = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-17-rtex054'
IDENTITY = 'd007ea021eb38aceb69f2236c61cae889628abe4d1abc49beffd18c529bbee27'
WIDTH, HEIGHT = 64, 64
sha = lambda data: hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_bytes())


def witness(path):
    return {'file':str(path.relative_to(ROOT)), 'sha256':sha(path.read_bytes())}


def write(name, value):
    path = DOC/name
    with path.open('x') as file:
        file.write(json.dumps(value,indent=2)+'\n')
    return witness(path)


def file_sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda:file.read(1024*1024),b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    inv = load(DOC/'native-audit/inventory.json')
    prior_inventory = load(ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json')
    target, = [row for row in inv['variants'] if row['id'] == IDENTITY]
    prior, = [row for row in prior_inventory['variants'] if row['id'] == IDENTITY]
    assert {key:value for key,value in target.items() if key != 'selectedOriginal'} == prior
    assert target['category'] == 'ordinary' and (target['width'],target['height']) == (WIDTH,HEIGHT)
    assert inv['archives'] == prior_inventory['archives'] and len(inv['variants']) == 980
    peers = [row for row in inv['variants'] if row['id'] != IDENTITY and row['rgbaSha256'] == target['rgbaSha256']]
    assert not peers, 'Native peer must be resolved before generation'
    catalog_path = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
    catalog_bytes = catalog_path.read_bytes()
    catalog = json.loads(catalog_bytes)
    assert IDENTITY not in {row['id'] for row in catalog['materials']}
    archives = {row['path']:row for row in inv['archives']}
    selected_paths = {row['source'] for row in target['provenance']} | {'/Users/bri/quaked/Hexen 2/data1/pak0.pak'}
    archive_before, directories = {}, {}
    for filename in sorted(selected_paths):
        path = Path(filename)
        archive_before[filename] = file_sha(path)
        assert archive_before[filename] == archives[filename]['sha256']
        assert path.stat().st_size == archives[filename]['bytes']
        with path.open('rb') as file:
            magic,offset,size = struct.unpack('<4sII',file.read(12))
            assert magic == b'PACK' and size % 64 == 0
            file.seek(offset)
            table = file.read(size)
        assert len(table) == size
        directory = {}
        for at in range(0,size,64):
            name = table[at:at+56].split(b'\0')[0].decode('ascii').lower()
            directory.setdefault(name,[]).append(struct.unpack_from('<II',table,at+56))
        directories[filename] = directory

    def member(filename,name):
        entries = directories[filename][name]
        assert len(entries) == 1, 'Selected member ambiguous'
        offset,size = entries[0]
        with open(filename,'rb') as file:
            file.seek(offset)
            data = file.read(size)
        assert len(data) == size
        return data,offset

    palette,_ = member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp')
    assert len(palette) == 768 and sha(palette) == target['paletteSha256']
    common = None
    physical, usage = {}, {}
    profile_counts, orientation = collections.Counter(), collections.Counter()
    flags = set()
    for row in target['provenance']:
        bsp,offset = member(row['source'],row['map'])
        assert offset == row['memberOffset'] and sha(bsp) == row['bspSha256']
        assert struct.unpack_from('<i',bsp)[0] == 29
        lumps = [struct.unpack_from('<II',bsp,4+i*8) for i in range(15)]
        t,size = lumps[2]
        assert 0 <= row['slot'] < struct.unpack_from('<i',bsp,t)[0]
        at = t+struct.unpack_from('<i',bsp,t+4+4*row['slot'])[0]
        assert bsp[at:at+16].split(b'\0')[0] == b'rtex054'
        assert struct.unpack_from('<II',bsp,at+16) == (WIDTH,HEIGHT)
        mips = []
        for level in range(4):
            relative = struct.unpack_from('<I',bsp,at+24+level*4)[0]
            pixels = (WIDTH >> level)*(HEIGHT >> level)
            assert relative >= 40 and at+relative+pixels <= t+size
            mips.append(bsp[at+relative:at+relative+pixels])
        if common is None:
            common = mips
        assert mips == common and sha(mips[0]) == target['indexedPixelSha256']
        ti,n = lumps[6]
        fo,fn = lumps[7]
        po,pn = lumps[1]
        assert n % 40 == fn % 20 == pn % 20 == 0
        infos = {index:struct.unpack_from('<i',bsp,ti+index*40+36)[0]
                 for index in range(n//40)
                 if struct.unpack_from('<i',bsp,ti+index*40+32)[0] == row['slot']}
        assert set(infos.values()) <= {0}
        flags.update(infos.values())
        face_indices = [index for index in range(fn//20)
                        if struct.unpack_from('<H',bsp,fo+index*20+10)[0] in infos]
        assert len(face_indices) == row['faces']
        profile_counts[row['profile']] += len(face_indices)
        key = (row['source'],row['map'],row['slot'])
        physical.setdefault(key,{**row,'PAKSha256':archive_before[row['source']],
                                 'fourMipSHA256':[sha(data) for data in mips],
                                 'ordinaryTexinfoFlags':sorted(infos.values())})
        content_key = (row['bspSha256'],row['slot'])
        if content_key not in usage:
            counts, faces = collections.Counter(), []
            for index in face_indices:
                plane,side = struct.unpack_from('<HH',bsp,fo+index*20)
                assert plane < pn//20 and side in (0,1)
                normal = np.array(struct.unpack_from('<fff',bsp,po+plane*20),float)*(1 if side == 0 else -1)
                length = np.linalg.norm(normal)
                assert np.isfinite(normal).all() and abs(length-1) < 1e-5
                normal /= length
                z = float(normal[2])
                cls = ('upwardHorizontal' if z >= 1-1e-6 else 'downwardHorizontal' if z <= -1+1e-6
                       else 'vertical' if abs(z) <= 1e-6 else 'upwardSloped' if z > 0 else 'downwardSloped')
                counts[cls] += 1
                orientation[cls] += 1
                faces.append(dict(face=index,plane=plane,side=side,effectiveNormal=normal.tolist(),orientation=cls))
            usage[content_key] = dict(map=row['map'],slot=row['slot'],bspSha256=row['bspSha256'],
                                      faces=len(face_indices),orientationCounts=dict(counts),faceRecords=faces)
    assert flags == {0} and dict(profile_counts) == target['profileFaces']
    assert len(physical) == 19 and len(usage) == 14 and sum(orientation.values()) == 1296
    rgba = np.c_[np.frombuffer(palette,dtype='uint8').reshape(256,3)[np.frombuffer(common[0],dtype='uint8')],
                 np.full(WIDTH*HEIGHT,255,dtype='uint8')].reshape(HEIGHT,WIDTH,4)
    original = Path(target['selectedOriginal']['path'])
    with Image.open(original) as image:
        assert image.format == 'PNG' and image.size == (WIDTH,HEIGHT)
        assert image.convert('RGBA').tobytes() == rgba.tobytes()
    assert sha(rgba.tobytes()) == target['rgbaSha256']
    assert sha(original.read_bytes()) == target['selectedOriginal']['sha256']
    assert all(file_sha(Path(path)) == digest for path,digest in archive_before.items())
    native = write('native-proof.json',dict(schemaVersion=1,
        verdict='PASS source-only actual Low/all4mips/palette/index/RGBA/ordinaryflag/provenance; no native RGBA peer',
        nativeIdentity=IDENTITY,name='rtex054',edition='base',nativeDimensions=[WIDTH,HEIGHT],original=witness(original),
        paletteSha256=sha(palette),indexedPixelSha256=sha(common[0]),rgbaSha256=sha(rgba.tobytes()),
        fourMipSHA256=[sha(data) for data in common],ordinaryFlags=[0],profileFaces=dict(profile_counts),
        profileFaceSum=sum(profile_counts.values()),profileOccurrenceCount=len(target['provenance']),
        uniquePathMapSlots=len(physical),uniqueBSPContentSlots=len(usage),uniqueContentFaceRecords=1296,
        provenance=list(physical.values()),allNativeVariantsScreened=980,nativeRGBAPeers=[],archiveInputsStable=archive_before,
        inputs=[witness(Path(__file__)),witness(DOC/'native-audit/inventory.json'),witness(ROOT/'tools/audit_hexen2_textures.mjs')],
        limits=['Native source only, no photographic source/master/tier/ART/runtime acceptance.',
                'Profile sum 3138 is not unique use: 37 profile occurrences collapse to 19 path slots and 14 BSP content slots / 1296 faces.'],
        completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat()))
    write('usage-orientation.json',dict(schemaVersion=1,verdict='PASS deduplicated compiled local source usage only',
        nativeIdentity=IDENTITY,sourceProof=native,totalUniqueContentFaces=1296,orientationCounts=dict(orientation),
        uniqueContentSlots=14,maps=list(usage.values()),
        rule='Plane normal times face-side sign, normalized; absZ<=1e-6 vertical and +/-Z within1e-6 horizontal.',
        limits=['Before visibility/brush entity transforms; not surface-area weights or exclusive material semantics.']))

    roots = [ROOT/'assets/authoring/texture_sheets/sources',ROOT/'tools/texture_sheets/sources']
    json_rows, hits, selections, errors = [], [], [], []
    for library in roots:
        if not library.exists():
            continue
        for path in sorted(library.rglob('*.json')):
            if BASE in path.parents:
                continue
            data = path.read_bytes()
            json_rows.append(witness(path))
            try:
                obj = json.loads(data)
            except (ValueError,UnicodeDecodeError) as error:
                errors.append(dict(file=str(path.relative_to(ROOT)),error=repr(error)))
                continue
            if any(value.encode() in data for value in (IDENTITY,target['rgbaSha256'],'rtex054')):
                hits.append(witness(path))
            if 'selection' in path.name and isinstance(obj,dict):
                for item in obj.get('items',[]):
                    value = item.get('id',item.get('nativeIdentity'))
                    if isinstance(value,dict):
                        value = value.get('id')
                    if value == IDENTITY:
                        selections.append(dict(file=str(path.relative_to(ROOT)),item=item))
    image_rows, image_matches, filename_matches = [], [], []
    total_images = 0
    for library in roots:
        if not library.exists():
            continue
        for path in sorted(library.rglob('*')):
            if BASE in path.parents or path.suffix.lower() not in ('.png','.webp','.jpg','.jpeg'):
                continue
            total_images += 1
            if 'rtex054' in str(path):
                filename_matches.append(witness(path))
            try:
                with Image.open(path) as image:
                    if image.size != (WIDTH,HEIGHT):
                        continue
                    digest = sha(image.convert('RGBA').tobytes())
                    row = {**witness(path),'rgbaSha256':digest}
                    image_rows.append(row)
                    if digest == target['rgbaSha256']:
                        image_matches.append(row)
            except (OSError,ValueError) as error:
                errors.append(dict(file=str(path.relative_to(ROOT)),error=repr(error)))
    assert not errors and not hits and not selections and not image_matches and not filename_matches
    queue = list(csv.DictReader((ROOT/'docs/hexen2/textures/world-queue.csv').open()))
    queue_row, = [row for row in queue if row['native_id'] == IDENTITY]
    assert queue_row['state'] == 'pending'
    current_bytes = catalog_path.read_bytes()
    current = json.loads(current_bytes)
    assert IDENTITY not in {row['id'] for row in current['materials']}
    write('retained-source-screen.json',dict(schemaVersion=1,
        verdict='PASS current missing/unselected target with no retained exact identity/name/RGBA source association found',
        target=IDENTITY,queueRow=queue_row,sourceProof=native,nativeVariantCount=980,nativeRGBAPeers=[],
        catalogBefore={'file':str(catalog_path.relative_to(ROOT)),'sha256':sha(catalog_bytes),'bindings':len(catalog['materials'])},
        catalogAfter={'sha256':sha(current_bytes),'bindings':len(current['materials']),'targetStillUnregistered':True},
        jsonFilesScreened=len(json_rows),identifierNameRGBAHits=hits,selectionHits=selections,
        imageMetadataFilesScreened=total_images,nativeMatchingDimensionImagesDecoded=len(image_rows),
        nativeRGBAMatches=image_matches,imageFilenameMatches=filename_matches,errors=errors,
        jsonInputs=json_rows,imageInputs=image_rows,
        limits=['Current retained libraries and exact identity/name/RGBA associations, not visual equivalence of every unbound photograph.',
                'Catalog counts are time-specific observations; recheck target before issuance. No generation or shared registry change.'],
        completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat()))
    print(json.dumps(dict(nativeProof=native,profileFaces=dict(profile_counts),uniqueContentFaces=1296,
                          orientations=dict(orientation),catalogBindings=len(current['materials']),
                          retainedJSONs=len(json_rows),matchingNativeImages=len(image_rows),hits=0)))


if __name__ == '__main__':
    main()
