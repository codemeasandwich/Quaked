/**
 * @module engine/render/gl_screen
 *
 * The screen (WinQuake gl_screen.c): what is drawn each frame and in what order: the view, status bar, console,
 * centre print, loading.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `scr_con_current`, `scr_initialized`, `scr_disabled_for_loading`, `scr_drawloading`;
 * module-level variables `glx`, `gly`, `glwidth`, `glheight`, `scr_copytop`, `scr_copyeverything`, `scr_conlines`,
 * `scr_wasforced`, `oldfov`, `oldtouchinset`, `oldscreensize`, `scr_ram` and 33 more.
 *
 * Errors: catches at 1 place.
 *
 * Engine callbacks are injected with `SCR_SetExternals`.
 */
// Ported from: WinQuake/gl_screen.c -- GL screen management
// Master for refresh, status bar, console, chat, notify, etc

import { Con_Printf, Con_CheckResize, Con_DrawConsole, Con_DrawNotify, Con_ClearNotify,
	con_forcedup, Con_SetForcedup, con_initialized } from '../common/console.js';
import { R_PerfStage, R_PerfFpsText, R_PerfScreenLines } from '../common/hooks.js'; // installed by newer/render/r_perf.js
import { Sbar_Draw, Sbar_Changed, Sbar_IntermissionOverlay, Sbar_FinaleOverlay, SBAR_HEIGHT, set_sb_lines as Sbar_set_sb_lines, Sbar_SetYOffset } from '../client/sbar.js';
import { R_BestiaryInputLocked } from '../common/hooks.js'; // installed by newer/ui/r_bestiary.js
import { R_BestiaryEncounterDraw } from '../common/hooks.js'; // installed by newer/ui/r_bestiary_book.js
import { R_WeaponWheelDraw, R_ControllerPromptsDraw } from '../common/hooks.js'; // installed by newer/ui/r_controller.js
import { Draw_Character, Draw_String, Draw_CachePic, Draw_Pic, Draw_TransPic, Draw_FadeScreen, Draw_BeginFrame,
	GL_Set2D, Draw_TileClear, Draw_PicFromWad, Draw_GetUIScale,
	Draw_GetVirtualWidth, Draw_GetVirtualHeight } from './gl_draw.js';
import { GameProfile_IsHexen2 } from '../common/game_profile.js';
import { Hexen2_GetHostString, Hexen2_GetInfoString, Hexen2_InfoStringCount } from '../common/hexen2_text_resources.js';
import { Cvar_RegisterVariable, Cvar_Set, Cvar_VariableValue } from '../common/cvar.js';
import { Respawn_NoticeAt } from '../common/hooks.js'; // installed by newer/ui/respawn_notice.js
import { Cmd_AddCommand } from '../common/cmd.js';
import { key_dest, key_game, key_console, key_message } from '../common/key_dest.js';
import { realtime, host_frametime } from '../common/host_state.js';
import { renderer } from './vid.js';
import { R_DemoLoadingHolding, R_DemoLoadingConsoleOverride, R_DemoLoadingConsoleDrawn, R_DemoLoadingConsoleClosed, R_DemoLoadingConsoleSpeed } from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js
import { R_WelcomeLoadingHolding } from '../common/hooks.js'; // installed by newer/ui/r_demoloading.js
import { Draw_Fill } from './gl_draw.js';
import { R_DemoSplitActive, R_DemoSplitFull } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js
import { R_ClassicPassActive, R_AnimSetClassicPass } from '../common/hooks.js'; // installed by newer/mode.js
import { Draw_WithClipRect } from './gl_draw.js';
import { r_refdef as _r_refdef_canonical } from './render.js';
import { Hexen2_DrawIntermission, Hexen2_IntermissionActive } from '../client/hexen2_intermission.js';

function SCR_DrawStatusBar() {

	if ( ! R_DemoSplitActive() ) { Sbar_Draw(); return; }
	const width = Draw_GetVirtualWidth(), height = Draw_GetVirtualHeight(), half = width / 2;
	const oldPass = R_ClassicPassActive();
	try {

		if ( ! R_DemoSplitFull() ) Draw_WithClipRect( 0, 0, half, height, () => { Sbar_Changed(); Sbar_Draw(); } );
		R_AnimSetClassicPass( true );
		Draw_WithClipRect( R_DemoSplitFull() ? 0 : half, 0, R_DemoSplitFull() ? width : half, height, () => { Sbar_Changed(); Sbar_Draw(); } );

	} finally { R_AnimSetClassicPass( oldPass ); }

}

/*
==============================================================================

			GL SCREEN STATE

==============================================================================
*/

let glx = 0;
let gly = 0;
let glwidth = 640;
let glheight = 480;

let scr_copytop = 0;
let scr_copyeverything = 0;

export let scr_con_current = 0;
let scr_conlines = 0; // lines of console to display
let scr_wasforced = false;

let oldfov = 0;
let oldtouchinset = 0;

// how many screen pixels (vid units) of the bottom the touch controls take up: on a phone held upright
// the status bar sits above them
function SCR_TouchInset() {

	const px = _Touch_BottomInset();
	if ( px <= 0 || typeof window === 'undefined' || ! window.innerHeight ) return 0;
	return Math.round( px * _vid.height / window.innerHeight );

}
let oldscreensize = 0;

export const scr_viewsize = { name: 'viewsize', string: '100', value: 100, archive: true };
const scr_fov = { name: 'fov', string: '90', value: 90 };
const scr_conspeed = { name: 'scr_conspeed', string: '300', value: 300 };
const scr_centertime = { name: 'scr_centertime', string: '2', value: 2 };
const scr_showram = { name: 'showram', string: '1', value: 1 };
const scr_showturtle = { name: 'showturtle', string: '0', value: 0 };
const scr_showpause = { name: 'showpause', string: '1', value: 1 };
const scr_printspeed = { name: 'scr_printspeed', string: '8', value: 8 };
const gl_triplebuffer = { name: 'gl_triplebuffer', string: '1', value: 1, archive: true };

export let scr_initialized = false;

let scr_ram = null;
let scr_net = null;
let scr_turtle = null;

let scr_fullupdate = 0;

let clearconsole = 0;
let clearnotify = 0;

let sb_lines = 0;
let oldnewer = false;

const scr_vrect = { x: 0, y: 0, width: 0, height: 0 };

// Newer Game only: a level load does not bring up the console.  In the original
// (New Game) it comes up full screen and then rolls away, which takes longer than
// the load itself.  Here the last frame of the level you were in stays on screen
// until the next one is ready (and a first load from the menu shows the loading
// plaque instead), and after a load there is nothing to roll away.
let scr_hadworld = false; // a level has been drawn this session
let scr_plaque = false; // drawing the loading plaque instead of the console

const scr_newer = () => Cvar_VariableValue( 'r_hdr' ) !== 0;

function scr_loading() {

	return ( ! _cl.worldmodel || _cls.signon !== SIGNONS ) && key_dest === key_game;

}

/**
 * Whether Newer Game is between levels: the `r_hdr` cvar is on, a level has already been drawn this session, and the
 * client has no world or is not fully signed on while the game has the keys. While true, `SCR_UpdateScreen` keeps
 * the last frame of the level you were in on screen and shows no console (unless the demo or welcome loading screen
 * holds it). In the original (New Game) a level load brings the console down full screen instead.
 *
 * @returns {boolean} true while a mid-game level change is loading under Newer Game
 */
export function SCR_ChangingLevel() {

	return scr_newer() && scr_hadworld && scr_loading();

}

export let scr_disabled_for_loading = false;
export let scr_drawloading = false;
let scr_disabled_time = 0;

let block_drawing = false;

// Center print
let scr_centerstring = '';
let scr_centertime_start = 0;
let scr_centertime_off = 0;
let scr_center_lines = 0;
let scr_erase_lines = 0;
let scr_erase_center = 0;

// Modal dialog
let scr_notifystring = '';
let scr_drawdialog = false;

// SIGNONS constant
const SIGNONS = 4;

/*
==============================================================================

			EXTERNAL REFERENCES

==============================================================================
*/

let _realVid = { width: 640, height: 480, numpages: 2, recalc_refdef: false };
const _vid = {
	get width() { return Draw_GetVirtualWidth(); },
	get height() { return Draw_GetVirtualHeight(); },
	get numpages() { return _realVid.numpages; },
	set numpages( v ) { _realVid.numpages = v; },
	get recalc_refdef() { return _realVid.recalc_refdef; },
	set recalc_refdef( v ) { _realVid.recalc_refdef = v; }
};
let _cls = { state: 0, signon: 0, demoplayback: false };
let _cl = { intermission: 0, paused: false, worldmodel: null, time: 0,
	last_received_message: 0 };
let _r_refdef = null; // deferred: set in SCR_Init to avoid circular dep in Deno
let _V_RenderView = null;
let _V_UpdatePalette = null;
let _GL_BeginRendering = null;
let _GL_EndRendering = null;
let _S_StopAllSounds = null;
// the menu's drawing and the touch controls' height (client/menu.js, platform/touch.js; set by the host, [44g] D1a)
let _M_Draw = () => {};
let _Touch_BottomInset = () => 0;
let _r_cache_thrash = false;

/**
 * Wires the screen to what sits above it and cannot be imported without a cycle. Called twice: as host.js loads, in
 * its [44g] D1a block, with `M_Draw` and `Touch_BottomInset`; then by `Host_Init` with the video, client state, view
 * and rendering hooks. Each key that is present replaces the stored value, absent keys keep theirs. Until wired: `vid`
 * is a two-page stand-in (only `numpages` and `recalc_refdef` are used; the drawing size always comes from
 * `Draw_GetVirtualWidth`/`Height`), `cls` and `cl` are disconnected stand-ins, `r_refdef` is taken from render.js by
 * `SCR_Init`, the view, palette, rendering and sound hooks are null and skipped, `M_Draw` draws nothing and
 * `Touch_BottomInset` reports 0. The references are kept for the life of the page.
 *
 * @param {{ vid?: viddef_t, cls?: client_static_t, cl?: client_state_t, r_refdef?: refdef_t,
 *   V_RenderView?: () => void, V_UpdatePalette?: () => void, GL_BeginRendering?: () => void,
 *   GL_EndRendering?: () => void, S_StopAllSounds?: (clear: boolean) => void, M_Draw?: () => void,
 *   Touch_BottomInset?: () => number }} externals the hooks: `vid` is the host's video state (`recalc_refdef` is read
 *   and cleared here, `numpages` set each frame); `cls` and `cl` are read live; `V_RenderView` draws the 3D view
 *   (view.js); `GL_BeginRendering` clears the renderer; `S_StopAllSounds` is called with true by
 *   `SCR_BeginLoadingPlaque`; `M_Draw` draws the menu (client/menu.js); `Touch_BottomInset` is the height of the
 *   portrait touch controls in CSS pixels (platform/touch.js)
 */
export function SCR_SetExternals( externals ) {

	if ( externals.vid ) _realVid = externals.vid;
	if ( externals.cls ) _cls = externals.cls;
	if ( externals.cl ) _cl = externals.cl;
	if ( externals.r_refdef ) _r_refdef = externals.r_refdef;
	if ( externals.V_RenderView ) _V_RenderView = externals.V_RenderView;
	if ( externals.V_UpdatePalette ) _V_UpdatePalette = externals.V_UpdatePalette;
	if ( externals.GL_BeginRendering ) _GL_BeginRendering = externals.GL_BeginRendering;
	if ( externals.GL_EndRendering ) _GL_EndRendering = externals.GL_EndRendering;
	if ( externals.S_StopAllSounds ) _S_StopAllSounds = externals.S_StopAllSounds;
	if ( externals.M_Draw ) _M_Draw = externals.M_Draw;
	if ( externals.Touch_BottomInset ) _Touch_BottomInset = externals.Touch_BottomInset;

}

/*
==============
SCR_CenterPrint
==============
*/
/**
 * Called for important messages that should stay in the center of the screen for a few moments: `svc_centerprint`,
 * and the text of `svc_finale` and `svc_cutscene` (cl_parse.js). Replaces any message showing, timed from `cl.time`
 * for `scr_centertime` seconds (default 2); during an intermission it stays up and is typed out at `scr_printspeed`
 * characters a second. Drawn each frame by `SCR_UpdateScreen`, while the game has the keys, centred at 35% of the
 * screen height for up to four lines, else from y = 48, 40 characters a line at most.
 *
 * @param {string} str the message; lines split at '\n'. Only the first 1023 characters are kept, and the lines are
 *   counted in those
 */
export function SCR_CenterPrint( str ) {

	scr_centerstring = str.substring( 0, 1023 );
	scr_centertime_off = scr_centertime.value;
	scr_centertime_start = _cl.time;

	// count the number of lines for centering, in the text kept (card [44m])
	scr_center_lines = 1;
	for ( let i = 0; i < scr_centerstring.length; i ++ ) {

		if ( scr_centerstring[ i ] === '\n' )
			scr_center_lines ++;

	}

}

/*
==============
SCR_Hexen2TextLines

The native plaque wrapper (h2shared/gl_screen.c FindTextBreaks): words to `width` characters a line, with a newline
or the native '@@' break starting a new line. The objectives list uses the same wrapper at a wider line.
==============
*/
/**
 * Wraps a Hexen II plaque or objectives message.
 *
 * @param {string} message the text (newlines or '@@' separate paragraphs)
 * @param {number} [width=26] characters a line (PLAQUE_WIDTH; the objectives use 30)
 * @returns {string[]} the lines, without empty trailing lines
 */
export function SCR_Hexen2TextLines( message, width = 26 ) {

	const lines = [];
	const limit = Math.max( 1, width | 0 );
	for ( const paragraph of String( message ?? '' ).replace( /\r/g, '' ).split( /\n|@@/ ) ) {

		const words = paragraph.trim().split( /\s+/ ).filter( Boolean );
		let line = '';
		for ( const word of words ) {

			if ( line === '' ) line = word;
			else if ( line.length + 1 + word.length <= limit ) line += ' ' + word;
			else { lines.push( line ); line = word; }
			while ( line.length > limit ) { lines.push( line.slice( 0, limit ) ); line = line.slice( limit ); }

		}
		if ( line !== '' ) lines.push( line );

	}
	return lines;

}

/**
 * The text of the current `svc_plaque` index from strings.txt.
 *
 * @returns {string} the plaque text, '' when none or the index is unknown
 */
export function SCR_Hexen2PlaqueText() {

	const index = _cl.h2?.plaqueIndex | 0;
	if ( index <= 0 ) return '';
	return Hexen2_GetHostString( index ) ?? '';

}

/**
 * The Portal objectives message from the client's info mask, as native UpdateInfoMessage builds it.
 *
 * @param {number} infoMask the first 32 objective bits
 * @param {number} infoMask2 the second 32
 * @returns {string} 'Objectives:' followed by '@@' and each completed objective, or '' when infolist.txt is absent
 */
export function SCR_Hexen2ObjectivesText( infoMask, infoMask2 ) {

	if ( Hexen2_InfoStringCount() <= 0 ) return '';
	let message = 'Objectives:';
	for ( let i = 0; i < 64; i ++ ) {

		const bit = i < 32 ? ( ( infoMask | 0 ) >>> i ) & 1 : ( ( infoMask2 | 0 ) >>> ( i - 32 ) ) & 1;
		if ( bit === 0 ) continue;
		const objective = Hexen2_GetInfoString( i );
		if ( objective ) message += '@@' + objective;

	}
	return message;

}

// The native M_DrawTextBox border, in 320x200 menu coordinates centred on the virtual screen.
function SCR_DrawHexen2TextBox( x, y, width, lines ) {

	const offX = ( _vid.width - 320 ) >> 1, offY = ( _vid.height - 200 ) >> 1;
	const pic = name => Draw_CachePic ? Draw_CachePic( name ) : null;
	const draw = ( name, dx, dy ) => { const p = pic( name ); if ( p ) Draw_TransPic( x + dx + offX, y + dy + offY, p ); };
	draw( 'gfx/box_tl.lmp', 0, 0 );
	draw( 'gfx/box_tr.lmp', width * 8, 0 );
	for ( let i = 0; i < lines; i ++ ) {

		draw( 'gfx/box_ml.lmp', 0, 8 + i * 8 );
		draw( 'gfx/box_mr.lmp', width * 8, 8 + i * 8 );

	}
	draw( 'gfx/box_bl.lmp', 0, 8 + lines * 8 );
	draw( 'gfx/box_br.lmp', width * 8, 8 + lines * 8 );
	for ( let cx = 8; cx < width * 8; cx += 8 ) {

		draw( 'gfx/box_tm.lmp', cx, 0 );
		draw( 'gfx/box_bm.lmp', cx, 8 + lines * 8 );
		for ( let i = 0; i < lines; i ++ ) draw( i === 1 ? 'gfx/box_mm2.lmp' : 'gfx/box_mm.lmp', cx, 8 + i * 8 );

	}

}

function SCR_DrawHexen2PlaqueMessage( message, width, boxX, boxWidth ) {

	const lines = SCR_Hexen2TextLines( message, width );
	if ( lines.length === 0 ) return;
	const offY = ( _vid.height - 200 ) >> 1;
	const by = ( 25 - lines.length ) * 8 / 2 + offY;
	SCR_DrawHexen2TextBox( boxX, by - 16, boxWidth, lines.length + 2 );
	for ( let i = 0; i < lines.length; i ++ ) {

		const text = lines[ i ];
		const bx = ( 40 - text.length ) * 8 / 2;
		for ( let j = 0; j < text.length; j ++ ) Draw_Character( bx + j * 8, by + i * 8, text.charCodeAt( j ) + 128 );

	}

}

/*
==============
SCR_DrawHexen2Plaques

The native plaque layer: the strings.txt message from `svc_plaque` every frame while it is set, and the Portal
objectives while +infoplaque is held (h2shared/gl_screen.c Plaque_Draw, Info_Plaque_Draw). Called after the status bar
and before the console, and skipped while the console fills the screen.
==============
*/
export function SCR_DrawHexen2Plaques() {

	if ( ! GameProfile_IsHexen2() || ! _cl.h2 ) return;
	if ( scr_con_current === _vid.height ) return;
	const plaque = SCR_Hexen2PlaqueText();
	if ( plaque !== '' ) SCR_DrawHexen2PlaqueMessage( plaque, 26, 32, 30 );
	if ( _cl.h2.infoUp === true ) {

		const objectives = SCR_Hexen2ObjectivesText( _cl.h2.infoMask | 0, _cl.h2.infoMask2 | 0 );
		if ( objectives !== '' ) SCR_DrawHexen2PlaqueMessage( objectives, 30, 15, 34 );

	}

}

/*
==============
SCR_DrawCenterString
==============
*/
function SCR_DrawCenterString() {

	let remaining;

	// the finale prints the characters one at a time
	if ( _cl.intermission )
		remaining = Math.floor( scr_printspeed.value * ( _cl.time - scr_centertime_start ) );
	else
		remaining = 9999;

	scr_erase_center = 0;

	let start = 0;
	let y;

	if ( scr_center_lines <= 4 )
		y = Math.floor( _vid.height * 0.35 );
	else
		y = 48;

	while ( start < scr_centerstring.length ) {

		// scan the width of the line
		let l;
		for ( l = 0; l < 40; l ++ ) {

			if ( start + l >= scr_centerstring.length || scr_centerstring[ start + l ] === '\n' )
				break;

		}

		const x = Math.floor( ( _vid.width - l * 8 ) / 2 );

		for ( let j = 0; j < l; j ++ ) {

			Draw_Character( x + j * 8, y, scr_centerstring.charCodeAt( start + j ) );
			if ( remaining -- === 0 )
				return;

		}

		y += 8;

		// skip past the line
		while ( start < scr_centerstring.length && scr_centerstring[ start ] !== '\n' )
			start ++;

		if ( start >= scr_centerstring.length )
			break;

		start ++; // skip the \n

	}

}

function SCR_CheckDrawCenterString() {

	scr_copytop = 1;

	if ( scr_center_lines > scr_erase_lines )
		scr_erase_lines = scr_center_lines;

	scr_centertime_off -= host_frametime;

	if ( scr_centertime_off <= 0 && ! _cl.intermission )
		return;
	if ( key_dest !== key_game )
		return;

	SCR_DrawCenterString();

}

/*
====================
CalcFov
====================
*/
function CalcFov( fov_x, width, height ) {

	if ( fov_x < 1 || fov_x > 179 )
		fov_x = 90;

	const x = width / Math.tan( fov_x / 360 * Math.PI );
	let a = Math.atan( height / x );
	a = a * 360 / Math.PI;
	return a;

}

/*
====================
CalcFovX

Inverse of CalcFov - given vertical FOV, calculate horizontal FOV
====================
*/
function CalcFovX( fov_y, width, height ) {

	if ( fov_y < 1 || fov_y > 179 )
		fov_y = 90;

	const y = height / Math.tan( fov_y / 360 * Math.PI );
	let a = Math.atan( width / y );
	a = a * 360 / Math.PI;
	return a;

}

/*
=================
SCR_CalcRefdef

Must be called whenever vid changes
Internal use only
=================
*/
function SCR_CalcRefdef() {

	scr_fullupdate = 0; // force a background redraw
	_vid.recalc_refdef = false;
	_r_refdef.vrectScale = Draw_GetUIScale();

	// force the status bar to redraw
	Sbar_Changed();

	// bound viewsize
	if ( scr_viewsize.value < 30 )
		Cvar_Set( 'viewsize', '30' );
	if ( scr_viewsize.value > 120 )
		Cvar_Set( 'viewsize', '120' );

	// bound field of view
	if ( scr_fov.value < 10 )
		Cvar_Set( 'fov', '10' );
	if ( scr_fov.value > 170 )
		Cvar_Set( 'fov', '170' );

	// intermission is always full screen
	let size;
	if ( _cl.intermission )
		size = 120;
	else
		size = scr_viewsize.value;

	if ( size >= 120 )
		sb_lines = 0; // no status bar at all
	else if ( size >= 110 )
		sb_lines = 24; // no inventory
	else
		sb_lines = 24 + 16 + 8;
	Sbar_set_sb_lines( sb_lines );

	let full = false;
	if ( scr_viewsize.value >= 100.0 ) {

		full = true;
		size = 100.0;

	} else {

		size = scr_viewsize.value;

	}

	if ( _cl.intermission ) {

		full = true;
		size = 100;
		sb_lines = 0;
		Sbar_set_sb_lines( sb_lines );

	}

	size /= 100.0;

	// (upright on a phone) the status bar is above the touch controls, and the classic view ends above it
	const touchInset = SCR_TouchInset();
	Sbar_SetYOffset( _cl.intermission ? 0 : touchInset );
	oldtouchinset = touchInset;

	const h = _vid.height - sb_lines - ( _cl.intermission ? 0 : touchInset );

	_r_refdef.vrect.width = Math.floor( _vid.width * size );
	if ( _r_refdef.vrect.width < 96 ) {

		size = 96.0 / _r_refdef.vrect.width;
		_r_refdef.vrect.width = 96; // min for icons

	}

	_r_refdef.vrect.height = Math.floor( _vid.height * size );
	if ( _r_refdef.vrect.height > h )
		_r_refdef.vrect.height = h;
	if ( _r_refdef.vrect.height > _vid.height )
		_r_refdef.vrect.height = _vid.height;

	_r_refdef.vrect.x = Math.floor( ( _vid.width - _r_refdef.vrect.width ) / 2 );

	if ( full )
		_r_refdef.vrect.y = 0;
	else
		_r_refdef.vrect.y = Math.floor( ( h - _r_refdef.vrect.height ) / 2 );

	// Newer Game: the picture fills the screen and the status bar is drawn over the
	// bottom of it, so wide screens do not show black beside the bar
	if ( scr_newer() && _r_refdef.vrect.width >= _vid.width && sb_lines > 0 ) {

		_r_refdef.vrect.height = _vid.height;
		_r_refdef.vrect.y = 0;

	}

	// Hor+ FOV: lock vertical FOV to what fov cvar gives at 4:3,
	// then expand horizontal FOV for the actual aspect ratio.
	_r_refdef.fov_y = CalcFov( scr_fov.value, 4, 3 );
	_r_refdef.fov_x = CalcFovX( _r_refdef.fov_y, _r_refdef.vrect.width, _r_refdef.vrect.height );

	scr_vrect.x = _r_refdef.vrect.x;
	scr_vrect.y = _r_refdef.vrect.y;
	scr_vrect.width = _r_refdef.vrect.width;
	scr_vrect.height = _r_refdef.vrect.height;

}

/*
=================
SCR_SizeUp_f

Keybinding command
=================
*/
function SCR_SizeUp_f() {

	scr_viewsize.value += 10;
	if ( scr_viewsize.value > 120 )
		scr_viewsize.value = 120;
	_vid.recalc_refdef = true;

}

/*
=================
SCR_SizeDown_f

Keybinding command
=================
*/
function SCR_SizeDown_f() {

	scr_viewsize.value -= 10;
	if ( scr_viewsize.value < 30 )
		scr_viewsize.value = 30;
	_vid.recalc_refdef = true;

}

/*
==================
SCR_Init
==================
*/
/**
 * Registers the screen's cvars (`fov`, `viewsize`, `scr_conspeed`, `showram`, `showturtle`, `showpause`,
 * `scr_centertime`, `scr_printspeed`, `gl_triplebuffer`) and the `screenshot`, `sizeup` and `sizedown` commands,
 * loads the `ram`, `net` and `turtle` icons from gfx.wad, takes render.js's `r_refdef` unless one was wired, and marks
 * the screen initialized so `SCR_UpdateScreen` starts drawing (once the console is initialized too). Called once by
 * `Host_Init` (host.js) after `Draw_Init`.
 */
export function SCR_Init() {

	if ( _r_refdef === null ) _r_refdef = _r_refdef_canonical;

	Cvar_RegisterVariable( scr_fov );
	Cvar_RegisterVariable( scr_viewsize );
	Cvar_RegisterVariable( scr_conspeed );
	Cvar_RegisterVariable( scr_showram );
	Cvar_RegisterVariable( scr_showturtle );
	Cvar_RegisterVariable( scr_showpause );
	Cvar_RegisterVariable( scr_centertime );
	Cvar_RegisterVariable( scr_printspeed );
	Cvar_RegisterVariable( gl_triplebuffer );

	//
	// register our commands
	//
	Cmd_AddCommand( 'screenshot', SCR_ScreenShot_f );
	Cmd_AddCommand( 'sizeup', SCR_SizeUp_f );
	Cmd_AddCommand( 'sizedown', SCR_SizeDown_f );

	scr_ram = Draw_PicFromWad( 'ram' );
	scr_net = Draw_PicFromWad( 'net' );
	scr_turtle = Draw_PicFromWad( 'turtle' );

	scr_initialized = true;

}

/*
==============
SCR_DrawRam
==============
*/
function SCR_DrawRam() {

	if ( ! scr_showram.value )
		return;

	// r_cache_thrash is not applicable in Three.js port

}

/*
==============
SCR_DrawTurtle
==============
*/
let turtle_count = 0;

function SCR_DrawTurtle() {

	if ( ! scr_showturtle.value )
		return;

	if ( host_frametime < 0.1 ) {

		turtle_count = 0;
		return;

	}

	turtle_count ++;
	if ( turtle_count < 3 )
		return;

	Draw_Pic( scr_vrect.x, scr_vrect.y, scr_turtle );

}

/*
==============
SCR_DrawNet
==============
*/
function SCR_DrawNet() {

	if ( realtime - _cl.last_received_message < 0.3 )
		return;
	if ( _cls.demoplayback )
		return;

	Draw_Pic( scr_vrect.x + 64, scr_vrect.y, scr_net );

}

/*
==============
SCR_DrawPause
==============
*/
function SCR_DrawPause() {

	if ( ! scr_showpause.value )
		return;

	if ( ! _cl.paused )
		return;

	const pic = Draw_CachePic( 'gfx/pause.lmp' );
	if ( pic )
		Draw_Pic( ( _vid.width - ( pic.width || 0 ) ) / 2,
			( _vid.height - 48 - ( pic.height || 0 ) ) / 2, pic );

}

/*
==============
SCR_DrawLoading
==============
*/
/**
 * Draws the `gfx/loading.lmp` plaque centred on the screen (24 virtual pixels above centre, as in WinQuake) when a
 * load is showing: the one frame drawn by `SCR_BeginLoadingPlaque`, or Newer Game's first load from the menu, which
 * shows the plaque instead of the console. Called by `SCR_UpdateScreen`; draws nothing otherwise.
 */
export function SCR_DrawLoading() {

	if ( ! scr_drawloading && ! scr_plaque )
		return;

	const pic = Draw_CachePic( 'gfx/loading.lmp' );
	if ( pic )
		Draw_Pic( ( _vid.width - ( pic.width || 0 ) ) / 2,
			( _vid.height - 48 - ( pic.height || 0 ) ) / 2, pic );

}

/*
==================
SCR_SetUpToDrawConsole
==================
*/
function SCR_SetUpToDrawConsole() {

	Con_CheckResize();

	if ( scr_drawloading )
		return; // never a console with loading plaque
	if(R_DemoLoadingConsoleOverride()){
  scr_plaque=false;
  const hold=R_DemoLoadingHolding();Con_SetForcedup(hold);
  if(!hold&&key_dest===key_console){
   // The user now owns this console; subsequent manual close uses the native
   // preference and cannot inherit the automatic intro animation.
   R_DemoLoadingConsoleClosed();
  }else{
   if(hold)scr_con_current=scr_conlines=_vid.height;
   else{scr_conlines=0;scr_con_current=Math.max(0,scr_con_current-R_DemoLoadingConsoleSpeed(scr_conspeed.value,_vid.height)*host_frametime);if(scr_con_current===0)R_DemoLoadingConsoleClosed();}
   return;
  }
 }

	// decide on the height of the console
	const forcedup = ! _cl.worldmodel || _cls.signon !== SIGNONS;
	if ( ! forcedup && _cl.worldmodel ) scr_hadworld = true;

	// Newer Game: a load is not shown as a console
	scr_plaque = scr_newer() && forcedup && ! scr_hadworld && scr_loading();

	// coming out of a load: the console is gone at once, it does not roll up
	if ( scr_newer() && scr_wasforced && ! forcedup && key_dest !== key_console ) scr_con_current = 0;
	scr_wasforced = forcedup;

	// Newer Game: the console is only ever what the player opened.  Whatever starts
	// a load (a portal, the menu, a restart), it never comes down by itself.
	if ( scr_newer() && key_dest !== key_console ) {

		scr_conlines = 0;
		scr_con_current = 0;
		Con_SetForcedup( false );
		return;

	}

	Con_SetForcedup( forcedup );

	if ( scr_plaque ) {

		scr_conlines = 0;
		scr_con_current = 0;
		Con_SetForcedup( false );

	} else if ( forcedup ) {

		scr_conlines = _vid.height; // full screen
		scr_con_current = scr_conlines;

	} else if ( key_dest === key_console ) {

		scr_conlines = _vid.height / 2; // half screen

	} else {

		scr_conlines = 0; // none visible

	}

	if ( scr_conlines < scr_con_current ) {

		scr_con_current -= scr_conspeed.value * host_frametime;
		if ( scr_conlines > scr_con_current )
			scr_con_current = scr_conlines;

	} else if ( scr_conlines > scr_con_current ) {

		scr_con_current += scr_conspeed.value * host_frametime;
		if ( scr_conlines < scr_con_current )
			scr_con_current = scr_conlines;

	}

	if ( clearconsole ++ < _vid.numpages ) {

		Sbar_Changed();

	} else if ( clearnotify ++ < _vid.numpages ) {

		// nothing

	} else {

		// con_notifylines = 0; -- handled via console module

	}

}

/*
==================
SCR_DrawConsole
==================
*/
function SCR_DrawConsole() {

	if ( scr_con_current ) {

		scr_copyeverything = 1;
		Con_DrawConsole( scr_con_current, true );
		clearconsole = 0;

	} else {

		if ( key_dest === key_game || key_dest === key_message )
			Con_DrawNotify(); // only draw notify in game

	}

}

/*
==================
SCR_DrawNotifyString
==================
*/
function SCR_DrawNotifyString() {

	let start = 0;
	let y = Math.floor( _vid.height * 0.35 );

	while ( start < scr_notifystring.length ) {

		let l;
		for ( l = 0; l < 40; l ++ ) {

			if ( start + l >= scr_notifystring.length || scr_notifystring[ start + l ] === '\n' )
				break;

		}

		const x = Math.floor( ( _vid.width - l * 8 ) / 2 );
		for ( let j = 0; j < l; j ++ )
			Draw_Character( x + j * 8, y, scr_notifystring.charCodeAt( start + j ) );

		y += 8;

		while ( start < scr_notifystring.length && scr_notifystring[ start ] !== '\n' )
			start ++;

		if ( start >= scr_notifystring.length )
			break;

		start ++; // skip the \n

	}

}

/*
==================
SCR_TileClear
==================
*/
/**
 * The frame counter (Options > FPS counter, `cl_showfps`) at the top right, with the view's position and angles on two
 * lines under it in a level (`SCR_PositionLines`), and the profiler's status at the top left. Called once a frame from
 * `SCR_UpdateScreen`.
 */
export function SCR_DrawPerf() {

	const status = R_PerfScreenLines();
	if ( status !== null ) {

		for ( let i = 0; i < status.length; i ++ ) Draw_String( 8, 8 + i * 10, status[ i ] );

	}

	if ( Cvar_VariableValue( 'cl_showfps' ) === 0 ) return;

	const text = R_PerfFpsText();
	Draw_String( _vid.width - text.length * 8 - 8, 4, text );
	// where the view is and which way it looks, under it (owner, 14 October 2026: a screenshot then says exactly where
	// to look from), one line each
	if ( _cls.signon === 4 && _cl.worldmodel && _r_refdef?.vieworg ) {

		const lines = SCR_PositionLines( _r_refdef.vieworg, _r_refdef.viewangles || _cl.viewangles );
		for ( let i = 0; i < lines.length; i ++ ) Draw_String( _vid.width - lines[ i ].length * 8 - 8, SCR_POSITION_Y + i * SCR_LINE_STEP, lines[ i ] );

	}

}

// the FPS counter's second and third lines (virtual pixels from the top, then line to line), and the corner message's
// place below all three
export const SCR_POSITION_Y = 14, SCR_LINE_STEP = 10;
const SCR_NOTICE_Y = 16, SCR_NOTICE_Y_UNDER_FPS = 36;

/**
 * The FPS counter's second and third lines: the view's position, then its direction, whole numbers, e.g.
 * `x 704 y 1376 z 900` and `yaw 270 pitch -10`, of the view drawn (r_refdef: the eye's position in Quake units, or the
 * respawn or chase camera's). Yaw is Quake's, in degrees 0..359, counter-clockwise seen from above (0 along +x, 90
 * along +y: east and north on a map drawn north up); pitch is Quake's own (positive looks down).
 *
 * @param {ArrayLike<number>} origin the view's position
 * @param {ArrayLike<number>} angles the view's angles, Quake's order: pitch, yaw, roll
 * @returns {Array<string>} the two lines
 */
export function SCR_PositionLines( origin, angles ) {

	const yaw = ( ( Math.round( angles[ 1 ] ) % 360 ) + 360 ) % 360, pitch = Math.round( angles[ 0 ] ) || 0;
	return [ 'x ' + Math.round( origin[ 0 ] ) + ' y ' + Math.round( origin[ 1 ] ) + ' z ' + Math.round( origin[ 2 ] ), 'yaw ' + yaw + ' pitch ' + pitch ];

}

/**
 * The respawn-health rule's corner message (card [4]), at the top right (y = 16 virtual pixels, or 36 under the FPS
 * counter's three lines when it is on; right-aligned 8 pixels in). Called once a frame from `SCR_UpdateScreen`, straight after the FPS counter.
 * The text, if any, comes from `Respawn_NoticeAt` (newer/ui/respawn_notice.js) for the current `cl.time`. Not drawn
 * over a demo, the menu or the console.
 *
 * @throws {Error} when the Newer hook `Respawn_NoticeAt` is not installed (in the game only)
 */
export function SCR_DrawRespawnNotice() {

	if ( _cls.demoplayback || key_dest !== key_game ) return; // not over a demo, the menu or the console
	const text = Respawn_NoticeAt( _cl.time );
	// (below the FPS counter's three lines when it is on)
	if ( text !== null ) Draw_String( _vid.width - text.length * 8 - 8, Cvar_VariableValue( 'cl_showfps' ) === 0 ? SCR_NOTICE_Y : SCR_NOTICE_Y_UNDER_FPS, text );

}

function SCR_TileClear() {

	if ( _r_refdef.vrect.x > 0 ) {

		// left
		Draw_TileClear( 0, 0, _r_refdef.vrect.x, _vid.height - sb_lines );
		// right
		Draw_TileClear( _r_refdef.vrect.x + _r_refdef.vrect.width, 0,
			_vid.width - _r_refdef.vrect.x + _r_refdef.vrect.width,
			_vid.height - sb_lines );

	}

	if ( _r_refdef.vrect.y > 0 ) {

		// top
		Draw_TileClear( _r_refdef.vrect.x, 0,
			_r_refdef.vrect.x + _r_refdef.vrect.width,
			_r_refdef.vrect.y );
		// bottom
		Draw_TileClear( _r_refdef.vrect.x,
			_r_refdef.vrect.y + _r_refdef.vrect.height,
			_r_refdef.vrect.width,
			_vid.height - sb_lines -
			( _r_refdef.vrect.height + _r_refdef.vrect.y ) );

	}

}

/*
==============
SCR_ScreenShot_f
==============
*/
let _screenshotPending = false;

function SCR_ScreenShot_f() {

	_screenshotPending = true;
	Con_Printf( 'Capturing screenshot...\n' );

}

function SCR_DoScreenShot() {

	if ( renderer == null ) {

		Con_Printf( 'Screenshot: renderer not initialized\n' );
		return;

	}

	const canvas = renderer.domElement;

	try {

		// toDataURL is synchronous — reads the buffer before it's cleared
		const dataURL = canvas.toDataURL( 'image/png' );

		const link = document.createElement( 'a' );
		link.download = 'quake_screenshot.png';
		link.href = dataURL;
		link.click();

		Con_Printf( 'Screenshot saved\n' );

	} catch ( e ) {

		Con_Printf( 'Screenshot failed: ' + e.message + '\n' );

	}

}

/*
===============
SCR_BeginLoadingPlaque
================
*/
/**
 * Puts up the loading plaque before a level load: stops all sounds, then, when connected and fully signed on, clears
 * the notify lines, the centre print and the console, draws one frame with the plaque (calling `SCR_UpdateScreen`),
 * and stops further screen updates until `SCR_EndLoadingPlaque`. After 60 seconds of realtime without that call,
 * `SCR_UpdateScreen` gives up, prints `load failed.` and draws again. Called by the `map` and `reconnect` host
 * commands (host_cmd.js), `CL_NextDemo` and the menu. Not connected (or still signing on), it only stops the
 * sounds.
 *
 * @throws {Error} whatever the one forced `SCR_UpdateScreen` frame throws (see there)
 */
export function SCR_BeginLoadingPlaque() {

	if ( _S_StopAllSounds ) _S_StopAllSounds( true );

	if ( _cls.state !== 2 ) // ca_connected
		return;
	if ( _cls.signon !== SIGNONS )
		return;

	// redraw with no console and the loading plaque
	Con_ClearNotify();
	scr_centertime_off = 0;
	scr_con_current = 0;

	scr_drawloading = true;
	scr_fullupdate = 0;
	Sbar_Changed();
	SCR_UpdateScreen();
	scr_drawloading = false;

	scr_disabled_for_loading = true;
	scr_disabled_time = realtime;
	scr_fullupdate = 0;

}

/*
===============
SCR_EndLoadingPlaque
================
*/
/**
 * Lets the screen update again after `SCR_BeginLoadingPlaque` and clears the notify lines. Called when the client
 * completes sign-on (stage 4, cl_main.js), by `Host_Error`, when the console is toggled, and by the menu. Safe to call
 * when no plaque is up.
 */
export function SCR_EndLoadingPlaque() {

	scr_disabled_for_loading = false;
	scr_fullupdate = 0;
	Con_ClearNotify();

}

/*
==================
SCR_UpdateScreen
==================
*/
/**
 * This is called every frame (by the host frame, host.js), and can also be called explicitly to flush text to the
 * screen (`Con_Printf` during start-up, `SCR_BeginLoadingPlaque`). WARNING (WinQuake): be very careful calling this
 * from elsewhere, because the refresh needs almost the entire 256k of stack space!
 *
 * Draws nothing while the loading plaque has disabled updates (up to 60 seconds), before `SCR_Init` and the console
 * are initialized, or while Newer Game is changing level (`SCR_ChangingLevel`: the last frame stays). Otherwise it
 * clears the renderer and the 2D overlay, recomputes the refresh window when the field of view, view size, touch
 * inset or Newer mode changed (or `vid.recalc_refdef` is set), moves the console, renders the 3D view
 * (`V_RenderView`), then draws the 2D layer in WinQuake's order: tiles around a reduced view; then either a modal
 * dialog, the welcome loading screen, the loading plaque, the intermission tally, the finale, a cutscene's text alone
 * (`cl.intermission` 3), or the normal crosshair,
 * icons, pause plaque, centre print, status bar, console and menu; then the FPS counter, respawn notice and bestiary
 * encounter. It updates the palette blend and takes a screenshot requested by the `screenshot` command after the
 * frame is drawn.
 *
 * @throws {Error} when a Newer hook it uses (demo and welcome loading, bestiary, profiler, respawn notice) is not
 *   installed
 */
export function SCR_UpdateScreen() {

	if ( block_drawing )
		return;

	_vid.numpages = 2 + gl_triplebuffer.value;

	scr_copytop = 0;
	scr_copyeverything = 0;

	if ( scr_disabled_for_loading ) {

		if ( realtime - scr_disabled_time > 60 ) {

			scr_disabled_for_loading = false;
			Con_Printf( 'load failed.\n' );

		} else {

			return;

		}

	}

	if ( ! scr_initialized || ! con_initialized )
		return; // not initialized yet

	// changing level mid-game: keep the last frame, show no console
	if ( SCR_ChangingLevel() && !R_DemoLoadingConsoleOverride() && !R_WelcomeLoadingHolding() ) {

		scr_con_current = 0;
		return;

	}

	// GL_BeginRendering
	if ( _GL_BeginRendering ) _GL_BeginRendering();

	// Clear 2D overlay
	Draw_BeginFrame();

	//
	// determine size of refresh window
	//
	if ( oldfov !== scr_fov.value ) {

		oldfov = scr_fov.value;
		_vid.recalc_refdef = true;

	}

	if ( oldtouchinset !== SCR_TouchInset() ) _vid.recalc_refdef = true;

	if ( oldscreensize !== scr_viewsize.value ) {

		oldscreensize = scr_viewsize.value;
		_vid.recalc_refdef = true;

	}

	if ( oldnewer !== scr_newer() ) {

		oldnewer = scr_newer();
		_vid.recalc_refdef = true;

	}

	if ( _vid.recalc_refdef )
		SCR_CalcRefdef();

	//
	// do 3D refresh drawing, and then update the screen
	//
	SCR_SetUpToDrawConsole();

	if ( _V_RenderView ) _V_RenderView();

	GL_Set2D();

	//
	// draw any areas not covered by the refresh
	//
	SCR_TileClear();

	if ( scr_drawdialog ) {

		SCR_DrawStatusBar();
		Draw_FadeScreen();
		SCR_DrawNotifyString();
		scr_copyeverything = 1;

	} else if ( R_WelcomeLoadingHolding() ) {
		// Fresh Newer introduction only: warm/render underneath the existing
		// loading artwork, with no weak world or HUD shown before it is ready.
		Draw_Fill(0,0,_vid.width,_vid.height,0);
		scr_plaque=true;SCR_DrawLoading();scr_plaque=false;
		if(key_dest===key_console)SCR_DrawConsole();
		_M_Draw();
	} else if ( scr_drawloading || scr_plaque ) {

		SCR_DrawLoading();
		SCR_DrawStatusBar();

	} else if ( GameProfile_IsHexen2() && Hexen2_IntermissionActive( _cl ) && key_dest === key_game ) {

		Hexen2_DrawIntermission( _cl, { now: _cl.time, oem: Cvar_VariableValue( 'oem' ) !== 0 } );
		scr_copyeverything = 1; // native full-screen intermission

	} else if ( _cl.intermission === 1 && key_dest === key_game ) {

		Sbar_IntermissionOverlay();

	} else if ( _cl.intermission === 2 && key_dest === key_game ) {

		Sbar_FinaleOverlay();
		SCR_CheckDrawCenterString();

	} else if ( _cl.intermission === 3 && key_dest === key_game ) {

		SCR_CheckDrawCenterString(); // a cutscene shows its text only: no status bar or crosshair (WinQuake; card [44m])

	} else {

		if ( ! R_BestiaryInputLocked() && Cvar_VariableValue( 'crosshair' ) !== 0 && _cls.demoplayback === false )
			Draw_Character( Math.floor( _vid.width / 2 + Cvar_VariableValue( 'cl_crossx' ) ) - 4,
				Math.floor( _vid.height / 2 + Cvar_VariableValue( 'cl_crossy' ) ) - 4, 43 ); // '+' crosshair

		SCR_DrawRam();
		SCR_DrawNet();
		SCR_DrawTurtle();
		SCR_DrawPause();
		SCR_CheckDrawCenterString();
		SCR_DrawStatusBar();
		SCR_DrawHexen2Plaques();
		R_WeaponWheelDraw(); // (Newer Game: the controller's weapon wheel while held open)
		SCR_DrawConsole();
		_M_Draw();
		R_ControllerPromptsDraw(); // (Newer Game: the controller's buttons at a menu's foot)

	}

	SCR_DrawPerf();
	SCR_DrawRespawnNotice();
	R_BestiaryEncounterDraw();

	R_PerfStage( '2D screen and menus' );

	if ( _V_UpdatePalette ) _V_UpdatePalette();

	// GL_EndRendering
	if ( _GL_EndRendering ) _GL_EndRendering();
	if(R_DemoLoadingHolding()&&scr_con_current>0)R_DemoLoadingConsoleDrawn();

	// Capture screenshot after render, while draw buffer is still valid
	if ( _screenshotPending ) {

		_screenshotPending = false;
		SCR_DoScreenShot();

	}

}
