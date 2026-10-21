#!/usr/bin/env python3
"""Independent bounded proof; read only PAK/source files, write one JSON receipt.
Not a full campaign inventory, image master proof, or art/relief acceptance.
"""
import argparse, datetime, hashlib, json, struct
from pathlib import Path
from PIL import Image

NAMES = ('cop2_5', 'church1', 'maya1_9', 'metal9_4')
def digest(data): return hashlib.sha256(data).hexdigest()
def file_sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()
def canonical_id(source):
    return digest(json.dumps(source,sort_keys=True,separators=(',',':')).encode())
def require(condition, message):
    if not condition: raise ValueError(message)
class Pak:
    def __init__(self,path):
        self.path=Path(path); self.real=self.path.resolve(strict=True); self.size=self.path.stat().st_size
        with self.path.open('rb') as f:
            header=f.read(12); require(len(header)==12 and header[:4]==b'PACK','invalid PACK header')
            off,length=struct.unpack_from('<II',header,4)
            require(length%64==0 and length<=16*1024*1024 and off>=12 and off+length<=self.size,'invalid PACK directory')
            f.seek(off); directory=f.read(length); require(len(directory)==length,'truncated PACK directory')
        self.members={}
        for i in range(0,length,64):
            row=directory[i:i+64]; name=row[:56].split(b'\0',1)[0].decode('ascii').lower(); at,n=struct.unpack_from('<II',row,56)
            require(name not in self.members and at+n<=self.size,'invalid/duplicate PACK member')
            self.members[name]=(at,n)
        self.proof={'path':str(self.path),'resolvedPath':str(self.real),'bytes':self.size,'sha256':file_sha(self.path),'directoryOffset':off,'directoryBytes':length,'directorySha256':digest(directory),'memberCount':len(self.members)}
    def read(self,name):
        at,n=self.members[name]
        with self.path.open('rb') as f: f.seek(at); data=f.read(n)
        require(len(data)==n,'short member read'); return data
    def member_proof(self,name):
        at,n=self.members[name]; return {'name':name,'pack':str(self.path),'resolvedPack':str(self.real),'offset':at,'bytes':n}

def parse_native(b,slot):
    version=struct.unpack_from('<I',b)[0]; require(version in (29,0x32505342,0x42535032),'unsupported BSP version')
    require(len(b)>=124,'short BSP header')
    def lump(index):
        at,n=struct.unpack_from('<ii',b,4+index*8);require(at>=0 and n>=0 and at+n<=len(b),'invalid BSP lump');return b[at:at+n]
    tex=lump(2); require(len(tex)>=4,'short texture lump');count=struct.unpack_from('<i',tex)[0]
    require(0<=count<=4096 and 4+count*4<=len(tex) and 0<=slot<count,'invalid texture count/slot')
    off=struct.unpack_from('<i',tex,4+slot*4)[0]; require(off>=4+count*4 and off+40<=len(tex),'invalid texture header')
    name=tex[off:off+16].split(b'\0',1)[0].decode('latin1'); w,h,*mips=struct.unpack_from('<6I',tex,off+16)
    require(w>0 and h>0 and w*h<=16*1024*1024 and w%8==0 and h%8==0,'invalid WORLD dimensions')
    data=[];proof=[];ranges=[]
    for level,at in enumerate(mips):
        mw,mh=w>>level,h>>level;n=mw*mh
        require(at>=40 and off+at+n<=len(tex),'invalid mip range')
        for lo,hi in ranges:require(at+n<=lo or at>=hi,'overlapping mip levels')
        ranges.append((at,at+n)); pixels=tex[off+at:off+at+n]; data.append(pixels)
        proof.append({'level':level,'dimensions':[mw,mh],'offsetFromMiptex':at,'bytes':n,'indexedSha256':digest(pixels)})
    ti=lump(6);faces=lump(7);stride=20 if version==29 else 28
    require(len(ti)%40==0 and len(faces)%stride==0,'invalid texinfo/faces alignment')
    infos=[]
    for at in range(0,len(ti),40):
        idx,flags=struct.unpack_from('<ii',ti,at+32)
        if idx==slot:infos.append({'index':at//40,'flags':flags,'vectorsSha256':digest(ti[at:at+32])})
    used={};totalfaces=0
    for at in range(0,len(faces),stride):
        info=struct.unpack_from('<H' if version==29 else '<i',faces,at+(10 if version==29 else 16))[0]
        require(0<=info<len(ti)//40,'invalid face texinfo index')
        idx,flags=struct.unpack_from('<ii',ti,info*40+32)
        if idx==slot:used[flags]=used.get(flags,0)+1;totalfaces+=1
    return {'name':name,'dimensions':[w,h],'mips':proof,'texinfo':infos,'materialFlags':sorted({x['flags'] for x in infos}),'faceUsedFlags':[{'flags':f,'faces':n} for f,n in sorted(used.items())],'directFaces':totalfaces,'bspVersion':version},data

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[3]);ap.add_argument('--inventory',default='docs/evidence/quake-textures-2026-10-20/legacy-baseline/inventory.json');ap.add_argument('--output',default='docs/quake/textures/batch-001-native-source-proof.json');args=ap.parse_args();root=args.root.resolve()
    inventory_path=root/args.inventory;inventory=json.loads(inventory_path.read_text());require(not inventory['errors'],'baseline has errors')
    selected={name:[row for row in inventory['variants'] if row['name']==name] for name in NAMES}
    packs={};maps={}
    def pak(path):
        if path not in packs:packs[path]=Pak(path)
        return packs[path]
    rows=[]
    for name in NAMES:
        image_dir=root/'assets/authoring/texture_sheets/sources/official-world-2026-10-17';tool_dir=root/'tools/texture_sheets/sources/official-world-2026-10-17'
        original=image_dir/('native-'+name+'.png');raw=image_dir/(name+'-generated-v1.png');prompt=tool_dir/(name+'-photographic-prompt-v1.txt')
        with Image.open(original) as image: native_dims=list(image.size);native_rgba=image.convert('RGBA').tobytes()
        with Image.open(raw) as image:raw_dims=list(image.size);mode=image.mode
        require(raw_dims[0]>=native_dims[0]*8 and raw_dims[1]>=native_dims[1]*8 and raw_dims[0]*native_dims[1]==raw_dims[1]*native_dims[0],'raw below8x or wrong aspect')
        require(mode=='RGB','raw not canonical RGB');require(prompt.stat().st_size>0,'empty retained prompt')
        occurrences=[];identities={}
        for legacy in selected[name]:
            for use in legacy['uses']:
                order=inventory['games'][use['game']]['packs'];search={}
                for path in order:
                    current=pak(path)
                    for member in current.members: search[member]=current
                actual=search[use['map']];require(actual.real==Path(use['pack']).resolve(),'effective map precedence mismatch')
                mapkey=(str(actual.real),use['map'])
                if mapkey not in maps:maps[mapkey]=actual.read(use['map'])
                bsp=maps[mapkey];parsed,mips=parse_native(bsp,use['slot']);require(parsed['name']==name,'native name mismatch')
                palette_pack=search['gfx/palette.lmp'];palette=palette_pack.read('gfx/palette.lmp');require(len(palette)==768,'invalid palette')
                rgba=bytearray()
                for idx in mips[0]:rgba.extend(palette[idx*3:idx*3+3]);rgba.append(255)
                rgba=bytes(rgba)
                identity={'name':name,'dimensions':parsed['dimensions'],'paletteSha256':digest(palette),'indexedSha256':digest(mips[0]),'rgbaSha256':digest(rgba),'mipIndexedSha256':[digest(x) for x in mips],'materialFlags':parsed['materialFlags'],'nativeSemantics':{'family':'ordinary-world','alphaIndex255':False,'fullbrightStart':224,'fullbrightMaskSha256':digest(bytes(255 if x>=224 else 0 for x in mips[0]))}}
                nativeid=canonical_id(identity);match=parsed['dimensions']==native_dims and rgba==native_rgba
                # Preserve same-name sibling observations; only matching native is selected.
                record={'game':use['game'],'map':use['map'],'slot':use['slot'],'scope':use['scope'],'legacyId':legacy['id'],'nativeId':nativeid,'matchesRetainedOriginal':match,'bspSha256':digest(bsp),'mapMember':actual.member_proof(use['map']),'paletteMember':palette_pack.member_proof('gfx/palette.lmp'),'mountOrder':order,**parsed}
                occurrences.append(record);identities.setdefault(nativeid,{'id':nativeid,'identity':identity,'matchesRetainedOriginal':match,'occurrences':0})['occurrences']+=1
                require(digest(rgba)==legacy['pixelSha256'],'baseline RGBA SHA mismatch');require(parsed['dimensions']==[legacy['width'],legacy['height']],'baseline dimensions mismatch')
                require(parsed['directFaces']==use['faces'],'baseline face count mismatch')
        require(any(x['matchesRetainedOriginal'] for x in occurrences),'no exact original source')
        matching=[x for x in identities.values() if x['matchesRetainedOriginal']]
        require(len(matching)==1,'retained original maps to multiple full-native identities; preserve variants and resolve before binding')
        rows.append({'name':name,'id':matching[0]['id'],'nativeDimensions':native_dims,'verdict':'PASS bounded native-source and retained-raw/prompt dimension proof only','original':str(original.relative_to(root)),'originalSha256':file_sha(original),'rgbaSha256':digest(native_rgba),'raw':str(raw.relative_to(root)),'rawSha256':file_sha(raw),'rawDimensions':raw_dims,'rawMode':mode,'adequateFor8x':True,'prompt':str(prompt.relative_to(root)),'promptSha256':file_sha(prompt),'sourceIdentities':list(identities.values()),'occurrences':occurrences})
    out=root/args.output
    report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'PASS bounded native source proof','scope':'Four retained originals and their current effective pak0 baseline occurrences. Independent raw indexed/palette/RGBA/all4 mips/texinfo flags/provenance reconstruction. No full-family completeness, RGB master, scalar relief, final tier, art or runtime acceptance.','workspace':str(root),'identityRule':'SHA256 of UTF8 JSON sorted named keys, compact comma/colon separators; identity contains name, dimensions, palette/indexed/RGBA hashes, all4 mip indexed hashes, material flag set and native family/alpha/fullbright semantics. Renderer legacy keys are locators only.','inventory':str(inventory_path.relative_to(root)),'inventorySha256':file_sha(inventory_path),'verifier':str(Path(__file__).resolve().relative_to(root)),'verifierSha256':file_sha(__file__),'counts':{'materials':len(rows),'selectedFullNativeIdentities':sum(sum(1 for s in x['sourceIdentities'] if s['matchesRetainedOriginal']) for x in rows),'physicalOccurrences':sum(len(x['occurrences']) for x in rows),'embeddedMipObservations':sum(len(x['occurrences'])*4 for x in rows),'sameNameNonmatchingIdentities':sum(sum(1 for s in x['sourceIdentities'] if not s['matchesRetainedOriginal']) for x in rows)},'packs':[p.proof for p in packs.values()],'items':rows,'limits':['Baseline locator scope contains effective current pak0 sources only. No independent enumeration of every physical native texture or non-WORLD family.','Full archive hashes bind current PAK bytes; bounded member reads reconstruct only selected maps and palettes.','The identity includes actual semantic flag sets, not UV vectors. Each occurrence retains vectors hashes separately; identical source does not imply identical per-face UV scale.','Returned source adequacy confirms dimensions/aspect/RGB only, never art/material/tiling acceptance.','Installed dm7 occurrence retained with installed-extra-review scope; not promoted to stock base campaign.']}
    require(not out.exists(),'refuse overwriting existing receipt');out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'receipt':str(out),'sha256':file_sha(out),'counts':report['counts'],'ids':{r['name']:r['id'] for r in rows}},indent=2))
if __name__=='__main__':main()
