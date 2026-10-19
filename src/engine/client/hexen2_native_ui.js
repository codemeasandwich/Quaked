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

/** The four base classes offered by the native start gate. */
export const HEXEN2_START_CLASSES = Object.freeze( [ 'paladin', 'crusader', 'necromancer', 'assassin' ] );

/**
 * Validates the gate's choice.
 *
 * @param {{ classId?: string, skill?: number }} [choice] the clicked class and difficulty
 * @returns {{ classId: string, skill: number }} the class (default paladin) and skill 0..3 (default 1, Normal)
 */
export function Hexen2_StartChoice( choice = {} ) {

	const classId = HEXEN2_START_CLASSES.includes( choice.classId ) ? choice.classId : 'paladin';
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
