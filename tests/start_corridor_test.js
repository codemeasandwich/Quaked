// Shipped enhanced map pack through the public COM/server/seamless paths.
// Native BSP hull traces and player movement; no alternate collision geometry.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/vid.js';
import { Mod_Init, Mod_ClearAll } from '../src/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/progs/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { sv, svs, client_t } from '../src/engine/server/server.js';
import { SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { SV_Move, SV_LinkEdict, MOVE_NOMONSTERS } from '../src/engine/server/world.js';
import { SV_PushEntity, sv_gravity } from '../src/engine/server/sv_phys.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import { SZ_Alloc, sizebuf_t, MSG_WriteLong, MSG_WriteByte, MSG_WriteString, MSG_BeginReading, COM_SetNetMessage } from '../src/engine/common/common.js';
import { r_hdr } from '../src/gl_post.js';
import { skill } from '../src/engine/server/host.js';
import { R_AnimSetClassicPass, r_newer_portals } from '../src/r_anim.js';
import { R_ParseBsp } from '../src/r_levelgraph.js';
import { cls, cl, ca_dedicated, ca_connected } from '../src/engine/client/client.js';
import { CL_ParseServerInfo } from '../src/engine/client/cl_parse.js';
import { PROTOCOL_VERSION } from '../src/engine/common/protocol.js';
import { NET_Init, NET_Close } from '../src/engine/net/net_main.js';
import { Loop_Connect, Loop_CheckNewConnections } from '../src/engine/net/net_loop.js';
import { qsocket_t } from '../src/engine/net/net.js';
import { R_Init } from '../src/gl_rmain.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} !== ${b}` );
const near = ( a, b, label ) => check( Math.abs( a - b ) < .001, `${label}: ${a} != ${b}` );
const hash = data => createHash( 'sha256' ).update( data ).digest( 'hex' );
const text = index => progs.PR_GetString( index );
const nativeBytes = readFileSync( new URL( '../pak0.pak', import.meta.url ) ), nativeHash = hash( nativeBytes );
const enhancedBytes = readFileSync( new URL( '../newer/maps.pak', import.meta.url ) ), enhancedHash = hash( enhancedBytes );
const loaded = bytes => bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', loaded( nativeBytes ) ) );
pak.COM_SetNewerActive( false ); const originalStart = pak.COM_FindFile( 'maps/start.bsp' ).data.slice();
pak.COM_SetNewerMapsPack( pak.COM_LoadPackFile( 'newer/maps.pak', loaded( enhancedBytes ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); Cbuf_Init();
for ( const value of [ r_hdr, skill, sv_gravity, travel.sv_seamless ] ) if ( ! vars.Cvar_FindVar( value.name ) ) vars.Cvar_RegisterVariable( value );

function spawn( name, enhanced = true, reset = true ) {

	if ( reset ) travel.SV_SeamlessReset(); R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', enhanced ? 1 : 0 ); vars.Cvar_SetValue( 'skill', 1 ); vars.Cvar_SetValue( 'sv_seamless', 1 );
	if ( reset ) { svs.maxclients = 1; svs.clients = [ new client_t() ]; SZ_Alloc( svs.clients[ 0 ].message, 8192 ); }
	sv.active = false; SV_SpawnServer( name ); check( sv.active && sv.name === name, 'real native server starts ' + name );
	return svs.clients[ 0 ].edict;

}
function nativePlayer( player ) {

	progs.pr_global_struct.self = progs.EDICT_TO_PROG( player ); PR_ExecuteProgram( progs.pr_global_struct.SetNewParms ); PR_ExecuteProgram( progs.pr_global_struct.ClientConnect ); PR_ExecuteProgram( progs.pr_global_struct.PutClientInServer );
	check( text( player.v.classname ) === 'player' && player.v.health > 0, 'shipped QC initializes real player' ); return player;

}
function trace( player, from, to ) { return SV_Move( from, player.v.mins, player.v.maxs, to, MOVE_NOMONSTERS, player ); }

Deno.test( 'public enhanced map registration selects authored START only in Newer and refreshes metadata across mode switches', () => {

	travel.SV_SeamlessReset(); pak.COM_SetNewerMapsEnabled( true );
	for ( const enhanced of [ false, true, false, true ] ) {

		pak.COM_SetNewerActive( enhanced ); const source = pak.COM_FindFile( 'maps/start.bsp' ), metadata = R_ParseBsp( source.data ), links = travel.SV_LevelLinks( 'start' ), exit = links.exits.find( e => e.map === 'e1m1' );
		check( exit, 'E1 exit retained in both native map variants' );
		if ( enhanced ) { same( metadata.entities[ 0 ]._newer_start_corridor, '1', 'enhanced source marker' ); same( exit.oneWay, true, 'enhanced link retains authored one-way intent' ); same( exit.kind, 'plane', 'enhanced source is walk-through slab' ); check( hash( source.data ) !== hash( originalStart ), 'enhanced source differs from original asset' ); }
		else { same( hash( source.data ), hash( originalStart ), 'Classic gets exact original BSP bytes' ); check( ! exit.oneWay, 'cached enhanced one-way metadata cannot leak into Classic' ); check( metadata.entities[ 0 ]._newer_start_corridor === undefined, 'Classic world marker remains native' ); }

	}
	const before = pak.COM_FindFile( 'maps/start.bsp' ); let rejected = false;
	try { pak.COM_SetNewerMapsPack( { files: [ { name: 'progs.dat', filepos: 0, filelen: 0 } ], data: new ArrayBuffer( 0 ) } ); } catch { rejected = true; }
	check( rejected, 'maps-only pack API rejects replacement game code' ); same( pak.COM_FindFile( 'maps/start.bsp' ).data, before.data, 'failed registration preserves prior complete map set' );
	pak.COM_SetNewerMapsEnabled( true ); pak.COM_SetNewerActive( false );

} );

Deno.test( 'multiplayer and disabled seamless policy keep original START geometry without disabling independent enhanced art', () => {

	const originalPortals = r_newer_portals.value, originalState = cls.state, art = new Uint8Array( [ 17, 83, 149, 255 ] );
	pak.COM_SetNewerPack( { data: art.buffer, files: [ { name: 'newer/map-gate-art-control.bin', filepos: 0, filelen: art.length } ] } );
	try {

		for ( const scenario of [ { label: 'multiplayer', clients: 2, seamless: 1, portals: 1 }, { label: 'dedicated server', clients: 1, seamless: 1, portals: 1, dedicated: true }, { label: 'seamless disabled', clients: 1, seamless: 0, portals: 1 }, { label: 'camera portal policy disabled', clients: 1, seamless: 1, portals: 0 } ] ) {

			travel.SV_SeamlessReset(); R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'sv_seamless', scenario.seamless ); r_newer_portals.value = scenario.portals;
			cls.state = scenario.dedicated ? ca_dedicated : originalState;
			svs.maxclients = scenario.clients; svs.clients = Array.from( { length: scenario.clients }, () => { const client = new client_t(); SZ_Alloc( client.message, 8192 ); return client; } );
			pak.COM_SetNewerActive( true ); pak.COM_SetNewerMapsEnabled( true ); // deliberately stale previous supported mode
			sv.active = false; SV_SpawnServer( 'start' );
			same( hash( pak.COM_FindFile( 'maps/start.bsp' ).data ), hash( originalStart ), scenario.label + ' selects exact original packed geometry' );
			check( ! sv.worldmodel.entities.includes( '_newer_start_corridor' ), scenario.label + ' actually loads original server world' );
			check( ! travel.SV_SeamlessCrossings().some( crossing => crossing.map === 'e1m1' && crossing.exit?.oneWay ), scenario.label + ' cannot activate unsupported one-way corridor' );
			const wall = SV_Move( [ -64, 1540, 104 ], [ -16, -16, -24 ], [ 16, 16, 32 ], [ -64, 1408, 104 ], MOVE_NOMONSTERS, svs.clients[ 0 ].edict ); check( wall.startsolid || wall.fraction < 1, scenario.label + ' retains actual native machine/back-wall collision' );
			same( Array.from( pak.COM_FindFile( 'newer/map-gate-art-control.bin' ).data ).join(), Array.from( art ).join(), 'map opt-out leaves independent Newer art lookup enabled' );

		}
		cls.state = originalState; r_newer_portals.value = 1; spawn( 'start', true ); check( sv.worldmodel.entities.includes( '_newer_start_corridor' ), 'returning to supported single-player mode restores authored map selection' );

	} finally { cls.state = originalState; r_newer_portals.value = originalPortals; vars.Cvar_SetValue( 'sv_seamless', 1 ); svs.maxclients = 1; pak.COM_SetNewerMapsEnabled( true ); pak.COM_SetNewerPack( null ); }

} );

Deno.test( 'actual server map load synchronizes the map variant before model lookup on Classic to Newer transitions', () => {

	for ( const enhanced of [ false, true, false, true ] ) {

		// Deliberately stale previous renderer mode: server command must choose
		// correct bytes before the next client/render frame has occurred.
		pak.COM_SetNewerActive( ! enhanced ); spawn( 'start', enhanced );
		const source = R_ParseBsp( pak.COM_FindFile( 'maps/start.bsp' ).data );
		check( ( source.entities[ 0 ]._newer_start_corridor === '1' ) === enhanced, 'actual server command selects mode synchronously' );
		check( sv.worldmodel.entities.includes( '"_newer_start_corridor" "1"' ) === enhanced, 'actual loaded render/collision model matches selected BSP' );
		const corridor = travel.SV_SeamlessCrossings().find( crossing => crossing.map === 'e1m1' );
		if ( enhanced ) check( corridor?.exit.oneWay && corridor.transform.through[ 1 ] === -1, 'actual enhanced server registers southward one-way crossing' );
		else check( ! corridor, 'Classic server retains native changelevel trigger behavior' );

	}

} );

Deno.test( 'authored passage clears the real player hull while side frame, bevel and sealed back cap retain collision', () => {

	const player = nativePlayer( spawn( 'start' ) ), rows = [];
	for ( const x of [ -120, -112, -96, -64, -32, -16 ] ) {

		const result = trace( player, [ x, 1540, 104 ], [ x, 1408, 104 ] ); check( ! result.startsolid && ! result.allsolid && result.fraction === 1, 'native 32x56 player hull fits corridor at x=' + x ); rows.push( { x, fraction: result.fraction, end: Array.from( result.endpos ) } );

	}
	for ( const x of [ -128, 0 ] ) check( trace( player, [ x, 1540, 104 ], [ x, 1408, 104 ] ).fraction < 1, 'real side frame blocks oversized lateral approach' );
	check( trace( player, [ -64, 1540, 136 ], [ -64, 1408, 136 ] ).fraction === 1, 'upper central clearance stays open' );
	check( trace( player, [ -112, 1540, 136 ], [ -112, 1408, 136 ] ).fraction < 1, 'actual beveled upper corner blocks a hull that cannot fit' );
	const cap = trace( player, [ -64, 1420, 104 ], [ -64, 1350, 104 ] ); check( ! cap.startsolid && cap.fraction < 1, 'stub has a real solid back cap beyond seamless threshold' );
	console.log( 'START_CORRIDOR_NATIVE_HULLS ' + JSON.stringify( { clear: rows, backCap: Array.from( cap.endpos ) } ) );

} );

Deno.test( 'native southward movement transfers view and momentum into E1M1 and leaves a solid wall with no reverse crossing', () => {

	const player = nativePlayer( spawn( 'start' ) ), crossing = travel.SV_SeamlessCrossings().find( c => c.map === 'e1m1' ); check( crossing, 'actual E1 corridor crossing registered' );
	player.v.origin = [ -64, 1540, 104 ]; player.v.velocity = [ 19, -150, 7 ]; player.v.v_angle = [ 12, 263, 0 ]; player.v.angles = [ -4, 263, 0 ]; SV_LinkEdict( player, false ); travel.SV_SeamlessFrame();
	const originalSpeed = Math.hypot( ...player.v.velocity ); let moves = 0;
	for ( ; moves < 40 && ! travel.SV_SeamlessPending(); moves ++ ) {

		const before = Array.from( player.v.origin ), moved = SV_PushEntity( player, [ 0, -4, 0 ] ); sv.time += .1;
		check( ! moved.startsolid && moved.fraction === 1, 'normal hull movement crosses cleared machine area and source aperture' ); near( player.v.origin[ 1 ], before[ 1 ] - 4, 'no teleporter position jump before crossing' );
		travel.SV_SeamlessFrame(); if ( player.v.origin[ 1 ] >= crossing.transform.center[ 1 ] ) same( travel.SV_SeamlessPending(), null, 'crossing never queues early on near side' );

	}
	const arrival = travel.SV_SeamlessPending(); check( arrival?.map === 'e1m1' && moves > 20 && moves < 40, 'actual movement queues destination only after threshold' ); same( arrival.from, null, 'one-way source creates no return-crossing request' ); same( arrival.pit, false, 'walk-through crossing does not take teleporter/pit path' );
	near( Math.hypot( ...arrival.velocity ), originalSpeed, 'rigid level transform preserves speed' ); near( arrival.velocity[ 0 ], -19, 'lateral momentum rotates with passage' ); near( arrival.velocity[ 1 ], 150, 'forward momentum continues into destination' ); near( arrival.velocity[ 2 ], 7, 'vertical momentum retained' ); near( arrival.angles[ 0 ], 12, 'view pitch retained' ); near( ( arrival.angles[ 1 ] % 360 + 360 ) % 360, 83, 'relative view yaw retained through 180degree transform' );
	const expectedOrigin = arrival.origin.slice(), expectedVelocity = arrival.velocity.slice(), expectedAngles = arrival.angles.slice();
	const destination = nativePlayer( spawn( 'e1m1', true, false ) ); travel.SV_SeamlessPlacePlayer( destination );
	expectedOrigin.forEach( ( value, i ) => near( destination.v.origin[ i ], value, 'arrival hull fits without relocation/fallback ' + i ) ); expectedVelocity.forEach( ( value, i ) => near( destination.v.velocity[ i ], value, 'actual native destination velocity ' + i ) ); expectedAngles.forEach( ( value, i ) => near( destination.v.v_angle[ i ], value, 'actual destination view ' + i ) );
	check( ! trace( destination, destination.v.origin, destination.v.origin ).startsolid, 'actual destination player hull is clear' ); check( ! travel.SV_SeamlessCrossings().some( c => c.map === 'start' || c.back ), 'E1M1 exposes no synthetic return to START' );
	const backwards = Array.from( destination.v.origin ); backwards[ 1 ] -= 160; const wall = trace( destination, destination.v.origin, backwards ); check( ! wall.startsolid && wall.fraction < 1, 'native wall physically blocks walking back behind arrival' );
	console.log( 'START_CORRIDOR_NATIVE_ARRIVAL ' + JSON.stringify( { moves, sourcePlane: crossing.transform.center, origin: Array.from( destination.v.origin ), velocity: Array.from( destination.v.velocity ), view: Array.from( destination.v.v_angle ), wallBehind: Array.from( wall.endpos ) } ) );
	same( hash( readFileSync( new URL( '../pak0.pak', import.meta.url ) ) ), nativeHash, 'original native pack file is byte-identical after all loads and travel' ); same( hash( readFileSync( new URL( '../newer/maps.pak', import.meta.url ) ) ), enhancedHash, 'compiled enhanced pack unchanged by runtime travel' );
	travel.SV_SeamlessReset(); Cbuf_Init();

} );

Deno.test( 'actual serverinfo packets require a live paired local socket before selecting enhanced START geometry', () => {

	const saved = { state: cls.state, socket: cls.netcon, demo: cls.demoplayback, portals: r_newer_portals.value };
	travel.SV_SeamlessReset(); vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'sv_seamless', 1 ); r_newer_portals.value = 1; R_AnimSetClassicPass( false );
	spawn( 'start', true ); cls.state = ca_connected; svs.maxclientslimit = 1;
	NET_Init(); SZ_Alloc( cls.message, 8192 ); R_Init();
	const clientSocket = Loop_Connect( 'local' ), serverSocket = Loop_CheckNewConnections();
	check( clientSocket && serverSocket && clientSocket.driverdata === serverSocket && serverSocket.driverdata === clientSocket, 'real loopback driver creates paired native endpoints' );
	const rows = [];
	function packet( label, socket, expected, { demo = false, active = true, clients = 1, peer = serverSocket } = {} ) {

		cls.netcon = socket; cls.demoplayback = demo; sv.active = active; svs.maxclients = 1; svs.clients[ 0 ].netconnection = peer;
		pak.COM_SetNewerActive( true ); pak.COM_SetNewerMapsEnabled( true ); // stale state from preceding enhanced local game
		Mod_ClearAll(); // force the public parser to read the selected packed BSP, not a previously loaded model
		const message = new sizebuf_t(); SZ_Alloc( message, 256 ); MSG_WriteLong( message, PROTOCOL_VERSION ); MSG_WriteByte( message, clients ); MSG_WriteByte( message, 0 ); MSG_WriteString( message, label ); MSG_WriteString( message, 'maps/start.bsp' ); MSG_WriteString( message, '' ); MSG_WriteString( message, '' ); COM_SetNetMessage( message ); MSG_BeginReading();
		CL_ParseServerInfo();
		check( cl.worldmodel?.name === 'maps/start.bsp', label + ' actually completes native world-model load' );
		const enhanced = cl.worldmodel.entities.includes( '_newer_start_corridor' ); same( enhanced, expected, label + ' actual client world selection' );
		same( hash( pak.COM_FindFile( 'maps/start.bsp' ).data ) === hash( originalStart ), ! expected, label + ' selected BSP bytes agree with client world' );
		rows.push( { label, enhanced, socketDisconnected: socket?.disconnected ?? null } );

	}
	try {

		packet( 'paired local positive control', clientSocket, true );
		packet( 'remote packet despite active local server', { driver: 1, driverdata: serverSocket, disconnected: false }, false );
		packet( 'demo despite paired local socket', clientSocket, false, { demo: true } );
		packet( 'no connection', null, false );
		packet( 'default qsocket with null peer', new qsocket_t(), false, { peer: null } );
		packet( 'loopback socket with unrelated server peer', clientSocket, false, { peer: new qsocket_t() } );
		packet( 'inactive local server', clientSocket, false, { active: false } );
		packet( 'multiplayer serverinfo', clientSocket, false, { clients: 2 } );
		vars.Cvar_SetValue( 'sv_seamless', 0 ); packet( 'policy changed after enhanced server spawn', clientSocket, true ); vars.Cvar_SetValue( 'sv_seamless', 1 );
		packet( 'paired local restored', clientSocket, true );
		NET_Close( clientSocket ); check( clientSocket.disconnected, 'native NET_Close marks client socket disconnected' );
		packet( 'closed native socket retained by stale caller', clientSocket, false );
		spawn( 'start', false ); vars.Cvar_SetValue( 'r_hdr', 1 );
		// A fresh actual Classic server choice stays authoritative when the UI toggles later.
		const freshClient = Loop_Connect( 'local' ), freshServer = Loop_CheckNewConnections();
		packet( 'Classic server spawn followed by Newer toggle', freshClient, false, { peer: freshServer } ); NET_Close( freshClient ); NET_Close( freshServer );
		console.log( 'START_CLIENT_PACKET_BOUNDARIES ' + JSON.stringify( rows ) );

	} finally {

		NET_Close( clientSocket ); NET_Close( serverSocket ); cls.state = saved.state; cls.netcon = saved.socket; cls.demoplayback = saved.demo; r_newer_portals.value = saved.portals; sv.active = false; svs.maxclients = 1; pak.COM_SetNewerMapsEnabled( false ); travel.SV_SeamlessReset(); Cbuf_Init();

	}

} );
