/**
 * @module newer/render/r_sparks
 *
 * Sparks at the map's sparking lights, for every game (card T-3faa98e3 item 7, docs/sparks-2026-10-13.md):
 * where a map plays the buzzing-light sound (`ambience/buzz1.wav`, Quake's `light_fluorospark`; any game or add-on
 * that places that sound) a few sparks fall from it every few seconds. Stock Quake only plays the sound. Newer Game
 * only; drawn by the shared mote layer (r_motes.js). The light itself, its flicker and its sound are untouched.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `sources` (one per sparking light of the map) and `seen`.
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl } from '../../engine/client/client.js';
import { R_MoteSpawn, R_MotesRemove, R_MotesRegister, MOTE_SPARK } from './r_motes.js';
import { R_AmbientPlaces, R_AmbientPlacesVersion } from './r_ambientplaces.js';
import { FX_Random, FX_Blocked, FX_Contents, FX_EMPTY } from './fx_world.js';

/** Sparks at sparking lights: 0 off, 1 on (saved; Options, Newer features). */
export const r_sparks = new cvar_t( 'r_sparks', '1', true );

/** The sound that marks a sparking light, how near the view one must be to spark, and the seconds between its bursts. */
export const SPARKS = Object.freeze( { sound: 'ambience/buzz1.wav', reach: 900, wait: [ 1.5, 6 ], count: [ 4, 9 ] } );

let sources = [], seen = - 1, wasOff = false;

function reset() { sources = []; seen = - 1; wasOff = false; }

function frame( time, eye, advancing = true ) {

	if ( ! ( r_sparks.value > 0 ) ) { R_MotesRemove( 'sparks' ); wasOff = true; return; }
 if ( ! advancing || ! eye || ! cl.worldmodel ) return;
	if ( seen !== R_AmbientPlacesVersion() ) {

		seen = R_AmbientPlacesVersion();
		// (each light's first burst comes at its own moment, not all together as the map starts)
		sources = R_AmbientPlaces( SPARKS.sound ).map( p => ( { p, next: time + FX_Random( 'sparks' ) * SPARKS.wait[ 1 ], valid: undefined } ) );

	}
	// switched back on: each light's next burst comes at its own moment again, not every light at once
	if ( wasOff ) { wasOff = false; for ( const s of sources ) s.next = time + FX_Random( 'sparks' ) * SPARKS.wait[ 1 ]; }
	let checksLeft = 8;
	for ( const s of sources ) {

		if ( time < s.next ) continue;
		s.next = time + SPARKS.wait[ 0 ] + FX_Random( 'sparks' ) * ( SPARKS.wait[ 1 ] - SPARKS.wait[ 0 ] );
		const p = s.p;
		if ( Math.hypot( p[ 0 ] - eye[ 0 ], p[ 1 ] - eye[ 1 ], p[ 2 ] - eye[ 2 ] ) > SPARKS.reach ) continue;
  // Validate the actual spawn, once, with a bounded amount of new-source work per frame.
  if ( s.valid === undefined ) {
   if ( checksLeft === 0 ) { s.next = time; continue; } checksLeft --;
   s.valid = FX_Contents( cl.worldmodel, p ) === FX_EMPTY && FX_Contents( cl.worldmodel, [ p[ 0 ], p[ 1 ], p[ 2 ] - 1 ] ) === FX_EMPTY;
  }
  if ( ! s.valid ) continue;
		const n = SPARKS.count[ 0 ] + Math.floor( FX_Random( 'sparks' ) * ( SPARKS.count[ 1 ] - SPARKS.count[ 0 ] + 1 ) );
		for ( let i = 0; i < n; i ++ ) {

			// thrown out sideways and a little up or down; their weight brings them down
			const a = FX_Random( 'sparks' ) * Math.PI * 2, out = 25 + FX_Random( 'sparks' ) * 70;
			R_MoteSpawn( MOTE_SPARK, p[ 0 ], p[ 1 ], p[ 2 ] - 1, Math.cos( a ) * out, Math.sin( a ) * out, - 20 + FX_Random( 'sparks' ) * 90, time,
				{ life: 0.3 + FX_Random( 'sparks' ) * 0.45, size: 0.8 + FX_Random( 'sparks' ) * 0.5 } );

		}

	}

}

R_MotesRegister( { owner: 'sparks', frame, reset, blocksMotion: ( from, to ) => FX_Blocked( cl.worldmodel, from, to ) } );

/**
 * The map's sparking lights as this module holds them, for tests and trials.
 *
 * @returns {Array<{ p: Array<number>, next: number, valid: (boolean|undefined) }>} each light: where, when it next
 *   sparks, and whether its actual spawn is open once checked
 */
export function R_SparksSnapshot() { return sources.map( s => ( { p: s.p.slice(), next: s.next, valid: s.valid } ) ); }
