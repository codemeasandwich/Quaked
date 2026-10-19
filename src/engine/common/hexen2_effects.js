/**
 * @module engine/common/hexen2_effects
 *
 * Hexen II's particle effect messages (`svc_particle`, `svc_particle2/3/4`) in their native wire format from the
 * pinned Raven SV_StartParticle* helpers: coordinates as 1/8-unit shorts, directions as 1/16-unit signed bytes,
 * particle2 direction boxes as floats, and the shared colour/count/effect bytes. Encoding clamps like the native
 * datagram writer; decoding refuses truncation and trailing bytes.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; malformed input is `{ ok: false, reason }`.
 */

import { HEXEN2_SERVER_MESSAGES } from './hexen2_protocol.js';

class Writer {

	constructor() { this.parts = []; }
	byte( v ) { this.parts.push( v & 0xff ); }
	short( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff ); }
	coord( v ) { this.short( Math.round( v * 8 ) ); }
	float( v ) { const b = new Uint8Array( 4 ); new DataView( b.buffer ).setFloat32( 0, v, true ); this.parts.push( ...b ); }
	bytes() { return Uint8Array.from( this.parts ); }

}

class Reader {

	constructor( bytes ) { this.bytes = bytes; this.at = 0; }
	need( n ) { if ( this.at + n > this.bytes.length ) throw new Error( 'truncated effect' ); }
	byte() { this.need( 1 ); return this.bytes[ this.at ++ ]; }
	sbyte() { const v = this.byte(); return v > 127 ? v - 256 : v; }
	short() { this.need( 2 ); const v = ( this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ) ); this.at += 2; return v; }
	coord() { const v = this.short(); return ( v > 32767 ? v - 65536 : v ) / 8; }
	float() { this.need( 4 ); const v = new DataView( this.bytes.buffer, this.bytes.byteOffset + this.at, 4 ).getFloat32( 0, true ); this.at += 4; return v; }

}

/**
 * Writes a `svc_particle` message.
 *
 * @param {{ origin: ArrayLike<number>, direction: ArrayLike<number>, color: number, count: number }} effect
 * @returns {Uint8Array} the message (opcode included)
 */
export function Hexen2_WriteParticle( effect ) {

	const w = new Writer();
	w.byte( HEXEN2_SERVER_MESSAGES.particle );
	for ( let i = 0; i < 3; i ++ ) w.coord( effect.origin[ i ] );
	for ( let i = 0; i < 3; i ++ ) {

		let v = Math.trunc( effect.direction[ i ] * 16 );
		if ( v > 127 ) v = 127; else if ( v < - 128 ) v = - 128;
		w.byte( v );

	}
	w.byte( effect.count );
	w.byte( effect.color );
	return w.bytes();

}

/**
 * Writes a `svc_particle2` message.
 *
 * @param {{ origin: ArrayLike<number>, directionMin: ArrayLike<number>, directionMax: ArrayLike<number>,
 *   color: number, effect: number, count: number }} effect
 * @returns {Uint8Array} the message (opcode included)
 */
export function Hexen2_WriteParticle2( effect ) {

	const w = new Writer();
	w.byte( HEXEN2_SERVER_MESSAGES.particle2 );
	for ( let i = 0; i < 3; i ++ ) w.coord( effect.origin[ i ] );
	for ( let i = 0; i < 3; i ++ ) w.float( effect.directionMin[ i ] );
	for ( let i = 0; i < 3; i ++ ) w.float( effect.directionMax[ i ] );
	w.short( effect.color );
	w.byte( effect.count );
	w.byte( effect.effect );
	return w.bytes();

}

/**
 * Writes a `svc_particle3` message.
 *
 * @param {{ origin: ArrayLike<number>, box: ArrayLike<number>, color: number, effect: number, count: number }} effect
 * @returns {Uint8Array} the message (opcode included)
 */
export function Hexen2_WriteParticle3( effect ) {

	const w = new Writer();
	w.byte( HEXEN2_SERVER_MESSAGES.particle3 );
	for ( let i = 0; i < 3; i ++ ) w.coord( effect.origin[ i ] );
	for ( let i = 0; i < 3; i ++ ) w.byte( effect.box[ i ] );
	w.short( effect.color );
	w.byte( effect.count );
	w.byte( effect.effect );
	return w.bytes();

}

/**
 * Writes a `svc_particle4` message.
 *
 * @param {{ origin: ArrayLike<number>, radius: number, color: number, effect: number, count: number }} effect
 * @returns {Uint8Array} the message (opcode included)
 */
export function Hexen2_WriteParticle4( effect ) {

	const w = new Writer();
	w.byte( HEXEN2_SERVER_MESSAGES.particle4 );
	for ( let i = 0; i < 3; i ++ ) w.coord( effect.origin[ i ] );
	w.byte( effect.radius );
	w.short( effect.color );
	w.byte( effect.count );
	w.byte( effect.effect );
	return w.bytes();

}

/**
 * Decodes one particle message by its opcode.
 *
 * @param {ArrayLike<number>} bytes the message, opcode first
 * @returns {{ ok: true, kind: string, effect: object } | { ok: false, reason: string }} the decoded effect
 */
export function Hexen2_ReadParticle( bytes ) {

	try {

		const r = new Reader( bytes ), opcode = r.byte(), origin = [ r.coord(), r.coord(), r.coord() ];
		if ( opcode === HEXEN2_SERVER_MESSAGES.particle ) {

			const direction = [ r.sbyte() / 16, r.sbyte() / 16, r.sbyte() / 16 ];
			const effect = { origin, direction, count: r.byte(), color: r.byte() };
			if ( r.at !== bytes.length ) return { ok: false, reason: 'trailing particle bytes' };
			return { ok: true, kind: 'particle', effect };

		}
		if ( opcode === HEXEN2_SERVER_MESSAGES.particle2 ) {

			const directionMin = [], directionMax = [];
			for ( let i = 0; i < 3; i ++ ) directionMin.push( r.float() );
			for ( let i = 0; i < 3; i ++ ) directionMax.push( r.float() );
			const effect = { origin, directionMin, directionMax, color: r.short(), count: r.byte(), effect: r.byte() };
			if ( r.at !== bytes.length ) return { ok: false, reason: 'trailing particle2 bytes' };
			return { ok: true, kind: 'particle2', effect };

		}
		if ( opcode === HEXEN2_SERVER_MESSAGES.particle3 ) {

			const box = [ r.byte(), r.byte(), r.byte() ];
			const effect = { origin, box, color: r.short(), count: r.byte(), effect: r.byte() };
			if ( r.at !== bytes.length ) return { ok: false, reason: 'trailing particle3 bytes' };
			return { ok: true, kind: 'particle3', effect };

		}
		if ( opcode === HEXEN2_SERVER_MESSAGES.particle4 ) {

			const effect = { origin, radius: r.byte(), color: r.short(), count: r.byte(), effect: r.byte() };
			if ( r.at !== bytes.length ) return { ok: false, reason: 'trailing particle4 bytes' };
			return { ok: true, kind: 'particle4', effect };

		}
		return { ok: false, reason: `unknown particle opcode ${opcode}` };

	} catch ( error ) { return { ok: false, reason: error.message }; }

}
