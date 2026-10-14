/**
 * @module newer/sound/s_material
 *
 * What a surface is made of, for the add-on effects every game gets that make a surface sound like itself (card
 * T-3faa98e3 items 1 and 2: footsteps and surface-aware impacts; docs/material-sounds-2026-10-14.md). One table for
 * both: a texture's name gives its material (Quake's texture names say what they are: metal, tech, wizwood, rock,
 * ground1_5 ...), the world's contents give water, slime and lava. Gathered from the 5,228 texture names the installed
 * games' maps use; anything it does not know is stone, Quake's commonest surface.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `cache` (texture name to material).
 *
 * Errors: none raised here.
 */
import { R_DecalSurface } from '../render/r_decals.js';
import { FX_Contents, FX_IsLiquid, FX_LAVA } from '../render/fx_world.js';

const NUDGES = [ [ 0, 3 ], [ 0, - 3 ], [ 1, 3 ], [ 1, - 3 ], [ 2, 3 ], [ 2, - 3 ] ];
import { Mod_PointInLeaf } from '../../engine/render/gl_model.js';

/** The materials. */
export const MATERIALS = Object.freeze( [ 'stone', 'metal', 'wood', 'ground', 'glass', 'water' ] );

// by what the name says; checked in this order, the first that fits wins
const RULES = [
	[ 'glass', /window|glass|^\{win|stained/ ],
	[ 'ground', /ground|grnd|grass|dirt|^mud|_mud|sand|swamp|snow|^ice\d|_ice|earth|soil|gravel|moss/ ],
	[ 'wood', /wood|wizwood|crate|crtmg|bookshelf|plank|shelf|barrel|^log|_log|bark|board|carpet/ ],
	[ 'metal', /metal|^met|mmet|wmet|wizmet|steel|iron|tech|tek|comp|^cop|ecop|copper|button|butn|basebtn|^plat|_plat|plat_|grate|pipe|trim|panel|slip|teleport|^door|doortrim|^dr_met|plate|rivet|^vent|_vent|console|mtl|bmk_m|kn_m|light\d|tlight|^z_exit|sliplite/ ]
];
const cache = new Map();

/**
 * A texture's material, from its name.
 *
 * @param {?string} name the texture's name ('metal5_6', '*04water1', 'wizwood1_2' ...)
 * @returns {string} one of MATERIALS ('water' for any liquid texture)
 */
export function S_MaterialOfTexture( name ) {

	const n = String( name ?? '' ).toLowerCase();
	let m = cache.get( n );
	if ( m === undefined ) {

		m = n.charAt( 0 ) === '*' ? 'water' : 'stone';
		if ( m === 'stone' ) for ( const [ material, re ] of RULES ) if ( re.test( n ) ) { m = material; break; }
		cache.set( n, m );

	}
	return m;

}

/**
 * The material at a point of the world: in a liquid, water; otherwise the surface nearest the point (within `reach`
 * units of its plane), filtered by `accept` (a floor for footsteps), else stone.
 *
 * @param {?object} model the world model
 * @param {ArrayLike<number>} p the point (Quake units)
 * @param {number} [reach=8] how far in front of a surface the point may be
 * @param {?function(object, number): boolean} [accept=null] gets each candidate surface and its side's sign
 * @returns {?string} one of MATERIALS; null in lava (no sound)
 */
export function S_MaterialAt( model, p, reach = 8, accept = null ) {

	if ( ! model ) return 'stone';
	const contents = FX_Contents( model, p );
	if ( contents === FX_LAVA ) return null; // (nothing to hear: lava swallows it)
	if ( FX_IsLiquid( contents ) ) return 'water';
	// the surface at the point; the leaf it is in may not list it (a point just in a small neighbouring leaf), so a
	// little to each side is looked at too, and the nearest found is taken
	const q = Array.from( p );
	let hit = R_DecalSurface( model, q, reach, Mod_PointInLeaf, accept ), best = hit ? { name: hit.surf.texinfo?.texture?.name, dist: hit.dist } : null;
	if ( ! best ) for ( const [ a, d ] of NUDGES ) {

		q[ 0 ] = p[ 0 ]; q[ 1 ] = p[ 1 ]; q[ 2 ] = p[ 2 ]; q[ a ] += d;
		hit = R_DecalSurface( model, q, reach + 4, Mod_PointInLeaf, accept );
		if ( hit && ( ! best || hit.dist < best.dist ) ) best = { name: hit.surf.texinfo?.texture?.name, dist: hit.dist };

	}
	return best ? S_MaterialOfTexture( best.name ) : 'stone';

}

/** A floor: a surface facing up (for footsteps and landings). */
export const S_FLOOR = ( s, sign ) => s.plane.normal[ 2 ] * sign > 0.7;
