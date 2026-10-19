/**
 * @module engine/common/hexen2_entitywire
 *
 * Hexen II's fast entity update (the high-bit command of CL_ParseServerMessage → CL_ParseUpdate): U_* bits in one to
 * three bytes, the entity number (byte, or short with U_LONGENTITY), then the present fields in native order — model,
 * frame, colormap, skin+drawflags, effects, origin/angle per axis (1/8-unit coordinates, 1/256-turn angles), and
 * scale+abslight. This carries world entities after their baselines; the signon baseline message is separate.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; malformed input is `{ ok: false, reason }`.
 */

/** The native U_* fast-update bits (protocol.h). */
export const U = Object.freeze( {
	MOREBITS: 1 << 0, ORIGIN1: 1 << 1, ORIGIN2: 1 << 2, ORIGIN3: 1 << 3, ANGLE2: 1 << 4, NOLERP: 1 << 5,
	FRAME: 1 << 6, SIGNAL: 1 << 7, ANGLE1: 1 << 8, ANGLE3: 1 << 9, MODEL: 1 << 10, CLEAR_ENT: 1 << 11,
	ENT_OFF: 1 << 13, LONGENTITY: 1 << 14, MOREBITS2: 1 << 15, SKIN: 1 << 16, EFFECTS: 1 << 17, SCALE: 1 << 18,
	COLORMAP: 1 << 19
} );

class Writer {

	constructor() { this.parts = []; }
	byte( v ) { this.parts.push( v & 0xff ); }
	short( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff ); }
	coord( v ) { this.short( Math.round( v * 8 ) ); }
	angle( v ) { this.byte( Math.round( v * 256 / 360 ) & 0xff ); }
	bytes() { return Uint8Array.from( this.parts ); }

}

class Reader {

	constructor( bytes ) { this.bytes = bytes; this.at = 0; }
	need( n ) { if ( this.at + n > this.bytes.length ) throw new Error( 'truncated entity update' ); }
	byte() { this.need( 1 ); return this.bytes[ this.at ++ ]; }
	short() { this.need( 2 ); const v = this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ); this.at += 2; return v; }
	coord() { const v = this.short(); return ( v > 32767 ? v - 65536 : v ) / 8; }
	angle() { return this.byte() * 360 / 256; }

}

/**
 * Writes one fast entity update.
 *
 * @param {{ entity: number, longEntity?: boolean, noLerp?: boolean, modelIndex?: number, frame?: number,
 *   colormap?: number, skin?: number, drawflags?: number, effects?: number, scale?: number, abslight?: number,
 *   origin?: ArrayLike<number>, angles?: ArrayLike<number> }} update the entity and the fields to send
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the update message
 */
export function Hexen2_WriteEntityUpdate( update ) {

	if ( !Number.isInteger( update.entity ) || update.entity < 0 || update.entity > ( update.longEntity ? 65535 : 255 ) )
		return { ok: false, reason: 'invalid entity number' };
	let bits = U.SIGNAL;
	if ( update.longEntity || update.entity > 255 ) bits |= U.LONGENTITY;
	if ( update.noLerp ) bits |= U.NOLERP;
	if ( update.modelIndex !== undefined ) bits |= U.MODEL;
	if ( update.frame !== undefined ) bits |= U.FRAME;
	if ( update.colormap !== undefined ) bits |= U.COLORMAP;
	if ( update.skin !== undefined || update.drawflags !== undefined ) bits |= U.SKIN;
	if ( update.effects !== undefined ) bits |= U.EFFECTS;
	if ( update.scale !== undefined || update.abslight !== undefined ) bits |= U.SCALE;
	if ( update.origin ) bits |= U.ORIGIN1 | U.ORIGIN2 | U.ORIGIN3;
	if ( update.angles ) bits |= U.ANGLE1 | U.ANGLE2 | U.ANGLE3;
	if ( bits & 0xff00 ) bits |= U.MOREBITS;
	if ( bits & 0xff0000 ) bits |= U.MOREBITS2;
	const w = new Writer();
	w.byte( 0x80 | ( bits & 0x7f ) );
	if ( bits & U.MOREBITS ) w.byte( ( bits >> 8 ) & 0xff );
	if ( bits & U.MOREBITS2 ) w.byte( ( bits >> 16 ) & 0xff );
	if ( bits & U.LONGENTITY ) w.short( update.entity ); else w.byte( update.entity );
	if ( bits & U.MODEL ) w.short( update.modelIndex );
	if ( bits & U.FRAME ) w.byte( update.frame );
	if ( bits & U.COLORMAP ) w.byte( update.colormap );
	if ( bits & U.SKIN ) { w.byte( update.skin ?? 0 ); w.byte( update.drawflags ?? 0 ); }
	if ( bits & U.EFFECTS ) w.byte( update.effects );
	if ( bits & U.ORIGIN1 ) w.coord( update.origin[ 0 ] );
	if ( bits & U.ANGLE1 ) w.angle( update.angles[ 0 ] );
	if ( bits & U.ORIGIN2 ) w.coord( update.origin[ 1 ] );
	if ( bits & U.ANGLE2 ) w.angle( update.angles[ 1 ] );
	if ( bits & U.ORIGIN3 ) w.coord( update.origin[ 2 ] );
	if ( bits & U.ANGLE3 ) w.angle( update.angles[ 2 ] );
	if ( bits & U.SCALE ) { w.byte( update.scale ?? 0 ); w.byte( update.abslight ?? 0 ); }
	return { ok: true, bytes: w.bytes() };

}

/**
 * Reads one fast entity update.
 *
 * @param {ArrayLike<number>} bytes a buffer starting at the update command byte
 * @param {{ allowTrailing?: boolean }} [options] leave the following message(s) unread
 * @returns {{ ok: true, update: object, consumed: number } | { ok: false, reason: string }} the update and its length
 */
export function Hexen2_ReadEntityUpdate( bytes, options = {} ) {

	try {

		const r = new Reader( bytes ), command = r.byte();
		if ( ( command & 0x80 ) === 0 ) return { ok: false, reason: 'not a fast entity update' };
		let bits = command & 0x7f;
		if ( bits & U.MOREBITS ) bits |= r.byte() << 8;
		if ( bits & U.MOREBITS2 ) bits |= r.byte() << 16;
		const entity = ( bits & U.LONGENTITY ) ? r.short() : r.byte();
		const update = { entity, bits: bits & ~( U.MOREBITS | U.MOREBITS2 ) };
		if ( bits & U.MODEL ) update.modelIndex = r.short();
		if ( bits & U.FRAME ) update.frame = r.byte();
		if ( bits & U.COLORMAP ) update.colormap = r.byte();
		if ( bits & U.SKIN ) { update.skin = r.byte(); update.drawflags = r.byte(); }
		if ( bits & U.EFFECTS ) update.effects = r.byte();
		update.origin = [ 0, 0, 0 ]; update.angles = [ 0, 0, 0 ];
		const readAxes = [ [ U.ORIGIN1, U.ANGLE1, 0 ], [ U.ORIGIN2, U.ANGLE2, 1 ], [ U.ORIGIN3, U.ANGLE3, 2 ] ];
		for ( const [ originBit, angleBit, axis ] of readAxes ) {

			if ( bits & originBit ) update.origin[ axis ] = r.coord();
			if ( bits & angleBit ) update.angles[ axis ] = r.angle();

		}
		if ( bits & U.SCALE ) { update.scale = r.byte(); update.abslight = r.byte(); }
		update.noLerp = ( bits & U.NOLERP ) !== 0;
		update.clearEntity = ( bits & U.CLEAR_ENT ) !== 0;
		if ( !options.allowTrailing && r.at !== bytes.length ) return { ok: false, reason: 'trailing entity update bytes' };
		return { ok: true, update, consumed: r.at };

	} catch ( error ) { return { ok: false, reason: error.message }; }

}
