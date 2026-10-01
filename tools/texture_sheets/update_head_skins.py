#!/usr/bin/env python3
"""Fit four supplied head/gib atlases without changing model UVs or other assets.
Requires Pillow/NumPy: python3 tools/texture_sheets/update_head_skins.py
Source bytes, island bounds, backdrop and output scale are recorded in the recipe.
"""
import hashlib
import json
from pathlib import Path
import struct
import sys
sys.dont_write_bytecode=True
import numpy as np
from PIL import Image,ImageDraw
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
sys.path.insert(0,str(HERE))
from make_sheets import read_pak
from fit_skin import spread
from update_enemy_heights import native_skins, height_for


def foreground(piece, background):
    rgb=np.asarray(piece,dtype=np.int16)
    mask=(np.max(np.abs(rgb-np.asarray(background)),axis=2)>9) & ((rgb[:,:,0]>rgb[:,:,1]+2)|(rgb[:,:,0]>rgb[:,:,2]+5))
    # Fill enclosed dark tissue, without including the outside screenshot matte.
    framed=Image.new('L',(piece.width+2,piece.height+2),0)
    framed.paste(Image.fromarray((mask*255).astype('uint8')),(1,1))
    ImageDraw.floodfill(framed,(0,0),128)
    return np.asarray(framed)[1:-1,1:-1]!=128


def uv_footprint(data,factor):
    skins,width,height=struct.unpack('<3i',data[48:60]);vertices,triangles=struct.unpack('<2i',data[60:68]);pos=84
    for _ in range(skins):
        grouped=struct.unpack('<i',data[pos:pos+4])[0];pos+=4;count=1
        if grouped:count=struct.unpack('<i',data[pos:pos+4])[0];pos+=4+4*count
        pos+=count*width*height
    uv=np.frombuffer(data[pos:pos+vertices*12],dtype='<i4').reshape(vertices,3);pos+=vertices*12
    tris=np.frombuffer(data[pos:pos+triangles*16],dtype='<i4').reshape(triangles,4)
    mask=Image.new('L',(width*factor,height*factor),0);draw=ImageDraw.Draw(mask)
    for front,*indices in tris:
        points=[((uv[v,1]+.5+(width/2 if not front and uv[v,0] else 0))*factor,(uv[v,2]+.5)*factor) for v in indices]
        draw.polygon(points,fill=255)
    return np.asarray(mask)>0


def fit(original,source,spec,data,factor,bleed):
    canvas=np.asarray(original.resize((original.width*factor,original.height*factor),Image.Resampling.LANCZOS)).copy()
    painted=np.zeros(canvas.shape[:2],bool)
    matte_seed_pixels=0
    for part in spec['parts']:
        piece=source.crop(part['src']);mask=foreground(piece,spec['background'])
        # Enclosed voids are not tissue seeds: exclude screenshot matte before
        # spreading so every carried/filtering colour comes from supplied art.
        source_distance=np.max(np.abs(np.asarray(piece,dtype=np.int16)-np.asarray(spec['background'])),axis=2)
        mask &= source_distance>9
        matte_seed_pixels += int((mask & (source_distance<=9)).sum())
        if mask.mean()<.12:raise ValueError('Incomplete source island: '+part['name'])
        pixels,_=spread(np.asarray(piece),mask,20)
        l,t,r,b=[v*factor for v in part['dst']];size=(r-l,b-t)
        pixels=np.asarray(Image.fromarray(pixels).resize(size,Image.Resampling.LANCZOS))
        mask=np.asarray(Image.fromarray((mask*255).astype('uint8')).resize(size,Image.Resampling.NEAREST))>0
        padded=np.pad(pixels,((bleed,bleed),(bleed,bleed),(0,0)),'edge')
        padded_mask=np.pad(mask,((bleed,bleed),(bleed,bleed)),constant_values=False)
        padded,extended=spread(padded,padded_mask,bleed)
        x0,y0=l-bleed,t-bleed
        cl,ct=max(0,x0),max(0,y0);cr,cb=min(canvas.shape[1],r+bleed),min(canvas.shape[0],b+bleed)
        sx,sy=cl-x0,ct-y0;local=extended[sy:sy+cb-ct,sx:sx+cr-cl]
        target=canvas[ct:cb,cl:cr];target[local]=padded[sy:sy+cb-ct,sx:sx+cr-cl][local]
        painted[ct:cb,cl:cr] |= local
    footprint=uv_footprint(data,factor)
    # Enclosed screenshot-colour voids can survive foreground hole filling.
    # Reject them on actual model surfaces and carry nearby supplied tissue
    # colours instead of baking a backdrop fleck into a triangle.
    matte=np.max(np.abs(canvas.astype(np.int16)-np.asarray(spec['background'])),axis=2)<=9
    if spec['background'][2]>spec['background'][0]+10:painted[matte & footprint]=False
    # Burgundy can also be a legitimate mixture of dark blood colours; source
    # seed provenance and model review distinguish it from the screenshot matte.
    carried,coverage=spread(canvas,painted,32)
    missing=footprint & ~painted
    if (footprint & ~coverage).any():raise ValueError('Visible UV pixels have no supplied colour')
    canvas[missing]=carried[missing]
    # Additional supplied-colour padding around visible UVs keeps screenshot
    # backgrounds out of mip/filter samples; only unmapped atlas areas retain originals.
    contour=np.pad(footprint,((2,2),(2,2)));around=np.zeros_like(footprint)
    for dy in range(5):
        for dx in range(5):around |= contour[dy:dy+footprint.shape[0],dx:dx+footprint.shape[1]]
    canvas[around & coverage & ~painted]=carried[around & coverage & ~painted]
    if spec['background'][2]>spec['background'][0]+10:
        # Averaging neighbouring skin colours can accidentally reproduce a
        # slate matte value. Resolve those few visible flecks with one actual
        # nearby supplied-colour donor, never a newly averaged backdrop colour.
        bad=(np.max(np.abs(canvas.astype(np.int16)-np.asarray(spec['background'])),axis=2)<=9)&footprint
        for _ in range(16):
            if not bad.any():break
            valid=(np.max(np.abs(canvas.astype(np.int16)-np.asarray(spec['background'])),axis=2)>9)&coverage
            for dy,dx in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,1),(-1,1),(1,-1)]:
                donor=np.roll(np.roll(valid,dy,0),dx,1);fill=bad&donor
                shifted=np.roll(np.roll(canvas,dy,0),dx,1);canvas[fill]=shifted[fill];bad[fill]=False
        if bad.any():raise ValueError('Unresolved visible screenshot matte')
    return Image.fromarray(canvas),dict(surface_pixels=int(footprint.sum()),direct_supplied_pixels=int((footprint&painted).sum()),edge_fill_pixels=int(missing.sum()),surface_coverage=1.0,source_matte_seed_pixels=matte_seed_pixels)


def main():
    recipe=json.loads((HERE/'sources/head-skins-2026-10-01.json').read_text());pak=read_pak(ROOT/'pak0.pak')
    palette=np.frombuffer(pak['gfx/palette.lmp'],dtype=np.uint8).reshape(256,3);prepared=[]
    for model,spec in recipe['models'].items():
        file=HERE/'sources'/spec['source']
        if hashlib.sha256(file.read_bytes()).hexdigest()!=spec['source_sha256']:raise ValueError('Source changed: '+model)
        data=pak['progs/'+model+'.mdl'];original=native_skins(data,palette)[0][0]
        image,report=fit(original,Image.open(file).convert('RGB'),spec,data,recipe['factor'],recipe['bleed_pixels'])
        prepared.append((model,image,report,spec))
    index_path=ROOT/'newer/enemies/index.json';index=json.loads(index_path.read_text());reports=[]
    for model,image,report,spec in prepared:
        directory=ROOT/'newer/enemies'/model/'custom';directory.mkdir(parents=True,exist_ok=True)
        image.save(directory/'diffuse.webp','WEBP',lossless=True,method=6)
        height_for(image,directory/'height.webp',model+'/custom')
        index['models'][model]=[dict(dir=model+'/custom',flipGreen=False,maps=dict(diffuse='diffuse.webp',height='height.webp'),heightStrength=.65,heightCap=.55)]
        report.update(model=model,dimensions=image.size,source_sha256=spec['source_sha256']);reports.append(report)
    index['version']=int(index['version'])+1;index_path.write_text(json.dumps(index,indent=1)+'\n')
    (ROOT/'docs/evidence/head-skins-fit-2026-10-01.json').write_text(json.dumps(dict(version=index['version'],models=reports),indent=2)+'\n')
    print(json.dumps(reports))

if __name__=='__main__':main()
