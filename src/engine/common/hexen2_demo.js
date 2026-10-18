/**
 * @module engine/common/hexen2_demo
 *
 * Hexen II's native demo file framing (pinned uhexen2 engine/hexen2/cl_demo.c): a forcing CD-track line written as
 * `"%i\n"` (normally `-1`), then for every message a little-endian int32 length, three little-endian float32 view
 * angles and that many message bytes. The payload is a native server message stream, so the demo reader is selected by
 * the protocol family and is playback-only (plan section 5): it never feeds a live server.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: returns `{ ok: false, reason }` for malformed or truncated framing; never throws for file content.
 */

import { HEXEN2_NET_LIMITS } from './hexen2_protocol.js';

/** The maximum payload of one demo message (the native MAX_MSGLEN). */
export const HEXEN2_DEMO_MAX_MESSAGE = HEXEN2_NET_LIMITS.maxMessageBytes;

/** How many bytes a framing header costs before its payload: length (4) plus three view angles (12). */
export const HEXEN2_DEMO_RECORD_HEADER = 16;

function bytesOf( data ) {

	if ( data instanceof ArrayBuffer ) return new Uint8Array( data );
	if ( ArrayBuffer.isView( data ) ) return new Uint8Array( data.buffer, data.byteOffset, data.byteLength );
	return null;

}

/**
 * Reads the demo's leading forcing-track line.
 *
 * @param {Uint8Array} bytes the whole demo
 * @returns {{ ok: true, forceTrack: number, offset: number } | { ok: false, reason: string }} the track and the offset
 *   of the first record, or why the file is not a Hexen II demo
 */
export function Hexen2_ReadDemoForceTrack( bytes ) {

	const data = bytesOf( bytes );
	if ( data === null ) return { ok: false, reason: 'demo bytes are required' };
	let end = - 1;
	for ( let i = 0; i < Math.min( data.length, 16 ); i ++ ) if ( data[ i ] === 0x0a ) { end = i; break; }
	if ( end < 0 ) return { ok: false, reason: 'no forcing-track line (a "%i\\n" first line)' };
	const text = String.fromCharCode( ...data.subarray( 0, end ) );
	if ( ! /^-?\d+$/.test( text ) ) return { ok: false, reason: `the forcing-track line is not an integer: ${text}` };
	const forceTrack = Number( text );
	if ( forceTrack < - 1 || forceTrack > 99 ) return { ok: false, reason: `forcing track ${forceTrack} is outside -1..99` };
	return { ok: true, forceTrack, offset: end + 1 };

}

/**
 * Reads one framed demo message.
 *
 * @param {Uint8Array|ArrayBuffer} bytes the whole demo
 * @param {number} [offset] the first byte of the record (after the forcing-track line)
 * @returns {{ ok: true, message: { length: number, angles: ReadonlyArray<number>, payloadOffset: number,
 *   endsAt: number } } | { ok: false, reason: string }} the message frame, or why it is malformed or truncated
 */
export function Hexen2_ReadDemoMessage( bytes, offset = 0 ) {

	const data = bytesOf( bytes );
	if ( data === null ) return { ok: false, reason: 'demo bytes are required' };
	if ( ! Number.isInteger( offset ) || offset < 0 ) return { ok: false, reason: 'the record offset is invalid' };
	if ( offset + HEXEN2_DEMO_RECORD_HEADER > data.length ) return { ok: false, reason: 'a truncated demo record header' };
	const view = new DataView( data.buffer, data.byteOffset, data.byteLength );
	const length = view.getUint32( offset, true );
	if ( length > HEXEN2_DEMO_MAX_MESSAGE ) return { ok: false, reason: `a demo message of ${length} bytes exceeds ${HEXEN2_DEMO_MAX_MESSAGE}` };
	const angles = [ 0, 1, 2 ].map( i => view.getFloat32( offset + 4 + i * 4, true ) );
	for ( const angle of angles ) if ( ! Number.isFinite( angle ) ) return { ok: false, reason: 'a demo view angle is not finite' };
	const payloadOffset = offset + HEXEN2_DEMO_RECORD_HEADER;
	if ( payloadOffset + length > data.length ) return { ok: false, reason: 'a demo message runs past the file' };
	return { ok: true, message: { length, angles: Object.freeze( angles ), payloadOffset, endsAt: payloadOffset + length } };

}

/**
 * Reads the whole demo's framing: the forcing track and every message record. A trailing partial record is an error,
 * not silently ignored.
 *
 * @param {Uint8Array|ArrayBuffer} bytes the whole demo
 * @returns {{ ok: true, forceTrack: number, messages: ReadonlyArray<object> } |
 *   { ok: false, reason: string }} every frame, or the first problem
 */
export function Hexen2_ReadDemoMessages( bytes ) {

	const data = bytesOf( bytes );
	if ( data === null ) return { ok: false, reason: 'demo bytes are required' };
	const track = Hexen2_ReadDemoForceTrack( data );
	if ( ! track.ok ) return track;
	const messages = [];
	let offset = track.offset;
	while ( offset < data.length ) {

		const read = Hexen2_ReadDemoMessage( data, offset );
		if ( ! read.ok ) return { ok: false, reason: `${read.reason} at byte ${offset}` };
		messages.push( read.message );
		offset = read.message.endsAt;

	}
	return { ok: true, forceTrack: track.forceTrack, messages: Object.freeze( messages ) };

}
