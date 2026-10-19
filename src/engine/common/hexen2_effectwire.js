/**
 * @module engine/common/hexen2_effectwire
 *
 * Hexen II's long-lived client effects: `svc_start_effect` (a bounded slot index, the native CE_* type and that
 * type's body in the pinned Raven SV_SendEffect order) and `svc_end_effect` (the slot). Type numbers and layouts come
 * from effects.h/sv_effect.c; the smoke frame field is sent only for protocol > 18 as native does. Unknown types and
 * truncated/trailing bodies are refused.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; malformed input is `{ ok: false, reason }`.
 */

import { HEXEN2_SERVER_MESSAGES } from './hexen2_protocol.js';

/** The native CE_* effect types (effects.h). */
export const CE = Object.freeze( {
	RAIN: 1, FOUNTAIN: 2, QUAKE: 3, WHITE_SMOKE: 4, BLUESPARK: 5, YELLOWSPARK: 6, SM_CIRCLE_EXP: 7, BG_CIRCLE_EXP: 8,
	SM_WHITE_FLASH: 9, WHITE_FLASH: 10, YELLOWRED_FLASH: 11, BLUE_FLASH: 12, SM_BLUE_FLASH: 13, RED_FLASH: 14,
	SM_EXPLOSION: 15, LG_EXPLOSION: 16, FLOOR_EXPLOSION: 17, RIDER_DEATH: 18, BLUE_EXPLOSION: 19, GREEN_SMOKE: 20,
	GREY_SMOKE: 21, RED_SMOKE: 22, SLOW_WHITE_SMOKE: 23, REDSPARK: 24, GREENSPARK: 25, TELESMK1: 26, TELESMK2: 27,
	ICEHIT: 28, MEDUSA_HIT: 29, MEZZO_REFLECT: 30, FLOOR_EXPLOSION2: 31, XBOW_EXPLOSION: 32, NEW_EXPLOSION: 33,
	MAGIC_MISSILE_EXPLOSION: 34, GHOST: 35, BONE_EXPLOSION: 36, REDCLOUD: 37, TELEPORTERPUFFS: 38, TELEPORTERBODY: 39,
	BONESHARD: 40, BONESHRAPNEL: 41, FLAMESTREAM: 42, SNOW: 43, GRAVITYWELL: 44, BLDRN_EXPL: 45, ACID_MUZZFL: 46,
	ACID_HIT: 47, FIREWALL_SMALL: 48, FIREWALL_MEDIUM: 49, FIREWALL_LARGE: 50, LBALL_EXPL: 51, ACID_SPLAT: 52,
	ACID_EXPL: 53, FBOOM: 54, CHUNK: 55, BOMB: 56, BRN_BOUNCE: 57, LSHOCK: 58, FLAMEWALL: 59, FLAMEWALL2: 60,
	FLOOR_EXPLOSION3: 61, ONFIRE: 62
} );

const SMOKE = new Set( [ 4, 20, 21, 22, 23, 26, 27, 35, 37 ] );
const MISSION_SMOKE = new Set( [ 42, 46, 59, 60, 62 ] );
const ORIGIN_ONLY = new Set( [ 5, 6, 7, 8, 9, 11, 15, 16, 17, 19, 24, 25, 28, 29, 30, 31, 32, 33, 34, 36, 45, 47, 48, 49, 50, 51, 52, 53, 54, 56, 57, 58, 61 ] );
const FLASH = new Set( [ 10, 12, 13, 14 ] );

class Writer {

	constructor() { this.parts = []; }
	byte( v ) { this.parts.push( v & 0xff ); }
	short( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff ); }
	coord( v ) { this.short( Math.round( v * 8 ) ); }
	angle( v ) { this.byte( Math.round( v * 256 / 360 ) & 0xff ); }
	float( v ) { const b = new Uint8Array( 4 ); new DataView( b.buffer ).setFloat32( 0, v, true ); this.parts.push( ...b ); }
	bytes() { return Uint8Array.from( this.parts ); }

}

class Reader {

	constructor( bytes ) { this.bytes = bytes; this.at = 0; }
	need( n ) { if ( this.at + n > this.bytes.length ) throw new Error( 'truncated effect message' ); }
	byte() { this.need( 1 ); return this.bytes[ this.at ++ ]; }
	short() { this.need( 2 ); const v = this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ); this.at += 2; return v; }
	coord() { const v = this.short(); return ( v > 32767 ? v - 65536 : v ) / 8; }
	angle() { return this.byte() * 360 / 256; }
	float() { this.need( 4 ); const v = new DataView( this.bytes.buffer, this.bytes.byteOffset + this.at, 4 ).getFloat32( 0, true ); this.at += 4; return v; }

}

function writeVectors( w, values, kind ) { for ( const value of values ) kind === 'coord' ? w.coord( value ) : kind === 'angle' ? w.angle( value ) : w.float( value ); }
function readVectors( r, count, kind ) { const out = []; for ( let i = 0; i < count; i ++ ) out.push( kind === 'coord' ? r.coord() : kind === 'angle' ? r.angle() : r.float() ); return out; }

/**
 * Writes `svc_start_effect`.
 *
 * @param {{ index: number, type: number, protocol?: number, params?: object }} effect the slot, native type and its body
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_WriteStartEffect( effect ) {

	if ( !Number.isInteger( effect.index ) || effect.index < 0 || effect.index > 255 ) return { ok: false, reason: 'invalid effect index' };
	const type = effect.type, p = effect.params ?? {}, protocol = effect.protocol ?? 19;
	const w = new Writer();
	w.byte( HEXEN2_SERVER_MESSAGES.start_effect );
	w.byte( effect.index );
	w.byte( type );
	if ( type === CE.RAIN ) { writeVectors( w, p.minOrg, 'coord' ); writeVectors( w, p.maxOrg, 'coord' ); writeVectors( w, p.eSize, 'coord' ); writeVectors( w, p.dir, 'coord' ); w.short( p.color ); w.short( p.count ); w.float( p.wait ); }
	else if ( type === CE.SNOW ) { writeVectors( w, p.minOrg, 'coord' ); writeVectors( w, p.maxOrg, 'coord' ); w.byte( p.flags ); writeVectors( w, p.dir, 'coord' ); w.byte( p.count ); }
	else if ( type === CE.FOUNTAIN ) { writeVectors( w, p.pos, 'coord' ); writeVectors( w, p.angle, 'angle' ); writeVectors( w, p.movedir, 'coord' ); w.short( p.color ); w.byte( p.cnt ); }
	else if ( type === CE.QUAKE ) { writeVectors( w, p.origin, 'coord' ); w.float( p.radius ); }
	else if ( SMOKE.has( type ) || MISSION_SMOKE.has( type ) ) { writeVectors( w, p.origin, 'coord' ); writeVectors( w, p.velocity, 'float' ); w.float( p.framelength ); if ( protocol > 18 ) w.float( p.frame ?? 0 ); }
	else if ( FLASH.has( type ) ) { writeVectors( w, p.origin, 'coord' ); }
	else if ( type === CE.GRAVITYWELL ) { writeVectors( w, p.origin, 'coord' ); w.short( p.color ); w.float( p.lifetime ); }
	else if ( type === CE.TELEPORTERBODY ) { writeVectors( w, p.origin, 'coord' ); writeVectors( w, p.velocity, 'float' ); w.float( p.skinnum ); }
	else if ( type === CE.BONESHARD || type === CE.BONESHRAPNEL ) { writeVectors( w, p.origin, 'coord' ); writeVectors( w, p.velocity, 'float' ); writeVectors( w, p.angle, 'float' ); writeVectors( w, p.avelocity, 'float' ); }
	else if ( type === CE.CHUNK ) { writeVectors( w, p.origin, 'coord' ); w.byte( p.type ); writeVectors( w, p.srcVel, 'coord' ); w.byte( p.numChunks ); }
	else if ( ORIGIN_ONLY.has( type ) || type === CE.RIDER_DEATH || type === CE.TELEPORTERPUFFS ) { writeVectors( w, p.origin, 'coord' ); }
	else return { ok: false, reason: `unsupported effect type ${type}` };
	return { ok: true, bytes: w.bytes() };

}

/**
 * Reads `svc_start_effect`.
 *
 * @param {ArrayLike<number>} bytes the message, opcode first
 * @param {{ allowTrailing?: boolean, protocol?: number }} [options]
 * @returns {{ ok: true, index: number, type: number, params: object, consumed: number } | { ok: false, reason: string }}
 */
export function Hexen2_ReadStartEffect( bytes, options = {} ) {

	try {

		const r = new Reader( bytes );
		if ( r.byte() !== HEXEN2_SERVER_MESSAGES.start_effect ) return { ok: false, reason: 'not a start_effect message' };
		const index = r.byte(), type = r.byte(), params = {}, protocol = options.protocol ?? 19;
		if ( type === CE.RAIN ) { params.minOrg = readVectors( r, 3, 'coord' ); params.maxOrg = readVectors( r, 3, 'coord' ); params.eSize = readVectors( r, 3, 'coord' ); params.dir = readVectors( r, 3, 'coord' ); params.color = r.short(); params.count = r.short(); params.wait = r.float(); }
		else if ( type === CE.SNOW ) { params.minOrg = readVectors( r, 3, 'coord' ); params.maxOrg = readVectors( r, 3, 'coord' ); params.flags = r.byte(); params.dir = readVectors( r, 3, 'coord' ); params.count = r.byte(); }
		else if ( type === CE.FOUNTAIN ) { params.pos = readVectors( r, 3, 'coord' ); params.angle = readVectors( r, 3, 'angle' ); params.movedir = readVectors( r, 3, 'coord' ); params.color = r.short(); params.cnt = r.byte(); }
		else if ( type === CE.QUAKE ) { params.origin = readVectors( r, 3, 'coord' ); params.radius = r.float(); }
		else if ( SMOKE.has( type ) || MISSION_SMOKE.has( type ) ) { params.origin = readVectors( r, 3, 'coord' ); params.velocity = readVectors( r, 3, 'float' ); params.framelength = r.float(); if ( protocol > 18 ) params.frame = r.float(); }
		else if ( FLASH.has( type ) ) { params.origin = readVectors( r, 3, 'coord' ); }
		else if ( type === CE.GRAVITYWELL ) { params.origin = readVectors( r, 3, 'coord' ); params.color = r.short(); params.lifetime = r.float(); }
		else if ( type === CE.TELEPORTERBODY ) { params.origin = readVectors( r, 3, 'coord' ); params.velocity = readVectors( r, 3, 'float' ); params.skinnum = r.float(); }
		else if ( type === CE.BONESHARD || type === CE.BONESHRAPNEL ) { params.origin = readVectors( r, 3, 'coord' ); params.velocity = readVectors( r, 3, 'float' ); params.angle = readVectors( r, 3, 'float' ); params.avelocity = readVectors( r, 3, 'float' ); }
		else if ( type === CE.CHUNK ) { params.origin = readVectors( r, 3, 'coord' ); params.type = r.byte(); params.srcVel = readVectors( r, 3, 'coord' ); params.numChunks = r.byte(); }
		else if ( ORIGIN_ONLY.has( type ) || type === CE.RIDER_DEATH || type === CE.TELEPORTERPUFFS ) { params.origin = readVectors( r, 3, 'coord' ); }
		else return { ok: false, reason: `unsupported effect type ${type}` };
		if ( !options.allowTrailing && r.at !== bytes.length ) return { ok: false, reason: 'trailing effect bytes' };
		return { ok: true, index, type, params, consumed: r.at };

	} catch ( error ) { return { ok: false, reason: error.message }; }

}

/**
 * Writes `svc_end_effect`.
 *
 * @param {number} index the effect slot
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_WriteEndEffect( index ) {

	if ( !Number.isInteger( index ) || index < 0 || index > 255 ) return { ok: false, reason: 'invalid effect index' };
	return { ok: true, bytes: Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.end_effect, index ] ) };

}

/**
 * Reads `svc_end_effect`.
 *
 * @param {ArrayLike<number>} bytes the message, opcode first
 * @returns {{ ok: true, index: number, consumed: number } | { ok: false, reason: string }} the ended slot
 */
export function Hexen2_ReadEndEffect( bytes ) {

	if ( !bytes || bytes.length !== 2 ) return { ok: false, reason: 'malformed end_effect' };
	if ( bytes[ 0 ] !== HEXEN2_SERVER_MESSAGES.end_effect ) return { ok: false, reason: 'not an end_effect message' };
	return { ok: true, index: bytes[ 1 ], consumed: 2 };

}


/**
 * Reads a native effect's parameters from its PARM slots, in SV_ParseEffect order.
 *
 * @param {number} type the CE_* type
 * @param {{ vector: function(number): ArrayLike<number>, float: function(number): number }} read accessors where the
 *   argument is the PARM index (PARM0 is the type)
 * @returns {object} the parameters for `Hexen2_WriteStartEffect`
 */
export function Hexen2_EffectParams( type, read ) {

	const v = n => read.vector( n ), f = n => read.float( n );
	if ( type === CE.RAIN ) return { minOrg: v( 1 ), maxOrg: v( 2 ), eSize: v( 3 ), dir: v( 4 ), color: f( 5 ), count: f( 6 ), wait: f( 7 ) };
	if ( type === CE.SNOW ) return { minOrg: v( 1 ), maxOrg: v( 2 ), flags: f( 3 ), dir: v( 4 ), count: f( 5 ) };
	if ( type === CE.FOUNTAIN ) return { pos: v( 1 ), angle: v( 2 ), movedir: v( 3 ), color: f( 4 ), cnt: f( 5 ) };
	if ( type === CE.QUAKE ) return { origin: v( 1 ), radius: f( 2 ) };
	if ( SMOKE.has( type ) ) return { origin: v( 1 ), velocity: v( 2 ), framelength: f( 3 ), frame: 0 };
	if ( MISSION_SMOKE.has( type ) ) return { origin: v( 1 ), velocity: v( 2 ), framelength: 0.05, frame: f( 3 ) };
	if ( FLASH.has( type ) || ORIGIN_ONLY.has( type ) || type === CE.RIDER_DEATH || type === CE.TELEPORTERPUFFS )
		return { origin: v( 1 ) };
	if ( type === CE.GRAVITYWELL ) return { origin: v( 1 ), color: f( 2 ), lifetime: f( 3 ) };
	if ( type === CE.TELEPORTERBODY ) return { origin: v( 1 ), velocity: v( 2 ), skinnum: f( 3 ) };
	if ( type === CE.BONESHARD || type === CE.BONESHRAPNEL )
		// native SV_ParseEffect copies PARM2 for avelocity as well as velocity
		return { origin: v( 1 ), velocity: v( 2 ), angle: v( 3 ), avelocity: v( 2 ) };
	if ( type === CE.CHUNK ) return { origin: v( 1 ), type: f( 2 ), srcVel: v( 3 ), numChunks: f( 4 ) };
	return null;

}
