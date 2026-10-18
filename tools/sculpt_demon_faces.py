#!/usr/bin/env python3
"""Import the saved displacement from ordinary texture authoring files.

The source manifest is the import contract; no ZIP or dated evidence file is needed.
Use --check to verify installed assets without writing files. No face is redrawn.
"""

from pathlib import Path
from resource_paths import resource_path
import argparse, hashlib, json, io
import numpy as np
from PIL import Image
from craft_normals import normals_from_height, preview
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/texture_sheets/sources/demon-2026-10-03'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Verify source, runtime scalars, preview and bindings without writing files')
    args=parser.parse_args()
    manifest=json.loads((SOURCE/'manifest.json').read_text())
    recipe=manifest['runtimeImport']
    path=resource_path(ROOT, 'newer/textures/index.json');index=json.loads(path.read_text())
    saved=resource_path(ROOT, SOURCE/manifest['files']['displacement']['filename']).read_bytes()
    if hashlib.sha256(saved).hexdigest()!=manifest['files']['displacement']['sha256']:raise ValueError('Displacement checksum mismatch')
    image=Image.open(io.BytesIO(saved));values=np.asarray(image,dtype=np.uint16)
    if values.shape!=(4096,2048):raise ValueError('Expected saved2048x4096 displacement')
    # Exact scalar texel-centre bilinear sampling. Every target centre lies
    # halfway between four saved samples (8:1 ratio in both axes). No gamma.
    raw=np.floor((values[3::8,3::8].astype(float)+values[3::8,4::8]+values[4::8,3::8]+values[4::8,4::8])/4+.5).astype('<u2')
    field=raw.astype(float)/65535
    pixels=np.floor(field*255+.5).astype('uint8')
    scalar_path=resource_path(ROOT, 'newer/textures')/recipe['dataFile']
    preview_path=resource_path(ROOT, 'newer/textures')/recipe['heightFile']
    if [raw.shape[1],raw.shape[0]]!=recipe['outputSize']:raise ValueError('Runtime dimensions disagree with source manifest')
    binding=dict(file=recipe['heightFile'],dataFile=recipe['dataFile'],**recipe['material'])
    # Verify every source/binding before changing any output, including on import.
    for name,texture in recipe['textures'].items():
        colour=resource_path(ROOT, 'newer/textures')/index['textures'][name]
        if hashlib.sha256(colour.read_bytes()).hexdigest()!=texture['albedoSha256']:raise ValueError(f'Original albedo checksum mismatch: {name}')
        if args.check and index['normals'][name]!=binding:raise ValueError(f'Runtime binding mismatch: {name}')
    if args.check:
        if scalar_path.read_bytes()!=raw.tobytes():raise ValueError('Installed R16 differs from the canonical displacement resample')
        if not np.all(np.asarray(Image.open(preview_path).convert('RGB'))==pixels[...,None]):raise ValueError('Installed preview differs from the canonical scalar field')
        print(f'PASS: {raw.size} exact uint16 samples, grayscale preview and {len(recipe["textures"])} runtime bindings; no files written.')
        return
    raw.tofile(scalar_path)
    Image.fromarray(pixels).save(preview_path,'WEBP',lossless=True)
    for name in recipe['textures']:
        colour=resource_path(ROOT, 'newer/textures')/index['textures'][name]
        rgb=np.asarray(Image.open(colour).convert('RGB'),dtype=float)/255
        # Package normals assume .05*width. The owner requested triple depth;
        # geometric normals are recomputed at that scale, without a second slope.
        # Midlevel0 retains the native wall backing and does not alter slopes.
        index['normals'][name]=binding
        _,normal=normals_from_height(field,binding['strength'],binding['cap'])
        preview(rgb,field,normal,resource_path(ROOT, 'docs/images')/('demon-'+name+'-sculpt-2026-10-03.png'))
    # Follow craft_normals.py: import advances the current catalog revision.
    index['version']=int(index['version'])+1
    path.write_text(json.dumps(index,indent=1).replace('"strength": 0,','"strength": 0.0,')+'\n')
    print('Imported saved16-bit displacement for3 plaques at owner-requested triple depth.')
if __name__=='__main__':main()
