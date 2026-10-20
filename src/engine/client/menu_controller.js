/**
 * @module engine/client/menu_controller
 *
 * Shared Customise/Test controller pages for every profile and renderer mode. Actions come from the keyboard menu's
 * native lists; hardware identity, skin lettering and wheel eligibility are data/accessors. A missing WebGL context
 * leaves the complete binding editor available. Pad keys are swallowed by in_web during testing, before key dispatch.
 * Resources belong to one opening, never to the game renderer. All exits dispose the context.
 */
import { IN_GamepadInputs, IN_GamepadState, IN_GamepadWheelFixed, PAD_BIND_NONE } from '../../platform/in_web.js';
import { Gyro_Rate } from '../../platform/gyro.js';
import { Draw_GetOverlayCanvas, Draw_GetUIScale } from '../render/gl_draw.js';
import { R_ControllerPreviewOpen, R_ControllerPreviewDraw, R_ControllerPreviewRelease } from '../render/r_controller_preview.js';
import { M_ControllerActions } from './menu_actions.js';
import { M_ControllerLayout, M_ControllerInputName, M_ControllerFamily } from './menu_controller_layout.js';
import { Key_SetBinding, keybindings, K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, key_menu } from './keys.js';
import { m_state, m_gyro, m_controller_customise, m_controller_test, set_m_state, setKeyDest, set_m_entersound,
	M_PrintPixels, M_OnStateChange, _vid } from './menu_common.js';

let cursor = 0, dropdown = null, orientation = [ 0, 0, 0 ], lastTime = null, holdStart = null, padIdentity = null;
const testing = () => m_state === m_controller_test;
const layout = () => M_ControllerLayout( _vid.width, _vid.height );
const active = () => m_state === m_controller_customise || testing();
const text = ( x, y, value, highlight = false ) => M_PrintPixels( Math.round( x ) - ( ( _vid.width - 320 ) >> 1 ),
	Math.round( y ) - ( ( _vid.height - 200 ) >> 1 ), value, highlight );
const fixed = input => input.index === null || ( input.index === 10 && IN_GamepadWheelFixed() );
const choices = () => [ [ '', 'Default' ], [ PAD_BIND_NONE, 'None' ], ...M_ControllerActions() ];
const inside = ( x, y, box ) => x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;

M_OnStateChange( ( next, previous ) => {

	if ( ( previous === m_controller_customise || previous === m_controller_test ) && next !== previous ) R_ControllerPreviewRelease();

} );

/** Opens one shared controller page. Test timing starts afresh, including after reconnects. */
export function M_Menu_Controller_f( test = false ) {

	setKeyDest( key_menu ); set_m_state( test ? m_controller_test : m_controller_customise ); set_m_entersound( true );
	cursor = 0; dropdown = null; orientation = [ 0, 0, 0 ]; lastTime = null; holdStart = null; padIdentity = null;
	R_ControllerPreviewOpen();

}

/** Resolves the actual command, including current fallback-key bindings; explicit None is distinct from Default. */
export function M_ControllerActionLabel( input ) {

	if ( input.index === null ) return input.id === 'left-move' ? 'Move (fixed)' : 'Look (fixed)';
	if ( input.index === 10 && IN_GamepadWheelFixed() ) return 'Weapon wheel';
	const descriptor = IN_GamepadInputs().find( entry => entry.index === input.index );
	const binding = keybindings[ descriptor.key ];
	if ( binding === PAD_BIND_NONE ) return 'None';
	if ( ! binding && descriptor.gameKey === K_ESCAPE ) return 'Menu'; // Escape is deliberately never remappable.
	const command = binding || ( descriptor.gameKey === null ? '' : keybindings[ descriptor.gameKey ] );
	return M_ControllerActions().find( entry => entry[ 0 ] === command )?.[ 1 ] || ( command || '' ).replace( /^\+/, '' ) || 'None';

}

function leave() { dropdown = null; set_m_state( m_gyro ); }

/**
 * Whether an input is in use on the Test page, where only those show their label and leader (owner, 21 October 2026):
 * a button or trigger pressed past a fifth, a stick pushed past a fifth of its travel.
 */
export function M_ControllerInputActive( input, pad ) {

	if ( ! pad ) return false;
	if ( input.index === null ) {

		const axis = input.id === 'left-move' ? 0 : 2;
		return Math.hypot( pad.axes?.[ axis ] ?? 0, pad.axes?.[ axis + 1 ] ?? 0 ) > 0.2;

	}
	const button = pad.buttons?.[ input.index ];
	return !! button && ( button.pressed || ( button.value ?? 0 ) > 0.2 );

}

/**
 * Advances gyro display and the physical B hold using monotonic milliseconds. Read-only samples share the input
 * poll's entire effective pad population (including remote local-play pads), so ambiguity rules stay identical.
 */
export function M_ControllerTest_Update( at = performance.now() ) {

	if ( ! testing() ) return 0;
	const { pad, pads } = IN_GamepadState(), identity = pad ? pad.index + '|' + pad.id : null;
	if ( identity !== padIdentity ) { padIdentity = identity; holdStart = null; orientation = [ 0, 0, 0 ]; lastTime = null; }
	const seconds = lastTime === null ? 0 : Math.max( 0, Math.min( .05, ( at - lastTime ) / 1000 ) ); lastTime = at;
	const rate = Gyro_Rate( pad, pads, at );
	if ( rate ) {

		const rates = [ rate.pitch, rate.yaw, rate.roll ];
		for ( let i = 0; i < 3; i ++ ) orientation[ i ] += rates[ i ] * seconds * Math.PI / 180;
		if ( rates.every( value => Math.abs( value ) < 1 ) ) orientation = orientation.map( value => value * Math.exp( - seconds * 2 ) );

	} else orientation = orientation.map( value => value * Math.exp( - seconds * 2 ) );
	if ( pad?.buttons?.[ 10 ]?.pressed && pad?.buttons?.[ 11 ]?.pressed ) orientation = [ 0, 0, 0 ];
	const cancelIndex = M_ControllerFamily( pad?.id ) === 'nintendo' ? 0 : 1;
	if ( pad?.buttons?.[ cancelIndex ]?.pressed ) {

		if ( holdStart === null ) holdStart = at;
		const progress = Math.max( 0, Math.min( 1, ( at - holdStart ) / 1500 ) );
		if ( progress >= 1 ) leave();
		return progress;

	}
	holdStart = null; return 0;

}

function dropdownBox() {

	const selected = layout().labels[ cursor ], width = Math.min( 240, _vid.width - 12 ), count = Math.min( 8, choices().length );
	return { x: Math.max( 6, Math.min( _vid.width - width - 6, selected.x ) ),
		y: Math.max( 24, Math.min( _vid.height - 30 - count * 12, selected.y + selected.height ) ), width, height: count * 12, count };

}

function openDropdown() {

	const input = layout().labels[ cursor ];
	if ( fixed( input ) ) return;
	const descriptor = IN_GamepadInputs().find( entry => entry.index === input.index );
	const current = keybindings[ descriptor.key ] || '';
	const index = Math.max( 0, choices().findIndex( entry => entry[ 0 ] === current ) );
	dropdown = { index, top: Math.max( 0, index - 7 ) };

}

/** Handles arrows, select, cancel and keyboard R; pad input never reaches this while Test is open. */
export function M_Controller_Key( key ) {

	if ( key === K_ESCAPE ) { if ( dropdown ) dropdown = null; else leave(); return; }
	if ( testing() ) { if ( key === 114 || key === 82 ) orientation = [ 0, 0, 0 ]; return; }
	if ( dropdown ) {

		const list = choices();
		if ( key === K_UPARROW || key === K_DOWNARROW ) {

			dropdown.index = ( dropdown.index + list.length + ( key === K_UPARROW ? - 1 : 1 ) ) % list.length;
			dropdown.top = Math.max( 0, Math.min( dropdown.index, Math.max( dropdown.top, dropdown.index - 7 ) ) );

		} else if ( key === K_ENTER ) {

			const input = layout().labels[ cursor ];
			// Wheel eligibility may change externally while a drop-down is open; never overwrite the reserved input.
			if ( ! fixed( input ) ) Key_SetBinding( IN_GamepadInputs().find( entry => entry.index === input.index ).key, list[ dropdown.index ][ 0 ] );
			dropdown = null;

		}
		return;

	}
	if ( key === K_ENTER ) { openDropdown(); return; }
	const labels = layout().labels, current = labels[ cursor ];
	if ( key === K_UPARROW || key === K_DOWNARROW ) {

		const column = labels.map( ( input, index ) => ( { ...input, index } ) ).filter( input => input.side === current.side );
		const index = column.findIndex( input => input.index === cursor );
		cursor = column[ ( index + column.length + ( key === K_UPARROW ? - 1 : 1 ) ) % column.length ].index;

	} else if ( key === K_LEFTARROW || key === K_RIGHTARROW ) {

		const side = key === K_LEFTARROW ? 'left' : 'right';
		if ( side !== current.side ) cursor = labels.map( ( input, index ) => ( { ...input, index } ) )
			.filter( input => input.side === side ).sort( ( a, b ) => Math.abs( a.y - current.y ) - Math.abs( b.y - current.y ) )[ 0 ].index;

	}

}

/** Clicks are in the shared facade's centred menu coordinates; Test leaves on any click. */
export function M_Controller_Touch( vx, vy ) {

	if ( testing() ) { leave(); return; }
	const x = vx + ( _vid.width - 320 ) / 2, y = vy + ( _vid.height - 200 ) / 2;
	if ( dropdown ) {

		const box = dropdownBox();
		if ( inside( x, y, box ) ) {

			// Touch-only users can reach every action without a wheel or keyboard.
			if ( x >= box.x + box.width - 16 && ( y < box.y + 12 || y >= box.y + box.height - 12 ) ) {

				dropdown.top = Math.max( 0, Math.min( choices().length - box.count, dropdown.top + ( y < box.y + 12 ? - 1 : 1 ) ) );
				dropdown.index = Math.max( dropdown.top, Math.min( dropdown.top + box.count - 1, dropdown.index ) ); return;

			}
			dropdown.index = dropdown.top + Math.floor( ( y - box.y ) / 12 ); M_Controller_Key( K_ENTER );

		} else dropdown = null;
		return;

	}
	const index = layout().labels.findIndex( input => inside( x, y, input ) );
	if ( index >= 0 ) { cursor = index; openDropdown(); }

}

/** Draws native skin lettering, physical-pixel leaders and the isolated 3D preview (or the working label list). */
export function M_Controller_Draw() {

	const isTest = testing(), progress = isTest ? M_ControllerTest_Update() : 0;
	if ( ! active() ) return;
	const { pad } = IN_GamepadState(), page = layout(), selected = page.labels[ cursor ];
	const shown = label => ! isTest || M_ControllerInputActive( label, pad );
	const canvas = Draw_GetOverlayCanvas(), ctx = canvas?.getContext( '2d' ), scale = Draw_GetUIScale();
	let projected = null;
	if ( ctx ) {

		ctx.save(); ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		projected = R_ControllerPreviewDraw( ctx, page.model, scale, isTest ? pad : null, isTest ? null : selected.anchor.replace( /-axis-.*$/, '-stick' ), orientation );
		ctx.strokeStyle = '#b8a27a'; ctx.lineWidth = Math.max( 1, scale * .5 );
		for ( const label of page.labels ) {

			const anchor = projected?.[ label.anchor ]; if ( ! anchor || ! shown( label ) ) continue;
			const x = label.side === 'left' ? label.x + label.width : label.x;
			ctx.beginPath(); ctx.moveTo( x * scale, ( label.y + 8 ) * scale ); ctx.lineTo( anchor.x * scale, anchor.y * scale ); ctx.stroke();

		}
		if ( isTest && progress > 0 ) {

			// just above the hint that explains it (the top corner belongs to the FPS counter)
			ctx.fillStyle = '#63563b'; ctx.fillRect( 8 * scale, ( _vid.height - 22 ) * scale, 136 * scale, 4 * scale );
			ctx.fillStyle = '#ffe3a3'; ctx.fillRect( 8 * scale, ( _vid.height - 22 ) * scale, 136 * progress * scale, 4 * scale );

		}
		ctx.restore();

	}
	text( 8, 6, isTest ? 'Test controller' : 'Customise controller', true );
	// the product name only: browsers append "(STANDARD GAMEPAD Vendor: ... Product: ...)"
	const name = pad?.id ? pad.id.replace( /\s*\(.*$/, '' ) || pad.id : 'Press a button on your controller';
	text( 8, 16, name.slice( 0, Math.floor( ( _vid.width - 16 ) / 8 ) ) );
	for ( let i = 0; i < page.labels.length; i ++ ) {

		const label = page.labels[ i ];
		if ( ! shown( label ) ) continue;
		for ( const [ line, value ] of [ M_ControllerInputName( label, pad?.id ), M_ControllerActionLabel( label ) ].entries() ) {

			// Fit whole action names even on the minimum menu sheet; the native skin glyphs stay on the overlay.
			const fit = Math.min( label.textScale, label.width / Math.max( 8, value.length * 8 ) );
			if ( ctx ) { ctx.save(); ctx.scale( fit, fit ); }
			text( label.x / fit, ( label.y + line * label.lineHeight ) / fit, value, ! isTest && i === cursor );
			if ( ctx ) ctx.restore();

		}

	}
	const hint = isTest ? 'Hold ' + ( M_ControllerFamily( pad?.id ) === 'playstation' ? 'Circle' : 'B' ) + ' 1.5s: back | Esc/click: back' : 'Arrows: move | Enter: map | Esc: back';
	text( 8, _vid.height - 16, hint.slice( 0, Math.floor( ( _vid.width - 16 ) / 8 ) ) );
	text( 8, _vid.height - 8, ( isTest ? 'R / both sticks: re-centre' : M_ControllerInputName( selected, pad?.id ) + ': ' + M_ControllerActionLabel( selected ) ).slice( 0, Math.floor( ( _vid.width - 16 ) / 8 ) ) );
	if ( dropdown ) {

		const box = dropdownBox(), list = choices();
		if ( ctx ) {

			ctx.save(); ctx.setTransform( 1, 0, 0, 1, 0, 0 ); ctx.fillStyle = '#151512';
			ctx.fillRect( box.x * scale, box.y * scale, box.width * scale, box.height * scale ); ctx.restore();

		}
		for ( let i = 0; i < box.count; i ++ ) {

			const index = dropdown.top + i;
			if ( index >= list.length ) break;
			text( box.x + 4, box.y + i * 12 + 2, ( ( index === dropdown.index ? '> ' : '  ' ) + list[ index ][ 1 ] ).slice( 0, Math.floor( ( box.width - 8 ) / 8 ) ), index === dropdown.index );

		}
		if ( dropdown.top > 0 ) text( box.x + box.width - 8, box.y, '^', true );
		if ( dropdown.top + box.count < list.length ) text( box.x + box.width - 8, box.y + box.height - 8, 'v', true );

	}

}
