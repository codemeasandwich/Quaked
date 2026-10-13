/**
 * @module newer/render/v_blastshake
 *
 * The view's shake at an explosion nearby, for every game (card T-3faa98e3 item 3, docs/blast-shake-2026-10-13.md):
 * a rocket, a grenade, a Spawn bursting, or Chthon rising out of the lava shakes the picture, more the nearer it
 * is, arriving with the blast (a little after its flash). Physics, aim and server data are unchanged: only the
 * displayed eye moves, as with the Shambler's steps (v_shamblersteps.js, whose own pulses stay as they are). An
 * add-on's own shakes (Arcane Dimensions' `misc_shake`, the mission packs' earthquakes) are done by its QuakeC and
 * need nothing here.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `blasts` (the shakes still playing), `world` and `lastTime`.
 *
 * Errors: none raised here.
 */
import { cl, cls, ca_connected, SIGNONS } from '../../engine/client/client.js';
import { sv } from '../../engine/server/server.js';
import { STAT_HEALTH } from '../../engine/common/quakedef.js';
import { key_dest, key_game } from '../../engine/client/keys.js';
import { R_NewerGame } from '../mode.js';
import { cvar_t } from '../../engine/common/cvar.js';

/** How strongly explosions shake the view: 0 off, 1 as designed (archived; Options, Newer features). */
export const v_blastshake = new cvar_t( 'v_blastshake', '1', true );

/** The kinds of blast: how far each is felt (Quake units), how long it shakes (seconds) and how hard (0..1). */
export const BLAST_ROCKET = Object.freeze( { reach: 640, duration: 0.45, power: 1 } );
export const BLAST_SPAWN = Object.freeze( { reach: 520, duration: 0.4, power: 0.75 } );
export const BLAST_ERUPTION = Object.freeze( { reach: 1600, duration: 1.3, power: 1 } ); // Chthon rising and falling

const LIMITS = [ 2.4, 1.1, 0.7 ]; // vertical units, pitch degrees, roll degrees: the most any number of blasts gives
const SPEED = 2600; // how fast the blast travels (units a second): at 640 units it arrives a quarter of a second late
const RATE = 13; // the shake's beat, a second
const MAX = 16, STALE = 0.3;
const blasts = [];
const offset = new Float64Array( 3 );
let world = null, lastTime = - Infinity;

function playing() {

	return R_NewerGame() && cls.state === ca_connected && cls.signon === SIGNONS && ! cls.demoplayback &&
		cl.worldmodel && ! cl.paused && ! ( sv.active && sv.paused ) && ! cl.intermission &&
		cl.stats[ STAT_HEALTH ] > 0 && key_dest === key_game && v_blastshake.value > 0;

}

/**
 * Notes an explosion, to shake the view when its blast arrives. Called by the client as it reads the explosion
 * (cl_tent.js). Nothing is kept outside Newer Game, in a demo, or with `v_blastshake` 0.
 *
 * @param {Array<number>} pos where it went off (Quake units, world space)
 * @param {{ reach: number, duration: number, power: number }} kind one of BLAST_ROCKET, BLAST_SPAWN, BLAST_ERUPTION
 */
export function V_BlastShakeEvent( pos, kind = BLAST_ROCKET ) {

	if ( ! R_NewerGame() || cls.demoplayback || ! ( v_blastshake.value > 0 ) ) return;
	if ( blasts.length >= MAX ) blasts.shift();
	// which way it rolls and pitches first is taken from where it went off, so the same blast always looks the same
	const seed = Math.abs( Math.round( pos[ 0 ] ) * 3 + Math.round( pos[ 1 ] ) * 5 + Math.round( pos[ 2 ] ) * 7 );
	blasts.push( { x: pos[ 0 ], y: pos[ 1 ], z: pos[ 2 ], time: cl.time, kind, roll: seed & 1 ? 1 : - 1, pitch: seed & 2 ? 1 : - 1 } );

}

/**
 * This frame's shake from the explosions still playing. Each is felt within its reach, with a strength that falls
 * with the square of the distance, from the moment its blast arrives (distance / 2600 seconds after it went off) and
 * dies away over its duration at 13 beats a second. Only the displayed eye changes. Called once per frame by
 * `V_CalcRefdef` (view.js), which adds the result to the view's height, pitch and roll. All zeros (and every blast
 * forgotten) outside Newer Game, while not fully connected, in a demo, paused, at intermission, dead, in a menu or
 * console, on a new map, or with `v_blastshake` 0.
 *
 * @param {Array<number>} playerorg the player's origin (Quake units, world space)
 * @returns {Float64Array} `[ vertical units, pitch degrees, roll degrees ]`, each held within +-2.4, +-1.1, +-0.7 and
 *   scaled by `v_blastshake` (at most 1); one module-owned array reused every call (do not keep it)
 */
export function V_BlastShake( playerorg ) {

	offset.fill( 0 );
	if ( ! playing() ) { blasts.length = 0; world = cl.worldmodel; lastTime = cl.time; return offset; }
	// a new map or a restart (time going back): nothing from before is felt
	if ( world !== cl.worldmodel || cl.time < lastTime - STALE ) { blasts.length = 0; world = cl.worldmodel; lastTime = cl.time; }
	const now = Math.max( cl.time, lastTime );
	lastTime = now;
	for ( let i = blasts.length - 1; i >= 0; i -- ) {

		const b = blasts[ i ], distance = Math.hypot( b.x - playerorg[ 0 ], b.y - playerorg[ 1 ], b.z - playerorg[ 2 ] );
		const age = now - b.time - distance / SPEED;
		if ( b.time > now + STALE || age >= b.kind.duration ) { blasts.splice( i, 1 ); continue; }
		if ( age < 0 || distance >= b.kind.reach ) continue;
		// full at the moment it arrives (a cosine, so no steady frame rate samples only its zeros), then dying away
		const strength = b.kind.power * ( 1 - distance / b.kind.reach ) ** 2 * ( 1 - age / b.kind.duration ) ** 2;
		const beat = age * Math.PI * 2 * RATE;
		offset[ 0 ] -= Math.cos( beat ) * strength * LIMITS[ 0 ];
		offset[ 1 ] += Math.cos( beat * 0.83 ) * strength * LIMITS[ 1 ] * b.pitch;
		offset[ 2 ] += Math.cos( beat * 1.21 ) * strength * LIMITS[ 2 ] * b.roll;

	}
	const scale = Math.min( 1, v_blastshake.value );
	for ( let i = 0; i < 3; i ++ ) offset[ i ] = Math.max( - LIMITS[ i ], Math.min( LIMITS[ i ], offset[ i ] ) ) * scale;
	return offset;

}
