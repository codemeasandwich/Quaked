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
import { SV_Init, SV_SpawnServer, sv_protocol } from '../src/engine/server/sv_main.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cmd_Init, Cbuf_AddText, Cbuf_Execute } from '../src/engine/common/cmd.js';
import { PROTOCOL_VERSION, PROTOCOL_LARGE } from '../src/engine/common/protocol.js';
import { cls, ca_dedicated } from '../src/engine/client/client.js';
import { MAX_EDICTS_STANDARD } from '../src/engine/common/quakedef.js';

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
