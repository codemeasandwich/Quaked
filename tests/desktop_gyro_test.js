/** @module tests/desktop_gyro — real adapter with only Tauri's public boundary stubbed. */
import { register } from 'node:module';
import { Gyro_Init, Gyro_Remove, Gyro_Move } from '../src/platform/gyro.js';
import { Cvar_SetValue } from '../src/engine/common/cvar.js';
register( new URL( './helpers/desktop_tauri_loader.mjs', import.meta.url ) );
const { Desktop_StartGyro } = await import( '../src/platform/desktop.js' );
const check = ( v, m ) => { if ( ! v ) throw Error( m ); };
Deno.test( 'desktop gyro listens once, forwards canonical samples, removes disconnects and stops', async () => {
	let handler, calls = 0, stopped = 0;
	globalThis.__QUAKED_DESKTOP_TEST__ = { listen: async ( name, callback ) => {
		check( name === 'controller-gyro', 'native event name' ); calls ++; handler = callback;
		return () => stopped ++;
	} };
	Gyro_Remove(); Gyro_Init(); Cvar_SetValue( 'gyro_enable', 1 ); Cvar_SetValue( 'gyro_hold', 0 ); Cvar_SetValue( 'gyro_sensitivity', 1 );
	const stop = await Desktop_StartGyro(); await Desktop_StartGyro(); check( calls === 1, 'idempotent listener' );
	const pad = { index: 0, id: 'DualSense', connected: true, mapping: 'standard', buttons: [] }, angles = [ 0, 0, 0 ];
	const move = () => Gyro_Move( angles, pad, [ pad ], 0.01, true );
	handler( { payload: [ { id: 'gc-1', family: 'dualsense', pitch: 10, yaw: 0, roll: 0 } ] } );
	move(); move(); check( angles[ 0 ] === - 0.1, 'degree/second event reaches view' );
	handler( { payload: [] } ); move(); check( angles[ 0 ] === - 0.1, 'disconnect frame removes source' );
	handler( { payload: [ { id: 'gc-1', family: 'dualsense', pitch: NaN, yaw: 0, roll: 0 } ] } );
	move(); check( angles[ 0 ] === - 0.1, 'malformed rate ignored' );
	stop(); check( stopped === 1, 'listener removed' );
	const stopAgain = await Desktop_StartGyro(); check( calls === 2, 'restart after stop' ); stopAgain(); Gyro_Remove();
} );
Deno.test( 'a Pro Controller read directly by the app (hid- source) aims the WebKit-named pad', async () => {
	let handler;
	globalThis.__QUAKED_DESKTOP_TEST__ = { listen: async ( name, callback ) => { handler = callback; return () => {}; } };
	Gyro_Remove(); Gyro_Init(); Cvar_SetValue( 'gyro_enable', 1 ); Cvar_SetValue( 'gyro_hold', 0 ); Cvar_SetValue( 'gyro_sensitivity', 1 );
	const stop = await Desktop_StartGyro();
	// as WebKit names it in the Mac app (trace log, 20 October 2026)
	const pad = { index: 0, id: 'Pro Controller Extended Gamepad', connected: true, mapping: 'standard', buttons: [] }, angles = [ 0, 0, 0 ];
	const move = () => Gyro_Move( angles, pad, [ pad ], 0.01, true );
	handler( { payload: [ { id: 'hid-6000a1b2', family: 'switch', pitch: 0, yaw: 20, roll: 0, pairPressed: false } ] } );
	move(); move();
	check( Math.abs( angles[ 1 ] - 20 * Math.SQRT1_2 * 0.01 ) < 1e-9, 'direct motion turns the view, got ' + angles[ 1 ] );
	stop(); Gyro_Remove();
} );
