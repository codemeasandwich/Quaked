/**
 * @module newer/render/r_storm
 *
 * Living skies, item 5 of the add-on effects for every game (card T-3faa98e3, docs/storms-2026-10-14.md), as Arcane
 * Dimensions, Soul of Evil, Abyss of Pandemonium, X-Men and Scourge of Armagon have them:
 *
 * - **Lightning with the thunder.** Whenever a game plays a thunder sound (any sound with "thunder" in its name:
 *   Scourge's random thunder, Arcane Dimensions' and the other add-ons' storms), the sky flashes: two or three quick
 *   flickers over a third of a second, brighter the louder and nearer the thunder, and in Newer Game's lighting the
 *   sun's light on open ground flashes with it. The flash comes with the sound's start; the crack in each game's
 *   thunder follows a few tenths of a second later, as it would. Stock Quake plays no thunder, so its maps get none.
 * - **Gusts.** Out under the sky (where the wind ambient already plays), now and then a gust passes: the game's own
 *   gust sounds where it has them (Arcane Dimensions' `ambience/windgust1..6.wav`), else the game's bound fallback
 *   (Quake's `ambience/windfly.wav`; Hexen II has none),
 *   quietly, on a free channel only, as loud as the wind is there.
 *
 * Newer Game only (not in demos), with the `r_storm` switch. The sky's fog share, the skybox and cloud shadows are
 * untouched: the flash only makes the sky brighter for its moment (R_SkyFlashSet, r_fog.js).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `flashes` (the flickers still to come), `nextGust`, `gustNames`, `world`,
 * `lastEye` and `haveEye`, `lastFlash`, `lastStart` and `lastStrength` (the last flash's start and strength).
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl, cls } from '../../engine/client/client.js';
import { Mod_PointInLeaf } from '../../engine/render/gl_model.js';
import { COM_FindFile } from '../../engine/common/pak.js';
import { R_SkyFlashSet } from '../../engine/render/r_fog.js';
import { S_PrecacheSound, S_StartSoundIfFree, S_AddSoundStarted } from '../../engine/sound/snd_dma.js';
import { AMBIENT_SKY } from '../../engine/sound/sound.js';
import { R_NewerGame } from '../mode.js';
import { FX_Random } from './fx_world.js';
import { NewerBindings } from '../content_bindings.js';

/** Living skies (lightning with the thunder, gusts out under the sky): 0 off, 1 on (saved; Options, Newer features). */
export const r_storm = new cvar_t( 'r_storm', '1', true );

/**
 * The flash's shape: its flickers (seconds after the thunder starts, and their share of its strength), how long each
 * lasts, its brightest, and the least time between two flashes (thunder closer together than a second is one flash,
 * the stronger: no more than three flickers a second, for the eyes' sake).
 */
export const STORM = Object.freeze( { flickers: [ [ 0, 1 ], [ 0.08, 0.55 ], [ 0.2, 0.8 ] ], each: 0.07, most: 1.2, apart: 1, gust: [ 9, 26 ], sky: 96 } );

const flashes = [];
let nextGust = null, gustNames = null, world = null, lastFlash = 0, lastStart = - Infinity, lastStrength = 0;
const lastEye = new Float32Array( 3 );
let haveEye = false;

const on = () => R_NewerGame() && ! cls.demoplayback && r_storm.value > 0;

/**
 * Notes a sound as it starts; a thunder sound lights the sky. Called by the sound system for every sound it starts
 * (S_AddSoundStarted, snd_dma.js).
 *
 * @param {?object} sfx the sound (`sfx_t`)
 * @param {?ArrayLike<number>} origin where it is
 * @param {number} volume 0..1
 * @param {number} attenuation Quake's attenuation (0 everywhere, 1 normal)
 * @param {number} [entnum=-1] the entity that made it
 */
export function R_StormSound( sfx, origin, volume, attenuation, entnum = - 1 ) {

	if ( ! /thunder/i.test( sfx?.name ?? '' ) || ! on() ) return;
	// as loud as Quake's mixer would make it here: falling by attenuation / 1000 a unit (the player's own sounds and
	// those placed nowhere, as the mixer hears them, at full)
	let strength = Math.min( 1, Math.max( 0, volume ) );
	const local = entnum === cl.viewentity || ! origin || ( origin[ 0 ] === 0 && origin[ 1 ] === 0 && origin[ 2 ] === 0 );
	if ( attenuation > 0 && ! local && haveEye ) strength *= Math.max( 0, 1 - Math.hypot( origin[ 0 ] - lastEye[ 0 ], origin[ 1 ] - lastEye[ 1 ], origin[ 2 ] - lastEye[ 2 ] ) * attenuation / 1000 );
	if ( strength <= 0.02 ) return;
	const t = cl.time;
	// thunder within a second of the last flash is the same flash: it keeps the stronger, never adds flickers
	if ( t - lastStart < STORM.apart ) {

		if ( strength > lastStrength ) { const k = strength / ( lastStrength || 1 ); for ( const f of flashes ) f.s *= k; lastStrength = strength; }
		return;

	}
	lastStart = t; lastStrength = strength; flashes.length = 0;
	for ( const [ at, share ] of STORM.flickers ) flashes.push( { t: t + at, s: strength * share } );

}

/**
 * How bright the lightning is now: 0 none, up to 1.6. Each flicker is full at once and gone in 0.07 s.
 *
 * @param {number} time the game's time (`cl.time`)
 * @returns {number}
 */
export function R_StormFlash( time ) {

	if ( ! on() ) { flashes.length = 0; return 0; }
	let v = 0;
	for ( let i = flashes.length - 1; i >= 0; i -- ) {

		const age = time - flashes[ i ].t;
		if ( age > STORM.each || age < - 1 ) { if ( age > STORM.each ) flashes.splice( i, 1 ); continue; }
		if ( age >= 0 ) v = Math.max( v, flashes[ i ].s * ( 1 - age / STORM.each ) );

	}
	return Math.min( STORM.most, v * STORM.most );

}

// the gust sounds this game has: its own windgust1..6, else the game's bound fallback (Quake's windfly; none for a
// game without one, whose storm then flashes silently)
function gusts() {

	if ( world === cl.worldmodel && gustNames ) return gustNames;
	world = cl.worldmodel;
	const own = [ 1, 2, 3, 4, 5, 6 ].map( n => `ambience/windgust${n}.wav` ).filter( n => COM_FindFile( 'sound/' + n ) );
	const fallback = NewerBindings().sounds.stormGust;
	gustNames = own.length ? own : fallback ? [ fallback ] : [];
	return gustNames;

}

/**
 * Moves the storm on one frame: sets the sky's flash and, out under the sky, now and then starts a gust. Called once a
 * frame by the renderer (gl_rmain.js) before the scene is drawn.
 *
 * @param {number} time the game's time (`cl.time`)
 * @param {ArrayLike<number>} eye where the view is
 * @returns {number} the flash now (also given to the sky)
 */
export function R_StormFrame( time, eye ) {

	// (paused, the sky is as always: a flash is never held)
	const flash = cl.paused ? 0 : R_StormFlash( time );
	R_SkyFlashSet( flash ); lastFlash = flash;
	if ( eye ) { lastEye[ 0 ] = eye[ 0 ]; lastEye[ 1 ] = eye[ 1 ]; lastEye[ 2 ] = eye[ 2 ]; haveEye = true; }
	if ( ! on() || ! cl.worldmodel || cl.paused || ! eye ) { nextGust = null; if ( cl.paused ) flashes.length = 0; return flash; }
	if ( nextGust === null || time < nextGust - STORM.gust[ 1 ] ) nextGust = time + STORM.gust[ 0 ] + FX_Random( 'storm' ) * ( STORM.gust[ 1 ] - STORM.gust[ 0 ] );
	if ( time >= nextGust ) {

		nextGust = time + STORM.gust[ 0 ] + FX_Random( 'storm' ) * ( STORM.gust[ 1 ] - STORM.gust[ 0 ] );
		const sky = Mod_PointInLeaf( eye, cl.worldmodel )?.ambient_sound_level?.[ AMBIENT_SKY ] ?? 0;
		if ( sky >= STORM.sky ) {

			const names = gusts(), name = names[ Math.floor( FX_Random( 'storm' ) * names.length ) ];
			if ( name === undefined ) return flash;
			// from somewhere off to one side, as wind comes; heard everywhere near (no attenuation), quietly
			const a = FX_Random( 'storm' ) * Math.PI * 2, at = [ eye[ 0 ] + Math.cos( a ) * 64, eye[ 1 ] + Math.sin( a ) * 64, eye[ 2 ] + 32 ];
			S_StartSoundIfFree( - 1, S_PrecacheSound( name ), at, 0.35 * sky / 255, 0 );

		}

	}
	return flash;

}

/** The flash as last set (R_StormFrame), for the Newer Game sun (r_post_sky.js). */
export function R_StormFlashNow() { return on() ? lastFlash : 0; }

/** Forgets the storm (a new map). Called by the renderer's R_NewMap. */
export function R_StormClear() { flashes.length = 0; nextGust = null; world = null; gustNames = null; lastFlash = 0; lastStart = - Infinity; lastStrength = 0; haveEye = false; R_SkyFlashSet( 0 ); }

S_AddSoundStarted( R_StormSound );
