/**
 * @module engine/common/hexen2_signon
 *
 * The Hexen II signon messages a private server sends before play: `svc_serverinfo` (protocol, max clients, game
 * type, level name and the model/sound precache lists, each empty-string terminated), `svc_signonnum` and
 * `svc_setview`. Formats follow the pinned Raven CL_ParseServerInfo; the private stream uses its own protocol number
 * while native demo protocols are recognised for demos. The reader is bounded and refuses truncated lists, too many
 * precaches and an unsupported protocol.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; malformed input is `{ ok: false, reason }`.
 */

import { HEXEN2_SERVER_MESSAGES } from './hexen2_protocol.js';

const MAX_MODELS = 1024, MAX_SOUNDS = 512, MAX_CLIENTS = 16;

class Writer {

	constructor() { this.parts = []; }
	byte( v ) { this.parts.push( v & 0xff ); }
	short( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff ); }
	long( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff, ( v >> 16 ) & 0xff, ( v >>> 24 ) & 0xff ); }
	string( s ) { for ( const ch of String( s ) ) this.parts.push( ch.charCodeAt( 0 ) & 0xff ); this.parts.push( 0 ); }
	bytes() { return Uint8Array.from( this.parts ); }

}

class Reader {

	constructor( bytes ) { this.bytes = bytes; this.at = 0; }
	need( n ) { if ( this.at + n > this.bytes.length ) throw new Error( 'truncated signon message' ); }
	byte() { this.need( 1 ); return this.bytes[ this.at ++ ]; }
	short() { this.need( 2 ); const v = this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ); this.at += 2; return v; }
	long() { this.need( 4 ); const v = this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ) | ( this.bytes[ this.at + 2 ] << 16 ) | ( this.bytes[ this.at + 3 ] << 24 ); this.at += 4; return v; }
	string() { const start = this.at; while ( this.at < this.bytes.length && this.bytes[ this.at ] !== 0 ) this.at ++; if ( this.at >= this.bytes.length ) throw new Error( 'unterminated signon string' ); const s = new TextDecoder().decode( this.bytes.subarray( start, this.at ) ); this.at ++; return s; }

}

/**
 * Writes `svc_serverinfo`.
 *
 * @param {{ protocol: number, maxClients: number, gameType: number, levelName: string,
 *   models: ReadonlyArray<string>, sounds: ReadonlyArray<string> }} info the session's serverinfo
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_WriteServerinfo( info ) {

	if ( !Number.isInteger( info.protocol ) ) return { ok: false, reason: 'invalid protocol' };
	if ( !Number.isInteger( info.maxClients ) || info.maxClients < 1 || info.maxClients > MAX_CLIENTS )
		return { ok: false, reason: 'invalid max clients' };
	if ( !Number.isInteger( info.gameType ) || info.gameType < 0 || info.gameType > 1 ) return { ok: false, reason: 'invalid game type' };
	if ( !Array.isArray( info.models ) || info.models.length > MAX_MODELS ) return { ok: false, reason: 'too many models' };
	if ( !Array.isArray( info.sounds ) || info.sounds.length > MAX_SOUNDS ) return { ok: false, reason: 'too many sounds' };
	const w = new Writer();
	w.byte( HEXEN2_SERVER_MESSAGES.serverinfo );
	w.long( info.protocol );
	w.byte( info.maxClients );
	w.byte( info.gameType );
	w.string( info.levelName ?? '' );
	for ( const name of info.models ) w.string( name );
	w.string( '' );
	for ( const name of info.sounds ) w.string( name );
	w.string( '' );
	return { ok: true, bytes: w.bytes() };

}

/**
 * Reads `svc_serverinfo`.
 *
 * @param {ArrayLike<number>} bytes the message, opcode first
 * @param {{ allowTrailing?: boolean, protocols?: ReadonlyArray<number> }} [options] accepted protocol numbers
 * @returns {{ ok: true, info: object, consumed: number } | { ok: false, reason: string }} the parsed serverinfo
 */
export function Hexen2_ReadServerinfo( bytes, options = {} ) {

	try {

		const r = new Reader( bytes );
		if ( r.byte() !== HEXEN2_SERVER_MESSAGES.serverinfo ) return { ok: false, reason: 'not a serverinfo message' };
		const protocol = r.long(), accepted = options.protocols ?? [ 1019 ];
		if ( !accepted.includes( protocol ) ) return { ok: false, reason: `unsupported protocol ${protocol}` };
		const maxClients = r.byte();
		if ( maxClients < 1 || maxClients > MAX_CLIENTS ) return { ok: false, reason: `bad max clients ${maxClients}` };
		const gameType = r.byte();
		const levelName = r.string();
		const models = [];
		for ( ; ; ) { const name = r.string(); if ( name === '' ) break; if ( models.length >= MAX_MODELS ) return { ok: false, reason: 'too many models' }; models.push( name ); }
		const sounds = [];
		for ( ; ; ) { const name = r.string(); if ( name === '' ) break; if ( sounds.length >= MAX_SOUNDS ) return { ok: false, reason: 'too many sounds' }; sounds.push( name ); }
		if ( !options.allowTrailing && r.at !== bytes.length ) return { ok: false, reason: 'trailing serverinfo bytes' };
		return { ok: true, info: { protocol, maxClients, gameType, levelName, models, sounds }, consumed: r.at };

	} catch ( error ) { return { ok: false, reason: error.message }; }

}

/**
 * Writes `svc_signonnum`.
 *
 * @param {number} number the signon stage (1..4)
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_WriteSignonNum( number ) {

	if ( !Number.isInteger( number ) || number < 1 || number > 4 ) return { ok: false, reason: 'invalid signon number' };
	return { ok: true, bytes: Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.signonnum, number ] ) };

}

/**
 * Reads `svc_signonnum`.
 *
 * @param {ArrayLike<number>} bytes the message, opcode first
 * @returns {{ ok: true, number: number, consumed: number } | { ok: false, reason: string }} the signon stage
 */
export function Hexen2_ReadSignonNum( bytes ) {

	if ( !bytes || bytes.length !== 2 ) return { ok: false, reason: 'malformed signonnum' };
	if ( bytes[ 0 ] !== HEXEN2_SERVER_MESSAGES.signonnum ) return { ok: false, reason: 'not a signonnum message' };
	if ( bytes[ 1 ] < 1 || bytes[ 1 ] > 4 ) return { ok: false, reason: 'invalid signon number' };
	return { ok: true, number: bytes[ 1 ], consumed: 2 };

}

/**
 * Writes `svc_setview`.
 *
 * @param {number} entity the client's view entity number
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_WriteSetView( entity ) {

	if ( !Number.isInteger( entity ) || entity < 0 || entity > 65535 ) return { ok: false, reason: 'invalid view entity' };
	return { ok: true, bytes: Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.setview, entity & 0xff, ( entity >> 8 ) & 0xff ] ) };

}

/**
 * Reads `svc_setview`.
 *
 * @param {ArrayLike<number>} bytes the message, opcode first
 * @returns {{ ok: true, entity: number, consumed: number } | { ok: false, reason: string }} the view entity
 */
export function Hexen2_ReadSetView( bytes ) {

	if ( !bytes || bytes.length !== 3 ) return { ok: false, reason: 'malformed setview' };
	if ( bytes[ 0 ] !== HEXEN2_SERVER_MESSAGES.setview ) return { ok: false, reason: 'not a setview message' };
	return { ok: true, entity: bytes[ 1 ] | ( bytes[ 2 ] << 8 ), consumed: 3 };

}


/**
 * Writes `svc_updateclass` (a client's player class).
 *
 * @param {{ client: number, playerClass: number }} update the client slot (0-based) and native class (1..5)
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_WriteUpdateClass( update ) {

	if ( !Number.isInteger( update.client ) || update.client < 0 || update.client > MAX_CLIENTS )
		return { ok: false, reason: 'invalid client slot' };
	if ( !Number.isInteger( update.playerClass ) || update.playerClass < 1 || update.playerClass > 5 )
		return { ok: false, reason: 'invalid player class' };
	return { ok: true, bytes: Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.updateclass, update.client, update.playerClass ] ) };

}

/**
 * Reads `svc_updateclass`.
 *
 * @param {ArrayLike<number>} bytes the message, opcode first
 * @returns {{ ok: true, update: object, consumed: number } | { ok: false, reason: string }} the class update
 */
export function Hexen2_ReadUpdateClass( bytes ) {

	if ( !bytes || bytes.length !== 3 ) return { ok: false, reason: 'malformed updateclass' };
	if ( bytes[ 0 ] !== HEXEN2_SERVER_MESSAGES.updateclass ) return { ok: false, reason: 'not an updateclass message' };
	if ( bytes[ 2 ] < 1 || bytes[ 2 ] > 5 ) return { ok: false, reason: 'invalid player class' };
	return { ok: true, update: { client: bytes[ 1 ], playerClass: bytes[ 2 ] }, consumed: 3 };

}
