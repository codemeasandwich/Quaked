#!/usr/bin/env python3
"""Author the enhanced START passage from Romero's original source archive.

Usage: python3 tools/build_start_corridor.py SOURCE.zip ERICW_BIN [OUTPUT_DIR]
Reads owned pak0.pak for original textures; never changes it or newer.pak.
The original source release notice is in tools/maps/quake-source-release.txt.
"""
import hashlib, json, re, struct, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def blocks(text):
    depth = 0
    result = []
    for token in re.finditer(r'[{}]', text):
        if token[0] == '{':
            if depth == 0: start = token.start()
            depth += 1
        else:
            depth -= 1
            if depth == 0: result.append(text[start:token.end()])
    assert depth == 0
    return result

def face(a, b, c, texture='TECH08_1 64 208 0 1 1'):
    return ' '.join('( '+' '.join(str(v) for v in p)+' )' for p in (a,b,c))+' '+texture

def prism(points, y0, y1, texture='TECH08_1 64 208 0 1 1'):
    # Counter-clockwise X/Z contour. Quake's face winding points inward.
    p = [(x,y0,z) for x,z in points]; q = [(x,y1,z) for x,z in points]
    lines = [face(p[2],p[1],p[0],texture),face(q[0],q[1],q[2],texture)]
    for i in range(len(p)):
        j=(i+1)%len(p); lines.append(face(p[i],p[j],q[j],texture))
    return '{\n'+'\n'.join(lines)+'\n}'

def box(x0,x1,y0,y1,z0,z1,texture='TECH08_1 64 208 0 1 1'):
    return prism([(x0,z0),(x1,z0),(x1,z1),(x0,z1)],y0,y1,texture)

def author(source):
    entities=blocks(source); world=entities[0]; brushes=blocks(world[1:-1]); prefix=world[1:world.index('{',1)]
    assert len(brushes)>270 and '+0SLIP' in brushes[256] and 'TLIGHT08' in brushes[269]
    assert '( -128 1600 232 )' in brushes[256] and '( 48 1464 96 )' in brushes[269]
    # Six pieces retain the original back wall and its sixteen-unit thickness.
    opening=[box(-176,-136,1456,1472,0,336),box(8,48,1456,1472,0,336),
        box(-136,8,1456,1472,0,80),box(-136,8,1456,1472,176,336),
        prism([(-136,144),(-104,176),(-136,176)],1456,1472),
        prism([(-24,176),(8,144),(8,176)],1456,1472)]
    # Closed short stub: keeps the map sealed, with a traversable floor behind
    # the opening and a real back cap beyond the seamless threshold.
    stub=[box(-152,24,1392,1472,64,80,'SFLOOR4_2 0 0 0 1 1'),
        box(-152,-136,1392,1456,80,192),box(8,24,1392,1456,80,192),
        box(-136,8,1392,1456,176,192),box(-152,24,1376,1392,64,192),
        prism([(-136,144),(-104,176),(-136,176)],1392,1456),
        prism([(-24,176),(8,144),(8,176)],1392,1456)]
    kept=[]
    for i,brush in enumerate(brushes):
        if 256<=i<=266: continue
        kept.extend(opening if i==269 else [brush])
    entities[0]='{'+prefix+'\n"_newer_start_corridor" "1"\n'+'\n'.join(kept+stub)+'\n}'
    changed=0
    for i,e in enumerate(entities[1:],1):
        if re.search(r'"map"\s+"e1m1"',e):
            entities[i]='{\n"classname" "trigger_changelevel"\n"map" "e1m1"\n"spawnflags" "1"\n"_seamless_oneway" "1"\n'+box(-136,8,1432,1440,80,176,'TRIGGER 0 0 0 1 1')+'\n}'; changed+=1
        elif re.search(r'"classname"\s+"ambient_drone"',e) and re.search(r'"origin"\s+"-70 1626 160"',e):
            # Keep entity ordering for other native brush identities.
            entities[i]='{\n"classname" "info_null"\n"origin" "-70 1626 160"\n}'; changed+=1
        elif 'Walk into the Slipgate\\nto start playing Quake!' in e and '-120 1792' in e:
            entities[i]=e.replace('Walk into the Slipgate\\nto start playing Quake!','Walk through the corridor\\nto start playing Quake!'); changed+=1
    assert changed==3, changed
    result='\n'.join(entities)+'\n'
    result=re.sub(r'"wad"\s+"[^"]+"','"wad" "start.wad"',result,count=1)
    # BSP texture names must continue to match the existing native art index.
    result=re.sub(r'(\)\s+)(\S+)(\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+)',lambda m:m[1]+m[2].lower()+m[3],result)
    return result

def texture_wad(pak):
    data=pak.read_bytes(); start,size=struct.unpack_from('<ii',data,4)
    for o in range(start,start+size,64):
        name,offset,length=struct.unpack_from('<56sii',data,o)
        if name.split(b'\0')[0]==b'maps/start.bsp': bsp=data[offset:offset+length];break
    else: raise ValueError('pak0 lacks native START')
    off,size=struct.unpack_from('<ii',bsp,4+2*8); count=struct.unpack_from('<i',bsp,off)[0]
    wad=bytearray(b'WAD2'+b'\0'*8); entries=[]
    for i in range(count):
        t=struct.unpack_from('<i',bsp,off+4+i*4)[0]
        if t<0:continue
        name,w,h=struct.unpack_from('<16sii',bsp,off+t); length=40+w*h*85//64
        entries.append(struct.pack('<iiiBBBB16s',len(wad),length,length,68,0,0,0,name));wad+=bsp[off+t:off+t+length]
    struct.pack_into('<ii',wad,4,len(entries),len(wad));wad+=b''.join(entries);return wad

def main():
    archive=Path(sys.argv[1]); tools=Path(sys.argv[2]).resolve(); out=Path(sys.argv[3] if len(sys.argv)>3 else ROOT/'newer/maps').resolve();out.mkdir(parents=True,exist_ok=True)
    source=zipfile.ZipFile(archive).read('START.MAP');text=source.decode('ascii')
    assert hashlib.sha256(source).hexdigest()=='1d680d5a0ac05d3aabffd8f18161a87ab7d9e8a2850abc17b5ff6324e3d18e1f', 'Unexpected original START source; re-audit brush identities'
    (out/'start.map').write_text(author(text));(out/'start.wad').write_bytes(texture_wad(ROOT/'pak0.pak'))
    commands=[['qbsp','-leaktest','-nopercent','start.map'],['vis','-threads','2','start.bsp'],['light','-threads','2','start.bsp']]
    with (out/'start-build.log').open('w') as log:
        for name,*args in commands: subprocess.run([str(tools/name),*args],cwd=out,stdout=log,stderr=subprocess.STDOUT,check=True)
    bsp=(out/'start.bsp').read_bytes()
    (out/'maps.pak').write_bytes(b'PACK'+struct.pack('<ii',12+len(bsp),64)+bsp+struct.pack('<56sii',b'maps/start.bsp',12,len(bsp)))
    (out/'start-source.json').write_text(json.dumps({'source_url':'https://rome.ro/s/quake_map_source.zip','original_map_sha256':hashlib.sha256(source).hexdigest(),'compiler':'ericw-tools v0.18.1','commands':commands,'output_sha256':hashlib.sha256(bsp).hexdigest()},indent=2)+'\n')

if __name__=='__main__': main()
