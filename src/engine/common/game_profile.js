/**
 * @module engine/common/game_profile
 *
 * The active game family for this session (docs/hexen2/unified-host.md §2-3): Quake by default, or Hexen II (with its
 * demo and Portal of Praevus editions). It is chosen once, from the selected catalogue game, before packs are mounted,
 * and confirmed when the progs load (their header CRC). Shared engine code reads the profile's data (hulls, limits,
 * frame time, protocol family, content bindings) instead of carrying a second code path per game.
 *
 * Types: plain frozen objects.
 *
 * State: one module-level `active` profile; `GameProfile_Set` replaces it, and every other export reads it.
 *
 * Errors: `GameProfile_Set` throws on an unknown game family; `GameProfile_ConfirmProgs` returns the mismatch reason
 * instead of throwing, so the host can report it.
 */

/** Hull mins/maxs shared by every Hexen II edition (uhexen2 engine/h2shared/model.c, Mod_LoadSubmodels). */
const HEXEN2_HULLS = Object.freeze( [
	Object.freeze( { mins: [ 0, 0, 0 ], maxs: [ 0, 0, 0 ] } ), // 0 point
	Object.freeze( { mins: [ - 16, - 16, - 24 ], maxs: [ 16, 16, 32 ] } ), // 1 player
	Object.freeze( { mins: [ - 24, - 24, - 20 ], maxs: [ 24, 24, 20 ] } ), // 2 scorpion
	Object.freeze( { mins: [ - 16, - 16, - 12 ], maxs: [ 16, 16, 16 ] } ), // 3 crouch
	Object.freeze( { mins: [ - 40, - 40, - 42 ], maxs: [ 40, 40, 42 ] } ), // 4 hydra (Portal: pentacle, below)
	Object.freeze( { mins: [ - 48, - 48, - 50 ], maxs: [ 48, 48, 50 ] } ) // 5 golem
] );
const PORTALS_HULL4 = Object.freeze( { mins: [ - 8, - 8, - 8 ], maxs: [ 8, 8, 8 ] } );

const QUAKE = Object.freeze( {
	family: 'quake',
	id: 'quake',
	portals: false,
	demo: false,
	progsCrcs: Object.freeze( [] ), // any Quake progs (stock or a mod's own) is accepted
	protocolVersions: Object.freeze( [ 15, 1015 ] ), // PROTOCOL_VERSION and PROTOCOL_LARGE
	hullCount: 4,
	hulls: null, // the BSP loader's existing Quake hull sizes
	frameTime: 0.1, // OP_STATE think delay
	modelDir: 'progs/',
	startMap: null, // Quake's quake.rc starts the attract demos; the menu owns New Game
	startupScript: 'quake.rc', // Host_Init execs it before the saved configuration
	maxEdicts: null, // the server's existing protocol-dependent limit
	maxPacks: null // Quake stops at the first missing pakN.pak
} );

function hexen2( id, { portals = false, demo = false } = {} ) {

	const hulls = HEXEN2_HULLS.slice();
	if ( portals ) hulls[ 4 ] = PORTALS_HULL4;
	return Object.freeze( {
		family: 'hexen2',
		id,
		portals,
		demo,
		// header CRCs: 38488 is the base layout (retail 1.11 and the demo), 26905 Portal of Praevus (uhexen2 progdefs.h)
		progsCrcs: Object.freeze( portals ? [ 26905 ] : [ 38488 ] ),
		protocolVersions: Object.freeze( portals ? [ 19, 18 ] : [ 18 ] ), // the first is what this session's server sends
		hullCount: 8, // dmodel_t carries 8 headnodes; hulls 0-5 are populated
		hulls: Object.freeze( hulls ),
		frameTime: 0.05, // HX_FRAME_TIME
		modelDir: 'models/',
		// the first maps of each edition (uhexen2: demo1 opens the base campaign, keep1 Portal); hexen.rc opens the
		// menu, as native Hexen II does, so a host that would start Quake's attract demos starts these only on request
		startMap: portals ? 'keep1' : 'demo1',
		startupScript: 'hexen.rc',
		maxEdicts: 600,
		maxPacks: 10 // probe pak0..pak9 across gaps (Portal ships only pak3)
	} );

}

/** Every known profile by catalogue game id; any other catalogue id (Quake, its add-ons and mods) is Quake. */
export const GAME_PROFILES = Object.freeze( {
	quake: QUAKE,
	hexen2: hexen2( 'hexen2' ),
	'hexen2-demo': hexen2( 'hexen2-demo', { demo: true } ),
	'hexen2-portals': hexen2( 'hexen2-portals', { portals: true } )
} );

let active = QUAKE;

/**
 * The profile for a catalogue game id: its own when it is a Hexen II edition, Quake for every other game.
 *
 * @param {string} gameId the catalogue id (`shareware`, `quake`, `hipnotic`, `hexen2`, `hexen2-portals`, ...)
 * @returns {object} the frozen profile
 */
export function GameProfile_For( gameId ) {

	return Object.hasOwn( GAME_PROFILES, gameId ) ? GAME_PROFILES[ gameId ] : QUAKE;

}

/**
 * Selects the session's profile. Called by the host before packs are mounted.
 *
 * @param {string|object} gameIdOrProfile a catalogue game id or one of `GAME_PROFILES`
 * @returns {object} the now-active profile
 * @throws {TypeError} when given an object that is not a known profile
 */
export function GameProfile_Set( gameIdOrProfile ) {

	if ( typeof gameIdOrProfile === 'object' && gameIdOrProfile !== null ) {

		if ( ! Object.values( GAME_PROFILES ).includes( gameIdOrProfile ) ) throw new TypeError( 'GameProfile_Set: not a known profile' );
		active = gameIdOrProfile;

	} else active = GameProfile_For( String( gameIdOrProfile ?? 'quake' ) );
	return active;

}

/** @returns {object} the active profile (Quake until a Hexen II game is selected) */
export function GameProfile_Get() { return active; }

/** @returns {boolean} true while the active game is any Hexen II edition */
export function GameProfile_IsHexen2() { return active.family === 'hexen2'; }

/**
 * Checks loaded progs against the active profile.
 *
 * @param {number} crc the progs header CRC
 * @returns {?string} null when they belong to this game, else why not
 */
export function GameProfile_ConfirmProgs( crc ) {

	if ( active.family === 'quake' ) return GAME_PROFILES.hexen2.progsCrcs.includes( crc ) || GAME_PROFILES[ 'hexen2-portals' ].progsCrcs.includes( crc )
		? `progs CRC ${crc} is Hexen II gamecode, but a Quake game is selected` : null;
	return active.progsCrcs.includes( crc ) ? null : `progs CRC ${crc} is not ${active.id} gamecode (expected ${active.progsCrcs.join( ' or ' )})`;

}
