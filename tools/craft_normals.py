#!/usr/bin/env python3
"""Craft a normal map for every higher resolution texture in newer/textures.

    python3 tools/craft_normals.py [name ...] [--preview dir]

The engine can make a normal map from any texture, but it has to do it blind and in a hurry, from the
brightness alone. These are made offline, one texture at a time, with the texture's kind in mind
(stone is not wood is not a riveted plate is not a lamp), and they are much better:

  * the baked-in lighting (one side of the picture brighter than the other) is taken out first, so it
    does not become a slope across the whole texture;
  * the relief is built from bands of detail (fine grain, cracks, blocks, broad shapes) that are
    weighted for the kind of texture, each scaled to the same strength, so a brick wall is bricks and
    mortar with a little grain, not only grain;
  * dark lines (mortar, cracks, the gaps between planks) are cut in, bright knobs (rivets, studs, bumps)
    stand out;
  * glowing parts (lamps, runes, lit buttons) are flattened into a recess with a bevel, instead of
    bumping with whatever colours they happen to have;
  * everything wraps, because the textures tile.

What is stored is the crafted height (newer/textures/normals/<name>.webp, a grey picture) and how steep
to make it (the "normals" entry of newer/textures/index.json: { "file": ..., "strength": ... }): the
engine turns the height into normals when the texture loads, with the same maths as this script
(R_NormalsFromCraftedHeight in src/gl_normals.js), and keeps the height for parallax. The height
is a fraction of the size of the normals and compresses well. --preview writes a picture for each (the
texture, its normals and the texture lit from above left) to check them by eye.
"""
import json, os, re, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TEX = os.path.join(ROOT, 'newer', 'textures')

# name patterns (first match wins) -> how to treat the texture
#   bands   weights of fine grain, cracks, blocks, broad shape
#   groove  how much dark lines are cut in;  bump  how much bright knobs stand out
#   glow    how much glowing parts are flattened (0..1);  strength  how steep the relief is
PROFILES = [
    ( r'^(exit02_2)', dict( bands=( .5, 1, 1.2, 1 ), groove=.3, bump=.4, glow=0, strength=1.5 ) ),  # bones
    ( r'^(plat_top2)', dict( bands=( .9, 1.4, .4, .2 ), groove=.6, bump=1.3, glow=0, strength=1.6 ) ),  # diamond plate
    ( r'^(window1_3)', dict( bands=( .4, 1, 1.2, .8 ), groove=1.0, bump=.4, glow=0, strength=1.5 ) ),
    ( r'^(z_exit|adoor03_3)', dict( bands=( .4, 1, .9, .6 ), groove=.6, bump=.7, glow=.8, strength=1.2 ) ),
    ( r'^(crate\d_(side|top)|crate_)', dict( bands=( .5, 1, 1.1, .7 ), groove=.6, bump=.6, glow=0, strength=1.3, flatprint=True ) ),  # crates: frame and rivets in relief, the printed design flat: rivets, panel frames, flat paint
    ( r'^(batt\dsid|batt\dtop|nail\dsid|nail\dtop)', dict( bands=( .5, 1, .8, .5 ), groove=.8, bump=.7, glow=.2, strength=1.25 ) ),  # ammo boxes
    ( r'^(enter01|wenter01)', dict( bands=( .45, 1, 1.2, .9 ), groove=.6, bump=.5, glow=.1, strength=1.5 ) ),  # the bone arch and the rock around it
    ( r'^(door05_2)', dict( bands=( .6, 1, .8, .5 ), groove=.6, bump=1.0, glow=0, strength=1.35 ) ),
    ( r'^(window02_1)', dict( bands=( .3, 1, 1, .6 ), groove=1.2, bump=.2, glow=.6, strength=1.2 ) ),  # stained glass: lead lines in, glass recessed
    ( r'^(window03|dr07_1)', dict( bands=( .35, 1, 1.3, .9 ), groove=1.0, bump=.5, glow=.4, strength=1.5 ) ),  # stone wall with a window, rough stone
    ( r'^(dr02_1)', dict( bands=( .5, 1, 1.2, 1 ), groove=.5, bump=.6, glow=0, strength=1.4 ) ),  # skull frame
    # the metal_2 sheet, by what each picture is
    ( r'^(metal4_[23]|metalt1_1|metalt2_[23]|metal6_)', dict( bands=( .5, 1, 1.2, 1 ), groove=.3, bump=.3, glow=.25, strength=1.45 ) ),  # skulls, snakes
    ( r'^(met5_2|metal1_1|metal1_2|metal1_7|metal4_[456]|metalt2_[15])', dict( bands=( 1, .9, .3, .1 ), groove=.2, bump=.6, glow=0, strength=1.4 ) ),  # pebbles, gunk, moss
    ( r'^(metal2_2)', dict( bands=( .35, 1, 1.3, .9 ), groove=1.0, bump=.4, glow=0, strength=1.5 ) ),  # cracked earth
    ( r'^(metal2_[56])', dict( bands=( .9, 1.4, .4, .2 ), groove=.6, bump=1.6, glow=0, strength=1.8 ) ),  # studs
    ( r'^(metal1_4|metal2_4)', dict( bands=( .5, 1, .6, .3 ), groove=.6, bump=1.1, glow=0, strength=1.3 ) ),  # rivets, plates
    ( r'^(metal1_3|metal5_6)', dict( bands=( .8, 1, .5, .2 ), groove=.8, bump=.2, glow=0, strength=1.2 ) ),  # scratched and planked
    ( r'^(metal5_[1-4])', dict( bands=( .4, 1, 1.3, .9 ), groove=.9, bump=.5, glow=0, strength=1.4 ) ),  # arches, scales, patterns
    # lamps, lit panels: little relief of their own
    ( r'^(tlight|light|\+\dplanet|sliplite|slipside|\+\d?slip$|\+\dslip$)', dict( bands=( .3, .7, 1, .6 ), groove=.4, bump=.4, glow=.9, strength=.7 ) ),
    # lit switches, runes, keys, health boxes, signs: bevelled plates with a recessed glowing part
    ( r'^(\+\d?(butn|button|shoot|floorsw|basebtn|abasebtn|afloorsw|ashoot|abutton|abutn|abutnn)|rune|key|wkey|skill|switch_1|basebutn|arrow_m|mswtch|swtch|med|\+\d_med|\+\d_box|slip[bt]|slipside|metal6)', dict( bands=( .4, .9, 1, .7 ), groove=.6, bump=.5, glow=.7, strength=1.15 ) ),
    # skulls, demons, flesh: rounded forms
    ( r'^(altar|elwall|dem|wmet3|\+\dlight01|metalt2|wmet4_3)', dict( bands=( .5, 1, 1.2, 1 ), groove=.3, bump=.3, glow=.25, strength=1.45 ) ),
    # slime, pebbles, bumps
    ( r'^(nmetal2|wmet2_1|wmet4_4|wmet4_5|wmet4_6)', dict( bands=( 1, .9, .3, .1 ), groove=.2, bump=.6, glow=0, strength=1.4 ) ),
    # rock, ground, vines, dirt, brick, bark
    ( r'^(rock\d_\d|ground|uwall|wgrnd|wizmet1_7|wiz1_4)', dict( bands=( .3, 1, 1.6, 1.3 ), groove=1.6, bump=.9, glow=0, strength=3.6, cap=3.2 ) ),  # rock: as extreme as it goes
    ( r'^(vine|mmetal1_5|wizwood1_3|sfloor4_2$)', dict( bands=( .35, 1, 1.3, .9 ), groove=1.0, bump=.4, glow=0, strength=1.5 ) ),
    # wood
    ( r'^(wood|wizwood|woodflr)', dict( bands=( .8, 1, .5, .2 ), groove=.8, bump=.2, glow=0, strength=1.2 ) ),
    # riveted and scratched plates, rusty metal
    ( r'^(cop|ecop|mmetal1_[127]|wizmet1_[1-3]|wiz1_1|tech10_1|m5_|wmet2_3|wmet4_[78]|wizmet1_8|mmetal1_8)', dict( bands=( .5, 1, .6, .3 ), groove=.6, bump=.9, glow=0, strength=1.2 ) ),
    # machinery, doors, wall panels
    ( r'^(comp|tech|twall|adoor|door|slip1|sfloor4_5|plat|exit|z_exit|window|ceiling|afloor|dem4|carch)', dict( bands=( .6, 1, .8, .5 ), groove=.8, bump=.6, glow=.2, strength=1.15 ) ),
]
DEFAULT = dict( bands=( .6, 1, .8, .5 ), groove=.5, bump=.5, glow=.2, strength=1.15 )

def profile_for( name ):
    for pat, p in PROFILES:
        if re.match( pat, name ): return p
    return DEFAULT

def gblur( a, sigma ):
    """Gaussian blur that wraps at the edges (the textures tile)."""
    if sigma <= 0: return a
    h, w = a.shape
    fy = np.fft.fftfreq( h )[:, None]; fx = np.fft.rfftfreq( w )[None, :]
    g = np.exp( -2 * np.pi ** 2 * sigma ** 2 * ( fx ** 2 + fy ** 2 ) )
    return np.fft.irfft2( np.fft.rfft2( a ) * g, s=a.shape )

def window_extreme( a, r, fn ):
    out = a.copy()
    for k in range( 1, r + 1 ):
        for axis in ( 0, 1 ):
            out = fn( out, fn( np.roll( a, k, axis ), np.roll( a, -k, axis ) ) )
    return out

def norm( a ):
    s = np.std( a )
    return a / s if s > 1e-6 else a * 0

def smoothstep( e0, e1, x ):
    t = np.clip( ( x - e0 ) / ( e1 - e0 ), 0, 1 )
    return t * t * ( 3 - 2 * t )

def remove_print( rgb, L, k ):
    """The luminance with the printed design (dark or red paint on the olive panel) filled in with the
    panel's own surface, so the design leaves no relief; the panel and its frame keep theirs."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    eps = 1e-4
    paper = ( L > 0.2 ) & ( L < 0.7 ) & ( g / ( r + eps ) > 0.74 ) & ( g / ( r + eps ) < 1.02 ) & ( b / ( r + eps ) > 0.3 ) & ( b / ( r + eps ) < 0.85 ) & ( r > g * 0.98 )
    # the panel: where paper is dense
    dense = gblur( paper.astype( np.float32 ), 6 * k ) > 0.3
    rows = np.where( dense.mean( axis=1 ) > 0.35 )[0]; cols = np.where( dense.mean( axis=0 ) > 0.3 )[0]
    if len( rows ) < 8 or len( cols ) < 8: return L
    inside = np.zeros_like( paper )
    m = int( 6 * k )
    inside[rows.min() + m:rows.max() - m, cols.min() + m:cols.max() - m] = True
    pm = float( np.median( L[paper & inside] ) ) if ( paper & inside ).any() else float( np.median( L ) )
    redpaint = ( r > g * 1.45 ) & ( r > 0.25 )
    mark = inside & ~paper & ( ( L < pm * 0.78 ) | redpaint | ( L > pm * 1.35 ) )
    mark = gblur( mark.astype( np.float32 ), 1.6 * k ) > 0.15
    mark = gblur( mark.astype( np.float32 ), 1.2 * k ) > 0.12
    ok = ( ~mark ).astype( np.float32 )
    # the panel's own level, with its slow variation only (no blobs where the design was)
    fill = 0.5 * pm + 0.5 * gblur( L * ok, 30 * k ) / np.maximum( np.clip( gblur( ok, 30 * k ), 0, 1 ), 1e-2 )
    fill = fill + ( gblur( L, 1.2 * k ) - gblur( L, 3.5 * k ) ) * ( ok )  # the paint's fine grain stays
    w = np.clip( gblur( mark.astype( np.float32 ), 1.0 * k ), 0, 1 ) ** 0.8
    return L * ( 1 - w ) + fill * w

def craft( rgb, prof ):
    """rgb: float array h x w x 3 in 0..1 (sRGB). Returns (height 0..1, normals h x w x 3 in -1..1)."""
    h, w, _ = rgb.shape
    k = np.sqrt( h * w ) / 256.0           # detail sizes are for a 256 texture
    L = rgb @ np.array( [ 0.299, 0.587, 0.114 ] )
    mx = rgb.max( axis=2 ); mn = rgb.min( axis=2 )
    sat = ( mx - mn ) / np.maximum( mx, 1e-4 )

    # a design printed on a panel (a crate's logo) is paint, not relief: take it out of the height
    if prof.get( 'flatprint' ):
        L = remove_print( rgb, L, k )

    # take the baked-in lighting out: what is left is detail
    L = L - gblur( L, 40 * k ) * 0.85

    g = [ gblur( L, s * k ) for s in ( 1.2, 3.5, 9, 22, 60 ) ]
    bands = [ L - g[0], g[0] - g[1], g[1] - g[2], g[2] - g[3] ]
    H = sum( wgt * norm( b ) for wgt, b in zip( prof['bands'], bands ) )
    H = H + 0.25 * norm( g[3] - g[4] ) * prof['bands'][3]

    # dark lines cut in, bright knobs stand out
    r = max( 1, int( round( 3 * k ) ) )
    smooth = g[0]
    groove = window_extreme( smooth, r, np.maximum ) - smooth   # closing-ish: how far below its surroundings
    groove = window_extreme( groove, 0, np.maximum )
    top = smooth - window_extreme( smooth, r, np.minimum )      # how far above
    H = H - prof['groove'] * 1.5 * norm( groove ) + prof['bump'] * 1.0 * norm( top )

    # a soft limit, so a few extreme pixels do not make spikes
    H = np.tanh( norm( H ) * 0.9 )

    # glowing parts: a recessed plateau with a soft bevel
    if prof['glow'] > 0:
        glowing = smoothstep( 0.55, 0.85, mx ) * smoothstep( 0.30, 0.60, sat )
        white = smoothstep( 0.80, 0.95, mn )
        m = gblur( np.maximum( glowing, white ), 1.4 * k ) * prof['glow']
        floor = np.percentile( H, 25 ) - 0.35
        H = H * ( 1 - m ) + floor * m

    H01 = ( H - H.min() ) / ( H.max() - H.min() + 1e-6 )
    return normals_from_height( np.round( H01 * 255 ) / 255, prof['strength'], prof.get( 'cap', 1.1 ) )

def normals_from_height( H01, strength, capk=1.1 ):
    """The normals of a height field in 0..1: the maths of R_NormalsFromCraftedHeight in src/gl_normals.js."""
    h, w = H01.shape
    # slope: the same scale the engine uses for generated maps, so strength means the same thing
    sc = strength * np.sqrt( h * w ) / 8.0
    def d( a, axis ):
        return ( 3 * ( np.roll( a, -1, axis ) - np.roll( a, 1, axis ) )
               + 1 * ( np.roll( np.roll( a, -1, axis ), 1, 1 - axis ) + np.roll( np.roll( a, -1, axis ), -1, 1 - axis )
                     - np.roll( np.roll( a, 1, axis ), 1, 1 - axis ) - np.roll( np.roll( a, 1, axis ), -1, 1 - axis ) ) ) / 10.0
    gx = d( H01, 1 ) * 0.5; gy = d( H01, 0 ) * 0.5
    sx = -gx * sc; sy = -gy * sc
    # soft cap on how steeply a facet may lean
    m = np.sqrt( sx * sx + sy * sy ); cap = 1.0 / np.sqrt( 1.0 + ( m / capk ) ** 2 )
    sx *= cap; sy *= cap
    nz = 1.0
    ln = np.sqrt( sx * sx + sy * sy + nz * nz )
    return H01, np.stack( [ sx / ln, sy / ln, nz / ln ], axis=2 )

def save_height( path, H01 ):
    Image.fromarray( np.round( H01 * 255 ).astype( np.uint8 ) ).save( path, 'WEBP', quality=92, method=6 )

def preview( rgb, H01, n, path ):
    h, w, _ = rgb.shape
    viz = np.stack( [ n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, n[..., 2] * 0.5 + 0.5 ], axis=2 )
    light = np.array( [ -0.55, -0.55, 0.63 ] ); light /= np.linalg.norm( light )
    lam = np.clip( n @ light, 0, 1 )[..., None]
    lit = np.clip( rgb * ( 0.35 + 0.95 * lam ), 0, 1 )
    c = np.concatenate( [ rgb, viz, lit ], axis=1 )
    Image.fromarray( ( c * 255 ).astype( np.uint8 ) ).save( path )

def main( args ):
    prev = None
    if '--preview' in args:
        i = args.index( '--preview' ); prev = args[i + 1]; args = args[:i] + args[i + 2:]
        os.makedirs( prev, exist_ok=True )
    idx_path = os.path.join( TEX, 'index.json' ); idx = json.load( open( idx_path ) )
    names = args or sorted( idx['textures'] )
    os.makedirs( os.path.join( TEX, 'normals' ), exist_ok=True )
    normals = {} if args == [] else dict( idx.get( 'normals', {} ) )
    for name in names:
        rgb = np.asarray( Image.open( os.path.join( TEX, idx['textures'][name] ) ).convert( 'RGB' ), dtype=np.float32 ) / 255.0
        prof = profile_for( name )
        H01, n = craft( rgb, prof )
        fn = name.replace( '+', 'p_' ).replace( '*', 'star_' ) + '.webp'
        save_height( os.path.join( TEX, 'normals', fn ), H01 )
        normals[name] = { 'file': 'normals/' + fn, 'strength': prof['strength'], 'cap': prof.get( 'cap', 1.1 ) }
        if prev:
            # what the engine will see: the height as it is stored
            stored = np.asarray( Image.open( os.path.join( TEX, 'normals', fn ) ).convert( 'L' ), dtype=np.float32 ) / 255.0
            H2, n2 = normals_from_height( stored, prof['strength'], prof.get( 'cap', 1.1 ) )
            preview( rgb, H2, n2, os.path.join( prev, fn.replace( '.webp', '.png' ) ) )
    idx['normals'] = normals
    idx['version'] = int( idx['version'] ) + 1
    json.dump( idx, open( idx_path, 'w' ), indent=1 )
    print( len( names ), 'normal maps' )

if __name__ == '__main__':
    main( sys.argv[1:] )
