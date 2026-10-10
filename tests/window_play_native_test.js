// Local play across windows (card [37a]) on the actual native server: two players' windows join a co-op e1m1 over
// the window driver (real BroadcastChannels), go through the native signon (prespawn, spawn, begin) and get player
// edicts of their own; each one's moves drive only its own player, a "kill" from one leaves the other alive, and
// closing one window drops only that player. The players' ends speak the protocol directly (clc_stringcmd,
// clc_move); the client side of the engine is exercised in the browser trial.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { sv, svs, client_t, coop, deathmatch, teamplay, skill } from '../src/engine/server/server.js';
import { SV_Init, SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { Host_ServerFrame } from '../src/engine/server/host.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { set_host_frametime } from '../src/engine/common/host_state.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cmd_Init, Cmd_ExecuteString } from '../src/engine/common/cmd.js';
import { sizebuf_t, SZ_Alloc, SZ_Clear, MSG_WriteByte, MSG_WriteString, MSG_WriteFloat, MSG_WriteAngle, MSG_WriteShort } from '../src/engine/common/common.js';
import { clc_stringcmd, clc_move } from '../src/engine/common/protocol.js';
import { cls, ca_dedicated } from '../src/engine/client/client.js';
import * as net from '../src/engine/net/net_main.js';
import * as netState from '../src/engine/net/net.js';
import { Window_Host, Window_NewSession } from '../src/engine/net/net_window.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const tick = ( ms = 5 ) => new Promise( resolve => setTimeout( resolve, ms ) );

const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
Cbuf_Init(); Cmd_Init(); Mod_Init(); PR_InitBuiltins(); Host_InitCommands(); SV_Init();
for ( const c of [ deathmatch, coop, teamplay, skill ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c ); // the server's own (Host_InitLocal registers them in the page)
svs.maxclientslimit = 4; svs.clients = Array.from( { length: 4 }, () => new client_t() );
net.NET_Init();

// whatever a test leaves open is closed when it ends, passed or failed: an open channel keeps the process alive
const closeAll = () => { for ( let s = netState.net_activeSockets; s; ) { const next = s.next; net.NET_Close( s ); s = next; } Window_Host( null ); };
const test = ( name, fn ) => Deno.test( name, async () => { try { await fn(); } finally { closeAll(); } } );

// one player's window: its socket and what it sends
function player( sock ) {

	const out = new sizebuf_t(); SZ_Alloc( out, 1024 );
	return {
		sock,
		say( text ) { SZ_Clear( out ); MSG_WriteByte( out, clc_stringcmd ); MSG_WriteString( out, text ); same( net.NET_SendMessage( sock, out ), 1, 'sent ' + text ); },
		move( forward, yaw ) { SZ_Clear( out ); MSG_WriteByte( out, clc_move ); MSG_WriteFloat( out, sv.time ); MSG_WriteAngle( out, 0 ); MSG_WriteAngle( out, yaw ); MSG_WriteAngle( out, 0 );
			MSG_WriteShort( out, forward ); MSG_WriteShort( out, 0 ); MSG_WriteShort( out, 0 ); MSG_WriteByte( out, 0 ); MSG_WriteByte( out, 0 ); net.NET_SendUnreliableMessage( sock, out ); },
		drain() { let n = 0; while ( net.NET_GetMessage( sock ) > 0 ) n ++; return n; } // the server's messages, read and set aside
	};

}

async function frames( n, each = () => {} ) {

	for ( let i = 0; i < n; i ++ ) { each(); await tick(); Host_ServerFrame(); await tick(); }

}

test( 'two players\' windows join one native co-op server, each with its own player; moves, a kill and a leave stay theirs', async () => {

	cls.state = ca_dedicated; // this page runs only the server: no local client of its own
	vars.Cvar_Set( 'coop', '1' ); vars.Cvar_Set( 'deathmatch', '0' ); vars.Cvar_Set( 'skill', '1' );
	svs.maxclients = 2;
	SV_SpawnServer( 'e1m1' );
	check( sv.active, 'the server runs e1m1' );
	set_host_frametime( 0.05 );
	const session = Window_NewSession();
	check( Window_Host( session ), 'the page hosts a session' );
	Cmd_ExecuteString( 'listen 1' ); // as `maxplayers 2` does
	const joins = [ net.NET_Connect( 'window:' + session ), net.NET_Connect( 'window:' + session ) ];
	await frames( 10 );
	const socks = await Promise.all( joins );
	same( svs.clients.filter( c => c.active ).length, 2, 'the server took both windows as clients' );
	const players = socks.map( player );

	for ( const step of [ 'prespawn', 'spawn', 'begin' ] ) { players.forEach( ( p, i ) => { if ( step === 'spawn' ) p.say( 'name "Player ' + ( i + 2 ) + '"' ); p.say( step ); } ); await frames( 4, () => players.forEach( p => p.drain() ) ); }
	const [ a, b ] = svs.clients;
	check( a.spawned && b.spawned, 'both players are in the game after the native signon' );
	check( a.edict !== b.edict && a.edict.v.health > 0 && b.edict.v.health > 0, 'each has a live player edict of its own' );
	same( a.name + '|' + b.name, 'Player 2|Player 3', 'and their own names' );

	const start = [ Array.from( a.edict.v.origin ), Array.from( b.edict.v.origin ) ];
	await frames( 20, () => { players[ 0 ].move( 320, 0 ); players[ 1 ].move( 0, 90 ); players.forEach( p => p.drain() ); } );
	const moved = ( e, s ) => Math.hypot( e.v.origin[ 0 ] - s[ 0 ], e.v.origin[ 1 ] - s[ 1 ] );
	check( moved( a.edict, start[ 0 ] ) > 16, 'the first window\'s forward move moves its player: ' + moved( a.edict, start[ 0 ] ).toFixed( 1 ) );
	check( moved( b.edict, start[ 1 ] ) < 1, 'the second player, told to stand, stands: ' + moved( b.edict, start[ 1 ] ).toFixed( 1 ) );
	check( Math.abs( b.edict.v.v_angle[ 1 ] - 90 ) < 2 && Math.abs( a.edict.v.v_angle[ 1 ] ) < 2, 'each aims where its own window says' );

	players[ 1 ].say( 'kill' );
	await frames( 3, () => players.forEach( p => p.drain() ) );
	// QuakeC's ClientKill: the player dies, loses two frags and respawns at once
	same( b.edict.v.frags, - 2, 'the second player\'s kill is that player\'s suicide' );
	same( a.edict.v.frags, 0, 'and not the first player\'s' );
	check( a.edict.v.health > 0 && b.edict.v.health > 0, 'both are alive again' );

	net.NET_Close( socks[ 1 ] );
	await frames( 4, () => players[ 0 ].drain() );
	check( ! b.active, 'closing the second window drops that player' );
	check( a.active && a.spawned && a.edict.v.health > 0, 'the first plays on' );

	// ending with a free slot: the shutdown message goes to the one player at once, not after the 5 s block
	const shutdown = new sizebuf_t(); SZ_Alloc( shutdown, 16 ); MSG_WriteByte( shutdown, 1 ); // svc_nop
	const began = performance.now();
	same( net.NET_SendToAll( shutdown, 5 ), 0, 'every connected player got it' );
	check( performance.now() - began < 500, 'without waiting on the empty slot: ' + Math.round( performance.now() - began ) + ' ms' );

	net.NET_Close( socks[ 0 ] );
	await frames( 2 );
	check( ! a.active, 'and the last leaves' );
	Window_Host( null );
	sv.active = false;

} );
