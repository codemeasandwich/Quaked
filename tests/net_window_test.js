// The window driver (card [37a]) through the public net layer: NET_Connect('window:<session>') from a player's window,
// NET_CheckNewConnections on the hosting page, messages both ways, a full server refused, a late host still found,
// and closing either end. Both ends run in this one process on real BroadcastChannels (the browser's, in Node or Deno).
import { svs } from '../src/engine/server/server.js';
import { Cbuf_Init, Cmd_Init, Cmd_ExecuteString } from '../src/engine/common/cmd.js';
import { sizebuf_t, SZ_Alloc, SZ_Clear, SZ_Write } from '../src/engine/common/common.js';
import { net_message } from '../src/engine/net/net.js';
import * as net from '../src/engine/net/net_main.js';
import { Window_Host, Window_HostSession, Window_NewSession, WINDOW_SESSION_PATTERN } from '../src/engine/net/net_window.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const tick = ( ms = 30 ) => new Promise( resolve => setTimeout( resolve, ms ) );
const bytes = list => { const b = new sizebuf_t(); SZ_Alloc( b, 64 ); SZ_Clear( b ); SZ_Write( b, Uint8Array.from( list ), list.length ); return b; };
const read = sock => { const r = net.NET_GetMessage( sock ); return [ r, Array.from( net_message.data.subarray( 0, net_message.cursize ) ) ]; };
const accept = async () => { for ( let i = 0; i < 40; i ++ ) { const s = net.NET_CheckNewConnections(); if ( s ) return s; await tick( 10 ); } return null; };

Cbuf_Init(); Cmd_Init();
svs.maxclients = svs.maxclientslimit = 4;
net.NET_Init();
net.set_listening( true );

Deno.test( 'a player\'s window joins the hosting page; messages go both ways; unreliable runs keep the newest', async () => {

	const session = Window_NewSession();
	check( WINDOW_SESSION_PATTERN.test( session ), 'a new session id is valid: ' + session );
	Cmd_ExecuteString( 'windowhost ' + session );
	same( Window_HostSession(), session, 'the windowhost command names the session' );
	Cmd_ExecuteString( 'listen 1' );
	const pending = net.NET_Connect( 'window:' + session );
	check( pending instanceof Promise, 'joining is asynchronous' );
	const server = await accept();
	check( server, 'the host takes the join' );
	const client = await pending;
	check( client && client !== server && ! client.disconnected, 'the player\'s window has its own open socket' );
	same( net.NET_CheckNewConnections(), null, 'one join is one connection (resent joins are not new players)' );

	same( net.NET_SendMessage( server, bytes( [ 1, 2, 3 ] ) ), 1, 'the host sends reliably' );
	for ( const n of [ 10, 11, 12 ] ) net.NET_SendUnreliableMessage( server, bytes( [ n ] ) );
	net.NET_SendMessage( server, bytes( [ 4 ] ) );
	net.NET_SendUnreliableMessage( server, bytes( [ 20 ] ) ); net.NET_SendUnreliableMessage( server, bytes( [ 21 ] ) );
	await tick();
	const got = [];
	for ( let r; ( r = read( client ) )[ 0 ] > 0; ) got.push( r[ 0 ] + ':' + r[ 1 ].join( ',' ) );
	same( got.join( ' ' ), '1:1,2,3 2:12 1:4 2:21', 'reliable messages all arrive in order; of a run of unreliable ones, the newest' );
	same( read( client )[ 0 ], 0, 'then nothing is waiting' );

	same( net.NET_SendMessage( client, bytes( [ 7, 8 ] ) ), 1, 'the player sends back' );
	await tick();
	same( read( server ).join( '|' ), '1|7,8', 'the host reads the player\'s message' );

	net.NET_Close( client );
	await tick();
	same( net.NET_GetMessage( server ), - 1, 'closing the player\'s window closes the host\'s end too' );
	net.NET_Close( server );
	Cmd_ExecuteString( 'windowhost -' );
	same( Window_HostSession(), null, 'windowhost - stops hosting' );

} );

Deno.test( 'a player\'s window that loads before its host keeps asking; a full server refuses it', async () => {

	const session = Window_NewSession();
	const early = net.NET_Connect( 'window:' + session );
	await tick( 300 );
	check( Window_Host( session ), 'the host comes up later' );
	const server = await accept();
	check( server, 'the early window\'s repeated join is taken once the host listens' );
	const client = await early;

	const saved = svs.maxclients;
	svs.maxclients = 2; // the host's own player plus this window: no room for another
	const third = net.NET_Connect( 'window:' + session );
	svs.maxclients = 0; // NET_NewQSocket refuses the host's socket for it
	await tick();
	same( net.NET_CheckNewConnections(), null, 'no socket for a third player' );
	let refused = null;
	try { await third; } catch ( error ) { refused = error.message; }
	svs.maxclients = saved;
	check( refused && refused.includes( 'server is full' ), 'the third window is told the server is full: ' + refused );

	net.NET_Close( server );
	await tick();
	same( net.NET_GetMessage( client ), - 1, 'closing the host\'s end closes the player\'s' );
	net.NET_Close( client );
	Window_Host( null );

} );

Deno.test( 'addresses: invalid sessions, an unknown kind and a remote address are not window joins', () => {

	same( net.NET_Connect( 'window:not valid!' ), null, 'an invalid session id is refused at once' );
	same( Window_Host( 'bad id' ), false, 'and cannot be hosted' );
	same( net.NET_Connect( 'wts://example.invalid:4433?room=x' ), null, 'with no WebTransport, a remote address is not sent to the window driver' );

} );
