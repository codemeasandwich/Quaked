// Four clients on one host over real TCP loopback: each performs the private handshake, receives the signon (serverinfo
// + its own setview) and its own player datagram, proving four-way per-client state rather than a shared stream. This is
// still loopback: the four physical-peer trial and the packaged LAN UI remain separate acceptance work.
import { createServer, Socket } from 'node:net';
import { Hexen2_CreateSession } from '../src/engine/common/hexen2_profile.js';
import { Hexen2_EncodeSessionHello, Hexen2_DecodeSessionHello, Hexen2_CompareSessionHello } from '../src/engine/common/hexen2_wire.js';
import { Hexen2_WritePrivateDatagram, Hexen2_ParsePrivateDatagram } from '../src/engine/common/hexen2_stream.js';
import { Hexen2_WriteServerinfo, Hexen2_ReadServerinfo, Hexen2_WriteSetView, Hexen2_ReadSetView } from '../src/engine/common/hexen2_signon.js';
import { Hexen2_Frame, Hexen2_Unframe } from '../src/engine/common/hexen2_peer.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'four peers each get their own signon view and player datagram', async () => {

	const session = Hexen2_CreateSession( { gameId: 'hexen2', contentRoot: 'owned-hexen2-base', gamecodeMode: 'installed', rules: 'classic' } );
	check( session.ok, session.reason );
	const hello = Hexen2_EncodeSessionHello( { session: session.session, classId: 'paladin', progsCrc: 38488 } );
	check( hello.ok, hello.reason );
	const serverinfo = Hexen2_WriteServerinfo( { protocol: 1019, maxClients: 4, gameType: 0, levelName: 'demo1',
		models: [ 'maps/demo1.bsp', 'models/paladin.mdl', 'models/crusader.mdl' ], sounds: [ 'misc/bellring.wav' ] } );
	const players = [
		{ v: { view_ofs: [ 0, 0, 50 ], armorvalue: 1, health: 85, bluemana: 40, max_mana: 90 } },
		{ v: { view_ofs: [ 0, 0, 46 ], armorvalue: 2, health: 70, bluemana: 20, max_mana: 80 } },
		{ v: { view_ofs: [ 0, 0, 44 ], armorvalue: 3, health: 60, bluemana: 10, max_mana: 70 } },
		{ v: { view_ofs: [ 0, 0, 42 ], armorvalue: 4, health: 55, bluemana: 5, max_mana: 60 } }
	];
	const datagrams = players.map( player => Hexen2_WritePrivateDatagram( player, { time: 5, statsMask: 0x81n } ) );
	for ( const d of datagrams ) check( d.ok, d.reason );
	const results = [ null, null, null, null ];
	let closed = 0;
	let resolveAll;
	const allClosed = new Promise( resolve => { resolveAll = resolve; } );
	const server = createServer( socket => {

		let buffer = new Uint8Array( 0 ), slot = -1, helloSent = false;
		socket.on( 'close', () => { closed ++; if ( closed === 4 ) resolveAll(); } );
		socket.on( 'data', chunk => {

			buffer = Uint8Array.from( [ ...buffer, ...chunk ] );
			const split = Hexen2_Unframe( buffer );
			check( split.ok, split.reason );
			buffer = split.rest;
			for ( const frame of split.frames ) {

				const peer = Hexen2_DecodeSessionHello( frame );
				check( peer.ok, peer.reason );
				check( Hexen2_CompareSessionHello( Hexen2_DecodeSessionHello( hello.bytes ).hello, peer.hello ).ok, 'identity' );
				if ( helloSent ) continue;
				helloSent = true;
				slot = results.findIndex( r => r === null );
				results[ slot ] = { slot };
				socket.write( Hexen2_Frame( hello.bytes ).bytes );
				socket.write( Hexen2_Frame( serverinfo.bytes ).bytes );
				socket.write( Hexen2_Frame( Hexen2_WriteSetView( slot + 1 ).bytes ).bytes );
				socket.write( Hexen2_Frame( datagrams[ slot ].bytes ).bytes );

			}

		} );

	} );
	await new Promise( resolve => server.listen( 0, '127.0.0.1', resolve ) );
	const clients = [];
	const parsed = [ {}, {}, {}, {} ];
	for ( let i = 0; i < 4; i ++ ) {

		const socket = await new Promise( ( resolve, reject ) => { const s = new Socket(); s.connect( server.address().port, '127.0.0.1', () => resolve( s ) ); s.on( 'error', reject ); } );
		clients.push( socket );
		let stage = 0, buffer = new Uint8Array( 0 );
		socket.on( 'data', chunk => {

			buffer = Uint8Array.from( [ ...buffer, ...chunk ] );
			const split = Hexen2_Unframe( buffer );
			check( split.ok, split.reason );
			buffer = split.rest;
			for ( const frame of split.frames ) {

				if ( stage === 0 ) { const p = Hexen2_DecodeSessionHello( frame ); check( p.ok, p.reason ); stage = 1; }
				else if ( stage === 1 ) { parsed[ i ].serverinfo = Hexen2_ReadServerinfo( frame ); stage = 2; }
				else if ( stage === 2 ) { parsed[ i ].setview = Hexen2_ReadSetView( frame ); stage = 3; }
				else if ( stage === 3 ) { parsed[ i ].datagram = Hexen2_ParsePrivateDatagram( frame ); stage = 4; socket.end(); }

			}

		} );
		socket.write( Hexen2_Frame( hello.bytes ).bytes );

	}
	await Promise.race( [ allClosed, new Promise( ( _, reject ) => setTimeout( () => reject( new Error( 'the peers did not finish in time' ) ), 5000 ) ) ] );
	server.close();
	for ( let i = 0; i < 4; i ++ ) {

		check( parsed[ i ].serverinfo?.ok, `client ${i} serverinfo: ` + parsed[ i ].serverinfo?.reason );
		same( parsed[ i ].serverinfo.info.maxClients, 4, `client ${i} max clients` );
		same( parsed[ i ].setview?.entity, i + 1, `client ${i} view entity` );
		check( parsed[ i ].datagram?.ok, `client ${i} datagram: ` + parsed[ i ].datagram?.reason );

	}
	for ( let i = 0; i < 4; i ++ ) {

		same( parsed[ i ].datagram.stats.health, players[ i ].v.health, `client ${i} health` );
		same( parsed[ i ].datagram.stats.bluemana, players[ i ].v.bluemana, `client ${i} mana` );

	}
	const heights = parsed.map( p => p.datagram.clientdata.viewheight );
	check( new Set( heights ).size === 4, 'the four view heights differ per client: ' + heights.join( ',' ) );

} );
