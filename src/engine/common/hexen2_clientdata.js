/**
 * @module engine/common/hexen2_clientdata
 *
 * The two native Hexen II server-message bodies that carry a player's state: `svc_clientdata` (view height, pitch,
 * punch, velocity, weapon frame/armour/model, on-ground/water bits) and `svc_update_inv` (the SC1/SC2 stat delta in
 * its masked-byte form). Formats are ported from the pinned Raven SV_WriteClientdataToMessage and protocol.h; the
 * private stream reuses these bodies. Decoding refuses truncation and a mask byte whose bytes are missing, never
 * guessing a value.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; malformed input returns `{ ok: false, reason }`.
 */

/** The clientdata bits (protocol.h SU_*). */
export const SU = Object.freeze( {
	VIEWHEIGHT: 1 << 0, IDEALPITCH: 1 << 1, PUNCH1: 1 << 2, PUNCH2: 1 << 3, PUNCH3: 1 << 4,
	VELOCITY1: 1 << 5, VELOCITY2: 1 << 6, VELOCITY3: 1 << 7, IDEALROLL: 1 << 8,
	SC1: 1 << 9, ONGROUND: 1 << 10, INWATER: 1 << 11, WEAPONFRAME: 1 << 12, ARMOR: 1 << 13, WEAPON: 1 << 14, SC2: 1 << 15
} );

/** The stat bits in native write order, SC1 then SC2 (`[bit, field, type]`). */
const STAT_FIELDS = Object.freeze( [
	[ 1 << 0, 'health', 'short' ], [ 1 << 1, 'level', 'byte' ], [ 1 << 2, 'intelligence', 'byte' ],
	[ 1 << 3, 'wisdom', 'byte' ], [ 1 << 4, 'strength', 'byte' ], [ 1 << 5, 'dexterity', 'byte' ],
	[ 1 << 6, 'weapon', 'byte' ], [ 1 << 7, 'bluemana', 'byte' ], [ 1 << 8, 'greenmana', 'byte' ],
	[ 1 << 9, 'experience', 'long' ],
	[ 1 << 10, 'cnt_torch', 'byte' ], [ 1 << 11, 'cnt_h_boost', 'byte' ], [ 1 << 12, 'cnt_sh_boost', 'byte' ],
	[ 1 << 13, 'cnt_mana_boost', 'byte' ], [ 1 << 14, 'cnt_teleport', 'byte' ], [ 1 << 15, 'cnt_tome', 'byte' ],
	[ 1 << 16, 'cnt_summon', 'byte' ], [ 1 << 17, 'cnt_invisibility', 'byte' ], [ 1 << 18, 'cnt_glyph', 'byte' ],
	[ 1 << 19, 'cnt_haste', 'byte' ], [ 1 << 20, 'cnt_blast', 'byte' ], [ 1 << 21, 'cnt_polymorph', 'byte' ],
	[ 1 << 22, 'cnt_flight', 'byte' ], [ 1 << 23, 'cnt_cubeofforce', 'byte' ], [ 1 << 24, 'cnt_invincibility', 'byte' ],
	[ 1 << 25, 'artifact_active', 'float' ], [ 1 << 26, 'artifact_low', 'float' ],
	[ 1 << 27, 'movetype', 'byte' ], [ 1 << 28, 'cameramode', 'byte' ], [ 1 << 29, 'hasted', 'float' ],
	[ 1 << 30, 'inventory', 'byte' ], [ 1 << 31, 'rings_active', 'float' ],
	[ 0x100000000, 'rings_low', 'float' ], [ 0x200000000, 'armor_amulet', 'byte' ], [ 0x400000000, 'armor_bracer', 'byte' ],
	[ 0x800000000, 'armor_breastplate', 'byte' ], [ 0x1000000000, 'armor_helmet', 'byte' ],
	[ 0x2000000000, 'ring_flight', 'byte' ], [ 0x4000000000, 'ring_water', 'byte' ], [ 0x8000000000, 'ring_turning', 'byte' ],
	[ 0x10000000000, 'ring_regeneration', 'byte' ], [ 0x20000000000, 'haste_time', 'float' ], [ 0x40000000000, 'tome_time', 'float' ],
	[ 0x80000000000, 'puzzle_inv1', 'string' ], [ 0x100000000000, 'puzzle_inv2', 'string' ], [ 0x200000000000, 'puzzle_inv3', 'string' ],
	[ 0x400000000000, 'puzzle_inv4', 'string' ], [ 0x800000000000, 'puzzle_inv5', 'string' ], [ 0x1000000000000, 'puzzle_inv6', 'string' ],
	[ 0x2000000000000, 'puzzle_inv7', 'string' ], [ 0x4000000000000, 'puzzle_inv8', 'string' ],
	[ 0x8000000000000, 'max_health', 'short' ], [ 0x10000000000000, 'max_mana', 'byte' ], [ 0x20000000000000, 'flags', 'float' ]
] );

// SC2 bits live above 32 bits: provide the native 32-bit sc1/sc2 split back to callers of the encoder.
const SC1_LOW = 0xffffffffn, SC1_HIGH = 0n;

class Writer {

	constructor() { this.parts = []; }
	byte( v ) { this.parts.push( v & 0xff ); }
	short( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff ); }
	long( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff, ( v >> 16 ) & 0xff, ( v >>> 24 ) & 0xff ); }
	float( v ) { const b = new Uint8Array( 4 ); new DataView( b.buffer ).setFloat32( 0, v, true ); this.parts.push( ...b ); }
	string( s ) { for ( const ch of String( s ) ) this.parts.push( ch.charCodeAt( 0 ) & 0xff ); this.parts.push( 0 ); }
	bytes() { return Uint8Array.from( this.parts ); }

}

class Reader {

	constructor( bytes ) { this.bytes = bytes; this.at = 0; }
	need( n ) { if ( this.at + n > this.bytes.length ) throw new Error( 'truncated message' ); }
	byte() { this.need( 1 ); return this.bytes[ this.at ++ ]; }
	short() { this.need( 2 ); const v = this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ); this.at += 2; return v; }
	long() { this.need( 4 ); const v = this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ) | ( this.bytes[ this.at + 2 ] << 16 ) | ( this.bytes[ this.at + 3 ] << 24 ); this.at += 4; return v | 0; }
	float() { this.need( 4 ); const v = new DataView( this.bytes.buffer, this.bytes.byteOffset + this.at, 4 ).getFloat32( 0, true ); this.at += 4; return v; }
	string() { const start = this.at; while ( this.at < this.bytes.length && this.bytes[ this.at ] !== 0 ) this.at ++; if ( this.at >= this.bytes.length ) throw new Error( 'unterminated string' ); const s = new TextDecoder().decode( this.bytes.subarray( start, this.at ) ); this.at ++; return s; }

}

/**
 * Encodes an `svc_clientdata` body (without its opcode) for a player.
 *
 * @param {object} player the player edict
 * @param {{ bits?: number, weaponModelIndex?: number }} [options] the SU bits to send and the weapon's model index
 * @returns {Uint8Array} the body
 */
export function Hexen2_EncodeClientdata( player, options = {} ) {

	const bits = options.bits ?? ( SU.VIEWHEIGHT | SU.IDEALPITCH | SU.IDEALROLL | SU.PUNCH1 | SU.PUNCH2 | SU.PUNCH3 |
		SU.VELOCITY1 | SU.VELOCITY2 | SU.VELOCITY3 | SU.WEAPONFRAME | SU.ARMOR | SU.WEAPON | SU.ONGROUND );
	const w = new Writer(), v = player.v;
	w.short( bits );
	if ( bits & SU.VIEWHEIGHT ) w.byte( Math.trunc( v.view_ofs?.[ 2 ] ?? 0 ) );
	if ( bits & SU.IDEALPITCH ) w.byte( Math.trunc( v.idealpitch ?? 0 ) );
	if ( bits & SU.IDEALROLL ) w.byte( Math.trunc( v.idealroll ?? 0 ) );
	for ( let i = 0; i < 3; i ++ ) {

		if ( bits & ( SU.PUNCH1 << i ) ) w.byte( Math.trunc( v.punchangle?.[ i ] ?? 0 ) );
		if ( bits & ( SU.VELOCITY1 << i ) ) w.byte( Math.trunc( ( v.velocity?.[ i ] ?? 0 ) / 16 ) );

	}
	if ( bits & SU.WEAPONFRAME ) w.byte( Math.trunc( v.weaponframe ?? 0 ) );
	if ( bits & SU.ARMOR ) w.byte( Math.trunc( v.armorvalue ?? 0 ) );
	if ( bits & SU.WEAPON ) w.short( options.weaponModelIndex ?? 0 );
	return w.bytes();

}

/**
 * Decodes an `svc_clientdata` body.
 *
 * @param {ArrayLike<number>} bytes the body
 * @returns {{ ok: true, clientdata: object } | { ok: false, reason: string }} the fields present, or why it is refused
 */
export function Hexen2_DecodeClientdata( bytes ) {

	try {

		const r = new Reader( bytes ), bits = r.short(), out = { bits };
		if ( bits & SU.VIEWHEIGHT ) out.viewheight = r.byte();
		if ( bits & SU.IDEALPITCH ) { const b = r.byte(); out.idealpitch = b > 127 ? b - 256 : b; }
		if ( bits & SU.IDEALROLL ) { const b = r.byte(); out.idealroll = b > 127 ? b - 256 : b; }
		out.punch = [ 0, 0, 0 ]; out.velocity = [ 0, 0, 0 ];
		for ( let i = 0; i < 3; i ++ ) {

			if ( bits & ( SU.PUNCH1 << i ) ) { const b = r.byte(); out.punch[ i ] = b > 127 ? b - 256 : b; }
			if ( bits & ( SU.VELOCITY1 << i ) ) { const b = r.byte(); out.velocity[ i ] = ( b > 127 ? b - 256 : b ) * 16; }

		}
		if ( bits & SU.WEAPONFRAME ) out.weaponframe = r.byte();
		if ( bits & SU.ARMOR ) out.armorvalue = r.byte();
		if ( bits & SU.WEAPON ) out.weaponModelIndex = r.short();
		out.onGround = ( bits & SU.ONGROUND ) !== 0;
		out.inWater = ( bits & SU.INWATER ) !== 0;
		if ( r.at !== bytes.length ) return { ok: false, reason: 'trailing bytes after clientdata' };
		return { ok: true, clientdata: out };

	} catch ( error ) { return { ok: false, reason: error.message }; }

}

/**
 * Encodes an `svc_update_inv` body (without its opcode) for a player: the masked SC1/SC2 delta and its values.
 *
 * @param {object} player the player edict
 * @param {bigint} mask the SC1|SC2 fields to send (native bit positions)
 * @param {function(number): string} stringAt resolves puzzle string offsets
 * @returns {Uint8Array} the body
 */
export function Hexen2_EncodeUpdateInv( player, mask, stringAt ) {

	const w = new Writer(), v = player.v;
	const test = [];
	for ( let block = 0; block < 7; block ++ ) {

		const byteMask = Number( ( mask >> BigInt( block * 8 ) ) & 0xffn );
		test.push( byteMask );

	}
	w.byte( 0 ); // provisional: the mask byte follows the chosen blocks
	w.parts.pop();
	const present = test.map( value => value !== 0 );
	let flags = 0;
	test.forEach( ( value, i ) => { if ( value !== 0 ) flags |= 1 << i; } );
	w.byte( flags );
	for ( let i = 0; i < test.length; i ++ ) if ( test[ i ] !== 0 ) w.byte( test[ i ] );
	for ( const [ bit, field, type ] of STAT_FIELDS ) {

		if ( ( mask & BigInt( bit ) ) === 0n ) continue;
		if ( type === 'byte' ) w.byte( Math.trunc( v[ field ] ?? 0 ) );
		else if ( type === 'short' ) w.short( Math.trunc( v[ field ] ?? 0 ) );
		else if ( type === 'long' ) w.long( Math.trunc( v[ field ] ?? 0 ) );
		else if ( type === 'float' ) w.float( v[ field ] ?? 0 );
		else if ( type === 'string' ) w.string( typeof stringAt === 'function' ? stringAt( v[ field ] ?? 0 ) : '' );

	}
	return w.bytes();

}

/**
 * Decodes an `svc_update_inv` body.
 *
 * @param {ArrayLike<number>} bytes the body
 * @returns {{ ok: true, mask: bigint, stats: object } | { ok: false, reason: string }} the stat delta, or why refused
 */
export function Hexen2_DecodeUpdateInv( bytes ) {

	try {

		const r = new Reader( bytes ), flags = r.byte(), blocks = [];
		if ( flags & 0x80 ) return { ok: false, reason: 'unknown SC2 high byte' };
		for ( let i = 0; i < 7; i ++ ) blocks.push( ( flags & ( 1 << i ) ) ? r.byte() : 0 );
		let mask = 0n;
		blocks.forEach( ( value, i ) => { mask |= BigInt( value ) << BigInt( i * 8 ); } );
		const stats = {};
		for ( const [ bit, field, type ] of STAT_FIELDS ) {

			if ( ( mask & BigInt( bit ) ) === 0n ) continue;
			if ( type === 'byte' ) stats[ field ] = r.byte();
			else if ( type === 'short' ) stats[ field ] = r.short();
			else if ( type === 'long' ) stats[ field ] = r.long();
			else if ( type === 'float' ) stats[ field ] = r.float();
			else if ( type === 'string' ) stats[ field ] = r.string();

		}
		if ( r.at !== bytes.length ) return { ok: false, reason: 'trailing bytes after update_inv' };
		return { ok: true, mask, stats };

	} catch ( error ) { return { ok: false, reason: error.message }; }

}

/** The native SC1/SC2 masks, for callers building a delta. */
export const HEXEN2_SC_MASKS = Object.freeze( {
	SC1_STAT_BAR: 0x01ffffffn, SC2_STAT_BAR: 0x1en,
	SC1_INVENTORY: 0x01fffc00n, SC2_INVENTORY: 0n
} );

/** SC2 bit helper: `Hexen2_SC2( bit )` for bit 0..23. */
export function Hexen2_SC2( bit ) { return 1n << BigInt( 32 + bit ); }
