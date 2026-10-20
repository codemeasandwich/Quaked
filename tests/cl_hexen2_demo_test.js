// Native Hexen II demo playback (src/engine/client/cl_hexen2_demo.js) and the Hexen II client entity semantics in
// cl_main.js: protocol 18/19 records are translated into the unified protocol, reference-frame updates become full
// packets, clear_edicts and sequence loss remove entities, EF_NODRAW is not drawn and EF_DARKLIGHT allocates a dark
// dynamic light. The supplied demo1.dem is read from the owned data when present and skipped cleanly when absent.
import { existsSync, readFileSync } from './helpers/resource_fs.mjs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { CL_Init, CL_ClearState, CL_RelinkEntities, CL_Disconnect_f, CL_Hexen2SetTrailHooks } from '../src/engine/client/cl_main.js';
import { CL_PlayDemoFromData, CL_GetMessage } from '../src/engine/client/cl_demo.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { CL_Hexen2Reset } from '../src/engine/client/cl_hexen2.js';
import {
	cl, cls, cl_entities, cl_dlights, cl_visedicts, cl_numvisedicts, entity_t, ca_connected
} from '../src/engine/client/client.js';
import { sizebuf_t, SZ_Alloc, SZ_Write, COM_SetNetMessage } from '../src/engine/common/common.js';
import { PROTOCOL_LARGE } from '../src/engine/common/protocol.js';
import { CL_SetValidSequence } from '../src/engine/client/cl_pred.js';
import { R_Init } from '../src/engine/render/gl_rmain.js';
import { V_Init } from '../src/engine/client/view.js';
import { NET_Init } from '../src/engine/net/net_main.js';
import { Cbuf_Init, Cmd_Init } from '../src/engine/common/cmd.js';
import { GameProfile_Set, GAME_PROFILES } from '../src/engine/common/game_profile.js';
import { anglemod } from '../src/engine/common/mathlib.js';
import { R_DemoLoadingCancel } from '../src/newer/ui/r_demoloading.js';
import {
	CL_Hexen2Demo_Start, CL_Hexen2Demo_Translate, CL_Hexen2Demo_Stop, CL_Hexen2Demo_Probe
} from '../src/engine/client/cl_hexen2_demo.js';
import { Hexen2_ReadDemoForceTrack, Hexen2_ReadDemoMessages } from '../src/engine/common/hexen2_demo.js';
import { HEXEN2_PROTOCOLS, HEXEN2_SERVER_MESSAGES } from '../src/engine/common/hexen2_protocol.js';
import { Hexen2_WriteSound } from '../src/engine/common/hexen2_soundwire.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

function concat( parts ) {

	let length = 0;
	for ( const p of parts ) length += p.length;
	const out = new Uint8Array( length );
	let at = 0;
	for ( const p of parts ) { out.set( p, at ); at += p.length; }
	return out;

}

// Native protocol-19 fixture writers: the demo decoder reads the native records, so the synthetic tests build the
// same bytes the retired private wire modules used to write.
class FixtureWriter {

	constructor() { this.parts = []; }
	byte( v ) { this.parts.push( v & 0xff ); }
	short( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff ); }
	long( v ) { this.parts.push( v & 0xff, ( v >> 8 ) & 0xff, ( v >> 16 ) & 0xff, ( v >>> 24 ) & 0xff ); }
	coord( v ) { this.short( Math.round( v * 8 ) ); }
	angle( v ) { this.byte( Math.round( v * 256 / 360 ) & 0xff ); }
	string( value ) { for ( const ch of String( value ) ) this.byte( ch.charCodeAt( 0 ) ); this.byte( 0 ); }
	bytes() { return Uint8Array.from( this.parts ); }

}

function writeServerinfo( info ) {

	const w = new FixtureWriter();
	w.byte( HEXEN2_SERVER_MESSAGES.serverinfo );
	w.long( info.protocol ); w.byte( info.maxClients ); w.byte( info.gameType );
	// Protocol 19 deathmatch serverinfo carries the native sv_kingofhill slot after the game type.
	if ( info.gameType === 1 && info.protocol > HEXEN2_PROTOCOLS.raven111 ) w.short( info.kingOfHill ?? 0 );
	w.string( info.levelName ?? '' );
	for ( const name of info.models ) w.string( name );
	w.string( '' );
	for ( const name of info.sounds ) w.string( name );
	w.string( '' );
	return { ok: true, bytes: w.bytes() };

}

function writeBaselineBody( w, baseline ) {

	w.short( baseline.modelIndex );
	w.byte( baseline.frame ); w.byte( baseline.colormap ); w.byte( baseline.skin ); w.byte( baseline.scale );
	w.byte( baseline.drawflags ); w.byte( baseline.abslight );
	for ( let i = 0; i < 3; i ++ ) w.coord( baseline.origin[ i ] );
	for ( let i = 0; i < 3; i ++ ) w.angle( baseline.angles[ i ] );

}

function writeBaseline( baseline ) {

	const w = new FixtureWriter();
	w.byte( HEXEN2_SERVER_MESSAGES.spawnbaseline );
	w.short( baseline.entity );
	writeBaselineBody( w, baseline );
	return { ok: true, bytes: w.bytes() };

}

function writeReference( reference ) {

	return { ok: true, bytes: Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.reference, reference.frame, reference.sequence ] ) };

}

function writeEntityUpdate( update ) {

	const U = { MOREBITS: 1, ORIGIN1: 2, ORIGIN2: 4, ORIGIN3: 8, ANGLE2: 16, FRAME: 64, SIGNAL: 1 << 7,
		ANGLE1: 256, ANGLE3: 512, MODEL: 1024, MOREBITS2: 1 << 15, SKIN: 1 << 16, EFFECTS: 1 << 17,
		SCALE: 1 << 18, COLORMAP: 1 << 19 };
	let bits = U.SIGNAL;
	if ( update.modelIndex !== undefined ) bits |= U.MODEL;
	if ( update.frame !== undefined ) bits |= U.FRAME;
	if ( update.colormap !== undefined ) bits |= U.COLORMAP;
	if ( update.skin !== undefined || update.drawflags !== undefined ) bits |= U.SKIN;
	if ( update.effects !== undefined ) bits |= U.EFFECTS;
	if ( update.scale !== undefined || update.abslight !== undefined ) bits |= U.SCALE;
	if ( update.origin ) bits |= U.ORIGIN1 | U.ORIGIN2 | U.ORIGIN3;
	if ( update.angles ) bits |= U.ANGLE1 | U.ANGLE2 | U.ANGLE3;
	if ( bits & 0xff00 ) bits |= U.MOREBITS;
	if ( bits & 0xff0000 ) bits |= 1 << 15;
	const w = new FixtureWriter();
	w.byte( 0x80 | ( bits & 0x7f ) );
	if ( bits & U.MOREBITS ) w.byte( ( bits >> 8 ) & 0xff );
	if ( bits & ( 1 << 15 ) ) w.byte( ( bits >> 16 ) & 0xff );
	w.byte( update.entity );
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

function writeClearEdicts( entities ) {

	const w = new FixtureWriter();
	w.byte( HEXEN2_SERVER_MESSAGES.clear_edicts );
	w.byte( entities.length );
	for ( const entity of entities ) w.short( entity );
	return { ok: true, bytes: w.bytes() };

}

function demoFile( records, forceTrack = - 1 ) {

	const parts = [ Uint8Array.from( [ ...String( forceTrack ) ].map( c => c.charCodeAt( 0 ) ) ) ];
	parts.push( Uint8Array.from( [ 0x0a ] ) );
	for ( const record of records ) {

		const head = new Uint8Array( 16 );
		new DataView( head.buffer ).setUint32( 0, record.length, true );
		parts.push( head, record );

	}
	return concat( parts );

}

// Reads the translated record's packet entities and server sequence, enough to verify the flattened reference frames.
function readPackets( bytes ) {

	let at = 0;
	let sequence = null;
	const packets = [];
	const u8 = () => bytes[ at ++ ];
	const u16 = () => { const v = bytes[ at ] | ( bytes[ at + 1 ] << 8 ); at += 2; return v; };
	const u32 = () => { const v = ( bytes[ at ] | ( bytes[ at + 1 ] << 8 ) | ( bytes[ at + 2 ] << 16 ) | ( bytes[ at + 3 ] << 24 ) ) >>> 0; at += 4; return v; };
	const coord = () => { const v = u16(); return ( v > 32767 ? v - 65536 : v ) / 8; };
	const skip = n => { at += n; };
	const string = () => { while ( at < bytes.length && bytes[ at ] !== 0 ) at ++; at ++; };
	while ( at < bytes.length ) {

		const cmd = u8();
		if ( cmd === 8 || cmd === 9 || cmd === 26 || cmd === 65 ) { string(); continue; }
		if ( cmd === 11 ) {

			u32(); u8(); const gameType = u8(); if ( gameType === 1 ) u16();
			string(); while ( bytes[ at ] !== 0 ) string(); at ++; while ( bytes[ at ] !== 0 ) string(); at ++;
			continue;

		}
		if ( cmd === 22 ) {
			u16(); skip( 17 ); continue;
		}
		if ( cmd === 50 ) { u8(); u16(); continue; }
		if ( cmd === 49 ) { sequence = u32(); continue; }
		if ( cmd !== 47 ) throw new Error( 'unexpected translated opcode ' + cmd + ' at ' + at );
		const list = [];
		for ( ; ; ) {

			const word = u16();
			if ( word === 0 ) break;
			const number = ( word & 0x3ff ) | ( u8() << 10 );
			let bits = 0;
			if ( word & 0x8000 ) bits = u8();
			let bits2 = 0;
			if ( bits & 0x80 ) bits2 = u8();
			const entity = { number, origin: [ 0, 0, 0 ] };
			if ( bits & 0x08 ) entity.modelIndex = u16();
			if ( bits & 0x01 ) entity.frame = u16();
			if ( bits & 0x10 ) u8();
			if ( bits & 0x20 ) u8();
			if ( bits & 0x40 ) entity.effects = u8();
			if ( word & ( 1 << 10 ) ) entity.origin[ 0 ] = coord();
			if ( bits & 0x02 ) u8();
			if ( word & ( 1 << 11 ) ) entity.origin[ 1 ] = coord();
			if ( word & ( 1 << 13 ) ) u8();
			if ( word & ( 1 << 12 ) ) entity.origin[ 2 ] = coord();
			if ( bits & 0x04 ) u8();
			if ( bits2 & 0x01 ) u8();
			if ( bits2 & 0x02 ) u8();
			if ( bits2 & 0x04 ) u8();
			list.push( entity );

		}
		packets.push( list );

	}
	return { sequence, packets };

}

// Runs just the King of the Hill messages through the real client parser, as a live signon would.
function parseKingOfHill( data ) {

	CL_ClearState();
	CL_Hexen2Reset();
	cl.protocol = PROTOCOL_LARGE;
	cl.maxclients = 1;
	cl.scores = [ { name: '', frags: 0, colors: 0, translations: new Uint8Array( 256 ) } ];
	const msg = new sizebuf_t();
	SZ_Alloc( msg, data.length + 64 );
	SZ_Write( msg, data, data.length );
	COM_SetNetMessage( msg );
	CL_ParseServerMessage();
	return cl.h2.kingOfHill;

}

Deno.test( 'the supplied native demo1 translates its first several hundred records and plays to signon 4', () => {

	if ( ! existsSync( HEXEN + '/demo1.dem' ) || ! existsSync( HEXEN + '/pak1.pak' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	const bytes = readFileSync( HEXEN + '/demo1.dem' );
	const framing = Hexen2_ReadDemoMessages( bytes );
	check( framing.ok, framing.reason );
	const track = Hexen2_ReadDemoForceTrack( bytes );
	check( track.ok, track.reason );

	// Translation is independent of the renderer: the first several hundred records all reach unified messages.
	check( CL_Hexen2Demo_Start( bytes, track.offset ).ok, 'the native demo is recognised' );
	let translated = 0;
	for ( const record of framing.messages.slice( 0, 300 ) ) {

		const read = CL_Hexen2Demo_Translate( bytes.subarray( record.payloadOffset, record.endsAt ) );
		check( read.ok, `record ${translated}: ${read.reason}` );
		check( read.bytes.length > 0, 'a translated record has a message' );
		translated ++;

	}
	check( translated >= 300, 'several hundred records translated: ' + translated );
	CL_Hexen2Demo_Stop();
	same( CL_Hexen2Demo_Probe( bytes ).protocol, 19, 'demo1 is the 1.12 protocol' );

	// The ordinary client path: mount the owned game, play the demo, and stop once the recorded signon is complete.
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

		const raw = readFileSync( HEXEN + '/' + name );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

	}
	VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
	Mod_Init(); Cbuf_Init(); Cmd_Init(); CL_Init(); R_Init(); V_Init(); NET_Init();
	GameProfile_Set( 'hexen2' );
	const oldLog = console.log;
	console.log = () => {};
	try {

		CL_PlayDemoFromData( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ), false );
		same( cls.demoplayback, true, 'demo playback started' );
		let packets = 0;
		for ( ; packets < 64; packets ++ ) {

			R_DemoLoadingCancel();
			cl.time = cl.mtime[ 0 ] + 1;
			const got = CL_GetMessage();
			if ( got !== 1 ) break;
			CL_ParseServerMessage();
			if ( cls.signon === 4 ) break;

		}
		same( cls.signon, 4, 'the native demo reaches the final signon stage' );
		same( cl.viewentity, 1, 'the recorded player view is set' );
		check( cl.num_entities > 100, 'the entity baselines created client entities: ' + cl.num_entities );
		same( cl.h2.active, true, 'the translated feature message marks a Hexen II session' );
		same( cl.h2.nativeBaselines, true, 'native baselines are in use' );
		same( cl.levelname, 'Cathedral', 'the native level name' );
		same( cls.state, ca_connected, 'the client is connected' );

		// One frame of a Hexen II demo is a full packet, so relinking lists its recorded entities.
		cl.oldtime = cl.time = cl.mtime[ 0 ];
		CL_RelinkEntities();
		check( cl_numvisedicts > 0, 'the first signed-on demo frame lists visible entities: ' + cl_numvisedicts );
		check( cl_entities[ cl.viewentity ].model != null, 'the view entity has a model after relink' );

	} finally {

		console.log = oldLog;
		CL_Hexen2Demo_Stop();
		CL_Disconnect_f();
		GameProfile_Set( GAME_PROFILES.quake );

	}

} );


Deno.test( 'SND_OVERFLOW resolves to a unified short sound index for sounds, ambients and the overflow bits', () => {

	const info = writeServerinfo( { protocol: 19, maxClients: 1, gameType: 0, levelName: 'sound',
		models: [ 'maps/demo1.bsp' ], sounds: [] } );
	check( info.ok, info.reason );
	const sound = Hexen2_WriteSound( { entity: 1, channel: 0, soundNum: 300, origin: [ 8, 16, 24 ],
		volume: 255, attenuation: 1 } );
	check( sound.ok, sound.reason );
	const staticsound = Uint8Array.from( [
		29, 80, 0, 160, 0, 240, 0, // svc_spawnstaticsound: three 1/8-unit coordinates
		44, 1, // the 300 sound index as the protocol-19 short
		200, 64
	] );
	const bytes = demoFile( [ concat( [ info.bytes, sound.bytes, staticsound ] ) ] );
	const track = Hexen2_ReadDemoForceTrack( bytes );
	check( CL_Hexen2Demo_Start( bytes, track.offset ).ok, 'the overflow fixture starts' );
	const read = Hexen2_ReadDemoMessages( bytes );
	check( read.ok, read.reason );
	const out = CL_Hexen2Demo_Translate( bytes.subarray( read.messages[ 0 ].payloadOffset, read.messages[ 0 ].endsAt ) );
	check( out.ok, out.reason );

	let at = 0;
	const u8 = () => out.bytes[ at ++ ];
	const u16 = () => { const v = out.bytes[ at ] | ( out.bytes[ at + 1 ] << 8 ); at += 2; return v; };
	const u32 = () => { const v = ( out.bytes[ at ] | ( out.bytes[ at + 1 ] << 8 ) | ( out.bytes[ at + 2 ] << 16 ) | ( out.bytes[ at + 3 ] << 24 ) ) >>> 0; at += 4; return v; };
	const string = () => { while ( at < out.bytes.length && out.bytes[ at ] !== 0 ) at ++; at ++; };
	same( u8(), 11, 'serverinfo first' );
	u32(); u8(); u8(); string(); string(); string(); string();
	same( u8(), 50, 'then the feature message' ); u8(); u16();
	same( u8(), 6, 'the translated sound' );
	same( u8() & 4, 0, 'SND_OVERFLOW is not forwarded as Quake SND_LOOPING' );
	same( u16(), ( 1 << 3 ) | 0, 'the entity/channel' );
	same( u16(), 300, 'the sound index is a unified short' );
	for ( let i = 0; i < 3; i ++ ) u16();
	same( u8(), 29, 'the translated static sound' );
	for ( let i = 0; i < 3; i ++ ) u16();
	same( u16(), 300, 'the static sound index is a unified short' );
	same( u8(), 200, 'volume' );
	same( u8(), 64, 'attenuation' );
	same( at, out.bytes.length, 'the fixture ends exactly' );
	CL_Hexen2Demo_Stop();

} );

Deno.test( 'a native demo 51 record becomes svc_hexen2_update_kingofhill with its entity short', () => {

	const info = writeServerinfo( { protocol: 19, maxClients: 2, gameType: 0, levelName: 'koth',
		models: [], sounds: [] } );
	const bytes = demoFile( [ info.bytes ] );
	const track = Hexen2_ReadDemoForceTrack( bytes );
	check( CL_Hexen2Demo_Start( bytes, track.offset ).ok, 'the fixture starts' );
	const out = CL_Hexen2Demo_Translate( Uint8Array.from( [ 51, 5, 0 ] ) );
	check( out.ok, out.reason );
	same( out.bytes.length, 3, 'one unified message replaces the native record' );
	same( out.bytes[ 0 ], 72, 'native 51 maps to svc_hexen2_update_kingofhill' );
	same( out.bytes[ 1 ] | ( out.bytes[ 2 ] << 8 ), 5, 'the native WriteEntity short is kept' );
	same( parseKingOfHill( out.bytes ), 4, 'the client stores the short minus one as native cl_parse.c does' );
	CL_Hexen2Demo_Stop();

} );

Deno.test( 'a native protocol-19 serverinfo King of the Hill short seeds the unified client', () => {

	const info = writeServerinfo( { protocol: 19, maxClients: 2, gameType: 1, kingOfHill: 3, levelName: 'koth',
		models: [], sounds: [] } );
	const bytes = demoFile( [ info.bytes ] );
	const track = Hexen2_ReadDemoForceTrack( bytes );
	check( CL_Hexen2Demo_Start( bytes, track.offset ).ok, 'the fixture starts' );
	const read = Hexen2_ReadDemoMessages( bytes );
	check( read.ok, read.reason );
	const out = CL_Hexen2Demo_Translate( bytes.subarray( read.messages[ 0 ].payloadOffset, read.messages[ 0 ].endsAt ) );
	check( out.ok, out.reason );

	const at = out.bytes.length - 3;
	same( out.bytes[ at ], 72, 'the serverinfo slot follows the feature message' );
	same( out.bytes[ at + 1 ] | ( out.bytes[ at + 2 ] << 8 ), 4, 'the zero-based serverinfo slot is sent as its entity number' );
	const tail = out.bytes.subarray( at );
	same( parseKingOfHill( tail ), 3, 'the client recovers native sv_kingofhill' );
	CL_Hexen2Demo_Stop();

} );

Deno.test( 'reference frames become full packets: clear_edicts removes entities and every frame gets a sequence', () => {

	const info = writeServerinfo( { protocol: 19, maxClients: 1, gameType: 0, levelName: 'synthetic',
		models: [ 'maps/demo1.bsp' ], sounds: [] } );
	check( info.ok, info.reason );
	const baseline = ( entity, x ) => {

		const b = writeBaseline( { entity, modelIndex: 2, frame: 0, colormap: 0, skin: 0, scale: 100,
			drawflags: 0, abslight: 0, origin: [ x, 0, 0 ], angles: [ 0, 0, 0 ] } );
		check( b.ok, b.reason );
		return b.bytes;

	};
	const reference = ( frame, sequence ) => {

		const r = writeReference( { frame, sequence } );
		check( r.ok, r.reason );
		return r.bytes;

	};
	const update = ( entity, x ) => {

		const u = writeEntityUpdate( { entity, modelIndex: 2, frame: 0, colormap: 0, skin: 0,
			drawflags: 0, effects: 0, scale: 100, abslight: 0, origin: [ x, 0, 0 ], angles: [ 0, 0, 0 ] } );
		check( u.ok, u.reason );
		return u.bytes;

	};
	const clear = entities => {

		const c = writeClearEdicts( entities );
		check( c.ok, c.reason );
		return c.bytes;

	};

	const first = concat( [ info.bytes, baseline( 2, 0 ), baseline( 3, 0 ), reference( 1, 1 ), update( 2, 8 ), clear( [ 3 ] ) ] );
	const second = concat( [ reference( 2, 2 ), update( 2, 16 ) ] );
	const third = concat( [ reference( 3, 3 ), clear( [ 2 ] ) ] );
	const bytes = demoFile( [ first, second, third ] );
	const track = Hexen2_ReadDemoForceTrack( bytes );
	check( CL_Hexen2Demo_Start( bytes, track.offset ).ok, 'the synthetic native demo starts' );
	const read = Hexen2_ReadDemoMessages( bytes );
	check( read.ok, read.reason );

	const out1 = CL_Hexen2Demo_Translate( bytes.subarray( read.messages[ 0 ].payloadOffset, read.messages[ 0 ].endsAt ) );
	const out2 = CL_Hexen2Demo_Translate( bytes.subarray( read.messages[ 1 ].payloadOffset, read.messages[ 1 ].endsAt ) );
	const out3 = CL_Hexen2Demo_Translate( bytes.subarray( read.messages[ 2 ].payloadOffset, read.messages[ 2 ].endsAt ) );
	check( out1.ok && out2.ok && out3.ok, `${out1.reason ?? ''}${out2.reason ?? ''}${out3.reason ?? ''}` );
	const packets1 = readPackets( out1.bytes );
	const packets2 = readPackets( out2.bytes );
	const packets3 = readPackets( out3.bytes );
	same( packets1.sequence, 1, 'the first reference frame has a sequence' );
	same( packets2.sequence, 2, 'the next reference frame advances it' );
	same( packets3.sequence, 3, 'a loss/clear frame still advances it' );
	same( packets1.packets.length, 1, 'one full packet per reference frame' );
	same( packets1.packets[ 0 ].map( e => e.number ).join( ',' ), '2', 'entity 3 is cleared from the first frame' );
	same( packets2.packets[ 0 ].map( e => e.number ).join( ',' ), '2', 'an untouched reference entity persists into the next frame' );
	same( packets2.packets[ 0 ][ 0 ].origin[ 0 ], 16, 'the next update carries the new origin' );
	same( packets3.packets[ 0 ].length, 0, 'clear_edicts removes the last entity from the next packet' );
	CL_Hexen2Demo_Stop();

} );

Deno.test( 'EF_NODRAW is not linked, EF_DARKLIGHT makes a dark light and EF_ROTATE turns on yaw only', () => {

	GameProfile_Set( 'hexen2' );
	CL_SetValidSequence( 0 ); // exercise the NQ relink path, which Hexen II models use outside packet frames
	const oldEnt = cl_entities[ 1 ];
	const saved = { maxclients: cl.maxclients, num: cl.num_entities, view: cl.viewentity, mtime: [ ...cl.mtime ],
		time: cl.time, oldtime: cl.oldtime, model: cl.model_precache[ 1 ], dlights: cl_dlights.slice() };
	let trail = 0;
	try {

		const model = { name: 'models/paladin.mdl', flags: 0 };
		const ent = new entity_t();
		ent.model = model;
		ent.origin.set( [ 10, 20, 30 ] );
		ent.msg_origins[ 0 ].set( [ 10, 20, 30 ] );
		ent.msg_origins[ 1 ].set( [ 10, 20, 30 ] );
		ent.msg_angles[ 0 ].set( [ 0, 90, 0 ] );
		ent.msg_angles[ 1 ].set( [ 0, 90, 0 ] );
		ent.forcelink = true;
		ent.effects = 0x10; // EF_DARKLIGHT
		cl_entities[ 1 ] = ent;
		cl.maxclients = 1; cl.num_entities = 2; cl.viewentity = 0;
		cl.model_precache[ 1 ] = model;
		cl.mtime[ 1 ] = 10; cl.mtime[ 0 ] = 10.1; cl.time = 10.1; cl.oldtime = 10;
		ent.msgtime = cl.mtime[ 0 ];
		CL_RelinkEntities();
		const dark = cl_dlights.find( dl => dl.key === 1 && dl.dark === true && dl.die >= cl.time );
		check( dark !== undefined, 'EF_DARKLIGHT allocated a dark dynamic light' );
		check( dark.radius > 0, 'the dark light keeps its native positive radius' );

		// EF_NODRAW still runs its effects (the dark light above) but is not added to the visible list.
		ent.effects = 0x10 | 0x80;
		cl.time = 10.2; cl.mtime[ 0 ] = 10.2; ent.msgtime = cl.mtime[ 0 ];
		CL_RelinkEntities();
		check( ! Array.from( { length: cl_numvisedicts }, ( _, i ) => cl_visedicts[ i ] ).includes( ent ),
			'EF_NODRAW is not drawn' );

		// EF_ROTATE (the model flag) turns the bonus item on yaw only.
		ent.effects = 0;
		model.flags = 0x0008;
		cl.time = 10.3; cl.mtime[ 0 ] = 10.3; ent.msgtime = cl.mtime[ 0 ];
		CL_RelinkEntities();
		same( ent.angles[ 0 ], 0, 'EF_ROTATE pitch' );
		same( ent.angles[ 2 ], 0, 'EF_ROTATE roll' );
		same( ent.angles[ 1 ], anglemod( 100 * cl.time ), 'EF_ROTATE yaw' );

		// The new trail types are reached through the named hook; U8 installs the renderer.
		model.flags = 0x100; // EF_FIREBALL
		ent.forcelink = false;
		ent.origin.set( [ 20, 20, 30 ] );
		ent.msg_origins[ 1 ].set( [ 10, 20, 30 ] );
		ent.msg_origins[ 0 ].set( [ 20, 20, 30 ] );
		cl.time = 10.4; cl.mtime[ 0 ] = 10.4; ent.msgtime = cl.mtime[ 0 ];
		CL_Hexen2SetTrailHooks( { fireball: () => trail ++ } );
		CL_RelinkEntities();
		check( trail > 0, 'EF_FIREBALL calls the named trail hook' );

	} finally {

		CL_Hexen2SetTrailHooks( { fireball: null } );
		cl_entities[ 1 ] = oldEnt;
		cl.maxclients = saved.maxclients; cl.num_entities = saved.num; cl.viewentity = saved.view;
		cl.mtime[ 0 ] = saved.mtime[ 0 ]; cl.mtime[ 1 ] = saved.mtime[ 1 ];
		cl.time = saved.time; cl.oldtime = saved.oldtime;
		cl.model_precache[ 1 ] = saved.model;
		for ( let i = 0; i < cl_dlights.length; i ++ ) cl_dlights[ i ] = saved.dlights[ i ];
		GameProfile_Set( GAME_PROFILES.quake );
		CL_SetValidSequence( 0 );

	}

} );
