// A real loopback peer over TCP: two engine endpoints exchange the private session preamble (1019) through 16-bit
// framed messages, compare identity and then send a native player datagram that the host parses. This exercises the
// transport framing and admission path, not the packaged LAN UI or four-peer trial.
import { createServer, Socket } from 'node:net';
import { Hexen2_CreateSession } from '../src/engine/common/hexen2_profile.js';
import { Hexen2_EncodeSessionHello, Hexen2_DecodeSessionHello, Hexen2_CompareSessionHello } from '../src/engine/common/hexen2_wire.js';
import { Hexen2_WritePrivateDatagram, Hexen2_ParsePrivateDatagram } from '../src/engine/common/hexen2_stream.js';
import { Hexen2_Frame, Hexen2_Unframe, HEXEN2_FRAME_MAX } from '../src/engine/common/hexen2_peer.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'two peers admit each other over a framed TCP session and transfer a player datagram', async () => {

	const session = Hexen2_CreateSession( { gameId: 'hexen2', contentRoot: 'owned-hexen2-base', gamecodeMode: 'installed', rules: 'classic' } );
	check( session.ok, session.reason );
	const hello = Hexen2_EncodeSessionHello( { session: session.session, classId: 'paladin', progsCrc: 38488 } );
	check( hello.ok, hello.reason );
	const hostHello = Hexen2_DecodeSessionHello( hello.bytes );
	check( hostHello.ok, hostHello.reason );
	const player = { v: { view_ofs: [ 0, 0, 50 ], weaponframe: 1, armorvalue: 2, health: 85, bluemana: 12, max_mana: 90 } };
	const datagram = Hexen2_WritePrivateDatagram( player, { time: 3.5, weaponModelIndex: 1, statsMask: 0x81n } );
	check( datagram.ok, datagram.reason );

	const received = { hello: null, datagram: null };
	const server = createServer( socket => {

		let buffer = new Uint8Array( 0 );
		let stage = 0;
		socket.on( 'data', chunk => {

			buffer = Uint8Array.from( [ ...buffer, ...chunk ] );
			const split = Hexen2_Unframe( buffer );
			check( split.ok, split.reason );
			buffer = split.rest;
			for ( const frame of split.frames ) {

				if ( stage === 0 ) {

					const peer = Hexen2_DecodeSessionHello( frame );
					check( peer.ok, peer.reason );
					received.hello = Hexen2_CompareSessionHello( hostHello.hello, peer.hello );
					socket.write( Hexen2_Frame( hello.bytes ).bytes );
					stage = 1;

				} else {

					received.datagram = Hexen2_ParsePrivateDatagram( frame );
					stage = 2;
					socket.end();

				}

			}

		} );

	} );
	await new Promise( resolve => server.listen( 0, '127.0.0.1', resolve ) );
	const socket = await new Promise( ( resolve, reject ) => { const s = new Socket(); s.connect( server.address().port, '127.0.0.1', () => resolve( s ) ); s.on( 'error', reject ); } );
	let buffer = new Uint8Array( 0 ), stage = 0;
	const closed = new Promise( resolve => socket.on( 'close', resolve ) );
	socket.on( 'data', chunk => {

		buffer = Uint8Array.from( [ ...buffer, ...chunk ] );
		const split = Hexen2_Unframe( buffer );
		check( split.ok, split.reason );
		buffer = split.rest;
		for ( const frame of split.frames ) {

			if ( stage === 0 ) {

				const peer = Hexen2_DecodeSessionHello( frame );
				check( peer.ok, peer.reason );
				check( Hexen2_CompareSessionHello( hostHello.hello, peer.hello ).ok, 'the server identity matches' );
				socket.write( Hexen2_Frame( datagram.bytes ).bytes );
				stage = 1;

			}

		}

	} );
	socket.write( Hexen2_Frame( hello.bytes ).bytes );
	await Promise.race( [ closed, new Promise( ( _, reject ) => setTimeout( () => reject( new Error( 'the peer did not close in time' ) ), 5000 ) ) ] );
	server.close();
	check( received.hello?.ok, 'the host admitted the peer identity: ' + received.hello?.reason );
	check( received.datagram?.ok, 'the host parsed the player datagram: ' + received.datagram?.reason );
	same( received.datagram.time, 3.5, 'server time over the peer' );
	same( received.datagram.stats.health, 85, 'health over the peer' );
	same( received.datagram.stats.bluemana, 12, 'blue mana over the peer' );

	// framing bounds
	check( Hexen2_Frame( new Uint8Array( 0 ) ).ok === false, 'empty frame refused' );
	check( Hexen2_Frame( new Uint8Array( HEXEN2_FRAME_MAX + 1 ) ).ok === false, 'oversized frame refused' );
	const partial = Hexen2_Unframe( Uint8Array.from( [ 5, 0, 1, 2 ] ) );
	check( partial.ok && partial.frames.length === 0 && partial.rest.length === 4, 'a partial frame waits for more bytes' );

} );
