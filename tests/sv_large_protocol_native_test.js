// The large-map protocol chosen by the map itself (docs/add-ons-2026-10-13.md, step 4), through SV_SpawnServer on the
// real server and the shareware's real QuakeC: e1m1 with 700 more entities (info_notnull, which QuakeC leaves standing)
// passes protocol 15's 600 while it loads, so the server loads it again on the large-map protocol and it runs, with
// the choice kept for the session; e1m1 as it is stays on protocol 15. Removing the retry (the try/catch in
// SV_SpawnServer, or ED_Alloc's call of SV_LargeProtocolNeeded) ends the first spawn with "no free edicts" instead.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { sv, svs, client_t, coop, deathmatch, teamplay, skill } from '../src/engine/server/server.js';
import { SV_Init, SV_SpawnServer, SV_EmitPacketEntities, sv_protocol } from '../src/engine/server/sv_main.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cmd_Init, Cbuf_AddText, Cbuf_Execute } from '../src/engine/common/cmd.js';
import { PROTOCOL_VERSION, PROTOCOL_LARGE, svc_serversequence, svc_updatestat } from '../src/engine/common/protocol.js';
import { sizebuf_t, SZ_Alloc, SZ_Clear, MSG_WriteByte, MSG_WriteLong, COM_SetNetMessage } from '../src/engine/common/common.js';
import { cl } from '../src/engine/client/client.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { CL_GetEntityFrame } from '../src/engine/client/cl_pred.js';
import { cls, ca_dedicated } from '../src/engine/client/client.js';
import { MAX_EDICTS, MAX_EDICTS_STANDARD } from '../src/engine/common/quakedef.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );

// e1m1 with its entity lump (lump 0) replaced by its own entities and `extra` more, appended at the end of the file
function crowded( extra ) {
	const bsp = new Uint8Array( pak.COM_FindFile( 'maps/e1m1.bsp' ).data ), view = new DataView( bsp.buffer, bsp.byteOffset, bsp.byteLength );
	const ofs = view.getInt32( 4, true ), len = view.getInt32( 8, true );
	const own = new TextDecoder( 'latin1' ).decode( bsp.subarray( ofs, ofs + len ) ).replace( /\0+$/, '' );
	const text = own + '{\n"classname" "info_notnull"\n"origin" "0 0 0"\n}\n'.repeat( extra ) + '\0';
	const lump = new TextEncoder().encode( text ), out = new Uint8Array( bsp.length + lump.length );
	out.set( bsp ); out.set( lump, bsp.length );
	const o = new DataView( out.buffer ); o.setInt32( 4, bsp.length, true ); o.setInt32( 8, lump.length, true );
	return out;
}
// a PACK archive holding one file
function packOf( name, data ) {
	const out = new Uint8Array( 12 + data.length + 64 ), v = new DataView( out.buffer );
	out.set( [ 80, 65, 67, 75 ] ); v.setInt32( 4, 12 + data.length, true ); v.setInt32( 8, 64, true );
	out.set( data, 12 ); out.set( new TextEncoder().encode( name ), 12 + data.length );
	v.setInt32( 12 + data.length + 56, 12, true ); v.setInt32( 12 + data.length + 60, data.length, true );
	return out;
}
const big = packOf( 'maps/crowded.bsp', crowded( 700 ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'crowded.pak', big.buffer ) );

Cbuf_Init(); Cmd_Init(); Mod_Init(); PR_InitBuiltins(); Host_InitCommands(); SV_Init();
for ( const c of [ deathmatch, coop, teamplay, skill, sv_protocol ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
svs.maxclientslimit = 4; svs.clients = Array.from( { length: 4 }, () => new client_t() ); svs.maxclients = 1;
cls.state = ca_dedicated;

Deno.test( 'a map past 600 entities loads again on the large-map protocol and runs; an ordinary map stays on 15', () => {
	try {
		vars.Cvar_Set( 'sv_protocol', String( PROTOCOL_VERSION ) );
		for ( const c of svs.clients ) c.active = false;
		SV_SpawnServer( 'e1m1' );
		check( sv.active, 'e1m1 runs' );
		same( sv.protocol, PROTOCOL_VERSION, 'an ordinary map keeps protocol 15' );

		SV_SpawnServer( 'crowded' );
		check( sv.active, 'the crowded map runs instead of ending the game' );
		same( sv.protocol, PROTOCOL_LARGE, 'on the large-map protocol' );
		check( sv.num_edicts > MAX_EDICTS_STANDARD, 'with all its entities, more than protocol 15 holds: ' + sv.num_edicts );
		same( sv_protocol.value | 0, PROTOCOL_LARGE, 'the choice stays for the session' );

		SV_SpawnServer( 'e1m1' );
		same( sv.protocol, PROTOCOL_LARGE, 'so the next map starts on it' );
	} finally { vars.Cvar_Set( 'sv_protocol', String( PROTOCOL_VERSION ) ); sv.active = false; }
} );

Deno.test( 'a save with more than 600 entities loads on the large-map protocol in a session started on 15', () => {
	const store = new Map(), saved = Object.getOwnPropertyDescriptor( globalThis, 'localStorage' );
	Object.defineProperty( globalThis, 'localStorage', { configurable: true, value: { getItem: k => store.get( k ) ?? null, setItem: ( k, v ) => store.set( k, String( v ) ), removeItem: k => store.delete( k ) } } );
	try {
		vars.Cvar_Set( 'sv_protocol', String( PROTOCOL_VERSION ) ); // a new session: protocol 15
		// the save format Host_Savegame_f writes: version, comment, 16 spawn parms, skill, map, time, 64 light styles,
		// then the globals' block and one block per entity (the world first)
		const blocks = [ '{\n"classname" "worldspawn"\n}' ];
		for ( let i = 1; i < 700; i ++ ) blocks.push( '{\n"classname" "info_notnull"\n}' );
		store.set( 'quake_save_crowd', [ '5', 'crowded save', ...Array( 16 ).fill( '0' ), '1', 'e1m1', '1', ...Array( 64 ).fill( 'm' ), '{\n}', ...blocks ].join( '\n' ) );
		Cbuf_AddText( 'load crowd\n' ); Cbuf_Execute();
		check( sv.active, 'the save loaded' );
		same( sv.protocol, PROTOCOL_LARGE, 'on the large-map protocol: protocol 15 holds 600 entities' );
		same( sv.num_edicts, 700, 'with all of them' );
	} finally {
		vars.Cvar_Set( 'sv_protocol', String( PROTOCOL_VERSION ) ); sv.active = false;
		if ( saved ) Object.defineProperty( globalThis, 'localStorage', saved ); else delete globalThis.localStorage;
	}
} );

Deno.test( 'entity numbers past 1023 go out and come back whole in the large-map protocol\'s delta packets', () => {
	const SENTINEL = 31;
	// one frame's packet as the server writes it, a sentinel stat after it, read by the real client parser
	const send = ( client, seq, numbers, x ) => {
		const to = client.frames[ seq & 63 ].entities;
		to.num_entities = numbers.length;
		numbers.forEach( ( n, k ) => { const e = to.entities[ k ]; e.number = n; e.flags = 0; e.modelindex = 1; e.frame = 0; e.colormap = 0; e.skin = 0; e.effects = 0; e.origin[ 0 ] = x + n % 1000; e.origin[ 1 ] = 8; e.origin[ 2 ] = 16; e.angles.fill( 0 ); } );
		const msg = new sizebuf_t(); SZ_Alloc( msg, 8192 ); SZ_Clear( msg );
		MSG_WriteByte( msg, svc_serversequence ); MSG_WriteLong( msg, seq );
		SV_EmitPacketEntities( client, to, msg );
		MSG_WriteByte( msg, svc_updatestat ); MSG_WriteByte( msg, SENTINEL ); MSG_WriteLong( msg, 4242 );
		return msg;
	};
	const read = msg => { cl.stats[ SENTINEL ] = 0; COM_SetNetMessage( msg ); CL_ParseServerMessage(); return cl.stats[ SENTINEL ] === 4242; };
	const got = seq => { const p = CL_GetEntityFrame( seq ).packet_entities; return p.entities.slice( 0, p.num_entities ).map( e => e.number + '@' + e.origin[ 0 ] ).join(); }; // (origins within a coordinate's range)
	try {
		vars.Cvar_Set( 'sv_protocol', String( PROTOCOL_LARGE ) );
		SV_SpawnServer( 'e1m1' );
		same( sv.protocol, PROTOCOL_LARGE, 'a large-map server' );
		cl.protocol = PROTOCOL_LARGE;
		const client = new client_t(); client.delta_sequence = - 1;
		const numbers = [ 5, 1023, 1024, 2051, MAX_EDICTS - 1 ]; // 1024: low bits 0, the word would be 0 without "more bits"
		check( read( send( client, 1, numbers, 100 ) ), 'the full packet read to its end' );
		same( got( 1 ), numbers.map( n => n + '@' + ( 100 + n % 1000 ) ).join(), 'every number and its state, from the baselines' );
		client.delta_sequence = 1; // the client acknowledged frame 1: frame 2 is a delta, 1024 removed, the others moved
		check( read( send( client, 2, [ 5, 1023, 2051, MAX_EDICTS - 1 ], 300 ) ), 'the delta read to its end' );
		same( got( 2 ), [ 5, 1023, 2051, MAX_EDICTS - 1 ].map( n => n + '@' + ( 300 + n % 1000 ) ).join(), 'the removal and the moves, by the right numbers' );
		// the control: a protocol-15 reader of the same packet loses its place (it does not read the high byte)
		client.delta_sequence = - 1; cl.protocol = PROTOCOL_VERSION;
		let intact = false; try { intact = read( send( client, 3, numbers, 500 ) ); } catch {}
		check( ! intact || got( 3 ) !== numbers.map( n => n + '@' + ( 500 + n % 1000 ) ).join(), 'read without the byte, the packet does not come back: ' + got( 3 ) );
	} finally { vars.Cvar_Set( 'sv_protocol', String( PROTOCOL_VERSION ) ); sv.active = false; cl.protocol = PROTOCOL_VERSION; }
} );
