/** @module tests/gyro — public angular-velocity contract; no controller hardware used. */
import { Gyro_Init, Gyro_Remove, Gyro_Sample, Gyro_Move } from '../src/platform/gyro.js';
import { Cvar_SetValue, Cvar_WriteVariables } from '../src/engine/common/cvar.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); };
const near = ( a, b ) => check( Math.abs( a - b ) < 0.001, `${a} != ${b}` );
const pad = { index: 0, id: 'DualSense 054c-0ce6', mapping: 'standard', connected: true, buttons: [] };
function setup() {
	Gyro_Remove(); Gyro_Init();
	for ( const [ name, v ] of [ [ 'enable', 1 ], [ 'sensitivity', 1 ], [ 'invert_y', 0 ], [ 'hold', 0 ], [ 'button', 10 ] ] ) Cvar_SetValue( 'gyro_' + name, v );
}
Deno.test( 'gyro public input adds local yaw/roll and pitch, clamps and archives', () => {
	setup(); const a = [ 0, 0, 0 ];
	Gyro_Sample( 'one', { pitch: 100, yaw: 100, roll: 100 }, { family: 'dualsense' }, 0 );
	Gyro_Move( a, pad, [ pad ], 0.01, true, 0 );
	Gyro_Move( a, pad, [ pad ], 0.01, true, 0 );
	near( a[ 0 ], - 1 ); near( a[ 1 ], Math.SQRT2 );
	Cvar_SetValue( 'gyro_sensitivity', 2 ); Cvar_SetValue( 'gyro_invert_y', 1 );
	Gyro_Move( a, pad, [ pad ], 0.01, true, 0 ); near( a[ 0 ], 1 );
	a[ 0 ] = 80; Gyro_Move( a, pad, [ pad ], 0.05, true, 0 ); near( a[ 0 ], 80 );
	check( Cvar_WriteVariables().includes( 'gyro_enable' ), 'gyro setting archived' );
} );
Deno.test( 'gyro rejects stale, inactive, missing, ambiguous and unheld input', () => {
	setup(); const a = [ 0, 0, 0 ];
	Gyro_Sample( 'one', { pitch: 100, yaw: 100, roll: 0 }, { family: 'dualsense' }, 0 );
	const move = ( active = true, at = 0, pads = [ pad ] ) => Gyro_Move( a, pad, pads, 0.01, active, at );
	move(); move( false ); move(); near( a[ 0 ], 0 );
	move( true, 101 ); near( a[ 0 ], 0 );
	move( true, 0, [ pad, { ...pad, index: 1 } ] ); near( a[ 0 ], 0 );
	Cvar_SetValue( 'gyro_hold', 1 ); move(); near( a[ 0 ], 0 );
	pad.buttons[ 10 ] = { pressed: true }; move(); near( a[ 0 ], - 1 );
	pad.buttons[ 10 ] = { pressed: false }; Cvar_SetValue( 'gyro_enable', 0 ); move(); near( a[ 0 ], - 1 );
	Gyro_Remove(); move(); near( a[ 0 ], - 1 );
	check( ! Gyro_Sample( 'bad', { pitch: NaN, yaw: 0, roll: 0 } ), 'finite rates required' );
} );
Deno.test( 'gyro learns stationary bias continuously but preserves ordinary deliberate aim', () => {
	setup(); const a = [ 0, 0, 0 ];
	for ( let at = 0; at < 12000; at += 10 ) Gyro_Sample( 'one', { pitch: 0.4, yaw: 0, roll: 0 }, { family: 'dualsense' }, at );
	Gyro_Move( a, pad, [ pad ], 0.01, true, 12000 ); Gyro_Move( a, pad, [ pad ], 0.01, true, 12000 );
	near( a[ 0 ], 0 );
	Gyro_Sample( 'one', { pitch: 10.4, yaw: 0, roll: 0 }, { family: 'dualsense' }, 12000 );
	Gyro_Move( a, pad, [ pad ], 0.01, true, 12000 ); near( a[ 0 ], - 0.1 );
} );
