/**
 * @module newer/render/fx_world
 *
 * What the add-on effects for every game ask of the map (card T-3faa98e3,
 * docs/addon-effects-integration-2026-10-13.md): what is at a point, the floor below one, the ceiling above one, the
 * surface of a pool between two; and a random number that a test can set. The map is the client's own world model
 * (its point hull, as the chase camera and the quad vision read it); doors, lifts and other moving brushes are not
 * part of it.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `state` (the random number's) and one reused trace.
 *
 * Errors: none raised here; without a world every question answers "nothing".
 */
import { SV_HullPointContents, SV_RecursiveHullCheck, trace_t } from '../../engine/server/world.js';

/** Quake's contents numbers: nothing, solid, water, slime, lava, sky. */
export const FX_EMPTY = - 1, FX_SOLID = - 2, FX_WATER = - 3, FX_SLIME = - 4, FX_LAVA = - 5, FX_SKY = - 6;

let state = 0x2545f491;

/**
 * A random number 0..1 (not 1), the same run of them after the same `FX_Seed`.
 *
 * @returns {number} the next
 */
export function FX_Random() {

	// (mulberry32)
	state = ( state + 0x6d2b79f5 ) | 0;
	let t = Math.imul( state ^ ( state >>> 15 ), 1 | state );
	t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
	return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

}

/**
 * Starts the random numbers again from `n`, so a test or a trial sees the same effects each run.
 *
 * @param {number} n any whole number
 */
export function FX_Seed( n ) { state = n | 0; }

const hullOf = model => model?.hulls?.[ 0 ]?.clipnodes ? model.hulls[ 0 ] : null;

/**
 * What is at a point of the map.
 *
 * @param {?object} model the world model (`cl.worldmodel`)
 * @param {ArrayLike<number>} p the point (Quake units)
 * @returns {number} one of the FX_ contents; FX_SOLID without a world
 */
export function FX_Contents( model, p ) {

	const hull = hullOf( model );
	return hull ? SV_HullPointContents( hull, hull.firstclipnode, p ) : FX_SOLID;

}

/** Whether contents are a liquid (water, slime or lava). */
export const FX_IsLiquid = c => c <= FX_WATER && c >= FX_LAVA;

const trace = new trace_t(), _a = new Float32Array( 3 ), _b = new Float32Array( 3 );

/**
 * How far something goes straight up or down from a point before the map stops it.
 *
 * @param {?object} model the world model
 * @param {ArrayLike<number>} p where it starts (not in solid)
 * @param {number} dz how far to look: negative down, positive up (Quake units)
 * @returns {?number} the height at which it is stopped, or null when nothing stops it within `dz`, when it starts in
 *   solid, or without a world
 */
export function FX_Stop( model, p, dz ) {

	const hull = hullOf( model );
	if ( ! hull ) return null;
	_a[ 0 ] = _b[ 0 ] = p[ 0 ]; _a[ 1 ] = _b[ 1 ] = p[ 1 ]; _a[ 2 ] = p[ 2 ]; _b[ 2 ] = p[ 2 ] + dz;
	trace.fraction = 1; trace.allsolid = true; trace.startsolid = false; trace.inopen = false; trace.inwater = false;
	trace.endpos[ 0 ] = _b[ 0 ]; trace.endpos[ 1 ] = _b[ 1 ]; trace.endpos[ 2 ] = _b[ 2 ];
	SV_RecursiveHullCheck( hull, hull.firstclipnode, 0, 1, _a, _b, trace );
	if ( trace.startsolid || trace.allsolid || trace.fraction >= 1 ) return null;
	return trace.endpos[ 2 ];

}

// Visit the existing point hull's crossed leaves in segment order. The solid trace above deliberately ignores
// liquid boundaries, so its fraction cannot answer this query; sampling can miss a thin pool. No physics changes.
function boundary( model, p, z, wanted ) {
 const hull = hullOf( model );
 if ( ! hull || ! Number.isFinite( z ) ) return undefined;
 const stack = [ [ hull.firstclipnode, 0, 1 ] ];
 let visits = 0;
 while ( stack.length && visits ++ < 4096 ) {
  const [ node, a, b ] = stack.pop();
  if ( node < 0 ) { if ( wanted( node ) ) return { z: p[ 2 ] + ( z - p[ 2 ] ) * a, contents: node, insideZ: p[ 2 ] + ( z - p[ 2 ] ) * ( a + b ) * 0.5 }; continue; }
  const clip = hull.clipnodes[ node ], plane = clip && hull.planes[ clip.planenum ];
  if ( ! plane ) return undefined;
  const d = t => plane.normal[ 0 ] * p[ 0 ] + plane.normal[ 1 ] * p[ 1 ] + plane.normal[ 2 ] * ( p[ 2 ] + ( z - p[ 2 ] ) * t ) - plane.dist;
  const da = d( a ), db = d( b );
  if ( da >= 0 && db >= 0 ) { stack.push( [ clip.children[ 0 ], a, b ] ); continue; }
  if ( da < 0 && db < 0 ) { stack.push( [ clip.children[ 1 ], a, b ] ); continue; }
  const mid = a + ( b - a ) * da / ( da - db ), first = da >= 0 ? 0 : 1;
  stack.push( [ clip.children[ 1 - first ], mid, b ], [ clip.children[ first ], a, mid ] );
 }
 return stack.length ? undefined : null;
}

/** First exact liquid entry below an open point, stopped by world solid; null means no liquid, undefined means the bounded query could not prove the result. */
export function FX_LiquidBelow( model, p, bottom ) {
 if ( ! ( bottom < p[ 2 ] ) || FX_IsLiquid( FX_Contents( model, p ) ) ) return null;
 const hit = boundary( model, p, bottom, c => c === FX_SOLID || FX_IsLiquid( c ) );
 return hit === undefined ? undefined : hit && FX_IsLiquid( hit.contents ) ? hit : null;
}

/** First exact open surface above a liquid point (world hull only); null if solid caps it or reach is exceeded. */
export function FX_LiquidAbove( model, p, reach = 512 ) {
 if ( ! FX_IsLiquid( FX_Contents( model, p ) ) || ! ( reach > 0 ) ) return null;
 const hit = boundary( model, p, p[ 2 ] + reach, c => ! FX_IsLiquid( c ) );
 return hit && hit.contents === FX_EMPTY ? hit.z : null;
}
