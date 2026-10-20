/**
 * @module platform/gyro_hid
 *
 * WebHID motion transport. WebHID's DataView excludes the report ID. Only first-party full input reports are
 * accepted; the unrelated non-standard Gamepad motion device is never chosen as a player's stick controller.
 */
import { Gyro_Sample, Gyro_Remove } from './gyro.js';

const devices = new Map(), opening = new Map();
let hid = null, generation = 0, nextId = 0;
let status = '';
const SONY = 0x054c, NINTENDO = 0x057e;

/** Identifies supported first-party controllers, without requesting permission. */
export function GyroHID_Family( device ) {

	if ( device.vendorId === SONY && [ 0x0ce6, 0x0df2 ].includes( device.productId ) ) return 'dualsense';
	if ( device.vendorId === SONY && [ 0x05c4, 0x09cc ].includes( device.productId ) ) return 'dualshock4';
	if ( device.vendorId === NINTENDO && device.productId === 0x2009 ) return 'switch';
	return null;

}

/**
 * Parses full USB/Bluetooth reports into canonical right-handed degrees/second. Layout references (report ID
 * included there): Linux drivers/hid/hid-playstation.c, dualsense_input_report/dualshock4_input_report and
 * playstation_gyro_calibration; dekuNukem/Nintendo_Switch_Reverse_Engineering, imu_sensor_notes.md and
 * bluetooth_hid_notes.md (0x30, three 12-byte IMU frames; LSM6DS3 ±2000 mode, 70 mdps/digit rather than the saturating linear range).
 * Sony nominal resolution is 16 counts/deg/s. Factory trims vary: stationary bias is learnt by the shared filter.
 * https://github.com/torvalds/linux/blob/master/drivers/hid/hid-playstation.c
 * https://github.com/dekuNukem/Nintendo_Switch_Reverse_Engineering/blob/master/imu_sensor_notes.md
 */
export function GyroHID_Parse( family, reportId, data, calibration = null ) {

	if ( ! ( data instanceof DataView ) ) return null;
	let offset, scale = 1 / 16;
	if ( family === 'dualsense' ) {

		if ( reportId === 0x01 && data.byteLength >= 63 ) offset = 15;
		else if ( reportId === 0x31 && data.byteLength >= 77 ) offset = 16;
		else return null;

	} else if ( family === 'dualshock4' ) {

		if ( reportId === 0x01 && data.byteLength >= 63 ) offset = 12;
		else if ( reportId === 0x11 && data.byteLength >= 77 ) offset = 14;
		else return null;

	} else if ( family === 'switch' ) {

		if ( reportId !== 0x30 || data.byteLength < 48 ) return null;
		// SDL_hidapi_switch.c:2218-2228: Sony/controller X=-sensor Y, Y=sensor Z, Z=-sensor X.
		const sum = [ 0, 0, 0 ];
		for ( let n = 0; n < 3; n ++ ) for ( let i = 0; i < 3; i ++ ) sum[ i ] += data.getInt16( 18 + n * 12 + i * 2, true );
		const values = sum.map( ( value, i ) => calibration ? ( value / 3 - calibration[ i ].bias ) * calibration[ i ].scale : value * 0.070 / 3 );
		return { pitch: - values[ 1 ], yaw: values[ 2 ], roll: - values[ 0 ] };

	} else return null;
	const values = [ 0, 1, 2 ].map( i => {

		const raw = data.getInt16( offset + i * 2, true );
		return calibration ? ( raw - calibration[ i ].bias ) * calibration[ i ].scale : raw * scale;

	} );
	return { pitch: values[ 0 ], yaw: values[ 1 ], roll: values[ 2 ] };

}

/**
 * Reads factory zero offsets and scale. Sony feature DataViews include the report ID; Switch SPI payloads are the
 * 24-byte IMU calibration block. Nominal fallback is used for missing/malformed trims. Equations/layouts:
 * SDL_hidapi_ps5.c:580-606, SDL_hidapi_ps4.c:507-548, SDL_hidapi_switch.c:1038-1073 (reference, not bundled code).
 */
export function GyroHID_Calibration( family, reportId, data ) {

	if ( ! ( data instanceof DataView ) || data.byteLength < ( family === 'switch' ? 24 : 23 ) ) return null;
	const axes = [];
	for ( let i = 0; i < 3; i ++ ) {

		let bias, scale;
		if ( family === 'switch' ) {

			bias = data.getInt16( 12 + i * 2, true );
			scale = 936 / ( data.getInt16( 18 + i * 2, true ) - bias );

		} else if ( family === 'dualsense' || family === 'dualshock4' ) {

			bias = data.getInt16( 1 + i * 2, true );
			const grouped = family === 'dualshock4' && reportId === 5;
			const plus = data.getInt16( 7 + i * ( grouped ? 2 : 4 ), true );
			const minus = data.getInt16( ( grouped ? 13 : 9 ) + i * ( grouped ? 2 : 4 ), true );
			scale = ( data.getInt16( 19, true ) + data.getInt16( 21, true ) ) / ( Math.abs( plus - bias ) + Math.abs( minus - bias ) );

		} else return null;
		if ( ! Number.isFinite( scale ) || scale < 0.03 || scale > 0.1 || Math.abs( bias ) > 1024 ) return null;
		axes.push( { bias, scale } );

	}
	return axes;

}

/** Browser capability and last connection outcome, for the Options page. */
export function GyroHID_Status() {

	return { available: typeof navigator !== 'undefined' && !! navigator.hid,
		text: status || ( typeof navigator !== 'undefined' && navigator.hid ? 'Permission needed once' : 'WebHID needs Chrome/Edge' ) };

}

function serialise( device, operation ) {

	// Opens, initialisation and shutdown closes share one per-device chain. Even a cancelled OS call that finishes
	// late must release its handle before the next generation can reuse it.
	const previous = opening.get( device ) || Promise.resolve();
	const job = previous.catch( () => {} ).then( operation ); opening.set( device, job );
	return job.finally( () => { if ( opening.get( device ) === job ) opening.delete( device ); } );

}

function attach( device, epoch ) {

	return serialise( device, () => epoch === generation ? attachNow( device, epoch ) : undefined );

}

async function attachNow( device, epoch ) {

	const family = GyroHID_Family( device );
	if ( ! family || devices.has( device ) ) return;
	const record = { id: 'hid-' + epoch + '-' + nextId ++, family, sequence: 0, waiter: null };
	devices.set( device, record );
	record.report = event => {

		if ( epoch !== generation ) return;
		if ( record.waiter?.accept( event ) ) return;
		const rate = GyroHID_Parse( family, event.reportId, event.data, record.calibration );
		if ( rate && record.ready ) {

			const offset = family === 'dualsense' ? ( event.reportId === 0x31 ? 9 : 8 ) :
				family === 'dualshock4' ? ( event.reportId === 0x11 ? 7 : 5 ) : 3;
			const pairPressed = ( event.data.getUint8( offset ) & ( family === 'switch' ? 4 : 128 ) ) !== 0;
			Gyro_Sample( record.id, rate, { family, vendorId: device.vendorId, productId: device.productId, pairPressed } );

		}

	};
	const exchange = async ( reportId, bytes, accepts ) => {

		let timer;
		const reply = new Promise( ( resolve, reject ) => {

			timer = setTimeout( () => reject( Error( 'Controller did not acknowledge gyro setup' ) ), 1000 );
			record.waiter = { accept: event => { if ( ! accepts( event ) ) return false; resolve( event ); return true; }, reject };

		} );
		try { const results = await Promise.all( [ device.sendReport( reportId, bytes ), reply ] ); return results[ 1 ]; }
		finally { clearTimeout( timer ); record.waiter = null; }

	};
	try {

		if ( ! device.opened ) await device.open();
		if ( epoch !== generation ) throw Error( 'Gyro connection cancelled' );
		device.addEventListener( 'inputreport', record.report );
		if ( family === 'switch' ) {

			// USB's vendor handshake (0x80/0x81) precedes normal subcommands; Bluetooth has no 0x80 output report.
			const usb = device.collections?.some( c => c.outputReports?.some( r => r.reportId === 0x80 ) );
			const usbCommand = command => { const bytes = new Uint8Array( 63 ); bytes[ 0 ] = command; return bytes; };
			if ( usb ) for ( const command of [ 1, 2, 3, 2 ] ) await exchange( 0x80, usbCommand( command ),
				e => e.reportId === 0x81 && e.data.byteLength > 0 && e.data.getUint8( 0 ) === command );
			if ( usb ) await device.sendReport( 0x80, usbCommand( 4 ) );
			// SDL_hidapi_switch.c:117-120,451-463: USB/BT totals are 64/49 bytes; WebHID supplies ID separately.
			for ( const [ command, argument ] of [ [ 0x03, 0x30 ], [ 0x40, 1 ] ] ) {

				const bytes = new Uint8Array( usb ? 63 : 48 );
				bytes.set( [ record.sequence ++ & 15, 0, 1, 0x40, 0x40, 0, 1, 0x40, 0x40, command, argument ] );
				await exchange( 0x01, bytes, e => e.reportId === 0x21 && e.data.byteLength >= 14 &&
					( e.data.getUint8( 12 ) & 0x80 ) !== 0 && e.data.getUint8( 13 ) === command );

			}

			// SPI read 0x6020: factory IMU offsets/scale, without writing the controller's flash.
			const bytes = new Uint8Array( usb ? 63 : 48 );
			bytes.set( [ record.sequence ++ & 15, 0, 1, 0x40, 0x40, 0, 1, 0x40, 0x40, 0x10, 0x20, 0x60, 0, 0, 24 ] );
			const reply = await exchange( 1, bytes, e => e.reportId === 0x21 && e.data.byteLength >= 14 &&
				( e.data.getUint8( 12 ) & 0x80 ) !== 0 && e.data.getUint8( 13 ) === 0x10 );
			if ( reply.data.byteLength >= 43 && reply.data.getUint32( 14, true ) === 0x6020 && reply.data.getUint8( 18 ) === 24 )
				record.calibration = GyroHID_Calibration( family, 0x10, new DataView( reply.data.buffer, reply.data.byteOffset + 19, 24 ) );

		} else {

			// Sony feature 0x02 (DS4) and 0x09 (DualSense serial) enable extended Bluetooth reports without rumble.
			// Both transports can then read their factory trims. DS4's Bluetooth 0x05 has grouped axis extrema.
			if ( family === 'dualsense' ) await device.receiveFeatureReport( 0x09 );
			const feature = family === 'dualsense' ? 5 : 2;
			const data = await device.receiveFeatureReport( feature );
			record.calibration = GyroHID_Calibration( family, feature, data );
			const bluetooth = device.collections?.some( c => c.inputReports?.some( r => r.reportId === 0x11 ) );
			if ( family === 'dualshock4' && bluetooth ) record.calibration = GyroHID_Calibration( family, 5, await device.receiveFeatureReport( 5 ) );

		}
		if ( epoch !== generation ) throw Error( 'Gyro connection cancelled' );
		record.ready = true;
		status = 'Connected: ' + ( device.productName || family );

	} catch ( error ) {

		device.removeEventListener( 'inputreport', record.report );
		if ( devices.get( device ) === record ) devices.delete( device ); Gyro_Remove( record.id );
		try { if ( device.opened ) await device.close(); } catch {}
		if ( epoch === generation ) status = String( error.message || error );
		throw error;

	}

}

function disconnected( event ) {

	const record = devices.get( event.device );
	if ( ! record ) return;
	record.waiter?.reject( Error( 'Controller disconnected' ) );
	event.device.removeEventListener( 'inputreport', record.report ); Gyro_Remove( record.id ); devices.delete( event.device );
	status = 'Controller disconnected';

}
function connected( event ) { void attach( event.device, generation ).catch( () => {} ); }

/** Restores previously granted devices; never opens a permission prompt during loading. */
export async function GyroHID_Start() {

	if ( hid || typeof navigator === 'undefined' || ! navigator.hid ) return;
	hid = navigator.hid; const epoch = ++ generation;
	hid.addEventListener( 'connect', connected ); hid.addEventListener( 'disconnect', disconnected );
	try { for ( const device of await hid.getDevices() ) if ( epoch === generation ) {

		try { await attach( device, epoch ); } catch {} // A stale grant must not hide another working controller.

	} }
	catch ( error ) { status = String( error.message || error ); }

}

/** Must be called synchronously from a real click/key event to obtain WebHID permission. */
export async function GyroHID_Connect() {

	if ( ! GyroHID_Status().available ) return;
	try {

		// requestDevice precedes any await: browser permission belongs to this exact user gesture.
		const request = navigator.hid.requestDevice( { filters: [ { vendorId: SONY, productId: 0x0ce6 },
			{ vendorId: SONY, productId: 0x0df2 }, { vendorId: SONY, productId: 0x05c4 },
			{ vendorId: SONY, productId: 0x09cc }, { vendorId: NINTENDO, productId: 0x2009 } ] } );
		const started = GyroHID_Start(), epoch = generation;
		const [ , granted ] = await Promise.all( [ started, request ] );
		if ( epoch !== generation ) return;
		for ( const device of granted ) await attach( device, epoch );

	} catch ( error ) { status = String( error.message || error ); }

}

/** Removes listeners, invalidates in-flight setup, and closes this page's HID handles. Permissions remain granted. */
export function GyroHID_Stop() {

	++ generation;
	hid?.removeEventListener( 'connect', connected ); hid?.removeEventListener( 'disconnect', disconnected ); hid = null;
	for ( const [ device, record ] of devices ) {

		record.waiter?.reject( Error( 'Gyro stopped' ) ); device.removeEventListener( 'inputreport', record.report );
		Gyro_Remove( record.id ); void serialise( device, () => device.close() ).catch( () => {} );

	}
	devices.clear();

}
