/** @module tests/gyro_hid — hand-built reports, WebHID data excludes the report ID. */
import { GyroHID_Parse, GyroHID_Family } from '../src/platform/gyro_hid.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); };
for ( const [ family, report, length, offset ] of [ [ 'dualsense', 1, 63, 15 ], [ 'dualsense', 0x31, 77, 16 ],
	[ 'dualshock4', 1, 63, 12 ], [ 'dualshock4', 0x11, 77, 14 ] ] ) Deno.test( `gyro HID ${family} report ${report}`, () => {
	const data = new DataView( new ArrayBuffer( length ) );
	data.setInt16( offset, 160, true ); data.setInt16( offset + 2, - 320, true ); data.setInt16( offset + 4, 480, true );
	const rate = GyroHID_Parse( family, report, data );
	check( rate.pitch === 10 && rate.yaw === - 20 && rate.roll === 30, 'signed little-endian rates/nominal deg/s' );
	check( GyroHID_Parse( family, report, new DataView( new ArrayBuffer( length - 1 ) ) ) === null, 'reject short reports' );
	check( GyroHID_Parse( family, 0xff, data ) === null, 'reject unrelated report' );
} );
Deno.test( 'gyro HID Switch averages all three IMU frames with canonical axes', () => {
	const data = new DataView( new ArrayBuffer( 48 ) );
	for ( let n = 0; n < 3; n ++ ) for ( let i = 0; i < 3; i ++ ) data.setInt16( 18 + n * 12 + i * 2, ( n + 1 ) * 160 * ( i === 1 ? - 1 : 1 ), true );
	const rate = GyroHID_Parse( 'switch', 0x30, data );
	check( Math.abs( rate.pitch - 320 * 0.070 ) < 1e-9 && rate.yaw === rate.pitch && rate.roll === - rate.pitch, 'three frames and Switch signs' );
	check( GyroHID_Parse( 'switch', 0x30, new DataView( new ArrayBuffer( 47 ) ) ) === null, 'short Switch rejected' );
	check( GyroHID_Family( { vendorId: 0x057e, productId: 0x2009 } ) === 'switch', 'first-party Pro admitted' );
	check( GyroHID_Family( { vendorId: 0x1234, productId: 0x2009 } ) === null, 'unidentified clone rejected' );
} );

import { GyroHID_Start, GyroHID_Stop } from '../src/platform/gyro_hid.js';
import { Gyro_Init, Gyro_Remove, Gyro_Move } from '../src/platform/gyro.js';
import { Cvar_SetValue } from '../src/engine/common/cvar.js';
function device( name = 'Switch Pro' ) {
	const listeners = new Map();
	return { vendorId: 0x057e, productId: 0x2009, productName: name, opened: false, sent: [],
		async open() { this.opened = true; }, async close() { this.opened = false; },
		addEventListener( name, fn ) { listeners.set( name, fn ); },
		removeEventListener( name, fn ) { if ( listeners.get( name ) === fn ) listeners.delete( name ); },
		report( data, reportId = 0x30 ) { listeners.get( 'inputreport' )?.( { data, reportId } ); },
		async sendReport( reportId, bytes ) {
			this.sent.push( [ reportId, Array.from( bytes ) ] );
			if ( reportId === 0x80 ) { const ack = new DataView( new ArrayBuffer( 1 ) ); ack.setUint8( 0, bytes[ 0 ] ); this.report( ack, 0x81 ); return; }
			const ack = new DataView( new ArrayBuffer( 14 ) ); ack.setUint8( 12, 0x80 ); ack.setUint8( 13, bytes[ 9 ] );
			this.report( ack, 0x21 );
		}
	};
}
function hid( devices ) {
	return { addEventListener() {}, removeEventListener() {}, getDevices: async () => devices };
}
Deno.test( 'Switch full reports correlate the right stick button, never B, with the selected player', async () => {
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'navigator' );
	const first = device(), second = device();
	Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { hid: hid( [ first, second ] ) } } );
	Gyro_Init(); Gyro_Remove(); Cvar_SetValue( 'gyro_enable', 1 ); Cvar_SetValue( 'gyro_hold', 0 ); Cvar_SetValue( 'gyro_sensitivity', 1 );
	try {
		await GyroHID_Start();
		const pad = { index: 0, id: 'Switch Pro 057e-2009', connected: true, mapping: 'standard', buttons: [] };
		pad.buttons[ 11 ] = { pressed: true };
		const pads = [ pad, { ...pad, index: 1, buttons: [] } ], angles = [ 0, 0, 0 ];
		const bytes = new DataView( new ArrayBuffer( 48 ) );
		for ( let i = 0; i < 3; i ++ ) bytes.setInt16( 20 + i * 12, 160, true );
		const move = () => Gyro_Move( angles, pad, pads, 0.01, true );
		bytes.setUint8( 2, 4 ); first.report( bytes ); second.report( new DataView( new ArrayBuffer( 48 ) ) );
		move(); move(); check( angles[ 0 ] === 0, 'B does not bind a motion device to a right-stick click' );
		bytes.setUint8( 2, 0 ); bytes.setUint8( 3, 4 ); first.report( bytes ); move();
		check( angles[ 0 ] > 0, 'right-stick click binds the matching physical gyro' );
		check( first.sent.every( ( [ id, bytes ] ) => id !== 1 || bytes.length === 48 ), 'Bluetooth subcommand body excludes the separate report ID' );
		check( first.sent[ 0 ][ 1 ][ 9 ] === 3 && first.sent[ 1 ][ 1 ][ 9 ] === 0x40, 'serialised full-report and IMU subcommands' );
	} finally { GyroHID_Stop(); Gyro_Remove(); if ( saved ) Object.defineProperty( globalThis, 'navigator', saved ); else delete globalThis.navigator; }
} );
Deno.test( 'remembered HID grants restore healthy devices even if an earlier device fails', async () => {
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'navigator' );
	const broken = device( 'stale grant' ), healthy = device();
	broken.open = async () => { throw Error( 'gone away' ); };
	Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { hid: hid( [ broken, healthy ] ) } } );
	try { await GyroHID_Start(); check( healthy.sent.length >= 2, 'later healthy controller still initialised' ); }
	finally { GyroHID_Stop(); if ( saved ) Object.defineProperty( globalThis, 'navigator', saved ); else delete globalThis.navigator; }
} );

import { GyroHID_Calibration } from '../src/platform/gyro_hid.js';
Deno.test( 'HID factory trims remove stationary offsets and use transport-specific scale layouts', () => {
	for ( const family of [ 'dualsense', 'dualshock4', 'switch' ] ) for ( const report of family === 'dualshock4' ? [ 2, 5 ] : [ 5 ] ) {
		const data = new DataView( new ArrayBuffer( 35 ) );
		for ( let i = 0; i < 3; i ++ ) {
			if ( family === 'switch' ) {
				data.setInt16( 12 + i * 2, 100, true ); data.setInt16( 18 + i * 2, 13471, true );
			} else {
				data.setInt16( 1 + i * 2, 100, true );
				const grouped = family === 'dualshock4' && report === 5;
				data.setInt16( 7 + i * ( grouped ? 2 : 4 ), 8292, true );
				data.setInt16( ( grouped ? 13 : 9 ) + i * ( grouped ? 2 : 4 ), - 8092, true );
				data.setInt16( 19, 512, true ); data.setInt16( 21, 512, true );
			}
		}
		const calibration = GyroHID_Calibration( family, report, data );
		check( calibration?.every( axis => axis.bias === 100 && axis.scale > 0.06 && axis.scale < 0.08 ), family + ' factory offsets and scale' );
		const bytes = new DataView( new ArrayBuffer( 63 ) );
		for ( let n = 0; n < ( family === 'switch' ? 3 : 1 ); n ++ ) for ( let i = 0; i < 3; i ++ )
			bytes.setInt16( ( family === 'switch' ? 18 + n * 12 : family === 'dualsense' ? 15 : 12 ) + i * 2, 100, true );
		const rate = GyroHID_Parse( family, family === 'switch' ? 0x30 : 1, bytes, calibration );
		check( rate.pitch === 0 && rate.yaw === 0 && rate.roll === 0, 'stationary offset > 0.6 deg/s removed before drift filter' );
	}
	check( GyroHID_Calibration( 'dualsense', 5, new DataView( new ArrayBuffer( 35 ) ) ) === null, 'zero-denominator factory data rejected' );
} );

Deno.test( 'HID stop/start serialises a cancelled in-flight open before reopening the same handle', async () => {
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'navigator' );
	const controller = device(); let release, opens = 0;
	const pending = new Promise( resolve => { release = resolve; } );
	controller.open = async () => { if ( ++ opens === 1 ) await pending; controller.opened = true; };
	Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { hid: hid( [ controller ] ) } } );
	try {
		const old = GyroHID_Start();
		for ( let i = 0; i < 10 && ! opens; i ++ ) await Promise.resolve();
		check( opens === 1, 'old open is in flight' );
		GyroHID_Stop(); const current = GyroHID_Start(); await Promise.resolve();
		check( opens === 1, 'replacement waits for cancelled handle cleanup' );
		release(); await old; await current;
		check( opens === 2 && controller.opened, 'late old cleanup cannot close the replacement handle' );
	} finally { release(); GyroHID_Stop(); if ( saved ) Object.defineProperty( globalThis, 'navigator', saved ); else delete globalThis.navigator; }
} );

Deno.test( 'HID stop/start waits for the previous successful connection to close', async () => {
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'navigator' );
	const controller = device(); let release, closes = 0, opens = 0;
	controller.open = async () => { opens ++; controller.opened = true; };
	const pending = new Promise( resolve => { release = resolve; } );
	controller.close = async () => { if ( ++ closes === 1 ) await pending; controller.opened = false; };
	Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { hid: hid( [ controller ] ) } } );
	try {
		await GyroHID_Start(); GyroHID_Stop(); const replacement = GyroHID_Start();
		await Promise.resolve(); release(); await replacement;
		check( controller.opened && opens === 2, 'replacement reopens after the old deferred close completes' );
	} finally { release(); GyroHID_Stop(); if ( saved ) Object.defineProperty( globalThis, 'navigator', saved ); else delete globalThis.navigator; }
} );

import { GyroHID_Connect } from '../src/platform/gyro_hid.js';
Deno.test( 'a late permission grant cannot restart HID after input shutdown', async () => {
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'navigator' );
	const controller = device(); let grant, requests = 0;
	const permission = new Promise( resolve => { grant = resolve; } );
	Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { hid: {
		...hid( [] ), requestDevice() { requests ++; return permission; }
	} } } );
	try {
		const connecting = GyroHID_Connect(); check( requests === 1, 'request starts synchronously in the gesture' );
		GyroHID_Stop(); grant( [ controller ] ); await connecting;
		check( ! controller.opened && controller.sent.length === 0, 'cancelled permission result never opens or configures a device' );
	} finally { grant( [] ); GyroHID_Stop(); if ( saved ) Object.defineProperty( globalThis, 'navigator', saved ); else delete globalThis.navigator; }
} );

Deno.test( 'Switch Pro IMU axes match the common PlayStation/GameController frame', () => {
	// SDL_hidapi_switch.c:2218-2228: canonical X=-sensor Y, Y=sensor Z, Z=-sensor X.
	const data = new DataView( new ArrayBuffer( 48 ) );
	for ( let n = 0; n < 3; n ++ ) {
		data.setInt16( 18 + n * 12, 160, true ); data.setInt16( 20 + n * 12, 320, true ); data.setInt16( 22 + n * 12, 480, true );
	}
	const rate = GyroHID_Parse( 'switch', 0x30, data );
	check( Math.abs( rate.pitch + 22.4 ) < 1e-6 && Math.abs( rate.yaw - 33.6 ) < 1e-6 && Math.abs( rate.roll + 11.2 ) < 1e-6,
		'physical Switch axes require a permutation as well as sign changes' );
} );

Deno.test( 'Switch USB setup sends full descriptor-sized reports with the report ID supplied separately', async () => {
	// SDL_hidapi_switch.c:117-120, 451-463: 64-byte USB packets include the one-byte report ID.
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'navigator' ), controller = device();
	controller.collections = [ { outputReports: [ { reportId: 0x80 } ] } ];
	Object.defineProperty( globalThis, 'navigator', { configurable: true, value: { hid: hid( [ controller ] ) } } );
	try {
		await GyroHID_Start();
		check( controller.sent.length === 8, 'USB handshakes, force USB and three subcommands complete' );
		check( controller.sent.every( ( [ , bytes ] ) => bytes.length === 63 ), 'USB body is 63 bytes, not 64 including the report ID' );
	} finally { GyroHID_Stop(); if ( saved ) Object.defineProperty( globalThis, 'navigator', saved ); else delete globalThis.navigator; }
} );
