/**
 * @module engine/common/hexen2_wire
 *
 * The private Quaked-Hexen session preamble: protocol number 1019 with the `quaked-hexen2-v1` version, the edition,
 * gamecode mode, rules preset, native class number, the gamecode CRC and the simulation digest. It is deliberately
 * private (never an interoperable Raven stream) and carries no entity data yet: native Hexen message bodies follow
 * the signon this preamble admits. The encoder is bounded and the decoder rejects truncation, unknown enumerations
 * and a foreign protocol/version instead of guessing.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; every rejection is `{ ok: false, reason }`.
 */

import { HEXEN2_LIVE_PROTOCOL, HEXEN2_LIVE_VERSION } from './hexen2_protocol.js';
import { Hexen2_Profile, Hexen2_SelectClass } from './hexen2_profile.js';

const GAME_IDS = Object.freeze( { hexen2: 1, 'hexen2-portals': 2, 'hexen2-demo': 3 } );
const GAMECODE_MODES = Object.freeze( { corrected: 0, installed: 1 } );
const RULES = Object.freeze( { classic: 0, enhanced: 1 } );
const MAX_HELLO_BYTES = 176;
const byValue = ( table, value ) => Object.keys( table ).find( key => table[ key ] === value );

/**
 * The private hello for a session.
 *
 * @param {{ session: object, classId: string, progsCrc: number }} options the validated session, the chosen class
 *   and the loaded program's layout CRC
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the wire bytes
 */
export function Hexen2_EncodeSessionHello( options ) {

	const { session, classId, progsCrc } = options;
	if ( ! session || typeof session !== 'object' ) return { ok: false, reason: 'no session' };
	const gameId = GAME_IDS[ session.gameId ];
	if ( gameId === undefined ) return { ok: false, reason: `unsupported game id: ${String( session.gameId )}` };
	const mode = GAMECODE_MODES[ session.gamecodeMode ];
	if ( mode === undefined ) return { ok: false, reason: `unsupported gamecode mode: ${String( session.gamecodeMode )}` };
	const rules = RULES[ session.rules ];
	if ( rules === undefined ) return { ok: false, reason: `unsupported rules preset: ${String( session.rules )}` };
	const klass = Hexen2_SelectClass( session.gameId, classId );
	if ( ! klass.ok ) return klass;
	const digest = String( session.digest ?? '' );
	if ( digest.length === 0 || digest.length > 80 || !/^[\x20-\x7e]+$/.test( digest ) ) return { ok: false, reason: 'the session digest is missing or malformed' };
	if ( ! Number.isInteger( progsCrc ) || progsCrc < 0 || progsCrc > 0xffffffff ) return { ok: false, reason: 'invalid gamecode CRC' };
	const version = new TextEncoder().encode( HEXEN2_LIVE_VERSION );
	const fingerprint = new TextEncoder().encode( digest );
	const bytes = new Uint8Array( 2 + 1 + version.length + 4 + 4 + 1 + fingerprint.length );
	let at = 0;
	bytes[ at ++ ] = HEXEN2_LIVE_PROTOCOL & 0xff;
	bytes[ at ++ ] = ( HEXEN2_LIVE_PROTOCOL >> 8 ) & 0xff;
	bytes[ at ++ ] = version.length;
	bytes.set( version, at ); at += version.length;
	bytes[ at ++ ] = gameId;
	bytes[ at ++ ] = mode;
	bytes[ at ++ ] = rules;
	bytes[ at ++ ] = klass.number;
	bytes[ at ++ ] = progsCrc & 0xff; bytes[ at ++ ] = ( progsCrc >> 8 ) & 0xff;
	bytes[ at ++ ] = ( progsCrc >> 16 ) & 0xff; bytes[ at ++ ] = ( progsCrc >> 24 ) & 0xff;
	bytes[ at ++ ] = fingerprint.length;
	bytes.set( fingerprint, at ); at += fingerprint.length;
	return { ok: true, bytes: bytes.subarray( 0, at ) };

}

/**
 * Decodes a private hello.
 *
 * @param {ArrayLike<number>} bytes the wire bytes
 * @returns {{ ok: true, hello: object } | { ok: false, reason: string }} the decoded preamble or why it is refused
 */
export function Hexen2_DecodeSessionHello( bytes ) {

	if ( ! bytes || bytes.length < 3 ) return { ok: false, reason: 'truncated hello' };
	if ( bytes.length > MAX_HELLO_BYTES ) return { ok: false, reason: 'oversized hello' };
	const magic = bytes[ 0 ] | ( bytes[ 1 ] << 8 );
	if ( magic !== HEXEN2_LIVE_PROTOCOL ) return { ok: false, reason: `foreign protocol ${magic}` };
	const versionLength = bytes[ 2 ];
	if ( versionLength === 0 || 3 + versionLength + 4 + 1 > bytes.length ) return { ok: false, reason: 'truncated hello' };
	const decoder = new TextDecoder();
	const version = decoder.decode( Uint8Array.from( Array.from( { length: versionLength }, ( _, i ) => bytes[ 3 + i ] ) ) );
	if ( version !== HEXEN2_LIVE_VERSION ) return { ok: false, reason: `unsupported version ${version}` };
	let at = 3 + versionLength;
	if ( at + 4 + 4 + 1 > bytes.length ) return { ok: false, reason: 'truncated hello' };
	const gameId = byValue( GAME_IDS, bytes[ at ++ ] );
	const gamecodeMode = byValue( GAMECODE_MODES, bytes[ at ++ ] );
	const rules = byValue( RULES, bytes[ at ++ ] );
	const classNumber = bytes[ at ++ ];
	const progsCrc = bytes[ at ] | ( bytes[ at + 1 ] << 8 ) | ( bytes[ at + 2 ] << 16 ) | ( bytes[ at + 3 ] << 24 );
	at += 4;
	const fingerprintLength = bytes[ at ++ ];
	if ( ! gameId || ! gamecodeMode || ! rules ) return { ok: false, reason: 'unknown session field' };
	if ( classNumber < 1 || classNumber > 5 ) return { ok: false, reason: `invalid class number ${classNumber}` };
	if ( fingerprintLength === 0 || fingerprintLength > 80 || at + fingerprintLength !== bytes.length ) return { ok: false, reason: 'malformed fingerprint' };
	const fingerprint = decoder.decode( Uint8Array.from( Array.from( { length: fingerprintLength }, ( _, i ) => bytes[ at + i ] ) ) );
	if ( ! /^[\x20-\x7e]+$/.test( fingerprint ) ) return { ok: false, reason: 'malformed fingerprint' };
	if ( Hexen2_Profile( gameId ) === null ) return { ok: false, reason: `unsupported edition ${gameId}` };
	return { ok: true, hello: Object.freeze( { gameId, gamecodeMode, rules, classNumber, progsCrc: progsCrc >>> 0, fingerprint } ) };

}

/**
 * Compares a host's hello with a joining peer's.
 *
 * @param {object} host a decoded hello
 * @param {object} peer a decoded hello
 * @returns {{ ok: true } | { ok: false, reason: string }} whether the peer may join
 */
export function Hexen2_CompareSessionHello( host, peer ) {

	if ( host.gameId !== peer.gameId || host.gamecodeMode !== peer.gamecodeMode || host.rules !== peer.rules )
		return { ok: false, reason: 'game, gamecode mode or rules preset differ' };
	if ( host.progsCrc !== peer.progsCrc ) return { ok: false, reason: 'gamecode CRC differs' };
	if ( host.fingerprint !== peer.fingerprint ) return { ok: false, reason: 'simulation fingerprint differs' };
	return { ok: true };

}
