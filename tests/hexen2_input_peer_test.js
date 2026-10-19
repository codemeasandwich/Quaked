// The client's movement command over a real TCP peer: the private extension input message is framed, the host applies
// it through the same SV_User_SetCommand fields a local client fills, runs SV_ClientThink/SV_Physics_Client, and the
// Paladin moves. This closes the input transport loop (local input already uses the same engine path).
import { createServer, Socket } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetPlayer, SV_SetFrametime, SV_Physics_Client } from '../src/engine/server/sv_phys.js';
import { sv as serverSv, SIGNON_SIZE, MOVETYPE_WALK, SOLID_SLIDEBOX } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_CreateSession } from '../src/engine/common/hexen2_profile.js';
import { Hexen2_EncodeSessionHello, Hexen2_DecodeSessionHello, Hexen2_CompareSessionHello } from '../src/engine/common/hexen2_wire.js';
import { Hexen2_WriteServerinfo, Hexen2_WriteSignonNum, Hexen2_WriteSetView } from '../src/engine/common/hexen2_signon.js';
import { Hexen2_WriteInput, Hexen2_ReadInput, INPUT_BUTTONS } from '../src/engine/common/hexen2_inputwire.js';
import { Hexen2_Frame, Hexen2_Unframe } from '../src/engine/common/hexen2_peer.js';
import { SV_ClientThink, SV_User_SetCommand, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a client input command moves the Paladin over the peer', async () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const client = { name: 'input', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	client.message = sv.signon;
	const svs = { maxclients: 1, clients: [ client ], active: true };
	const entry = { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true };
	const mounted = Hexen2_MountLevel( {
		entry, classId: 'paladin', client, sv, svs,
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	const player = mounted.player;
	sv.active = true; SV_SetFrametime( 0.1 );
	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	SV_SetPlayer( player );
	player.v.angles = [ 0, 0, 0 ]; player.v.v_angle = [ 0, 0, 0 ]; player.v.velocity = [ 0, 0, 0 ];
	player.v.movetype = MOVETYPE_WALK; player.v.solid = SOLID_SLIDEBOX;
	const before = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];

	const session = Hexen2_CreateSession( { gameId: 'hexen2', contentRoot: 'owned-hexen2-base', gamecodeMode: 'installed', rules: 'classic' } ).session;
	const hello = Hexen2_EncodeSessionHello( { session, classId: 'paladin', progsCrc: 38488 } ).bytes;
	const info = Hexen2_WriteServerinfo( { protocol: 1019, maxClients: 1, gameType: 0, levelName: 'demo1', models: [ 'maps/demo1.bsp' ], sounds: [] } ).bytes;
	const signon = Hexen2_WriteSignonNum( 3 ).bytes, setview = Hexen2_WriteSetView( 1 ).bytes;
	let movedByClient = null;
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
					check( Hexen2_CompareSessionHello( Hexen2_DecodeSessionHello( hello ).hello, peer.hello ).ok, 'identity' );
					socket.write( Hexen2_Frame( hello ).bytes );
					socket.write( Hexen2_Frame( info ).bytes );
					socket.write( Hexen2_Frame( signon ).bytes );
					socket.write( Hexen2_Frame( setview ).bytes );
					stage = 1;

				} else {

					const input = Hexen2_ReadInput( frame );
					check( input.ok, input.reason );
					same( input.input.forwardmove, 320, 'the forwarded move' );
					same( input.input.buttons & INPUT_BUTTONS.ATTACK, 0, 'no attack pressed' );
					SV_User_SetCommand( { forwardmove: input.input.forwardmove, sidemove: input.input.sidemove,
						upmove: input.input.upmove, viewangles: input.input.viewangles } );
					SV_ClientThink();
					SV_Physics_Client( player, 1 );
					movedByClient = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
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

			if ( stage === 0 ) { check( Hexen2_DecodeSessionHello( frame ).ok, 'server hello' ); stage = 1; }
			else if ( stage === 1 ) { stage = 2; }
			else if ( stage === 2 ) { stage = 3; }
			else if ( stage === 3 ) {
				stage = 4;
				const input = Hexen2_WriteInput( { viewangles: [ 0, 0, 0 ], forwardmove: 320, buttons: 0 } );
				check( input.ok, input.reason );
				socket.write( Hexen2_Frame( input.bytes ).bytes );
			}

		}

	} );
	socket.write( Hexen2_Frame( hello ).bytes );
	await Promise.race( [ closed, new Promise( ( _, reject ) => setTimeout( () => reject( new Error( 'the peer did not close in time' ) ), 5000 ) ) ] );
	server.close();
	check( movedByClient !== null, 'the host applied the client input' );
	check( movedByClient[ 0 ] - before[ 0 ] > 20, 'the Paladin advanced north from the client command: ' + ( movedByClient[ 0 ] - before[ 0 ] ) );
	check( Math.abs( movedByClient[ 1 ] - before[ 1 ] ) < 2, 'no sideways drift' );
	check( Math.abs( movedByClient[ 2 ] - before[ 2 ] ) < 2, 'the Paladin stayed on the floor' );

} );
