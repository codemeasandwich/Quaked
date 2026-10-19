/**
 * @module engine/client/hexen2_native_ui
 *
 * Pure decisions behind the native Hexen II UI/host wiring: the start gate's class/difficulty defaults, the mixer
 * arguments for a gamecode sound (the local bridge), and the charset sheet width. Extracted so the behaviour the owner
 * compared against native and the code-first host modules can be tested without a canvas or AudioContext.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; invalid input falls back to the documented default.
 */

import { HEXEN2_CLASS_IDS } from '../common/hexen2_profile.js';

/** The four base classes offered by the native start gate. */
export const HEXEN2_START_CLASSES = Object.freeze( [ 'paladin', 'crusader', 'necromancer', 'assassin' ] );

/**
 * Validates the gate's choice.
 *
 * @param {{ classId?: string, skill?: number }} [choice] the clicked class and difficulty
 * @returns {{ classId: string, skill: number }} the class (default paladin) and skill 0..3 (default 1, Normal)
 */
export function Hexen2_StartChoice( choice = {} ) {

	const classId = HEXEN2_CLASS_IDS.includes( choice.classId ) ? choice.classId : 'paladin';
	const skill = Number.isInteger( choice.skill ) && choice.skill >= 0 && choice.skill <= 3 ? choice.skill : 1;
	return { classId, skill };

}

/**
 * The mixer arguments for a gamecode sound at an entity.
 *
 * @param {?{ index: number, v?: { origin: ArrayLike<number> } }} entity the speaking entity
 * @param {number} volume native volume 0..255
 * @param {number} attenuation native attenuation
 * @returns {{ entnum: number, origin: number[], fvol: number, attenuation: number }} the arguments for S_StartSound
 */
export function Hexen2_LocalSoundArgs( entity, volume, attenuation ) {

	const origin = entity?.v?.origin;
	return {
		entnum: entity?.v ? entity.index : 0,
		origin: origin ? [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ] : [ 0, 0, 0 ],
		fvol: Math.max( 0, Math.min( 1, ( volume | 0 ) / 255 ) ),
		attenuation
	};

}

/**
 * Plays a gamecode sound through the local mixer as well as the server message writer.
 *
 * @param {?object} entity the speaking entity
 * @param {number} channel native channel
 * @param {string} sample the precache name
 * @param {number} volume native volume 0..255
 * @param {number} attenuation native attenuation
 * @param {{ wire?: function, precache: function(string): ?object, start: function, cache?: Map }} deps the server
 *   writer, the precache lookup, the mixer start and an optional sfx cache
 * @returns {{ ok: true, sfx: object } | { ok: false, reason: string }} whether the mixer started the sound
 */
export function Hexen2_PlayLocalSound( entity, channel, sample, volume, attenuation, deps ) {

	try { deps.wire?.( entity, channel, sample, volume, attenuation ); } catch ( error ) { /* the server write must not stop playback */ }
	const args = Hexen2_LocalSoundArgs( entity, volume, attenuation );
	const cache = deps.cache ?? null;
	let sfx = cache?.get( sample );
	if ( sfx === undefined ) {

		sfx = deps.precache( sample );
		cache?.set( sample, sfx ?? null );

	}
	if ( !sfx ) return { ok: false, reason: 'the sound is not available' };
	deps.start( args.entnum, channel, sfx, args.origin, args.fvol, args.attenuation );
	return { ok: true, sfx };

}


/** The viewmodel's vertical lift above the eye so the weapon clears the native status bar. */
export const HEXEN2_VIEWMODEL_LIFT = 8;

/**
 * The viewmodel's angles: the camera yaw/roll, with pitch negated because alias-model pitch is opposite the camera's
 * positive-down pitch. Without the negation the weapon swings up when looking down (owner-reported inversion).
 *
 * @param {ArrayLike<number>} viewangles the player's view angles
 * @returns {number[]} the entity angles for the viewmodel
 */
export function Hexen2_ViewModelAngles( viewangles ) {

	return [ - viewangles[ 0 ], viewangles[ 1 ], viewangles[ 2 ] ];

}

/**
 * The viewmodel's origin: the player's feet plus the eye offset plus the lift.
 *
 * @param {ArrayLike<number>} origin the player origin
 * @param {ArrayLike<number>|undefined} viewOfs the player's view offset (native 50)
 * @param {number} [lift] vertical lift, defaulting to HEXEN2_VIEWMODEL_LIFT
 * @returns {number[]} the entity origin for the viewmodel
 */
export function Hexen2_ViewModelOrigin( origin, viewOfs, lift = HEXEN2_VIEWMODEL_LIFT ) {

	return [ origin[ 0 ], origin[ 1 ], origin[ 2 ] + ( viewOfs?.[ 2 ] ?? 50 ) + lift ];

}


/**
 * The origin a local sound should be spatialised at. Native clients resolve the entity when the sound packet is processed;
 * brush doors often report origin 0 (and empty entity bounds), so the loaded brush model's bounds centre is used instead of
 * the world origin, where the sound would be inaudible.
 *
 * @param {ArrayLike<number>} origin the entity origin
 * @param {{ mins?: ArrayLike<number>, maxs?: ArrayLike<number> }|null} bounds entity or model bounds
 * @returns {number[]} the sound origin
 */
export function Hexen2_SoundOrigin( origin, bounds ) {

	const o = [ origin?.[ 0 ] ?? 0, origin?.[ 1 ] ?? 0, origin?.[ 2 ] ?? 0 ];
	if ( o[ 0 ] !== 0 || o[ 1 ] !== 0 || o[ 2 ] !== 0 ) return o;
	const lo = bounds?.mins, hi = bounds?.maxs;
	if ( lo && hi && ( lo[ 0 ] || lo[ 1 ] || lo[ 2 ] || hi[ 0 ] || hi[ 1 ] || hi[ 2 ] ) )
		return [ ( lo[ 0 ] + hi[ 0 ] ) / 2, ( lo[ 1 ] + hi[ 1 ] ) / 2, ( lo[ 2 ] + hi[ 2 ] ) / 2 ];
	return o;

}

/** The native entity-effect bit for a spinning bonus item (`EF_ROTATE`). */
export const HEXEN2_EF_ROTATE = 0x0008;

/**
 * The keys that hold the native use action, as DOM `KeyboardEvent.code` values. The platform's full binding path uses
 * the same commands; this helper keeps the page's fallback and its test in agreement.
 *
 * @param {string} code a `KeyboardEvent.code`
 * @returns {boolean} whether the key holds `+use`
 */
export function Hexen2_IsUseKey( code ) {

	return code === 'KeyE' || code === 'Enter';

}

/**
 * A bonus item's locally spun angles. The native Hexen II client spins a model whose **MDL flags** carry
 * `EF_ROTATE` (8) by `anglemod((origin.x + origin.y) * 0.8 + 108 * cl.time)`; the entity's own Hexen effect bits
 * are a different namespace (`EF_DIMLIGHT` is also 8) and must not trigger a spin. Presentation only: the server's
 * angles are never written.
 *
 * @param {number} modelFlags the model's flags (`model_t.flags`, which carries the MDL effect bits)
 * @param {ArrayLike<number>} origin the item's drawn origin
 * @param {number} time the client time in seconds
 * @returns {?number[]} `[0, yaw, 0]` when the item rotates, otherwise null
 */
export function Hexen2_ItemRotation( modelFlags, origin, time ) {

	if ( ( ( modelFlags | 0 ) & HEXEN2_EF_ROTATE ) === 0 ) return null;
	const t = Number.isFinite( time ) ? time : 0;
	const x = Number( origin?.[ 0 ] ) || 0, y = Number( origin?.[ 1 ] ) || 0;
	const yaw = ( ( ( x + y ) * 0.8 + 108 * t ) % 360 + 360 ) % 360;
	return [ 0, yaw, 0 ];

}

/**
 * Drains a deferred local-sound queue, resolving each sound's origin at the moment it is consumed (after that frame's
 * entity movement). The queue is emptied in insertion order; a resolver that throws leaves the remaining sounds queued.
 *
 * @param {Array<{ entnum: number, channel: number, sfx: object, sample: string, volume: number, attenuation: number }>} queue
 *   the pending sounds, drained in place
 * @param {function(object): number[]} originFor the origin resolver
 * @returns {Array<{ sound: object, origin: number[] }>} the sounds and their resolved origins
 */
export function Hexen2_TakeSounds( queue, originFor ) {

	if ( ! Array.isArray( queue ) ) throw new TypeError( 'Hexen2_TakeSounds: a queue array is required' );
	if ( typeof originFor !== 'function' ) throw new TypeError( 'Hexen2_TakeSounds: an origin resolver is required' );
	const out = [];
	while ( queue.length > 0 ) {

		const sound = queue[ 0 ];
		const origin = originFor( sound );
		queue.shift();
		out.push( { sound, origin } );

	}
	return out;

}
