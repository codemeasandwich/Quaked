/**
 * @module engine/common/hexen2_soundwire
 *
 * Hexen II's sound messages (`svc_sound`, `svc_stopsound`, `svc_sound_update_pos`) in the pinned Raven wire format:
 * the SND_VOLUME/SND_ATTENUATION/SND_OVERFLOW field mask, the packed (entity << 3 | channel) short, the 1/8-unit
 * origin coordinates and the 64-scaled attenuation byte. Defaults are omitted as native does; the decoder restores
 * them and refuses truncation, a bad mask, a channel above 7 and trailing bytes.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; malformed input is `{ ok: false, reason }`, invalid arguments `{ ok: false, reason }`.
 */

import { HEXEN2_SERVER_MESSAGES } from './hexen2_protocol.js';

const SND_VOLUME = 1, SND_ATTENUATION = 2, SND_OVERFLOW = 4, SND_OVERFLOW2 = 8;
const MAX_SOUNDS_OLD = 256;

class Writer {

	constructor() { this.parts = []; }
	byte( v ) { this.parts.push( v & 0xff ); }
	short( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff ); }
	coord( v ) { this.short( Math.round( v * 8 ) ); }
	bytes() { return Uint8Array.from( this.parts ); }

}

class Reader {

	constructor( bytes ) { this.bytes = bytes; this.at = 0; }
	need( n ) { if ( this.at + n > this.bytes.length ) throw new Error( 'truncated sound message' ); }
	byte() { this.need( 1 ); return this.bytes[ this.at ++ ]; }
	short() { this.need( 2 ); const v = this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ); this.at += 2; return v; }
	coord() { const v = this.short(); return ( v > 32767 ? v - 65536 : v ) / 8; }

}

function packChannel( entity, channel ) {

	if ( !Number.isInteger( entity ) || entity < 0 || entity > 65535 ) return { ok: false, reason: 'invalid entity number' };
	if ( !Number.isInteger( channel ) || channel < 0 || channel > 7 ) return { ok: false, reason: 'invalid channel' };
	return { ok: true, value: ( entity << 3 ) | channel };

}

/**
 * Writes a `svc_sound` message.
 *
 * @param {{ entity: number, channel: number, soundNum: number, origin: ArrayLike<number>, volume?: number,
 *   attenuation?: number }} sound the entity/channel, precache number and entity-centre origin
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_WriteSound( sound ) {

	const packed = packChannel( sound.entity, sound.channel );
	if ( ! packed.ok ) return packed;
	if ( !Number.isInteger( sound.soundNum ) || sound.soundNum < 1 || sound.soundNum > 511 )
		return { ok: false, reason: 'invalid sound number' };
	const volume = sound.volume ?? 255, attenuation = sound.attenuation ?? 1;
	if ( !Number.isInteger( volume ) || volume < 0 || volume > 255 ) return { ok: false, reason: 'invalid volume' };
	if ( typeof attenuation !== 'number' || !Number.isFinite( attenuation ) || attenuation < 0 || attenuation > 4 )
		return { ok: false, reason: 'invalid attenuation' };
	let fieldMask = 0, soundNum = sound.soundNum;
	if ( volume !== 255 ) fieldMask |= SND_VOLUME;
	if ( attenuation !== 1 ) fieldMask |= SND_ATTENUATION;
	if ( soundNum >= MAX_SOUNDS_OLD ) { fieldMask |= SND_OVERFLOW; soundNum -= MAX_SOUNDS_OLD; }
	const w = new Writer();
	w.byte( HEXEN2_SERVER_MESSAGES.sound );
	w.byte( fieldMask );
	if ( fieldMask & SND_VOLUME ) w.byte( volume );
	if ( fieldMask & SND_ATTENUATION ) w.byte( Math.round( attenuation * 64 ) );
	w.short( packed.value );
	w.byte( soundNum );
	for ( let i = 0; i < 3; i ++ ) w.coord( sound.origin[ i ] );
	return { ok: true, bytes: w.bytes() };

}

/**
 * Writes a `svc_stopsound` message.
 *
 * @param {{ entity: number, channel: number }} sound
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_WriteStopSound( sound ) {

	const packed = packChannel( sound.entity, sound.channel );
	if ( ! packed.ok ) return packed;
	const w = new Writer();
	w.byte( HEXEN2_SERVER_MESSAGES.stopsound );
	w.short( packed.value );
	return { ok: true, bytes: w.bytes() };

}

/**
 * Writes a `svc_sound_update_pos` message.
 *
 * @param {{ entity: number, channel: number, origin: ArrayLike<number> }} sound the entity-centre origin
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_WriteSoundUpdatePos( sound ) {

	const packed = packChannel( sound.entity, sound.channel );
	if ( ! packed.ok ) return packed;
	const w = new Writer();
	w.byte( HEXEN2_SERVER_MESSAGES.sound_update_pos );
	w.short( packed.value );
	for ( let i = 0; i < 3; i ++ ) w.coord( sound.origin[ i ] );
	return { ok: true, bytes: w.bytes() };

}

/**
 * Decodes one sound message by its opcode.
 *
 * @param {ArrayLike<number>} bytes the message, opcode first
 * @returns {{ ok: true, kind: string, sound: object } | { ok: false, reason: string }} the decoded sound
 */
export function Hexen2_ReadSound( bytes ) {

	try {

		const r = new Reader( bytes ), opcode = r.byte();
		if ( opcode === HEXEN2_SERVER_MESSAGES.stopsound ) {

			const packed = r.short();
			if ( r.at !== bytes.length ) return { ok: false, reason: 'trailing stopsound bytes' };
			return { ok: true, kind: 'stopsound', sound: { entity: packed >> 3, channel: packed & 7 } };

		}
		if ( opcode === HEXEN2_SERVER_MESSAGES.sound_update_pos ) {

			const packed = r.short(), origin = [ r.coord(), r.coord(), r.coord() ];
			if ( r.at !== bytes.length ) return { ok: false, reason: 'trailing sound position bytes' };
			return { ok: true, kind: 'sound_update_pos', sound: { entity: packed >> 3, channel: packed & 7, origin } };

		}
		if ( opcode !== HEXEN2_SERVER_MESSAGES.sound ) return { ok: false, reason: `unknown sound opcode ${opcode}` };
		const fieldMask = r.byte();
		if ( fieldMask & ~( SND_VOLUME | SND_ATTENUATION | SND_OVERFLOW | SND_OVERFLOW2 ) )
			return { ok: false, reason: 'unknown sound field mask' };
		const volume = ( fieldMask & SND_VOLUME ) ? r.byte() : 255;
		const attenuation = ( fieldMask & SND_ATTENUATION ) ? r.byte() / 64 : 1;
		const packed = r.short();
		let soundNum = r.byte();
		if ( fieldMask & SND_OVERFLOW ) soundNum += MAX_SOUNDS_OLD;
		if ( fieldMask & SND_OVERFLOW2 ) soundNum += 512;
		const origin = [ r.coord(), r.coord(), r.coord() ];
		if ( r.at !== bytes.length ) return { ok: false, reason: 'trailing sound bytes' };
		return { ok: true, kind: 'sound', sound: { entity: packed >> 3, channel: packed & 7, soundNum, volume, attenuation, origin } };

	} catch ( error ) { return { ok: false, reason: error.message }; }

}
