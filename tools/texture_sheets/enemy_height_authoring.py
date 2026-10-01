"""Material-aware enemy-only height authoring; never edits diffuse pixels.

Pigment detection is restricted to explicitly reviewed atlas regions. Nearby
unpainted luminance estimates the surface under opaque blood; it is not a scan
of hidden anatomy. Signed wound/fold fields are authored separately, after that
reconstruction. Unannotated models retain their existing height generation.
"""
import json
import hashlib
from pathlib import Path
import numpy as np
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import craft_normals

RECIPE = Path(__file__).resolve().parent/'sources/shambler-height-authoring.json'

def region_mask(shape, recipe, field):
    height,width=shape; rw,rh=recipe['reference_size'];x=(np.arange(width)+.5)*rw/width;y=(np.arange(height)+.5)*rh/height
    mask=np.zeros(shape,dtype=bool)
    for region in recipe.get(field,[]):
        left,top,right,bottom=region['box'];mask |= (y[:,None]>=top)&(y[:,None]<bottom)&(x[None,:]>=left)&(x[None,:]<right)
    return mask

def pigment_surface(rgb, recipe):
    """Return corrected luminance and reviewed paint weight (0..1)."""
    rgb=np.asarray(rgb,dtype=np.float64);r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2];policy=recipe['pigment']
    permitted=region_mask(r.shape,recipe,'paint_regions');protected=region_mask(r.shape,recipe,'protected_regions')
    detected=permitted & ~protected & (r>policy['minimum_red']) & (r>g*policy['red_over_green']) & (r>b*policy['red_over_blue'])
    scale=np.sqrt(rgb.shape[0]*rgb.shape[1]/np.prod(recipe['reference_size']))
    # Include antialiased blood edges before feathering. Feather falls on clean
    # surrounding skin rather than leaving a partially flattened red trench.
    expanded=craft_normals.window_extreme(detected.astype(float),max(1,round(policy['padding_texels']*scale)),np.maximum)
    weight=craft_normals.smoothstep(.02,.35,craft_normals.gblur(expanded,policy['feather_texels']*scale))
    weight[~permitted | protected]=0
    luminance=rgb @ np.array([.299,.587,.114])
    if not detected.any():return luminance,np.zeros_like(luminance)
    known=1-expanded;known[protected]=1
    sigma=policy['reconstruction_texels']*scale
    fill=craft_normals.gblur(luminance*known,sigma)/np.maximum(craft_normals.gblur(known,sigma),1e-8)
    return luminance*(1-weight)+fill*weight,weight

def structural_field(shape, recipe):
    height,width=shape;rw,rh=recipe['reference_size'];yy,xx=np.mgrid[0:height,0:width].astype(float)
    xx=(xx+.5)*rw/width;yy=(yy+.5)*rh/height;field=np.zeros(shape,dtype=float)
    for feature in recipe.get('features',[]):
        if feature['type']=='recess':
            cx,cy=feature['center'];rx,ry=feature['radius'];distance=((xx-cx)/rx)**2+((yy-cy)/ry)**2
            field += feature['depth']*np.maximum(1-distance,0)**2
        elif feature['type']=='ridge':
            distance=np.full(shape,np.inf)
            for a,b in zip(feature['points'],feature['points'][1:]):
                ax,ay=a;bx,by=b;dx,dy=bx-ax,by-ay
                t=np.clip(((xx-ax)*dx+(yy-ay)*dy)/(dx*dx+dy*dy),0,1)
                distance=np.minimum(distance,(xx-ax-t*dx)**2+(yy-ay-t*dy)**2)
            field += feature['depth']*np.exp(-.5*distance/feature['width']**2)
        else:raise ValueError('Unknown authored feature: '+feature['type'])
    return field

def validate_recipe_artwork(rgb, recipe):
    if recipe.get('diffuse_rgb_sha256'):
        pixels=np.rint(np.clip(rgb,0,1)*255).astype(np.uint8)
        if hashlib.sha256(pixels.tobytes()).hexdigest()!=recipe['diffuse_rgb_sha256']:
            raise ValueError('Custom Shambler diffuse changed; review height annotations for this artwork')

def author_height(rgb, profile, model=None, recipe=None):
    if recipe is None and model=='shambler/custom':recipe=json.loads(RECIPE.read_text())
    if recipe is None or (not recipe.get('paint_regions') and not recipe.get('features')):return craft_normals.craft(rgb,profile)[0]
    validate_recipe_artwork(rgb,recipe)
    luminance,weight=pigment_surface(rgb,recipe)
    height=craft_normals.craft(np.repeat(luminance[:,:,None],3,axis=2),profile)[0]
    # Reserve headroom for independent positive and negative authored structure.
    return np.clip(.1+.8*height+structural_field(height.shape,recipe),0,1)
