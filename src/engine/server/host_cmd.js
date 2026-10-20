/**
 * @module engine/server/host_cmd
 *
 * Host console commands (WinQuake host_cmd.c): map, changelevel, save and load, connect, god, noclip, give and the
 * rest.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; browser storage.
 *
 * Errors: calls `Sys_Error` (fatal) at 1 place; catches at 5 places.
 *
 * Saved games are kept in localStorage: Quake's version-5 text, or for Hexen II one atomic whole-hub JSON record. A
 * failed save or load is caught and reported on the console. A map not yet loaded is fetched first and the command
 * reissued.
 */
import { weaponSurface } from '../common/hooks.js'; // installed by newer/render/r_weapon_surface.js
import { SV_RespawnRestoreDropModel, SV_RespawnClearTravel, SV_RespawnFinishTravel } from '../common/hooks.js'; // installed by newer/gameplay/sv_respawn.js
// Ported from: WinQuake/host_cmd.c

import { Sys_Printf, Sys_Error, Sys_FloatTime, Sys_Quit } from '../common/sys.js';
import { Con_Printf, SZ_Write, SZ_Clear,
	MSG_WriteByte, MSG_WriteShort, MSG_WriteLong, MSG_WriteFloat,
	MSG_WriteString, MSG_WriteAngle, COM_Parse, com_token } from '../common/common.js';
import { svc_signonnum, svc_time, svc_updatename, svc_updatefrags,
	svc_updatecolors, svc_lightstyle, svc_updatestat, svc_setangle,
	svc_setpause, CLOAK_BODY_CAPABILITY } from '../common/protocol.js';
import { STAT_TOTALSECRETS, STAT_TOTALMONSTERS, STAT_SECRETS, STAT_MONSTERS,
	MAX_LIGHTSTYLES, SAVEGAME_COMMENT_LENGTH } from '../common/quakedef.js';
import { NUM_FOR_EDICT, EDICT_NUM, EDICT_TO_PROG, PR_GetString, pr_global_struct } from '../progs/progs.js';
import { PR_ExecuteProgram } from '../progs/pr_exec.js';
import { ED_NewString, ED_Write, ED_WriteGlobals, ED_ParseGlobals, ED_ParseEdict, GetEdictFieldValue } from '../progs/pr_edict.js';
import { hipnotic, rogue } from '../common/common.js';
import { HIT_PROXIMITY_GUN, HIT_LASER_CANNON, HIT_MJOLNIR } from '../common/quakedef.js';
import { SV_PinnedZombieSpawned } from '../common/hooks.js'; // installed by newer/gameplay/sv_pinnedzombies.js
import { sv_player } from './sv_phys.js';
import { FL_GODMODE, FL_NOTARGET,
	MOVETYPE_WALK, MOVETYPE_FLY, MOVETYPE_NOCLIP } from './sv_phys.js';
import { cvar_t, Cvar_Set, Cvar_SetValue, Cvar_VariableValue, Cvar_FindVar, Cvar_RegisterVariable } from '../common/cvar.js';
import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv, Cmd_Args, Cmd_ExecuteString,
	Cmd_ForwardToServer, cmd_source, src_command, src_client, Cbuf_AddText } from '../common/cmd.js';
import { SV_SpawnServer, SV_SaveSpawnparms, SV_RestorePowerups, SV_ClearCarriedPowerups, SV_DropClient,
	SV_WriteClientdataToMessage, current_skill, SV_CheckSignon, sv_protocol, SV_ProtocolFor,
	SV_Hexen2UpdateClass, SV_SetHexen2Field } from './sv_main.js';
import { PROTOCOL_LARGE } from '../common/protocol.js';
import { MAX_EDICTS, MAX_EDICTS_STANDARD } from '../common/quakedef.js';
import { sv, svs, host_client, set_host_client,
	NUM_SPAWN_PARMS, NUM_PING_TIMES, deathmatch } from './server.js';
import { cls, cl, ca_connected, ca_dedicated, MAX_DEMOS } from '../client/client.js';
import { key_game, key_console, key_dest, set_key_dest } from '../client/keys.js';
import { CL_Disconnect, CL_EstablishConnection, CL_NextDemo,
	cl_name, cl_color } from '../client/cl_main.js';
import { CL_StopPlayback } from '../client/cl_demo.js';
import { SCR_BeginLoadingPlaque } from '../render/gl_screen.js';
import { hostname } from '../net/net_main.js';
import { SV_LinkEdict } from './world.js';
import { SV_SeamlessPlacePlayer } from '../common/hooks.js'; // installed by newer/gameplay/sv_seamless.js
import { SV_ClientPrintf, SV_BroadcastPrintf,
	Host_ShutdownServer, Host_Shutdown } from './host.js';
import { COM_FindFile, COM_EnsureFile } from '../common/pak.js';
import { R_FlashlightNewRun, R_FlashlightRunLoaded } from '../common/hooks.js'; // installed by newer/render/r_flashlightrun.js
import { R_DemoLoadingCancel, R_DemoLoadingWelcome } from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js
import { R_ShellsReset, R_ShellsSnapshot, R_ShellsRestore } from '../common/hooks.js'; // installed by newer/render/r_shells.js
import { S_WelcomeJingle } from '../common/hooks.js'; // installed by newer/sound/s_welcomejingle.js

const SHELL_SAVE_PREFIX = '// quaked-shells-v1 ';
import { set_noclip_anglehack } from '../common/host_state.js';
import { GameSelection_SavePrefix } from '../common/game_selection.js';
import { GameProfile_Get, GameProfile_IsHexen2 } from '../common/game_profile.js';
import { Hexen2_SaveEffects, Hexen2_LoadEffects } from '../progs/hexen2_server_cmds.js';
import {
	Hexen2Hub_New, Hexen2Hub_Validate, Hexen2Hub_ValidateLevel, Hexen2Hub_CaptureLevel, Hexen2Hub_CaptureClients,
	Hexen2Hub_RestoreLevel, Hexen2Hub_RestoreClients, Hexen2Hub_PutLevel, Hexen2Hub_GetLevel, Hexen2Hub_LevelCount
} from './hexen2_hub.js';

// noclip_anglehack lives in a leaf (card [44g], D1a), so the client reads it without importing the host
export { noclip_anglehack, set_noclip_anglehack } from '../common/host_state.js';

/*
======================
Host_InitCommands
======================
*/
/**
 * Registers the host console commands (WinQuake host_cmd.c): `status`, `quit`, `map`, `changelevel`, `changelevel2`,
 * `restart`, `reconnect`, `connect`, `name`, `pause`, `say`, `say_team`, `tell`, `color`, `kill`, `god`, `notarget`,
 * `fly`, `noclip`, `give`, `ping`, `kick`, `save`/`savegame`, `load`/`loadgame`, `quicksave`/`quickload`,
 * `startdemos`, `demos`, `stopdemo`, and the
 * signon commands `prespawn`, `spawn` and `begin` that clients send. Called once at startup from `Host_InitLocal`
 * (host.js); the registrations last for the session. WinQuake commands not listed here are not ported.
 */
export function Host_InitCommands() {

	Cmd_AddCommand( 'status', Host_Status_f );
	Cmd_AddCommand( 'quit', Host_Quit_f );
	Cmd_AddCommand( 'map', Host_Map_f );
	Cmd_AddCommand( 'changelevel', Host_Changelevel_f );
	Cmd_AddCommand( 'changelevel2', Host_Changelevel2_f );
	Cmd_AddCommand( 'restart', Host_Restart_f );
	Cmd_AddCommand( 'reconnect', Host_Reconnect_f );
	Cmd_AddCommand( 'connect', Host_Connect_f );
	Cmd_AddCommand( 'name', Host_Name_f );
	Cmd_AddCommand( 'pause', Host_Pause_f );
	Cmd_AddCommand( 'say', Host_Say_f );
	Cmd_AddCommand( 'say_team', Host_Say_Team_f );
	Cmd_AddCommand( 'tell', Host_Tell_f );
	Cmd_AddCommand( 'color', Host_Color_f );
	Cmd_AddCommand( 'kill', Host_Kill_f );
	Cmd_AddCommand( 'god', Host_God_f );
	Cmd_AddCommand( 'notarget', Host_Notarget_f );
	Cmd_AddCommand( 'fly', Host_Fly_f );
	Cmd_AddCommand( 'noclip', Host_Noclip_f );
	Cmd_AddCommand( 'give', Host_Give_f );
	Cmd_AddCommand( 'ping', Host_Ping_f );
	Cmd_AddCommand( 'kick', Host_Kick_f );
	Cmd_AddCommand( 'save', Host_Savegame_f );
	Cmd_AddCommand( 'load', Host_Loadgame_f );
	Cmd_AddCommand( 'savegame', Host_Savegame_f );
	Cmd_AddCommand( 'loadgame', Host_Loadgame_f );
	Cmd_AddCommand( 'quicksave', Host_Quicksave_f );
	Cmd_AddCommand( 'quickload', Host_Quickload_f );
	Cmd_AddCommand( 'startdemos', Host_Startdemos_f );
	Cmd_AddCommand( 'demos', Host_Demos_f );
	Cmd_AddCommand( 'stopdemo', Host_Stopdemo_f );
	Cmd_AddCommand( 'spawn', Host_Spawn_f );
	Cmd_AddCommand( 'begin', Host_Begin_f );
	Cmd_AddCommand( 'prespawn', Host_PreSpawn_f );
	// Hexen II's class choice lives in `_cl_playerclass` (native cl_main.c). Only a Hexen II session has it: a Quake game
	// must not archive a Hexen cvar into its config or answer a `playerclass` command (which sends a Hexen message).
	if ( GameProfile_IsHexen2() ) {

		if ( Cvar_FindVar( '_cl_playerclass' ) === null ) Cvar_RegisterVariable( new cvar_t( '_cl_playerclass', '1', true ) );
		Cmd_AddCommand( 'playerclass', Host_Class_f );

	}

}

function Host_Status_f() {

	Con_Printf( 'host:    Three-Quake\n' );
	Con_Printf( 'map:     ' + ( sv.name || 'none' ) + '\n' );
	Con_Printf( 'players: ' + svs.maxclients + ' max\n' );

}

// quit: as WinQuake, outside the console (a key bound to quit, such as F10, or a server's stuffed text) it only opens
// the "Are you sure" prompt; the prompt's Y and the console run it. It then disconnects, shuts down a local server
// (so its clients are told), saves the settings and shuts the engine down (Host_Shutdown), and leaves for the game
// shelf (the app) or the GitHub page (the HTML) through Sys_Quit.
export function Host_Quit_f() {

	if ( key_dest !== key_console && cls.state !== ca_dedicated ) {

		Cbuf_AddText( 'menu_quit\n' );
		return;

	}
	CL_Disconnect();
	Host_ShutdownServer( false );
	Host_Shutdown();
	Sys_Quit();

}

function Host_Map_f() {

	if ( cmd_source !== src_command )
		return;
	R_DemoLoadingCancel();

	const name = Cmd_Argv( 1 );
	const filename = 'maps/' + name + '.bsp';

	// If the map file isn't loaded yet, fetch it on demand
	if ( COM_FindFile( filename ) === null ) {

		Con_Printf( 'Fetching %s...\n', filename );
		COM_EnsureFile( filename ).then( ( success ) => {

			if ( success ) {

				// Re-issue the map command now that the file is cached
				Cbuf_AddText( 'map ' + name + '\n' );

			} else {

				Con_Printf( 'Couldn\'t find map: %s\n', name );

			}

		} );
		return;

	}

	cls.demonum = - 1; // stop demo loop in case this fails
	SV_ClearCarriedPowerups(); // a fresh run cannot inherit a failed travel's timers
	R_ShellsReset(); // explicit map/new game, unlike seamless level travel
	if ( GameProfile_IsHexen2() ) Host_Hexen2HubReset(); // a new game retires the previous unit's hub

	CL_Disconnect();
	Host_ShutdownServer( false );

	set_key_dest( key_game ); // remove console or menu
	SCR_BeginLoadingPlaque();

	cls.mapstring = '';
	for ( let i = 0; i < Cmd_Argc(); i ++ ) {

		cls.mapstring += Cmd_Argv( i ) + ' ';

	}

	cls.mapstring += '\n';

	svs.serverflags = 0; // haven't completed an episode yet

	SV_SpawnServer( name, GameProfile_IsHexen2() ? Cmd_Argv( 2 ) : '' );

	if ( ! sv.active )
		return;

	if ( cls.state !== ca_dedicated ) {

		cls.spawnparms = '';

		for ( let i = 2; i < Cmd_Argc(); i ++ ) {

			cls.spawnparms += Cmd_Argv( i ) + ' ';

		}

		Cmd_ExecuteString( 'connect local', src_command );

	}
	// Connect performs its own disconnect first; begin the run only after that
	// succeeds. changelevel/seamless travel never enters this fresh-map path.
	// Read r_hdr directly rather than through the cached renderer state: it was set
	// in the same command batch as this `map`, and the three Newer welcome steps below
	// all key off the one connected-and-Newer answer.
	const connectedNewer = cls.state === ca_connected && Cvar_VariableValue( 'r_hdr' ) !== 0;
	R_FlashlightNewRun( name, current_skill, connectedNewer );
	if(connectedNewer&&svs.maxclients===1)R_DemoLoadingWelcome();
	S_WelcomeJingle( name, connectedNewer );

}

function Host_Changelevel_f() {

	if ( Cmd_Argc() !== 2 && ! ( GameProfile_IsHexen2() && Cmd_Argc() === 3 ) ) {

		Con_Printf( 'changelevel <levelname> [startspot] : continue game on a new level\n' );
		return;

	}

	if ( ! sv.active || cls.demoplayback ) {

		Con_Printf( 'Only the server may changelevel\n' );
		return;

	}

	const level = Cmd_Argv( 1 );
	const spot = GameProfile_IsHexen2() ? Cmd_Argv( 2 ) : '';
	const filename = 'maps/' + level + '.bsp';

	// If the map file isn't loaded yet, fetch it on demand
	if ( COM_FindFile( filename ) === null ) {

		Con_Printf( 'Fetching %s...\n', filename );
		COM_EnsureFile( filename ).then( ( success ) => {

			if ( success ) {

				Cbuf_AddText( 'changelevel ' + level + ( spot ? ' ' + spot : '' ) + '\n' );

			} else {

				Con_Printf( 'Couldn\'t find map: %s\n', level );

			}

		} );
		return;

	}

	// A unit/episode change starts a fresh hub (native `changelevel`; the hub form is `changelevel2`).
	if ( GameProfile_IsHexen2() ) Host_Hexen2HubReset();
	SV_SaveSpawnparms();
	SV_SpawnServer( level, spot );
	// Note: SV_SpawnServer handles client reconnection internally via SV_SendReconnect
	// which calls Host_Reconnect_f to reset cls.signon. We do NOT call CL_EstablishConnection
	// here because the client is already connected - it just needs new signon messages.

}

/*
==================
Host_Changelevel2_f

Changing levels within a unit: save this level's state, then restore the target's if it has been visited (uhexen2
Host_Changelevel2_f and LoadGamestate mode 0).
==================
*/
function Host_Changelevel2_f() {

	if ( ! GameProfile_IsHexen2() ) {

		Con_Printf( 'changelevel2 <levelname> [startspot] : Hexen II hub travel\n' );
		return;

	}

	if ( Cmd_Argc() !== 2 && Cmd_Argc() !== 3 ) {

		Con_Printf( 'changelevel2 <levelname> [startspot] : continue game on a new level in the unit\n' );
		return;

	}

	if ( ! sv.active || cls.demoplayback ) {

		Con_Printf( 'Only the server may changelevel\n' );
		return;

	}

	const level = Cmd_Argv( 1 );
	const spot = Cmd_Argv( 2 );
	const filename = 'maps/' + level + '.bsp';

	// If the map file isn't loaded yet, fetch it on demand
	if ( COM_FindFile( filename ) === null ) {

		Con_Printf( 'Fetching %s...\n', filename );
		COM_EnsureFile( filename ).then( ( success ) => {

			if ( success ) Cbuf_AddText( 'changelevel2 ' + level + ( spot ? ' ' + spot : '' ) + '\n' );
			else Con_Printf( 'Couldn\'t find map: %s\n', level );

		} );
		return;

	}

	const result = Host_Hexen2ChangeLevel2( level, spot );
	if ( ! result.ok ) Con_Printf( 'changelevel2: %s\n', result.reason );

}

function Host_Restart_f() {

	if ( ! sv.active )
		return;

	if ( Cmd_Argc() === 2 && Cmd_Argv( 1 ).toLowerCase() === 'restore' && GameProfile_IsHexen2() ) {

		const result = Host_Hexen2RestartRestore();
		if ( ! result.ok ) Con_Printf( 'restart restore: %s\n', result.reason );
		return;

	}

	const mapname = sv.name;
	if ( mapname ) {

		if ( GameProfile_IsHexen2() ) {

			// Native restarts the map directly and leaves the hub's other levels intact.
			SV_SpawnServer( mapname, sv.startspot ?? '' );

		} else {

			Cbuf_AddText( 'map ' + mapname + '\n' );

		}

	}

}

function Host_Reconnect_f() {

	SCR_BeginLoadingPlaque();
	cls.signon = 0; // need new connection messages

}

function Host_Connect_f() {
	R_DemoLoadingCancel();

	cls.demonum = - 1; // stop demo loop in case this fails
	if ( cls.demoplayback ) {

		CL_StopPlayback();
		CL_Disconnect();

	}

	// Use Cmd_Argv(1) to get the server address
	// When quoted (e.g., connect "wts://host:port"), Cmd_Argv(1) properly returns the unquoted URL
	// Cmd_Args() would include the quotes which breaks URL parsing
	const name = Cmd_Argv( 1 );
	if ( ! name || name.length === 0 ) {

		Con_Printf( 'usage: connect <server>\n' );
		return;

	}

	Con_Printf( 'Connecting to %s...\n', name );

	// CL_EstablishConnection is async (WebTransport handshake)
	// Use .then() to call Host_Reconnect_f when connection succeeds
	CL_EstablishConnection( name ).then( () => {

		Host_Reconnect_f();

	} ).catch( ( e ) => {

		Con_Printf( 'connect: %s\n', e.message );

	} );

}

function Host_Name_f() {

	let newName;

	if ( Cmd_Argc() === 1 ) {

		Con_Printf( '"name" is "%s"\n', cl_name.string );
		return;

	}

	if ( Cmd_Argc() === 2 )
		newName = Cmd_Argv( 1 );
	else
		newName = Cmd_Args();

	// Sanitize name: only printable ASCII, max 15 chars
	newName = newName.replace( /[^\x20-\x7E]/g, '' ); // Remove non-printable chars
	if ( newName.length > 15 )
		newName = newName.substring( 0, 15 );
	if ( newName.length === 0 )
		newName = 'player'; // Fallback for empty names

	if ( cmd_source === src_command ) {

		// Client-side: update cvar and forward to server
		if ( cl_name.string === newName )
			return;

		Cvar_Set( '_cl_name', newName );

		if ( cls.state === ca_connected )
			Cmd_ForwardToServer();

		return;

	}

	// Server-side: update the client's name (only if changed)
	if ( host_client.name === newName )
		return; // No change, skip update

	if ( host_client.name !== '' && host_client.name !== 'unconnected' ) {

		Con_Printf( '%s renamed to %s\n', host_client.name, newName );

	}

	host_client.name = newName;

	// Set the netname on the edict
	if ( host_client.edict != null ) {

		host_client.edict.v.netname = ED_NewString( newName );

	}

	// Send notification to all clients
	MSG_WriteByte( sv.reliable_datagram, svc_updatename );
	MSG_WriteByte( sv.reliable_datagram, svs.clients.indexOf( host_client ) );
	MSG_WriteString( sv.reliable_datagram, host_client.name );

}

function Host_Pause_f() {

	if ( cmd_source === src_command ) {

		Cmd_ForwardToServer();
		return;

	}

	if ( Cvar_VariableValue( 'pausable' ) === 0 ) {

		SV_ClientPrintf( 'Pause not allowed.\n' );

	} else {

		sv.paused = sv.paused ^ 1;

		if ( sv.paused ) {

			SV_BroadcastPrintf( '%s paused the game\n', PR_GetString( sv_player.v.netname ) );

		} else {

			SV_BroadcastPrintf( '%s unpaused the game\n', PR_GetString( sv_player.v.netname ) );

		}

		// send notification to all clients
		MSG_WriteByte( sv.reliable_datagram, svc_setpause );
		MSG_WriteByte( sv.reliable_datagram, sv.paused );

	}

}

function Host_Say( teamonly ) {

	let fromServer = false;

	if ( cmd_source === src_command ) {

		if ( cls.state === ca_dedicated ) {

			fromServer = true;
			teamonly = false;

		} else {

			Cmd_ForwardToServer();
			return;

		}

	}

	if ( Cmd_Argc() < 2 ) return;

	const save = host_client;

	let p = Cmd_Args();

	// remove quotes if present
	if ( p.charAt( 0 ) === '"' ) {

		p = p.substring( 1, p.length - 1 );

	}

	// turn on color set 1
	let text;
	if ( fromServer === false ) {

		text = '\x01' + save.name + ': ';

	} else {

		text = '\x01<' + hostname.string + '> ';

	}

	// truncate if too long
	const maxLen = 62 - text.length; // 64 - 2 for \n and safety
	if ( p.length > maxLen ) {

		p = p.substring( 0, maxLen );

	}

	text += p + '\n';

	const teamplayValue = Cvar_VariableValue( 'teamplay' );

	for ( let j = 0; j < svs.maxclients; j ++ ) {

		const client = svs.clients[ j ];
		if ( client == null || client.active === false || client.spawned === false ) continue;
		if ( teamplayValue !== 0 && teamonly && client.edict.v.team !== save.edict.v.team ) continue;
		set_host_client( client );
		SV_ClientPrintf( '%s', text );

	}

	set_host_client( save );

	Sys_Printf( '%s', text.substring( 1 ) );

}

function Host_Say_f() {

	Host_Say( false );

}

function Host_Say_Team_f() {

	Host_Say( true );

}

function Host_Tell_f() {

	if ( cmd_source === src_command ) {

		Cmd_ForwardToServer();
		return;

	}

	if ( Cmd_Argc() < 3 ) return;

	let text = host_client.name + ': ';

	let p = Cmd_Args();

	// remove quotes if present
	if ( p.charAt( 0 ) === '"' ) {

		p = p.substring( 1, p.length - 1 );

	}

	// truncate if too long
	const maxLen = 62 - text.length;
	if ( p.length > maxLen ) {

		p = p.substring( 0, maxLen );

	}

	text += p + '\n';

	const save = host_client;

	for ( let j = 0; j < svs.maxclients; j ++ ) {

		const client = svs.clients[ j ];
		if ( client == null || client.active === false || client.spawned === false ) continue;
		if ( client.name.toLowerCase() !== Cmd_Argv( 1 ).toLowerCase() ) continue;
		set_host_client( client );
		SV_ClientPrintf( '%s', text );
		break;

	}

	set_host_client( save );

}

function Host_Color_f() {

	if ( Cmd_Argc() === 1 ) {

		Con_Printf( '"color" is "' + ( ( cl_color.value | 0 ) >> 4 ) + ' ' + ( ( cl_color.value | 0 ) & 0x0f ) + '"\n' );
		Con_Printf( 'color <0-13> [0-13]\n' );
		return;

	}

	let top, bottom;

	if ( Cmd_Argc() === 2 ) {

		top = bottom = parseInt( Cmd_Argv( 1 ) ) || 0;

	} else {

		top = parseInt( Cmd_Argv( 1 ) ) || 0;
		bottom = parseInt( Cmd_Argv( 2 ) ) || 0;

	}

	top &= 15;
	if ( top > 13 ) top = 13;
	bottom &= 15;
	if ( bottom > 13 ) bottom = 13;

	const playercolor = top * 16 + bottom;

	if ( cmd_source === src_command ) {

		Cvar_SetValue( '_cl_color', playercolor );
		if ( cls.state === ca_connected ) {

			Cmd_ForwardToServer();

		}

		return;

	}

	host_client.colors = playercolor;
	host_client.edict.v.team = bottom + 1;

	// send notification to all clients
	MSG_WriteByte( sv.reliable_datagram, svc_updatecolors );
	MSG_WriteByte( sv.reliable_datagram, svs.clients.indexOf( host_client ) );
	MSG_WriteByte( sv.reliable_datagram, host_client.colors );

}

function Host_Kill_f() {

	if ( cmd_source === src_command ) {

		// If not running a local server, forward the command to the remote server
		if ( ! sv.active ) {

			Cmd_ForwardToServer();
			return;

		}

		Cmd_ExecuteString( 'kill', src_client );
		return;

	}

	if ( sv_player == null || sv_player.v.health <= 0 ) {

		SV_ClientPrintf( 'Can\'t suicide -- allready dead!\n' );
		return;

	}

	pr_global_struct.time = sv.time;
	pr_global_struct.self = EDICT_TO_PROG( sv_player );
	PR_ExecuteProgram( pr_global_struct.ClientKill );

}

function Host_God_f() {

	if ( cmd_source === src_command ) {

		Cmd_ForwardToServer();
		return;

	}

	if ( pr_global_struct.deathmatch && ! host_client.privileged )
		return;

	sv_player.v.flags = ( sv_player.v.flags | 0 ) ^ FL_GODMODE;
	if ( ! ( ( sv_player.v.flags | 0 ) & FL_GODMODE ) )
		SV_ClientPrintf( 'godmode OFF\n' );
	else
		SV_ClientPrintf( 'godmode ON\n' );

}

function Host_Notarget_f() {

	if ( cmd_source === src_command ) {

		Cmd_ForwardToServer();
		return;

	}

	if ( pr_global_struct.deathmatch && ! host_client.privileged )
		return;

	sv_player.v.flags = ( sv_player.v.flags | 0 ) ^ FL_NOTARGET;
	if ( ! ( ( sv_player.v.flags | 0 ) & FL_NOTARGET ) )
		SV_ClientPrintf( 'notarget OFF\n' );
	else
		SV_ClientPrintf( 'notarget ON\n' );

}

function Host_Fly_f() {

	if ( cmd_source === src_command ) {

		Cmd_ForwardToServer();
		return;

	}

	if ( pr_global_struct.deathmatch && ! host_client.privileged )
		return;

	if ( sv_player.v.movetype !== MOVETYPE_FLY ) {

		sv_player.v.movetype = MOVETYPE_FLY;
		SV_ClientPrintf( 'flymode ON\n' );

	} else {

		sv_player.v.movetype = MOVETYPE_WALK;
		SV_ClientPrintf( 'flymode OFF\n' );

	}

}

function Host_Noclip_f() {

	if ( cmd_source === src_command ) {

		Cmd_ForwardToServer();
		return;

	}

	if ( pr_global_struct.deathmatch && ! host_client.privileged )
		return;

	if ( sv_player.v.movetype !== MOVETYPE_NOCLIP ) {

		set_noclip_anglehack( true );
		sv_player.v.movetype = MOVETYPE_NOCLIP;
		SV_ClientPrintf( 'noclip ON\n' );

	} else {

		set_noclip_anglehack( false );
		sv_player.v.movetype = MOVETYPE_WALK;
		SV_ClientPrintf( 'noclip OFF\n' );

	}

}

function Host_Give_f() {

	if ( cmd_source === src_command ) {

		Cmd_ForwardToServer();
		return;

	}

	if ( pr_global_struct.deathmatch !== 0 && host_client.privileged === false )
		return;

	const t = Cmd_Argv( 1 );
	const v = parseInt( Cmd_Argv( 2 ) ) || 0;

	if ( t.length === 0 ) return;

	// a mission pack's own ammunition fields (rogue keeps each kind in a field of its own, the current one in the
	// standard field), as WinQuake's give command sets them (card [34c])
	const setField = ( name ) => { const f = GetEdictFieldValue( sv_player, name ); if ( f ) f.accessor.setFloat( f.ofs, v ); return f !== null; };
	const IT_SHOTGUN = 1, IT_GRENADE_LAUNCHER = 16, IT_LIGHTNING = 64;
	switch ( t[ 0 ] ) {

		case '0': case '1': case '2': case '3': case '4':
		case '5': case '6': case '7': case '8': case '9': {

			const n = t.charCodeAt( 0 ) - 48;
			// MED 01/04/97 added hipnotic give stuff
			if ( hipnotic ) {

				if ( n === 6 ) sv_player.v.items = ( sv_player.v.items | 0 ) | ( t[ 1 ] === 'a' ? HIT_PROXIMITY_GUN : IT_GRENADE_LAUNCHER );
				else if ( n === 9 ) sv_player.v.items = ( sv_player.v.items | 0 ) | HIT_LASER_CANNON;
				else if ( n === 0 ) sv_player.v.items = ( sv_player.v.items | 0 ) | HIT_MJOLNIR;
				else if ( n >= 2 ) sv_player.v.items = ( sv_player.v.items | 0 ) | ( IT_SHOTGUN << ( n - 2 ) );

			} else if ( n >= 2 ) sv_player.v.items = ( sv_player.v.items | 0 ) | ( IT_SHOTGUN << ( n - 2 ) );
			break;

		}

		case 's':
			if ( rogue ) setField( 'ammo_shells1' );
			sv_player.v.ammo_shells = v;
			break;

		case 'n':
			if ( rogue ) { if ( setField( 'ammo_nails1' ) && sv_player.v.weapon <= IT_LIGHTNING ) sv_player.v.ammo_nails = v; }
			else sv_player.v.ammo_nails = v;
			break;

		case 'l':
			if ( rogue && setField( 'ammo_lava_nails' ) && sv_player.v.weapon > IT_LIGHTNING ) sv_player.v.ammo_nails = v;
			break;

		case 'r':
			if ( rogue ) { if ( setField( 'ammo_rockets1' ) && sv_player.v.weapon <= IT_LIGHTNING ) sv_player.v.ammo_rockets = v; }
			else sv_player.v.ammo_rockets = v;
			break;

		case 'm':
			if ( rogue && setField( 'ammo_multi_rockets' ) && sv_player.v.weapon > IT_LIGHTNING ) sv_player.v.ammo_rockets = v;
			break;

		case 'h':
			sv_player.v.health = v;
			break;

		case 'c':
			if ( rogue ) { if ( setField( 'ammo_cells1' ) && sv_player.v.weapon <= IT_LIGHTNING ) sv_player.v.ammo_cells = v; }
			else sv_player.v.ammo_cells = v;
			break;

		case 'p':
			if ( rogue && setField( 'ammo_plasma' ) && sv_player.v.weapon > IT_LIGHTNING ) sv_player.v.ammo_cells = v;
			break;

	}

}

function Host_Ping_f() {

	if ( cmd_source === src_command ) {

		Cmd_ForwardToServer();
		return;

	}

	SV_ClientPrintf( 'Client ping times:\n' );

	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const client = svs.clients[ i ];
		if ( client == null || client.active === false ) continue;

		let total = 0;
		for ( let j = 0; j < NUM_PING_TIMES; j ++ ) {

			total += client.ping_times[ j ];

		}

		total /= NUM_PING_TIMES;
		SV_ClientPrintf( '  ' + ( ( total * 1000 ) | 0 ) + ' ' + client.name + '\n' );

	}

}

function Host_Kick_f() {

	if ( cmd_source === src_command ) {

		if ( sv.active === false ) {

			Cmd_ForwardToServer();
			return;

		}

	} else if ( pr_global_struct.deathmatch !== 0 && host_client.privileged === false ) {

		return;

	}

	const save = host_client;

	let i;
	let byNumber = false;

	if ( Cmd_Argc() > 2 && Cmd_Argv( 1 ) === '#' ) {

		i = ( parseFloat( Cmd_Argv( 2 ) ) | 0 ) - 1;
		if ( i < 0 || i >= svs.maxclients ) return;
		if ( svs.clients[ i ] == null || svs.clients[ i ].active === false ) return;
		set_host_client( svs.clients[ i ] );
		byNumber = true;

	} else {

		for ( i = 0; i < svs.maxclients; i ++ ) {

			set_host_client( svs.clients[ i ] );
			if ( host_client == null || host_client.active === false ) continue;
			if ( host_client.name.toLowerCase() === Cmd_Argv( 1 ).toLowerCase() ) break;

		}

	}

	if ( i < svs.maxclients ) {

		let who;
		if ( cmd_source === src_command ) {

			if ( cls.state === ca_dedicated ) {

				who = 'Console';

			} else {

				who = cl_name.string;

			}

		} else {

			who = save.name;

		}

		// can't kick yourself!
		if ( host_client === save ) {

			set_host_client( save );
			return;

		}

		let message = null;
		if ( Cmd_Argc() > 2 ) {

			let args = Cmd_Args();
			if ( byNumber ) {

				// skip the # and number
				const numStr = Cmd_Argv( 2 );
				const hashIdx = args.indexOf( '#' );
				if ( hashIdx >= 0 ) {

					args = args.substring( hashIdx + 1 ).trim();
					args = args.substring( numStr.length ).trim();

				}

			}

			if ( args.length > 0 ) {

				message = args;

			}

		}

		if ( message != null ) {

			SV_ClientPrintf( 'Kicked by ' + who + ': ' + message + '\n' );

		} else {

			SV_ClientPrintf( 'Kicked by ' + who + '\n' );

		}

		SV_DropClient( false );

	}

	set_host_client( save );

}

//============================================================================
// Hexen II hubs and saves
//============================================================================

const HEXEN2_SAVE_HEADER = 'HEXEN2HUB 1';
let sessionHub = null;

/**
 * Drops the session's in-memory hub. The `map` command and a new unit (`changelevel`) call it, so a new run can never
 * inherit a previous unit's stored levels.
 *
 * @returns {object} the new empty hub
 */
export function Host_Hexen2HubReset() {

	sessionHub = Hexen2Hub_New();
	return sessionHub;

}

/** The session's in-memory hub, or null before a Hexen II game starts. */
export function Host_Hexen2Hub() { return sessionHub; }

function hexenHub() {

	if ( sessionHub === null ) sessionHub = Hexen2Hub_New();
	return sessionHub;

}

function mapNameFor( level ) {

	let name = String( level ?? '' ).trim().replace( /\\/g, '/' ).toLowerCase();
	if ( name.startsWith( 'maps/' ) ) name = name.slice( 5 );
	if ( name.endsWith( '.bsp' ) ) name = name.slice( 0, - 4 );
	return name;

}

function captureSessionInfo() {

	const client = svs.clients?.[ 0 ];
	let playerclass = client?.playerclass | 0;
	if ( playerclass < 1 && client?.edict ) {

		const field = GetEdictFieldValue( client.edict, 'playerclass' );
		if ( field !== null ) playerclass = field.accessor.getFloat( field.ofs ) | 0;

	}
	const globals = pr_global_struct ?? {};
	return {
		gameId: GameProfile_Get().id,
		skill: current_skill | 0,
		playerclass,
		infoMask: ( globals.info_mask ?? sv.info_mask ?? 0 ) >>> 0,
		infoMask2: ( globals.info_mask2 ?? sv.info_mask2 ?? 0 ) >>> 0,
		serverflags: globals.serverflags | 0,
		midiName: String( sv.midi_name ?? '' ),
		cdTrack: sv.cd_track | 0,
	};

}

function applySessionInfo( session ) {

	if ( session === null || typeof session !== 'object' ) return;
	if ( Number.isInteger( session.skill ) ) Cvar_SetValue( 'skill', Math.max( 0, Math.min( 4, session.skill ) ) );
	if ( Number.isInteger( session.playerclass ) && session.playerclass >= 1 && session.playerclass <= 5 )
		Cvar_SetValue( '_cl_playerclass', session.playerclass );
	svs.serverflags = session.serverflags | 0;
	sv.info_mask = ( session.infoMask ?? 0 ) >>> 0;
	sv.info_mask2 = ( session.infoMask2 ?? 0 ) >>> 0;
	if ( pr_global_struct ) {

		if ( 'info_mask' in pr_global_struct ) pr_global_struct.info_mask = sv.info_mask;
		if ( 'info_mask2' in pr_global_struct ) pr_global_struct.info_mask2 = sv.info_mask2;

	}
	for ( let i = 0; i < ( svs.maxclients | 0 ); i ++ ) {

		const client = svs.clients?.[ i ];
		if ( client?.active && session.playerclass >= 1 && session.playerclass <= 5 ) client.playerclass = session.playerclass;

	}

}

function captureCurrentLevel( hub ) {

	const level = Hexen2Hub_CaptureLevel( sv, svs, Hexen2_SaveEffects() );
	Hexen2Hub_PutLevel( hub, level );
	hub.currentLevel = level.level;
	hub.clients = Hexen2Hub_CaptureClients( sv, svs );
	hub.session = captureSessionInfo();
	hub.savedAt = new Date().toISOString();
	return level;

}

function spawnAndRestoreLevel( hub, levelName, startspot = '' ) {

	const record = Hexen2Hub_GetLevel( hub, levelName );
	if ( record === null ) return { ok: false, reason: `no stored state for ${levelName}` };
	const name = mapNameFor( record.level );
	SV_SpawnServer( name, String( startspot ?? '' ) || record.startspot || '' );
	if ( ! sv.active ) return { ok: false, reason: `couldn't spawn ${name}` };
	const restored = Hexen2Hub_RestoreLevel( sv, svs, record );
	if ( ! restored.ok ) return restored;
	if ( record.effects !== null && record.effects !== undefined ) {

		const effects = Hexen2_LoadEffects( record.effects );
		if ( ! effects.ok ) Con_Printf( 'Saved effects could not be restored: %s\n', effects.reason );

	}
	sv.time = record.time;
	pr_global_struct.time = sv.time;
	return { ok: true, record, count: restored.count };

}

/**
 * Hexen II's hub transition (`changelevel2`): saves the live level and clients, then restores the target's stored
 * state when it has been visited, or spawns it fresh. Either way the latest client record is restored and the
 * gamecode's `ClientReEnter(timeDiff)` runs, as native `Host_Changelevel2_f` + `LoadGamestate`/`RestoreClients`.
 *
 * @param {string} level the map name, with or without `maps/` and `.bsp`
 * @param {string} [startspot] the target start spot (the stored one when empty)
 * @returns {{ ok: true, restored: boolean, timeDiff: number, clients: number } | { ok: false, reason: string }} the result
 */
export function Host_Hexen2ChangeLevel2( level, startspot = '' ) {

	if ( ! GameProfile_IsHexen2() ) return { ok: false, reason: 'not a Hexen II game' };
	const name = mapNameFor( level );
	if ( name === '' ) return { ok: false, reason: 'no level name' };

	const hub = hexenHub();
	const oldTime = sv.time;
	SV_SaveSpawnparms();

	// SaveGamestate(false) then SV_SpawnServer's own SaveGamestate(true): both are the live level, before the new one
	// is loaded.
	captureCurrentLevel( hub );
	const clients = hub.clients;

	const target = Hexen2Hub_GetLevel( hub, name );
	if ( target !== null ) {

		const loaded = spawnAndRestoreLevel( hub, name, startspot );
		if ( ! loaded.ok ) return loaded;
		sv.paused = true; // native LoadGamestate mode 0 pauses until the client prespawns

	} else {

		SV_SpawnServer( name, String( startspot ?? '' ) );
		if ( ! sv.active ) return { ok: false, reason: `couldn't spawn ${name}` };

	}

	const timeDiff = sv.time - oldTime;
	const clientsResult = Hexen2Hub_RestoreClients( sv, svs, clients, timeDiff );
	if ( ! clientsResult.ok ) return { ok: false, reason: clientsResult.reason };

	// RestoreClients ends with SaveGamestate(true): keep the re-entered client state for the next visit.
	hub.currentLevel = sv.name;
	hub.clients = Hexen2Hub_CaptureClients( sv, svs );
	hub.session = captureSessionInfo();
	hub.savedAt = new Date().toISOString();
	return { ok: true, restored: target !== null, timeDiff, clients: clientsResult.restored };

}


/**
 * `restart restore`: reload the current level's stored state and re-enter the client without a level change
 * (uhexen2 Host_Restart_f / LoadGamestate mode 3).
 *
 * @returns {{ ok: true, restored: boolean } | { ok: false, reason: string }} the result
 */
export function Host_Hexen2RestartRestore() {

	if ( ! sv.active ) return { ok: false, reason: 'not playing a local game' };
	const hub = hexenHub();
	const name = mapNameFor( sv.name );
	const record = Hexen2Hub_GetLevel( hub, name );
	if ( record === null ) {

		SV_SpawnServer( name, sv.startspot ?? '' );
		if ( ! sv.active ) return { ok: false, reason: `couldn't spawn ${name}` };
		if ( hub.clients ) Hexen2Hub_RestoreClients( sv, svs, hub.clients, 0 );
		return { ok: true, restored: false };

	}
	const loaded = spawnAndRestoreLevel( hub, name, sv.startspot ?? '' );
	if ( ! loaded.ok ) return loaded;
	sv.paused = false;
	const clients = Hexen2Hub_RestoreClients( sv, svs, hub.clients, 0 );
	if ( ! clients.ok ) return { ok: false, reason: clients.reason };
	hub.clients = Hexen2Hub_CaptureClients( sv, svs );
	return { ok: true, restored: true };

}

/**
 * Reads one Hexen II hub save from the shared save repository. A slot is one localStorage value, so the whole hub and
 * its comment are committed atomically; the second line stays a save-menu comment like a Quake slot's.
 *
 * @param {string} name the slot name
 * @returns {?{ hub: object, comment: string, text: string }} the record, or null when absent/unreadable
 */
export function Host_Hexen2ReadSlot( name ) {

	let text;
	try { text = localStorage.getItem( GameSelection_SavePrefix() + name ); } catch { return null; }
	if ( typeof text !== 'string' ) return null;
	const header = text.indexOf( '\n' );
	if ( header < 0 || text.slice( 0, header ) !== HEXEN2_SAVE_HEADER ) return null;
	const commentEnd = text.indexOf( '\n', header + 1 );
	if ( commentEnd < 0 ) return null;
	const comment = text.slice( header + 1, commentEnd );
	try {

		const hub = JSON.parse( text.slice( commentEnd + 1 ) );
		const valid = Hexen2Hub_Validate( hub );
		if ( !valid.ok ) return null;
		return { hub, comment, text };

	} catch { return null; }

}

/**
 * The save-menu summary of one Hexen II slot without loading it.
 *
 * @param {string} name the slot name
 * @returns {?{ comment: string, level: string, levels: number, skill: number, playerclass: number, savedAt: string }} the summary
 */
export function Host_Hexen2SaveSummary( name ) {

	const slot = Host_Hexen2ReadSlot( name );
	if ( slot === null ) return null;
	return {
		comment: slot.comment,
		level: slot.hub.currentLevel,
		levels: Hexen2Hub_LevelCount( slot.hub ),
		skill: slot.hub.session?.skill | 0,
		playerclass: slot.hub.session?.playerclass | 0,
		savedAt: slot.hub.savedAt,
	};

}

/**
 * Saves the whole session hub into one shared fetch/localStorage slot: every visited level's state, the current level,
 * the client slot's class/skill/objectives and spawn parms. Quake's version-5 text saves are untouched.
 *
 * @param {string} name the slot name
 * @returns {{ ok: true, levels: number } | { ok: false, reason: string }} the result
 */
export function Host_Hexen2SaveGame( name ) {

	if ( ! sv.active ) return { ok: false, reason: 'not playing a local game' };
	if ( ! GameProfile_IsHexen2() ) return { ok: false, reason: 'not a Hexen II game' };
	if ( String( name ?? '' ).indexOf( '..' ) !== - 1 ) return { ok: false, reason: 'relative pathnames are not allowed' };
	const hub = hexenHub();
	captureCurrentLevel( hub );
	if ( Hexen2Hub_GetLevel( hub, hub.currentLevel ) === null ) return { ok: false, reason: 'the current level was not captured' };
	const text = HEXEN2_SAVE_HEADER + '\n' + Host_SavegameComment() + '\n' + JSON.stringify( hub ) + '\n';
	try {

		localStorage.setItem( GameSelection_SavePrefix() + name, text );

	} catch ( error ) {

		Con_Printf( 'ERROR: couldn\'t save (localStorage full?).\n' );
		return { ok: false, reason: String( error?.message ?? error ) };

	}
	return { ok: true, levels: Hexen2Hub_LevelCount( hub ) };

}

/**
 * Loads a whole-hub save. The current session is left untouched until the slot, its schema and its current level have
 * all validated; then the level is spawned and its saved edicts/effects restored, with the client record's class,
 * skill, objectives and spawn parms applied, and the signon reissued.
 *
 * @param {string} name the slot name
 * @returns {{ ok: true, level: string, levels: number } | { ok: false, reason: string }} the result
 */
export function Host_Hexen2LoadGame( name ) {

	const slot = Host_Hexen2ReadSlot( name );
	if ( slot === null ) return { ok: false, reason: 'not a readable Hexen II hub save' };
	const hub = slot.hub, level = mapNameFor( hub.currentLevel );
	const record = Hexen2Hub_GetLevel( hub, hub.currentLevel );
	if ( record === null ) return { ok: false, reason: `the save has no state for ${hub.currentLevel}` };
	const valid = Hexen2Hub_ValidateLevel( record );
	if ( !valid.ok ) return { ok: false, reason: valid.reason };

	cls.demonum = - 1;
	applySessionInfo( hub.session );
	CL_Disconnect();
	SV_RespawnClearTravel();
	SV_SpawnServer( level, record.startspot || '' );
	if ( ! sv.active ) return { ok: false, reason: `couldn't spawn ${level}` };
	const restored = Hexen2Hub_RestoreLevel( sv, svs, record );
	if ( ! restored.ok ) return restored;
	if ( record.effects !== null && record.effects !== undefined ) {

		const effects = Hexen2_LoadEffects( record.effects );
		if ( ! effects.ok ) Con_Printf( 'Saved effects could not be restored: %s\n', effects.reason );

	}
	sv.time = record.time;
	pr_global_struct.time = sv.time;
	sv.loadgame = true;
	sv.paused = true;
	applySessionInfo( hub.session );

	// client_t carry-over: spawn parms and the class the saved run used (the player edict itself came from the level)
	const slots = new Map( ( hub.clients?.slots ?? [] ).map( entry => [ entry.slot, entry ] ) );
	for ( let i = 0; i < ( svs.maxclients | 0 ); i ++ ) {

		const client = svs.clients?.[ i ];
		if ( !client?.active ) continue;
		const saved = slots.get( i );
		if ( saved ) {

			client.playerclass = saved.playerclass | 0;
			client.colors = saved.colors | 0;
			if ( saved.name ) client.name = saved.name;
			for ( let j = 0; j < NUM_SPAWN_PARMS; j ++ ) client.spawn_parms[ j ] = saved.spawn_parms[ j ] ?? 0;
			if ( client.edict && saved.playerclass > 0 ) SV_SetHexen2Field( client.edict, 'playerclass', saved.playerclass | 0 );

		}
		client.h2Stats = null;
		client.old_playerclass = client.playerclass;

	}

	SV_SaveSpawnparms();
	// Keep the class the level's player edict records, as native does after LoadGamestate.
	const player = EDICT_NUM( 1 );
	const classField = player ? GetEdictFieldValue( player, 'playerclass' ) : null;
	const playerclass = classField ? classField.accessor.getFloat( classField.ofs ) | 0 : 0;
	if ( playerclass >= 1 && playerclass <= 5 ) {

		Cvar_SetValue( '_cl_playerclass', playerclass );
		if ( svs.clients?.[ 0 ]?.active ) svs.clients[ 0 ].playerclass = playerclass;

	}
	// The loaded hub becomes this session's hub: later changelevel2 visits and saves must see every loaded level.
	hub.currentLevel = sv.name;
	hub.clients = Hexen2Hub_CaptureClients( sv, svs );
	hub.session = captureSessionInfo();
	sessionHub = hub;
	if ( cls.state !== ca_dedicated ) {

		CL_EstablishConnection( 'local' );
		Host_Reconnect_f();

	}
	return { ok: true, level: sv.name, levels: Hexen2Hub_LevelCount( hub ) };

}

function Host_Quicksave_f() { Cmd_ExecuteString( 'save quick', src_command ); }
function Host_Quickload_f() { Cmd_ExecuteString( 'load quick', src_command ); }

const SAVEGAME_VERSION = 5;
// each game keeps its own saves (card [34c]): see GameSelection_SavePrefix

/*
===============
Host_SavegameComment

Writes a SAVEGAME_COMMENT_LENGTH character comment describing the current game
===============
*/
function Host_SavegameComment() {

	// Build comment: levelname padded to 22 chars, then kills:xxx/xxx
	let text = cl.levelname || '';
	while ( text.length < 22 ) text += ' ';
	text = text.substring( 0, 22 );

	const kills = 'kills:' + String( cl.stats[ STAT_MONSTERS ] ).padStart( 3, ' ' ) + '/' + String( cl.stats[ STAT_TOTALMONSTERS ] ).padStart( 3, ' ' );
	text += kills;

	// Pad to SAVEGAME_COMMENT_LENGTH
	while ( text.length < SAVEGAME_COMMENT_LENGTH ) text += ' ';
	text = text.substring( 0, SAVEGAME_COMMENT_LENGTH );

	// convert spaces to _ (original C format)
	return text.replace( / /g, '_' );

}

/*
===============
Host_Savegame_f
===============
*/
function Host_Savegame_f() {

	if ( cmd_source !== src_command ) return;

	if ( sv.active === false ) {

		Con_Printf( 'Not playing a local game.\n' );
		return;

	}

	if ( cl.intermission !== 0 ) {

		Con_Printf( 'Can\'t save in intermission.\n' );
		return;

	}

	if ( svs.maxclients !== 1 ) {

		Con_Printf( 'Can\'t save multiplayer games.\n' );
		return;

	}

	if ( Cmd_Argc() !== 2 ) {

		Con_Printf( 'save <savename> : save a game\n' );
		return;

	}

	if ( Cmd_Argv( 1 ).indexOf( '..' ) !== - 1 ) {

		Con_Printf( 'Relative pathnames are not allowed.\n' );
		return;

	}

	for ( let i = 0; i < svs.maxclients; i ++ ) {

		if ( svs.clients[ i ] != null && svs.clients[ i ].active && svs.clients[ i ].edict.v.health <= 0 ) {

			Con_Printf( 'Can\'t savegame with a dead player\n' );
			return;

		}

	}

	const name = Cmd_Argv( 1 );

	Con_Printf( 'Saving game to %s...\n', name );

	if ( GameProfile_IsHexen2() ) {

		const saved = Host_Hexen2SaveGame( name );
		if ( ! saved.ok ) Con_Printf( 'ERROR: couldn\'t save: %s\n', saved.reason );
		else Con_Printf( 'done. (%d level%s)\n', saved.levels, saved.levels === 1 ? '' : 's' );
		return;

	}

	const lines = [];

	lines.push( String( SAVEGAME_VERSION ) );
	lines.push( Host_SavegameComment() );

	for ( let i = 0; i < NUM_SPAWN_PARMS; i ++ ) {

		lines.push( String( svs.clients[ 0 ].spawn_parms[ i ] ) );

	}

	lines.push( String( current_skill ) );
	lines.push( sv.name );
	lines.push( String( sv.time ) );

	// write the light styles
	for ( let i = 0; i < MAX_LIGHTSTYLES; i ++ ) {

		if ( sv.lightstyles[ i ] != null ) {

			lines.push( sv.lightstyles[ i ] );

		} else {

			lines.push( 'm' );

		}

	}

	// write globals
	ED_WriteGlobals( lines );

	// write all edicts
	for ( let i = 0; i < sv.num_edicts; i ++ ) {

		ED_Write( lines, EDICT_NUM( i ) );

	}

	// Store in localStorage
	// A brace-free trailing comment keeps native version-5 saves compatible.
	// In the same localStorage value, so gameplay and cosmetic state are atomic.
	lines.push( SHELL_SAVE_PREFIX + btoa( JSON.stringify( R_ShellsSnapshot() ) ) );
 lines.push('// weapon-surface '+btoa(JSON.stringify(weaponSurface.snapshotAll())));
	const saveData = lines.join( '\n' ) + '\n';

	try {

		localStorage.setItem( GameSelection_SavePrefix() + name, saveData );

	} catch ( e ) {

		Con_Printf( 'ERROR: couldn\'t save (localStorage full?).\n' );
		return;

	}

	Con_Printf( 'done.\n' );

}

/*
===============
Host_Loadgame_f
===============
*/
function Host_Loadgame_f() {

	if ( cmd_source !== src_command ) return;

	if ( Cmd_Argc() !== 2 ) {

		Con_Printf( 'load <savename> : load a game\n' );
		return;

	}

	cls.demonum = - 1; // stop demo loop in case this fails

	const name = Cmd_Argv( 1 );

	Con_Printf( 'Loading game from %s...\n', name );

	if ( GameProfile_IsHexen2() ) {

		const slot = Host_Hexen2ReadSlot( name );
		if ( slot === null ) {

			Con_Printf( 'ERROR: couldn\'t open.\n' );
			return;

		}
		const level = mapNameFor( slot.hub.currentLevel );
		const mapfilename = 'maps/' + level + '.bsp';
		if ( COM_FindFile( mapfilename ) === null ) {

			Con_Printf( 'Fetching %s...\n', mapfilename );
			COM_EnsureFile( mapfilename ).then( ( success ) => {

				if ( success ) Cbuf_AddText( 'load ' + name + '\n' );
				else Con_Printf( 'Couldn\'t find map: %s\n', level );

			} );
			return;

		}
		const loaded = Host_Hexen2LoadGame( name );
		if ( ! loaded.ok ) Con_Printf( 'ERROR: couldn\'t load: %s\n', loaded.reason );
		else Con_Printf( 'done. (%d level%s)\n', loaded.levels, loaded.levels === 1 ? '' : 's' );
		return;

	}

	let saveData;

	try {

		saveData = localStorage.getItem( GameSelection_SavePrefix() + name );

	} catch ( e ) {

		// ignore

	}

	if ( saveData == null ) {

		Con_Printf( 'ERROR: couldn\'t open.\n' );
		return;

	}

	// Parse the save file line by line
	const allLines = saveData.split( '\n' );
	let lineIdx = 0;

	function nextLine() {

		if ( lineIdx < allLines.length ) return allLines[ lineIdx ++ ];
		return '';

	}

	const version = parseInt( nextLine() );
	if ( version !== SAVEGAME_VERSION ) {

		Con_Printf( 'Savegame is version %i, not %i\n', version, SAVEGAME_VERSION );
		return;

	}

	nextLine(); // skip comment

	const spawn_parms = new Float32Array( NUM_SPAWN_PARMS );
	for ( let i = 0; i < NUM_SPAWN_PARMS; i ++ ) {

		spawn_parms[ i ] = parseFloat( nextLine() ) || 0;

	}

	// this silliness is so we can load 1.06 save files, which have float skill values
	const tfloat = parseFloat( nextLine() ) || 0;
	const loadSkill = ( tfloat + 0.1 ) | 0;
	Cvar_SetValue( 'skill', loadSkill );

	const mapname = nextLine();
	const time = parseFloat( nextLine() ) || 0;

	// If the map file isn't loaded yet, fetch it on demand
	const mapfilename = 'maps/' + mapname + '.bsp';
	if ( COM_FindFile( mapfilename ) === null ) {

		Con_Printf( 'Fetching %s...\n', mapfilename );
		COM_EnsureFile( mapfilename ).then( ( success ) => {

			if ( success ) {

				// Re-issue the load command (will re-parse save data from localStorage)
				Cbuf_AddText( 'load ' + name + '\n' );

			} else {

				Con_Printf( 'Couldn\'t find map: %s\n', mapname );

			}

		} );
		return;

	}

	// a save of a map that grew past protocol 15's 600 entities (it was playing on the large-map protocol, which a new
	// session does not start with) loads on the large-map protocol; one past even that is refused
	const saved = ( allLines.slice( lineIdx ).join( '\n' ).match( /{/g ) ?? [] ).length - 1; // the globals' block is first
	if ( saved > MAX_EDICTS ) { Con_Printf( 'Couldn\'t load: the save has %i entities, more than %i\n', saved, MAX_EDICTS ); return; }
	if ( saved > MAX_EDICTS_STANDARD && SV_ProtocolFor( sv_protocol.value ) !== PROTOCOL_LARGE ) {

		Con_Printf( 'The save has %i entities: loading it with the large-map protocol\n', saved );
		Cvar_Set( 'sv_protocol', String( PROTOCOL_LARGE ) );

	}

	CL_Disconnect();
	SV_RespawnClearTravel();

	SV_SpawnServer( mapname );

	if ( sv.active === false ) {

		Con_Printf( 'Couldn\'t load map\n' );
		return;

	}

	sv.paused = true; // pause until all clients connect
	sv.loadgame = true;

	// load the light styles
	for ( let i = 0; i < MAX_LIGHTSTYLES; i ++ ) {

		sv.lightstyles[ i ] = nextLine();

	}

	// load the edicts out of the savegame file
	// Remaining lines form brace-delimited blocks: first is globals, then edicts
	let remaining = allLines.slice( lineIdx ).join( '\n' );
	let entnum = - 1; // -1 is the globals

	while ( remaining.length > 0 ) {

		// Find the next { ... } block
		const braceStart = remaining.indexOf( '{' );
		if ( braceStart === - 1 ) break;

		let braceEnd = remaining.indexOf( '}', braceStart );
		if ( braceEnd === - 1 ) break;

		const block = remaining.substring( braceStart, braceEnd + 1 );
		remaining = remaining.substring( braceEnd + 1 );

		// Parse the content inside braces
		let data = block;
		data = COM_Parse( data );
		if ( com_token.length === 0 ) break; // end of file
		if ( com_token !== '{' ) {

			Sys_Error( 'First token isn\'t a brace' );

		}

		if ( entnum === - 1 ) {

			// parse the global vars
			ED_ParseGlobals( data );

		} else {

			// parse an edict
			const ent = EDICT_NUM( entnum );
			ent.free = false;
			ED_ParseEdict( data, ent );
			SV_RespawnRestoreDropModel( ent );
			SV_PinnedZombieSpawned( ent );

			// link it into the bsp tree
			if ( ent.free === false ) {

				SV_LinkEdict( ent, false );

			}

		}

		entnum ++;

	}

	sv.num_edicts = entnum;

 // Loaded START may resume inside a floor-message or late skill brush. Such
 // existing contact must not reapply automatic aids over a manual choice.
 let occupiedSkill = null;
 const loadedPlayer = sv.edicts[ 1 ];
 if ( mapname === 'start' && svs.maxclients === 1 && loadedPlayer && ! loadedPlayer.free && loadedPlayer.v.health > 0 ) {
  const trigger = sv.edicts.slice( 0, entnum ).find( e => e && ! e.free &&
   ( PR_GetString(e.v.classname) === 'trigger_setskill' && /^[0-3]$/.test(PR_GetString(e.v.message)) || /^This hall selects (EASY|NORMAL|HARD) skill$/.test(PR_GetString(e.v.message)) && PR_GetString(e.v.classname) === 'trigger_multiple' ) &&
   [0,1,2].every(k => loadedPlayer.v.absmax[k] >= e.v.absmin[k] && loadedPlayer.v.absmin[k] <= e.v.absmax[k]) );
  if ( trigger ) {
   const hall = /^This hall selects (EASY|NORMAL|HARD) skill$/.exec( PR_GetString(trigger.v.message) );
   occupiedSkill = hall ? ['EASY','NORMAL','HARD'].indexOf(hall[1]) : Number(PR_GetString(trigger.v.message));
  }
 }
 R_FlashlightRunLoaded( mapname, Cvar_VariableValue('r_hdr') !== 0, occupiedSkill );
	sv.time = time;
	const surfaceLine=allLines.find(line=>line.startsWith('// weapon-surface '));
 try{if(surfaceLine&&!weaponSurface.restoreAll(JSON.parse(atob(surfaceLine.slice('// weapon-surface '.length))),sv.time))Con_Printf('Saved weapon surface invalid; current coating retained.\n');}catch(error){Con_Printf('Saved weapon surface could not be restored: %s\n',String(error));}
	weaponSurface.last=sv.time; // Rebase legacy/invalid sidecars too, never age against the previous map clock.
	const shellLine = allLines.find( line => line.startsWith( SHELL_SAVE_PREFIX ) );
	let shellData = null;
	try { if ( shellLine ) shellData = JSON.parse( atob( shellLine.slice( SHELL_SAVE_PREFIX.length ) ) ); } catch ( error ) {

		Con_Printf( 'Saved shotgun shells could not be restored: %s\n', String( error ) );

	}
	R_ShellsRestore( shellData );

	for ( let i = 0; i < NUM_SPAWN_PARMS; i ++ ) {

		svs.clients[ 0 ].spawn_parms[ i ] = spawn_parms[ i ];

	}

	if ( cls.state !== ca_dedicated ) {

		CL_EstablishConnection( 'local' );
		Host_Reconnect_f();

	}

}

function Host_Startdemos_f() {

	if ( cls.state === ca_dedicated ) {

		if ( ! sv.active )
			Cbuf_AddText( 'map start\n' );
		return;

	}

	let c = Cmd_Argc() - 1;
	if ( c > MAX_DEMOS ) {

		Con_Printf( 'Max %i demos in demoloop\n', MAX_DEMOS );
		c = MAX_DEMOS;

	}

	Con_Printf( '%i demo(s) in loop\n', c );

	for ( let i = 1; i < c + 1; i ++ )
		cls.demos[ i - 1 ] = Cmd_Argv( i );

	if ( ! sv.active && cls.demonum !== - 1 && ! cls.demoplayback ) {

		cls.demonum = 0;
		CL_NextDemo();

	} else {

		cls.demonum = - 1;

	}

}

function Host_Demos_f() {

	if ( cls.state === ca_dedicated )
		return;
	if ( cls.demonum === - 1 )
		cls.demonum = 1;
	CL_Disconnect();
	CL_NextDemo();

}

function Host_Stopdemo_f() {

	if ( cls.state === ca_dedicated )
		return;
	if ( ! cls.demoplayback )
		return;
	CL_StopPlayback();
	CL_Disconnect();

}

/*
==================
Host_Class_f

Hexen II's `playerclass` command (uhexen2 Host_Class_f): on the client it records the choice in `_cl_playerclass` and
forwards it, so the server's spawn command can put it on the edict before ClientConnect. On the server the class is
kept on the client and announced to everyone.
==================
*/
function Host_Class_f() {

	if ( ! GameProfile_IsHexen2() ) return; // a client of a Quake server cannot set a Hexen player class

	if ( Cmd_Argc() === 1 ) {

		Con_Printf( 'playerclass is %d\n', Cvar_VariableValue( '_cl_playerclass' ) | 0 );
		return;

	}

	const requested = parseFloat( Cmd_Argc() === 2 ? Cmd_Argv( 1 ) : Cmd_Args() );
	if ( ! Number.isFinite( requested ) || requested < 1 || requested > 5 ) {

		Con_Printf( 'Invalid player class.\n' );
		return;

	}

	if ( cmd_source === src_command ) {

		Cvar_SetValue( '_cl_playerclass', requested );
		if ( cls.state === ca_connected ) Cmd_ForwardToServer();
		return;

	}

	// A load or a hub keeps the class the player already had (native Host_Class_f)
	let playerclass = requested | 0;
	let edictClass = 0;
	const classField = host_client.edict != null ? GetEdictFieldValue( host_client.edict, 'playerclass' ) : null;
	if ( classField !== null ) edictClass = classField.accessor.getFloat( classField.ofs ) | 0;
	if ( sv.loadgame || host_client.playerclass ) playerclass = edictClass || host_client.playerclass || playerclass;
	host_client.playerclass = playerclass;
	if ( host_client.edict != null ) SV_SetHexen2Field( host_client.edict, 'playerclass', playerclass );
	host_client.old_playerclass = playerclass;
	SV_Hexen2UpdateClass( sv.reliable_datagram, svs.clients.indexOf( host_client ), playerclass );

}

/*
==================
Host_PreSpawn_f
==================
*/
function Host_PreSpawn_f() {

	if ( cmd_source === src_command ) {

		Con_Printf( 'prespawn is not valid from the console\n' );
		return;

	}

	if ( host_client.spawned ) {

		Con_Printf( 'prespawn not valid -- allready spawned\n' );
		return;

	}

	SV_CheckSignon( 'prespawn' ); // a signon overflowed during play must not reach a client half cleared (card [34c])
	// Old clients send no argument. Old servers ignore this new client's trailing
	// argument. Exact matching and signon scope keep unknown peers on native bytes.
	host_client.cloakBodyCapability = Cmd_Argc() === 2 && Cmd_Argv( 1 ) === CLOAK_BODY_CAPABILITY;
	SZ_Write( host_client.message, sv.signon.data, sv.signon.cursize );
	MSG_WriteByte( host_client.message, svc_signonnum );
	MSG_WriteByte( host_client.message, 2 );
	host_client.sendsignon = true;

}

/*
==================
Host_Spawn_f
==================
*/
function Host_Spawn_f() {

	if ( cmd_source === src_command ) {

		Con_Printf( 'spawn is not valid from the console\n' );
		return;

	}

	if ( host_client.spawned ) {

		Con_Printf( 'Spawn not valid -- allready spawned\n' );
		return;

	}

	// run the entrance script
	if ( sv.loadgame ) {

		// loaded games are fully inited allready
		// if this is the last client to be connected, unpause
		sv.paused = false;

	} else if ( GameProfile_IsHexen2() ) {

		// uhexen2 Host_Spawn_f: a restored hub keeps its edict and stats; a fresh spawn clears them and puts the
		// chosen class on the entity before ClientConnect, which is where Hexen's gamecode reads it.
		const ent = host_client.edict;
		const restored = GetEdictFieldValue( ent, 'stats_restored' );
		const statsRestored = restored !== null && restored.accessor.getFloat( restored.ofs ) !== 0;
		sv.paused = false;

		if ( ! statsRestored || deathmatch.value ) {

			ent.clearFields();
			const team = ( host_client.colors & 15 ) + 1;
			ent.v.team = team;
			ent.v.netname = ED_NewString( host_client.name );

			// A fresh connection takes the client's `_cl_playerclass`; a level change keeps the class it had.
			let playerclass = host_client.playerclass | 0;
			if ( playerclass < 1 || playerclass > 5 ) playerclass = Cvar_VariableValue( '_cl_playerclass' ) | 0;
			if ( playerclass < 1 || playerclass > 5 ) playerclass = 1;
			host_client.playerclass = playerclass;
			host_client.old_playerclass = playerclass; // the spawn list below announces it
			SV_SetHexen2Field( ent, 'playerclass', playerclass );
			host_client.h2Stats = null; // a fresh player: the next frame sends every stat

			if ( pr_global_struct ) {

				for ( let i = 0; i < NUM_SPAWN_PARMS; i ++ )
					pr_global_struct[ 'parm' + ( i + 1 ) ] = host_client.spawn_parms[ i ];

				pr_global_struct.time = sv.time;
				pr_global_struct.self = EDICT_TO_PROG( sv_player );
				PR_ExecuteProgram( pr_global_struct.ClientConnect );

				if ( ( Sys_FloatTime() - host_client.netconnection.connecttime ) <= sv.time )
					Sys_Printf( '%s entered the game\n', host_client.name );

				PR_ExecuteProgram( pr_global_struct.PutClientInServer );

				SV_RespawnFinishTravel( ent );
				SV_RestorePowerups( ent );
				SV_SeamlessPlacePlayer( ent );

			}

		}

	} else {

		// set up the edict
		const ent = host_client.edict;

		// clear entity fields (C does: memset(&ent->v, 0, progs->entityfields * 4))
		ent.clearFields();

		// set key fields after clearing
		const colormap = NUM_FOR_EDICT( ent );
		const team = ( host_client.colors & 15 ) + 1;
		ent.v.colormap = colormap;
		ent.v.team = team;
		ent.v.netname = ED_NewString( host_client.name );

		// copy spawn parms out of the client_t
		if ( pr_global_struct ) {

			for ( let i = 0; i < NUM_SPAWN_PARMS; i ++ )
				pr_global_struct[ 'parm' + ( i + 1 ) ] = host_client.spawn_parms[ i ];

			// call the spawn function
			pr_global_struct.time = sv.time;
			pr_global_struct.self = EDICT_TO_PROG( sv_player );
			PR_ExecuteProgram( pr_global_struct.ClientConnect );

			if ( ( Sys_FloatTime() - host_client.netconnection.connecttime ) <= sv.time )
				Sys_Printf( '%s entered the game\n', host_client.name );

			PR_ExecuteProgram( pr_global_struct.PutClientInServer );

			SV_RespawnFinishTravel( ent );
			SV_RestorePowerups( ent );

			// arriving through a seamless exit: keep the way you were moving
			SV_SeamlessPlacePlayer( ent );

		}

	}

	// send all current names, colors, and frag counts
	SZ_Clear( host_client.message );

	// send time of update
	MSG_WriteByte( host_client.message, svc_time );
	MSG_WriteFloat( host_client.message, sv.time );

	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const client = svs.clients[ i ];
		MSG_WriteByte( host_client.message, svc_updatename );
		MSG_WriteByte( host_client.message, i );
		MSG_WriteString( host_client.message, client.name );
		if ( GameProfile_IsHexen2() ) SV_Hexen2UpdateClass( host_client.message, i, client.playerclass | 0 );
		MSG_WriteByte( host_client.message, svc_updatefrags );
		MSG_WriteByte( host_client.message, i );
		MSG_WriteShort( host_client.message, client.old_frags );
		MSG_WriteByte( host_client.message, svc_updatecolors );
		MSG_WriteByte( host_client.message, i );
		MSG_WriteByte( host_client.message, client.colors );

	}

	// send all current light styles
	for ( let i = 0; i < MAX_LIGHTSTYLES; i ++ ) {

		MSG_WriteByte( host_client.message, svc_lightstyle );
		MSG_WriteByte( host_client.message, i );
		MSG_WriteString( host_client.message, sv.lightstyles[ i ] || '' );

	}

	// send some stats
	MSG_WriteByte( host_client.message, svc_updatestat );
	MSG_WriteByte( host_client.message, STAT_TOTALSECRETS );
	MSG_WriteLong( host_client.message, pr_global_struct ? pr_global_struct.total_secrets : 0 );

	MSG_WriteByte( host_client.message, svc_updatestat );
	MSG_WriteByte( host_client.message, STAT_TOTALMONSTERS );
	MSG_WriteLong( host_client.message, pr_global_struct ? pr_global_struct.total_monsters : 0 );

	MSG_WriteByte( host_client.message, svc_updatestat );
	MSG_WriteByte( host_client.message, STAT_SECRETS );
	MSG_WriteLong( host_client.message, pr_global_struct ? pr_global_struct.found_secrets : 0 );

	MSG_WriteByte( host_client.message, svc_updatestat );
	MSG_WriteByte( host_client.message, STAT_MONSTERS );
	MSG_WriteLong( host_client.message, pr_global_struct ? pr_global_struct.killed_monsters : 0 );

	// send a fixangle
	const ent = EDICT_NUM( 1 + svs.clients.indexOf( host_client ) );
	MSG_WriteByte( host_client.message, svc_setangle );
	for ( let i = 0; i < 2; i ++ )
		MSG_WriteAngle( host_client.message, ent.v.angles[ i ] );
	MSG_WriteAngle( host_client.message, 0 );

	SV_WriteClientdataToMessage( sv_player, host_client.message );

	MSG_WriteByte( host_client.message, svc_signonnum );
	MSG_WriteByte( host_client.message, 3 );
	host_client.sendsignon = true;

}

/*
==================
Host_Begin_f
==================
*/
function Host_Begin_f() {

	if ( cmd_source === src_command ) {

		Con_Printf( 'begin is not valid from the console\n' );
		return;

	}

	host_client.spawned = true;

}
