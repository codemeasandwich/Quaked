#!/usr/bin/env python3
"""Fit the supplied Shambler and generate height assets for custom/native enemies.
Run with Pillow/NumPy: python3 tools/texture_sheets/update_enemy_heights.py
Uses original pak0 UV skins, existing fit_skin/craft helpers and material names.
"""
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
sys.path[:0] = [str(HERE), str(HERE.parent)]
from make_sheets import read_pak
from fit_skin import spread
import craft_normals
from enemy_height_authoring import author_height, validate_recipe_artwork, RECIPE

ENEMIES = {'boss','demon','dog','enforcer','fish','hknight','knight','ogre','oldone','shalrath','shambler','soldier','tarbaby','wizard','zombie',
           'h_demon','h_dog','h_hellkn','h_knight','h_ogre','h_shal','h_shams','h_guard','h_wizard','h_zombie','gib1','gib2','gib3','zom_gib'}
PROFILE = dict(bands=(.25,.7,1,.5),groove=.35,bump=.25,glow=0,strength=.65,cap=.55)


def native_skins(data, palette):
    count, width, height = struct.unpack('<3i', data[48:60]); pos = 84; result = []
    for skin in range(count):
        grouped = struct.unpack('<i', data[pos:pos+4])[0]; pos += 4
        frames = 1
        if grouped:
            frames = struct.unpack('<i',data[pos:pos+4])[0]; pos += 4 + 4*frames
        images = []
        for frame in range(frames):
            pixels = np.frombuffer(data[pos:pos+width*height],dtype=np.uint8);pos += width*height
            images.append(Image.fromarray(palette[pixels].reshape(height,width,3)))
        result.append(images)
    return result


def fit_shambler(original, model_data):
    recipe = json.loads((HERE/'sources/shambler-2026-10-01.json').read_text())
    src = Image.open(HERE/'sources'/recipe['source']).convert('RGB')
    factor = recipe['factor']; canvas = np.asarray(original.resize((original.width*factor,original.height*factor),Image.Resampling.LANCZOS)).copy()
    painted = np.zeros(canvas.shape[:2],dtype=bool)
    for part in recipe['parts']:
        piece = src.crop(part['src']); rgb = np.asarray(piece,dtype=np.int16)
        # Charcoal and printed captions are neutral; flesh/blood are warm.
        mask = ((rgb[:,:,0]-rgb[:,:,1]>3)|(rgb[:,:,0]-rgb[:,:,2]>6)) & (rgb.max(2)>35)
        component = Image.fromarray((mask*255).astype(np.uint8)).copy()
        # Keep the connected body, excluding detached warm caption pixels and
        # charcoal flecks. The chest seed is inside both supplied silhouettes.
        cx, cy = piece.width//2, piece.height//3
        if not mask[cy,cx]:
            candidates = np.argwhere(mask)
            cy,cx = candidates[np.argmin((candidates[:,0]-cy)**2+(candidates[:,1]-cx)**2)]
        ImageDraw.floodfill(component,(int(cx),int(cy)),128)
        mask = np.asarray(component)==128
        if mask.sum() < piece.width*piece.height*.2:
            raise ValueError('Shambler body mask incomplete: '+part['name'])
        filled = Image.fromarray((mask*255).astype(np.uint8))
        # Flood exterior dark pixels; enclosed dark flesh stays supplied art.
        framed = Image.new('L',(filled.width+2,filled.height+2),0);framed.paste(filled,(1,1));ImageDraw.floodfill(framed,(0,0),128)
        inside = np.asarray(framed)[1:-1,1:-1] != 128
        piece_pixels, _ = spread(np.asarray(piece),inside,10)
        box = [v*factor for v in part['dst']]; width,height = box[2]-box[0],box[3]-box[1]
        fitted = Image.fromarray(piece_pixels).resize((width,height),Image.Resampling.LANCZOS)
        fitted_mask = np.asarray(Image.fromarray((inside*255).astype(np.uint8)).resize((width,height),Image.Resampling.NEAREST))>0
        fitted_pixels, bleed_mask = spread(np.asarray(fitted),fitted_mask,recipe['bleed_pixels'])
        target = canvas[box[1]:box[3],box[0]:box[2]];target[bleed_mask]=fitted_pixels[bleed_mask]
        painted[box[1]:box[3],box[0]:box[2]] |= bleed_mask
    # Fit each claw's wrist and three tips to the real MDL UV landmarks.
    # Two affine triangles retain the supplied finger directions while changing
    # their atlas positions; a whole rectangular resize cannot align those tips.
    source_pixels = np.asarray(src)
    rgb = source_pixels.astype(np.int16)
    hand_foreground = ((rgb[:,:,0]-rgb[:,:,1]>3)|(rgb[:,:,0]-rgb[:,:,2]>6)) & (rgb.max(2)>35)
    # The real claw UV polygons can cover the art's charcoal gaps between
    # fingers. Carry nearby supplied blood/flesh colours through those gaps;
    # never paint background into a visible model triangle.
    source_pixels,_ = spread(source_pixels,hand_foreground,60)
    for hand in recipe['hands']:
        source_points = np.asarray(hand['src'],dtype=float)
        destination = np.asarray(hand['dst'],dtype=float)*factor
        for ids in ([0,1,2],[0,2,3]):
            d = destination[ids]; sp = source_points[ids]
            x0,y0 = np.floor(d.min(0)).astype(int);x1,y1 = np.ceil(d.max(0)).astype(int)
            yy,xx = np.mgrid[max(0,y0):min(canvas.shape[0],y1+1),max(0,x0):min(canvas.shape[1],x1+1)]
            matrix = np.vstack([d.T,np.ones(3)])
            weights = np.linalg.solve(matrix,np.stack([xx.ravel()+.5,yy.ravel()+.5,np.ones(xx.size)]))
            valid = (weights.min(0)>=-1e-6)
            sample = weights.T @ sp
            sx,sy = sample[:,0],sample[:,1]
            ix,iy = np.floor(sx).astype(int),np.floor(sy).astype(int)
            fx,fy = sx-ix,sy-iy
            ix=np.clip(ix,0,src.width-2);iy=np.clip(iy,0,src.height-2)
            rgb=(source_pixels[iy,ix]*(1-fx)[:,None]*(1-fy)[:,None]+source_pixels[iy,ix+1]*fx[:,None]*(1-fy)[:,None]
                 +source_pixels[iy+1,ix]*(1-fx)[:,None]*fy[:,None]+source_pixels[iy+1,ix+1]*fx[:,None]*fy[:,None])
            canvas[yy.ravel()[valid],xx.ravel()[valid]]=rgb[valid].astype(np.uint8)
            painted[yy.ravel()[valid],xx.ravel()[valid]]=True
    # Original UV polygons are authoritative, including seam offsets and half
    # texels. Carry supplied colours into any remaining surface edge rather than
    # leaving fragments of the old skin visible on the actual model.
    skins,width,height=struct.unpack('<3i',model_data[48:60]);vertices,triangles=struct.unpack('<2i',model_data[60:68])
    pos=84
    for _ in range(skins):
        grouped=struct.unpack('<i',model_data[pos:pos+4])[0];pos+=4
        count=1
        if grouped:count=struct.unpack('<i',model_data[pos:pos+4])[0];pos+=4+4*count
        pos+=count*width*height
    uv=np.frombuffer(model_data[pos:pos+vertices*12],dtype='<i4').reshape(vertices,3);pos+=vertices*12
    tris=np.frombuffer(model_data[pos:pos+triangles*16],dtype='<i4').reshape(triangles,4)
    footprint=Image.new('L',(width*factor,height*factor),0);draw=ImageDraw.Draw(footprint)
    for front,*indices in tris:
        coords=[((uv[i,1]+.5+(width/2 if not front and uv[i,0] else 0))*factor,(uv[i,2]+.5)*factor) for i in indices]
        draw.polygon(coords,fill=255)
    surface=np.asarray(footprint)>0
    extended,coverage=spread(canvas,painted,40)
    missing=surface & ~painted
    if (surface & ~coverage).any():raise ValueError('Supplied Shambler colours do not cover model UVs')
    canvas[missing]=extended[missing]
    # Reject stale material annotations before writing the fitted diffuse or
    # replacing accepted UV evidence during full asset reconstruction.
    validate_recipe_artwork(canvas.astype(np.float32)/255,json.loads(RECIPE.read_text()))
    (ROOT/'docs/evidence/shambler-uv-fit-2026-10-01.json').write_text(json.dumps(dict(surface_pixels=int(surface.sum()),source_fitted_pixels=int((surface&painted).sum()),edge_fill_pixels=int(missing.sum()),surface_coverage=1.0),indent=2)+'\n')
    target = ROOT/'newer/enemies/shambler/custom/diffuse.webp'
    Image.fromarray(canvas).save(target,'WEBP',lossless=True,method=6)
    return hashlib.sha256((HERE/'sources'/recipe['source']).read_bytes()).hexdigest()


def height_for(image, target, model):
    height = author_height(np.asarray(image.convert('RGB'),dtype=np.float32)/255,PROFILE,model)
    target.parent.mkdir(parents=True,exist_ok=True)
    Image.fromarray(np.round(height*255).astype(np.uint8)).save(target,'WEBP',lossless=True,method=6)


def main():
    pak = read_pak(ROOT/'games/shareware/pak0.pak'); palette = np.frombuffer(pak['gfx/palette.lmp'],dtype=np.uint8).reshape(256,3)
    native = {name[6:-4]:native_skins(data,palette) for name,data in pak.items() if name.startswith('progs/') and name.endswith('.mdl') and name[6:-4] in ENEMIES}
    source_hash = hashlib.sha256((HERE/'sources/shambler-2026-10-01.png').read_bytes()).hexdigest()
    if '--heights-only' not in sys.argv:source_hash = fit_shambler(native['shambler'][0][0],pak['progs/shambler.mdl'])
    index_path = ROOT/'newer/enemies/index.json';index = json.loads(index_path.read_text());custom_count = 0
    for model,variants in index['models'].items():
        if model not in ENEMIES:continue
        for variant in variants:
            directory = ROOT/'newer/enemies'/variant['dir'];image = Image.open(directory/variant['maps']['diffuse'])
            height_for(image,directory/'height.webp',variant['dir']);variant['maps']['height']='height.webp';variant['heightStrength']=.65;variant['heightCap']=.55;custom_count+=1
    height_index = {}
    for model,skins in native.items():
        groups=[]
        for skin,frames in enumerate(skins):
            maps=[]
            for frame,image in enumerate(frames):
                file=f'heights/{model}/skin{skin}_{frame}.webp';height_for(image,ROOT/'newer/enemies'/file,model)
                maps.append(dict(file=file,strength=.65,cap=.55))
            groups.append(maps)
        height_index[model]=groups
    index['nativeHeights']=height_index;index['version']=int(index.get('version',0))+1
    index_path.write_text(json.dumps(index,indent=1)+'\n')
    report=dict(source_sha256=source_hash,custom_height_maps=custom_count,native_models=len(native),native_height_maps=sum(len(f) for s in native.values() for f in s),native_model_names=sorted(native),version=index['version'])
    (ROOT/'docs/evidence/enemy-height-assets-2026-10-01.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))

if __name__=='__main__':main()
