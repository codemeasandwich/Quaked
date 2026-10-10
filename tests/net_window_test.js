// The window driver (card [37a]) through the public net layer: NET_Connect('window:<session>') from a player's window,
// NET_CheckNewConnections on the hosting page, messages both ways, a full server refused, a late host still found,
// and closing either end. Both ends run in this one process on real BroadcastChannels (the browser's, in Node or Deno).
import { svs } from '../src/engine/server/server.js';
import { Cbuf_Init, Cmd_Init, Cmd_ExecuteString } from '../src/engine/common/cmd.js';
import { sizebuf_t, SZ_Alloc, SZ_Clear, SZ_Write } from '../src/engine/common/common.js';
import { net_message } from '../src/engine/net/net.js';
import * as net from '../src/engine/net/net_main.js';
import * as netState from '../src/engine/net/net.js';
import { Window_Host, Window_HostSession, Window_NewSession, Window_SetHostGoneListener, WINDOW_SESSION_PATTERN } from '../src/engine/net/net_window.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const tick = ( ms = 30 ) => new Promise( resolve => setTimeout( resolve, ms ) );
// waits until `done()` holds, up to 5 s (BroadcastChannel delivery is asynchronous; a loaded machine is slower)
const until = async ( done, label ) => { for ( let t = 0; t < 500; t ++ ) { if ( done() ) return; await tick( 10 ); } throw new Error( 'timed out: ' + label ); };
const bytes = list => { const b = new sizebuf_t(); SZ_Alloc( b, 64 ); SZ_Clear( b ); SZ_Write( b, Uint8Array.from( list ), list.length ); return b; };
const read = sock => { const r = net.NET_GetMessage( sock ); return [ r, Array.from( net_message.data.subarray( 0, net_message.cursize ) ) ]; };
const accept = async () => { for ( let i = 0; i < 500; i ++ ) { const s = net.NET_CheckNewConnections(); if ( s ) return s; await tick( 10 ); } return null; };

// whatever a test leaves open is closed when it ends, passed or failed: an open channel keeps the process alive
const closeAll = () => { for ( let s = netState.net_activeSockets; s; ) { const next = s.next; net.NET_Close( s ); s = next; } Window_Host( null ); };
const test = ( name, fn ) => Deno.test( name, async () => { try { await fn(); } finally { closeAll(); } } );

Cbuf_Init(); Cmd_Init();
svs.maxclients = svs.maxclientslimit = 4;
net.NET_Init();
net.set_listening( true );

test( 'a player\'s window joins the hosting page; messages go both ways; unreliable runs keep the newest', async () => {

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
	await until( () => client.driverdata.queue.at( - 1 )?.b[ 0 ] === 21, 'the last message arrives' );
	const got = [];
	for ( let r; ( r = read( client ) )[ 0 ] > 0; ) got.push( r[ 0 ] + ':' + r[ 1 ].join( ',' ) );
	same( got.join( ' ' ), '1:1,2,3 2:12 1:4 2:21', 'reliable messages all arrive in order; of a run of unreliable ones, the newest' );
	same( read( client )[ 0 ], 0, 'then nothing is waiting' );

	same( net.NET_SendMessage( client, bytes( [ 7, 8 ] ) ), 1, 'the player sends back' );
	await until( () => server.driverdata.queue.length > 0, 'the reply arrives' );
	same( read( server ).join( '|' ), '1|7,8', 'the host reads the player\'s message' );

	net.NET_Close( client );
	await until( () => ! server.driverdata.open, 'the close arrives' );
	same( net.NET_GetMessage( server ), - 1, 'closing the player\'s window closes the host\'s end too' );
	net.NET_Close( server );
	Cmd_ExecuteString( 'windowhost -' );
	same( Window_HostSession(), null, 'windowhost - stops hosting' );

} );

test( 'a player\'s window that loads before its host keeps asking; a full server refuses it', async () => {

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

	let gone = 0;
	Window_SetHostGoneListener( () => gone ++ );
	net.NET_Close( server );
	await tick();
	same( net.NET_GetMessage( client ), - 1, 'closing the host\'s end closes the player\'s' );
	same( gone, 1, 'and the player\'s window is told its host has gone' );
	net.NET_Close( client );

	// the host ending the game: the player's end may close first (on reading svc_disconnect), and still hears it
	const late = net.NET_Connect( 'window:' + session );
	const server2 = await accept(), client2 = await late;
	net.NET_Close( client2 ); net.NET_Close( server2 );
	await tick();
	same( gone, 2, 'a player\'s end that has just closed still hears its host close' );
	// a player leaving on their own is not told the host went
	const third2 = net.NET_Connect( 'window:' + session );
	const server3 = await accept(), client3 = await third2;
	net.NET_Close( client3 ); await tick();
	same( net.NET_GetMessage( server3 ), - 1, 'the host sees the player leave' );
	net.NET_Close( server3 ); await tick();
	same( gone, 2, 'and the leaving window is not told the host went' );
	Window_SetHostGoneListener( null );
	Window_Host( null );

} );

test( 'addresses: invalid sessions, an unknown kind and a remote address are not window joins', () => {

	same( net.NET_Connect( 'window:not valid!' ), null, 'an invalid session id is refused at once' );
	same( Window_Host( 'bad id' ), false, 'and cannot be hosted' );
	same( net.NET_Connect( 'wts://example.invalid:4433?room=x' ), null, 'with no WebTransport, a remote address is not sent to the window driver' );

} );

test( 'a window that gives up before it is taken leaves no ghost player on the host', async () => {

	const session = Window_NewSession();
	check( Window_Host( session ), 'hosting' );
	const pending = net.NET_Connect( 'window:' + session );
	pending.catch( () => {} );
	await until( () => true, 'start' ); await tick( 50 ); // its join reaches the host, which has not run a frame yet
	net.NET_Close( netState.net_activeSockets ); // the window closes (its join socket is the only one open)
	let reason = null; try { await pending; } catch ( error ) { reason = error.message; }
	check( reason && /before the host answered/.test( reason ), 'the waiting join is given up: ' + reason );
	await tick( 50 );
	same( net.NET_CheckNewConnections(), null, 'the host takes nobody for the window that left' );

} );
