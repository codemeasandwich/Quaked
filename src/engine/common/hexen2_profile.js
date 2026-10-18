/**
 * @module engine/common/hexen2_profile
 *
 * Hexen II's identities for the first playable increment (docs/hexen2-support-plan.md sections 3 and 4): the three
 * public editions, their native classes and gamecode layout CRCs, the private session protocol, and the validated
 * session descriptor whose simulation fields stay fixed for a run. Pure values and functions: no engine state, no I/O.
 *
 * The descriptor separates what changes the simulation (edition, gamecode mode and digest, rules preset, the named SP
 * features) from what never does (rendering quality, HDR, split comparison): the plan's R12/R23 finding. Its digest
 * covers the simulation fields only, so two runs that differ only in the content root token or in presentation share
 * it; `contentRoot` is an opaque platform token and is never part of a network fingerprint.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws TypeError when the caller passes no descriptor object; every descriptor problem is returned as
 * `{ ok: false, reason }` so the shelf can show the actual failure.
 */

export const HEXEN2_FAMILY = 'hexen2';

/** The replay-only native demo protocols; live sessions use the private number below (plan section 5). */
export const HEXEN2_PROTOCOL = Object.freeze( {
	number: 1019,
	version: 'quaked-hexen2-v1',
	demoVersions: Object.freeze( [ 18, 19 ] )
} );

export const HEXEN2_CLASS_IDS = Object.freeze( [ 'paladin', 'crusader', 'necromancer', 'assassin', 'succubus' ] );

// The native class numbers (`playerclass`), from uhexen2 engine/hexen2/quakedef.h: CLASS_PALADIN 1, CLASS_CRUSADER 2,
// CLASS_NECROMANCER 3, CLASS_ASSASSIN 4, CLASS_SUCCUBUS 5. They are game state, never a UI-only label.
export const HEXEN2_CLASS_NUMBERS = Object.freeze( { paladin: 1, crusader: 2, necromancer: 3, assassin: 4, succubus: 5 } );

export const HEXEN2_CLASSES = Object.freeze( {
	paladin: Object.freeze( { id: 'paladin', name: 'Paladin', number: 1, expansionOnly: false } ),
	crusader: Object.freeze( { id: 'crusader', name: 'Crusader', number: 2, expansionOnly: false } ),
	necromancer: Object.freeze( { id: 'necromancer', name: 'Necromancer', number: 3, expansionOnly: false } ),
	assassin: Object.freeze( { id: 'assassin', name: 'Assassin', number: 4, expansionOnly: false } ),
	succubus: Object.freeze( { id: 'succubus', name: 'Succubus', number: 5, expansionOnly: true } )
} );

export const HEXEN2_BASE_CLASS_IDS = Object.freeze( [ 'paladin', 'crusader', 'necromancer', 'assassin' ] );

/**
 * The program header's own CRC field for each supplied layout (the `PROGHEADER_CRC` check): read from the owner's
 * installed base and Portal programs, which the plan pins. The demo layout is not yet verified, so it has none.
 */
export const HEXEN2_LAYOUT_CRCS = Object.freeze( { base: 38488, portals: 26905 } );

export const HEXEN2_PROFILES = Object.freeze( {
	hexen2: Object.freeze( {
		id: 'hexen2', name: 'Hexen II', edition: 'base', retailVersion: '1.11', demo: false,
		classes: HEXEN2_BASE_CLASS_IDS, layoutCrc: HEXEN2_LAYOUT_CRCS.base
	} ),
	'hexen2-portals': Object.freeze( {
		id: 'hexen2-portals', name: 'Hexen II: Portal of Praevus', edition: 'portals', retailVersion: '1.12', demo: false,
		classes: HEXEN2_CLASS_IDS, layoutCrc: HEXEN2_LAYOUT_CRCS.portals, base: 'hexen2'
	} ),
	'hexen2-demo': Object.freeze( {
		id: 'hexen2-demo', name: 'Hexen II (demo)', edition: 'demo', retailVersion: 'demo 1.11', demo: true,
		classes: HEXEN2_BASE_CLASS_IDS, layoutCrc: null
	} )
} );

export const HEXEN2_GAMECODE_MODES = Object.freeze( [ 'installed', 'corrected' ] );
export const HEXEN2_RULES_PRESETS = Object.freeze( [ 'classic', 'enhanced' ] );

/** The simulation-affecting Enhanced additions of plan section 7; all are Corrected Enhanced single-player only. */
export const HEXEN2_SIMULATION_FEATURES = Object.freeze( [
	'sp_fire_quench',
	'sp_tome_movement',
	'sp_unseen_memory',
	'sp_death_recovery',
	'sp_seamless_hub'
] );

const DIGEST_PATTERN = /^[0-9a-f]{16,64}$/i;

/**
 * A stable, non-cryptographic identity string for local comparisons and test fixtures (FNV-1a 32-bit). It is not a
 * content hash and must not replace the gamecode or asset digests the plan requires before LAN admission.
 *
 * @param {string} text the text to identify
 * @returns {string} `fnv1a32:` and eight lower-case hexadecimal digits
 */
export function Hexen2_Digest( text ) {

	let hash = 0x811c9dc5;
	for ( let i = 0; i < text.length; i ++ ) {

		hash ^= text.charCodeAt( i );
		hash = Math.imul( hash, 0x01000193 ) >>> 0;

	}
	return 'fnv1a32:' + hash.toString( 16 ).padStart( 8, '0' );

}

/**
 * The known Hexen II game entry for a catalogue id.
 *
 * @param {string} gameId `hexen2`, `hexen2-portals` or `hexen2-demo`
 * @returns {?object} the frozen profile, or null
 */
export function Hexen2_Profile( gameId ) {

	return typeof gameId === 'string' && Object.hasOwn( HEXEN2_PROFILES, gameId ) ? HEXEN2_PROFILES[ gameId ] : null;

}

/**
 * Whether an id is one of the three public Hexen II games.
 *
 * @param {string} gameId a catalogue id
 * @returns {boolean} true for a known Hexen II id
 */
export function Hexen2_IsGameId( gameId ) {

	return Hexen2_Profile( gameId ) !== null;

}

/**
 * The native classes an edition offers, as profile objects.
 *
 * @param {string} gameId a Hexen II id
 * @returns {ReadonlyArray<object>} the classes (empty for an unknown id)
 */
export function Hexen2_ClassesFor( gameId ) {

	const profile = Hexen2_Profile( gameId );
	return profile ? Object.freeze( profile.classes.map( id => HEXEN2_CLASSES[ id ] ) ) : Object.freeze( [] );

}

/**
 * The native classes an edition label offers, for a detected installation.
 *
 * @param {string} edition `base`, `portals` or `demo`
 * @returns {ReadonlyArray<object>} the classes (empty for an unknown edition)
 */
export function Hexen2_ClassesForEdition( edition ) {

	const profile = Object.values( HEXEN2_PROFILES ).find( p => p.edition === edition ) ?? null;
	return profile ? Hexen2_ClassesFor( profile.id ) : Object.freeze( [] );

}

/**
 * A native class's number, or null for an unknown id.
 *
 * @param {string} classId a class id
 * @returns {?number} the `playerclass` number
 */
export function Hexen2_ClassNumber( classId ) { return Object.hasOwn( HEXEN2_CLASS_NUMBERS, classId ) ? HEXEN2_CLASS_NUMBERS[ classId ] : null; }

/**
 * The class with a native `playerclass` number.
 *
 * @param {number} number the player class number (1..5)
 * @returns {?object} the class, or null
 */
export function Hexen2_ClassFromNumber( number ) { return Object.values( HEXEN2_CLASSES ).find( entry => entry.number === number ) ?? null; }

/**
 * Validates a class choice for an edition. The Succubus exists only with Portal of Praevus; the demo keeps the four
 * base classes, and an unknown class is refused rather than defaulted.
 *
 * @param {string} gameId `hexen2`, `hexen2-portals` or `hexen2-demo`
 * @param {string} classId a class id
 * @returns {{ ok: true, classId: string, number: number } | { ok: false, reason: string }} the native class number
 */
export function Hexen2_SelectClass( gameId, classId ) {

	const profile = Hexen2_Profile( gameId );
	if ( profile === null ) return { ok: false, reason: `unknown Hexen game id: ${String( gameId )}` };
	const entry = HEXEN2_CLASSES[ classId ];
	if ( entry === undefined ) return { ok: false, reason: `unknown Hexen class: ${String( classId )}` };
	if ( ! profile.classes.includes( entry.id ) )
		return { ok: false, reason: `${entry.name} is not available in ${profile.name}` };
	return { ok: true, classId: entry.id, number: entry.number };

}

/**
 * The digest of a descriptor's simulation fields alone: edition, gamecode mode and digest, rules preset, private
 * protocol and the named SP features. Content root and presentation settings are deliberately excluded.
 *
 * @param {object} session a session descriptor (created or still being built)
 * @returns {string} the stable digest
 */
export function Hexen2_SimulationDigest( session ) {

	const features = {};
	for ( const key of HEXEN2_SIMULATION_FEATURES ) features[ key ] = session.features?.[ key ] === true;
	return Hexen2_Digest( JSON.stringify( {
		family: session.family,
		gameId: session.gameId,
		edition: session.edition,
		gamecodeMode: session.gamecodeMode,
		gamecodeDigest: String( session.gamecodeDigest ?? '' ).toLowerCase(),
		rules: session.rules,
		protocol: session.protocol,
		features
	} ) );

}

function normalizeContentRoot( value ) {

	if ( typeof value !== 'string' ) return null;
	if ( value.length === 0 || value.length > 512 ) return null;
	if ( /[\u0000-\u001f\u007f]/.test( value ) ) return null;
	return value;

}

/**
 * Builds and validates a session descriptor. Gamecode and rules defaults are the plan's: Corrected gamecode and the
 * Classic rules preset for a new run; Installed gamecode must keep its native rules, so Installed + Enhanced is
 * refused rather than silently weakened. Unknown feature names are refused, not dropped.
 *
 * @param {{ gameId: string, contentRoot: string, gamecodeMode?: string, gamecodeDigest?: string, rules?: string,
 *   features?: object }} input the requested descriptor
 * @returns {{ ok: true, session: object } | { ok: false, reason: string }} the frozen descriptor with its digest, or
 *   the first problem
 * @throws {TypeError} when `input` is not an object
 */
export function Hexen2_CreateSession( input ) {

	if ( input === null || typeof input !== 'object' ) throw new TypeError( 'Hexen2_CreateSession: a descriptor object is required' );

	const profile = Hexen2_Profile( input.gameId );
	if ( profile === null ) return { ok: false, reason: `unknown Hexen game id: ${String( input.gameId )}` };

	const contentRoot = normalizeContentRoot( input.contentRoot );
	if ( contentRoot === null ) return { ok: false, reason: 'contentRoot must be a non-empty opaque token of at most 512 characters' };

	const gamecodeMode = input.gamecodeMode ?? 'corrected';
	if ( ! HEXEN2_GAMECODE_MODES.includes( gamecodeMode ) ) return { ok: false, reason: `unknown gamecode mode: ${String( gamecodeMode )}` };

	const rules = input.rules ?? 'classic';
	if ( ! HEXEN2_RULES_PRESETS.includes( rules ) ) return { ok: false, reason: `unknown rules preset: ${String( rules )}` };

	if ( gamecodeMode === 'installed' && rules === 'enhanced' )
		return { ok: false, reason: 'Installed gamecode keeps its native rules: the Enhanced rules preset requires Corrected gamecode' };

	const gamecodeDigest = typeof input.gamecodeDigest === 'string' ? input.gamecodeDigest : '';
	if ( gamecodeDigest !== '' && ! DIGEST_PATTERN.test( gamecodeDigest ) )
		return { ok: false, reason: 'gamecodeDigest must be 16 to 64 hexadecimal characters' };
	if ( gamecodeMode === 'corrected' && gamecodeDigest === '' )
		return { ok: false, reason: 'Corrected gamecode requires the digest of its selected program' };

	if ( input.features !== undefined && ( input.features === null || typeof input.features !== 'object' || Array.isArray( input.features ) ) )
		return { ok: false, reason: 'features must be an object of named boolean switches' };

	const features = {};
	for ( const key of Object.keys( input.features ?? {} ) ) {

		if ( ! HEXEN2_SIMULATION_FEATURES.includes( key ) ) return { ok: false, reason: `unknown simulation feature: ${key}` };

	}
	for ( const key of HEXEN2_SIMULATION_FEATURES ) {

		const value = input.features?.[ key ] ?? false;
		if ( typeof value !== 'boolean' ) return { ok: false, reason: `simulation feature ${key} must be a boolean` };
		if ( value && ! ( rules === 'enhanced' && gamecodeMode === 'corrected' ) )
			return { ok: false, reason: `${key} is a Corrected Enhanced-rules single-player feature` };
		features[ key ] = value;

	}

	const base = Object.freeze( {
		family: HEXEN2_FAMILY,
		gameId: profile.id,
		edition: profile.edition,
		contentRoot,
		gamecodeMode,
		gamecodeDigest: gamecodeDigest.toLowerCase(),
		rules,
		protocol: HEXEN2_PROTOCOL.number,
		protocolVersion: HEXEN2_PROTOCOL.version,
		features: Object.freeze( features )
	} );

	return { ok: true, session: Object.freeze( { ...base, digest: Hexen2_SimulationDigest( base ) } ) };

}

/**
 * Re-validates an existing descriptor: its fields must build, its edition must match its game id, its protocol must
 * be the private one and its digest (when recorded) must match the simulation fields. A descriptor that fails is
 * never silently repaired.
 *
 * @param {object} session the descriptor to check
 * @returns {{ ok: true, session: object } | { ok: false, reason: string }} the canonical descriptor, or the problem
 * @throws {TypeError} when `session` is not an object
 */
export function Hexen2_ValidateSession( session ) {

	if ( session === null || typeof session !== 'object' ) throw new TypeError( 'Hexen2_ValidateSession: a descriptor object is required' );

	const created = Hexen2_CreateSession( session );
	if ( ! created.ok ) return created;

	if ( session.edition !== undefined && session.edition !== created.session.edition )
		return { ok: false, reason: `edition ${String( session.edition )} does not match game ${created.session.gameId}` };
	if ( session.protocol === undefined || session.protocolVersion === undefined )
		return { ok: false, reason: 'the descriptor has no private session protocol identity' };
	if ( session.protocol !== HEXEN2_PROTOCOL.number || session.protocolVersion !== HEXEN2_PROTOCOL.version )
		return { ok: false, reason: 'the descriptor names a protocol other than the private Quaked-Hexen session' };
	if ( session.digest !== undefined && session.digest !== created.session.digest )
		return { ok: false, reason: 'the descriptor digest does not match its simulation fields' };

	return { ok: true, session: created.session };

}

/**
 * Whether a descriptor runs the deliberate Enhanced rules additions (Corrected Enhanced single-player only).
 *
 * @param {object} session a validated descriptor
 * @returns {boolean} true when the SP rules apply
 */
export function Hexen2_EnhancedRules( session ) {

	return session?.rules === 'enhanced' && session?.gamecodeMode === 'corrected';

}
