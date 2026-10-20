// The live Hexen II builtin wire on demo1: every particle/effect/plaque/rain/sound-position message the real builtin
// table produces must use the unified service ids (50-71), and the native bytes gamecode writes through
// WriteByte/WriteShort/WriteEntity/WriteCoord must be translated before the real client parser sees them. Both are
// checked by running the supplied gamecode and then parsing the bytes with CL_ParseServerMessage.
import { pr_global_struct, pr_globals, EDICT_TO_PROG } from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_PARM4, OFS_PARM5 } from '../src/engine/progs/pr_comp.js';
import { PROTOCOL_LARGE } from '../src/engine/common/protocol.js';
import {
	svc_temp_entity, svc_hexen2_start_effect, svc_hexen2_end_effect, svc_hexen2_plaque,
	svc_hexen2_raineffect, svc_hexen2_particle2, svc_hexen2_particle_explosion,
	svc_hexen2_set_view_flags, svc_hexen2_clear_view_flags, svc_hexen2_set_view_tint,
	svc_hexen2_setangle_interpolate, svc_hexen2_sound_update_pos,
	TE_STREAM_LIGHTNING
} from '../src/engine/common/protocol.js';
import { COM_SetNetMessage, sizebuf_t, SZ_Alloc, SZ_Write } from '../src/engine/common/common.js';
import { cl } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { CL_Hexen2Reset } from '../src/engine/client/cl_hexen2.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { callProfileBuiltin } from './helpers/builtin_table.mjs';
import { Hexen2_LoadStrings } from '../src/engine/common/hexen2_text_resources.js';
import { spawnHexen2Map, hexen2DataPresent } from './helpers/hexen2_live.mjs';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const setF = ( o, v ) => pr_globals.setFloat( o, v );
const setI = ( o, v ) => pr_globals.setInt32( o, v );
const call = ( number, context = { random: () => 0.5 } ) => callProfileBuiltin( number, context );
const bytes = buffer => buffer.data.subarray( 0, buffer.cursize );

function reset( buffer ) { buffer.cursize = 0; buffer.overflowed = false; }

function resetParsing() {

	CL_ClearState();
	CL_Hexen2Reset();
	cl.protocol = PROTOCOL_LARGE;
	cl.maxclients = 1;
	cl.scores = [ { name: '', frags: 0, colors: 0, translations: new Uint8Array( 256 ) } ];

}

function parseBytes( data ) {

	if ( data.length === 0 ) throw new Error( 'the server wrote no message' );
	resetParsing();
	const msg = new sizebuf_t();
	SZ_Alloc( msg, 65536 );
	SZ_Write( msg, data, data.length );
	COM_SetNetMessage( msg );
	CL_ParseServerMessage();

}

function spawn() {

	if ( !hexen2DataPresent() ) return null;
	return spawnHexen2Map( 'demo1' );

}

Deno.test( 'live particle/effect/plaque/rain/sound messages use unified ids and parse on the real client', () => {

	const session = spawn();
	if ( session === null ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv: server } = session;

	// particle2 (#42): opcode 56 and the native body, read by the real parser
	reset( server.datagram );
	[ 10, 20, 30 ].forEach( ( value, i ) => setF( OFS_PARM0 + i, value ) );
	[ - 1, - 2, - 3 ].forEach( ( value, i ) => setF( OFS_PARM0 + 3 + i, value ) );
	[ 1, 2, 3 ].forEach( ( value, i ) => setF( OFS_PARM0 + 6 + i, value ) );
	setF( OFS_PARM0 + 9, 300 ); setF( OFS_PARM0 + 10, 4 ); setF( OFS_PARM0 + 11, 5 );
	check( call( 42 ), 'particle2 (#42)' );
	same( bytes( server.datagram )[ 0 ], svc_hexen2_particle2, 'particle2 uses the unified id' );
	parseBytes( bytes( server.datagram ) );
	same( cl.h2.particles.at( - 1 ).kind, 'particle2', 'the live particle2 record' );
	same( cl.h2.particles.at( - 1 ).colour, 300, 'the live particle2 colour' );

	// starteffect (#88) and endeffect (#89)
	server.time = 1;
	reset( server.reliable_datagram );
	[ 1, 2, 3, 0, 0, 1 ].forEach( ( value, i ) => setF( OFS_PARM0 + 1 + i, value ) );
	setF( OFS_PARM0, 4 ); // CE_WHITE_SMOKE
	check( call( 88 ), 'starteffect (#88)' );
	const started = bytes( server.reliable_datagram );
	same( started[ 0 ], svc_hexen2_start_effect, 'starteffect uses the unified id' );
	parseBytes( started );
	same( cl.h2.effects[ 0 ].type, 4, 'the live start_effect record' );
	reset( server.reliable_datagram );
	setF( OFS_PARM1, 0 );
	check( call( 89 ), 'endeffect (#89)' );
	const ended = bytes( server.reliable_datagram );
	same( ended[ 0 ], svc_hexen2_end_effect, 'endeffect uses the unified id' );
	parseBytes( ended );
	check( cl.h2.effects[ 0 ] === undefined, 'the live end_effect record' );

	// plaque_draw (#79) with a real strings.txt table
	Hexen2_LoadStrings( 'zero\nfirst\nsecond\n' );
	reset( server.datagram );
	setF( OFS_PARM0, 0 ); setF( OFS_PARM1, 2 );
	check( call( 79 ), 'plaque_draw (#79)' );
	same( bytes( server.datagram )[ 0 ], svc_hexen2_plaque, 'plaque_draw uses the unified id' );
	parseBytes( bytes( server.datagram ) );
	same( cl.h2.plaqueIndex, 2, 'the live plaque index' );

	// rain_go (#80)
	reset( server.datagram );
	[ 1, 2, 3 ].forEach( ( value, i ) => setF( OFS_PARM0 + i, value ) );
	[ 4, 5, 6 ].forEach( ( value, i ) => setF( OFS_PARM1 + i, value ) );
	[ 8, 16, 24 ].forEach( ( value, i ) => setF( OFS_PARM2 + i, value ) );
	[ 1, 2, 3 ].forEach( ( value, i ) => setF( OFS_PARM3 + i, value ) );
	setF( OFS_PARM4, 13 ); setF( OFS_PARM5, 14 );
	check( call( 80 ), 'rain_go (#80)' );
	same( bytes( server.datagram )[ 0 ], svc_hexen2_raineffect, 'rain_go uses the unified id' );
	parseBytes( bytes( server.datagram ) );
	same( cl.h2.rain.at( - 1 ).colour, 13, 'the live rain record' );

	// particleexplosion (#81)
	reset( server.datagram );
	[ 10, 20, 30 ].forEach( ( value, i ) => setF( OFS_PARM0 + i, value ) );
	setF( OFS_PARM0 + 3, 7 ); setF( OFS_PARM0 + 4, 9 ); setF( OFS_PARM0 + 5, 11 );
	check( call( 81 ), 'particleexplosion (#81)' );
	same( bytes( server.datagram )[ 0 ], svc_hexen2_particle_explosion, 'particleexplosion uses the unified id' );
	parseBytes( bytes( server.datagram ) );
	same( cl.h2.particles.at( - 1 ).kind, 'particle_explosion', 'the live explosion record' );

	// updatesoundpos (#105)
	reset( server.datagram );
	setI( OFS_PARM0, EDICT_TO_PROG( session.player ) );
	setF( OFS_PARM1, 3 );
	check( call( 105 ), 'updatesoundpos (#105)' );
	same( bytes( server.datagram )[ 0 ], svc_hexen2_sound_update_pos, 'updatesoundpos uses the unified id' );
	parseBytes( bytes( server.datagram ) );
	same( cl.h2.lastSoundPosition.channel, 3, 'the live sound-position record' );

} );

function writeByte( destination, value ) { setF( OFS_PARM0, destination ); setF( OFS_PARM1, value ); check( call( 52 ), 'writebyte' ); }
function writeShort( destination, value ) { setF( OFS_PARM0, destination ); setF( OFS_PARM1, value ); check( call( 54 ), 'writeshort' ); }
function writeCoord( destination, value ) { setF( OFS_PARM0, destination ); setF( OFS_PARM1, value ); check( call( 56 ), 'writecoord' ); }
function writeEntity( destination, ent ) { setF( OFS_PARM0, destination ); setI( OFS_PARM1, EDICT_TO_PROG( ent ) ); check( call( 59 ), 'writeentity' ); }
function writeAngle( destination, value ) { setF( OFS_PARM0, destination ); setF( OFS_PARM1, value ); check( call( 57 ), 'writeangle' ); }

Deno.test( 'native service bytes from gamecode are translated before the real client parses them', () => {

	const session = spawn();
	if ( session === null ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const { sv: server, clients } = session;
	const client = clients[ 0 ], ent = session.player;

	// SVC_TEMPENTITY (23) + TE_STREAM_LIGHTNING (28): rewritten as 70 with the native stream body.
	reset( server.datagram );
	writeByte( 0, 23 );
	writeByte( 0, TE_STREAM_LIGHTNING );
	writeEntity( 0, ent );
	writeByte( 0, 1 );
	writeByte( 0, 4 );
	for ( const value of [ 10, 20, 30, 40, 50, 60 ] ) writeCoord( 0, value );
	const stream = bytes( server.datagram );
	same( stream[ 0 ], 70, 'the stream temp entity uses svc_hexen2_temp_entity' );
	same( stream[ 1 ], TE_STREAM_LIGHTNING, 'the native stream type is kept' );
	parseBytes( stream );
	const record = cl.h2.streams.at( - 1 );
	same( record.type, TE_STREAM_LIGHTNING, 'the parsed stream type' );
	same( record.entity, ent.index, 'the parsed stream entity' );
	same( record.tag, 1, 'the parsed stream tag' );
	same( record.source.join( ',' ), '10,20,30', 'the parsed stream source' );

	// A Quake TE type passes through unchanged.
	reset( server.datagram );
	writeByte( 0, svc_temp_entity );
	writeByte( 0, 3 );
	for ( const value of [ 1, 2, 3 ] ) writeCoord( 0, value );
	same( bytes( server.datagram )[ 0 ], svc_temp_entity, 'a Quake temp entity stays svc_temp_entity' );
	parseBytes( bytes( server.datagram ) );

	// SVC_SET_VIEW_FLAGS / CLEAR (40/41), MSG_ONE
	reset( client.message );
	pr_global_struct.msg_entity = EDICT_TO_PROG( client.edict );
	writeByte( 1, 40 );
	writeByte( 1, 128 );
	const setFlags = bytes( client.message );
	same( setFlags[ 0 ], svc_hexen2_set_view_flags, 'native 40 is svc_hexen2_set_view_flags' );
	same( setFlags[ 1 ], 128, 'the native flags byte' );
	parseBytes( setFlags );
	same( cl.h2.viewDrawflags, 128, 'the parsed view flags' );
	reset( client.message );
	writeByte( 1, 41 );
	writeByte( 1, 128 );
	same( bytes( client.message )[ 0 ], svc_hexen2_clear_view_flags, 'native 41 is svc_hexen2_clear_view_flags' );
	parseBytes( bytes( client.message ) );
	same( cl.h2.viewDrawflags, 0, 'the parsed view flags cleared' );

	// SVC_SET_VIEW_TINT (46)
	reset( client.message );
	writeByte( 1, 46 );
	writeByte( 1, 9 );
	same( bytes( client.message )[ 0 ], svc_hexen2_set_view_tint, 'native 46 is svc_hexen2_set_view_tint' );
	parseBytes( bytes( client.message ) );
	same( cl.h2.viewTint, 9, 'the parsed view tint' );

	// SVC_SETANGLESINTER (50) with three angle bytes
	reset( client.message );
	writeByte( 1, 50 );
	writeAngle( 1, 90 ); writeAngle( 1, 180 ); writeAngle( 1, 270 );
	const interp = bytes( client.message );
	same( interp[ 0 ], svc_hexen2_setangle_interpolate, 'native 50 is svc_hexen2_setangle_interpolate' );
	parseBytes( interp );
	same( cl.h2.angleTarget[ 0 ] > 89 && cl.h2.angleTarget[ 0 ] < 91, true, 'the parsed angle target' );

	// SVC_UPDATE_KINGOFHILL (51) is refused with its short body: nothing reaches the wire.
	reset( server.reliable_datagram );
	writeByte( 2, 51 );
	writeShort( 2, 1234 );
	same( server.reliable_datagram.cursize, 0, 'the king-of-the-hill message has no unified meaning and is dropped' );

	// SVC_SOUND_UPDATE_POS (53) -> 68, MSG_BROADCAST
	reset( server.datagram );
	writeByte( 0, 53 );
	writeShort( 0, ( ent.index << 3 ) | 2 );
	writeCoord( 0, 10 ); writeCoord( 0, 20 ); writeCoord( 0, 30 );
	const sound = bytes( server.datagram );
	same( sound[ 0 ], svc_hexen2_sound_update_pos, 'native 53 is svc_hexen2_sound_update_pos' );
	parseBytes( sound );
	same( cl.h2.lastSoundPosition.entity, ent.index, 'the parsed moved sound entity' );
	same( cl.h2.lastSoundPosition.channel, 2, 'the parsed moved sound channel' );

} );
