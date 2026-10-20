// Fix package F2: the native-service translator's exact bodies (svc_damage, svc_finale, TE_EXPLOSION2, update_inv's
// eight mask bytes) and native King of the Hill. Every case feeds the bytes the gamecode's Write* builtins would write
// through the translator and then parses the result with the real CL_ParseServerMessage.
import * as protocol from '../src/engine/common/protocol.js';
import { svc_hexen2_update_inv, PROTOCOL_LARGE } from '../src/engine/common/protocol.js';
import {
	MSG_WriteByte, MSG_WriteShort, MSG_WriteLong, MSG_WriteCoord, MSG_WriteString,
	COM_SetNetMessage, sizebuf_t, SZ_Alloc, SZ_Write
} from '../src/engine/common/common.js';
import { GameProfile_Get, GameProfile_Set } from '../src/engine/common/game_profile.js';
import { cl, CSHIFT_DAMAGE } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { CL_Hexen2Reset } from '../src/engine/client/cl_hexen2.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { sv, svs, client_t, deathmatch, coop } from '../src/engine/server/server.js';
import { SV_SendServerinfo } from '../src/engine/server/sv_main.js';
import {
	Hexen2_WriteNativeServiceByte, Hexen2_WriteNativeServiceShort, Hexen2_WriteNativeServiceEntity,
	Hexen2_WriteNativeServiceLong, Hexen2_WriteNativeServiceCoord, Hexen2_WriteNativeServiceString
} from '../src/engine/server/hexen2_native_wire.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m ) => check( Math.abs( a - b ) < 1e-6, `${m}: ${a} != ${b}` );

function resetParsing() {

	CL_ClearState();
	CL_Hexen2Reset();
	cl.protocol = PROTOCOL_LARGE;
	cl.maxclients = 2;
	cl.scores = [
		{ name: '', frags: 0, colors: 0, translations: new Uint8Array( 256 ) },
		{ name: '', frags: 0, colors: 0, translations: new Uint8Array( 256 ) }
	];

}

function parse( data ) {

	resetParsing();
	const msg = new sizebuf_t();
	SZ_Alloc( msg, data.length + 64 );
	SZ_Write( msg, data, data.length );
	COM_SetNetMessage( msg );
	CL_ParseServerMessage();

}

function bytes( msg ) { return msg.data.subarray( 0, msg.cursize ); }
function newBuffer() { const msg = new sizebuf_t(); SZ_Alloc( msg, 4096 ); return msg; }
function byte( msg, value ) { if ( ! Hexen2_WriteNativeServiceByte( msg, value ) ) MSG_WriteByte( msg, value ); }
function short( msg, value ) { if ( ! Hexen2_WriteNativeServiceShort( msg, value ) ) MSG_WriteShort( msg, value ); }
function coord( msg, value ) { if ( ! Hexen2_WriteNativeServiceCoord( msg, value ) ) MSG_WriteCoord( msg, value ); }
function entity( msg, value ) { if ( ! Hexen2_WriteNativeServiceEntity( msg, value ) ) MSG_WriteShort( msg, value ); }
function string( msg, value ) { if ( ! Hexen2_WriteNativeServiceString( msg, value ) ) MSG_WriteString( msg, value ); }
function long( msg, value ) { if ( ! Hexen2_WriteNativeServiceLong( msg, value ) ) MSG_WriteLong( msg, value ); }

// Walks the reliable signon until the King of the Hill message, without needing a mounted map or renderer.
function signonKingOfHill( data ) {

	let at = 0;
	const u8 = () => data[ at ++ ];
	const u16 = () => { const value = data[ at ] | ( data[ at + 1 ] << 8 ); at += 2; return value; };
	const u32 = () => { const value = ( data[ at ] | ( data[ at + 1 ] << 8 ) | ( data[ at + 2 ] << 16 ) | ( data[ at + 3 ] << 24 ) ) >>> 0; at += 4; return value; };
	const skipString = () => { while ( at < data.length && data[ at ] !== 0 ) at ++; at ++; };
	while ( at < data.length ) {

		const cmd = u8();
		switch ( cmd ) {

			case protocol.svc_print:
			case protocol.svc_stufftext:
			case protocol.svc_hexen2_midi_name: skipString(); break;
			case protocol.svc_serverinfo:
				u32(); u8(); u8(); skipString();
				while ( data[ at ] !== 0 ) skipString();
				at ++;
				while ( data[ at ] !== 0 ) skipString();
				at ++;
				break;
			case protocol.svc_hexen2_features: u8(); u16(); break;
			case protocol.svc_hexen2_update_kingofhill: return u16();
			case protocol.svc_cdtrack: at += 2; break;
			case protocol.svc_setview: at += 2; break;
			case protocol.svc_signonnum: at += 1; break;
			default: throw new Error( 'unexpected signon opcode ' + cmd + ' at byte ' + at );

		}

	}
	return null;

}

Deno.test( 'native King of the Hill becomes the unified message and stores the client state', () => {

	GameProfile_Set( 'hexen2' );
	same( protocol.svc_hexen2_update_kingofhill, 72, 'the next free unified id' );
	const msg = newBuffer();
	byte( msg, 51 );
	entity( msg, 7 );
	const data = bytes( msg );
	same( data[ 0 ], 72, 'native 51 maps to svc_hexen2_update_kingofhill' );
	same( data[ 1 ] | ( data[ 2 ] << 8 ), 7, 'the entity short is kept' );

	parse( data );
	same( cl.h2.kingOfHill, 6, 'native stores the short minus one, the zero-based scoreboard slot' );

} );

Deno.test( 'svc_damage reads its native two bytes and three coords, even when they look like service ids', () => {

	GameProfile_Set( 'hexen2' );
	const msg = newBuffer();
	byte( msg, 19 );
	byte( msg, 19 ); // impact
	byte( msg, 51 ); // blood
	coord( msg, 10 ); coord( msg, 20 ); coord( msg, 30 );
	const data = bytes( msg );
	same( data[ 0 ], 19, 'svc_damage keeps its id' );
	same( data[ 1 ], 19, 'the impact byte is body, not a new service' );
	same( data[ 2 ], 51, 'the blood byte is body, not a new service' );

	parse( data );
	same( cl.cshifts[ CSHIFT_DAMAGE ].percent, 105, 'the damage colour shift used both bytes' );
	near( cl.faceanimtime, cl.time + 0.2, 'the pain face' );

} );

Deno.test( 'svc_finale has one native string body', () => {

	GameProfile_Set( 'hexen2' );
	const msg = newBuffer();
	byte( msg, 31 );
	string( msg, 'the end' );
	const data = bytes( msg );
	same( data[ 0 ], 31, 'svc_finale keeps its id' );

	parse( data );
	same( cl.intermission, 2, 'a finale starts the final intermission' );

} );

Deno.test( 'TE_EXPLOSION2 reads its native three coords and two colour bytes', () => {

	GameProfile_Set( 'hexen2' );
	const msg = newBuffer();
	byte( msg, 23 );
	byte( msg, 12 );
	coord( msg, 10 ); coord( msg, 20 ); coord( msg, 30 );
	byte( msg, 19 ); // colour start: also a native service id
	byte( msg, 51 ); // colour length: also a native service id
	const data = bytes( msg );
	same( data[ 0 ], 23, 'svc_temp_entity' );
	same( data[ 1 ], 12, 'TE_EXPLOSION2' );
	same( data.length, 2 + 6 + 2, 'the native body is three coords and two bytes' );

	parse( data );
	same( cl.intermission, 0, 'the message parsed to its end' );

} );

Deno.test( 'svc_update_inv reads all eight native mask bytes and normalises the unused high byte', () => {

	GameProfile_Set( 'hexen2' );

	// The ordinary seven-block form.
	const ordinary = newBuffer();
	byte( ordinary, 49 );
	byte( ordinary, 0x01 );
	byte( ordinary, 0x01 );
	short( ordinary, 88 );
	parse( bytes( ordinary ) );
	same( cl.h2.stats.health, 88, 'the ordinary health delta' );

	// Native 49 may set bit 7 (the fourth SC2 mask byte, unused by the pinned protocol). Read it so it cannot become the
	// next message, then write the unified seven-block form.
	const msg = newBuffer();
	byte( msg, 49 );
	byte( msg, 0x81 );
	byte( msg, 0x01 );
	byte( msg, 0x00 );
	short( msg, 77 );
	const data = bytes( msg );
	same( data[ 0 ], svc_hexen2_update_inv, 'svc_update_inv' );
	same( data[ 1 ], 0x01, 'the unused high block flag is cleared' );
	same( data[ 2 ], 0x01, 'the first SC1 mask byte' );
	same( data.length, 3 + 2, 'the high mask byte was consumed, not left as an opcode' );

	parse( data );
	same( cl.h2.stats.health, 77, 'the health field after the eighth mask byte' );

} );

Deno.test( 'native update_inv SC2_OBJ and SC2_OBJ2 consume their long bodies into svc_hexen2_info_mask', () => {

	GameProfile_Set( 'hexen2' );

	// The report's probe: flags 0x40 (block 6 present), mask 0x40 (SC2_OBJ), the objective long 0x11223344, then a
	// native centreprint. Before the fix the long leaked and 0x44 was parsed as svc_hexen2_sound_update_pos.
	const obj = newBuffer();
	byte( obj, 49 );
	byte( obj, 0x40 );
	byte( obj, 0x40 );
	long( obj, 0x11223344 );
	byte( obj, 26 );
	string( obj, 'hi' );
	const objData = bytes( obj );
	same( objData[ 0 ], svc_hexen2_update_inv, 'the stat record keeps its unified id' );
	same( objData[ 1 ], 0x40, 'the native flags byte' );
	same( objData[ 2 ], 0x40, 'the SC2_OBJ mask byte' );
	same( objData[ 3 ], protocol.svc_hexen2_info_mask, 'the objective long is rewritten as an info mask' );
	same( ( objData[ 4 ] | ( objData[ 5 ] << 8 ) | ( objData[ 6 ] << 16 ) | ( objData[ 7 ] << 24 ) ) >>> 0,
		0x11223344, 'the SC2_OBJ long' );
	same( ( objData[ 8 ] | ( objData[ 9 ] << 8 ) | ( objData[ 10 ] << 16 ) | ( objData[ 11 ] << 24 ) ) >>> 0,
		0, 'the second objective mask' );
	same( objData[ 12 ], 26, 'the following native message is still an opcode' );
	parse( objData );
	same( cl.h2.infoMask, 0x11223344, 'the client decoded the first objective mask' );
	same( cl.h2.infoMask2, 0, 'the second objective mask is empty' );

	// SC2_OBJ2 is the next bit in the same block and its long is the only body.
	const obj2 = newBuffer();
	byte( obj2, 49 );
	byte( obj2, 0x40 );
	byte( obj2, 0x80 );
	long( obj2, 0xaabbccdd );
	const obj2Data = bytes( obj2 );
	same( obj2Data[ 3 ], protocol.svc_hexen2_info_mask, 'the second objective long is rewritten as an info mask' );
	same( obj2Data.length, 12, 'both mask longs are written, no body byte is left over' );
	parse( obj2Data );
	same( cl.h2.infoMask, 0, 'SC2_OBJ2 leaves the first objective mask empty' );
	same( cl.h2.infoMask2, 0xaabbccdd, 'the client decoded SC2_OBJ2' );

} );

Deno.test( 'a Hexen II deathmatch signon sends the native initial King of the Hill slot', () => {

	const savedProfile = GameProfile_Get();
	const client = new client_t();
	SZ_Alloc( client.message, 8192 );
	const saved = {
		clients: svs.clients, maxclients: svs.maxclients, name: sv.name, protocol: sv.protocol,
		levelStringIndex: sv.levelStringIndex, cd_track: sv.cd_track, midi_name: sv.midi_name,
		models: sv.model_precache, sounds: sv.sound_precache, edicts: sv.edicts,
		deathmatchValue: deathmatch.value, deathmatchString: deathmatch.string,
		coopValue: coop.value, coopString: coop.string
	};
	try {

		GameProfile_Set( 'hexen2' );
		svs.clients = [ client ]; svs.maxclients = 1;
		sv.name = 'koth'; sv.protocol = PROTOCOL_LARGE; sv.levelStringIndex = 0xffff;
		sv.cd_track = 0; sv.midi_name = '';
		sv.model_precache = new Array( sv.model_precache.length ).fill( null );
		sv.sound_precache = new Array( sv.sound_precache.length ).fill( null );
		sv.edicts = [ { v: { message: 0 } } ]; // only read by the Quake branch of the world message
		deathmatch.value = 1; deathmatch.string = '1';
		coop.value = 0; coop.string = '0';

		SV_SendServerinfo( client );
		same( signonKingOfHill( bytes( client.message ) ), 1,
			'native sv_kingofhill starts at zero-based slot 0, sent as entity 1 so the client stores 0' );

		client.message.cursize = 0;
		deathmatch.value = 0; deathmatch.string = '0';
		SV_SendServerinfo( client );
		same( signonKingOfHill( bytes( client.message ) ), null, 'a co-op signon carries no King of the Hill message' );

	} finally {

		GameProfile_Set( savedProfile );
		svs.clients = saved.clients; svs.maxclients = saved.maxclients;
		sv.name = saved.name; sv.protocol = saved.protocol; sv.levelStringIndex = saved.levelStringIndex;
		sv.cd_track = saved.cd_track; sv.midi_name = saved.midi_name;
		sv.model_precache = saved.models; sv.sound_precache = saved.sounds; sv.edicts = saved.edicts;
		deathmatch.value = saved.deathmatchValue; deathmatch.string = saved.deathmatchString;
		coop.value = saved.coopValue; coop.string = saved.coopString;

	}

} );

Deno.test( 'the King of the Hill id is the next free unified Hexen message', () => {

	// Keep the range dense: every Hexen service above the last documented one is exactly the KOTH message.
	const ids = Object.entries( protocol )
		.filter( ( [ name, value ] ) => name.startsWith( 'svc_hexen2_' ) && typeof value === 'number' )
		.map( ( [ , value ] ) => value )
		.sort( ( a, b ) => a - b );
	same( ids.at( - 1 ), protocol.svc_hexen2_update_kingofhill, 'the highest documented Hexen id' );
	same( new Set( ids ).size, ids.length, 'the ids are unique' );

} );
