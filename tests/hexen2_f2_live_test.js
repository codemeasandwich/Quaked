// Fix package F2 live contracts: a Hexen II session must not load a Quake beam model for a native temp entity, and a
// live puzzle string or fractional timer change must produce an svc_hexen2_update_inv delta and reach cl.h2. Both use
// the supplied Hexen II data through the engine's own loader; the suite skips when it is absent.
import {
	PROTOCOL_LARGE, svc_temp_entity, svc_hexen2_update_inv,
	TE_LIGHTNING1, TE_LIGHTNING2, TE_LIGHTNING3, TE_BEAM
} from '../src/engine/common/protocol.js';
import {
	MSG_WriteByte, MSG_WriteShort, MSG_WriteCoord, COM_SetNetMessage, sizebuf_t, SZ_Alloc
} from '../src/engine/common/common.js';
import { cl, cl_beams } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { CL_Hexen2Reset } from '../src/engine/client/cl_hexen2.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { SV_WriteClientdataToMessage } from '../src/engine/server/sv_main.js';
import { Hexen2_DecodeUpdateInv } from '../src/engine/common/hexen2_clientdata.js';
import { PR_SetTempString } from '../src/engine/progs/progs.js';
import { loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m ) => check( Math.abs( a - b ) < 1e-6, `${m}: ${a} != ${b}` );
const bytes = buffer => buffer.data.subarray( 0, buffer.cursize );

function resetParsing() {

	CL_ClearState();
	CL_Hexen2Reset();
	cl.protocol = PROTOCOL_LARGE;
	cl.maxclients = 1;
	cl.scores = [ { name: '', frags: 0, colors: 0, translations: new Uint8Array( 256 ) } ];

}

function parse( data ) {

	resetParsing();
	const msg = new sizebuf_t();
	SZ_Alloc( msg, data.length + 64 );
	msg.data.set( data, 0 );
	msg.cursize = data.length;
	COM_SetNetMessage( msg );
	CL_ParseServerMessage();

}

function updateInvFor( data, field ) {

	for ( let at = 0; at < data.length; at ++ )
		if ( data[ at ] === svc_hexen2_update_inv ) {

			const read = Hexen2_DecodeUpdateInv( data.subarray( at + 1 ), { allowTrailing: true } );
			if ( read.ok && Object.hasOwn( read.stats, field ) ) return read;

		}
	return null;

}

Deno.test( 'a Hexen session consumes native lightning/beam temp entities without loading a Quake model', () => {

	if ( ! loadHexen2Data( 'hexen2' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }

	for ( const [ type, label ] of [
		[ TE_LIGHTNING1, 'TE_LIGHTNING1' ], [ TE_LIGHTNING2, 'TE_LIGHTNING2' ],
		[ TE_LIGHTNING3, 'TE_LIGHTNING3' ], [ TE_BEAM, 'TE_BEAM' ]
	] ) {

		resetParsing();
		const msg = new sizebuf_t();
		SZ_Alloc( msg, 256 );
		MSG_WriteByte( msg, svc_temp_entity );
		MSG_WriteByte( msg, type );
		MSG_WriteShort( msg, 1 );
		for ( const value of [ 10, 20, 30, 40, 50, 60 ] ) MSG_WriteCoord( msg, value );
		COM_SetNetMessage( msg );
		CL_ParseServerMessage(); // before the fix: Sys_Error: Mod_NumForName: progs/bolt.mdl not found
		check( cl_beams.every( beam => beam.model == null ), label + ' draws nothing' );

	}

} );

Deno.test( 'a live puzzle string change sends update_inv and reaches cl.h2.puzzles', () => {

	const session = spawnHexen2Map( 'demo1' );
	const client = session.clients[ 0 ], player = session.player;

	// Establish the baseline exactly as a full spawn send does.
	player.v.puzzle_inv1 = PR_SetTempString( 'before-puzzle' );
	player.v.haste_time = 1.0;
	client.message.cursize = 0;
	SV_WriteClientdataToMessage( player, client.message, client );
	client.message.cursize = 0;
	SV_WriteClientdataToMessage( player, client.message, client );
	check( updateInvFor( bytes( client.message ), 'puzzle_inv1' ) === null, 'an unchanged baseline sends no puzzle delta' );

	// A new string offset, as gamecode writes on a Portal puzzle pickup.
	player.v.puzzle_inv1 = PR_SetTempString( 'f2-puzzle' );
	client.message.cursize = 0;
	SV_WriteClientdataToMessage( player, client.message, client );
	const data = bytes( client.message ).slice();
	const delta = updateInvFor( data, 'puzzle_inv1' );
	check( delta !== null, 'the puzzle change wrote an svc_hexen2_update_inv body' );
	same( delta.stats.puzzle_inv1, 'f2-puzzle', 'the wire body carries the new puzzle string' );

	parse( data );
	same( cl.h2.puzzles[ 0 ], 'f2-puzzle', 'the client decoded the puzzle name' );
	same( cl.h2.stats.puzzle_inv1, 'f2-puzzle', 'the stat record carries the same string' );

} );

Deno.test( 'a fractional haste_time change sends update_inv without truncation', () => {

	const session = spawnHexen2Map( 'demo1' );
	const client = session.clients[ 0 ], player = session.player;

	player.v.haste_time = 1.0;
	// Settle the baseline (the spawn snapshot predates this value), then check that a repeat is silent.
	client.message.cursize = 0;
	SV_WriteClientdataToMessage( player, client.message, client );
	client.message.cursize = 0;
	SV_WriteClientdataToMessage( player, client.message, client );
	check( updateInvFor( bytes( client.message ), 'haste_time' ) === null, 'a whole-number baseline sends no haste delta' );

	player.v.haste_time = 1.25;
	client.message.cursize = 0;
	SV_WriteClientdataToMessage( player, client.message, client );
	const data = bytes( client.message ).slice();
	const delta = updateInvFor( data, 'haste_time' );
	check( delta !== null, 'the fractional change wrote an svc_hexen2_update_inv body' );
	near( delta.stats.haste_time, 1.25, 'the wire body keeps the fractional value' );

	parse( data );
	near( cl.h2.stats.haste_time, 1.25, 'the client decoded the exact fractional value' );

} );
