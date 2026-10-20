/**
 * @module engine/client/menu_hexen2_options
 *
 * Hexen II's native Options and Customize controls pages (uhexen2 engine/hexen2/menu.c M_Options and M_Keys). The
 * rows are the native ones (controls, console, defaults, screen size, brightness, mouse speed, music type, the two
 * volumes, always run, invert mouse, mouse look, crosshair, chase mode, video modes) followed by Quaked's Hexen-relevant
 * Enhanced mode and Texture detail rows, all drawn with the native 8-pixel small font and slider glyphs. The Video
 * Modes row opens the shared engine video page, which native Hexen also uses unchanged.
 *
 * Types: plain values and functions; no exported classes.
 * State: the options and keys cursors, the keys scroll offset and the bind-grab flag; all in this module.
 * Errors: none raised.
 *
 * Native code: menu.c:1818-2700 (M_Options, M_Keys, M_Video).
 */
import { M_ControllerActions } from './menu_actions.js';

import { M_Menu_Gyro_f } from './menu_gyro.js';
import { GameProfile_Get } from '../common/game_profile.js';
import { Newer_ApplyGameDefaults } from '../common/hooks.js'; // installed by newer/ui/newer_defaults.js
import { Cbuf_AddText } from '../common/cmd.js';
import { Con_ToggleConsole_f } from '../common/console.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue, Cvar_VariableString, Cvar_VariableValue, cvar_t } from '../common/cvar.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, K_BACKSPACE, K_DEL, key_menu, keybindings, Key_SetBinding, Key_KeynumToString } from './keys.js';
import { cl_forwardspeed } from './cl_input.js';
import { in_mlook } from './cl_input.js';
import { sensitivity, m_pitch } from './cl_main.js';
import { volume, bgmvolume } from '../sound/sound.js';
import { scr_viewsize } from '../render/gl_screen.js';
import { v_gamma } from './view.js';
import { chase_active } from './chase.js';
import {
	m_none, m_hexen2_options, m_hexen2_keys, set_m_state, set_m_entersound, setKeyDest,
	M_DrawCharacter, M_DrawSlider, M_Print
} from './menu_common.js';
import { M_Hexen2_Menu_Main_f, Hexen2_ScrollTitle, Hexen2_MenuSound, Hexen2_BlinkCharacter } from './menu_hexen2.js';
import { M_Menu_Video_f } from './menu_options.js';

// The native rows, in order, with the two Quaked rows that matter for Hexen appended. The labels are right-aligned to
// the native 22-character field (menu.c:2021-2104).
const TEXTURE_TIERS = Object.freeze( [ 'low', 'mid', 'high' ] );
const OPTIONS = Object.freeze( [
	Object.freeze( { label: 'Customize controls', action: 'keys' } ),
	Object.freeze( { label: 'Go to console', action: 'console' } ),
	Object.freeze( { label: 'Reset to defaults', action: 'defaults' } ),
	Object.freeze( { label: 'Screen size', slider: 'viewsize' } ),
	Object.freeze( { label: 'Brightness', slider: 'gamma' } ),
	Object.freeze( { label: 'Mouse Speed', slider: 'sensitivity' } ),
	Object.freeze( { label: 'Music Type', value: 'Ambient' } ),
	Object.freeze( { label: 'Music Volume', slider: 'bgmvolume' } ),
	Object.freeze( { label: 'Sound Volume', slider: 'volume' } ),
	Object.freeze( { label: 'Always Run', toggle: 'run' } ),
	Object.freeze( { label: 'Invert Mouse', toggle: 'invert' } ),
	Object.freeze( { label: 'Mouse Look', toggle: 'mlook' } ),
	Object.freeze( { label: 'Show Crosshair', toggle: 'crosshair' } ),
	Object.freeze( { label: 'Chase Mode', toggle: 'chase' } ),
	Object.freeze( { label: 'Video Modes', action: 'video' } ),
	Object.freeze( { label: 'Enhanced (Newer) mode', toggle: 'enhanced' } ),
	Object.freeze( { label: 'Texture detail', choice: 'tier' } ),
	Object.freeze( { label: 'Controller', action: 'gyro' } )
] );

let optionsCursor = 0;
// Keep the last row reachable without moving the established native rows on the first page.
const optionsTop = () => Math.max( 0, optionsCursor - 16 );

function Hexen2_TextureTierIndex() {

	if ( Cvar_FindVar( 'r_texture_tier' ) === null ) return 1;
	const text = Cvar_VariableString( 'r_texture_tier' ).trim().toLowerCase();
	const index = TEXTURE_TIERS.indexOf( text );
	if ( index >= 0 ) return index;
	if ( text === '0' ) return 0;
	if ( text === '2' ) return 2;
	return 1;

}

function Hexen2_SetTextureTier( index ) {

	if ( Cvar_FindVar( 'r_texture_tier' ) === null ) Cvar_RegisterVariable( new cvar_t( 'r_texture_tier', '1', true ) );
	Cvar_SetValue( 'r_texture_tier', ( ( index % 3 ) + 3 ) % 3 );

}

function Hexen2_ToggleEnhanced() {

	if ( Cvar_FindVar( 'r_hdr' ) === null ) Cvar_RegisterVariable( new cvar_t( 'r_hdr', '0' ) );
	const enabled = Cvar_VariableValue( 'r_hdr' ) === 0;
	Cbuf_AddText( Newer_ApplyGameDefaults( GameProfile_Get(), enabled ) );

}

function Hexen2_AdjustSlider( dir ) {

	const row = OPTIONS[ optionsCursor ];
	if ( ! row?.slider ) return;
	Hexen2_MenuSound( 'raven/menu3.wav' );

	if ( row.slider === 'viewsize' ) {

		Cvar_SetValue( 'viewsize', Math.max( 30, Math.min( 130, scr_viewsize.value + dir * 10 ) ) );

	} else if ( row.slider === 'gamma' ) {

		Cvar_SetValue( 'gamma', Math.max( 0.5, Math.min( 1, v_gamma.value - dir * 0.05 ) ) );

	} else if ( row.slider === 'sensitivity' ) {

		Cvar_SetValue( 'sensitivity', Math.max( 1, Math.min( 11, sensitivity.value + dir * 0.5 ) ) );

	} else if ( row.slider === 'bgmvolume' ) {

		Cvar_SetValue( 'bgmvolume', Math.max( 0, Math.min( 1, bgmvolume.value + dir * 0.1 ) ) );

	} else if ( row.slider === 'volume' ) {

		Cvar_SetValue( 'volume', Math.max( 0, Math.min( 1, volume.value + dir * 0.1 ) ) );

	}

}

function Hexen2_ToggleRow() {

	const row = OPTIONS[ optionsCursor ];
	if ( row.toggle === 'run' ) {

		Hexen2_MenuSound( 'raven/menu3.wav' );
		const run = cl_forwardspeed.value > 200;
		Cvar_SetValue( 'cl_forwardspeed', run ? 200 : 400 );
		Cvar_SetValue( 'cl_backspeed', run ? 200 : 400 );

	} else if ( row.toggle === 'invert' ) {

		Hexen2_MenuSound( 'raven/menu3.wav' );
		Cvar_SetValue( 'm_pitch', - m_pitch.value );

	} else if ( row.toggle === 'mlook' ) {

		Hexen2_MenuSound( 'raven/menu3.wav' );
		Cbuf_AddText( ( in_mlook.state & 1 ) ? '-mlook\n' : '+mlook\n' );

	} else if ( row.toggle === 'crosshair' ) {

		Hexen2_MenuSound( 'raven/menu3.wav' );
		Cvar_SetValue( 'crosshair', Cvar_VariableValue( 'crosshair' ) !== 0 ? 0 : 1 );

	} else if ( row.toggle === 'chase' ) {

		Hexen2_MenuSound( 'raven/menu3.wav' );
		Cvar_SetValue( 'chase_active', chase_active.value !== 0 ? 0 : 1 );

	} else if ( row.toggle === 'enhanced' ) {

		Hexen2_MenuSound( 'raven/menu3.wav' );
		Hexen2_ToggleEnhanced();

	} else if ( row.choice === 'tier' ) {

		Hexen2_MenuSound( 'raven/menu3.wav' );
		Hexen2_SetTextureTier( Hexen2_TextureTierIndex() + 1 );

	}

}

function Hexen2_DrawCheckbox( x, y, on ) { M_Print( x, y, on ? 'on' : 'off' ); }

function Hexen2_RowValue( row ) {

	if ( row.slider === 'viewsize' ) return { slider: ( scr_viewsize.value - 30 ) / ( 130 - 30 ) };
	if ( row.slider === 'gamma' ) return { slider: ( 1 - v_gamma.value ) / 0.5 };
	if ( row.slider === 'sensitivity' ) return { slider: ( sensitivity.value - 1 ) / 10 };
	if ( row.slider === 'bgmvolume' ) return { slider: bgmvolume.value };
	if ( row.slider === 'volume' ) return { slider: volume.value };
	if ( row.value ) return { text: row.value };
	if ( row.toggle === 'run' ) return { check: cl_forwardspeed.value > 200 };
	if ( row.toggle === 'invert' ) return { check: m_pitch.value < 0 };
	if ( row.toggle === 'mlook' ) return { check: ( in_mlook.state & 1 ) !== 0 };
	if ( row.toggle === 'crosshair' ) return { check: Cvar_VariableValue( 'crosshair' ) !== 0 };
	if ( row.toggle === 'chase' ) return { check: chase_active.value !== 0 };
	if ( row.toggle === 'enhanced' ) return { check: Cvar_VariableValue( 'r_hdr' ) !== 0 };
	if ( row.choice === 'tier' ) return { text: TEXTURE_TIERS[ Hexen2_TextureTierIndex() ] };
	return {};

}

/**
 * Opens the Hexen II options page and plays the native enter sound.
 */
export function M_Hexen2_Menu_Options_f() {

	setKeyDest( key_menu );
	set_m_state( m_hexen2_options );
	set_m_entersound( true );

}

/**
 * `M_Draw` on the Hexen II options: the scrolling Options title, the native rows 8 pixels apart from y 60, their
 * sliders/values and the blinking cursor at x 200. The highlighted text is +256 (the Hexen bank), so every row is
 * legible.
 */
export function M_Hexen2_Options_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/title3.lmp' );
	M_Print( 256, 52, optionsTop() ? 'Top ^' : 'More v' );
	for ( let i = optionsTop(); i < Math.min( OPTIONS.length, optionsTop() + 17 ); i ++ ) {

		const row = OPTIONS[ i ], y = 60 + 8 * ( i - optionsTop() );
		M_Print( 16 + Math.max( 0, 22 - row.label.length ) * 8, y, row.label );
		const value = Hexen2_RowValue( row );
		if ( value.slider !== undefined ) M_DrawSlider( 220, y, value.slider, 256 );
		else if ( value.check !== undefined ) Hexen2_DrawCheckbox( 220, y, value.check );
		else if ( value.text !== undefined ) M_Print( 220, y, value.text );

	}
	M_DrawCharacter( 200, 60 + 8 * ( optionsCursor - optionsTop() ), Hexen2_BlinkCharacter() );

}

/**
 * `M_Keydown` on the Hexen II options. ESC returns to the main menu; Up and Down move the cursor, wrapping; Left and
 * Right step a slider, flip a switch or cycle Texture detail; Enter opens Customize controls, the console or Video
 * Modes, resets defaults, or steps the row right.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Options_Key( key ) {

	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_Main_f();
			break;
		case K_UPARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( -- optionsCursor < 0 ) optionsCursor = OPTIONS.length - 1;
			break;
		case K_DOWNARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( ++ optionsCursor >= OPTIONS.length ) optionsCursor = 0;
			break;
		case K_LEFTARROW:
			Hexen2_AdjustSlider( - 1 );
			break;
		case K_RIGHTARROW:
			Hexen2_AdjustSlider( 1 );
			break;
		case K_ENTER: {

			set_m_entersound( true );
			const row = OPTIONS[ optionsCursor ];
			if ( row.action === 'keys' ) M_Hexen2_Menu_Keys_f();
			else if ( row.action === 'console' ) { set_m_state( m_none ); Con_ToggleConsole_f(); }
			else if ( row.action === 'defaults' ) Cbuf_AddText( 'exec default.cfg\n' );
			else if ( row.action === 'gyro' ) M_Menu_Gyro_f( m_hexen2_options );
			else if ( row.action === 'video' ) M_Menu_Video_f();
			else if ( row.toggle || row.choice ) Hexen2_ToggleRow();
			else Hexen2_AdjustSlider( 1 );
			break;

		}

	}

}

/**
 * `M_TouchInput` on the options: a touch on a row moves the cursor there and presses Enter.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_Options_Touch( vx, vy ) {

	if ( vx >= 248 && vy >= 48 && vy < 60 ) { optionsCursor = optionsTop() ? 0 : OPTIONS.length - 1; return; }

	if ( vy >= 60 && vy < 60 + 17 * 8 ) {

		optionsCursor = optionsTop() + Math.floor( ( vy - 60 ) / 8 );
		M_Hexen2_Options_Key( K_ENTER );

	}

}

/*
==============================================================================

			KEYS MENU (Customize controls)

==============================================================================
*/

// menu.c bindnames, in the native order (menu_actions.js, shared with the controller page).
const BINDINGS = M_ControllerActions( 'hexen2' );
const KEYS_SIZE = 14;
let keysCursor = 0, keysTop = 0, bindGrab = false;

function Hexen2_FindKeysForCommand( command ) {

	const found = [ - 1, - 1 ];
	let count = 0;
	for ( let j = 0; j < 256; j ++ ) {

		const b = keybindings[ j ];
		if ( ! b ) continue;
		if ( b.substring( 0, command.length ) === command ) {

			found[ count ++ ] = j;
			if ( count === 2 ) break;

		}

	}
	return found;

}

function Hexen2_UnbindCommand( command ) {

	for ( let j = 0; j < 256; j ++ ) {

		const b = keybindings[ j ];
		if ( b && b.substring( 0, command.length ) === command ) Key_SetBinding( j, '' );

	}

}

/**
 * Opens Customize controls with the native Hexen binding list.
 */
export function M_Hexen2_Menu_Keys_f() {

	setKeyDest( key_menu );
	set_m_state( m_hexen2_keys );
	set_m_entersound( true );

}

/** `M_Draw` on Customize controls: the title, the hint, 14 actions with their keys and the row cursor. */
export function M_Hexen2_Keys_Draw() {

	Hexen2_ScrollTitle( 'gfx/menu/title6.lmp' );
	if ( keysTop ) M_DrawCharacter( 6, 80, 128 );
	if ( keysTop + KEYS_SIZE < BINDINGS.length ) M_DrawCharacter( 6, 80 + ( KEYS_SIZE - 1 ) * 8, 129 );

	for ( let i = 0; i < KEYS_SIZE; i ++ ) {

		const index = keysTop + i;
		if ( index >= BINDINGS.length ) break;
		const y = 80 + 8 * i;
		M_Print( 16, y, BINDINGS[ index ][ 1 ] );
		const keys = Hexen2_FindKeysForCommand( BINDINGS[ index ][ 0 ] );
		if ( keys[ 0 ] === - 1 ) M_Print( 140, y, '???' );
		else {

			const name = Key_KeynumToString( keys[ 0 ] );
			M_Print( 140, y, name );
			if ( keys[ 1 ] !== - 1 ) {

				M_Print( 140 + name.length * 8 + 8, y, 'or' );
				M_Print( 140 + name.length * 8 + 32, y, Key_KeynumToString( keys[ 1 ] ) );

			}

		}

	}

	if ( bindGrab ) M_Print( 12, 64, 'Press a key or button for this action' );
	else M_Print( 18, 64, 'Enter to change, backspace to clear' );
	M_DrawCharacter( 130, 80 + ( keysCursor - keysTop ) * 8, bindGrab ? 61 : Hexen2_BlinkCharacter() );

}

/**
 * `M_Keydown` on Customize controls. While waiting for a key, ESC cancels and any other key binds it; otherwise ESC
 * returns to Options, Up/Left and Down/Right move and scroll the list, Enter waits for a key and Backspace/Del clears
 * every binding for the row.
 *
 * @param {number} key key number (0..255)
 */
export function M_Hexen2_Keys_Key( key ) {

	if ( bindGrab ) {

		Hexen2_MenuSound( 'raven/menu1.wav' );
		if ( key !== K_ESCAPE && key !== 96 /* '`' */ )
			Cbuf_AddText( 'bind "' + Key_KeynumToString( key ) + '" "' + BINDINGS[ keysCursor ][ 0 ] + '"\n' );
		bindGrab = false;
		return;

	}

	switch ( key ) {

		case K_ESCAPE:
			M_Hexen2_Menu_Options_f();
			break;
		case K_LEFTARROW:
		case K_UPARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( -- keysCursor < 0 ) keysCursor = BINDINGS.length - 1;
			break;
		case K_DOWNARROW:
		case K_RIGHTARROW:
			Hexen2_MenuSound( 'raven/menu1.wav' );
			if ( ++ keysCursor >= BINDINGS.length ) keysCursor = 0;
			break;
		case K_ENTER: {

			const keys = Hexen2_FindKeysForCommand( BINDINGS[ keysCursor ][ 0 ] );
			Hexen2_MenuSound( 'raven/menu2.wav' );
			if ( keys[ 1 ] !== - 1 ) Hexen2_UnbindCommand( BINDINGS[ keysCursor ][ 0 ] );
			bindGrab = true;
			break;

		}
		case K_BACKSPACE:
		case K_DEL:
			Hexen2_MenuSound( 'raven/menu2.wav' );
			Hexen2_UnbindCommand( BINDINGS[ keysCursor ][ 0 ] );
			break;

	}

	if ( keysCursor < keysTop ) keysTop = keysCursor;
	else if ( keysCursor >= keysTop + KEYS_SIZE ) keysTop = keysCursor - KEYS_SIZE + 1;

}

/**
 * `M_TouchInput` on Customize controls: a touch on an action row chooses it.
 *
 * @param {number} vx x in menu pixels (unused)
 * @param {number} vy y in menu pixels
 */
export function M_Hexen2_Keys_Touch( vx, vy ) {

	if ( vy >= 80 && vy < 80 + KEYS_SIZE * 8 ) {

		keysCursor = keysTop + Math.floor( ( vy - 80 ) / 8 );
		M_Hexen2_Keys_Key( K_ENTER );

	}

}

/**
 * The options pages' cursors, for a test or a tool.
 *
 * @returns {{ optionsCursor: number, keysCursor: number, keysTop: number }} the cursors
 */
export function M_Hexen2_OptionsState() { return { optionsCursor, keysCursor, keysTop }; }
