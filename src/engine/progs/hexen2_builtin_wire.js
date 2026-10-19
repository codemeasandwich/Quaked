/**
 * @module engine/progs/hexen2_builtin_wire
 *
 * The wire bodies of the Hexen II builtins that have no Quake equivalent: plaques, rain, the three extra particle
 * messages, particle explosions, sound-position updates, white flashes and the Hexen static-entity record. The bodies
 * are the pinned Raven `SV_StartParticle*`/`PF_*` layouts (`sv_main.c`, `pr_cmds.c`).
 *
 * This is the one seam package U1 replaces: the ids come from `hexen2_protocol.js` here, while the unified protocol
 * owns their final numbers and the optional static-entity bits. Keep every caller going through these functions so
 * integration changes one module, not every builtin.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; a message that does not fit its buffer is dropped whole by `Hexen2_AppendMessage`.
 */

import { svc_spawnstatic, svc_stufftext } from '../common/protocol.js';
import { HEXEN2_SERVER_MESSAGES } from '../common/hexen2_protocol.js';
import { Hexen2_WriteParticle2, Hexen2_WriteParticle3, Hexen2_WriteParticle4 } from '../common/hexen2_effects.js';
import { Hexen2_WriteStartEffect, Hexen2_WriteEndEffect } from '../common/hexen2_effectwire.js';

const messageId = name => HEXEN2_SERVER_MESSAGES[ name ];

// The common particle/effect encoders own the bodies; rewriting the opcode here keeps every unified-protocol id in
// this one module for the U1 integration.
function withOpcode( message, name ) {

	const bytes = Uint8Array.from( message.bytes ?? message );
	bytes[ 0 ] = messageId( name );
	return bytes;

}

/** `svc_particle2` with the unified protocol's opcode. */
export function Hexen2_WriteParticle2Message( effect ) { return withOpcode( Hexen2_WriteParticle2( effect ), 'particle2' ); }

/** `svc_particle3` with the unified protocol's opcode. */
export function Hexen2_WriteParticle3Message( effect ) { return withOpcode( Hexen2_WriteParticle3( effect ), 'particle3' ); }

/** `svc_particle4` with the unified protocol's opcode. */
export function Hexen2_WriteParticle4Message( effect ) { return withOpcode( Hexen2_WriteParticle4( effect ), 'particle4' ); }

/** `svc_start_effect` with the unified protocol's opcode. */
export function Hexen2_WriteStartEffectMessage( effect ) { return withOpcode( Hexen2_WriteStartEffect( effect ), 'start_effect' ); }

/** `svc_end_effect` with the unified protocol's opcode. */
export function Hexen2_WriteEndEffectMessage( index ) { return withOpcode( Hexen2_WriteEndEffect( index ), 'end_effect' ); }

class Writer {

	constructor() { this.parts = []; }
	byte( v ) { this.parts.push( v & 0xff ); }
	short( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff ); }
	coord( v ) { this.short( Math.round( v * 8 ) ); }
	angle( v ) { this.byte( Math.round( v * 256 / 360 ) ); }
	string( value ) {

		for ( let i = 0; i < value.length; i ++ ) this.byte( value.charCodeAt( i ) );
		this.byte( 0 );

	}
	bytes() { return Uint8Array.from( this.parts ); }

}

/**
 * Appends a complete message to a size buffer when it fits.
 *
 * @param {object} dest the `sizebuf_t` (`sv.datagram`, `sv.reliable_datagram`, `sv.signon` or a client's message)
 * @param {ArrayLike<number>} bytes the message, opcode first
 * @returns {boolean} whether it was written
 */
export function Hexen2_AppendMessage( dest, bytes ) {

	if ( ! dest || ! dest.data || dest.cursize + bytes.length > dest.maxsize ) return false;
	dest.data.set( bytes, dest.cursize );
	dest.cursize += bytes.length;
	return true;

}

/**
 * The `svc_plaque` message (the strings.txt index of a plaque; 0 clears it).
 *
 * @param {number} index a 0-based line index, or 0 to clear
 * @returns {Uint8Array} the message
 */
export function Hexen2_WritePlaque( index ) {

	const w = new Writer();
	w.byte( messageId( 'plaque' ) );
	w.short( index & 0xffff );
	return w.bytes();

}

/**
 * The `svc_raineffect` message from a box's lower and upper corners, its size and direction.
 *
 * @param {{ min: ArrayLike<number>, max: ArrayLike<number>, size: ArrayLike<number>, dir: ArrayLike<number>,
 *   color: number, count: number }} rain the effect
 * @returns {Uint8Array} the message
 */
export function Hexen2_WriteRainEffect( rain ) {

	const w = new Writer();
	w.byte( messageId( 'raineffect' ) );
	w.coord( rain.min[ 0 ] ); w.coord( rain.min[ 1 ] ); w.coord( rain.max[ 2 ] );
	w.coord( rain.size[ 0 ] ); w.coord( rain.size[ 1 ] ); w.coord( rain.size[ 2 ] );
	w.angle( Math.trunc( rain.dir[ 0 ] ) ); w.angle( Math.trunc( rain.dir[ 1 ] ) );
	w.short( rain.color & 0xffff ); w.short( rain.count & 0xffff );
	return w.bytes();

}

/**
 * The `svc_particle_explosion` message (origin, 16-bit colour, radius and counter).
 *
 * @param {{ origin: ArrayLike<number>, color: number, radius: number, counter: number }} explosion the effect
 * @returns {Uint8Array} the message
 */
export function Hexen2_WriteParticleExplosion( explosion ) {

	const w = new Writer();
	w.byte( messageId( 'particle_explosion' ) );
	for ( let i = 0; i < 3; i ++ ) w.coord( explosion.origin[ i ] );
	w.short( explosion.color & 0xffff );
	w.short( explosion.radius & 0xffff );
	w.short( explosion.counter & 0xffff );
	return w.bytes();

}

/**
 * The `svc_sound_update_pos` message: the native `(entity << 3) | channel` word and the entity box centre, so a
 * moving sound's position follows it.
 *
 * @param {{ index: number, v: { origin: ArrayLike<number>, mins: ArrayLike<number>, maxs: ArrayLike<number> } }} entity
 * @param {number} channel 0..7
 * @returns {Uint8Array} the message
 */
export function Hexen2_WriteSoundUpdatePos( entity, channel ) {

	const w = new Writer();
	w.byte( messageId( 'sound_update_pos' ) );
	w.short( ( entity.index << 3 ) | channel );
	for ( let i = 0; i < 3; i ++ )
		w.coord( entity.v.origin[ i ] + 0.5 * ( entity.v.mins[ i ] + entity.v.maxs[ i ] ) );
	return w.bytes();

}

/**
 * Portal's white flash, exactly as the native `PF_doWhiteFlash`: the reliable `wf` client command.
 *
 * @returns {Uint8Array} the message
 */
export function Hexen2_WriteWhiteFlash() {

	const w = new Writer();
	w.byte( svc_stufftext );
	w.string( 'wf\n' );
	return w.bytes();

}

/**
 * A Hexen static entity during signon: a word model index, byte frame/colormap/skin, then the native
 * scale/drawflags/abslight bytes and its origin and angles.
 *
 * @param {{ v: { modelindex: number, frame: number, colormap: number, skin: number, scale: number,
 *   drawflags: number, abslight: number, origin: ArrayLike<number>, angles: ArrayLike<number> } }} entity
 * @returns {Uint8Array} the message
 */
export function Hexen2_WriteStaticEntity( entity ) {

	const v = entity.v, w = new Writer();
	w.byte( svc_spawnstatic );
	w.short( ( v.modelindex | 0 ) & 0xffff );
	w.byte( v.frame | 0 );
	w.byte( v.colormap | 0 );
	w.byte( v.skin | 0 );
	w.byte( Math.trunc( ( v.scale ?? 0 ) * 100 ) & 0xff );
	w.byte( ( v.drawflags ?? 0 ) | 0 );
	w.byte( Math.trunc( ( v.abslight ?? 0 ) * 255 ) & 0xff );
	for ( let i = 0; i < 3; i ++ ) w.coord( v.origin[ i ] );
	for ( let i = 0; i < 3; i ++ ) w.angle( v.angles[ i ] );
	return w.bytes();

}
