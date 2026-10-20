"""Selected native content usage, reusing the existing side-adjusted plane rule.

Compiled local face counts are contextual evidence only. They do not prove
thatch versus vegetation, visible area, entity transforms or runtime acceptance.
"""
import collections,datetime,hashlib,json,pathlib,struct
import numpy as np
R=pathlib.Path.cwd();D=R/'docs/hexen2/textures/parallel-2026-10-20/stream-11-rtex388'
source=D/'native-and-peer-proof.json';proof=json.loads(source.read_text())
sha=lambda b:hashlib.sha256(b).hexdigest()
rows=[]
for variant in proof['variants']:
    seen=set();records=[];totals=collections.Counter()
    for occurrence in variant['provenance']:
        key=(occurrence['bspSha256'],occurrence['slot'])
        if key in seen:continue
        seen.add(key)
        with open(occurrence['source'],'rb') as f:
            header=f.read(12);magic,off,n=struct.unpack('<4sII',header);assert magic==b'PACK'
            f.seek(off);table=f.read(n)
            directory={table[i:i+56].split(b'\0')[0].decode('ascii').lower():struct.unpack_from('<II',table,i+56) for i in range(0,n,64)}
            offset,size=directory[occurrence['map']];f.seek(offset);bsp=f.read(size)
        assert offset==occurrence['memberOffset'] and sha(bsp)==occurrence['bspSha256']
        lumps=[struct.unpack_from('<II',bsp,4+i*8) for i in range(15)]
        ti,tn=lumps[6];fo,fn=lumps[7];po,pn=lumps[1]
        assert tn%40==0 and fn%20==0 and pn%20==0
        infos={i for i in range(tn//40) if struct.unpack_from('<i',bsp,ti+i*40+32)[0]==occurrence['slot']}
        faces=[];counts=collections.Counter()
        for index in range(fn//20):
            at=fo+index*20
            if struct.unpack_from('<H',bsp,at+10)[0] not in infos:continue
            plane,side=struct.unpack_from('<HH',bsp,at);assert plane<pn//20 and side in (0,1)
            normal=np.array(struct.unpack_from('<fff',bsp,po+plane*20),dtype=float)*(1 if side==0 else -1)
            length=float(np.linalg.norm(normal));assert np.isfinite(normal).all() and abs(length-1)<1e-5
            normal/=length;z=float(normal[2]);eps=1e-6
            orientation='upwardHorizontal' if z>=1-eps else 'downwardHorizontal' if z<=-1+eps else 'vertical' if abs(z)<=eps else 'upwardSloped' if z>0 else 'downwardSloped'
            counts[orientation]+=1;totals[orientation]+=1
            faces.append(dict(face=index,plane=plane,side=side,effectiveNormal=normal.tolist(),orientation=orientation))
        assert len(faces)==occurrence['faces']
        records.append(dict(map=occurrence['map'],bspSha256=occurrence['bspSha256'],slot=occurrence['slot'],
            path=occurrence['source'],counts=dict(counts),faces=faces))
    rows.append(dict(nativeIdentity=variant['nativeIdentity'],name=variant['name'],uniqueBSPContentSlots=len(seen),
        totalUniqueContentFaceRecords=sum(totals.values()),orientationCounts=dict(totals),maps=records))
out=dict(schemaVersion=1,verdict='PASS compiled local usage-orientation observations; material interpretation remains uncertain',
    rule='Plane normal times(-1 if face.side else1), normalized. Up/down horizontal at +/-Z within1e-6, vertical abs(z)<=1e-6, otherwise sign-separated sloped.',
    reusedContract='docs/hexen2/textures/batch-007-public-verify-source-usage-v2.py',
    sourceProof=dict(file=str(source.relative_to(R)),sha256=sha(source.read_bytes())),variants=rows,
    limits=['Face counts include all native BSP faces, before visibility or brush-entity runtime transforms.',
        'Not surface-area weights. Duplicate BSP content/profile observations collapsed, including identical Portal installations.',
        'Floor/roof/wall usage can contextualize a fibrous material but does not establish botanical species or prove roof-only/ground-only intent.'],
    completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
p=D/'usage-orientation.json'
with p.open('x') as f:f.write(json.dumps(out,indent=2)+'\n')
print(json.dumps([dict(name=v['name'],total=v['totalUniqueContentFaceRecords'],counts=v['orientationCounts']) for v in rows]))
