"""Source-only ttex262 native/usage/alias/retained-source intake, no generation."""
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
BASE = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-13-ttex262'
ID = '48459128c48ad2c273711c7b77e2267f27d1706dba9f84b9eb3a0af4f71f6436'
sha = lambda data: hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_bytes())


def witness(path):
    return {'file': str(path.relative_to(ROOT)), 'sha256': sha(path.read_bytes())}


def write(name, data):
    path = DOC/name
    with path.open('x') as file:
        file.write(json.dumps(data, indent=2)+'\n')
    return witness(path)


def file_sha(path):
    h = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    inv = load(DOC/'native-audit/inventory.json')
    old = load(ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json')
    target, = [v for v in inv['variants'] if v['id'] == ID]
    prior, = [v for v in old['variants'] if v['id'] == ID]
    assert {k:v for k,v in target.items() if k != 'selectedOriginal'} == prior
    assert target['category'] == 'ordinary' and (target['width'], target['height']) == (64,64)
    assert inv['archives'] == old['archives'] and len(inv['variants']) == 980
    tuples = lambda row: tuple(row[k] for k in ('width','height','paletteSha256','indexedPixelSha256','rgbaSha256'))
    rgba_peers = [v for v in inv['variants'] if v['id'] != ID and v['rgbaSha256'] == target['rgbaSha256']]
    tuple_peers = [v for v in inv['variants'] if v['id'] != ID and tuples(v) == tuples(target)]
    assert not rgba_peers and not tuple_peers, 'Peer requires full source-equivalence proof before new source'
    catalog_path = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json'
    catalog_bytes = catalog_path.read_bytes();catalog = json.loads(catalog_bytes)
    assert ID not in {v['id'] for v in catalog['materials']}
    archives = {a['path']:a for a in inv['archives']}
    selected_paths = {p['source'] for p in target['provenance']}|{'/Users/bri/quaked/Hexen 2/data1/pak0.pak'}
    directories, before = {}, {}
    for file in sorted(selected_paths):
        path = Path(file);before[file] = file_sha(path)
        assert before[file] == archives[file]['sha256'] and path.stat().st_size == archives[file]['bytes']
        with path.open('rb') as source:
            magic,off,n = struct.unpack('<4sII',source.read(12));assert magic == b'PACK' and n%64 == 0
            source.seek(off);table = source.read(n)
        assert len(table) == n
        directory = {}
        for i in range(0,n,64):
            name = table[i:i+56].split(b'\0')[0].decode('ascii').lower()
            directory.setdefault(name,[]).append(struct.unpack_from('<II',table,i+56))
        directories[file] = directory
    def member(file,name):
        entries = directories[file][name];assert len(entries) == 1
        offset,size = entries[0]
        with open(file,'rb') as source:
            source.seek(offset);data = source.read(size)
        assert len(data) == size
        return data,offset
    palette,_ = member('/Users/bri/quaked/Hexen 2/data1/pak0.pak','gfx/palette.lmp')
    assert len(palette) == 768 and sha(palette) == target['paletteSha256']
    baseline = None;path_keys = set();content_keys = set();records = [];usage = [];counts = collections.Counter();orientation = collections.Counter()
    for p in target['provenance']:
        bsp,offset = member(p['source'],p['map']);assert offset == p['memberOffset'] and sha(bsp) == p['bspSha256']
        assert struct.unpack_from('<i',bsp)[0] == 29
        lumps = [struct.unpack_from('<II',bsp,4+i*8) for i in range(15)]
        t,tn = lumps[2];assert 0 <= p['slot'] < struct.unpack_from('<i',bsp,t)[0]
        at = t+struct.unpack_from('<i',bsp,t+4+4*p['slot'])[0]
        assert bsp[at:at+16].split(b'\0')[0] == b'ttex262' and struct.unpack_from('<II',bsp,at+16) == (64,64)
        mips = []
        for level in range(4):
            start = struct.unpack_from('<I',bsp,at+24+level*4)[0];n = (64>>level)**2
            assert start >= 40 and at+start+n <= t+tn;mips.append(bsp[at+start:at+start+n])
        if baseline is None:baseline = mips
        assert baseline == mips and sha(mips[0]) == target['indexedPixelSha256']
        ti,n = lumps[6];fo,fn = lumps[7];po,pn = lumps[1]
        assert n%40 == 0 and fn%20 == 0 and pn%20 == 0
        infos = {i:struct.unpack_from('<i',bsp,ti+i*40+36)[0] for i in range(n//40) if struct.unpack_from('<i',bsp,ti+i*40+32)[0] == p['slot']}
        assert set(infos.values()) == {0}
        faces = [i for i in range(fn//20) if struct.unpack_from('<H',bsp,fo+i*20+10)[0] in infos]
        assert len(faces) == p['faces'];counts[p['profile']] += len(faces)
        key = (p['source'],p['map'],p['slot']);assert key not in path_keys;path_keys.add(key)
        records.append({**p,'PAKSha256':before[p['source']],'fourMipSHA256':[sha(x) for x in mips],'ordinaryTexinfoFlags':sorted(infos.values())})
        content_key = (before[p['source']],p['map'],p['slot'])
        if content_key not in content_keys:
            content_keys.add(content_key);orients = collections.Counter();face_rows = []
            for index in faces:
                plane,side = struct.unpack_from('<HH',bsp,fo+index*20);assert plane < pn//20 and side in (0,1)
                normal = np.array(struct.unpack_from('<fff',bsp,po+plane*20),float)*(1 if side == 0 else -1)
                length = np.linalg.norm(normal);assert np.isfinite(normal).all() and abs(length-1)<1e-5;normal /= length
                z = float(normal[2]);eps = 1e-6
                cls = 'upwardHorizontal' if z >= 1-eps else 'downwardHorizontal' if z <= -1+eps else 'vertical' if abs(z) <= eps else 'upwardSloped' if z>0 else 'downwardSloped'
                orients[cls] += 1;orientation[cls] += 1;face_rows.append(dict(face=index,plane=plane,side=side,effectiveNormal=normal.tolist(),orientation=cls))
            usage.append(dict(map=p['map'],slot=p['slot'],bspSha256=p['bspSha256'],PAKSha256=before[p['source']],faces=len(faces),orientationCounts=dict(orients),faceRecords=face_rows))
    rgba = np.c_[np.frombuffer(palette,dtype='uint8').reshape(256,3)[np.frombuffer(baseline[0],dtype='uint8')],np.full(4096,255,dtype='uint8')].reshape(64,64,4)
    original = Path(target['selectedOriginal']['path']);im = Image.open(original)
    assert im.size == (64,64) and im.format == 'PNG' and im.convert('RGBA').tobytes() == rgba.tobytes()
    assert sha(rgba.tobytes()) == target['rgbaSha256'] and sha(original.read_bytes()) == target['selectedOriginal']['sha256']
    assert counts['portals-1'] == counts['portals-2'] == 488 and sum(counts.values()) == 976
    assert len(path_keys) == 8 and len(content_keys) == 4 and sum(orientation.values()) == 488
    assert all(file_sha(Path(p)) == digest for p,digest in before.items())
    native = write('native-proof.json',dict(schemaVersion=1,verdict='PASS source-only ttex262 nativeLow/all4mips/flags/palette/provenance; no native content peer',nativeIdentity=ID,name='ttex262',edition='portals',nativeDimensions=[64,64],original=witness(original),paletteSha256=sha(palette),indexedPixelSha256=sha(baseline[0]),rgbaSha256=sha(rgba.tobytes()),fourMipSHA256=[sha(x)for x in baseline],ordinaryFlags=[0],profileFaces=dict(counts),profileFaceSum=976,uniquePathMapSlots=8,uniquePAKContentMapSlots=4,uniqueContentFaceRecords=488,provenance=records,allNativeVariantsScreened=980,nativeRGBAPeers=[],nativeFullTuplePeers=[],archiveInputsStable=before,inputs=[witness(Path(__file__)),witness(DOC/'native-audit/inventory.json'),witness(ROOT/'tools/audit_hexen2_textures.mjs'),witness(ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json')],limits=['Native source only; no generated source/master/tier/ART/runtime acceptance.','Duplicate Portal installations count as8path observations but4content slots/488faces;976 is profile sum, not unique logical usage.'],completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat()))
    write('usage-orientation.json',dict(schemaVersion=1,verdict='PASS compiled local deduplicated usage observations; material identity remains interpretation',nativeIdentity=ID,sourceProof=native,totalUniqueContentFaces=488,orientationCounts=dict(orientation),uniqueContentSlots=4,maps=usage,rule='Side-adjusted normalized BSP plane; +/-Z within1e-6 horizontal, absZ<=1e-6 vertical, otherwise sign-separated slope',limits=['All native BSP faces, before visibility/brush-entity transforms. Counts are not surface-area weights, exclusive material use or runtime proof.']))

    # Current authoring metadata/Low screen, including retained Quake libraries.
    roots = [ROOT/'assets/authoring/texture_sheets/sources',ROOT/'tools/texture_sheets/sources']
    json_rows, hits, selections, errors = [], [], [], []
    for library in roots:
        if not library.exists():continue
        for file in sorted(library.rglob('*.json')):
            if BASE in file.parents:continue
            data = file.read_bytes();json_rows.append({'file':str(file.relative_to(ROOT)),'sha256':sha(data)})
            try:obj = json.loads(data)
            except (ValueError,UnicodeDecodeError) as error:
                errors.append({'file':str(file.relative_to(ROOT)),'error':repr(error)});continue
            if any(value.encode() in data for value in (ID,target['rgbaSha256'],'ttex262')):
                hits.append({'file':str(file.relative_to(ROOT)),'sha256':sha(data),'scope':'Potential identifier/name/RGBA association requires inspection'})
            if file.name.startswith('selection') or file.name == 'native-selection.json':
                if isinstance(obj,dict):
                    for row in obj.get('items',[]):
                        native_id = row.get('id',row.get('nativeIdentity'))
                        if isinstance(native_id,dict):native_id = native_id.get('id')
                        if native_id == ID:selections.append({'file':str(file.relative_to(ROOT)),'item':row})
    image_rows, image_matches = [], []
    total_images = 0
    for library in roots:
        if not library.exists():continue
        for file in sorted(library.rglob('*')):
            if BASE in file.parents or file.suffix.lower() not in ('.png','.webp','.jpg','.jpeg'):continue
            total_images += 1
            try:
                with Image.open(file) as candidate:
                    if candidate.size != (64,64):continue
                    digest = sha(candidate.convert('RGBA').tobytes());row = {'file':str(file.relative_to(ROOT)),'fileSha256':sha(file.read_bytes()),'rgbaSha256':digest};image_rows.append(row)
                    if digest == target['rgbaSha256']:image_matches.append(row)
            except (OSError,ValueError) as error:errors.append({'file':str(file.relative_to(ROOT)),'error':repr(error)})
    assert not errors, 'Retained screen errors require resolution'
    assert not selections and not image_matches and not hits, 'Retained candidate/selection match requires reuse investigation'
    queue_path = ROOT/'docs/hexen2/textures/world-queue.csv';queue = list(csv.DictReader(queue_path.open()));queue_row, = [row for row in queue if row['native_id'] == ID];assert queue_row['state'] == 'pending'
    current_bytes = catalog_path.read_bytes();current = json.loads(current_bytes);assert ID not in {row['id']for row in current['materials']}
    write('retained-source-screen.json',dict(schemaVersion=1,verdict='PASS currently missing/unselected target; no retained metadata or64square native-pixel association found in screened authoring libraries',target=ID,queueRow=queue_row,sourceProof=native,nativeVariantCount=980,nativeRGBAPeers=[],fullTuplePeers=[],catalogBefore={'file':str(catalog_path.relative_to(ROOT)),'sha256':sha(catalog_bytes),'bindings':len(catalog['materials'])},catalogAfter={'sha256':sha(current_bytes),'bindings':len(current['materials']),'targetStillUnregistered':True},jsonFilesScreened=len(json_rows),selectionHits=selections,identifierNameRGBAHits=hits,imageMetadataFilesScreened=total_images,native64SquareImagesDecoded=len(image_rows),nativeRGBAMatches=image_matches,errors=errors,jsonInputs=json_rows,imageInputs=image_rows,limits=['Screen covers current retained source libraries and exact native/name/identity associations; it is not a semantic visual comparison of every unbound generated photograph.','Catalog hashes/counts are observations, not future invariants; root may register other authorized materials.','No generation, master, tiers, provider or shared registry/queue change.'],completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat()))
    print(json.dumps(dict(nativeProof=native,logicalFaces=488,orientationCounts=dict(orientation),retainedMetadataFiles=len(json_rows),nativeImagesDecoded=len(image_rows),hits=len(hits),selectionHits=len(selections))))


if __name__ == '__main__':main()
