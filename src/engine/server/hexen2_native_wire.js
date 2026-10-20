/**
 * @module engine/server/hexen2_native_wire
 *
 * Translates the native Hexen II service bytes the gamecode writes through its `WriteByte`/`WriteShort`/`WriteEntity`/
 * `WriteCoord`/`WriteAngle`/`WriteString` builtins (#52-#59) into the unified protocol. The native and unified ids are
 * not interchangeable: `svc_temp_entity` is 23 in both, but Hexen's stream types 24..32 are the unified id 70, and
 * native 40/41/46/50/53 are Quake playerinfo/packet-entity/sequence messages here. Each destination buffer therefore
 * has a small state machine: a service id and its body are held until the body is complete, then the mapped id and the
 * same native body are written. A native message with no unified meaning is dropped after its body, never written raw;
 * a known no-op (king of the hill) is silent, an unsupported extension (UQE's mod name/skybox) warns.
 *
 * The native numbers and body widths come from uhexen2 `engine/hexen2/protocol.h` and the gamecode writes in
 * `gamecode/hc/h2`/`portals` (`SV_StartParticle*`, `PF_*`); the unified ids are `common/protocol.js` 50-71.
 *
 * Types: plain values and functions; no exported classes.
 * State: one pending native frame per destination buffer (a `WeakMap`).
 * Errors: none raised; an incomplete frame is discarded by `Hexen2_FlushNativeService`.
 */

import { GameProfile_IsHexen2 } from '../common/game_profile.js';
import { MSG_WriteByte } from '../common/common.js';
import { Con_Printf } from '../common/console.js';
import {
	svc_hexen2_intermission, svc_hexen2_plaque, svc_hexen2_raineffect, svc_hexen2_particle2,
	svc_hexen2_particle3, svc_hexen2_particle4, svc_hexen2_particle_explosion, svc_hexen2_set_view_flags,
	svc_hexen2_clear_view_flags, svc_hexen2_set_view_tint, svc_hexen2_setangle_interpolate, svc_hexen2_midi_name,
	svc_hexen2_updateclass, svc_hexen2_toggle_statbar, svc_hexen2_sound_update_pos, svc_hexen2_start_effect,
	svc_hexen2_end_effect, svc_hexen2_update_inv, svc_hexen2_temp_entity
} from '../common/protocol.js';
import { pr_global_struct } from '../progs/progs.js';
import { CE } from '../common/hexen2_effectwire.js';
import { HEXEN2_STAT_FIELDS } from '../common/hexen2_clientdata.js';

// The native service ids and their bodies. A body is the write widths after the opcode: 1 byte, 2 short, 4 long and
// 's' a NUL-terminated string. `id` is the unified id; null means the native message has no unified equivalent and is
// dropped after its body has been consumed.
const NATIVE_SERVICES = Object.freeze( {
	3: { id: 3, body: [ 1, 4 ] }, // svc_updatestat: byte, long
	4: { id: 4, body: [ 4 ] }, // svc_version
	5: { id: 5, body: [ 2 ] }, // svc_setview (the camera builtin's WriteEntity)
	7: { id: 7, body: [ 4 ] }, // svc_time
	8: { id: 8, body: [ 's' ] }, // svc_print
	9: { id: 9, body: [ 's' ] }, // svc_stufftext
	10: { id: 10, body: [ 1, 1, 1 ] }, // svc_setangle
	12: { id: 12, body: [ 1, 's' ] }, // svc_lightstyle
	13: { id: 13, body: [ 1, 's' ] }, // svc_updatename
	14: { id: 14, body: [ 1, 2 ] }, // svc_updatefrags
	16: { id: 16, body: [ 2 ] }, // svc_stopsound
	17: { id: 17, body: [ 1, 1 ] }, // svc_updatecolors
	19: { id: 19, body: [] }, // svc_damage
	21: { id: svc_hexen2_raineffect, body: [ 2, 2, 2, 2, 2, 2, 1, 1, 2, 2 ] }, // svc_raineffect
	23: { id: svc_hexen2_temp_entity, temp: true }, // svc_temp_entity: the type byte selects the body
	24: { id: 24, body: [ 1 ] }, // svc_setpause
	25: { id: 25, body: [ 1 ] }, // svc_signonnum
	26: { id: 26, body: [ 's' ] }, // svc_centerprint
	27: { id: 27, body: [] }, // svc_killedmonster
	28: { id: 28, body: [] }, // svc_foundsecret
	29: { id: 29, body: [ 2, 2, 2, 1, 1, 1 ] }, // svc_spawnstaticsound
	30: { id: svc_hexen2_intermission, body: [ 1 ], intermission: true }, // native svc_intermission: a picture index
	31: { id: 31, body: [ 's', 's' ] }, // svc_finale
	32: { id: 32, body: [ 1, 1 ] }, // svc_cdtrack
	33: { id: 33, body: [] }, // svc_sellscreen
	34: { id: svc_hexen2_particle2, body: [ 2, 2, 2, 4, 4, 4, 4, 4, 4, 2, 1, 1 ] },
	36: { id: svc_hexen2_midi_name, body: [ 's' ] }, // svc_midi_name
	37: { id: svc_hexen2_updateclass, body: [ 1, 1 ] }, // svc_updateclass
	38: { id: svc_hexen2_particle3, body: [ 2, 2, 2, 1, 1, 1, 2, 1, 1 ] },
	39: { id: svc_hexen2_particle4, body: [ 2, 2, 2, 1, 2, 1, 1 ] },
	40: { id: svc_hexen2_set_view_flags, body: [ 1 ] }, // svc_set_view_flags
	41: { id: svc_hexen2_clear_view_flags, body: [ 1 ] }, // svc_clear_view_flags
	42: { id: svc_hexen2_start_effect, effect: true }, // svc_start_effect: index, type and the type's body
	43: { id: svc_hexen2_end_effect, body: [ 1 ] }, // svc_end_effect
	44: { id: svc_hexen2_plaque, body: [ 2 ] }, // svc_plaque
	45: { id: svc_hexen2_particle_explosion, body: [ 2, 2, 2, 2, 2, 2 ] }, // svc_particle_explosion
	46: { id: svc_hexen2_set_view_tint, body: [ 1 ] }, // svc_set_view_tint
	49: { id: svc_hexen2_update_inv, inv: true }, // svc_update_inv: flags, optional mask bytes and fields
	50: { id: svc_hexen2_setangle_interpolate, body: [ 1, 1, 1 ] }, // svc_setangle_interpolate
	51: { id: null, body: [ 2 ] }, // svc_update_kingofhill: no unified equivalent, drop its short body
	52: { id: svc_hexen2_toggle_statbar, body: [] }, // svc_toggle_statbar
	53: { id: svc_hexen2_sound_update_pos, body: [ 2, 2, 2, 2 ] }, // short, three coords
	54: { id: null, body: [ 's' ], warn: true }, // svc_mod_name (UQE only)
	55: { id: null, body: [ 's' ], warn: true } // svc_skybox (UQE only)
} );

// The native stream temp entities (uhexen2 cl_tent.c ParseStream): entity short, flags, duration, an optional colour
// skin, then source and destination.
const STREAM_MIN = 24, STREAM_MAX = 32, STREAM_COLORBEAM = 29;
const STREAM_BODY = [ 2, 1, 1, 2, 2, 2, 2, 2, 2 ];
// Quake's TE bodies: the lightning/beam types carry an entity short first, the rest are three coords.
const QUAKE_LIGHTNING = new Set( [ 5, 6, 9, 13 ] );

// Start-effect bodies by CE_* type (hexen2_effectwire.js Hexen2_WriteStartEffect): coord=2, byte=1, short=2, float=4.
const SMOKE = new Set( [ 4, 20, 21, 22, 23, 26, 27, 35, 37 ] );
const MISSION_SMOKE = new Set( [ 42, 46, 59, 60, 62 ] );
const ORIGIN_ONLY = new Set( [ 5, 6, 7, 8, 9, 11, 15, 16, 17, 19, 24, 25, 28, 29, 30, 31, 32, 33, 34, 36, 45, 47, 48, 49, 50, 51, 52, 53, 54, 56, 57, 58, 61 ] );
const FLASH = new Set( [ 10, 12, 13, 14 ] );
const COORD3 = [ 2, 2, 2 ], FLOAT3 = [ 4, 4, 4 ];

const frames = new WeakMap(); // sizebuf_t -> the native frame being translated

function effectPlan( type ) {

	if ( type === CE.RAIN ) return [ ...COORD3, ...COORD3, ...COORD3, ...COORD3, 2, 2, 4 ];
	if ( type === CE.SNOW ) return [ ...COORD3, ...COORD3, 1, ...COORD3, 1 ];
	if ( type === CE.FOUNTAIN ) return [ ...COORD3, 1, 1, 1, ...COORD3, 2, 1 ];
	if ( type === CE.QUAKE ) return [ ...COORD3, 4 ];
	if ( type === CE.GRAVITYWELL ) return [ ...COORD3, 2, 4 ];
	if ( type === CE.TELEPORTERBODY ) return [ ...COORD3, ...FLOAT3, 4 ];
	if ( type === CE.BONESHARD || type === CE.BONESHRAPNEL ) return [ ...COORD3, ...FLOAT3, ...FLOAT3, ...FLOAT3 ];
	if ( type === CE.CHUNK ) return [ ...COORD3, 1, ...COORD3, 1 ];
	if ( type === CE.RIDER_DEATH || type === CE.TELEPORTERPUFFS ) return [ ...COORD3 ];
	if ( SMOKE.has( type ) || MISSION_SMOKE.has( type ) ) return [ ...COORD3, ...FLOAT3, 4, 4 ];
	if ( FLASH.has( type ) || ORIGIN_ONLY.has( type ) ) return [ ...COORD3 ];
	return null;

}

const FIELD_WIDTH = Object.freeze( { byte: 1, short: 2, long: 4, float: 4, string: 's' } );

function invPlan( mask ) {

	const plan = [];
	for ( const [ bit, field, type ] of HEXEN2_STAT_FIELDS )
		if ( ( mask & BigInt( bit ) ) !== 0n ) plan.push( FIELD_WIDTH[ type ] );
	return plan;

}

function tokenBytes( kind, value ) {

	if ( kind === 'string' ) {

		const out = [];
		for ( const ch of String( value ?? '' ) ) out.push( ch.charCodeAt( 0 ) & 0xff );
		out.push( 0 );
		return out;

	}
	if ( kind === 'coord' ) value = ( value * 8 ) | 0;
	else if ( kind === 'angle' ) value = ( ( value | 0 ) * 256 / 360 ) & 0xff;
	const width = kind === 'long' ? 4 : kind === 'short' || kind === 'entity' || kind === 'coord' ? 2 : 1;
	const out = [];
	for ( let i = 0; i < width; i ++ ) out.push( ( value >> ( i * 8 ) ) & 0xff );
	return out;

}

function emit( msg, frame ) {

	frames.delete( msg );
	if ( frame.mapped === null ) return;
	MSG_WriteByte( msg, frame.mapped );
	for ( const byte of frame.out ) MSG_WriteByte( msg, byte );

}

function advance( msg, frame, kind, value ) {

	const bytes = tokenBytes( kind, value );
	if ( frame.plan.length === 0 ) return;

	const expected = frame.plan[ 0 ];
	if ( expected !== 's' && expected !== bytes.length ) {

		Con_Printf( 'Hexen2 native service %d: body token %d bytes, expected %s; message dropped\n', frame.native,
			bytes.length, String( expected ) );
		frames.delete( msg );
		return;

	}

	frame.plan.shift();
	frame.out.push( ...bytes );
	if ( frame.plan.length === 0 ) emit( msg, frame );

}

function feed( msg, kind, value ) {

	const frame = frames.get( msg );
	if ( frame === undefined ) return false;

	if ( frame.kind === 'temp' ) {

		if ( frame.plan === null ) {

			// The temp-entity type byte chooses the body and the unified id.
			const type = value & 0xff;
			frame.out.push( type );
			if ( type >= STREAM_MIN && type <= STREAM_MAX ) {

				frame.mapped = svc_hexen2_temp_entity;
				frame.plan = type === STREAM_COLORBEAM ? [ 2, 1, 1, 1, 2, 2, 2, 2, 2, 2 ] : STREAM_BODY.slice();

			} else if ( type >= 0 && type <= 13 ) {

				frame.mapped = 23;
				frame.plan = QUAKE_LIGHTNING.has( type ) ? [ 2, 2, 2, 2, 2, 2, 2 ] : [ 2, 2, 2 ];

			} else {

				Con_Printf( 'Hexen2 native temp entity type %d has no unified equivalent; message dropped\n', type );
				frame.mapped = null;
				frame.plan = STREAM_BODY.slice();

			}
			if ( frame.plan.length === 0 ) emit( msg, frame );
			return true;

		}
		advance( msg, frame, kind, value );
		return true;

	}

	if ( frame.kind === 'effect' ) {

		if ( frame.plan === null ) {

			frame.out.push( value & 0xff );
			if ( frame.stage === 0 ) { frame.stage = 1; return true; }
			// stage 1 is the CE_* type; its body follows.
			const plan = effectPlan( value & 0xff );
			if ( plan === null ) Con_Printf( 'Hexen2 native start_effect type %d is unknown; message dropped\n', value & 0xff );
			frame.mapped = plan === null ? null : svc_hexen2_start_effect;
			frame.plan = plan ?? [];
			if ( frame.plan.length === 0 ) emit( msg, frame );
			return true;

		}
		advance( msg, frame, kind, value );
		return true;

	}

	if ( frame.kind === 'inv' ) {

		frame.out.push( value & 0xff );
		if ( frame.stage === 'flags' ) {

			const flags = value & 0xff;
			frame.blocks = [];
			frame.remaining = 0;
			for ( let i = 0; i < 7; i ++ ) if ( flags & ( 1 << i ) ) frame.remaining ++;
			frame.stage = frame.remaining === 0 ? 'fields' : 'blocks';
			if ( frame.stage === 'fields' ) { frame.plan = invPlan( 0n ); if ( frame.plan.length === 0 ) emit( msg, frame ); }

		} else if ( frame.stage === 'blocks' ) {

			frame.blocks.push( value & 0xff );
			if ( -- frame.remaining === 0 ) {

				let mask = 0n;
				frame.blocks.forEach( ( block, i ) => { mask |= BigInt( block ) << BigInt( i * 8 ); } );
				frame.plan = invPlan( mask );
				frame.stage = 'fields';
				if ( frame.plan.length === 0 ) emit( msg, frame );

			}

		} else advance( msg, frame, kind, value );
		return true;

	}

	advance( msg, frame, kind, value );
	return true;

}

function startFrame( msg, native, descriptor ) {

	if ( descriptor.warn ) Con_Printf( 'Hexen2 native service %d has no unified equivalent; message dropped\n', native );
	const frame = { native, kind: 'native', mapped: descriptor.id, out: [], plan: ( descriptor.body ?? [] ).slice() };
	if ( descriptor.temp ) { frame.kind = 'temp'; frame.mapped = null; frame.plan = null; }
	else if ( descriptor.effect ) { frame.kind = 'effect'; frame.mapped = null; frame.plan = null; frame.stage = 0; }
	else if ( descriptor.inv ) { frame.kind = 'inv'; frame.mapped = descriptor.id; frame.plan = null; frame.stage = 'flags'; }
	frames.set( msg, frame );
	if ( frame.kind === 'native' && frame.plan.length === 0 ) emit( msg, frame );
	return true;

}

/**
 * Writes one byte from the gamecode's native message writers (#52/#53). A native service opcode starts a frame; body
 * bytes go to that frame until it is complete, then the mapped unified message is written. Ordinary bytes are left to
 * the caller.
 *
 * @param {sizebuf_t} msg the destination buffer
 * @param {number} value the byte
 * @returns {boolean} true when the module consumed the write
 */
export function Hexen2_WriteNativeServiceByte( msg, value ) {

	if ( !GameProfile_IsHexen2() || msg === null || msg === undefined ) return false;
	value = value | 0;
	if ( feed( msg, 'byte', value ) ) return true;
	const descriptor = NATIVE_SERVICES[ value ];
	if ( descriptor === undefined ) return false;
	// The native svc_intermission is only an intermission while the gamecode has one running; every other byte 30
	// would be a Quake message (or a body byte, which the frame above prevents seeing).
	if ( descriptor.intermission && !( ( pr_global_struct?.intermission_running | 0 ) > 0 ) ) return false;
	return startFrame( msg, value, descriptor );

}

/** Writes one short from the native writers (#54/#59), inside a pending native frame. */
export function Hexen2_WriteNativeServiceShort( msg, value ) {

	if ( !GameProfile_IsHexen2() || msg === null || msg === undefined ) return false;
	return feed( msg, 'short', value | 0 );

}

/** Writes one entity number from the native writer (#59), inside a pending native frame. */
export function Hexen2_WriteNativeServiceEntity( msg, value ) {

	if ( !GameProfile_IsHexen2() || msg === null || msg === undefined ) return false;
	return feed( msg, 'entity', value | 0 );

}

/** Writes one long from the native writer (#55), inside a pending native frame. */
export function Hexen2_WriteNativeServiceLong( msg, value ) {

	if ( !GameProfile_IsHexen2() || msg === null || msg === undefined ) return false;
	return feed( msg, 'long', value | 0 );

}

/** Writes one coordinate from the native writer (#56), inside a pending native frame. */
export function Hexen2_WriteNativeServiceCoord( msg, value ) {

	if ( !GameProfile_IsHexen2() || msg === null || msg === undefined ) return false;
	return feed( msg, 'coord', Number( value ) || 0 );

}

/** Writes one angle from the native writer (#57), inside a pending native frame. */
export function Hexen2_WriteNativeServiceAngle( msg, value ) {

	if ( !GameProfile_IsHexen2() || msg === null || msg === undefined ) return false;
	return feed( msg, 'angle', Number( value ) || 0 );

}

/** Writes one string from the native writer (#58), inside a pending native frame. */
export function Hexen2_WriteNativeServiceString( msg, value ) {

	if ( !GameProfile_IsHexen2() || msg === null || msg === undefined ) return false;
	return feed( msg, 'string', value );

}

/**
 * Discards a native frame whose message ended before its body did. A complete message has already been written, so
 * this is only a safety valve for a malformed gamecode write.
 *
 * @param {sizebuf_t} msg the destination buffer
 */
export function Hexen2_FlushNativeService( msg ) {

	const frame = frames.get( msg );
	if ( frame === undefined ) return;
	frames.delete( msg );
	Con_Printf( 'Hexen2 native service %d ended before its body; message dropped\n', frame.native );

}
