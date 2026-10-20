/** @module engine/client/menu_gyro — shared platform controls, reached from either game's Options page. */
import { Gyro_Init } from '../../platform/gyro.js';
import { GyroHID_Connect, GyroHID_Status } from '../../platform/gyro_hid.js';
import { Distribution_Profile } from '../../platform/distribution.js';
import { Cvar_SetValue, Cvar_VariableValue } from '../common/cvar.js';
import { K_ESCAPE, K_ENTER, K_UPARROW, K_DOWNARROW, K_LEFTARROW, K_RIGHTARROW, key_menu } from './keys.js';
import { m_gyro, m_options, m_hexen2_options, set_m_state, setKeyDest, set_m_entersound, M_Print, M_DrawCharacter } from './menu_common.js';

const rows = [ [ 'Gyro aiming', 'gyro_enable' ], [ 'Sensitivity', 'gyro_sensitivity' ], [ 'Invert gyro Y', 'gyro_invert_y' ],
	[ 'Only while held', 'gyro_hold' ], [ 'Hold button', 'gyro_button' ], [ 'Connect controller gyro...' ] ];
const buttons = [ 'A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle', 'Left bumper', 'Right bumper',
	'Left trigger', 'Right trigger', 'Back', 'Start', 'Left stick', 'Right stick' ];
let cursor = 0, parent = m_options;

/** Opens the shared page; returnState is the caller's Options page. */
export function M_Menu_Gyro_f( returnState = m_options ) {

	Gyro_Init(); parent = returnState === m_hexen2_options ? returnState : m_options;
	setKeyDest( key_menu ); set_m_state( m_gyro ); set_m_entersound( true );

}

/** Draws six accessible rows plus a capability/permission note in the normal menu coordinate system. */
export function M_Gyro_Draw() {

	M_Print( 80, 32, 'Controller gyro' );
	for ( let i = 0; i < rows.length; i ++ ) {

		const label = i === 5 && Distribution_Profile() === 'desktop' ? 'Mac gyro: automatic' :
			i === 5 && ! GyroHID_Status().available ? 'Connect gyro: unavailable' : rows[ i ][ 0 ];
		M_Print( 24, 56 + i * 16, label );
		const name = rows[ i ][ 1 ];
		if ( ! name ) continue;
		const value = Cvar_VariableValue( name );
		const valueLabel = name === 'gyro_sensitivity' ? value.toFixed( 1 ) : name === 'gyro_button' ? buttons[ value ] || String( value ) : value ? 'on' : 'off';
		M_Print( 200, 56 + i * 16, valueLabel );

	}
	M_DrawCharacter( 12, 56 + cursor * 16, 12 );
	const native = Distribution_Profile() === 'desktop';
	const text = native ? 'Mac: connects automatically' : GyroHID_Status().text;
	M_Print( 16, 160, text.slice( 0, 36 ) );
	M_Print( 16, 168, 'In game: R stick pairs alike pads.' );
	M_Print( 16, 176, 'Sticks turn; motion adds fine aim.' );
	M_Print( 16, 184, 'Rest still to calibrate drift.' );

}

/** Steps archived settings or requests HID permission in the original key/click user gesture. */
export function M_Gyro_Key( key ) {

	if ( key === K_ESCAPE ) { set_m_state( parent ); return; }
	if ( key === K_UPARROW ) { cursor = ( cursor + rows.length - 1 ) % rows.length; return; }
	if ( key === K_DOWNARROW ) { cursor = ( cursor + 1 ) % rows.length; return; }
	if ( ! [ K_ENTER, K_LEFTARROW, K_RIGHTARROW ].includes( key ) ) return;
	const name = rows[ cursor ][ 1 ], dir = key === K_LEFTARROW ? - 1 : 1;
	if ( ! name ) {

		if ( Distribution_Profile() !== 'desktop' && GyroHID_Status().available ) void GyroHID_Connect();
		return;

	}
	const value = Cvar_VariableValue( name );
	if ( name === 'gyro_sensitivity' ) Cvar_SetValue( name, Math.round( Math.max( 0.1, Math.min( 10, value + dir * 0.1 ) ) * 10 ) / 10 );
	else if ( name === 'gyro_button' ) Cvar_SetValue( name, ( Math.trunc( value ) + buttons.length + dir ) % buttons.length );
	else Cvar_SetValue( name, value ? 0 : 1 );

}

/** Activates a row from a touch/click in menu pixels. */
export function M_Gyro_Touch( vx, vy ) {

	if ( vy < 56 || vy >= 56 + rows.length * 16 ) return;
	cursor = Math.floor( ( vy - 56 ) / 16 ); M_Gyro_Key( K_ENTER );

}
