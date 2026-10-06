#!/usr/bin/env python3
"""Fit one supplied Vore body atlas through the existing UV/height pipeline.

Reads only the named native PAK members. Never copies native texture pixels
into the output; source anatomy and existing edge extension supply every UV.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image, ImageDraw
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
from update_head_skins import fit, uv_footprint
from update_enemy_heights import height_for

SOURCE_SHA = 'f702e38e2e415eb791734b43f8f79a6d28f8f9a873c392584252f3a66c6faabc'
MODEL_SHA = 'da3dddbf592c05ce0c0340cc2eea842f28b5dcb9c0c03946abfb225c0b0a54ee'
PARTS = [dict(name='front connected body', src=[10,8,500,930], dst=[3,3,103,192], seed=[255,350]),
         dict(name='back connected body', src=[526,10,1012,931], dst=[109,3,209,192], seed=[768,350])]

def member(path, name):
    with path.open('rb') as stream:
        header = stream.read(12)
        if header[:4] != b'PACK':
            raise ValueError('Native input is not a PAK')
        offset, length = struct.unpack('<II', header[4:])
        if length % 64 or length > 16 * 1024 * 1024:
            raise ValueError('Invalid PAK directory')
        stream.seek(offset)
        directory = stream.read(length)
        for at in range(0, length, 64):
            raw, pos, size = struct.unpack('<56sII', directory[at:at+64])
            if raw.split(b'\0', 1)[0].decode('ascii') == name:
                if size > 2 * 1024 * 1024:
                    raise ValueError('Unexpected native member size')
                stream.seek(pos)
                data = stream.read(size)
                if len(data) != size:
                    raise ValueError('Truncated native member')
                return data
    raise ValueError('Missing native member: ' + name)

def connected_body(piece, seed):
    rgb = np.asarray(piece, dtype=np.int16)
    warm = ((rgb[:,:,0]-rgb[:,:,1]>3)|(rgb[:,:,0]-rgb[:,:,2]>6)) & (rgb.max(2)>16)
    component = Image.fromarray((warm*255).astype(np.uint8)).copy()
    x, y = seed
    if not warm[y,x]:
        points = np.argwhere(warm)
        if not len(points):
            raise ValueError('No supplied body island')
        y,x = points[np.argmin((points[:,0]-y)**2+(points[:,1]-x)**2)]
    ImageDraw.floodfill(component,(int(x),int(y)),128)
    body = np.asarray(component)==128
    if body.mean()<.2:
        raise ValueError('Incomplete connected body')
    # Preserve enclosed dark anatomy; exclude detached claws and mouth inset.
    framed=Image.new('L',(piece.width+2,piece.height+2),0)
    framed.paste(Image.fromarray((body*255).astype(np.uint8)),(1,1))
    ImageDraw.floodfill(framed,(0,0),128)
    return np.asarray(framed)[1:-1,1:-1]!=128

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--pack',type=Path,required=True)
    parser.add_argument('--out',type=Path,default=ROOT/'newer/enemies/shalrath/custom')
    args=parser.parse_args()
    source_bytes=args.source.read_bytes()
    if hashlib.sha256(source_bytes).hexdigest()!=SOURCE_SHA:
        raise ValueError('Supplied Vore source changed; review the recipe')
    data=member(args.pack,'progs/shalrath.mdl')
    if hashlib.sha256(data).hexdigest()!=MODEL_SHA:
        raise ValueError('Native body identity differs from this UV recipe')
    width,height=struct.unpack('<2i',data[52:60])
    if (width,height)!=(212,195):
        raise ValueError('Unexpected native atlas dimensions')
    original=Image.open(args.source).convert('RGB')
    cleaned=Image.new('RGB',original.size,(0,0,0));components=[]
    for part in PARTS:
        piece=original.crop(part['src']);body=connected_body(piece, [part['seed'][0]-part['src'][0],part['seed'][1]-part['src'][1]])
        pixels=np.asarray(piece).copy();pixels[~body]=0
        cleaned.paste(Image.fromarray(pixels),(part['src'][0],part['src'][1]))
        components.append(dict(name=part['name'],body_pixels=int(body.sum())))
    blank=Image.new('RGB',(width,height),(0,0,0))
    spec=dict(parts=PARTS,background=[0,0,0])
    result,coverage=fit(blank,cleaned,spec,data,5,10)
    footprint=uv_footprint(data,5)
    if (np.max(np.asarray(result),2)[footprint]==0).any():
        raise ValueError('Unresolved black matte on native UV surface')
    args.out.mkdir(parents=True,exist_ok=True)
    result.save(args.out/'diffuse.webp','WEBP',lossless=True,method=6)
    height_for(result,args.out/'height.webp','shalrath/custom')
    report=dict(schema=1,model='progs/shalrath.mdl',nativeModelSha256=MODEL_SHA,
                source=args.source.name,sourceSha256=SOURCE_SHA,skin=0,skinFrame=0,
                factor=5,dimensions=list(result.size),parts=PARTS,components=components,
                fit=coverage,darkSuppliedSurfaceSamples=int((np.max(np.asarray(result),2)[footprint]<=9).sum()),nativeTexturePixelsUsed=0,separateHead='Unchanged native h_shal model/skin',
                normalProfile=dict(strength=.65,cap=.55),
                reuse=['update_head_skins.fit','fit_skin.spread','uv_footprint','height_for'],
                files={name:hashlib.sha256((args.out/name).read_bytes()).hexdigest()
                       for name in ['diffuse.webp','height.webp']})
    (args.out/'SOURCE.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__=='__main__':
    main()
