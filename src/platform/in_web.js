/**
 * @module platform/in_web
 *
 * Browser input (WinQuake in_win.c): keyboard, mouse with pointer lock, and game controllers.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `codeToQuakeKey`, `mouse_x`, `mouse_y`, `old_mouse_x`,
 * `old_mouse_y`, `mx_accum`, `my_accum`, `mouseinitialized`, `mouseactive`, `pointerLocked`, `targetElement`,
 * `isMobile` and 5 more.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/in_win.c, WinQuake/input.h -- browser input system
// Adapted for web: uses Pointer Lock API for mouse, DOM keyboard events

import {
	K_TAB, K_ENTER, K_ESCAPE, K_SPACE, K_BACKSPACE,
	K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW,
	K_ALT, K_CTRL, K_SHIFT,
	K_F1, K_F2, K_F3, K_F4, K_F5, K_F6, K_F7, K_F8, K_F9, K_F10, K_F11, K_F12,
	K_INS, K_DEL, K_PGDN, K_PGUP, K_HOME, K_END, K_PAUSE,
	K_MOUSE1, K_MOUSE2, K_MOUSE3,
	K_MWHEELUP, K_MWHEELDOWN,
	Key_Event,
	key_game, key_menu, key_dest
} from '../engine/client/keys.js';
import { Cvar_RegisterVariable } from '../engine/common/cvar.js';
import { Cmd_AddCommand } from '../engine/common/cmd.js';
import { Con_Printf } from '../engine/common/console.js';
import { cl, cls, ca_connected } from '../engine/client/client.js';
import { sensitivity, m_pitch, m_yaw, m_forward, m_side, lookstrafe } from '../engine/client/cl_main.js';
import { in_mlook, in_strafe, cl_forwardspeed, cl_sidespeed, cl_yawspeed, cl_pitchspeed } from '../engine/client/cl_input.js';
import { R_NewerGame } from '../newer/render/r_anim.js';
import { V_StopPitchDrift } from '../engine/client/view.js';
import { host_frametime } from '../engine/server/host.js';
import { PITCH, YAW } from '../engine/common/quakedef.js';
import {
	Touch_IsMobile, Touch_Init, Touch_Enable, Touch_Disable, Touch_IsEnabled,
	Touch_GetMoveInput, Touch_GetLookDelta, Touch_GetStick, touch_turn, touch_aim, touch_strafe, Touch_StrafeHeld, Touch_UpdateFov,
	Touch_ShowMenu, Touch_HideMenu, Touch_SetMenuCallback, Touch_RequestFullscreen
} from './touch.js';
import { M_TouchInput } from '../engine/client/menu.js';
import { S_UnlockAudio } from '../engine/sound/snd_dma.js';
import { isXRActive, XR_PollInput, xrInput } from './webxr.js';

/*
===========================================================================

			BROWSER KEY MAPPING

Maps DOM event.code / event.key values to Quake K_* constants.
===========================================================================
*/

let codeToQuakeKey = {}; // built in IN_Init to avoid circular dep in Deno

/*
===========================================================================

			INPUT STATE

===========================================================================
*/

// Mouse state (replaces DirectInput mouse in in_win.c)
import { R_BestiaryInputLocked } from '../r_bestiary.js';
let mouse_x = 0;
let mouse_y = 0;
let old_mouse_x = 0;
let old_mouse_y = 0;
let mx_accum = 0;
let my_accum = 0;

let mouseinitialized = false;
let mouseactive = false;

// Pointer lock state
let pointerLocked = false;
let targetElement = null;

// Mobile/touch state
let isMobile = false;

// Meta Quest — disables pointer lock and fullscreen
let isQuest = false;

// XR trigger edge detection
let _xrPrevLeftTrigger = false;
let _xrPrevRightTrigger = false;

function requestPointerLock() {

	if ( pointerLocked || isQuest || targetElement == null ) return;

	targetElement.requestPointerLock();

}

function requestFullscreen() {

	if ( isQuest ) return;

	Touch_RequestFullscreen();

}

// Gamepads (card [36]): the browser's Gamepad API, standard mapping. A Bluetooth controller is paired in the operating
// system; the browser lists it once a button is pressed with the page focused. One controller plays at a time: the one
// already playing while it stays connected, else the first connected with the standard mapping, else the first connected.
// Each button sends the key it means where it was pressed (A is jump in the game, Enter in a menu) and, when let go,
// releases that same key, even if a menu opened in between; a key two buttons hold goes up when both are let go. When the
// controller goes away (or another takes over) only the keys it holds are released, never the keyboard's or the mouse's.
const SLASH = '/'.charCodeAt( 0 ); // default.cfg: "impulse 10", change weapon
// [ standard index, name, key in the game, key in a menu, trigger? ] (built on first use: the key codes come from keys.js,
// which this module's import cycle evaluates later)
let gpButtons = null;
const GP_BUTTONS = () => gpButtons ??= [
	[ 0, 'a', K_SPACE, K_ENTER ], [ 1, 'b', K_ESCAPE, K_ESCAPE ], [ 2, 'x', SLASH, SLASH ], [ 3, 'y', K_TAB, K_TAB ],
	[ 4, 'lb', K_SHIFT, K_SHIFT ], [ 5, 'rb', K_CTRL, K_CTRL ],
	[ 6, 'lt', K_SPACE, K_ENTER, true ], [ 7, 'rt', K_MOUSE1, K_MOUSE1, true ],
	[ 8, 'back', K_ESCAPE, K_ESCAPE ], [ 9, 'start', K_ESCAPE, K_ESCAPE ],
	[ 12, 'du', K_UPARROW, K_UPARROW ], [ 13, 'dd', K_DOWNARROW, K_DOWNARROW ], [ 14, 'dl', K_LEFTARROW, K_LEFTARROW ], [ 15, 'dr', K_RIGHTARROW, K_RIGHTARROW ]
];
const gpState = { index: null, id: null, sent: new Map(), owned: new Map(), noticed: new Set() };

function GP_GetPrimary() {

	if ( typeof navigator === 'undefined' || navigator.getGamepads == null ) return null;

	const gamepads = navigator.getGamepads();
	if ( ! gamepads ) return null;

	const connected = Array.from( gamepads ).filter( gp => gp && gp.connected );
	const current = connected.find( gp => gp.index === gpState.index && gp.id === gpState.id ), standard = connected.find( gp => gp.mapping === 'standard' );
	// (a standard pad takes over from a nonstandard device that holds nothing: some systems list a pad's motion sensor or
	// touchpad as a device of its own)
	if ( current && ( current.mapping === 'standard' || ! standard || gpState.owned.size > 0 ) ) return current;
	return standard || connected[ 0 ] || null;

}

function GP_ApplyDeadzone( v, deadzone ) {

	if ( Math.abs( v ) < deadzone ) return 0;

	// Rescale so movement starts smoothly at the edge of the deadzone
	return ( v - Math.sign( v ) * deadzone ) / ( 1 - deadzone );

}

function GP_ButtonDown( gp, index ) {

	const b = gp.buttons?.[ index ];
	if ( ! b ) return false;
	return typeof b === 'object' ? !! b.pressed : !! b;

}

function GP_ButtonValue( gp, index ) {

	const b = gp.buttons?.[ index ];
	if ( ! b ) return 0;
	return typeof b === 'object' ? ( b.value ?? ( b.pressed ? 1 : 0 ) ) : ( b ? 1 : 0 );

}

// a key the controller holds: down with the first button holding it, up with the last
// (the keys go to Key_Event as the controller's, 'pad': a key the keyboard, mouse or touch screen also holds stays down
// until they all let go)
function GP_Press( key, keyEvent ) {

	const n = gpState.owned.get( key ) || 0;
	gpState.owned.set( key, n + 1 );
	if ( n === 0 ) keyEvent( key, true, 'pad' );

}

function GP_Release( key, keyEvent ) {

	const n = gpState.owned.get( key ) || 0;
	if ( n <= 1 ) { gpState.owned.delete( key ); if ( n === 1 ) keyEvent( key, false, 'pad' ); } else gpState.owned.set( key, n - 1 );

}

// the controller went away or another took over (or WebXR began): release what it holds, and only that
function GP_ReleaseOwned( keyEvent ) {

	const keys = [ ...gpState.owned.keys() ];
	gpState.owned.clear(); gpState.sent.clear();
	for ( const key of keys ) keyEvent( key, false, 'pad' );

}

// WebXR has its own controllers: the gamepad lets go of everything and is chosen afresh afterwards
export function IN_GamepadRelease( keyEvent = Key_Event ) {

	GP_ReleaseOwned( keyEvent ); gpState.index = null; gpState.id = null;

}

/*
================
IN_GamepadPoll

Every host frame (IN_Commands, with no command: the buttons, in menus and between levels too) and again when a command
is built (IN_Move: the sticks as movement and look, in the game). keyEvent is Key_Event, print Con_Printf (a check passes
its own). Reading twice in a frame changes nothing: each button remembers what it sent. Returns the controller, or null.
================
*/
export function IN_GamepadPoll( cmd, keyEvent = Key_Event, print = Con_Printf ) {

	const gp = GP_GetPrimary();
	if ( ! gp ) {

		if ( gpState.index !== null ) { GP_ReleaseOwned( keyEvent ); gpState.index = null; gpState.id = null; }
		return null;

	}

	if ( gp.index !== gpState.index || gp.id !== gpState.id ) {

		GP_ReleaseOwned( keyEvent );
		gpState.index = gp.index; gpState.id = gp.id;
		if ( gp.mapping !== 'standard' && ! gpState.noticed.has( gp.id ) ) {

			gpState.noticed.add( gp.id );
			print( 'Controller "' + gp.id + '" has no standard button layout: its buttons may not match\n' );

		}

	}

	// Standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 10 LS, 11 RS, 12-15 D-pad.
	const inMenu = key_dest === key_menu;
	for ( const [ index, name, gameKey, menuKey, trigger ] of GP_BUTTONS() ) {

		const down = trigger ? GP_ButtonValue( gp, index ) > 0.5 : GP_ButtonDown( gp, index );
		const sent = gpState.sent.get( name );
		if ( down && sent === undefined ) { const key = inMenu ? menuKey : gameKey; gpState.sent.set( name, key ); GP_Press( key, keyEvent ); }
		else if ( ! down && sent !== undefined ) { gpState.sent.delete( name ); GP_Release( sent, keyEvent ); }

	}

	// Gameplay movement/look (skip in menus; skip when cmd is missing)
	if ( ! cmd || key_dest !== key_game || cls.demoplayback || R_BestiaryInputLocked() ) return gp;

	const moveDeadzone = 0.15;
	const lookDeadzone = 0.12;

	const lx = GP_ApplyDeadzone( gp.axes?.[ 0 ] ?? 0, moveDeadzone );
	const ly = GP_ApplyDeadzone( gp.axes?.[ 1 ] ?? 0, moveDeadzone );
	const rx = GP_ApplyDeadzone( gp.axes?.[ 2 ] ?? 0, lookDeadzone );
	const ry = GP_ApplyDeadzone( gp.axes?.[ 3 ] ?? 0, lookDeadzone );

	// Left stick → movement
	cmd.forwardmove -= cl_forwardspeed.value * ly;
	cmd.sidemove += cl_sidespeed.value * lx;

	// Right stick → look (yaw + pitch), always active (no pointer lock required)
	if ( rx !== 0 ) {

		cl.viewangles[ YAW ] -= rx * cl_yawspeed.value * host_frametime * gp_look_yaw.value;

	}

	if ( ry !== 0 ) {

		V_StopPitchDrift();
		cl.viewangles[ PITCH ] += ry * cl_pitchspeed.value * host_frametime * gp_look_pitch.value;
		if ( cl.viewangles[ PITCH ] > 80 )
			cl.viewangles[ PITCH ] = 80;
		if ( cl.viewangles[ PITCH ] < - 70 )
			cl.viewangles[ PITCH ] = - 70;

	}

	return gp;

}

// cvars (matching in_win.c)
const m_filter = { name: 'm_filter', string: '0', value: 0 };
// Gamepad look tuning (standard mapping right stick).
// Defaults keep yaw/pitch even and slower than the prior hardcoded multiplier.
const gp_look_yaw = { name: 'gp_look_yaw', string: '1', value: 1 };
const gp_look_pitch = { name: 'gp_look_pitch', string: '1', value: 1 };

let in_initialized = false;

/*
===========================================================================

			BROWSER EVENT HANDLERS

===========================================================================
*/

function mapBrowserKeyToQuake( event ) {

	// First check code-based mapping (physical key location)
	if ( codeToQuakeKey[ event.code ] !== undefined ) {

		return codeToQuakeKey[ event.code ];

	}

	// For letter keys, map by code (e.g. 'KeyA' -> 97 'a')
	if ( event.code && event.code.startsWith( 'Key' ) ) {

		return event.code.charCodeAt( 3 ) + 32; // 'A'(65) + 32 = 'a'(97)

	}

	// For digit keys
	if ( event.code && event.code.startsWith( 'Digit' ) ) {

		return event.code.charCodeAt( 5 ); // '0'-'9' ascii

	}

	// Punctuation and other keys - use the key value
	if ( event.key && event.key.length === 1 ) {

		const code = event.key.charCodeAt( 0 );
		// Lowercase letters for quake
		if ( code >= 65 && code <= 90 )
			return code + 32;
		return code;

	}

	return 0;

}

function handleKeyDown( event ) {

	if ( ! in_initialized ) return;

	// Unlock audio on first user gesture
	S_UnlockAudio();

	const prevKeyDest = key_dest;

	const qkey = mapBrowserKeyToQuake( event );
	if ( qkey ) {

		Key_Event( qkey, true );

	}

	// Request pointer lock when transitioning into game (e.g. selecting "New Game")
	// This works because we're inside a user gesture (keydown event)
	// Only do this when actually playing, not during demo playback
	if ( key_dest === key_game && prevKeyDest !== key_game && ! cls.demoplayback ) {

		if ( isMobile ) {

			Touch_Enable();
			mouseactive = true;

		} else if ( ! Touch_IsMobile() ) {

			requestPointerLock();

		}

	}

	// Prevent browser defaults for game keys
	if ( event.code === 'Tab' || event.code === 'Escape' ||
		event.code === 'Space' || event.code === 'F5' ||
		event.code === 'F11' || event.code === 'F12' ) {

		// Allow escape to exit pointer lock
		if ( event.code !== 'Escape' ) {

			event.preventDefault();

		}

	}

}

function handleKeyUp( event ) {

	if ( ! in_initialized ) return;

	const qkey = mapBrowserKeyToQuake( event );
	if ( qkey ) {

		Key_Event( qkey, false );

	}

}

function handleMouseMove( event ) {
	if ( R_BestiaryInputLocked() ) { mx_accum = my_accum = old_mouse_x = old_mouse_y = 0; return; }

	if ( ! in_initialized || ! mouseactive ) return;

	// Pointer Lock API gives us movementX/Y directly
	mx_accum += event.movementX || 0;
	my_accum += event.movementY || 0;

}

function handleMouseDown( event ) {

	if ( ! in_initialized ) return;

	// Unlock audio on first user gesture
	S_UnlockAudio();

	let qkey;
	switch ( event.button ) {

		case 0: qkey = K_MOUSE1; break;
		case 2: qkey = K_MOUSE2; break;
		case 1: qkey = K_MOUSE3; break;
		default: return;

	}

	// Handle mouse clicks in the menu
	if ( key_dest === key_menu && event.button === 0 ) {

		// Get click position relative to target element
		const rect = targetElement.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		M_TouchInput( x, y, rect.width, rect.height );
		return;

	}

	// During demo playback, click to show menu
	if ( key_dest === key_game && cls.demoplayback && event.button === 0 ) {

		M_TouchInput( 0, 0, 1, 1 ); // Coordinates don't matter, just triggers menu toggle
		return;

	}

	// On mobile, request fullscreen + landscape and enable touch controls
	// Only when actually playing, not during demo playback
	if ( isMobile ) {

		// Request fullscreen only when actually playing a map (not menu, demo, or idle state)
		if ( key_dest === key_game && cls.state === ca_connected && ! cls.demoplayback ) {

			requestFullscreen();

		}

		if ( key_dest === key_game && ! cls.demoplayback && ! Touch_IsEnabled() ) {

			Touch_Enable();
			mouseactive = true;

		}

	} else {

		// Request pointer lock only when in-game (not menu/console or demos), and not on mobile
		if ( key_dest === key_game && ! cls.demoplayback && ! Touch_IsMobile() ) {

			requestPointerLock();

		}

	}

	Key_Event( qkey, true );

}

function handleMouseUp( event ) {

	if ( ! in_initialized ) return;

	let qkey;
	switch ( event.button ) {

		case 0: qkey = K_MOUSE1; break;
		case 2: qkey = K_MOUSE2; break;
		case 1: qkey = K_MOUSE3; break;
		default: return;

	}

	Key_Event( qkey, false );

}

function handleWheel( event ) {

	if ( ! in_initialized ) return;

	if ( event.deltaY < 0 ) {

		Key_Event( K_MWHEELUP, true );
		Key_Event( K_MWHEELUP, false );

	} else if ( event.deltaY > 0 ) {

		Key_Event( K_MWHEELDOWN, true );
		Key_Event( K_MWHEELDOWN, false );

	}

}

function handlePointerLockChange() {

	const wasLocked = pointerLocked;
	pointerLocked = document.pointerLockElement === targetElement;

	if ( pointerLocked ) {

		mouseactive = true;

	} else {

		mouseactive = false;

		// Show the menu when pointer lock is lost while in-game,
		// but only if we actually had pointer lock before (not on failed requests)
		// Skip this on mobile - touch controls handle menu via pause button
		if ( ! isMobile && wasLocked && key_dest === key_game ) {

			Key_Event( K_ESCAPE, true );
			Key_Event( K_ESCAPE, false );

		}

	}

}

function handleContextMenu( event ) {

	event.preventDefault();

}

function handleVisibilityChange() {

	// Placeholder for visibility change handling (wake lock is in touch.js for mobile)

}

function handleTouchStart( event ) {

	if ( ! in_initialized ) return;

	// Unlock audio on first user gesture
	S_UnlockAudio();

	// On mobile, request fullscreen only when actually playing a map (not menu, demo, or idle state)
	if ( isMobile && key_dest === key_game && cls.state === ca_connected && ! cls.demoplayback ) {

		requestFullscreen();

	}

	// During demo playback, tap to show menu
	if ( key_dest === key_game && cls.demoplayback ) {

		event.preventDefault();
		M_TouchInput( 0, 0, 1, 1 ); // Coordinates don't matter, just triggers menu toggle

	}

}

/*
===========================================================================

			PUBLIC API (matching in_win.c interface)

===========================================================================
*/

/*
===========
IN_Init
===========
*/
export function IN_Init( element ) {

	targetElement = element || document.body;

	// Build key mapping (deferred from module scope to avoid circular dep in Deno)
	codeToQuakeKey = {
		'Tab': K_TAB,
		'Enter': K_ENTER,
		'Escape': K_ESCAPE,
		'Space': K_SPACE,
		'Backspace': K_BACKSPACE,
		'ArrowUp': K_UPARROW,
		'ArrowDown': K_DOWNARROW,
		'ArrowLeft': K_LEFTARROW,
		'ArrowRight': K_RIGHTARROW,
		'AltLeft': K_ALT,
		'AltRight': K_ALT,
		'ControlLeft': K_CTRL,
		'ControlRight': K_CTRL,
		'ShiftLeft': K_SHIFT,
		'ShiftRight': K_SHIFT,
		'F1': K_F1,
		'F2': K_F2,
		'F3': K_F3,
		'F4': K_F4,
		'F5': K_F5,
		'F6': K_F6,
		'F7': K_F7,
		'F8': K_F8,
		'F9': K_F9,
		'F10': K_F10,
		'F11': K_F11,
		'F12': K_F12,
		'Insert': K_INS,
		'Delete': K_DEL,
		'PageDown': K_PGDN,
		'PageUp': K_PGUP,
		'Home': K_HOME,
		'End': K_END,
		'Pause': K_PAUSE,
	};

	// Register cvars
	Cvar_RegisterVariable( m_filter );
	Cvar_RegisterVariable( gp_look_yaw );
	Cvar_RegisterVariable( gp_look_pitch );

	// Register commands
	Cmd_AddCommand( 'force_centerview', IN_ForceCenterView );

	// Set up event listeners
	document.addEventListener( 'keydown', handleKeyDown );
	document.addEventListener( 'keyup', handleKeyUp );

	targetElement.addEventListener( 'mousemove', handleMouseMove );
	targetElement.addEventListener( 'mousedown', handleMouseDown );
	targetElement.addEventListener( 'mouseup', handleMouseUp );
	targetElement.addEventListener( 'wheel', handleWheel );
	targetElement.addEventListener( 'contextmenu', handleContextMenu );

	document.addEventListener( 'pointerlockchange', handlePointerLockChange );

	// Add global touch handler for showing menu during demos
	targetElement.addEventListener( 'touchstart', handleTouchStart, { passive: false } );

	// Initialize touch controls for mobile
	isMobile = Touch_IsMobile();
	isQuest = /OculusBrowser|Quest/i.test( navigator.userAgent );

	if ( isMobile ) {

		// Always append touch UI to document.body for consistent positioning
		Touch_Init( document.body );
		Touch_SetMenuCallback( M_TouchInput );
		Con_Printf( 'Mobile device detected - touch controls available\n' );

	}

	// Listen for visibility changes to re-acquire wake lock when tab becomes visible
	document.addEventListener( 'visibilitychange', handleVisibilityChange );

	mouseinitialized = true;
	in_initialized = true;

	Con_Printf( 'Browser input initialized\n' );

}

/*
===========
IN_Shutdown
===========
*/
export function IN_Shutdown() {

	if ( ! in_initialized ) return;

	document.removeEventListener( 'keydown', handleKeyDown );
	document.removeEventListener( 'keyup', handleKeyUp );

	if ( targetElement ) {

		targetElement.removeEventListener( 'mousemove', handleMouseMove );
		targetElement.removeEventListener( 'mousedown', handleMouseDown );
		targetElement.removeEventListener( 'mouseup', handleMouseUp );
		targetElement.removeEventListener( 'wheel', handleWheel );
		targetElement.removeEventListener( 'contextmenu', handleContextMenu );

	}

	document.removeEventListener( 'pointerlockchange', handlePointerLockChange );
	document.removeEventListener( 'visibilitychange', handleVisibilityChange );

	if ( pointerLocked && document.exitPointerLock ) {

		document.exitPointerLock();

	}

	mouseactive = false;
	mouseinitialized = false;
	in_initialized = false;

}

/*
===========
IN_Commands

Joystick button events in the original: here the game controller's buttons, every host frame, so a controller works
the menus with no level running (card [36]); in WebXR its own controllers take over and the gamepad lets go.
===========
*/
export function IN_Commands() {

	if ( isXRActive() ) IN_GamepadRelease();
	else IN_GamepadPoll( null );

}

/*
===========
IN_ForceCenterView
===========
*/
function IN_ForceCenterView() {

	// cl.viewangles[PITCH] = 0 -- set by the caller
	// In browser, we just need to reset accumulated mouse

}

/*
===========
IN_MouseMove

Called every frame to get mouse movement.
Returns accumulated movement since last call.
===========
*/
export function IN_MouseMove() {
	if ( R_BestiaryInputLocked() ) { mx_accum = my_accum = old_mouse_x = old_mouse_y = 0; return { mx: 0, my: 0 }; }

	if ( ! mouseactive ) {

		return { mx: 0, my: 0 };

	}

	const currentMx = mx_accum;
	const currentMy = my_accum;

	mx_accum = 0;
	my_accum = 0;

	if ( m_filter.value ) {

		// average with last frame for smoothing
		mouse_x = ( currentMx + old_mouse_x ) * 0.5;
		mouse_y = ( currentMy + old_mouse_y ) * 0.5;

	} else {

		mouse_x = currentMx;
		mouse_y = currentMy;

	}

	old_mouse_x = currentMx;
	old_mouse_y = currentMy;

	mouse_x *= sensitivity.value;
	mouse_y *= sensitivity.value;

	return { mx: mouse_x, my: mouse_y };

}

/*
===========
IN_Move

Process all input movement for the current frame.
In the original, this called IN_MouseMove and IN_JoyMove.
===========
*/
export function IN_Move( cmd ) {
	if ( R_BestiaryInputLocked() ) { IN_MouseMove();Touch_GetLookDelta();if(isXRActive())IN_GamepadRelease();else IN_GamepadPoll(null);if(cmd)cmd.forwardmove=cmd.sidemove=cmd.upmove=0;return; }

	let { mx, my } = IN_MouseMove();

	if ( ! cmd ) return;

	// Add touch input - touch look directly controls view angles (bypasses mlook checks)
	if ( Touch_IsEnabled() ) {

		const touchLook = Touch_GetLookDelta();

		// Apply touch look directly to view angles
		if ( touchLook.x !== 0 || touchLook.y !== 0 ) {

			cl.viewangles[ YAW ] -= m_yaw.value * touchLook.x * sensitivity.value * 2;

			cl.viewangles[ PITCH ] += m_pitch.value * touchLook.y * sensitivity.value * 2;
			if ( cl.viewangles[ PITCH ] > 80 )
				cl.viewangles[ PITCH ] = 80;
			if ( cl.viewangles[ PITCH ] < - 70 )
				cl.viewangles[ PITCH ] = - 70;

		}

		// the stick: up and down aim, left and right turn (or sidestep: touch_strafe)
		const stick = Touch_GetStick();
		if ( stick.x !== 0 || stick.y !== 0 ) {

			if ( stick.y !== 0 ) {

				V_StopPitchDrift();
				cl.viewangles[ PITCH ] -= stick.y * Math.abs( stick.y ) * cl_pitchspeed.value * touch_aim.value * host_frametime;
				if ( cl.viewangles[ PITCH ] > 80 )
					cl.viewangles[ PITCH ] = 80;
				if ( cl.viewangles[ PITCH ] < - 70 )
					cl.viewangles[ PITCH ] = - 70;

			}

			if ( stick.x !== 0 && touch_strafe.value === 0 && ! Touch_StrafeHeld() )
				cl.viewangles[ YAW ] -= stick.x * Math.abs( stick.x ) * cl_yawspeed.value * touch_turn.value * host_frametime;

		}

		// the forward button (and the stick, when it sidesteps)
		const touchMove = Touch_GetMoveInput();

		cmd.forwardmove += cl_forwardspeed.value * touchMove.forward;
		cmd.sidemove += cl_sidespeed.value * touchMove.right;

	}

	// add mouse X/Y movement to cmd (from in_win.c IN_MouseMove)
	if ( ( in_strafe.state & 1 ) || ( lookstrafe.value && ( in_mlook.state & 1 ) ) )
		cmd.sidemove += m_side.value * mx;
	else
		cl.viewangles[ YAW ] -= m_yaw.value * mx;

	if ( in_mlook.state & 1 )
		V_StopPitchDrift();

	if ( ( in_mlook.state & 1 ) && ! ( in_strafe.state & 1 ) ) {

		cl.viewangles[ PITCH ] += m_pitch.value * my;
		if ( cl.viewangles[ PITCH ] > 80 )
			cl.viewangles[ PITCH ] = 80;
		if ( cl.viewangles[ PITCH ] < - 70 )
			cl.viewangles[ PITCH ] = - 70;

	} else {

		cmd.forwardmove -= m_forward.value * my;

	}

	// XR controller input
	if ( isXRActive() ) {

		XR_PollInput();

		// Left thumbstick → movement
		// Apply deadzone to avoid drift
		const deadzone = 0.15;
		const stickX = Math.abs( xrInput.moveX ) > deadzone ? xrInput.moveX : 0;
		const stickY = Math.abs( xrInput.moveY ) > deadzone ? xrInput.moveY : 0;

		cmd.forwardmove -= cl_forwardspeed.value * stickY;
		cmd.sidemove += cl_sidespeed.value * stickX;

		// Right thumbstick → horizontal look (yaw)
		const lookX = Math.abs( xrInput.lookX ) > deadzone ? xrInput.lookX : 0;
		cl.viewangles[ YAW ] -= lookX * cl_yawspeed.value * host_frametime * 2;

		// Left trigger → jump (K_SPACE)
		const leftDown = xrInput.leftTrigger > 0.5;
		if ( leftDown !== _xrPrevLeftTrigger ) {

			Key_Event( K_SPACE, leftDown, 'xr' );
			_xrPrevLeftTrigger = leftDown;

		}

		// Right trigger → attack (K_MOUSE1)
		const rightDown = xrInput.rightTrigger > 0.5;
		if ( rightDown !== _xrPrevRightTrigger ) {

			Key_Event( K_MOUSE1, rightDown, 'xr' );
			_xrPrevRightTrigger = rightDown;

		}

	}

	// Standard Gamepad API input (non-XR; in XR the gamepad has let go of everything)
	if ( ! isXRActive() ) IN_GamepadPoll( cmd );
	else IN_GamepadRelease();

}

/*
===========
IN_IsPointerLocked

Helper for browser-specific pointer lock state check
===========
*/
export function IN_IsPointerLocked() {

	return pointerLocked;

}

/*
===========
IN_RequestPointerLock

Request pointer lock from a user gesture context (e.g. menu selection).
Only applies on desktop; mobile uses fullscreen instead.
===========
*/
export function IN_RequestPointerLock() {

	if ( ! isMobile ) {

		requestPointerLock();

	}

}

/*
===========
IN_IsMobile

Returns true if running on a mobile device
===========
*/
export function IN_IsMobile() {

	return isMobile;

}

/*
===========
IN_UpdateTouch

Update touch control state based on key_dest.
Should be called each frame.
===========
*/
export function IN_UpdateTouch() {

	if ( ! isMobile ) return;

	// Newer Game's wider view on a phone
	Touch_UpdateFov( R_NewerGame() );

	if ( key_dest === key_game && cls.state === ca_connected && ! cls.demoplayback ) {

		// In game (not demo, actually connected) - show game controls, hide menu controls
		if ( ! Touch_IsEnabled() ) {

			Touch_Enable();
			mouseactive = true;

		}

		Touch_HideMenu();

	} else if ( key_dest === key_game && cls.demoplayback ) {

		// Demo playback - hide game controls, show menu overlay
		// Tapping will trigger menu via M_TouchInput which sends Escape
		if ( Touch_IsEnabled() ) {

			Touch_Disable();
			mouseactive = false;

		}

		Touch_ShowMenu();

	} else if ( key_dest === key_menu ) {

		// In menu - hide game controls, show menu controls
		if ( Touch_IsEnabled() ) {

			Touch_Disable();
			mouseactive = false;

		}

		Touch_ShowMenu();

	} else {

		// Console or other - hide all controls
		if ( Touch_IsEnabled() ) {

			Touch_Disable();
			mouseactive = false;

		}

		Touch_HideMenu();

	}

}
