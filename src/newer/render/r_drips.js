/**
 * @module newer/render/r_drips
 *
 * Water that can be seen dripping where the map plays its drip, for every game (card T-3faa98e3 item 6,
 * docs/drips-2026-10-13.md): where a map places the dripping sound (`ambience/drip1.wav`, Quake's
 * `ambient_drip`; any game or add-on that places that sound) a drop falls from the ceiling above it every second or
 * two, and breaks on the floor or rings the pool it falls into. Stock Quake only plays the sound. Newer Game only;
 * drawn by the shared mote layer (r_motes.js); a ring on a pool is one of the existing impact ripples
 * (r_impactripples.js), made only while no others are alive so later shots and bodies evict the drip first. The sound
 * itself and the drops on the lens (r_screendrops.js) are untouched.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `sources` (one per drip of the map) and `seen`.
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl } from '../../engine/client/client.js';
import { R_MoteSpawn, R_MotesRemove, R_MotesRegister, R_MotesListen, MOTE_DRIP, MOTE_SPLASH } from './r_motes.js';
import { R_AmbientPlaces, R_AmbientPlacesVersion } from './r_ambientplaces.js';
import { R_ImpactSegment, R_ImpactRippleCount } from './r_impactripples.js';
import { FX_Random, FX_Stop, FX_Contents, FX_LiquidBelow, FX_IsLiquid, FX_SOLID, FX_LAVA } from './fx_world.js';

/** Visible drips: 0 off, 1 on (saved; Options, Newer features). */
export const r_drips = new cvar_t( 'r_drips', '1', true );

/**
 * The sound that marks a drip; how near the view one must be to show; the seconds between its drops; how far above
 * the sound's place a ceiling is looked for and how far below it a floor; the least fall worth showing; how many
 * impact ripples may be alive for a drop to add its own, and that ring's strength (a shotgun pellet's is 0.35).
 */
export const DRIPS = Object.freeze( { sound: 'ambience/drip1.wav', reach: 900, wait: [ 1.2, 3 ], up: 256, down: 2048, least: 12, ripples: 1, ring: 0.12 } );

let sources = [], seen = - 1;

function reset() { sources = []; seen = - 1; }

// where a drip's drops start and end: the ceiling over the sound's place (the place itself under an open sky or a
// ceiling too far up) down to the floor or the first pool; null when it is in a wall or has no fall to show
function path( p ) {

	const model = cl.worldmodel;
	const sourceContents = FX_Contents( model, p );
 if ( sourceContents === FX_SOLID || FX_IsLiquid( sourceContents ) ) return null;
	const ceiling = FX_Stop( model, p, DRIPS.up );
	const top = [ p[ 0 ], p[ 1 ], ceiling !== null ? ceiling - 0.5 : p[ 2 ] ];
	if ( FX_IsLiquid( FX_Contents( model, top ) ) ) return null; // (a sound placed under water: nothing falls there)
	const floor = FX_Stop( model, top, - DRIPS.down );
	if ( floor === null ) return null;
	const pool = FX_LiquidBelow( model, top, floor );
 if ( pool === undefined ) return null; // an exhausted/malformed query is not proof of a dry column
	const low = pool ? pool.z : floor;
	return top[ 2 ] - low < DRIPS.least ? null : { top: top[ 2 ], low, pool: pool ? pool.contents : 0 };

}

function frame( time, eye, advancing = true ) {

	if ( ! ( r_drips.value > 0 ) ) { R_MotesRemove( 'drips' ); return; }
 if ( ! advancing || ! eye || ! cl.worldmodel ) return;
	if ( seen !== R_AmbientPlacesVersion() ) {

		seen = R_AmbientPlacesVersion();
		sources = R_AmbientPlaces( DRIPS.sound ).map( p => ( { p, next: time + FX_Random() * DRIPS.wait[ 1 ], path: undefined } ) );

	}
	let pathsLeft = 4; // bound first-arrival tracing work, then reuse each proven column
	for ( const s of sources ) {

		if ( time < s.next ) continue;
		s.next = time + DRIPS.wait[ 0 ] + FX_Random() * ( DRIPS.wait[ 1 ] - DRIPS.wait[ 0 ] );
		const p = s.p;
		if ( Math.hypot( p[ 0 ] - eye[ 0 ], p[ 1 ] - eye[ 1 ], p[ 2 ] - eye[ 2 ] ) > DRIPS.reach ) continue;
		if ( s.path === undefined ) { if ( pathsLeft === 0 ) { s.next = time; continue; } pathsLeft --; s.path = path( p ); }
		if ( s.path === null ) continue;
		// The drop stays in the exact column whose ceiling and landing surface were traced.
		R_MoteSpawn( MOTE_DRIP, p[ 0 ], p[ 1 ], s.path.top, 0, 0, - 30, time, { low: s.path.low, life: 8 } );

	}

}

// a drop has come down at (x, y, z): into a pool it rings it (and throws up very little); on the floor it breaks into
// a few specks; into lava it is gone
function landed( x, y, z, atHigh, time ) {

	if ( atHigh || ! cl.worldmodel || ! ( r_drips.value > 0 ) ) return;
	// Use the actual crossed leaf, including pools thinner than the former two-unit sample.
 const pool = FX_LiquidBelow( cl.worldmodel, [ x, y, z + 0.1 ], z - 0.1 );
 if ( pool === undefined ) return;
 const under = pool?.contents ?? FX_Contents( cl.worldmodel, [ x, y, z - 0.01 ] );
	if ( under === FX_LAVA ) return;
	const wet = FX_IsLiquid( under );
	if ( wet && R_ImpactRippleCount() < DRIPS.ripples ) R_ImpactSegment( x, y, z + 0.1, x, y, pool?.insideZ ?? z - 0.01, time, DRIPS.ring );
	const n = wet ? 2 : 3 + Math.floor( FX_Random() * 2 );
	for ( let i = 0; i < n; i ++ ) {

		const a = FX_Random() * Math.PI * 2, out = 12 + FX_Random() * 26;
		R_MoteSpawn( MOTE_SPLASH, x, y, z + 0.5, Math.cos( a ) * out, Math.sin( a ) * out, 45 + FX_Random() * 55, time, { low: z - 1, size: 0.7 + FX_Random() * 0.5 } );

	}

}

R_MotesRegister( { frame, reset } );
R_MotesListen( MOTE_DRIP, landed );

/**
 * The map's drips as this module holds them, for tests and trials.
 *
 * @returns {Array<{ p: Array<number>, next: number, path: (?{ top: number, low: number, pool: number }|undefined) }>}
 *   each drip: the sound's place, when its next drop falls, and its drops' path once looked for (null: none)
 */
export function R_DripsSnapshot() { return sources.map( s => ( { p: s.p.slice(), next: s.next, path: s.path ? { ...s.path } : s.path } ) ); }
