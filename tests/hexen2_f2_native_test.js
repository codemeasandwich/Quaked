// Fix package F2: the native-service translator's exact bodies (svc_damage, svc_finale, TE_EXPLOSION2, update_inv's
// eight mask bytes) and native King of the Hill. Every case feeds the bytes the gamecode's Write* builtins would write
// through the translator and then parses the result with the real CL_ParseServerMessage.
import * as protocol from '../src/engine/common/protocol.js';
import { svc_hexen2_update_inv, PROTOCOL_LARGE } from '../src/engine/common/protocol.js';
import {
	MSG_WriteByte, MSG_WriteShort, MSG_WriteCoord, MSG_WriteString,
	COM_SetNetMessage, sizebuf_t, SZ_Alloc, SZ_Write
} from '../src/engine/common/common.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { cl, CSHIFT_DAMAGE } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { CL_Hexen2Reset } from '../src/engine/client/cl_hexen2.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import {
	Hexen2_WriteNativeServiceByte, Hexen2_WriteNativeServiceShort, Hexen2_WriteNativeServiceEntity,
	Hexen2_WriteNativeServiceCoord, Hexen2_WriteNativeServiceString
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

Deno.test( 'the King of the Hill id is the next free unified Hexen message', () => {

	// Keep the range dense: every Hexen service above the last documented one is exactly the KOTH message.
	const ids = Object.entries( protocol )
		.filter( ( [ name, value ] ) => name.startsWith( 'svc_hexen2_' ) && typeof value === 'number' )
		.map( ( [ , value ] ) => value )
		.sort( ( a, b ) => a - b );
	same( ids.at( - 1 ), protocol.svc_hexen2_update_kingofhill, 'the highest documented Hexen id' );
	same( new Set( ids ).size, ids.length, 'the ids are unique' );

} );
