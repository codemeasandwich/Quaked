/**
 * @module engine/common/hexen2_stream
 *
 * The private Hexen session datagram: `svc_time`, `svc_clientdata` and, when stats changed, `svc_update_inv`, each
 * body written by the native-format codec. It is the player-channel stream a private peer sends after the session
 * preamble; entity/effect messages are not part of it yet. Parsing dispatches by opcode and refuses an unknown
 * opcode, a truncated body or trailing bytes instead of continuing desynchronised.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; a malformed datagram is `{ ok: false, reason }`.
 */

import { HEXEN2_SERVER_MESSAGES } from './hexen2_protocol.js';
import { Hexen2_EncodeClientdata, Hexen2_DecodeClientdata, Hexen2_EncodeUpdateInv, Hexen2_DecodeUpdateInv } from './hexen2_clientdata.js';

const MAX_DATAGRAM = 1400;

/**
 * Writes a private player datagram.
 *
 * @param {object} player the player edict
 * @param {{ time: number, bits?: number, weaponModelIndex?: number, statsMask?: bigint,
 *   stringAt?: function(number): string }} [options] the server time and optional clientdata/stat selections
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the datagram, or why it is refused
 */
export function Hexen2_WritePrivateDatagram( player, options = {} ) {

	const time = options.time;
	if ( ! player || ! player.v ) return { ok: false, reason: 'no player' };
	if ( typeof time !== 'number' || !Number.isFinite( time ) ) return { ok: false, reason: 'invalid server time' };
	const parts = [ HEXEN2_SERVER_MESSAGES.time, ...floatBytes( time ),
		HEXEN2_SERVER_MESSAGES.clientdata, ...Hexen2_EncodeClientdata( player, options ) ];
	if ( options.statsMask !== undefined && options.statsMask !== 0n )
		parts.push( HEXEN2_SERVER_MESSAGES.update_inv, ...Hexen2_EncodeUpdateInv( player, options.statsMask, options.stringAt ) );
	const bytes = Uint8Array.from( parts );
	if ( bytes.length > MAX_DATAGRAM ) return { ok: false, reason: 'the datagram exceeds the private limit' };
	return { ok: true, bytes };

}

function floatBytes( value ) { const b = new Uint8Array( 4 ); new DataView( b.buffer ).setFloat32( 0, value, true ); return b; }

/**
 * Parses a private player datagram.
 *
 * @param {ArrayLike<number>} bytes the datagram
 * @returns {{ ok: true, time: number, clientdata: object, stats?: object } | { ok: false, reason: string }} what it
 *   carried, or why it is refused
 */
export function Hexen2_ParsePrivateDatagram( bytes ) {

	if ( ! bytes || bytes.length < 5 ) return { ok: false, reason: 'truncated datagram' };
	if ( bytes.length > MAX_DATAGRAM ) return { ok: false, reason: 'oversized datagram' };
	let at = 0;
	const opcode = () => bytes[ at ++ ];
	if ( opcode() !== HEXEN2_SERVER_MESSAGES.time ) return { ok: false, reason: 'a private datagram must start with svc_time' };
	if ( at + 4 > bytes.length ) return { ok: false, reason: 'truncated server time' };
	const time = new DataView( Uint8Array.from( Array.from( bytes.subarray( at, at + 4 ) ) ).buffer ).getFloat32( 0, true );
	at += 4;
	if ( at >= bytes.length || opcode() !== HEXEN2_SERVER_MESSAGES.clientdata ) return { ok: false, reason: 'missing svc_clientdata' };
	const rest = Uint8Array.from( Array.from( bytes.subarray( at ) ) );
	const client = Hexen2_DecodeClientdata( rest, { allowTrailing: true } );
	if ( ! client.ok ) return { ok: false, reason: 'clientdata: ' + client.reason };
	const bodyLength = client.consumed;
	if ( bodyLength < rest.length ) {

		if ( rest[ bodyLength ] !== HEXEN2_SERVER_MESSAGES.update_inv ) return { ok: false, reason: 'unknown opcode after clientdata' };
		const stats = Hexen2_DecodeUpdateInv( rest.subarray( bodyLength + 1 ) );
		if ( ! stats.ok ) return { ok: false, reason: 'update_inv: ' + stats.reason };
		return { ok: true, time, clientdata: client.clientdata, stats: stats.stats, statsMask: stats.mask };

	}
	return { ok: true, time, clientdata: client.clientdata };

}
