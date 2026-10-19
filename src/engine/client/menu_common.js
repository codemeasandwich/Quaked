/**
 * @module engine/client/menu_common
 *
 * What every menu screen shares (card [44j], split from menu.js): the screen ids and the menu's state with its
 * setters, the host's drawing, sound and clocks (`M_SetExternals`), the drawing helpers that place 320 x 200 menu art
 * on the screen, and the data more than one family reads (the episodes and levels, the Newer Game defaults).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `m_state`, `m_entersound`, `m_recursiveDraw`, `m_return_state`, `m_return_onerror`,
 * `m_return_reason`, `m_save_demonum`, `_WT_QueryRooms`, `_WT_CreateRoom`, `_cl_name`, `_Touch_ExitFullscreen`,
 * `_cls` and 16 more; module-level variables `_key_dest_set`, `_key_dest_get`, `_Draw_TransPic`, `_Draw_Pic`,
 * `_Draw_Character`, `_Draw_WithAlpha`, `_Draw_String`, `_Draw_TransPicTranslate`, `_Draw_SubPic`,
 * `_SCR_ModalMessage`.
 *
 * Errors: throws at 1 place.
 *
 * Each state field has one writer, its setter; `menuOpeners` is filled by the facade (menu.js) as it loads.
 */
import { NEWER_DEFAULT_GAMMA, Newer_ApplyGameDefaults } from '../common/hooks.js'; // installed by newer/ui/newer_defaults.js
import { MainMenu_Glyph, MainMenu_Image, MainMenu_TextBox, MainMenu_Text } from '../common/hooks.js'; // installed by newer/ui/menu_webgl.js
import { key_dest } from './keys.js';
import { Draw_GetVirtualWidth, Draw_GetVirtualHeight } from '../render/gl_draw.js';

/*
==============================================================================

			MENU STATES

==============================================================================
*/

export const m_none = 0;
export const m_main = 1;
export const m_singleplayer = 2;
export const m_load = 3;
export const m_save = 4;
export const m_multiplayer = 5;
export const m_setup = 6;
export const m_net = 7;
export const m_options = 8;
export const m_video = 9;
export const m_keys = 10;
export const m_help = 11;
export const m_quit = 12;
export const m_serialconfig = 13;
export const m_modemconfig = 14;
export const m_lanconfig = 15;
export const m_gameoptions = 16;
export const m_search = 17;
export const m_slist = 18;
export const m_credits = 19;
export const m_newer = 20;
export const m_levelselect = 21;
export const m_bestiary = 22;
export const m_cheats = 23;
export const m_mpchoice = 24; // Multiplayer: local split screen or online (card [MP1])
export const m_splitscreen = 25; // Local play: players' windows (cards [37a]-[37c])

export let m_state = m_none;
export let m_entersound = false;
export let m_recursiveDraw = false;

export let m_return_state = 0;
export let m_return_onerror = false;
export let m_return_reason = '';

export let m_save_demonum = 0;

// The setters of the menu's shared state: every screen family changes the state, and an importer cannot assign a
// module's binding, so each of these has one writer here (card [44j]).
/**
 * Sets the screen the menu shows (`m_state`, one of the `m_*` ids; `m_none` when no menu is open).
 *
 * @param {number} value the screen id
 */
export function set_m_state( value ) { m_state = value; }
/**
 * Asks for the menu's enter sound on the next draw (`m_entersound`); `M_Draw` plays it and clears the flag.
 *
 * @param {boolean} value true to play it
 */
export function set_m_entersound( value ) { m_entersound = value; }
/**
 * Marks that the screen under a modal one should be drawn first on the next `M_Draw` (`m_recursiveDraw`).
 *
 * @param {boolean} value true to draw it
 */
export function set_m_recursiveDraw( value ) { m_recursiveDraw = value; }
/**
 * Sets the screen a failed connection returns to (`m_return_state`).
 *
 * @param {number} value the screen id
 */
export function set_m_return_state( value ) { m_return_state = value; }
/**
 * Sets whether a failed connection should return to the menu (`m_return_onerror`).
 *
 * @param {boolean} value true to return
 */
export function set_m_return_onerror( value ) { m_return_onerror = value; }
/**
 * Sets the reason shown for a failed connection (`m_return_reason`).
 *
 * @param {string} value the message
 */
export function set_m_return_reason( value ) { m_return_reason = value; }
/**
 * Keeps the demo number the main menu interrupted (`m_save_demonum`), restored when it closes.
 *
 * @param {number} value `cls.demonum` when the menu opened
 */
export function set_m_save_demonum( value ) { m_save_demonum = value; }

// The screens the main menu opens that live in later families (level select, multiplayer, options): filled by the
// facade (menu.js) as it loads, so the main family does not import the families that return to it.
// Until then each says what is missing (a test or tool that loads a family without menu.js).
const unfilled = name => () => { throw new Error( 'menuOpeners.' + name + ': load menu.js first, which fills the openers' ); };
export const menuOpeners = {
	levelSelect: unfilled( 'levelSelect' ), multiplayerChoice: unfilled( 'multiplayerChoice' ), options: unfilled( 'options' )
};

// WT_QueryRooms and WT_CreateRoom will be injected via M_SetExternals
export let _WT_QueryRooms = null;
export let _WT_CreateRoom = null;
export let _cl_name = null;

// Level data - shareware Episode 1 + community deathmatch maps
export const levels = [
	{ name: 'start', description: 'Entrance' }, // 0

	{ name: 'e1m1', description: 'Slipgate Complex' }, // 1
	{ name: 'e1m2', description: 'Castle of the Damned' },
	{ name: 'e1m3', description: 'The Necropolis' },
	{ name: 'e1m4', description: 'The Grisly Grotto' },
	{ name: 'e1m5', description: 'Gloom Keep' },
	{ name: 'e1m6', description: 'The Door To Chthon' },
	{ name: 'e1m7', description: 'The House of Chthon' },
	{ name: 'e1m8', description: 'Ziggurat Vertigo' },

	// Community deathmatch maps (freely distributable)
	{ name: 'spinev2', description: 'Spine v2 (Headshot)' }, // 9
	{ name: 'rapture1', description: 'Imminent Boom (Danimal)' },
	{ name: 'naked5', description: 'Kinky Afro (Gandhi)' },
	{ name: 'zed', description: 'Zed (Vondur)' },
	{ name: 'efdm9', description: 'Tangerine Dream (Mr Fribbles)' },
	{ name: 'baldm6', description: 'Scrap Metal (Bal)' },
	{ name: 'edc', description: 'Eternal Dismemberment (Tyrann)' },
	{ name: 'ultrav', description: 'UltraViolence (Escher)' },
];

export const episodes = [
	{ description: 'Welcome to Quake', firstLevel: 0, levels: 1 },
	{ description: 'Doomed Dimension', firstLevel: 1, levels: 8 },
	{ description: 'Deathmatch Arena', firstLevel: 9, levels: 8 }
];

// leaving fullscreen on a touch device (platform/touch.js), set by the host ([44g] D1a): the client does not import
// the platform
export let _Touch_ExitFullscreen = () => {};

/*
==============================================================================

			EXTERNAL REFERENCES

==============================================================================
*/

// Set by external modules to avoid circular dependencies
let _key_dest_set = null; // function to set key_dest
let _key_dest_get = null; // function to get key_dest
export let _cls = { state: 0, demonum: - 1, demoplayback: false };
export let _sv = { active: false };
export let _svs = { maxclients: 1 };
export let _cl = { intermission: 0, gametype: 0 };
export let _realVid = { width: 640, height: 480 };
export const _vid = {
	get width() { return Draw_GetVirtualWidth(); },
	get height() { return Draw_GetVirtualHeight(); }
};
export let _host_time_get = () => 0;
export let _realtime_get = () => 0;
export let _Draw_CachePic = null;
let _Draw_TransPic = null;
let _Draw_Pic = null;
let _Draw_Character = null;
// draws through a lowered opacity (gl_draw.js Draw_WithAlpha, set by the host); unwired, at full opacity
let _Draw_WithAlpha = ( alpha, draw ) => draw();
export let _Draw_Fill = null;
export let _Draw_FadeScreen = null;
export let _Draw_ConsoleBackground = null;
let _Draw_String = null;
let _Draw_TransPicTranslate = null;
let _Draw_SubPic = null;
export let _weaponModelsCredit = null;
export let _S_LocalSound = null;
export let _SCR_BeginLoadingPlaque = null;
export let _SCR_EndLoadingPlaque = null;
let _SCR_ModalMessage = null;
export let _IN_RequestPointerLock = null;
export let _CL_NextDemo = null;

/**
 * Hands the menu the engine services above it (host, client, server, video, drawing, sound, network, platform) that
 * it calls without importing them. host.js calls it twice: as the module loads, with `{ Touch_ExitFullscreen }`
 * (card [44g], D1a), and from `Host_Init` after `Draw_Init`, with the client state and drawing functions. Each key
 * replaces the current value only when present and truthy (`weaponModelsCredit` whenever the key is present, so it
 * can be cleared); omitted keys keep what they had. Objects are kept by reference for the page's lifetime.
 *
 * Keys, and the default used until they are wired:
 * - `key_dest_set(dest)`, `key_dest_get()`: write and read where keys go. Default null: reads fall back to the
 *   imported `key_dest` and writes are dropped.
 * - `cls` (`client_static_t`): `state`, `demonum`, `demoplayback`. Default `{ state: 0, demonum: -1,
 *   demoplayback: false }`.
 * - `sv` (`server_t`): `active`, `edicts` (the Cheats menu). Default `{ active: false }`.
 * - `svs` (`server_static_t`): `maxclients`. Default `{ maxclients: 1 }`.
 * - `cl` (`client_state_t`): `intermission`. Default `{ intermission: 0, gametype: 0 }`.
 * - `vid` (`viddef_t`): the real video size, `width`/`height` in CSS pixels (the window's inner size), used to map
 *   touches on the scaled Credits screen.
 *   Default `{ width: 640, height: 480 }`.
 * - `host_time_get()`, `realtime_get()`: host time and real time in seconds, for the animated cursors and
 *   `MainMenu_End`. Default `() => 0`.
 * - `Draw_CachePic`, `Draw_TransPic`, `Draw_Pic`, `Draw_Character`, `Draw_Fill`, `Draw_FadeScreen`,
 *   `Draw_ConsoleBackground`, `Draw_String`, `Draw_TransPicTranslate`, `Draw_SubPic` (gl_draw.js). Default null:
 *   the menu then draws nothing that needs them (screens that need `Draw_CachePic` return early). `Draw_String` is
 *   stored but not used.
 * - `S_LocalSound(name)`: menu click sounds. Default null (silent).
 * - `SCR_BeginLoadingPlaque()`, `SCR_EndLoadingPlaque()`: the loading plaque around loads and room creation.
 *   Default null; host.js wires both.
 * - `IN_RequestPointerLock()`: asked for when a game starts from the menu. Default null.
 * - `CL_NextDemo()`: resumes the demo loop when the main menu closes while not connected. Default null.
 * - `WT_QueryRooms(serverUrl)`, `WT_CreateRoom(serverUrl, options)` (net_webtransport.js): the Join Game room list
 *   and the New Game room. Default null: fetching the list fails with "WebTransport not available".
 * - `cl_name` (`cvar_t`): the player name, for the room host and the Setup menu. Default null (`'Player'` /
 *   `'player'`).
 * - `weaponModelsCredit`: an optional picture drawn on the Credits screen. Default null; host.js does not wire it.
 * - `Touch_ExitFullscreen()` (platform/touch.js): leaves fullscreen when the Quit menu opens. Default a no-op.
 *
 * @param {object} externals any subset of the keys above
 */
export function M_SetExternals( externals ) {
	if ( 'weaponModelsCredit' in externals ) _weaponModelsCredit = externals.weaponModelsCredit;
	if ( externals.Touch_ExitFullscreen ) _Touch_ExitFullscreen = externals.Touch_ExitFullscreen;

	if ( externals.key_dest_set ) _key_dest_set = externals.key_dest_set;
	if ( externals.key_dest_get ) _key_dest_get = externals.key_dest_get;
	if ( externals.cls ) _cls = externals.cls;
	if ( externals.sv ) _sv = externals.sv;
	if ( externals.svs ) _svs = externals.svs;
	if ( externals.cl ) _cl = externals.cl;
	if ( externals.vid ) _realVid = externals.vid;
	if ( externals.Draw_CachePic ) _Draw_CachePic = externals.Draw_CachePic;
	if ( externals.Draw_TransPic ) _Draw_TransPic = externals.Draw_TransPic;
	if ( externals.Draw_Pic ) _Draw_Pic = externals.Draw_Pic;
	if ( externals.Draw_Character ) _Draw_Character = externals.Draw_Character;
	if ( externals.Draw_WithAlpha ) _Draw_WithAlpha = externals.Draw_WithAlpha;
	if ( externals.Draw_Fill ) _Draw_Fill = externals.Draw_Fill;
	if ( externals.Draw_FadeScreen ) _Draw_FadeScreen = externals.Draw_FadeScreen;
	if ( externals.Draw_ConsoleBackground ) _Draw_ConsoleBackground = externals.Draw_ConsoleBackground;
	if ( externals.Draw_String ) _Draw_String = externals.Draw_String;
	if ( externals.S_LocalSound ) _S_LocalSound = externals.S_LocalSound;
	if ( externals.SCR_BeginLoadingPlaque ) _SCR_BeginLoadingPlaque = externals.SCR_BeginLoadingPlaque;
	if ( externals.SCR_EndLoadingPlaque ) _SCR_EndLoadingPlaque = externals.SCR_EndLoadingPlaque;
	if ( externals.IN_RequestPointerLock ) _IN_RequestPointerLock = externals.IN_RequestPointerLock;
	if ( externals.host_time_get ) _host_time_get = externals.host_time_get;
	if ( externals.realtime_get ) _realtime_get = externals.realtime_get;
	if ( externals.CL_NextDemo ) _CL_NextDemo = externals.CL_NextDemo;
	if ( externals.WT_QueryRooms ) _WT_QueryRooms = externals.WT_QueryRooms;
	if ( externals.WT_CreateRoom ) _WT_CreateRoom = externals.WT_CreateRoom;
	if ( externals.cl_name ) _cl_name = externals.cl_name;
	if ( externals.Draw_TransPicTranslate ) _Draw_TransPicTranslate = externals.Draw_TransPicTranslate;
	if ( externals.Draw_SubPic ) _Draw_SubPic = externals.Draw_SubPic;

}

/**
 * Where keys go now (`key_dest`): through the host's getter when it set one, otherwise keys.js's own value.
 *
 * @returns {number} `key_game`, `key_console`, `key_message` or `key_menu`
 */
export function getKeyDest() {

	return _key_dest_get ? _key_dest_get() : key_dest;

}

/**
 * Sends keys to `val` through the host's setter (nothing before the host sets one).
 *
 * @param {number} val `key_game`, `key_console`, `key_message` or `key_menu`
 */
export function setKeyDest( val ) {

	if ( _key_dest_set ) _key_dest_set( val );

}

/*
==============================================================================

			DRAWING HELPERS

==============================================================================
*/

/*
================
M_DrawCharacter

Draws one solid graphics character
================
*/
/**
 * Draws one character of the menu font at a 320 x 200 menu position, centred on the screen: as the WebGL menu's glyph
 * when it is drawing, otherwise with the host's `Draw_Character`.
 *
 * @param {number} cx x in menu pixels
 * @param {number} line y in menu pixels
 * @param {number} num the character, 0..255 (128 and up the brown set)
 */
export function M_DrawCharacter( cx, line, num ) {

	const x = cx + ( ( _vid.width - 320 ) >> 1 ), y = line + ( ( _vid.height - 200 ) >> 1 );
	if ( MainMenu_Glyph( x, y, num ) ) return;
	if ( _Draw_Character )
		_Draw_Character( x, y, num );

}

/**
 * Prints a menu string in the brown (highlighted) font at a 320 x 200 menu position, 8 pixels a character, through the
 * WebGL menu when it is drawing.
 *
 * @param {number} cx x in menu pixels
 * @param {number} cy y in menu pixels
 * @param {string} str the text (one byte a character)
 */
export function M_Print( cx, cy, str ) {

	if ( MainMenu_Text( cx + ( ( _vid.width - 320 ) >> 1 ), cy + ( ( _vid.height - 200 ) >> 1 ), str, 0 ) ) return;

	for ( let i = 0; i < str.length; i ++ ) {

		M_DrawCharacter( cx, cy, str.charCodeAt( i ) + 128 );
		cx += 8;

	}

}

/**
 * Prints a menu string in the white font at a 320 x 200 menu position, 8 pixels a character, through the WebGL menu
 * when it is drawing.
 *
 * @param {number} cx x in menu pixels
 * @param {number} cy y in menu pixels
 * @param {string} str the text (one byte a character)
 */
export function M_PrintWhite( cx, cy, str ) {

	if ( MainMenu_Text( cx + ( ( _vid.width - 320 ) >> 1 ), cy + ( ( _vid.height - 200 ) >> 1 ), str, 2 ) ) return;

	for ( let i = 0; i < str.length; i ++ ) {

		M_DrawCharacter( cx, cy, str.charCodeAt( i ) );
		cx += 8;

	}

}

// A menu item that cannot be chosen: the menu's own lettering, faded (the WebGL menu's disabled material; natively at
// 40% opacity). Card [MP1].
/**
 * Prints a menu item that cannot be chosen: `M_Print`'s lettering at 40% opacity (the WebGL menu's disabled look).
 *
 * @param {number} cx x in menu pixels
 * @param {number} cy y in menu pixels
 * @param {string} str the text
 */
export function M_PrintFaded( cx, cy, str ) {

	if ( MainMenu_Text( cx + ( ( _vid.width - 320 ) >> 1 ), cy + ( ( _vid.height - 200 ) >> 1 ), str, 0, true ) ) return;
	_Draw_WithAlpha( 0.4, () => {

		for ( let i = 0; i < str.length; i ++ ) { M_DrawCharacter( cx, cy, str.charCodeAt( i ) + 128 ); cx += 8; }

	} );

}

/**
 * Draws a picture with its transparent pixels at a 320 x 200 menu position, centred on the screen: through the WebGL
 * menu when it is drawing, otherwise with the host's `Draw_TransPic`. Nothing for a missing picture.
 *
 * @param {number} x x in menu pixels
 * @param {number} y y in menu pixels
 * @param {?qpic_t} pic the picture (`Draw_CachePic`)
 */
export function M_DrawTransPic( x, y, pic ) {

	const dx = x + ( ( _vid.width - 320 ) >> 1 ), dy = y + ( ( _vid.height - 200 ) >> 1 );
	if ( MainMenu_Image( dx, dy, pic ) ) return;
	if ( _Draw_TransPic && pic )
		_Draw_TransPic( dx, dy, pic );

}

/**
 * Draws rows `srcY` to `srcY + srcH` of a picture at a 320 x 200 menu position, as `M_DrawTransPic` does a whole one.
 *
 * @param {number} x x in menu pixels
 * @param {number} y y in menu pixels
 * @param {?qpic_t} pic the picture
 * @param {number} srcY the first row
 * @param {number} srcH how many rows
 */
export function M_DrawSubPic( x, y, pic, srcY, srcH ) {

	const dx = x + ( ( _vid.width - 320 ) >> 1 ), dy = y + ( ( _vid.height - 200 ) >> 1 );
	if ( MainMenu_Image( dx, dy, pic, srcY ) ) return;
	if ( _Draw_SubPic && pic )
		_Draw_SubPic( dx, dy, pic, srcY, srcH );

}

/**
 * Draws a solid picture at a 320 x 200 menu position, centred on the screen: through the WebGL menu when it is
 * drawing, otherwise with the host's `Draw_Pic`. Exported also as `M_DrawPic_export`.
 *
 * @param {number} x x in menu pixels
 * @param {number} y y in menu pixels
 * @param {?qpic_t} pic the picture
 */
export function M_DrawPic( x, y, pic ) {

	const dx = x + ( ( _vid.width - 320 ) >> 1 ), dy = y + ( ( _vid.height - 200 ) >> 1 );
	if ( MainMenu_Image( dx, dy, pic ) ) return;
	if ( _Draw_Pic && pic )
		_Draw_Pic( dx, dy, pic );

}

export { M_DrawPic as M_DrawPic_export };


/**
 * Draws a picture through the player colour table (`M_BuildTranslationTable`): the setup screen's player.
 *
 * @param {number} x x in menu pixels
 * @param {number} y y in menu pixels
 * @param {?qpic_t} pic the picture
 */
export function M_DrawTransPicTranslate( x, y, pic ) {

	if ( _Draw_TransPicTranslate != null && pic != null )
		_Draw_TransPicTranslate( x + ( ( _vid.width - 320 ) >> 1 ), y + ( ( _vid.height - 200 ) >> 1 ), pic, translationTable );

}

/**
 * Draws the menu's bordered box around a text area, from the `gfx/box_*` pieces (one WebGL panel when the WebGL menu
 * is drawing).
 *
 * @param {number} x the box's left in menu pixels
 * @param {number} y its top in menu pixels
 * @param {number} width the text area's width in characters (the box adds one each side)
 * @param {number} lines its height in lines (the box adds one above and below)
 */
export function M_DrawTextBox( x, y, width, lines ) {

	if ( MainMenu_TextBox( x + ( ( _vid.width - 320 ) >> 1 ), y + ( ( _vid.height - 200 ) >> 1 ),
		( width + 2 ) * 8, ( lines + 2 ) * 8,
		_Draw_CachePic && _Draw_CachePic( 'gfx/box_tl.lmp' ), _Draw_CachePic && _Draw_CachePic( 'gfx/box_br.lmp' ) ) ) return;

	if ( ! _Draw_CachePic ) return;

	let cx, cy, n;
	let p;

	// draw left side
	cx = x;
	cy = y;
	p = _Draw_CachePic( 'gfx/box_tl.lmp' );
	M_DrawTransPic( cx, cy, p );
	p = _Draw_CachePic( 'gfx/box_ml.lmp' );
	for ( n = 0; n < lines; n ++ ) {

		cy += 8;
		M_DrawTransPic( cx, cy, p );

	}

	p = _Draw_CachePic( 'gfx/box_bl.lmp' );
	M_DrawTransPic( cx, cy + 8, p );

	// draw middle
	cx += 8;
	while ( width > 0 ) {

		cy = y;
		p = _Draw_CachePic( 'gfx/box_tm.lmp' );
		M_DrawTransPic( cx, cy, p );
		p = _Draw_CachePic( 'gfx/box_mm.lmp' );
		for ( n = 0; n < lines; n ++ ) {

			cy += 8;
			if ( n === 1 )
				p = _Draw_CachePic( 'gfx/box_mm2.lmp' );
			M_DrawTransPic( cx, cy, p );

		}

		p = _Draw_CachePic( 'gfx/box_bm.lmp' );
		M_DrawTransPic( cx, cy + 8, p );
		width -= 2;
		cx += 16;

	}

	// draw right side
	cy = y;
	p = _Draw_CachePic( 'gfx/box_tr.lmp' );
	M_DrawTransPic( cx, cy, p );
	p = _Draw_CachePic( 'gfx/box_mr.lmp' );
	for ( n = 0; n < lines; n ++ ) {

		cy += 8;
		M_DrawTransPic( cx, cy, p );

	}

	p = _Draw_CachePic( 'gfx/box_br.lmp' );
	M_DrawTransPic( cx, cy + 8, p );

}

/*
==============================================================================

			TRANSLATION TABLE (for player color)

==============================================================================
*/

const TOP_RANGE = 16;
const BOTTOM_RANGE = 96;

const identityTable = new Uint8Array( 256 );
const translationTable = new Uint8Array( 256 );

/**
 * Builds the player colour table `M_DrawTransPicTranslate` draws with: the palette, with its shirt (16..31) and pants
 * (96..111) ranges taken from the chosen colours (rows of 16; the ranges at 128 and up run backwards).
 *
 * @param {number} top the shirt colour's first palette index (colour * 16)
 * @param {number} bottom the pants colour's first palette index (colour * 16)
 */
export function M_BuildTranslationTable( top, bottom ) {

	for ( let j = 0; j < 256; j ++ )
		identityTable[ j ] = j;

	translationTable.set( identityTable );

	if ( top < 128 ) {

		for ( let j = 0; j < 16; j ++ )
			translationTable[ TOP_RANGE + j ] = identityTable[ top + j ];

	} else {

		for ( let j = 0; j < 16; j ++ )
			translationTable[ TOP_RANGE + j ] = identityTable[ top + 15 - j ];

	}

	if ( bottom < 128 ) {

		for ( let j = 0; j < 16; j ++ )
			translationTable[ BOTTOM_RANGE + j ] = identityTable[ bottom + j ];

	} else {

		for ( let j = 0; j < 16; j ++ )
			translationTable[ BOTTOM_RANGE + j ] = identityTable[ bottom + 15 - j ];

	}

}

// Check if we're currently playing (not watching demos)
/**
 * Whether a game is being played (a local server or a connection), so the main menu offers Continue. False while a
 * demo plays.
 *
 * @returns {boolean} true in a game
 */
export function M_InGame() {

	// ca_connected = 2 in client.js
	// Don't show Continue during demo playback - only when actually playing
	if ( _cls.demoplayback )
		return false;

	return _sv.active || _cls.state === 2;

}
// Enhanced starts with brightness at the slider midpoint and FPS showing. The menus already emit `r_hdr 1` (or 0)
// beside this, so the shared helper asks Newer for the feature commands alone; the profile-driven start path can ask
// Newer_ApplyGameDefaults for the full command text, header included.
export { NEWER_DEFAULT_GAMMA };
export const newerDefaults = () => Newer_ApplyGameDefaults( undefined, true, { hdr: false } );
