// A real loopback peer over TCP: two engine endpoints exchange the private session preamble (1019) through 16-bit
// framed messages, admit identity, run the signon messages (serverinfo, signonnum, setview), then transfer a native
// player datagram and a live entity update. This exercises transport framing, signon and admission, not the packaged
// LAN UI, audio or a four-peer trial.
import { createServer, Socket } from 'node:net';
import { Hexen2_CreateSession } from '../src/engine/common/hexen2_profile.js';
import { Hexen2_EncodeSessionHello, Hexen2_DecodeSessionHello, Hexen2_CompareSessionHello } from '../src/engine/common/hexen2_wire.js';
import { Hexen2_WritePrivateDatagram, Hexen2_ParsePrivateDatagram } from '../src/engine/common/hexen2_stream.js';
import { Hexen2_WriteEntityUpdate, Hexen2_ReadEntityUpdate } from '../src/engine/common/hexen2_entitywire.js';
import { Hexen2_WriteServerinfo, Hexen2_ReadServerinfo, Hexen2_WriteSignonNum, Hexen2_ReadSignonNum, Hexen2_WriteSetView, Hexen2_ReadSetView } from '../src/engine/common/hexen2_signon.js';
import { Hexen2_ReadStartEffect } from '../src/engine/common/hexen2_effectwire.js';
import { Hexen2_Frame, Hexen2_Unframe, HEXEN2_FRAME_MAX } from '../src/engine/common/hexen2_peer.js';
import { Hexen2_ClientState, Hexen2_ApplyClientMessage } from '../src/engine/client/hexen2_clientstate.js';
import { Hexen2_WriteStartEffect, CE } from '../src/engine/common/hexen2_effectwire.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'two peers admit each other, sign on and transfer player and entity updates', async () => {

	const session = Hexen2_CreateSession( { gameId: 'hexen2', contentRoot: 'owned-hexen2-base', gamecodeMode: 'installed', rules: 'classic' } );
	check( session.ok, session.reason );
	const hello = Hexen2_EncodeSessionHello( { session: session.session, classId: 'paladin', progsCrc: 38488 } );
	check( hello.ok, hello.reason );
	const hostHello = Hexen2_DecodeSessionHello( hello.bytes );
	check( hostHello.ok, hostHello.reason );
	const serverinfo = Hexen2_WriteServerinfo( { protocol: 1019, maxClients: 1, gameType: 0, levelName: 'demo1',
		models: [ 'maps/demo1.bsp', 'models/paladin.mdl' ], sounds: [ 'misc/bellring.wav' ] } );
	const signon = Hexen2_WriteSignonNum( 3 ), setview = Hexen2_WriteSetView( 1 );
	for ( const message of [ serverinfo, signon, setview ] ) check( message.ok, message.reason );

	const player = { v: { view_ofs: [ 0, 0, 50 ], weaponframe: 1, armorvalue: 2, health: 85, bluemana: 12, max_mana: 90 } };
	const datagram = Hexen2_WritePrivateDatagram( player, { time: 3.5, weaponModelIndex: 1, statsMask: 0x81n } );
	check( datagram.ok, datagram.reason );
	const update = Hexen2_WriteEntityUpdate( { entity: 42, modelIndex: 3, origin: [ 100, 200, 300 ], angles: [ 0, 90, 0 ] } );
	const effect = Hexen2_WriteStartEffect( { index: 2, type: CE.QUAKE, params: { origin: [ 1, 2, 3 ], radius: 400 } } );
	check( effect.ok, effect.reason );
	check( update.ok, update.reason );

	const received = { hello: null, datagram: null, update: null, serverinfo: null, signon: null, setview: null };
	const server = createServer( socket => {

		let buffer = new Uint8Array( 0 ), stage = 0;
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
					socket.write( Hexen2_Frame( serverinfo.bytes ).bytes );
					socket.write( Hexen2_Frame( signon.bytes ).bytes );
					socket.write( Hexen2_Frame( setview.bytes ).bytes );
					socket.write( Hexen2_Frame( effect.bytes ).bytes );
					stage = 1;

				} else if ( stage === 1 ) {

					received.datagram = Hexen2_ParsePrivateDatagram( frame );
					stage = 2;

				} else {

					received.update = Hexen2_ReadEntityUpdate( frame );
					stage = 3;
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
				stage = 1;

			} else if ( stage === 1 ) { received.serverinfo = Hexen2_ReadServerinfo( frame ); stage = 2; }
			else if ( stage === 2 ) { received.signon = Hexen2_ReadSignonNum( frame ); stage = 3; }
			else if ( stage === 3 ) { received.setview = Hexen2_ReadSetView( frame ); stage = 4; }
			else if ( stage === 4 ) { received.effect = Hexen2_ReadStartEffect( frame ); stage = 5; }

		}

	} );
	socket.write( Hexen2_Frame( hello.bytes ).bytes );
	socket.write( Hexen2_Frame( datagram.bytes ).bytes );
	socket.write( Hexen2_Frame( update.bytes ).bytes );
	await Promise.race( [ closed, new Promise( ( _, reject ) => setTimeout( () => reject( new Error( 'the peer did not close in time' ) ), 5000 ) ) ] );
	server.close();
	check( received.hello?.ok, 'the host admitted the peer identity: ' + received.hello?.reason );
	check( received.datagram?.ok, 'the host parsed the player datagram: ' + received.datagram?.reason );
	same( received.datagram.time, 3.5, 'server time over the peer' );
	same( received.datagram.stats.health, 85, 'health over the peer' );
	same( received.datagram.stats.bluemana, 12, 'blue mana over the peer' );
	check( received.update?.ok, 'the entity update arrived: ' + received.update?.reason );
	same( received.update.update.entity, 42, 'the entity number over the peer' );
	same( received.update.update.modelIndex, 3, 'the entity model over the peer' );
	same( Math.round( received.update.update.origin[ 0 ] ), 100, 'the entity origin over the peer' );
	check( received.serverinfo?.ok, 'the client parsed serverinfo: ' + received.serverinfo?.reason );
	same( received.serverinfo.info.levelName, 'demo1', 'the level name over signon' );
	same( received.serverinfo.info.models[ 0 ], 'maps/demo1.bsp', 'the first precached model' );
	same( received.signon?.number, 3, 'the signon stage' );
	same( received.setview?.entity, 1, 'the view entity' );
	check( received.effect?.ok, 'the client parsed the effect: ' + received.effect?.reason );
	same( received.effect.type, CE.QUAKE, 'the effect type over the peer' );
	same( received.effect.params.radius, 400, 'the effect radius over the peer' );

	// framing bounds
	check( Hexen2_Frame( new Uint8Array( 0 ) ).ok === false, 'empty frame refused' );
	check( Hexen2_Frame( new Uint8Array( HEXEN2_FRAME_MAX + 1 ) ).ok === false, 'oversized frame refused' );
	const partial = Hexen2_Unframe( Uint8Array.from( [ 5, 0, 1, 2 ] ) );
	check( partial.ok && partial.frames.length === 0 && partial.rest.length === 4, 'a partial frame waits for more bytes' );

} );
