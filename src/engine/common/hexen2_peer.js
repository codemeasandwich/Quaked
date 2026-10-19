/**
 * @module engine/common/hexen2_peer
 *
 * Message framing for the private Hexen session: a 16-bit little-endian length before each preamble or datagram, so a
 * stream transport (the native TCP adapter or a test socket) can split messages without reading body internals. The
 * bounds refuse an empty, oversized or truncated frame rather than growing a buffer, and unframing keeps the partial
 * tail for the next read.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; malformed input is `{ ok: false, reason }`.
 */

/** The largest private frame the session accepts (the datagram codec's own limit is smaller). */
export const HEXEN2_FRAME_MAX = 16384;

/**
 * Frames one private message.
 *
 * @param {ArrayLike<number>} bytes the message bytes
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the framed message
 */
export function Hexen2_Frame( bytes ) {

	if ( ! bytes || bytes.length === 0 ) return { ok: false, reason: 'an empty frame' };
	if ( bytes.length > HEXEN2_FRAME_MAX ) return { ok: false, reason: 'the frame exceeds the private limit' };
	const out = new Uint8Array( 2 + bytes.length );
	out[ 0 ] = bytes.length & 0xff;
	out[ 1 ] = ( bytes.length >> 8 ) & 0xff;
	out.set( bytes, 2 );
	return { ok: true, bytes: out };

}

/**
 * Splits a received buffer into complete frames.
 *
 * @param {ArrayLike<number>} buffer the received bytes
 * @returns {{ ok: true, frames: ReadonlyArray<Uint8Array>, rest: Uint8Array } | { ok: false, reason: string }} the
 *   complete frames (payloads) and the partial tail
 */
export function Hexen2_Unframe( buffer ) {

	const frames = [];
	let at = 0;
	while ( at + 2 <= buffer.length ) {

		const length = buffer[ at ] | ( buffer[ at + 1 ] << 8 );
		if ( length === 0 ) return { ok: false, reason: 'an empty frame' };
		if ( length > HEXEN2_FRAME_MAX ) return { ok: false, reason: 'a frame exceeds the private limit' };
		if ( at + 2 + length > buffer.length ) break; // wait for the rest of this frame
		frames.push( Uint8Array.from( Array.from( buffer ).slice( at + 2, at + 2 + length ) ) );
		at += 2 + length;

	}
	return { ok: true, frames, rest: Uint8Array.from( Array.from( buffer ).slice( at ) ) };

}
