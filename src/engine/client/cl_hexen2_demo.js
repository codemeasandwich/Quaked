/**
 * @module engine/client/cl_hexen2_demo
 *
 * Native Hexen II demo playback (uhexen2 engine/hexen2/cl_demo.c, cl_parse.c, protocol.h): the demo keeps Raven's
 * protocol 18/19 framing and server stream, but the shared client only speaks the unified Quaked protocol. This module
 * reads a native server message and rewrites it into the ids and entity layout of `common/protocol.js`, so the one
 * `CL_ParseServerMessage` parses a Hexen II demo exactly as it parses a live Hexen II server.
 *
 * The translation is per demo record, which is one native server frame: service bodies that Quake already understands
 * keep their body, the Hexen-only bodies (effects, rain, particles, inventory, plaque, view state, MIDI, objective
 * masks, sound positions, streams) move to their `svc_hexen2_*` ids, and the native reference-frame entity updates are
 * flattened into one full QW-style entity packet for the frame. `svc_reference` and `svc_clear_edicts` therefore never
 * reach the shared parser; a cleared entity simply disappears from the next full packet.
 *
 * Types: plain values and functions; no exported classes.
 * State: one module-level translator, started by `CL_Hexen2Demo_Start` and dropped by `CL_Hexen2Demo_Stop`.
 * Errors: malformed or unsupported demos return `{ ok: false, reason }`; the caller stops playback instead of guessing.
 */

import {
	svc_version, svc_serverinfo, svc_sound, svc_particle, svc_spawnbaseline, svc_spawnstatic,
	svc_spawnstaticsound, svc_temp_entity, svc_clientdata,
	svc_hexen2_features, svc_hexen2_start_effect, svc_hexen2_end_effect, svc_hexen2_update_inv,
	svc_hexen2_plaque, svc_hexen2_raineffect, svc_hexen2_particle2, svc_hexen2_particle3, svc_hexen2_particle4,
	svc_hexen2_particle_explosion, svc_hexen2_set_view_flags, svc_hexen2_clear_view_flags, svc_hexen2_set_view_tint,
	svc_hexen2_setangle_interpolate, svc_hexen2_midi_name, svc_hexen2_updateclass, svc_hexen2_toggle_statbar,
	svc_hexen2_sound_update_pos, svc_hexen2_intermission, svc_hexen2_temp_entity, svc_hexen2_info_mask,
	PROTOCOL_LARGE,
	HEXEN2_FEATURE_ENTITY_FIELDS, HEXEN2_FEATURE_NATIVE_BASELINES, HEXEN2_FEATURE_PORTALS, HEXEN2_NO_LEVEL_STRING,
	PE_MOREBITS, PE_MOREBITS2, PE_ORIGIN1, PE_ORIGIN2, PE_ORIGIN3, PE_ANGLE1, PE_ANGLE2, PE_ANGLE3,
	PE_FRAME, PE_MODEL, PE_COLORMAP, PE_SKIN, PE_EFFECTS,
	PE2_SCALE, PE2_DRAWFLAGS, PE2_ABSLIGHT, svc_serversequence, svc_packetentities,
	TE_STREAM_LIGHTNING_SMALL, TE_STREAM_FAMINE
} from '../common/protocol.js';
import {
	HEXEN2_PROTOCOLS, HEXEN2_SERVER_MESSAGES
} from '../common/hexen2_protocol.js';
import { Hexen2_ReadSound } from '../common/hexen2_soundwire.js';
import { Hexen2_ReadStartEffect, CE } from '../common/hexen2_effectwire.js';
import { Hexen2_ReadDemoMessage, Hexen2_ReadDemoMessages } from '../common/hexen2_demo.js';
import { Hexen2_DecodeUpdateInv } from '../common/hexen2_clientdata.js';
import { GameProfile_Get } from '../common/game_profile.js';

const SND_VOLUME = 1, SND_ATTENUATION = 2, SND_OVERFLOW2 = 8;

// The native smoke effects carry a frame float only for protocol 19; the unified parser always reads the 1.12 body.
const SMOKE_EFFECTS = new Set( [ CE.WHITE_SMOKE, CE.GREEN_SMOKE, CE.GREY_SMOKE, CE.RED_SMOKE, CE.SLOW_WHITE_SMOKE,
	CE.TELESMK1, CE.TELESMK2, CE.GHOST, CE.REDCLOUD, CE.FLAMESTREAM, CE.ACID_MUZZFL, CE.FLAMEWALL, CE.FLAMEWALL2,
	CE.ONFIRE ] );

// The native fast-update bits used here (protocol.h U_*).
const U = Object.freeze( {
	ORIGIN1: 1 << 1, ORIGIN2: 1 << 2, ORIGIN3: 1 << 3, ANGLE2: 1 << 4, FRAME: 1 << 6,
	ANGLE1: 1 << 8, ANGLE3: 1 << 9, MODEL: 1 << 10, CLEAR_ENT: 1 << 11, LONGENTITY: 1 << 14, MOREBITS: 1 << 0,
	MOREBITS2: 1 << 15, SKIN: 1 << 16, EFFECTS: 1 << 17, SCALE: 1 << 18, COLORMAP: 1 << 19
} );

class Reader {

	constructor( bytes ) { this.bytes = bytes; this.at = 0; }
	need( n ) { if ( this.at + n > this.bytes.length ) throw new Error( 'truncated native demo message' ); }
	byte() { this.need( 1 ); return this.bytes[ this.at ++ ]; }
	short() { this.need( 2 ); const v = this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ); this.at += 2; return v; }
	long() { this.need( 4 ); const v = this.bytes[ this.at ] | ( this.bytes[ this.at + 1 ] << 8 ) | ( this.bytes[ this.at + 2 ] << 16 ) | ( this.bytes[ this.at + 3 ] << 24 ); this.at += 4; return v | 0; }
	float() { this.need( 4 ); const v = new DataView( this.bytes.buffer, this.bytes.byteOffset + this.at, 4 ).getFloat32( 0, true ); this.at += 4; return v; }
	coord() { return this.short() / 8; }
	angle() { return this.byte() * 360 / 256; }
	string() { const start = this.at; while ( this.at < this.bytes.length && this.bytes[ this.at ] !== 0 ) this.at ++; if ( this.at >= this.bytes.length ) throw new Error( 'unterminated native demo string' ); const s = String.fromCharCode( ...this.bytes.subarray( start, this.at ) ); this.at ++; return s; }

}

class Writer {

	constructor() { this.parts = []; }
	byte( v ) { this.parts.push( v & 0xff ); }
	short( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff ); }
	long( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff, ( v >> 16 ) & 0xff, ( v >>> 24 ) & 0xff ); }
	float( v ) { const b = new Uint8Array( 4 ); new DataView( b.buffer ).setFloat32( 0, v, true ); this.parts.push( ...b ); }
	coord( v ) { this.short( Math.round( v * 8 ) ); }
	angle( v ) { this.byte( Math.round( v * 256 / 360 ) & 0xff ); }
	string( s ) { for ( let i = 0; i < s.length; i ++ ) this.parts.push( s.charCodeAt( i ) & 0xff ); this.parts.push( 0 ); }
	bytes() { return Uint8Array.from( this.parts ); }

}

function bytesOf( data ) {

	if ( data instanceof ArrayBuffer ) return new Uint8Array( data );
	if ( ArrayBuffer.isView( data ) ) return new Uint8Array( data.buffer, data.byteOffset, data.byteLength );
	return null;

}

function zeroState() {

	return { modelIndex: 0, frame: 0, colormap: 0, skin: 0, drawflags: 0, abslight: 0, effects: 0,
		origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ], scale: 100 };

}

function stateFromBaseline( baseline ) {

	return { modelIndex: baseline.modelIndex, frame: baseline.frame, colormap: baseline.colormap,
		skin: baseline.skin, drawflags: baseline.drawflags, abslight: baseline.abslight, effects: 0,
		origin: baseline.origin.slice(), angles: baseline.angles.slice(), scale: baseline.scale };

}

let translator = null;

function bad( what ) { throw new Error( 'CL_Hexen2Demo: ' + what ); }

/**
 * Starts native Hexen II playback over a demo whose forcing-track line ends at `offset`.
 *
 * The first record is probed for the native `svc_serverinfo`; only protocols 18 and 19 are accepted. Any other demo
 * (including Quake protocol 15) returns `{ ok: false }`, leaving the ordinary Quake playback path untouched.
 *
 * @param {Uint8Array|ArrayBuffer} data the whole .dem file
 * @param {number} offset the first byte after the forcing-track line
 * @returns {{ ok: true, protocol: number } | { ok: false, reason: string }} whether the native translator took over
 */
export function CL_Hexen2Demo_Start( data, offset = 0 ) {

	CL_Hexen2Demo_Stop();
	const bytes = bytesOf( data );
	if ( bytes === null ) return { ok: false, reason: 'demo bytes are required' };
	const record = Hexen2_ReadDemoMessage( bytes, offset );
	if ( ! record.ok ) return { ok: false, reason: record.reason };
	let protocol;
	try { protocol = probeProtocol( bytes.subarray( record.message.payloadOffset, record.message.endsAt ) ); }
	catch { return { ok: false, reason: 'malformed native demo record' }; }
	if ( protocol === null ) return { ok: false, reason: 'not a native Hexen II serverinfo (protocol 18/19)' };
	translator = {
		protocol, entities: new Map(), baselines: new Map(), sequence: 0,
		stats: {}, infoMask: 0, infoMask2: 0
	};
	return { ok: true, protocol };

}

/** Drops the native translator. Called when playback ends or a new demo starts. */
export function CL_Hexen2Demo_Stop() { translator = null; }

/** @returns {boolean} true while a native Hexen II demo is being translated */
export function CL_Hexen2Demo_Active() { return translator !== null; }

/*
================
probeProtocol

Reads the first record only far enough to find its serverinfo. Native demos open with print/serverinfo; a Quake demo
opens with its own `svc_serverinfo`, whose protocol (15) is not accepted, so the caller stays on the Quake path.
================
*/
function probeProtocol( payload ) {

	let p = 0;
	while ( p < payload.length ) {

		const cmd = payload[ p ++ ];
		if ( cmd & 0x80 ) { p = skipEntityUpdate( payload, p - 1 ); continue; }
		switch ( cmd ) {

			case 1: case 2: case 27: case 28: case 33: case 52: break;
			case 8: case 9: case 26: case 36: case 54: case 55: p = skipString( payload, p ); break;
			case 4: p += 4; break;
			case 5: p += 2; break;
			case 7: p += 4; break;
			case 25: p += 1; break;
			case 32: p += 2; break;
			case 11: {

				if ( p + 4 > payload.length ) return null;
				const protocol = payload[ p ] | ( payload[ p + 1 ] << 8 ) | ( payload[ p + 2 ] << 16 ) | ( payload[ p + 3 ] << 24 );
				return protocol === HEXEN2_PROTOCOLS.raven111 || protocol === HEXEN2_PROTOCOLS.raven112 ? protocol : null;

			}
			default: return null;

		}

	}
	return null;

}

function skipString( payload, p ) {

	while ( p < payload.length && payload[ p ] !== 0 ) p ++;
	return p < payload.length ? p + 1 : payload.length;

}

function skipEntityUpdate( payload, at ) {

	const r = new Reader( payload );
	r.at = at + 1;
	let bits = payload[ at ] & 0x7f;
	if ( bits & U.MOREBITS ) bits |= r.byte() << 8;
	if ( bits & U.MOREBITS2 ) bits |= r.byte() << 16;
	if ( bits & U.LONGENTITY ) r.short(); else r.byte();
	if ( bits & U.MODEL ) r.short();
	if ( bits & U.FRAME ) r.byte();
	if ( bits & U.COLORMAP ) r.byte();
	if ( bits & U.SKIN ) { r.byte(); r.byte(); }
	if ( bits & U.EFFECTS ) r.byte();
	if ( bits & U.ORIGIN1 ) r.short();
	if ( bits & U.ANGLE1 ) r.byte();
	if ( bits & U.ORIGIN2 ) r.short();
	if ( bits & U.ANGLE2 ) r.byte();
	if ( bits & U.ORIGIN3 ) r.short();
	if ( bits & U.ANGLE3 ) r.byte();
	if ( bits & U.SCALE ) { r.byte(); r.byte(); }
	return r.at;

}

function readBaselineBody( r ) {

	const baseline = { modelIndex: r.short(), frame: r.byte(), colormap: r.byte(), skin: r.byte(), scale: r.byte(),
		drawflags: r.byte(), abslight: r.byte(), origin: [ r.coord(), r.coord(), r.coord() ],
		angles: [ r.angle(), r.angle(), r.angle() ] };
	return baseline;

}

/*
================
translateEntityUpdate

Applies one native fast update to the frame map. Fields absent from the update keep the state they had (or the
entity's signon baseline), which is what the native reference frame supplies; `U_CLEAR_ENT` restarts from zero as
native does before copying the reference state.
================
*/
function translateEntityUpdate( payload, at ) {

	const r = new Reader( payload );
	const command = payload[ at ];
	r.at = at + 1;
	let bits = command & 0x7f;
	if ( bits & U.MOREBITS ) bits |= r.byte() << 8;
	if ( bits & U.MOREBITS2 ) bits |= r.byte() << 16;
	const entity = ( bits & U.LONGENTITY ) ? r.short() : r.byte();
	const baseline = translator.baselines.get( entity );
	const state = ( bits & U.CLEAR_ENT ) ? zeroState()
		: ( translator.entities.has( entity ) ? translator.entities.get( entity )
			: ( baseline ? stateFromBaseline( baseline ) : zeroState() ) );

	if ( bits & U.MODEL ) state.modelIndex = r.short();
	if ( bits & U.FRAME ) state.frame = r.byte();
	if ( bits & U.COLORMAP ) state.colormap = r.byte();
	if ( bits & U.SKIN ) { state.skin = r.byte(); state.drawflags = r.byte(); }
	if ( bits & U.EFFECTS ) state.effects = r.byte();
	if ( bits & U.ORIGIN1 ) state.origin[ 0 ] = r.coord();
	if ( bits & U.ANGLE1 ) state.angles[ 0 ] = r.angle();
	if ( bits & U.ORIGIN2 ) state.origin[ 1 ] = r.coord();
	if ( bits & U.ANGLE2 ) state.angles[ 1 ] = r.angle();
	if ( bits & U.ORIGIN3 ) state.origin[ 2 ] = r.coord();
	if ( bits & U.ANGLE3 ) state.angles[ 2 ] = r.angle();
	if ( bits & U.SCALE ) { state.scale = r.byte(); state.abslight = r.byte(); }

	translator.entities.set( entity, state );
	return { entity, consumed: r.at - at };

}

/*
================
writePacketEntities

Writes a full QW-style packet of the frame's entities as one `svc_packetentities`. Every field is present, so the
packet does not depend on which fields the native frame delta left out; the shared parser links it through the normal
packet entity path.
================
*/
function writePacketEntities( w ) {

	const numbers = [ ...translator.entities.keys() ].sort( ( a, b ) => a - b );
	translator.sequence = ( translator.sequence + 1 ) & 0x7fffffff;
	if ( translator.sequence === 0 ) translator.sequence = 1;
	w.byte( svc_serversequence );
	w.long( translator.sequence );
	w.byte( svc_packetentities );

	for ( const number of numbers ) {

		if ( number <= 0 ) continue;
		const s = translator.entities.get( number );
		let flags = PE_ORIGIN1 | PE_ORIGIN2 | PE_ORIGIN3 | PE_ANGLE1 | PE_ANGLE2 | PE_ANGLE3 |
			PE_FRAME | PE_MODEL | PE_COLORMAP | PE_SKIN | PE_EFFECTS;
		const bits2 = PE2_SCALE | PE2_DRAWFLAGS | PE2_ABSLIGHT;
		flags |= PE_MOREBITS | PE_MOREBITS2;
		w.short( ( number & 0x3ff ) | ( flags & ~0x3ff ) ); // only the word's high six bits are flags
		w.byte( number >> 10 );
		w.byte( flags & 0xff );
		w.byte( bits2 );
		w.short( s.modelIndex );
		w.short( s.frame );
		w.byte( s.colormap );
		w.byte( s.skin );
		w.byte( s.effects );
		for ( let i = 0; i < 3; i ++ ) w.coord( s.origin[ i ] );
		for ( let i = 0; i < 3; i ++ ) w.angle( s.angles[ i ] );
		w.byte( s.scale );
		w.byte( s.drawflags );
		w.byte( s.abslight );

	}

	w.short( 0 ); // end of the packet entity list

}

/*
================
translateSound

Native `svc_sound` sends the sound number as a byte with SND_OVERFLOW adding 256; the unified large protocol sends it
as a short index. The native overflow bits are resolved here, never forwarded: bit 2 is Quake's SND_LOOPING.
================
*/
function translateSound( payload, at, w ) {

	const r = new Reader( payload );
	r.at = at;
	const opcode = r.byte();
	if ( opcode !== HEXEN2_SERVER_MESSAGES.sound ) bad( 'not an svc_sound message' );
	const nativeMask = r.byte();
	const read = Hexen2_ReadSound( payload.subarray( at ), { allowTrailing: true } );
	if ( ! read.ok ) bad( read.reason );
	if ( nativeMask & SND_OVERFLOW2 ) return read.consumed; // native drops this completely(protocol.h)
	const sound = read.sound;
	let mask = 0;
	if ( sound.volume !== 255 ) mask |= SND_VOLUME;
	if ( sound.attenuation !== 1 ) mask |= SND_ATTENUATION;
	w.byte( svc_sound );
	w.byte( mask );
	if ( mask & SND_VOLUME ) w.byte( sound.volume );
	if ( mask & SND_ATTENUATION ) w.byte( Math.round( sound.attenuation * 64 ) );
	w.short( ( sound.entity << 3 ) | sound.channel );
	w.short( sound.soundNum );
	for ( let i = 0; i < 3; i ++ ) w.coord( sound.origin[ i ] );
	return read.consumed;

}

/*
================
translateUpdateInv

The shared `Hexen2_DecodeUpdateInv` knows SC1 and SC2 through SC2_FLAGS; protocols above 18 append the two objective
masks, which the unified protocol carries as its own `svc_hexen2_info_mask`. The native test byte may also set bit 7
(a fourth SC2 mask byte) that the shared decoder refuses, so the known seven blocks are rebuilt first.
================
*/
function translateUpdateInv( payload, at, w ) {

	const r = new Reader( payload );
	r.at = at + 1;
	const flags = r.byte();
	const blocks = new Array( 8 ).fill( 0 );
	for ( let i = 0; i < 8; i ++ ) if ( flags & ( 1 << i ) ) blocks[ i ] = r.byte();
	const fieldsStart = r.at;
	const knownParts = [ flags & 0x7f ];
	let knownBits = 0;
	for ( let i = 0; i < 7; i ++ ) if ( flags & ( 1 << i ) ) { knownParts.push( blocks[ i ] ); knownBits ++; }
	knownParts.push( ...payload.subarray( fieldsStart ) );
	const known = Uint8Array.from( knownParts );
	const read = Hexen2_DecodeUpdateInv( known, { allowTrailing: true } );
	if ( ! read.ok ) bad( read.reason );
	Object.assign( translator.stats, read.stats );

	w.byte( svc_hexen2_update_inv );
	w.parts.push( ...known.subarray( 0, read.consumed ) );

	if ( translator.protocol > HEXEN2_PROTOCOLS.raven111 ) {

		let objAt = read.consumed;
		const view = new DataView( known.buffer, known.byteOffset, known.byteLength );
		if ( read.mask & ( 1n << 54n ) ) { translator.infoMask = view.getInt32( objAt, true ) >>> 0; objAt += 4; }
		if ( read.mask & ( 1n << 55n ) ) { translator.infoMask2 = view.getInt32( objAt, true ) >>> 0; objAt += 4; }

	}
	if ( ( read.mask & ( 1n << 54n ) ) || ( read.mask & ( 1n << 55n ) ) || translator.infoMask || translator.infoMask2 ) {

		w.byte( svc_hexen2_info_mask );
		w.long( translator.infoMask );
		w.long( translator.infoMask2 );

	}
	let consumed = 2; // opcode + test byte
	for ( let i = 0; i < 8; i ++ ) if ( flags & ( 1 << i ) ) consumed ++;
	consumed += read.consumed - ( 1 + knownBits ); // the fields the shared decoder consumed
	if ( translator.protocol > HEXEN2_PROTOCOLS.raven111 ) {
		if ( read.mask & ( 1n << 54n ) ) consumed += 4;
		if ( read.mask & ( 1n << 55n ) ) consumed += 4;
	}
	return consumed;

}

/*
================
translateClientdata

Native Hexen's clientdata has the Quake view/velocity/weapon fields plus its own idealroll, and no items/health/ammo
record (those travel in `svc_update_inv`). The shared parser reads the Quake layout, so the idealroll byte is consumed
and the missing record is synthesised from the last inventory update.
================
*/
function translateClientdata( payload, at, w ) {

	const r = new Reader( payload );
	r.at = at;
	r.byte(); // opcode
	const bits = r.short();
	let viewheight = 0, idealpitch = 0;
	const punch = [ 0, 0, 0 ], velocity = [ 0, 0, 0 ];
	if ( bits & 0x0001 ) viewheight = r.byte() << 24 >> 24;
	if ( bits & 0x0002 ) idealpitch = r.byte() << 24 >> 24;
	if ( bits & 0x0100 ) r.byte(); // native idealroll: no unified field
	for ( let i = 0; i < 3; i ++ ) {

		if ( bits & ( 0x0004 << i ) ) punch[ i ] = r.byte() << 24 >> 24;
		if ( bits & ( 0x0020 << i ) ) velocity[ i ] = r.byte() << 24 >> 24;

	}
	const weaponframe = ( bits & 0x1000 ) ? r.byte() : 0;
	const armor = ( bits & 0x2000 ) ? r.byte() : 0;
	const weapon = ( bits & 0x4000 ) ? r.short() : 0;

	w.byte( svc_clientdata );
	w.short( bits );
	if ( bits & 0x0001 ) w.byte( viewheight );
	if ( bits & 0x0002 ) w.byte( idealpitch );
	for ( let i = 0; i < 3; i ++ ) {

		if ( bits & ( 0x0004 << i ) ) w.byte( punch[ i ] );
		if ( bits & ( 0x0020 << i ) ) w.byte( velocity[ i ] );

	}
	w.long( 0 ); // items (Hexen keeps the inventory in cl.h2)
	if ( bits & 0x1000 ) w.short( weaponframe );
	if ( bits & 0x2000 ) w.byte( armor );
	if ( bits & 0x4000 ) w.short( weapon );
	const health = Math.max( 0, Math.min( 32767, translator.stats.health ?? 0 ) );
	const blue = Math.max( 0, Math.min( 255, translator.stats.bluemana ?? 0 ) );
	const green = Math.max( 0, Math.min( 255, translator.stats.greenmana ?? 0 ) );
	w.short( health );
	w.byte( blue );
	w.byte( blue );
	w.byte( green );
	w.byte( 0 );
	w.byte( 0 );
	w.byte( Math.max( 0, Math.min( 255, translator.stats.weapon ?? 0 ) ) );
	return r.at - at;

}

function translateStartEffect( payload, at, w ) {

	const read = Hexen2_ReadStartEffect( payload.subarray( at ), { allowTrailing: true, protocol: translator.protocol } );
	if ( ! read.ok ) bad( read.reason );
	const body = payload.subarray( at + 1, at + read.consumed );
	w.byte( svc_hexen2_start_effect );
	w.parts.push( ...body );
	if ( translator.protocol === HEXEN2_PROTOCOLS.raven111 && SMOKE_EFFECTS.has( read.type ) ) w.long( 0 ); // the 1.12 frame float
	return read.consumed;

}

function translateTempEntity( payload, at, w ) {

	const r = new Reader( payload );
	r.at = at;
	r.byte(); // opcode
	const type = r.byte();
	if ( type >= TE_STREAM_LIGHTNING_SMALL && type <= TE_STREAM_FAMINE ) {

		r.short();
		r.byte();
		r.byte();
		if ( type === 29 ) r.byte(); // TE_STREAM_COLORBEAM skin
		for ( let i = 0; i < 6; i ++ ) r.short();
		w.byte( svc_hexen2_temp_entity );
		w.parts.push( ...payload.subarray( at + 1, r.at ) );
		return r.at - at;

	}

	if ( type <= 3 || type === 7 || type === 8 || type === 10 || type === 11 ) {

		for ( let i = 0; i < 3; i ++ ) r.short();

	} else if ( type === 5 || type === 6 || type === 9 ) {

		r.short();
		for ( let i = 0; i < 6; i ++ ) r.short();

	} else bad( 'unknown native temp entity ' + type );
	w.byte( svc_temp_entity );
	w.parts.push( ...payload.subarray( at + 1, r.at ) );
	return r.at - at;

}

function translateServerinfo( r, w ) {

	const protocol = r.long();
	if ( protocol !== HEXEN2_PROTOCOLS.raven111 && protocol !== HEXEN2_PROTOCOLS.raven112 )
		bad( 'unsupported native protocol ' + protocol );
	translator.protocol = protocol;
	const maxClients = r.byte();
	const gameType = r.byte();
	if ( gameType === 1 && protocol > HEXEN2_PROTOCOLS.raven111 ) r.short(); // king of the hill
	const levelName = r.string();
	const models = [], sounds = [];
	for ( ; ; ) { const s = r.string(); if ( s === '' ) break; models.push( s ); }
	for ( ; ; ) { const s = r.string(); if ( s === '' ) break; sounds.push( s ); }
	translator.entities.clear();
	translator.baselines.clear();
	translator.stats = {};
	translator.infoMask = translator.infoMask2 = 0;
	w.byte( svc_serverinfo );
	w.long( PROTOCOL_LARGE );
	w.byte( maxClients );
	w.byte( gameType );
	w.string( levelName );
	for ( const model of models ) w.string( model );
	w.string( '' );
	for ( const sound of sounds ) w.string( sound );
	w.string( '' );
	let flags = HEXEN2_FEATURE_ENTITY_FIELDS | HEXEN2_FEATURE_NATIVE_BASELINES;
	if ( GameProfile_Get().portals === true ) flags |= HEXEN2_FEATURE_PORTALS;
	w.byte( svc_hexen2_features );
	w.byte( flags );
	w.short( HEXEN2_NO_LEVEL_STRING );

}

function copyBody( payload, at, w, opcode, length ) {

	if ( at + length > payload.length ) bad( 'truncated native message' );
	w.byte( opcode );
	w.parts.push( ...payload.subarray( at, at + length ) );

}

/*
================
translateRecord

Rewrites one native demo record into unified server messages. The entity updates of the frame are held back and
written as one full packet at the end, after any signon/clientdata command of the record.
================
*/
function translateRecord( payload ) {

	const r = new Reader( payload );
	const w = new Writer();
	let frame = false;

	while ( r.at < payload.length ) {

		const at = r.at;
		const cmd = r.byte();

		if ( cmd & 0x80 ) {

			const update = translateEntityUpdate( payload, at );
			r.at = at + update.consumed;
			frame = true;
			continue;

		}

		switch ( cmd ) {

			case 0: break;
			case 1: break;
			case 2: w.byte( 2 ); break;
			case 3: { const stat = r.byte(); const value = r.long(); w.byte( 3 ); w.byte( stat ); w.long( value ); break; }
			case 4: { r.long(); w.byte( svc_version ); w.long( PROTOCOL_LARGE ); break; }
			case 5: { const value = r.short(); w.byte( 5 ); w.short( value ); break; }
			case 6: r.at = at + translateSound( payload, at, w ); break;
			case 7: { const value = r.float(); w.byte( 7 ); w.float( value ); break; }
			case 8: case 9: case 26: { const value = r.string(); w.byte( cmd ); w.string( value ); break; }
			case 10: { w.byte( 10 ); for ( let i = 0; i < 3; i ++ ) w.byte( r.byte() ); break; }
			case 11: translateServerinfo( r, w ); break;
			case 12: { const style = r.byte(); const map = r.string(); w.byte( 12 ); w.byte( style ); w.string( map ); break; }
			case 13: { const slot = r.byte(); const name = r.string(); w.byte( 13 ); w.byte( slot ); w.string( name ); break; }
			case 14: { const slot = r.byte(); const frags = r.short(); w.byte( 14 ); w.byte( slot ); w.short( frags ); break; }
			case 15: r.at = at + translateClientdata( payload, at, w ); break;
			case 16: { const value = r.short(); w.byte( 16 ); w.short( value ); break; }
			case 17: { const slot = r.byte(); const colors = r.byte(); w.byte( 17 ); w.byte( slot ); w.byte( colors ); break; }
			case 18: copyBody( payload, at + 1, w, svc_particle, 11 ); r.at = at + 12; break;
			case 19: { w.byte( 19 ); for ( let i = 0; i < 8; i ++ ) w.byte( r.byte() ); break; }
			case 20: { r.at = at + 1; readBaselineBody( r ); w.byte( svc_spawnstatic ); w.parts.push( ...payload.subarray( at + 1, r.at ) ); break; }
			case 21: copyBody( payload, at + 1, w, svc_hexen2_raineffect, 18 ); r.at = at + 19; break;
			case 22: {

				r.at = at + 1;
				const entity = r.short();
				const bodyStart = r.at;
				const baseline = readBaselineBody( r );
				translator.baselines.set( entity, baseline );
				w.byte( svc_spawnbaseline );
				w.short( entity );
				w.parts.push( ...payload.subarray( bodyStart, r.at ) );
				break;

			}
			case 23: r.at = at + translateTempEntity( payload, at, w ); break;
			case 24: { const value = r.byte(); w.byte( 24 ); w.byte( value ); break; }
			case 25: { const value = r.byte(); w.byte( 25 ); w.byte( value ); break; }
			case 27: w.byte( 27 ); break;
			case 28: w.byte( 28 ); break;
			case 29: {

				const x = r.coord(), y = r.coord(), z = r.coord();
				const soundNum = translator.protocol === HEXEN2_PROTOCOLS.raven111 ? r.byte() : r.short();
				const volume = r.byte(), attenuation = r.byte();
				w.byte( svc_spawnstaticsound );
				w.coord( x ); w.coord( y ); w.coord( z );
				w.short( soundNum ); w.byte( volume ); w.byte( attenuation );
				break;

			}
			case 30: { const index = r.byte(); w.byte( svc_hexen2_intermission ); w.byte( index ); break; }
			case 31: case 35: { const text = r.string(); w.byte( cmd === 31 ? 31 : 34 ); w.string( text ); break; }
			case 32: { const track = r.byte(); const loop = r.byte(); w.byte( 32 ); w.byte( track ); w.byte( loop ); break; }
			case 33: w.byte( 33 ); break;
			case 34: copyBody( payload, at + 1, w, svc_hexen2_particle2, 34 ); r.at = at + 35; break;
			case 36: { const name = r.string(); w.byte( svc_hexen2_midi_name ); w.string( name ); break; }
			case 37: { const slot = r.byte(); const playerclass = r.byte(); w.byte( svc_hexen2_updateclass ); w.byte( slot ); w.byte( playerclass ); break; }
			case 38: copyBody( payload, at + 1, w, svc_hexen2_particle3, 13 ); r.at = at + 14; break;
			case 39: copyBody( payload, at + 1, w, svc_hexen2_particle4, 11 ); r.at = at + 12; break;
			case 40: { const flags = r.byte(); w.byte( svc_hexen2_set_view_flags ); w.byte( flags ); break; }
			case 41: { const flags = r.byte(); w.byte( svc_hexen2_clear_view_flags ); w.byte( flags ); break; }
			case 42: r.at = at + translateStartEffect( payload, at, w ); break;
			case 43: { const index = r.byte(); w.byte( svc_hexen2_end_effect ); w.byte( index ); break; }
			case 44: { const index = r.short(); w.byte( svc_hexen2_plaque ); w.short( index ); break; }
			case 45: copyBody( payload, at + 1, w, svc_hexen2_particle_explosion, 12 ); r.at = at + 13; break;
			case 46: { const tint = r.byte(); w.byte( svc_hexen2_set_view_tint ); w.byte( tint ); break; }
			case 47: { r.byte(); r.byte(); frame = true; break; } // svc_reference: frame/sequence are flattened away
			case 48: {

				const count = r.byte();
				for ( let i = 0; i < count; i ++ ) translator.entities.delete( r.short() );
				frame = true;
				break;

			}
			case 49: r.at = at + translateUpdateInv( payload, at, w ); break;
			case 50: { w.byte( svc_hexen2_setangle_interpolate ); for ( let i = 0; i < 3; i ++ ) w.byte( r.byte() ); break; }
			case 51: r.short(); break; // svc_update_kingofhill: no Quake equivalent
			case 52: w.byte( svc_hexen2_toggle_statbar ); break;
			case 53: { w.byte( svc_hexen2_sound_update_pos ); for ( let i = 0; i < 4; i ++ ) w.short( r.short() ); break; }
			case 54: case 55: r.string(); break; // svc_mod_name / svc_skybox: UQE only
			default: bad( 'unknown native server message ' + cmd + ' at byte ' + at );

		}

	}

	if ( frame ) writePacketEntities( w );
	return w.bytes();

}

/**
 * Rewrites one native demo record (one server frame) into unified server messages.
 *
 * @param {Uint8Array} payload the native message bytes (without the demo's length/view-angle header)
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the unified message, or why it is refused
 */
export function CL_Hexen2Demo_Translate( payload ) {

	if ( translator === null ) return { ok: false, reason: 'no native Hexen II demo is active' };
	try {

		const bytes = bytesOf( payload );
		if ( bytes === null ) return { ok: false, reason: 'message bytes are required' };
		return { ok: true, bytes: translateRecord( bytes ) };

	} catch ( error ) { return { ok: false, reason: error.message }; }

}

/**
 * Reads a native demo file's whole framing and reports its protocol without translating it. A convenience for tests
 * and tools; playback itself reads one record at a time through `CL_GetMessage`.
 *
 * @param {Uint8Array|ArrayBuffer} data the whole .dem file
 * @returns {{ ok: true, protocol: number, messages: number } | { ok: false, reason: string }} the framing summary
 */
export function CL_Hexen2Demo_Probe( data ) {

	const read = Hexen2_ReadDemoMessages( data );
	if ( ! read.ok ) return read;
	if ( read.messages.length === 0 ) return { ok: false, reason: 'the demo has no message records' };
	const first = read.messages[ 0 ];
	const bytes = bytesOf( data );
	const protocol = probeProtocol( bytes.subarray( first.payloadOffset, first.endsAt ) );
	if ( protocol === null ) return { ok: false, reason: 'not a native Hexen II serverinfo (protocol 18/19)' };
	return { ok: true, protocol, messages: read.messages.length };

}
