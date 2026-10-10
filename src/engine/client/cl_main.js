/**
 * @module engine/client/cl_main
 *
 * The client's main loop (WinQuake cl_main.c): connecting and disconnecting, relinking entities each frame from the
 * server's updates, dynamic lights and the local copy of Newer Game's per-entity records.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `_rippleFrame`, `_Host_Error`, `_Host_ShutdownServer`,
 * `_Host_ClearMemory`, `_IN_Move`.
 *
 * Errors: throws at 1 place; calls `Host_Error` at 2 places; catches at 2 places.
 */
import {R_DemonBakeRelease} from '../common/hooks.js'; // installed by newer/assets/r_demonbakes.js
import {R_PowerVisionReset} from '../common/hooks.js'; // installed by newer/render/r_powervision.js
import {R_QuadVisionReset} from '../common/hooks.js'; // installed by newer/render/r_quadvision.js
import {R_FaceGameReset} from '../common/hooks.js'; // installed by newer/ui/r_facegame.js
import { SV_RendVeilClientRecord } from '../common/hooks.js'; // installed by newer/gameplay/sv_rendveil.js
// Ported from: WinQuake/cl_main.c -- client main loop
import { R_DemoLoadingFreeze, R_DemoLoadingCancel, R_WelcomeLoadingHolding } from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js

import { MAX_MODELS, MAX_SOUNDS, MAX_EDICTS, MAX_LIGHTSTYLES,
	STAT_HEALTH, STAT_FRAGS, STAT_WEAPON, STAT_AMMO, STAT_ARMOR,
	STAT_WEAPONFRAME, STAT_SHELLS, STAT_ACTIVEWEAPON, STAT_MONSTERS,
	STAT_SECRETS } from '../common/quakedef.js';
import { Con_Printf, Con_DPrintf, SZ_Alloc, SZ_Clear,
	MSG_WriteByte, MSG_WriteString } from '../common/common.js';
import { NET_Connect, NET_SendMessage, NET_SendUnreliableMessage, NET_CanSendMessage, NET_Close } from '../net/net_main.js';
import { cvar_t, Cvar_RegisterVariable, Cvar_VariableValue } from '../common/cvar.js';
import { Cmd_AddCommand } from '../common/cmd.js';
import { Cbuf_InsertText } from '../common/cmd.js';
import { clc_disconnect, clc_stringcmd } from '../common/protocol.js';
import { CL_GetMessage, CL_Record_f, CL_PlayDemo_f, CL_PlayAttractDemo_f, CL_TimeDemo_f, CL_StopPlayback, CL_Stop_f } from './cl_demo.js';
import { CL_ParseServerMessage } from './cl_parse.js';
import { SIGNONS, MAX_DLIGHTS, MAX_EFRAGS, MAX_BEAMS, MAX_TEMP_ENTITIES,
	MAX_DEMOS, MAX_VISEDICTS,
	ca_dedicated, ca_disconnected, ca_connected,
	cl, cls, cl_efrags, cl_entities,
	cl_lightstyle, cl_dlights, cl_temp_entities, cl_beams,
	cl_numvisedicts, cl_visedicts, set_cl_numvisedicts,
	dlight_t, entity_t, efrag_t, lightstyle_t, beam_t,
	client_state_t, usercmd_t, cshift_t,
	NUM_CSHIFTS } from './client.js';
import { anglemod, VectorCopy, VectorMA, AngleVectors } from '../common/mathlib.js';
import { R_RocketTrail, R_RemoveEfrags, R_EntityParticles } from '../render/render.js';
import { R_ImpactMissile } from '../common/hooks.js'; // installed by newer/render/r_impactripples.js
import { R_FlashlightRunEnd } from '../common/hooks.js'; // installed by newer/render/r_flashlightrun.js
import { R_DemoSplitEnd } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js
import { R_MuzzleFlashFired, R_MuzzleView, R_MuzzleFlashScale } from '../common/hooks.js'; // installed by newer/render/r_muzzle.js
import { R_NewerGame } from '../common/hooks.js'; // installed by newer/mode.js
import { CL_InitTEnts, CL_UpdateTEnts } from './cl_tent.js';
import { host_frametime, realtime } from '../common/host_state.js';
import { sv } from '../server/server.js';
import { SCR_EndLoadingPlaque, SCR_BeginLoadingPlaque } from '../render/gl_screen.js';
import { S_StopAllSounds } from '../sound/snd_dma.js';
import { M_ConnectionError, M_ShouldReturnOnError } from './menu.js';
import { key_menu, set_key_dest } from './keys.js';
import { CL_InitPrediction, CL_ResetPrediction, CL_PredictMove,
	CL_GetPredictedPlayer, CL_SetUpPlayerPrediction,
	CL_GetServerSequence, CL_GetValidSequence, CL_GetEntityFrame,
	cl_simorg, cl_simvel, cl_simangles, cl_nopred, set_cl_simonground } from './cl_pred.js';
// the dynamic-light allocator lives with the lights in client.js, so the renderer need not import this module ([44g], D1a)
import { CL_AllocDlight } from './client.js';
export { CL_AllocDlight } from './client.js';

// Re-export prediction state for view.js to use
export { cl_simorg, cl_simvel, cl_simangles, cl_nopred };

// we need to declare some mouse variables here, because the menu system
// references them even when on a unix system.

// these two are not intended to be set directly
export const cl_name = new cvar_t( '_cl_name', 'player', true );
export const cl_color = new cvar_t( '_cl_color', '0', true );

export const cl_shownet = new cvar_t( 'cl_shownet', '0' ); // can be 0, 1, or 2
export const cl_nolerp = new cvar_t( 'cl_nolerp', '0' );

export const lookspring = new cvar_t( 'lookspring', '0', true );
export const lookstrafe = new cvar_t( 'lookstrafe', '0', true );
export const sensitivity = new cvar_t( 'sensitivity', '3', true );

export const m_pitch = new cvar_t( 'm_pitch', '0.022', true );
export const m_yaw = new cvar_t( 'm_yaw', '0.022', true );
export const m_forward = new cvar_t( 'm_forward', '1', true );
export const m_side = new cvar_t( 'm_side', '0.8', true );

/*
=====================
CL_ClearState

=====================
*/
/**
 * Wipes the per-server client state (WinQuake cl_main.c, where it is a memset of `cl`) when a server info message
 * arrives (CL_ParseServerInfo, at the start of every level and connection). Resets the Newer Game power, quad and face
 * views; clears the host's memory when no local server is running; resets prediction; puts every field of `cl` back to
 * its starting value (with a fresh `cl.cmd` and `cl.viewent`); empties `cls.message`; replaces every entry of
 * `cl_entities` (each tagged with its `_entityIndex`), `cl_dlights`, `cl_lightstyle`, `cl_temp_entities` and `cl_beams`
 * with a new object, so references kept from the previous level go stale; and clears and re-chains `cl_efrags` as the
 * `cl.free_efrags` free list. `cl_static_entities` is left as is.
 */
export function CL_ClearState() {
	R_PowerVisionReset();
	R_QuadVisionReset();
	R_FaceGameReset();

	if ( sv.active === false )
		_Host_ClearMemory();

	// Reset client-side prediction state
	CL_ResetPrediction();

	// wipe the entire cl structure
	// In JS we reset the fields instead of memset
	cl.movemessages = 0;
	cl.cmd = new usercmd_t();
	cl.stats.fill( 0 );
	cl.items = 0;
	cl.item_gettime.fill( 0 );
	cl.faceanimtime = 0;

	for ( let i = 0; i < NUM_CSHIFTS; i ++ ) {

		cl.cshifts[ i ].destcolor[ 0 ] = 0;
		cl.cshifts[ i ].destcolor[ 1 ] = 0;
		cl.cshifts[ i ].destcolor[ 2 ] = 0;
		cl.cshifts[ i ].percent = 0;
		cl.prev_cshifts[ i ].destcolor[ 0 ] = 0;
		cl.prev_cshifts[ i ].destcolor[ 1 ] = 0;
		cl.prev_cshifts[ i ].destcolor[ 2 ] = 0;
		cl.prev_cshifts[ i ].percent = 0;

	}

	cl.mviewangles[ 0 ].fill( 0 );
	cl.mviewangles[ 1 ].fill( 0 );
	cl.viewangles.fill( 0 );
	cl.mvelocity[ 0 ].fill( 0 );
	cl.mvelocity[ 1 ].fill( 0 );
	cl.velocity.fill( 0 );
	cl.punchangle.fill( 0 );
	cl.idealpitch = 0;
	cl.pitchvel = 0;
	cl.nodrift = false;
	cl.driftmove = 0;
	cl.laststop = 0;
	cl.viewheight = 0;
	cl.crouch = 0;
	cl.paused = false;
	cl.onground = false;
	cl.inwater = false;
	cl.intermission = 0;
	cl.completed_time = 0;
	cl.mtime[ 0 ] = 0;
	cl.mtime[ 1 ] = 0;
	cl.time = 0;
	cl.oldtime = 0;
	cl.last_received_message = 0;
	cl.protocol = 15; // until the next serverinfo says otherwise (card [34f])
	cl.model_precache.fill( null );
	cl.sound_precache.fill( null );
	cl.levelname = '';
	cl.viewentity = 0;
	cl.maxclients = 0;
	cl.gametype = 0;
	cl.worldmodel = null;
	cl.free_efrags = null;
	cl.num_entities = 0;
	cl.num_statics = 0;
	cl.viewent = new entity_t();
	cl.cdtrack = 0;
	cl.looptrack = 0;
	cl.scores = null;

	SZ_Clear( cls.message );

	// clear other arrays
	for ( let i = 0; i < MAX_EFRAGS; i ++ ) {

		cl_efrags[ i ].leaf = null;
		cl_efrags[ i ].leafnext = null;
		cl_efrags[ i ].entity = null;
		cl_efrags[ i ].entnext = null;

	}

	for ( let i = 0; i < MAX_EDICTS; i ++ ) {

		cl_entities[ i ] = new entity_t();
		cl_entities[ i ]._entityIndex = i;

	}

	for ( let i = 0; i < MAX_DLIGHTS; i ++ )
		cl_dlights[ i ] = new dlight_t();

	for ( let i = 0; i < MAX_LIGHTSTYLES; i ++ )
		cl_lightstyle[ i ] = new lightstyle_t();

	for ( let i = 0; i < MAX_TEMP_ENTITIES; i ++ )
		cl_temp_entities[ i ] = new entity_t();

	for ( let i = 0; i < MAX_BEAMS; i ++ )
		cl_beams[ i ] = new beam_t();

	//
	// allocate the efrags and chain together into a free list
	//
	cl.free_efrags = cl_efrags[ 0 ];
	for ( let i = 0; i < MAX_EFRAGS - 1; i ++ )
		cl_efrags[ i ].entnext = cl_efrags[ i + 1 ];
	cl_efrags[ MAX_EFRAGS - 1 ].entnext = null;

}

/*
=====================
CL_Disconnect
=====================
*/
/**
 * Sends a disconnect message to the server (WinQuake cl_main.c). This is also called on Host_Error, so it shouldn't
 * cause any errors. Also called by Host_EndGame, Host_ShutdownServer, the `disconnect` command and the `map`,
 * `connect`, `load`, `demos` and `stopdemo` commands. Releases Newer Game's hold on the world's baked displacement data
 * (R_DemonBakeRelease), cancels a held welcome loading screen and stops all sounds. When playing a demo it stops
 * playback; when connected it stops any recording, sends an unreliable clc_disconnect, closes `cls.netcon`, sets
 * `cls.state` to `ca_disconnected` and shuts down a local server. Always clears demo playback/timedemo, gives back the
 * cvars a demo split borrowed (R_DemoSplitEnd) and resets `cls.signon` to 0. Safe to call when already disconnected.
 */
export function CL_Disconnect() {
	R_DemonBakeRelease();
	if(R_WelcomeLoadingHolding())R_DemoLoadingCancel();

	// stop sounds (especially looping!)
	S_StopAllSounds( true );

	// bring the console down and fade the colors back to normal
	// SCR_BringDownConsole();

	// if running a local server, shut it down
	if ( cls.demoplayback ) {

		CL_StopPlayback();

	} else if ( cls.state === ca_connected ) {

		if ( cls.demorecording )
			CL_Stop_f();

		Con_DPrintf( 'Sending clc_disconnect\n' );
		SZ_Clear( cls.message );
		MSG_WriteByte( cls.message, clc_disconnect );
		NET_SendUnreliableMessage( cls.netcon, cls.message );
		SZ_Clear( cls.message );

		if ( cls.netcon != null ) {

			NET_Close( cls.netcon );
			cls.netcon = null;

		}

		cls.state = ca_disconnected;
		if ( sv.active )
			_Host_ShutdownServer( false );

	}

	cls.demoplayback = cls.timedemo = false;
	R_DemoSplitEnd();
	cls.signon = 0;

}

/**
 * The `disconnect` console command (registered by CL_Init). Cancels the demo loading screen, ends a flashlight run
 * (an explicit exit, unlike a load or connect during a run), disconnects, shuts down a local server, and removes a
 * `room=` query from the browser URL so a reload does not rejoin the room.
 */
export function CL_Disconnect_f() {
	R_DemoLoadingCancel();

	R_FlashlightRunEnd(); // explicit exit, unlike load/connect during a run
	CL_Disconnect();
	if ( sv.active )
		_Host_ShutdownServer( false );

	// Clear room from browser URL on explicit disconnect
	if ( typeof window !== 'undefined' && window.location.search.includes( 'room=' ) ) {

		history.replaceState( null, '', window.location.pathname );

	}

}

/*
=====================
CL_EstablishConnection
=====================
*/
/**
 * Opens a connection to a server (WinQuake cl_main.c). Host should be either "local" or a net address to be passed on;
 * for remote connections, this handles async WebTransport connections. Called by the `connect` command (which then
 * runs Host_Reconnect_f when the promise resolves) and by the `load` command (Host_Loadgame_f) with "local". Does nothing on
 * a dedicated server or during demo playback. Disconnects first; a "local" connect also drops any `room=` from the
 * browser URL. The loopback connection completes synchronously, before the first await; a WebTransport one is raced
 * against a 30-second timeout. On success sets `cls.netcon`, `cls.demonum` to -1 (out of the demo loop),
 * `cls.state` to `ca_connected` and `cls.signon` to 0, and for a `?room=` address writes a shareable room URL into the
 * browser history. On failure prints `CL_Connect: ...` and, when the menu asks for it (M_ShouldReturnOnError), shows
 * the error in the menu and sets key_dest to the menu.
 *
 * @param {string} host "local" for the in-browser loopback server, or a server address such as
 *   `wts://host:port?room=id`
 * @returns {Promise<void>} settles when the attempt finishes; connection errors are caught and reported, not rejected
 */
export async function CL_EstablishConnection( host ) {

	if ( cls.state === ca_dedicated )
		return;

	if ( cls.demoplayback )
		return;

	CL_Disconnect();

	// Clear room from browser URL when connecting to single player (local)
	if ( host === 'local' && typeof window !== 'undefined' && window.location.search.includes( 'room=' ) ) {

		history.replaceState( null, '', window.location.pathname );

	}

	try {

		// NET_Connect may return a Promise for async connections (WebTransport)
		const result = NET_Connect( host );
		if ( result instanceof Promise ) {

			// Async connection (WebTransport) with timeout
			Con_Printf( 'Connecting to %s...\n', host );

			// 30-second timeout for connection attempts
			const CONNECTION_TIMEOUT_MS = 30000;
			const timeoutPromise = new Promise( ( _, reject ) => {

				setTimeout( () => reject( new Error( 'Connection timed out after 30 seconds' ) ), CONNECTION_TIMEOUT_MS );

			} );

			cls.netcon = await Promise.race( [ result, timeoutPromise ] );

		} else {

			// Sync connection (loopback)
			cls.netcon = result;

		}

	} catch ( error ) {

		// Connection failed with error
		Con_Printf( 'CL_Connect: %s\n', error.message || 'connection failed' );

		// Return to menu if we should
		if ( M_ShouldReturnOnError() ) {

			M_ConnectionError( error.message || 'Connection failed' );
			set_key_dest( key_menu );

		}

		return;

	}

	if ( ! cls.netcon ) {

		Con_Printf( 'CL_Connect: connect failed\n' );

		// Return to menu if we should
		if ( M_ShouldReturnOnError() ) {

			M_ConnectionError( 'Connection refused' );
			set_key_dest( key_menu );

		}

		return;

	}

	Con_DPrintf( 'CL_EstablishConnection: connected to %s\n', host );

	// Update browser URL with room ID for sharing
	if ( typeof window !== 'undefined' && host.includes( '?room=' ) ) {

		try {

			const url = new URL( host );
			const roomId = url.searchParams.get( 'room' );
			if ( roomId ) {

				const shareUrl = window.location.origin + window.location.pathname + '?room=' + roomId;
				history.replaceState( null, '', shareUrl );

			}

		} catch ( e ) {

			// Ignore URL parsing errors

		}

	}

	cls.demonum = - 1; // not in the demo loop now
	cls.state = ca_connected;
	cls.signon = 0; // need all the signon messages before playing

}

/*
=====================
CL_SignonReply
=====================
*/
/**
 * An svc_signonnum has been received, perform a client side setup (WinQuake cl_main.c). Called by CL_ParseServerMessage
 * after it advances `cls.signon`, and by the first entity update (CL_ParseUpdate or CL_ParsePacketEntities) that
 * completes the last stage. Queues the reply for the current stage on `cls.message` (sent by CL_SendCmd): 1 `prespawn`;
 * 2 `name`, `color` (from `_cl_color`: top in the high 4 bits, bottom in the low) and `spawn` with `cls.spawnparms`;
 * 3 `begin`; 4 (SIGNONS) ends the loading plaque so the screen updates normally.
 */
export function CL_SignonReply() {

	Con_DPrintf( 'CL_SignonReply: %i\n', cls.signon );

	switch ( cls.signon ) {

		case 1:
			MSG_WriteByte( cls.message, clc_stringcmd );
			MSG_WriteString( cls.message, 'prespawn' );
			break;

		case 2:
			MSG_WriteByte( cls.message, clc_stringcmd );
			MSG_WriteString( cls.message, 'name "' + cl_name.string + '"\n' );

			MSG_WriteByte( cls.message, clc_stringcmd );
			MSG_WriteString( cls.message, 'color ' + ( ( cl_color.value | 0 ) >> 4 ) + ' ' + ( ( cl_color.value | 0 ) & 15 ) + '\n' );

			MSG_WriteByte( cls.message, clc_stringcmd );
			MSG_WriteString( cls.message, 'spawn ' + cls.spawnparms );
			break;

		case 3:
			MSG_WriteByte( cls.message, clc_stringcmd );
			MSG_WriteString( cls.message, 'begin' );
			// Cache_Report();  // print remaining memory
			break;

		case 4:
			SCR_EndLoadingPlaque(); // allow normal screen updates
			break;

	}

}

/*
=====================
CL_NextDemo
=====================
*/
/**
 * Called to play the next demo in the demo loop (WinQuake cl_main.c): by Host_EndGame when a demo ends while the loop
 * runs, and by the `startdemos` and `demos` commands. Does nothing when `cls.demonum` is -1. Shows the loading plaque,
 * wraps to the first demo at the end of `cls.demos`, and inserts `playattractdemo <name>` at the front of the command
 * buffer, then advances `cls.demonum`. With no demos listed it prints "No demos listed with startdemos" and sets
 * `cls.demonum` to -1.
 */
export function CL_NextDemo() {

	if ( cls.demonum === - 1 )
		return; // don't play demos

	SCR_BeginLoadingPlaque();

	if ( ! cls.demos[ cls.demonum ] || cls.demonum === MAX_DEMOS ) {

		cls.demonum = 0;
		if ( ! cls.demos[ cls.demonum ] ) {

			Con_Printf( 'No demos listed with startdemos\n' );
			cls.demonum = - 1;
			return;

		}

	}

	Cbuf_InsertText( 'playattractdemo ' + cls.demos[ cls.demonum ] + '\n' );
	cls.demonum ++;

}

/*
==============
CL_PrintEntities_f
==============
*/
function CL_PrintEntities_f() {

	for ( let i = 0; i < cl.num_entities; i ++ ) {

		const ent = cl_entities[ i ];
		Con_Printf( '%3i:', i );
		if ( ! ent.model ) {

			Con_Printf( 'EMPTY\n' );
			continue;

		}

		Con_Printf( '%s:%2i  (%5.1f,%5.1f,%5.1f) [%5.1f %5.1f %5.1f]\n',
			ent.model.name, ent.frame,
			ent.origin[ 0 ], ent.origin[ 1 ], ent.origin[ 2 ],
			ent.angles[ 0 ], ent.angles[ 1 ], ent.angles[ 2 ] );

	}

}

/*
=================
CL_ViewMuzzleFlash
=================
*/
const _flashFv = new Float32Array( 3 );
const _flashRv = new Float32Array( 3 );
const _flashUv = new Float32Array( 3 );

/**
 * The player's weapon has just fired (their ammunition went down). Newer Game only: a flash of light at the gun. It
 * does not wait for the game to flag a muzzle flash on the player's entity, so it is there the moment the shot is.
 * Called by CL_ParseClientdata when STAT_AMMO drops. Does nothing outside Newer Game, before the view entity is known,
 * or when the muzzle module has no camera position (R_MuzzleView null). Otherwise tells the muzzle module a shot fired
 * and takes the view entity's dynamic light: 20 units ahead of and 4 below the camera, radius 240..271 Quake units
 * scaled by 0.35 + 0.65 x `flashScale` (R_MuzzleFlashScale, dimmer in a lit room, stored on the light), minlight 32,
 * lasting 0.12 seconds of cl.time.
 */
export function CL_ViewMuzzleFlash() {

	if ( R_NewerGame() === false || cl.viewentity <= 0 ) return;

	// from the camera itself: the local player's entity is not kept up to date here
	const eye = R_MuzzleView();
	if ( eye === null ) return;

	R_MuzzleFlashFired();

	const dl = CL_AllocDlight( cl.viewentity );
	VectorCopy( eye, dl.origin );
	AngleVectors( cl.viewangles, _flashFv, _flashRv, _flashUv );
	VectorMA( dl.origin, 20, _flashFv, dl.origin );
	VectorMA( dl.origin, - 4, _flashUv, dl.origin );
	dl.flashScale = R_MuzzleFlashScale();
	dl.radius = ( 240 + ( Math.random() * 32 | 0 ) ) * ( 0.35 + 0.65 * dl.flashScale );
	dl.minlight = 32;
	dl.die = cl.time + 0.12;

}


/*
===============
CL_DecayLights
===============
*/
/**
 * Shrinks each live dynamic light by its `decay` (Quake units per second) times the cl.time elapsed since the last
 * frame, not below 0 (WinQuake cl_main.c). Lights past their `die` time or already at radius 0 are skipped. Called by
 * Host_Frame once a frame after the sound update, only when the signon is complete.
 */
export function CL_DecayLights() {

	const time = cl.time - cl.oldtime;

	for ( let i = 0; i < MAX_DLIGHTS; i ++ ) {

		const dl = cl_dlights[ i ];
		if ( dl.die < cl.time || dl.radius <= 0 )
			continue;

		dl.radius -= time * dl.decay;
		if ( dl.radius < 0 )
			dl.radius = 0;

	}

}

/*
===============
CL_LerpPoint
===============
*/
/**
 * Determines the fraction between the last two messages that the objects should be put at (WinQuake cl_main.c).
 * Called at the start of CL_RelinkEntities each frame. With no gap between the two message times, `cl_nolerp` set, a
 * timedemo or a local server, it snaps cl.time to the newest message and returns 1. A gap over 0.1 s (a dropped packet
 * or the start of a demo) is cut to 0.1 s by moving `cl.mtime[1]`. When cl.time strays more than 1% outside the two
 * message times it is pulled back to the nearer one.
 *
 * @returns {number} 0..1: 0 at the older message time `cl.mtime[1]`, 1 at the newest `cl.mtime[0]`
 */
export function CL_LerpPoint() {

	let f = cl.mtime[ 0 ] - cl.mtime[ 1 ];

	if ( f === 0 || cl_nolerp.value !== 0 || cls.timedemo || sv.active ) {

		cl.time = cl.mtime[ 0 ];
		return 1;

	}

	if ( f > 0.1 ) {

		// dropped packet, or start of demo
		cl.mtime[ 1 ] = cl.mtime[ 0 ] - 0.1;
		f = 0.1;

	}

	let frac = ( cl.time - cl.mtime[ 1 ] ) / f;

	if ( frac < 0 ) {

		if ( frac < - 0.01 ) {

			cl.time = cl.mtime[ 1 ];

		}

		frac = 0;

	} else if ( frac > 1 ) {

		if ( frac > 1.01 ) {

			cl.time = cl.mtime[ 0 ];

		}

		frac = 1;

	}

	return frac;

}

/*
===============
CL_LinkPacketEntities

Links non-player entities from QW-style packet_entities into the
visible entity list. Handles effects, dynamic lights, and particle trails.
Ported from: QW/client/cl_ents.c
===============
*/

// Cached vectors for CL_LinkPacketEntities (avoid per-frame allocations)
const _peOldorg = new Float32Array( 3 );
const _peDelta = new Float32Array( 3 );
const _peFv = new Float32Array( 3 );
const _peRv = new Float32Array( 3 );
const _peUv = new Float32Array( 3 );

// (a missile's ring needs the entity to have been linked on the previous frame too: a reused slot keeps the last occupant's origin)
let _rippleFrame = 0;

function CL_LinkPacketEntities( frac ) {

	_rippleFrame ++;

	const seq = CL_GetServerSequence();
	if ( CL_GetValidSequence() === 0 )
		return;

	const eframe = CL_GetEntityFrame( seq );
	if ( eframe.invalid )
		return;

	const pack = eframe.packet_entities;
	const autorotate = anglemod( 100 * cl.time );

	for ( let pnum = 0; pnum < pack.num_entities; pnum ++ ) {

		const s1 = pack.entities[ pnum ];

		// if set to invisible, skip
		if ( s1.modelindex === 0 )
			continue;

		// spawn light flashes, even ones coming from invisible objects
		if ( s1.effects & 0x0001 ) { // EF_BRIGHTFIELD

			// Need entity origin — use cl_entities entry which has previous frame's origin
			const bfEnt = cl_entities[ s1.number ];
			R_EntityParticles( bfEnt );

		}

		if ( s1.effects & 0x0004 ) { // EF_BRIGHTLIGHT

			const dl = CL_AllocDlight( s1.number );
			dl.origin[ 0 ] = s1.origin[ 0 ];
			dl.origin[ 1 ] = s1.origin[ 1 ];
			dl.origin[ 2 ] = s1.origin[ 2 ] + 16;
			dl.radius = 400 + ( Math.random() * 32 | 0 );
			dl.die = cl.time + 0.001;

		}

		if ( s1.effects & 0x0008 ) { // EF_DIMLIGHT

			const dl = CL_AllocDlight( s1.number );
			dl.origin[ 0 ] = s1.origin[ 0 ];
			dl.origin[ 1 ] = s1.origin[ 1 ];
			dl.origin[ 2 ] = s1.origin[ 2 ];
			dl.radius = 200 + ( Math.random() * 32 | 0 );
			dl.die = cl.time + 0.001;

		}

		if ( s1.effects & 0x0002 ) { // EF_MUZZLEFLASH

			const dl = CL_AllocDlight( s1.number );
			dl.origin[ 0 ] = s1.origin[ 0 ];
			dl.origin[ 1 ] = s1.origin[ 1 ];
			dl.origin[ 2 ] = s1.origin[ 2 ] + 16;
			AngleVectors( s1.angles, _peFv, _peRv, _peUv );
			VectorMA( dl.origin, 18, _peFv, dl.origin );
			dl.radius = 200 + ( Math.random() * 32 | 0 );
			dl.minlight = 32;
			dl.die = cl.time + 0.1;

		}

		// create a new entity
		if ( cl_numvisedicts >= MAX_VISEDICTS )
			break; // object list is full

		// Use the cl_entities entry directly for rendering (it has the Three.js mesh cache)
		const ent = cl_entities[ s1.number ];
		// Local play normally uses QW packet entities, not CL_ParseUpdate.
		// Copy the native lifetime identity on this path too, including slot reuse.
		if ( sv.active && ! cls.demoplayback ) ent._faceSeed = sv.edicts[ s1.number ]?._faceSeed ?? null;
		ent._rendVeil = SV_RendVeilClientRecord( s1.number );
		ent._rendVeilTime = ent._rendVeil ? sv.time : null;

		// Update entity fields from packet entity state
		const model = cl.model_precache[ s1.modelindex ];

		if ( model !== ent.model ) {

			ent.model = model;
			if ( model != null ) {

				if ( model.synctype === 1 ) // ST_RAND
					ent.syncbase = ( Math.random() * 0x7fff | 0 ) / 0x7fff;
				else
					ent.syncbase = 0.0;

			}

		}

		ent.frame = s1.frame;
		ent.skinnum = s1.skin;
		ent.effects = s1.effects;

		// set colormap
		if ( s1.colormap === 0 ) {

			ent.colormap = null;

		} else if ( s1.colormap > 0 && s1.colormap <= cl.maxclients && cl.scores != null ) {

			ent.colormap = cl.scores[ s1.colormap - 1 ].translations;

		}

		// Save previous origin for trails
		VectorCopy( ent.origin, _peOldorg );

		//
		// Interpolation: track per-entity server positions using msg_origins
		// similar to the NQ-style entity interpolation in CL_RelinkEntities.
		// Update msg_origins only when new server data arrives (sequence changed).
		//
		if ( ent._lastPESeq === 0 || seq - ent._lastPESeq > 64 ) {

			// First appearance or entity was gone for a long time — snap to current
			VectorCopy( s1.origin, ent.msg_origins[ 0 ] );
			VectorCopy( s1.origin, ent.msg_origins[ 1 ] );
			VectorCopy( s1.angles, ent.msg_angles[ 0 ] );
			VectorCopy( s1.angles, ent.msg_angles[ 1 ] );
			ent._lastPESeq = seq;

		} else if ( ent._lastPESeq !== seq ) {

			// New server data — shift old position and store new
			VectorCopy( ent.msg_origins[ 0 ], ent.msg_origins[ 1 ] );
			VectorCopy( s1.origin, ent.msg_origins[ 0 ] );
			VectorCopy( ent.msg_angles[ 0 ], ent.msg_angles[ 1 ] );
			VectorCopy( s1.angles, ent.msg_angles[ 0 ] );
			ent._lastPESeq = seq;

		}

		// rotate binary objects locally
		if ( model != null && ( model.flags & 0x0008 ) ) { // EF_ROTATE

			ent.angles[ 0 ] = 0;
			ent.angles[ 1 ] = autorotate;
			ent.angles[ 2 ] = 0;

		} else {

			// Interpolate angles with short-path wrapping
			let f = frac;
			for ( let i = 0; i < 3; i ++ ) {

				let d = ent.msg_angles[ 0 ][ i ] - ent.msg_angles[ 1 ][ i ];
				if ( d > 180 )
					d -= 360;
				else if ( d < - 180 )
					d += 360;
				ent.angles[ i ] = ent.msg_angles[ 1 ][ i ] + f * d;

			}

		}

		// Interpolate origin with teleport detection
		{

			let f = frac;
			for ( let i = 0; i < 3; i ++ ) {

				_peDelta[ i ] = ent.msg_origins[ 0 ][ i ] - ent.msg_origins[ 1 ][ i ];
				if ( _peDelta[ i ] > 100 || _peDelta[ i ] < - 100 )
					f = 1; // assume a teleportation, not a motion

			}

			for ( let i = 0; i < 3; i ++ ) {

				ent.origin[ i ] = ent.msg_origins[ 1 ][ i ] + f * _peDelta[ i ];

			}

		}

		// Mark as updated this frame
		ent.msgtime = cl.mtime[ 0 ];

		// a rocket, grenade or nail crossing a pool or a portal leaves a ring (card [W1])
		if ( model != null ) {

			if ( ent._rippleFrame === _rippleFrame - 1 && ! ent.forcelink ) R_ImpactMissile( model, _peOldorg, ent.origin, cl.time );
			ent._rippleFrame = _rippleFrame;

		}

		// particle trails
		if ( model != null && model.flags !== 0 ) {

			// Check for large position delta (teleport)
			let skipTrail = false;
			for ( let i = 0; i < 3; i ++ ) {

				if ( Math.abs( _peOldorg[ i ] - ent.origin[ i ] ) > 128 ) {

					VectorCopy( ent.origin, _peOldorg );
					skipTrail = true;
					break;

				}

			}

			if ( ! skipTrail ) {

				if ( model.flags & 0x01 ) { // EF_ROCKET

					R_RocketTrail( _peOldorg, ent.origin, 0, s1.number );
					const dl = CL_AllocDlight( s1.number );
					VectorCopy( ent.origin, dl.origin );
					dl.radius = 200;
					dl.die = cl.time + 0.01;

				} else if ( model.flags & 0x02 ) { // EF_GRENADE

					R_RocketTrail( _peOldorg, ent.origin, 1, s1.number );

				} else if ( model.flags & 0x04 ) { // EF_GIB

					R_RocketTrail( _peOldorg, ent.origin, 2 );

				} else if ( model.flags & 0x10 ) { // EF_TRACER

					R_RocketTrail( _peOldorg, ent.origin, 3 );

				} else if ( model.flags & 0x20 ) { // EF_ZOMGIB

					R_RocketTrail( _peOldorg, ent.origin, 4 );

				} else if ( model.flags & 0x40 ) { // EF_TRACER2

					R_RocketTrail( _peOldorg, ent.origin, 5 );

				} else if ( model.flags & 0x80 ) { // EF_TRACER3

					R_RocketTrail( _peOldorg, ent.origin, 6 );

				}

			}

		}

		ent.forcelink = false;

		cl_visedicts[ cl_numvisedicts ] = ent;
		set_cl_numvisedicts( cl_numvisedicts + 1 );

	}

}

/*
=============
CL_LinkPlayers

Create visible entities in the correct position
for all current players. Ported from QW cl_ents.c.
=============
*/
function CL_LinkPlayers() {

	for ( let j = 0; j < cl.maxclients; j ++ ) {

		const pplayer = CL_GetPredictedPlayer( j );
		if ( pplayer == null )
			continue;

		// spawn light flashes, even ones coming from invisible objects
		if ( ( pplayer.effects & 0x0004 ) !== 0 ) { // EF_BRIGHTLIGHT

			const dl = CL_AllocDlight( j + 1 );
			dl.origin[ 0 ] = pplayer.origin[ 0 ];
			dl.origin[ 1 ] = pplayer.origin[ 1 ];
			dl.origin[ 2 ] = pplayer.origin[ 2 ] + 16;
			dl.radius = 400 + ( Math.random() * 32 | 0 );
			dl.die = cl.time + 0.001;

		}

		if ( ( pplayer.effects & 0x0008 ) !== 0 ) { // EF_DIMLIGHT

			const dl = CL_AllocDlight( j + 1 );
			dl.origin[ 0 ] = pplayer.origin[ 0 ];
			dl.origin[ 1 ] = pplayer.origin[ 1 ];
			dl.origin[ 2 ] = pplayer.origin[ 2 ];
			dl.radius = 200 + ( Math.random() * 32 | 0 );
			dl.die = cl.time + 0.001;

		}

		// muzzle flash: a player firing (this path handles players, so the flash
		// the rest of the entities get in CL_RelinkEntities has to be made here too)
		if ( ( pplayer.effects & 0x0002 ) !== 0 ) { // EF_MUZZLEFLASH

			const mine = j + 1 === cl.viewentity;
			if ( mine ) R_MuzzleFlashFired();

			const dl = CL_AllocDlight( j + 1 );
			AngleVectors( mine || pplayer.cmd == null ? cl.viewangles : pplayer.cmd.angles, _relinkFv, _relinkRv, _relinkUv );

			// the local player is where the camera is (their entity's own origin is not kept up to date here)
			const eye = mine ? R_MuzzleView() : null;
			if ( eye !== null ) {

				VectorCopy( eye, dl.origin );
				VectorMA( dl.origin, 20, _relinkFv, dl.origin );

			} else {

				VectorCopy( pplayer.origin, dl.origin );
				dl.origin[ 2 ] += 16;
				VectorMA( dl.origin, 18, _relinkFv, dl.origin );

			}

			dl.radius = 200 + ( Math.random() * 32 | 0 );
			dl.minlight = 32;
			dl.die = cl.time + 0.1;
			if ( mine && R_NewerGame() ) {

				// dimmer in a lit room (see R_MuzzleFlashScale)
				dl.flashScale = R_MuzzleFlashScale();
				dl.radius *= 0.35 + 0.65 * dl.flashScale;

			}

		}

		// the player object never gets added (the local player is the camera)
		if ( j + 1 === cl.viewentity )
			continue;

		if ( pplayer.modelindex <= 0 )
			continue;

		// grab an entity to fill in
		if ( cl_numvisedicts >= MAX_VISEDICTS )
			break; // object list is full

		// Use the cl_entities entry for this player slot so Three.js mesh caching works
		const ent = cl_entities[ j + 1 ];

		ent.model = cl.model_precache[ pplayer.modelindex ];
		if ( ent.model == null )
			continue;

		ent.skinnum = pplayer.skin;
		ent.frame = pplayer.frame;
		ent.effects = pplayer.effects;

		// Set origin from predicted/server position
		VectorCopy( pplayer.origin, ent.origin );

		// Set angles from movement command (like QW CL_LinkPlayers)
		if ( pplayer.cmd != null ) {

			ent.angles[ 0 ] = - pplayer.cmd.angles[ 0 ] / 3;
			ent.angles[ 1 ] = pplayer.cmd.angles[ 1 ];
			ent.angles[ 2 ] = 0;

		}

		// Mark as updated
		ent.msgtime = cl.mtime[ 0 ];

		cl_visedicts[ cl_numvisedicts ] = ent;
		set_cl_numvisedicts( cl_numvisedicts + 1 );

	}

}

// Cached vectors for CL_RelinkEntities (avoid per-frame allocations)
const _relinkOldorg = new Float32Array( 3 );
const _relinkDelta = new Float32Array( 3 );
const _relinkFv = new Float32Array( 3 );
const _relinkRv = new Float32Array( 3 );
const _relinkUv = new Float32Array( 3 );

/*
===============
CL_RelinkEntities
===============
*/
/**
 * Rebuilds the frame's visible entity list (WinQuake cl_main.c), called each frame by CL_ReadFromServer after the
 * server messages are parsed. Resets `cl_numvisedicts` to 0, lerps `cl.velocity` (and, in demos, `cl.viewangles`) by
 * CL_LerpPoint's fraction, then places each entity between its last two network positions (snapping on a jump over
 * 100 units, a teleport), auto-rotates EF_ROTATE models, spawns their muzzle-flash, bright and dim lights, particle
 * trails and Newer Game water/portal rings, and appends it to `cl_visedicts` (up to MAX_VISEDICTS). An entity missing
 * from the latest message loses its model; the view entity is skipped unless `chase_active` is on. In a live game
 * with QuakeWorld-style packet entities, players come from prediction (CL_LinkPlayers) and the other entities from
 * the packet entity frame (CL_LinkPacketEntities); demos use the NetQuake path for every entity.
 */
export function CL_RelinkEntities() {

	// determine partial update time
	const frac = CL_LerpPoint();

	set_cl_numvisedicts( 0 );

	//
	// interpolate player info
	//
	for ( let i = 0; i < 3; i ++ )
		cl.velocity[ i ] = cl.mvelocity[ 1 ][ i ] +
			frac * ( cl.mvelocity[ 0 ][ i ] - cl.mvelocity[ 1 ][ i ] );

	if ( cls.demoplayback ) {

		// interpolate the angles
		for ( let j = 0; j < 3; j ++ ) {

			let d = cl.mviewangles[ 0 ][ j ] - cl.mviewangles[ 1 ][ j ];
			if ( d > 180 )
				d -= 360;
			else if ( d < - 180 )
				d += 360;
			cl.viewangles[ j ] = cl.mviewangles[ 1 ][ j ] + frac * d;

		}

	}

	const bobjrotate = anglemod( 100 * cl.time );

	// When using QW-style delta compression, players are handled by
	// CL_LinkPlayers and non-players by CL_LinkPacketEntities.
	// During demo playback or when no valid packet entity data exists,
	// relink ALL entities using the NQ-style path.
	const usePacketEntities = CL_GetValidSequence() !== 0 && cls.demoplayback === false;

	if ( usePacketEntities ) {

		// QW path: predict player positions and add them to visedicts
		CL_SetUpPlayerPrediction( true );
		CL_LinkPlayers();

	}

	// For QW path, skip player entity slots (they're handled above).
	// For NQ path, process all entities including players.
	const firstRelinkEntity = usePacketEntities ? cl.maxclients + 1 : 1;
	for ( let i = firstRelinkEntity; i < cl.num_entities; i ++ ) {

		const ent = cl_entities[ i ];
		if ( ent.model == null ) {

			// empty slot
			if ( ent.forcelink ) {

				R_RemoveEfrags( ent ); // just became empty

			}

			continue;

		}

		// if the object wasn't included in the last packet, remove it
		if ( ent.msgtime !== cl.mtime[ 0 ] ) {

			ent.model = null;
			continue;

		}

		VectorCopy( ent.origin, _relinkOldorg );

		if ( ent.forcelink ) {

			// the entity was not updated in the last message
			// so move to the final spot
			VectorCopy( ent.msg_origins[ 0 ], ent.origin );
			VectorCopy( ent.msg_angles[ 0 ], ent.angles );

		} else {

			// if the delta is large, assume a teleport and don't lerp
			let f = frac;
			for ( let j = 0; j < 3; j ++ ) {

				_relinkDelta[ j ] = ent.msg_origins[ 0 ][ j ] - ent.msg_origins[ 1 ][ j ];
				if ( _relinkDelta[ j ] > 100 || _relinkDelta[ j ] < - 100 )
					f = 1; // assume a teleportation, not a motion

			}

			// interpolate the origin and angles
			for ( let j = 0; j < 3; j ++ ) {

				ent.origin[ j ] = ent.msg_origins[ 1 ][ j ] + f * _relinkDelta[ j ];

				let d = ent.msg_angles[ 0 ][ j ] - ent.msg_angles[ 1 ][ j ];
				if ( d > 180 )
					d -= 360;
				else if ( d < - 180 )
					d += 360;
				ent.angles[ j ] = ent.msg_angles[ 1 ][ j ] + f * d;

			}

		}

		// rotate binary objects locally
		if ( ent.model != null && ( ent.model.flags & 0x0008 ) ) // EF_ROTATE
			ent.angles[ 1 ] = bobjrotate;

		if ( ent.effects & 0x0001 ) // EF_BRIGHTFIELD
			R_EntityParticles( ent );

		if ( ent.effects & 0x0002 ) { // EF_MUZZLEFLASH

			if ( i === cl.viewentity ) R_MuzzleFlashFired();

			const dl = CL_AllocDlight( i );
			VectorCopy( ent.origin, dl.origin );
			dl.origin[ 2 ] += 16;
			AngleVectors( ent.angles, _relinkFv, _relinkRv, _relinkUv );

			VectorMA( dl.origin, 18, _relinkFv, dl.origin );
			dl.radius = 200 + ( Math.random() * 32 | 0 );
			dl.minlight = 32;
			dl.die = cl.time + 0.1;

		}

		if ( ent.effects & 0x0004 ) { // EF_BRIGHTLIGHT

			const dl = CL_AllocDlight( i );
			VectorCopy( ent.origin, dl.origin );
			dl.origin[ 2 ] += 16;
			dl.radius = 400 + ( Math.random() * 32 | 0 );
			dl.die = cl.time + 0.001;

		}

		if ( ent.effects & 0x0008 ) { // EF_DIMLIGHT

			const dl = CL_AllocDlight( i );
			VectorCopy( ent.origin, dl.origin );
			dl.radius = 200 + ( Math.random() * 32 | 0 );
			dl.die = cl.time + 0.001;

		}

		// a rocket, grenade or nail crossing a pool or a portal leaves a ring (card [W1]; demos: the entity's own forcelink says it is new)
		if ( ent.model != null && ! ent.forcelink ) R_ImpactMissile( ent.model, _relinkOldorg, ent.origin, cl.time );

		// Particle trails based on model flags
		// Ported from WinQuake/cl_main.c:587-606
		if ( ent.model != null ) {

			if ( ent.model.flags & 0x04 ) // EF_GIB
				R_RocketTrail( _relinkOldorg, ent.origin, 2 );
			else if ( ent.model.flags & 0x20 ) // EF_ZOMGIB
				R_RocketTrail( _relinkOldorg, ent.origin, 4 );
			else if ( ent.model.flags & 0x10 ) // EF_TRACER
				R_RocketTrail( _relinkOldorg, ent.origin, 3 );
			else if ( ent.model.flags & 0x40 ) // EF_TRACER2
				R_RocketTrail( _relinkOldorg, ent.origin, 5 );
			else if ( ent.model.flags & 0x01 ) { // EF_ROCKET

				R_RocketTrail( _relinkOldorg, ent.origin, 0, i );
				const dl = CL_AllocDlight( i );
				VectorCopy( ent.origin, dl.origin );
				dl.radius = 200;
				dl.die = cl.time + 0.01;

			} else if ( ent.model.flags & 0x02 ) // EF_GRENADE
				R_RocketTrail( _relinkOldorg, ent.origin, 1, i );
			else if ( ent.model.flags & 0x80 ) // EF_TRACER3
				R_RocketTrail( _relinkOldorg, ent.origin, 6 );

		}

		ent.forcelink = false;

		if ( i === cl.viewentity && Cvar_VariableValue( 'chase_active' ) === 0 )
			continue;

		if ( cl_numvisedicts < MAX_VISEDICTS ) {

			cl_visedicts[ cl_numvisedicts ] = ent;
			set_cl_numvisedicts( cl_numvisedicts + 1 );

		}

	}

	// Link non-player entities from QW-style packet_entities
	if ( usePacketEntities ) {

		CL_LinkPacketEntities( frac );

	}

}

/*
===============
CL_ReadFromServer
===============
*/
/**
 * Read all incoming data from the server (WinQuake cl_main.c), once per Host_Frame while connected. Does nothing
 * while Newer Game's demo loading screen freezes a fully signed-on demo. Otherwise advances cl.time by
 * `host_frametime`, parses every waiting message (recording `cl.last_received_message` in realtime seconds), relinks
 * entities, updates temporary entities, then runs client-side prediction in a remote live game, or copies `cl.velocity`
 * and the on-ground state into the prediction outputs (for view bob and roll) when a local server or a demo is running.
 *
 * @returns {number|undefined} 0 after reading (WinQuake's return value); undefined while the demo loading screen holds.
 *   Host_Frame ignores it.
 * @throws {Error} through Host_Error, "CL_ReadFromServer: lost server connection", when CL_GetMessage reports the
 *   connection lost; also whatever Host_Error a parsed message raises
 */
export function CL_ReadFromServer() {
	if(R_DemoLoadingFreeze(cls.demoplayback,cls.signon,cls.timedemo))return;

	cl.oldtime = cl.time;
	cl.time += host_frametime;

	let ret;
	do {

		ret = CL_GetMessage();

		if ( ret === - 1 )
			_Host_Error( 'CL_ReadFromServer: lost server connection' );

		if ( ! ret )
			break;

		cl.last_received_message = realtime;
		CL_ParseServerMessage();

	} while ( ret && cls.state === ca_connected );

	if ( cl_shownet.value )
		Con_Printf( '\n' );

	CL_RelinkEntities();
	CL_UpdateTEnts();

	// Client-side prediction (QuakeWorld style)
	// Predicts local player position for responsive movement with low server tick rates
	// Skip during demo playback — prediction overwrites cl.time with realtime,
	// which breaks the demo time gate when transitioning between demos.
	if ( ! sv.active && ! cls.demoplayback ) {

		CL_PredictMove();

	} else {

		// When prediction is not running, copy NQ velocity to cl_simvel
		// so V_CalcBob and V_CalcRoll still work for weapon view bobbing
		VectorCopy( cl.velocity, cl_simvel );
		set_cl_simonground( cl.onground ? 0 : - 1 );

	}

	return 0;

}

/*
=================
CL_SendCmd
=================
*/
/**
 * Sends this frame's movement and the queued reliable messages to the server (WinQuake cl_main.c, including what C
 * calls CL_WriteToServer). Called once per Host_Frame: before the server frame with a local server, after it
 * otherwise. Does nothing unless connected. Once fully signed on (and not held by the welcome loading screen) builds a
 * new usercmd_t from the keyboard (CL_BaseMove) plus the platform's mouse, touch and gamepad (IN_Move) and sends it
 * unreliably (CL_SendMove). During demo playback the reliable buffer is discarded; otherwise `cls.message`, if not
 * empty, is sent reliably and cleared, or kept for a later frame when the connection cannot send yet.
 *
 * @throws {Error} through Host_Error, "CL_WriteToServer: lost server connection", when the reliable send fails
 */
export function CL_SendCmd() {

	if ( cls.state !== ca_connected )
		return;

	if ( cls.signon === SIGNONS && !R_WelcomeLoadingHolding() ) {

		// get basic movement from keyboard
		const cmd = new usercmd_t();
		CL_BaseMove( cmd );

		// allow mice or other external controllers to add to the move
		_IN_Move( cmd );

		// send the unreliable message
		CL_SendMove( cmd );

	}

	if ( cls.demoplayback ) {

		SZ_Clear( cls.message );
		return;

	}

	// send the reliable message
	if ( ! cls.message.cursize )
		return; // no message at all

	if ( ! NET_CanSendMessage( cls.netcon ) ) {

		Con_DPrintf( 'CL_WriteToServer: can\'t send\n' );
		return;

	}

	if ( NET_SendMessage( cls.netcon, cls.message ) === - 1 )
		_Host_Error( 'CL_WriteToServer: lost server connection' );

	SZ_Clear( cls.message );

}

/*
=================
CL_Init
=================
*/
/**
 * Sets up the client once at startup (WinQuake cl_main.c), called by Host_Init: allocates the 1024-byte `cls.message`
 * buffer, initialises input, temporary entities and prediction, registers the client and mouse cvars (`_cl_name`,
 * `_cl_color` and the look/mouse settings are archived to the config) and adds the `entities`, `disconnect`, `record`,
 * `stop`, `playdemo`, `playattractdemo` and `timedemo` commands.
 */
export function CL_Init() {

	SZ_Alloc( cls.message, 1024 );

	CL_InitInput();
	CL_InitTEnts();
	CL_InitPrediction();

	//
	// register our commands
	//
	Cvar_RegisterVariable( cl_name );
	Cvar_RegisterVariable( cl_color );
	Cvar_RegisterVariable( cl_upspeed );
	Cvar_RegisterVariable( cl_forwardspeed );
	Cvar_RegisterVariable( cl_backspeed );
	Cvar_RegisterVariable( cl_sidespeed );
	Cvar_RegisterVariable( cl_movespeedkey );
	Cvar_RegisterVariable( cl_yawspeed );
	Cvar_RegisterVariable( cl_pitchspeed );
	Cvar_RegisterVariable( cl_anglespeedkey );
	Cvar_RegisterVariable( cl_shownet );
	Cvar_RegisterVariable( cl_nolerp );
	Cvar_RegisterVariable( lookspring );
	Cvar_RegisterVariable( lookstrafe );
	Cvar_RegisterVariable( sensitivity );

	Cvar_RegisterVariable( m_pitch );
	Cvar_RegisterVariable( m_yaw );
	Cvar_RegisterVariable( m_forward );
	Cvar_RegisterVariable( m_side );

	Cmd_AddCommand( 'entities', CL_PrintEntities_f );
	Cmd_AddCommand( 'disconnect', CL_Disconnect_f );
	Cmd_AddCommand( 'record', CL_Record_f );
	Cmd_AddCommand( 'stop', CL_Stop_f );
	Cmd_AddCommand( 'playdemo', CL_PlayDemo_f );
	Cmd_AddCommand( 'playattractdemo', CL_PlayAttractDemo_f );
	Cmd_AddCommand( 'timedemo', CL_TimeDemo_f );

}

// These are imported from cl_input.js -- declared as stubs for now
// to avoid circular dependency issues. They will be replaced when cl_input.js is loaded.
function CL_InitInput() {

	CL_InitInput_impl();

}

// CL_InitTEnts: imported from cl_tent.js

// CL_StopPlayback and CL_Stop_f: imported from cl_demo.js

// Forward declarations for cvars and functions defined in cl_input.js
import { cl_upspeed, cl_forwardspeed, cl_backspeed, cl_sidespeed,
	cl_movespeedkey, cl_yawspeed, cl_pitchspeed,
	cl_anglespeedkey,
	CL_InitInput as CL_InitInput_impl,
	CL_BaseMove, CL_SendMove } from './cl_input.js';

// What the client calls above it (card [44g], debt D1a: the client imports neither the host nor the platform), set
// by the host with CL_SetExternals. Until then an error still unwinds, as Host_Error does, without the host's cleanup;
// the rest do nothing.
let _Host_Error = error => { throw new Error( 'Host_Error: ' + error ); };
let _Host_ShutdownServer = () => {};
let _Host_ClearMemory = () => {};
let _IN_Move = () => {};

/**
 * Hands the client the host and platform functions it calls, as the other modules' SetExternals do. host.js calls it
 * once as it loads, in its wiring block. Keys left out keep their current value. Until it is called, `Host_Error`
 * throws `Error('Host_Error: ' + message)` (unwinding without the host's cleanup) and the other three do nothing.
 *
 * @param {{ Host_Error?: function( string ): never, Host_ShutdownServer?: function( boolean ): void,
 *   Host_ClearMemory?: function(): void, IN_Move?: function( object ): void }} externals the host's error, server
 *   shutdown and memory clear; the platform's mouse, touch and gamepad movement added to a usercmd
 */
export function CL_SetExternals( externals ) {

	if ( externals.Host_Error ) _Host_Error = externals.Host_Error;
	if ( externals.Host_ShutdownServer ) _Host_ShutdownServer = externals.Host_ShutdownServer;
	if ( externals.Host_ClearMemory ) _Host_ClearMemory = externals.Host_ClearMemory;
	if ( externals.IN_Move ) _IN_Move = externals.IN_Move;

}
