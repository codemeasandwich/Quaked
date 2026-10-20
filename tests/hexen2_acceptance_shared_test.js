// End-to-end acceptance trace through the shared host: select the Hexen II profile, spawn demo1 with SV_SpawnServer and
// the installed gamecode, place a Paladin through the native client signon commands, run live physics, then feed a real
// server client-data frame and the Hexen inventory record through CL_ParseServerMessage. The parsed shared client state
// drives the same HUD model the status bar draws. Packaging, canvases and peer transport are separate trials.
import { existsSync } from 'node:fs';
import { GameProfile_Get } from '../src/engine/common/game_profile.js';
import { MOVETYPE_WALK, SOLID_SLIDEBOX, FL_ONGROUND, set_host_client } from '../src/engine/server/server.js';
import { SV_SetFrametime, SV_Physics, SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { SV_ClientThink, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { SV_Hexen2UpdateClass, SV_SendAllClientStats, SV_WriteClientdataToMessage } from '../src/engine/server/sv_main.js';
import { PR_GetString, pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { sizebuf_t, SZ_Alloc, SZ_Clear, MSG_WriteByte, MSG_WriteLong, MSG_WriteShort, COM_SetNetMessage } from '../src/engine/common/common.js';
import { PROTOCOL_LARGE, svc_serversequence, svc_setview } from '../src/engine/common/protocol.js';
import { STAT_HEALTH } from '../src/engine/common/quakedef.js';
import { cl } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { Hexen2_HudFromClient } from '../src/engine/client/hexen2_clienthud.js';
import { Hexen2_StatusBarOps } from '../src/engine/client/hexen2_statusbar.js';
import { hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

function parse( message ) {

	COM_SetNetMessage( message );
	CL_ParseServerMessage();

}

Deno.test( 'acceptance: profile -> spawn -> physics -> server frame -> client parser -> HUD on the shared host', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const profile = GameProfile_Get();
	same( profile.id, 'hexen2', 'the selected profile' );
	same( profile.family, 'hexen2', 'the selected game family' );
	same( profile.startMap, 'demo1', 'the profile start map' );
	same( profile.portals, false, 'the base profile is not Portal' );

	const session = spawnHexen2Map( 'demo1', 1 );
	const { sv, client, player } = session;
	same( sv.active, true, 'the shared server is live' );
	same( sv.name, 'demo1', 'demo1 is the map' );
	same( sv.protocol, PROTOCOL_LARGE, 'the one extended protocol' );
	same( PR_GetString( player.v.classname ), 'player', 'the client became a player' );
	same( player.v.playerclass, 1, 'the Paladin class' );
	same( PR_GetString( player.v.model ), 'models/paladin.mdl', 'the Paladin model' );
	check( player.v.health > 0 && player.v.max_mana > 0, 'native health and mana: ' + player.v.health + '/' + player.v.max_mana );

	// live world physics with the moving player
	SV_SetFrametime( 0.1 );
	SV_SetPlayer( player );
	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	player.v.movetype = MOVETYPE_WALK;
	player.v.solid = SOLID_SLIDEBOX;
	player.v.health = player.v.max_health = 1000;
	const before = [ player.v.origin[ 0 ], player.v.origin[ 1 ] ];
	const worldBefore = sv.edicts.map( ent => ent && ! ent.free ? ent.v.origin?.[ 0 ] ?? 0 : 0 );
	let error = null;
	try {

		for ( let frame = 0; frame < 5; frame ++ ) {

			SV_SetPlayer( player );
			client.cmd.forwardmove = 320;
			client.cmd.sidemove = 0;
			client.cmd.upmove = 0;
			client.cmd.viewangles = [ 0, 0, 0 ];
			player.v.v_angle = [ 0, 0, 0 ];
			SV_ClientThink();
			SV_Physics();
			pr_global_struct.time = sv.time;

		}

	} catch ( e ) { error = e; }
	check( error === null, 'five physics frames ran: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( Math.abs( player.v.origin[ 0 ] - before[ 0 ] ) + Math.abs( player.v.origin[ 1 ] - before[ 1 ] ) > 20, 'the player walked' );
	check( ( player.v.flags | 0 ) & FL_ONGROUND, 'the player is on the floor after physics' );
	let moved = 0;
	for ( let i = 1; i < sv.num_edicts; i ++ ) {

		const ent = sv.edicts[ i ];
		if ( ent && ! ent.free && Math.abs( ( ent.v.origin?.[ 0 ] ?? 0 ) - worldBefore[ i ] ) > 0.1 ) moved ++;

	}
	check( moved > 0, 'world entities moved during the frames: ' + moved );

	// A real server frame: view entity, class and client data, then the Hexen inventory record, parsed by the shared
	// client parser into the state the HUD reads.
	CL_ClearState();
	cl.protocol = PROTOCOL_LARGE;
	cl.maxclients = 1;
	cl.scores = [ { name: '', frags: 0, colors: 0, translations: new Uint8Array( 256 ) } ];
	const frame = new sizebuf_t();
	SZ_Alloc( frame, 8192 );
	SZ_Clear( frame );
	MSG_WriteByte( frame, svc_serversequence );
	MSG_WriteLong( frame, client.outgoing_sequence );
	MSG_WriteByte( frame, svc_setview );
	MSG_WriteShort( frame, player.index );
	SV_Hexen2UpdateClass( frame, 0, player.v.playerclass );
	SV_WriteClientdataToMessage( player, frame, client );
	parse( frame );
	same( cl.viewentity, player.index, 'the parsed view entity' );
	same( cl.stats[ STAT_HEALTH ], player.v.health, 'the parsed health stat' );

	client.message.cursize = 0;
	client.h2Stats = null;
	SV_SendAllClientStats( client, client.message );
	check( client.message.cursize > 0, 'the server sent the Hexen inventory record' );
	parse( client.message );
	same( cl.h2.stats.health, player.v.health, 'the parsed inventory health' );
	same( cl.h2.playerclass[ 0 ], 1, 'the parsed player class' );

	const hud = Hexen2_HudFromClient( cl );
	same( hud.playerClass, 1, 'the HUD class' );
	same( hud.health, player.v.health, 'the HUD health matches the server player' );
	same( hud.maxMana, player.v.max_mana, 'the HUD maximum mana' );
	const ops = Hexen2_StatusBarOps( hud );
	check( ops.length > 5, 'the native status bar is emitted: ' + ops.length );
	same( PR_LastRunError(), '', 'no program error during the acceptance trace' );

} );
