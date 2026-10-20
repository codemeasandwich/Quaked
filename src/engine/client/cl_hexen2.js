/**
 * @module engine/client/cl_hexen2
 *
 * The Hexen II messages on the one unified protocol (docs/hexen2/unified-host.md §2-3): the feature message that marks
 * a session, the native signon baseline layout, `svc_update_inv` and the per-client class, plaques, rain, extra
 * particles, view flags/tint, MIDI name, intermission index, objective masks and the temp-entity stream types.
 *
 * Everything a Quake message already carries (print, centerprint, light styles, statics, ambient sounds, cdtrack,
 * intermission state) stays in `cl_parse.js`; this module only reads the ids Quake has no meaning for. The message
 * bodies follow the pinned uhexen2 engine/hexen2 protocol and the codecs in `common/hexen2_*`; rendering and audio are
 * reached through the hooks below so U8/U9 can install their implementations without a second parser.
 *
 * Types: plain values and functions; no exported classes.
 * State: `cl.h2` is the only state, replaced by `CL_Hexen2Reset` at each serverinfo; the installed hooks are module
 * state.
 * Errors: malformed messages throw, which the host's `CL_ParseServerMessage` catches as a bad server message.
 */

import {
	MSG_ReadByte, MSG_ReadShort, MSG_ReadLong, MSG_ReadFloat, MSG_ReadCoord, MSG_ReadAngle, MSG_ReadString,
	net_message, msg_readcount
} from '../common/common.js';
import {
	svc_hexen2_features, svc_hexen2_start_effect, svc_hexen2_end_effect, svc_hexen2_update_inv,
	svc_hexen2_plaque, svc_hexen2_raineffect, svc_hexen2_particle2, svc_hexen2_particle3, svc_hexen2_particle4,
	svc_hexen2_particle_explosion, svc_hexen2_set_view_flags, svc_hexen2_clear_view_flags, svc_hexen2_set_view_tint,
	svc_hexen2_setangle_interpolate, svc_hexen2_midi_name, svc_hexen2_updateclass, svc_hexen2_toggle_statbar,
	svc_hexen2_sound_update_pos, svc_hexen2_intermission, svc_hexen2_temp_entity, svc_hexen2_info_mask,
	svc_hexen2_update_kingofhill, HEXEN2_FEATURE_ENTITY_FIELDS, HEXEN2_FEATURE_NATIVE_BASELINES, HEXEN2_FEATURE_PORTALS,
	TE_STREAM_LIGHTNING_SMALL, TE_STREAM_COLORBEAM, TE_STREAM_FAMINE
} from '../common/protocol.js';
import { HEXEN2_SERVER_MESSAGES } from '../common/hexen2_protocol.js';
import { Hexen2_DecodeUpdateInv } from '../common/hexen2_clientdata.js';
import { Hexen2_ReadStartEffect, Hexen2_ReadEndEffect } from '../common/hexen2_effectwire.js';
import { Hexen2_ReadSound } from '../common/hexen2_soundwire.js';
import { Hexen2_ApplyIntermission } from './hexen2_intermission.js';
import { cl } from './client.js';

const PARTICLE_HISTORY = 64;
const RAIN_HISTORY = 16;
const STREAM_HISTORY = 16;

// The presentation seams. Each is a no-op until U8/U9 installs its renderer/audio side; the decoded record is stored on
// cl.h2 either way, so a test (and a late renderer) can read what the server sent.
let hooks = Object.freeze( {
	startEffect: null, endEffect: null, plaque: null, rain: null, particle: null, stream: null,
	viewFlags: null, viewTint: null, midiName: null, intermission: null, statbar: null, infoMask: null,
	updateClass: null, soundUpdatePos: null, angleInterpolate: null
} );

/**
 * Installs the presentation hooks (U8/U9). Members left out keep the current function.
 *
 * @param {object} next the hook functions; each receives the decoded record
 */
export function Hexen2_SetClientHooks( next ) { hooks = Object.freeze( { ...hooks, ...next } ); }

/** @returns {object} the installed presentation hooks */
export function Hexen2_ClientHooks() { return hooks; }

function hook( name, ...args ) { const fn = hooks[ name ]; if ( typeof fn === 'function' ) fn( ...args ); }

/** A fresh Hexen II client state, as a new serverinfo or `connect` starts one. */
export function CL_Hexen2Reset() {

	cl.h2 = {
		active: false, entityFields: false, nativeBaselines: false, portals: false,
		levelStringIndex: 0xffff, midiName: '', plaqueIndex: 0, intermission: - 1, statbar: 1,
		intermissionFlags: 0, intermissionPic: '', intermissionMessageIndex: -1, intermissionLastingTime: 0,
		intermissionNext: 0, intermissionCompletedTime: 0,
		viewDrawflags: 0, viewTint: 0, infoMask: 0, infoMask2: 0, kingOfHill: - 1,
		playerclass: [], stats: {}, puzzles: [ '', '', '', '', '', '', '', '' ],
		effects: [], particles: [], rain: [], streams: [], angleTarget: [ 0, 0, 0 ]
	};

}

/*
================
CL_Hexen2Scale

The native scale byte as the renderer's float: 100 (and 0, which native draws at normal size) is 1.0.
================
*/
/**
 * Decodes uhexen2's scale byte.
 *
 * @param {number} byte the wire byte (scale*100)
 * @returns {number} the float scale, 1.0 for the native "normal" encodings
 */
export function CL_Hexen2Scale( byte ) { return byte === 0 || byte === 100 ? 1.0 : byte / 100; }

/**
 * Reads the native signon baseline/static body into `ent.baseline`: model (short), frame, colormap, skin, scale,
 * drawflags, abslight, then origin/angle pairs. Called by `CL_ParseBaseline` for a Hexen II session; a Quake session
 * uses the WinQuake layout in cl_parse.js.
 *
 * @param {entity_t} ent the client entity whose baseline is written
 */
export function CL_Hexen2ParseBaseline( ent ) {

	ent.baseline.modelindex = MSG_ReadShort();
	ent.baseline.frame = MSG_ReadByte();
	ent.baseline.colormap = MSG_ReadByte();
	ent.baseline.skin = MSG_ReadByte();
	ent.baseline.scale = MSG_ReadByte();
	ent.baseline.drawflags = MSG_ReadByte();
	ent.baseline.abslight = MSG_ReadByte();
	for ( let i = 0; i < 3; i ++ ) {

		ent.baseline.origin[ i ] = MSG_ReadCoord();
		ent.baseline.angles[ i ] = MSG_ReadAngle();

	}

}

// The bytes a native body occupies, used only to reuse the common decoders without a second parser. `at` is the
// message cursor after the opcode.
function remainder() { return net_message.data.subarray( msg_readcount, net_message.cursize ); }

function skip( count ) { for ( let i = 0; i < count; i ++ ) MSG_ReadByte(); }

// A scratch buffer with the native opcode in front, for a codec that expects the native id rather than the unified one.
let _scratch = new Uint8Array( 256 );
function withNativeOpcode( opcode ) {

	const body = remainder();
	if ( body.length + 1 > _scratch.length ) _scratch = new Uint8Array( body.length + 1 );
	_scratch[ 0 ] = opcode;
	_scratch.set( body, 1 );
	return _scratch.subarray( 0, body.length + 1 );

}

function bad( what ) { throw new Error( 'CL_Hexen2: ' + what ); }

/*
================
CL_Hexen2ParseServerMessage

Dispatches one unified `svc_hexen2_*` message (its opcode already read). Returns false for a Quake id, which the caller
handles.
================
*/
/**
 * Reads and applies a Hexen II service message.
 *
 * @param {number} cmd the service id just read from `net_message`
 * @returns {boolean} true when it was a Hexen II message and was consumed
 */
export function CL_Hexen2ParseServerMessage( cmd ) {

	switch ( cmd ) {

		case svc_hexen2_features: {

			const flags = MSG_ReadByte();
			cl.h2.levelStringIndex = MSG_ReadShort() & 0xffff;
			cl.h2.active = true;
			cl.h2.entityFields = ( flags & HEXEN2_FEATURE_ENTITY_FIELDS ) !== 0;
			cl.h2.nativeBaselines = ( flags & HEXEN2_FEATURE_NATIVE_BASELINES ) !== 0;
			cl.h2.portals = ( flags & HEXEN2_FEATURE_PORTALS ) !== 0;
			return true;

		}

		case svc_hexen2_update_inv: {

			const read = Hexen2_DecodeUpdateInv( remainder(), { allowTrailing: true } );
			if ( ! read.ok ) bad( read.reason );
			Object.assign( cl.h2.stats, read.stats );
			for ( let i = 1; i <= 8; i ++ )
				if ( Object.hasOwn( read.stats, 'puzzle_inv' + i ) ) cl.h2.puzzles[ i - 1 ] = read.stats[ 'puzzle_inv' + i ];
			skip( read.consumed );
			return true;

		}

		case svc_hexen2_start_effect: {

			const read = Hexen2_ReadStartEffect( withNativeOpcode( HEXEN2_SERVER_MESSAGES.start_effect ), { allowTrailing: true, protocol: 19 } );
			if ( ! read.ok ) bad( read.reason );
			skip( read.consumed - 1 );
			cl.h2.effects[ read.index ] = { index: read.index, type: read.type, params: read.params, startedAt: cl.time };
			hook( 'startEffect', cl.h2.effects[ read.index ] );
			return true;

		}

		case svc_hexen2_end_effect: {

			const read = Hexen2_ReadEndEffect( withNativeOpcode( HEXEN2_SERVER_MESSAGES.end_effect ).subarray( 0, 2 ) );
			if ( ! read.ok ) bad( read.reason );
			skip( 1 );
			const ended = cl.h2.effects[ read.index ] ?? { index: read.index };
			delete cl.h2.effects[ read.index ];
			hook( 'endEffect', ended );
			return true;

		}

		case svc_hexen2_sound_update_pos: {

			const read = Hexen2_ReadSound( withNativeOpcode( HEXEN2_SERVER_MESSAGES.sound_update_pos ), { allowTrailing: true } );
			if ( ! read.ok ) bad( read.reason );
			skip( read.consumed - 1 );
			cl.h2.lastSoundPosition = read.sound;
			hook( 'soundUpdatePos', read.sound );
			return true;

		}

		case svc_hexen2_plaque: {

			const index = MSG_ReadShort();
			cl.h2.plaqueIndex = index;
			hook( 'plaque', index );
			return true;

		}

		case svc_hexen2_raineffect: {

			const origin = readVectors( 3, MSG_ReadCoord ), size = readVectors( 3, MSG_ReadCoord );
			const xDir = MSG_ReadAngle(), yDir = MSG_ReadAngle();
			const colour = MSG_ReadShort(), count = MSG_ReadShort();
			const record = { origin, size, xDir, yDir, colour, count };
			cl.h2.rain.push( record );
			if ( cl.h2.rain.length > RAIN_HISTORY ) cl.h2.rain.shift();
			hook( 'rain', record );
			return true;

		}

		case svc_hexen2_particle2: {

			const record = {
				kind: 'particle2', origin: readVectors( 3, MSG_ReadCoord ),
				dmin: readVectors( 3, MSG_ReadFloat ), dmax: readVectors( 3, MSG_ReadFloat ),
				colour: MSG_ReadShort(), count: MSG_ReadByte(), effect: MSG_ReadByte()
			};
			pushParticle( record );
			return true;

		}

		case svc_hexen2_particle3: {

			const record = {
				kind: 'particle3', origin: readVectors( 3, MSG_ReadCoord ), box: readVectors( 3, MSG_ReadByte ),
				colour: MSG_ReadShort(), count: MSG_ReadByte(), effect: MSG_ReadByte()
			};
			pushParticle( record );
			return true;

		}

		case svc_hexen2_particle4: {

			const record = {
				kind: 'particle4', origin: readVectors( 3, MSG_ReadCoord ), radius: MSG_ReadByte(),
				colour: MSG_ReadShort(), count: MSG_ReadByte(), effect: MSG_ReadByte()
			};
			pushParticle( record );
			return true;

		}

		case svc_hexen2_particle_explosion: {

			const record = {
				kind: 'particle_explosion', origin: readVectors( 3, MSG_ReadCoord ),
				colour: MSG_ReadShort(), radius: MSG_ReadShort(), counter: MSG_ReadShort()
			};
			pushParticle( record );
			return true;

		}

		case svc_hexen2_set_view_flags: {

			const flags = MSG_ReadByte();
			cl.h2.viewDrawflags |= flags;
			cl.viewent.drawflags = cl.h2.viewDrawflags;
			hook( 'viewFlags', cl.h2.viewDrawflags );
			return true;

		}

		case svc_hexen2_clear_view_flags: {

			const flags = MSG_ReadByte();
			cl.h2.viewDrawflags &= ~flags;
			cl.viewent.drawflags = cl.h2.viewDrawflags;
			hook( 'viewFlags', cl.h2.viewDrawflags );
			return true;

		}

		case svc_hexen2_set_view_tint: {

			cl.h2.viewTint = MSG_ReadByte();
			cl.viewent.colorshade = cl.h2.viewTint;
			hook( 'viewTint', cl.h2.viewTint );
			return true;

		}

		case svc_hexen2_setangle_interpolate: {

			const target = readVectors( 3, MSG_ReadAngle );
			cl.h2.angleTarget = target;
			CL_Hexen2InterpolateAngles( target );
			hook( 'angleInterpolate', target );
			return true;

		}

		case svc_hexen2_midi_name: {

			cl.h2.midiName = MSG_ReadString();
			hook( 'midiName', cl.h2.midiName );
			return true;

		}

		case svc_hexen2_updateclass: {

			const slot = MSG_ReadByte(), playerclass = MSG_ReadByte();
			if ( slot >= Math.max( 1, cl.maxclients ) ) bad( 'svc_updateclass past the client count' );
			cl.h2.playerclass[ slot ] = playerclass;
			if ( cl.scores && cl.scores[ slot ] ) cl.scores[ slot ].playerclass = playerclass;
			hook( 'updateClass', { slot, playerclass } );
			return true;

		}

		case svc_hexen2_toggle_statbar: {

			cl.h2.statbar = cl.h2.statbar ? 0 : 1;
			hook( 'statbar', cl.h2.statbar );
			return true;

		}

		case svc_hexen2_intermission: {

			const index = MSG_ReadByte();
			// The native picture/text/flags table lives in hexen2_intermission.js; `cl.intermission` stays the Quake
			// "full-screen, idle view" flag the shared renderer and view test.
			Hexen2_ApplyIntermission( cl, index, cl.time );
			hook( 'intermission', index );
			return true;

		}

		case svc_hexen2_info_mask: {

			cl.h2.infoMask = MSG_ReadLong() >>> 0;
			cl.h2.infoMask2 = MSG_ReadLong() >>> 0;
			hook( 'infoMask', { infoMask: cl.h2.infoMask, infoMask2: cl.h2.infoMask2 } );
			return true;

		}

		case svc_hexen2_update_kingofhill: {

			// Native cl_parse.c:1364-1365 subtracts one: the wire entity is one-based, the scoreboard is zero-based.
			cl.h2.kingOfHill = MSG_ReadShort() - 1;
			return true;

		}

		case svc_hexen2_temp_entity: {

			const type = MSG_ReadByte();
			CL_Hexen2TempEntity( type );
			return true;

		}

		default:
			return false;

	}

}

function readVectors( count, reader ) {

	const out = new Array( count );
	for ( let i = 0; i < count; i ++ ) out[ i ] = reader();
	return out;

}

function pushParticle( record ) {

	cl.h2.particles.push( record );
	if ( cl.h2.particles.length > PARTICLE_HISTORY ) cl.h2.particles.shift();
	hook( 'particle', record );

}

/*
================
CL_Hexen2InterpolateAngles

The native svc_setangle_interpolate step: move one eighth of the shortest way from the current view angles to the
target, then normalise into -180..180. Repeated messages converge; one message moves one step, as uhexen2 does.
================
*/
/**
 * Steps `cl.viewangles` one eighth of the way to a target (uhexen2 CL_ParseServerMessage svc_setangle_interpolate).
 *
 * @param {ArrayLike<number>} target the three target angles in degrees
 */
export function CL_Hexen2InterpolateAngles( target ) {

	for ( let i = 0; i < 3; i ++ ) {

		let current = cl.viewangles[ i ] % 360;
		if ( current > 180 ) current -= 360;
		else if ( current < - 180 ) current += 360;
		let delta = target[ i ] - current;
		if ( delta > 180 ) delta -= 360;
		else if ( delta < - 180 ) delta += 360;
		let next = current + delta / 8;
		if ( next > 180 ) next -= 360;
		else if ( next < - 180 ) next += 360;
		cl.viewangles[ i ] = next;

	}

}

/*
================
CL_Hexen2TempEntity

The Hexen II temp-entity stream types 24..32 (uhexen2 cl_tent.c ParseStream): entity, flags (low four bits the tag),
duration in 0.05 s steps, a skin byte only for the colour beam, then source and destination.
================
*/
function CL_Hexen2TempEntity( type ) {

	if ( type < TE_STREAM_LIGHTNING_SMALL || type > TE_STREAM_FAMINE ) bad( 'unknown Hexen temp entity ' + type );
	const entity = MSG_ReadShort();
	const flags = MSG_ReadByte();
	const duration = MSG_ReadByte() * 0.05;
	const skin = type === TE_STREAM_COLORBEAM ? MSG_ReadByte() : 0;
	const source = readVectors( 3, MSG_ReadCoord );
	const dest = readVectors( 3, MSG_ReadCoord );
	const record = { type, entity, flags, tag: flags & 15, duration, skin, source, dest };
	cl.h2.streams.push( record );
	if ( cl.h2.streams.length > STREAM_HISTORY ) cl.h2.streams.shift();
	hook( 'stream', record );

}
