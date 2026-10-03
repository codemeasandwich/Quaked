#!/usr/bin/env python3
"""Import the saved, verified displacement values from the owner's complete package.
The archive and original colour textures are retained unchanged. No face is redrawn.
"""
from pathlib import Path
import hashlib, json, zipfile, io
import numpy as np
from PIL import Image
from craft_normals import normals_from_height, preview
ROOT=Path(__file__).resolve().parents[1]
NAMES=('dem4_1','dem4_4','dem5_3')
SOURCE=ROOT/'dem4_4_maps.zip'

def main():
    path=ROOT/'newer/textures/index.json';index=json.loads(path.read_text())
    with zipfile.ZipFile(SOURCE) as archive:
        manifest=json.loads(archive.read('dem4_4_maps/manifest.json'))
        saved=archive.read('dem4_4_maps/dem4_4_displacement_16bit.png')
    if hashlib.sha256(saved).hexdigest()!=manifest['files']['displacement']['sha256']:raise ValueError('Displacement checksum mismatch')
    image=Image.open(io.BytesIO(saved));values=np.asarray(image,dtype=np.uint16)
    if values.shape!=(4096,2048):raise ValueError('Expected saved2048x4096 displacement')
    # Exact scalar texel-centre bilinear sampling. Every target centre lies
    # halfway between four saved samples (8:1 ratio in both axes). No gamma.
    raw=np.floor((values[3::8,3::8].astype(float)+values[3::8,4::8]+values[4::8,3::8]+values[4::8,4::8])/4+.5).astype('<u2')
    raw.tofile(ROOT/'newer/textures/normals/demon-face.r16')
    field=raw.astype(float)/65535
    Image.fromarray(np.floor(field*255+.5).astype('uint8')).save(ROOT/'newer/textures/normals/demon-face.webp','WEBP',lossless=True)
    record=dict(sourceArchive='dem4_4_maps.zip',archiveSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),savedHeightSha256=hashlib.sha256(saved).hexdigest(),sourceSize=[2048,4096],heightFile='normals/demon-face.webp',dataFile='normals/demon-face.r16',outputSize=[256,512],encoding='uint16 little endian /65535; non-colour',method='bilinear saved scalar texel-centres, requantizeduint16; no anatomical redraw',amplitudeFraction=.05,textures={})
    record['ownerDepthMultiplier']=3
    record['appliedDepthWorld']=9.6
    for name in NAMES:
        colour=ROOT/'newer/textures'/index['textures'][name]
        rgb=np.asarray(Image.open(colour).convert('RGB'),dtype=float)/255
        # Package normals assume .05*width. The owner requested triple depth;
        # geometric normals are recomputed at that scale, without a second slope.
        # Midlevel0 retains the native wall backing and does not alter slopes.
        index['normals'][name]=dict(file='normals/demon-face.webp',dataFile='normals/demon-face.r16',sampling='clamp',strength=2.0,cap=1.8,displacement=dict(depth=.05*64*3,step=.5,smoothing=.6),relief=dict(depth=.02,layers=10,cavityFloor=.397385627,cavityScale=3,cavityMin=.3))
        _,normal=normals_from_height(field,2.0,1.8)
        preview(rgb,field,normal,ROOT/'docs/images'/('demon-'+name+'-sculpt-2026-10-03.png'))
        record['textures'][name]=dict(albedoSha256=hashlib.sha256(colour.read_bytes()).hexdigest(),nativeSize=[64,128],outputSize=[256,512])
    index['version']=2026100307
    path.write_text(json.dumps(index,indent=1).replace('"strength": 0,','"strength": 0.0,')+'\n')
    (ROOT/'docs/evidence/demon-face-assets-2026-10-03.json').write_text(json.dumps(record,indent=2)+'\n')
    print('Imported saved16-bit displacement for3 plaques at owner-requested triple depth.')
if __name__=='__main__':main()
