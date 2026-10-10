/**
 * @module engine/server/host
 *
 * The host (WinQuake host.c): starts and runs the game loop, local servers and the client, frame timing, and the
 * saved configuration.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `host_parms`, `host_initialized`, `host_basepal`, `host_colormap`; module-level variables
 * `host_time`, `oldrealtime`, `host_error_reentrancy`; browser storage.
 *
 * Errors: calls `Sys_Error` (fatal) at 1 place; throws at 3 places; calls `Host_Error` at 1 place; catches at 3
 * places.
 *
 * `Host_Error` throws back to `Host_Frame`, which ends the current game; entered again while handling one, it calls
 * `Sys_Error`. The configuration is saved in localStorage (`quake_config`).
 */
// Ported from: WinQuake/host.c -- coordinates spawning and killing of local servers

import { SV_CheatsInit, SV_CheatsFrame } from '../common/hooks.js'; // installed by newer/gameplay/sv_cheats.js
import { SV_UnseenFrame } from '../common/hooks.js'; // installed by newer/gameplay/sv_unseen.js
import { Sys_Printf, Sys_Error, Sys_FloatTime } from '../common/sys.js';
import { COM_CheckRegistered, Con_Printf, Con_DPrintf, Con_SetPrintFunctions, SZ_Clear,
	MSG_WriteByte, MSG_WriteString } from '../common/common.js';
import { svc_print, svc_disconnect } from '../common/protocol.js';
import { cvar_t, Cvar_RegisterVariable, Cvar_SetServerBroadcast, Cvar_WriteVariables, Cvar_DropChangedDefaults } from '../common/cvar.js';
import { SV_SeamlessFrame } from '../common/hooks.js'; // installed by newer/gameplay/sv_seamless.js
import { R_WelcomeLoadingHolding } from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js
import { R_BestiaryFrame, R_BestiaryTimeScale, R_BestiaryFrozen } from '../common/hooks.js'; // installed by newer/ui/r_bestiary.js
import { Cmd_Init, Cbuf_Init, Cbuf_Execute, Cbuf_AddText, Cbuf_InsertText, Cmd_SetClientCallbacks } from '../common/cmd.js';
import { Memory_Init } from '../common/zone.js';
import { V_Init, V_SetContentsColor, V_CalcBlend } from '../client/view.js';
import { Chase_Init } from '../client/chase.js';
import { W_LoadWadFile } from '../common/wad.js';
import { COM_LoadFile } from '../common/pak.js';
import { Key_Init, Key_WriteBindings, key_lines, edit_line, key_linepos, chat_buffer } from '../client/keys.js';
import { Con_Init, Con_SetExternals, Con_Printf as RealConPrintf, Con_DPrintf as RealConDPrintf } from '../common/console.js';
import { M_Init, M_SetExternals, M_Draw, M_ConnectionError } from '../client/menu.js';
import { Touch_BottomInset, Touch_ExitFullscreen } from '../../platform/touch.js';
import { MainMenu_Destroy } from '../common/hooks.js'; // installed by newer/ui/menu_webgl.js
import { PR_Init } from '../progs/pr_edict.js';
import { PR_InitBuiltins } from './pr_cmds.js';
import { Mod_Init, Mod_ClearAll, R_InitTextures } from '../render/gl_model.js';
import { NET_Init, NET_Poll, NET_Shutdown, NET_SendMessage, NET_CanSendMessage,
	NET_GetMessage, NET_SendToAll, WT_QueryRooms, WT_CreateRoom } from '../net/net_main.js';
import { SV_Init, SV_CheckForNewClients, SV_ClearDatagram,
	SV_SendClientMessages, SV_DropClient } from './sv_main.js';
import { SV_RunClients } from './sv_user.js';
import { SV_Physics, SV_SetFrametime, sv_gravity } from './sv_phys.js';
import { sv, svs, client_t,
	host_client, set_host_client } from './server.js';
import { R_Init, D_FlushCaches } from '../render/gl_rmisc.js';
import { R_SetExternals } from '../render/gl_rmain.js';
import { VID_Init, VID_Shutdown } from '../render/vid.js';
import { Draw_GetOverlayCanvas, Draw_GetVirtualWidth, Draw_GetVirtualHeight, Draw_Init, Draw_Character, Draw_String, Draw_ConsoleBackground, Draw_SetExternals, Draw_PicFromWad, Draw_CachePic, Draw_Pic, Draw_SubPic, Draw_TransPic, Draw_TransPicTranslate, Draw_Fill, Draw_FadeScreen } from '../render/gl_draw.js';
import { SCR_Init, SCR_UpdateScreen, SCR_SetExternals, SCR_EndLoadingPlaque, SCR_BeginLoadingPlaque } from '../render/gl_screen.js';
import { S_Init, S_Update, S_Shutdown, S_StopAllSounds, S_SetCallbacks } from '../sound/snd_dma.js';
import { CDAudio_Init, CDAudio_Update, CDAudio_Shutdown } from '../sound/cd_audio.js';
import { S_UpdateAmbientMusic } from '../common/hooks.js'; // installed by newer/sound/s_ambientgame.js
import { Sbar_Init, Sbar_SetExternals, Sbar_Changed } from '../client/sbar.js';
import { CL_Init, CL_SendCmd, CL_ReadFromServer, CL_DecayLights, CL_Disconnect, CL_NextDemo, cl_name, CL_SetExternals } from '../client/cl_main.js';
import { CL_Parse_SetExternals } from '../client/cl_parse.js';
import { WT_SetExternals } from '../net/net_webtransport.js';
import { IN_Init, IN_Commands, IN_Shutdown, IN_UpdateTouch, IN_RequestPointerLock, IN_Move } from '../../platform/in_web.js';
import { cls, cl, SIGNONS, ca_connected, ca_dedicated } from '../client/client.js';
import { key_dest, key_game, Key_SetExternals, set_key_dest } from '../client/keys.js';
import { r_origin, vpn, vright, vup } from '../render/render.js';
import { vec3_origin } from '../common/mathlib.js';
import { pr_global_struct } from '../progs/progs.js';
import { vid, d_8to24table, renderer } from '../render/vid.js';
import { V_RenderView, V_UpdatePalette } from '../client/view.js';
import { S_LocalSound } from '../sound/snd_dma.js';
import { M_Menu_Main_f } from '../client/menu.js';
import { R_Efrag_SetExternals } from '../render/gl_refrag.js';
import { R_PerfFrameBegin, R_PerfFrameEnd, R_PerfStage, R_PerfStop } from '../common/hooks.js'; // installed by newer/render/r_perf.js
import { R_TeleportFrameEnd } from '../common/hooks.js'; // installed by newer/render/r_teleportfx.js
import { Host_InitCommands } from './host_cmd.js';
import { R_SetParticleExternals } from '../render/r_part.js';

/*

A server can always be started, even if the system started out as a client
to a remote system.

A client can NOT be started if the system started as a dedicated server.

Memory is cleared / released when a server or client begins, not when they end.

*/

export let host_parms = null;

export let host_initialized = false;

let host_time = 0;
let oldrealtime = 0;

// host_client is imported from server.js (canonical copy)

export let host_basepal = null;
export let host_colormap = null;

const host_framerate = new cvar_t( 'host_framerate', '0' ); // set for slow motion
// how fast a single player game runs (1 = normal; the touch controls' weapon menu slows it right down)
const host_timescale = new cvar_t( 'host_timescale', '1' );
const host_speeds = new cvar_t( 'host_speeds', '0' ); // set for running times

export const sys_ticrate = new cvar_t( 'sys_ticrate', '0.05' );
const serverprofile = new cvar_t( 'serverprofile', '0' );


export const samelevel = new cvar_t( 'samelevel', '0' );
export const noexit = new cvar_t( 'noexit', '0', false, true );

const developer = new cvar_t( 'developer', '0' );


const pausable = new cvar_t( 'pausable', '1' );

const temp1 = new cvar_t( 'temp1', '0' );

// set_host_client is imported and re-exported from server.js
export { set_host_client } from './server.js';
// sv is the server state, re-exported for client-side prediction
export { sv } from './server.js';
import { realtime, host_frametime, host_framecount, set_realtime, set_host_frametime, set_host_framecount } from '../common/host_state.js';
// the frame clock lives in a leaf (card [44g], D1a); the host is its only writer
export { realtime, host_frametime, host_framecount, set_host_frametime } from '../common/host_state.js';
// the server's rule cvars live with the server state (server.js), so it need not import the host (card [44g], D1a)
import { fraglimit, timelimit, teamplay, skill, deathmatch, coop } from './server.js';
import { GameCatalogue_Init } from '../common/game_catalogue.js';
export { fraglimit, timelimit, teamplay, skill, deathmatch, coop } from './server.js';

/*
====================
GL_BeginRendering / GL_EndRendering

In original Quake these are in gl_vidnt.c.
For Three.js, BeginRendering clears the renderer and EndRendering is a no-op
(the browser composites on the next frame automatically).
====================
*/
function _GL_BeginRendering() {

	if ( renderer ) {

		renderer.clear();

	}

}

function _GL_EndRendering() {

	// Three.js presents automatically at end of rAF callback

}

/*
================
Host_ClearMemory
================
*/
/**
 * This clears all the memory used by both the client and server, but does not reinitialize anything. In this port:
 * flushes the render caches (`D_FlushCaches`), drops every loaded model (`Mod_ClearAll`) and resets `cls.signon` to 0;
 * there is no hunk to free (garbage collection handles it), `sv` is reset in `SV_SpawnServer` and `cl` in
 * `CL_ClearState`. Called by `SV_SpawnServer` (sv_main.js) and `CL_ClearState` (cl_main.js, through
 * `CL_SetExternals` wired at the end of this module) when a server or client begins.
 */
export function Host_ClearMemory() {

	Con_DPrintf( 'Clearing memory\n' );
	D_FlushCaches();
	Mod_ClearAll();

	// JS doesn't have hunk memory to free (GC handles it)

	cls.signon = 0;

	// Clear sv and cl structures - in JS we reset key fields
	// sv is reset in SV_SpawnServer via Object.assign
	// cl is reset in CL_ClearState

}

/*
=======================
Host_InitLocal
=======================
*/
function Host_InitLocal() {

	Host_InitCommands();
	SV_CheatsInit(); // (cheat_power, cheat_weapons: Options > Cheats)

	Cvar_RegisterVariable( host_framerate );
	Cvar_RegisterVariable( host_timescale );
	Cvar_RegisterVariable( host_speeds );
	Cvar_RegisterVariable( sys_ticrate );
	Cvar_RegisterVariable( serverprofile );

	Cvar_RegisterVariable( fraglimit );
	Cvar_RegisterVariable( timelimit );
	Cvar_RegisterVariable( teamplay );

	Cvar_RegisterVariable( samelevel );
	Cvar_RegisterVariable( noexit );

	Cvar_RegisterVariable( developer );

	Cvar_RegisterVariable( skill );
	Cvar_RegisterVariable( deathmatch );
	Cvar_RegisterVariable( coop );

	Cvar_RegisterVariable( pausable );

	Cvar_RegisterVariable( temp1 );

	Host_FindMaxClients();

	host_time = 1.0; // so a think at time 0 won't get called

}

/*
======================
Host_FindMaxClients
======================
*/
function Host_FindMaxClients() {

	svs.maxclients = 1;
	svs.maxclientslimit = svs.maxclients;
	if ( svs.maxclientslimit < 4 )
		svs.maxclientslimit = 4;

	// Allocate client slots
	svs.clients = [];
	for ( let i = 0; i < svs.maxclientslimit; i ++ ) {

		svs.clients[ i ] = new client_t();

	}

	cls.state = 1; // ca_disconnected

}

/*
====================
Host_Init
====================
*/
/**
 * Starts the whole engine once at page load, called by main.js after the paks are loaded: the command buffer and
 * commands, the view and chase camera, the host's cvars and client slots, gfx.wad, keys, console, menu, QuakeC,
 * models, networking, server, textures, palette and colormap, video, drawing, screen, renderer, sound, CD audio,
 * status bar, client and input, wiring the externals that need the video and client state as it goes. Then queues
 * `exec quake.rc`, the web port's default WASD and flashlight bindings and always-run speeds, and the configuration
 * saved in localStorage under `quake_config` (its changed defaults dropped; a missing or unavailable store is
 * ignored), registers a `beforeunload` listener that saves the configuration, and sets `host_initialized`.
 *
 * @param {{ basedir: string, argc: number, argv: Array<string> }} parms the startup parameters (main.js); kept in
 *   `host_parms` for the life of the page
 * @returns {Promise<void>} settles when initialisation is done (the body never awaits, so it runs to completion in
 *   the call); rejects when a subsystem's start throws (for example through `Sys_Error`)
 */
export async function Host_Init( parms ) {

	host_parms = parms;

	Memory_Init();
	Cbuf_Init();
	Cmd_Init();
	COM_CheckRegistered();
	V_Init();
	Chase_Init();
	Host_InitLocal();

	Con_Printf( 'Three-Quake Version 1.09\n' );
	Con_Printf( 'Exe: three-quake (JavaScript/Three.js)\n' );

	// W_LoadWadFile("gfx.wad") - load from pak
	const wadData = COM_LoadFile( 'gfx.wad' );
	if ( wadData ) {

		W_LoadWadFile( wadData );
		Con_Printf( 'Loaded gfx.wad\n' );

	} else {

		Con_Printf( 'Warning: gfx.wad not found in pak\n' );

	}

	Key_Init();
	Con_Init();
	GameCatalogue_Init(); // the `games` command: which games are installed (card [34b])

	// Wire up the real console print functions so all modules use the actual console
	Con_SetPrintFunctions( RealConPrintf, RealConDPrintf );

	M_Init();
	PR_Init();
	PR_InitBuiltins(); // the QuakeC built-ins (server/pr_cmds.js)
	Mod_Init();
	NET_Init();
	SV_Init();
	R_SetParticleExternals( { sv_gravity: sv_gravity } );

	// Wire up cvar server broadcast callback
	Cvar_SetServerBroadcast( function ( msg ) {

		if ( sv.active ) {

			SV_BroadcastPrintf( '%s', msg );

		}

	} );

	R_InitTextures(); // needed even for dedicated servers

	// Load palette and colormap from pak
	const paletteData = COM_LoadFile( 'gfx/palette.lmp' );
	if ( paletteData ) {

		host_basepal = new Uint8Array( paletteData );

	} else {

		Con_Printf( 'Warning: gfx/palette.lmp not found\n' );

	}

	const colormapData = COM_LoadFile( 'gfx/colormap.lmp' );
	if ( colormapData ) {

		host_colormap = new Uint8Array( colormapData );

	} else {

		Con_Printf( 'Warning: gfx/colormap.lmp not found\n' );

	}

	VID_Init( host_basepal );

	// Wire Draw externals before Draw_Init so overlay canvas gets correct size
	Draw_SetExternals( {
		vid: vid,
		host_basepal: host_basepal,
		d_8to24table: d_8to24table
	} );

	Draw_Init();

	M_SetExternals( {
		key_dest_set: set_key_dest,
		key_dest_get: () => key_dest,
		cls: cls,
		sv: sv,
		svs: svs,
		cl: cl,
		vid: vid,
		Draw_CachePic: Draw_CachePic,
		Draw_TransPic: Draw_TransPic,
		Draw_Pic: Draw_Pic,
		Draw_Character: Draw_Character,
		Draw_Fill: Draw_Fill,
		Draw_FadeScreen: Draw_FadeScreen,
		Draw_ConsoleBackground: Draw_ConsoleBackground,
		Draw_String: Draw_String,
		S_LocalSound: S_LocalSound,
		SCR_BeginLoadingPlaque: SCR_BeginLoadingPlaque,
		IN_RequestPointerLock: IN_RequestPointerLock,
		host_time_get: () => host_time,
		realtime_get: () => realtime,
		CL_NextDemo: CL_NextDemo,
		WT_QueryRooms: WT_QueryRooms,
		WT_CreateRoom: WT_CreateRoom,
		cl_name: cl_name,
		Draw_TransPicTranslate: Draw_TransPicTranslate,
		Draw_SubPic: Draw_SubPic
	} );

	SCR_Init();
	R_Init();
	S_Init();
	S_SetCallbacks( {
		getHostFrametime: () => host_frametime
	} );
	CDAudio_Init();
	Sbar_SetExternals( {
		cl: cl,
		vid: vid,
		Draw_Pic: Draw_Pic,
		Draw_TransPic: Draw_TransPic,
		Draw_Character: Draw_Character,
		Draw_String: Draw_String,
		Draw_Fill: Draw_Fill,
		Draw_PicFromWad: Draw_PicFromWad,
		Draw_CachePic: Draw_CachePic
	} );
	Sbar_Init();
	CL_Init();
	IN_Init();

	// Wire cmd.js to client state for Cmd_ForwardToServer
	Cmd_SetClientCallbacks( {
		getClientState: () => ( { cls: cls, ca_connected: ca_connected } )
	} );

	// Wire cross-module externals
	Con_SetExternals( {
		cls: cls,
		vid: vid,
		Draw_Character: Draw_Character,
		Draw_String: Draw_String,
		Draw_ConsoleBackground: Draw_ConsoleBackground,
		SCR_UpdateScreen: SCR_UpdateScreen,
		SCR_EndLoadingPlaque: SCR_EndLoadingPlaque,
		M_Menu_Main_f: M_Menu_Main_f,
		S_LocalSound: S_LocalSound,
		getRealtime: () => realtime,
		developer: developer
	} );

	SCR_SetExternals( {
		vid: vid,
		cls: cls,
		cl: cl,
		V_RenderView: V_RenderView,
		V_UpdatePalette: V_UpdatePalette,
		GL_BeginRendering: _GL_BeginRendering,
		GL_EndRendering: _GL_EndRendering,
		S_StopAllSounds: S_StopAllSounds
	} );

	Key_SetExternals( {
		cls: cls,
		vid: vid
	} );

	R_Efrag_SetExternals( {
		cl: cl
	} );

	Cbuf_InsertText( 'exec quake.rc\n' );

	// Default WASD bindings for the web port (after quake.rc so user config can override)
	Cbuf_AddText( 'bind w +forward\n' );
	Cbuf_AddText( 'bind s +back\n' );
	Cbuf_AddText( 'bind a +moveleft\n' );
	Cbuf_AddText( 'bind d +moveright\n' );
	Cbuf_AddText( 'bind SPACE +jump\n' );
	Cbuf_AddText( 'bind f flashlight\n' ); // Newer Game's shoulder flashlight
	Cbuf_AddText( 'bind MOUSE1 +attack\n' );

	// Always run by default for the web port
	Cbuf_AddText( 'cl_forwardspeed 400\n' );
	Cbuf_AddText( 'cl_backspeed 400\n' );

	// Load saved config from localStorage (overrides defaults above)
	try {

		const savedConfig = localStorage.getItem( CONFIG_STORAGE_KEY );
		if ( savedConfig !== null ) {

			Cbuf_AddText( Cvar_DropChangedDefaults( savedConfig ) );
			Con_Printf( 'Loaded saved config from localStorage\n' );

		}

	} catch ( e ) {

		// localStorage may be unavailable
	}

	// Save config on page unload
	if ( typeof window !== 'undefined' ) {

		window.addEventListener( 'beforeunload', function () {

			Host_WriteConfiguration();

		} );

	}

	host_initialized = true;

	Sys_Printf( 'Host_Init complete\n' );

}

/*
==================
Host_ServerFrame
==================
*/
/**
 * Runs server simulation for the current frame, called by `Host_Frame` when a local server is active: hands
 * `host_frametime` to physics and QuakeC (`frametime`), clears the datagram, takes new clients and reads client
 * messages, then runs physics unless the server is paused, Newer Game's bestiary has frozen the game, or (single
 * player) a console or menu holds it or the welcome loading screen is up. Then Newer Game's seamless exit check,
 * cheat power-ups (kept on while a menu holds the game) and the Ring's unseen-player rule, and finally sends every
 * client its messages.
 */
export function Host_ServerFrame() {

	// sync frametime to physics module
	SV_SetFrametime( host_frametime );

	// run the world state
	if ( pr_global_struct ) {

		pr_global_struct.frametime = host_frametime;

	}

	// set the time and clear the general datagram
	SV_ClearDatagram();

	// check for new clients
	SV_CheckForNewClients();

	// read client messages
	SV_RunClients();

	// move things around and think
	// always pause in single player if in console or menus
	if ( ! sv.paused && ! R_BestiaryFrozen() && ( svs.maxclients > 1 || key_dest === key_game ) )
		if(!(R_WelcomeLoadingHolding()&&svs.maxclients===1))SV_Physics();

	// has the player gone through a seamless exit?
	if(!R_BestiaryFrozen()&&!(R_WelcomeLoadingHolding()&&svs.maxclients===1))SV_SeamlessFrame();

	// switched-on cheat power-ups stay on (also while a menu holds the game, so the picture under it shows them at once)
	SV_CheatsFrame();
	// the Ring: no monster keeps hunting an unseen player; one the player hurts hunts where they fired from (sv_unseen.js)
	SV_UnseenFrame();

	// send all messages to the clients
	SV_SendClientMessages();

}

/*
==================
Host_Frame
==================
*/
/**
 * Runs all active servers and the client for one frame, called by main.js's animation loop (or the profiler's pump).
 * Accumulates `realtime` and runs a frame only when at least 1/72 s has passed (except in a timedemo), with
 * `host_frametime` clamped to 0.001..0.1 s (or fixed by `host_framerate`), slowed by `host_timescale` in single
 * player and scaled by Newer Game's bestiary. A frame reads input and touch, runs the command buffer, polls the
 * network, sends the client's move, runs the local server (`Host_ServerFrame`), reads server messages, draws the
 * screen, updates sound (at the view when signed on), CD and ambient music, and counts `host_framecount`. A
 * `Host_Error` or `Host_EndGame` thrown during the frame is caught here (the error's message is printed and the
 * profiler stopped), like C's longjmp, and the next frame runs normally.
 *
 * @param {number} time seconds since the previous call
 * @throws {Error} any error other than a `Host_Error:` or `Host_EndGame:` one, re-thrown
 */
export function Host_Frame( time ) {

	try {

		_Host_Frame_Internal( time );

	} catch ( e ) {

		// Host_Error and Host_EndGame throw to recover (like C's longjmp).
		// Catch and continue to next frame.
		if ( e.message && e.message.startsWith( 'Host_Error:' ) ) {

			R_PerfStop( 'error' ); // a recovered host error must not leave profiler settings active
			Con_Printf( '%s\n', e.message );

		} else if ( e.message && e.message.startsWith( 'Host_EndGame:' ) ) {

			// Normal game end (demo finished, disconnect, etc.) - no need to log

		} else {

			// Unexpected error - re-throw
			throw e;

		}

	}

}

function _Host_Frame_Internal( time ) {

	// keep the random time dependent
	// Math.random() is already random in JS

	// decide the simulation time
	if ( ! _Host_FilterTime( time ) )
		return; // don't run too fast, or packets will flood out

	R_PerfFrameBegin( performance.now() / 1000 );

	// allow mice or other external controllers to add commands
	IN_Commands();

	// update touch controls state based on key_dest
	IN_UpdateTouch();

	// process console commands
	Cbuf_Execute();

	NET_Poll();

	// if running the server locally, make intentions now
	if ( sv.active )
		CL_SendCmd();

	//-------------------
	//
	// server operations
	//
	//-------------------

	if ( sv.active )
		Host_ServerFrame();

	R_PerfStage( 'server' );

	//-------------------
	//
	// client operations
	//
	//-------------------

	// if running the server remotely, send intentions now after
	// the incoming messages have been read
	if ( ! sv.active )
		CL_SendCmd();

	host_time += host_frametime;

	// fetch results from server
	if ( cls.state === ca_connected ) {

		CL_ReadFromServer();

	}

	R_PerfStage( 'client and messages' );

	// update video
	SCR_UpdateScreen();

	// update audio
	if ( cls.signon === SIGNONS ) {

		S_Update( r_origin, vpn, vright, vup );
		CL_DecayLights();

	} else {

		S_Update( vec3_origin, vec3_origin, vec3_origin, vec3_origin );

	}

	CDAudio_Update();
	S_UpdateAmbientMusic();

	set_host_framecount( host_framecount + 1 );

	// (a teleporter's copy of the screen: made now the frame is drawn, and taken down once the new level is up)
	if ( renderer != null ) R_TeleportFrameEnd( performance.now() / 1000, renderer.domElement, Draw_GetOverlayCanvas(), cls.signon === SIGNONS && cl.worldmodel != null );

	R_PerfFrameEnd();

}

/*
==================
_Host_FilterTime

Returns false if the time is too short to run a frame
==================
*/
function _Host_FilterTime( time ) {

	set_realtime( realtime + time );

	// Don't run too fast - cap at 72 FPS
	// This prevents packets from flooding out and keeps physics consistent
	if ( cls.timedemo !== true && realtime - oldrealtime < 1.0 / 72.0 )
		return false; // framerate is too high

	set_host_frametime( realtime - oldrealtime );
	oldrealtime = realtime;

	if ( host_framerate.value > 0 ) {

		set_host_frametime( host_framerate.value );

	} else {

		// don't allow really long or short frames
		if ( host_frametime > 0.1 )
			set_host_frametime( 0.1 );
		if ( host_frametime < 0.001 )
			set_host_frametime( 0.001 );

	}

	// slow motion (single player only: a network game cannot run at its own speed)
	if ( host_timescale.value > 0 && host_timescale.value < 1 && sv.active && svs.maxclients === 1 )
		set_host_frametime( host_frametime * host_timescale.value );
	R_BestiaryFrame( realtime );
	set_host_frametime( host_frametime * R_BestiaryTimeScale() );

	return true;

}

/*
================
Host_Error
================
*/
let host_error_reentrancy = false;

/**
 * This shuts down both the client and server: the engine's recoverable error. Re-enables screen updates, prints
 * "Host_Error: <error>", shuts the local server down, disconnects the client and stops the demo loop
 * (`cls.demonum = -1`), then throws to unwind the call stack back to `Host_Frame` (like C's longjmp), which prints it
 * and carries on with the next frame. Modules below the host reach it through their SetExternals (wired at the end of
 * this module); sv_main.js imports it.
 *
 * @param {string} error the message, used as given (no format arguments are taken; extra arguments are ignored)
 * @returns {never}
 * @throws {Error} always: `Host_Error: <error>`; and via `Sys_Error` ('Host_Error: recursively entered - ...') when
 *   entered again while handling one
 */
export function Host_Error( error ) {

	if ( host_error_reentrancy )
		Sys_Error( 'Host_Error: recursively entered - ' + error );

	host_error_reentrancy = true;

	SCR_EndLoadingPlaque(); // reenable screen updates

	Con_Printf( 'Host_Error: ' + error + '\n' );

	if ( sv.active )
		Host_ShutdownServer( false );

	CL_Disconnect();
	cls.demonum = - 1;

	host_error_reentrancy = false;

	// Throw to unwind the call stack back to Host_Frame (like C's longjmp)
	throw new Error( 'Host_Error: ' + error );

}

/*
================
Host_EndGame
================
*/
/**
 * End the current game without an error, for example when the server disconnects or a demo's packet entities are
 * bad (cl_parse.js, through `CL_Parse_SetExternals`): shuts the local server down, then plays the next demo when the
 * demo loop is running (`cls.demonum !== -1`) or disconnects, and throws to unwind back to `Host_Frame`, which
 * swallows it silently.
 *
 * @param {string} message why the game ended (printed with `Con_DPrintf`)
 * @returns {never}
 * @throws {Error} always: `Host_EndGame: <message>`
 */
export function Host_EndGame( message ) {

	Con_DPrintf( 'Host_EndGame: %s\n', message );

	if ( sv.active )
		Host_ShutdownServer( false );

	if ( cls.demonum !== - 1 ) {

		CL_NextDemo();

	} else {

		CL_Disconnect();

	}

	// Throw to unwind the call stack back to Host_Frame (like C's longjmp)
	throw new Error( 'Host_EndGame: ' + message );

}

/*
================
Host_ShutdownServer
================
*/
// Cached buffer for Host_ShutdownServer disconnect message (avoid per-call allocations)
const _shutdownBuf = new Uint8Array( 4 );
const _shutdownMsg = { allowoverflow: false, overflowed: false, data: _shutdownBuf, maxsize: 4, cursize: 0 };

/**
 * Stops the local server. This only happens at the end of a game, not between levels: by `Host_Error`,
 * `Host_EndGame`, the `map` command, and the client's disconnect (cl_main.js, through `CL_SetExternals`). Does nothing
 * when no server is active. Marks it inactive, disconnects the local client, flushes pending client messages (like
 * the score) for up to 3 seconds, sends every client `svc_disconnect` (`NET_SendToAll`, 5 seconds; prints how many it
 * failed), drops all active clients and replaces `sv` with a fresh server state. The disconnect message uses a
 * cached 4-byte buffer.
 *
 * @param {boolean} crash passed to `SV_DropClient`: true when the connections are already broken, so no farewell
 *   message is sent to each client
 */
export function Host_ShutdownServer( crash ) {

	if ( sv.active === false )
		return;

	sv.active = false;

	// stop all client sounds immediately
	if ( cls.state === ca_connected )
		CL_Disconnect();

	// flush any pending messages - like the score!!!
	const start = Sys_FloatTime();
	let count;
	do {

		count = 0;
		for ( let i = 0; i < svs.maxclients; i ++ ) {

			set_host_client( svs.clients[ i ] );
			if ( host_client.active && host_client.message.cursize > 0 ) {

				if ( NET_CanSendMessage( host_client.netconnection ) ) {

					NET_SendMessage( host_client.netconnection, host_client.message );
					SZ_Clear( host_client.message );

				} else {

					NET_GetMessage( host_client.netconnection );
					count ++;

				}

			}

		}

		if ( ( Sys_FloatTime() - start ) > 3.0 )
			break;

	} while ( count > 0 );

	// make sure all the clients know we're disconnecting
	_shutdownMsg.cursize = 0;
	MSG_WriteByte( _shutdownMsg, svc_disconnect );
	count = NET_SendToAll( _shutdownMsg, 5 );
	if ( count > 0 )
		Con_Printf( 'Host_ShutdownServer: NET_SendToAll failed for ' + count + ' clients\n' );

	// drop all active clients
	for ( let i = 0; i < svs.maxclients; i ++ ) {

		if ( svs.clients[ i ] != null && svs.clients[ i ].active ) {

			set_host_client( svs.clients[ i ] );
			SV_DropClient( crash );

		}

	}

	// clear structures
	Object.assign( sv, new ( sv.constructor )() );

}

/*
===============
Host_WriteConfiguration
===============
*/
const CONFIG_STORAGE_KEY = 'quake_config';

/**
 * Writes key bindings and archived cvars to localStorage under `quake_config` (`Key_WriteBindings` then
 * `Cvar_WriteVariables`, as console command text that `Host_Init` replays at the next start). Called on page unload
 * (`beforeunload`, registered by `Host_Init`) and by `Host_Shutdown`. Does nothing before `Host_Init` finishes; prints
 * "Couldn't save config." when storage refuses the write.
 */
export function Host_WriteConfiguration() {

	if ( host_initialized !== true )
		return;

	const config = Key_WriteBindings() + Cvar_WriteVariables();

	try {

		localStorage.setItem( CONFIG_STORAGE_KEY, config );

	} catch ( e ) {

		Con_Printf( 'Couldn\'t save config.\n' );

	}

}

/*
================
Host_Shutdown
================
*/
/**
 * Cleanly shut down everything, called by the `quit` command (host_cmd.js). Always destroys Newer Game's WebGL main
 * menu; when the host is initialised, saves the configuration, clears `host_initialized` and shuts down CD audio,
 * sound, input, networking and video in reverse order. A second call only destroys the menu again.
 */
export function Host_Shutdown() {

	MainMenu_Destroy();

	if ( ! host_initialized )
		return;

	Host_WriteConfiguration();

	host_initialized = false;

	// Shutdown subsystems in reverse order
	CDAudio_Shutdown();
	S_Shutdown();
	IN_Shutdown();
	NET_Shutdown();
	VID_Shutdown();

	Con_Printf( 'Host_Shutdown complete\n' );

}

/*
================
SV_ClientPrintf
================
*/
/**
 * Sends text across to be displayed in the current `host_client`'s console: writes `svc_print` and the text into its
 * reliable message buffer (sent with its next update). Used by the host's console commands (host_cmd.js). Does
 * nothing when there is no current client.
 *
 * @param {string} fmt the text; each `%s` is replaced in turn by the next argument (no other format codes are
 *   expanded)
 * @param {...*} args values for the `%s` codes; a falsy value (including 0) becomes an empty string
 */
export function SV_ClientPrintf( fmt, ...args ) {

	// Format the string
	let msg = fmt;
	if ( args.length > 0 ) {

		msg = fmt.replace( /%s/g, () => args.shift() || '' );

	}

	// Write to host_client's message buffer
	if ( host_client && host_client.message ) {

		MSG_WriteByte( host_client.message, svc_print );
		MSG_WriteString( host_client.message, msg );

	}

}

/*
================
SV_BroadcastPrintf
================
*/
/**
 * Sends text to all active clients: prints it on the server's console and writes `svc_print` with it into the
 * reliable message of every active, spawned client. Used by the `pause` command (host_cmd.js) and, through
 * `Cvar_SetServerBroadcast` (set by `Host_Init`), to announce changes to `server` cvars while a server is active.
 *
 * @param {string} fmt the text; each `%s` is replaced in turn by the next argument (no other format codes are
 *   expanded)
 * @param {...*} args values for the `%s` codes; a falsy value (including 0) becomes an empty string
 */
export function SV_BroadcastPrintf( fmt, ...args ) {

	// Format the string
	let msg = fmt;
	if ( args.length > 0 ) {

		msg = fmt.replace( /%s/g, () => args.shift() || '' );

	}

	Con_Printf( '%s', msg );

	// Write to all active clients
	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const client = svs.clients[ i ];
		if ( client == null || ! client.active || ! client.spawned ) continue;
		MSG_WriteByte( client.message, svc_print );
		MSG_WriteString( client.message, msg );

	}

}

/*
The calls card [44g] (baseline debt D1a) turned from imports into externals, so that no module below the host imports
it: wired as this module loads, so that wherever the host is loaded they are in place, as the imports they replace
were. Host_Init wires the older externals, which need the video and the client's state.
*/
R_SetExternals( { V_SetContentsColor, V_CalcBlend } );
CL_SetExternals( { Host_Error, Host_ShutdownServer, Host_ClearMemory, IN_Move } );
CL_Parse_SetExternals( { Host_Error, Host_EndGame } );
WT_SetExternals( { M_ConnectionError, M_Menu_Main_f } );
SCR_SetExternals( { M_Draw, Touch_BottomInset } );
Draw_SetExternals( { Sbar_Changed } );
M_SetExternals( { Touch_ExitFullscreen } );
Con_SetExternals( { Draw_GetVirtualWidth, Draw_GetVirtualHeight, key_lines, getEditLine: () => edit_line, getKeyLinepos: () => key_linepos, getChatBuffer: () => chat_buffer } );
