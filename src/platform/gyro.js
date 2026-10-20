/**
 * @module platform/gyro
 *
 * Controller motion shared by browser HID and native GameController input. Rates are degrees/second in a
 * right-handed controller frame: X pitch, Y yaw, Z roll. Local-space aiming blends yaw and roll at 45 degrees;
 * it needs no attitude estimator and remains independent of the active game and the phone's orientation controls.
 */
import { Cvar_FindVar, Cvar_RegisterVariable, cvar_t } from '../engine/common/cvar.js';

const settings = [ [ 'gyro_enable', '1' ], [ 'gyro_sensitivity', '1' ], [ 'gyro_invert_y', '0' ],
	[ 'gyro_hold', '0' ], [ 'gyro_button', '10' ] ];
const sources = new Map();
let selected = null;
const now = () => performance.now();

/** Registers archived controller settings once; also safe before input starts (Options). */
export function Gyro_Init() {

	for ( const [ name, value ] of settings ) if ( ! Cvar_FindVar( name ) ) Cvar_RegisterVariable( new cvar_t( name, value, true ) );

}

/** Drops a disconnected source, or all sources and pairing history during input shutdown. */
export function Gyro_Remove( id = null ) {

	if ( id === null ) { sources.clear(); selected = null; }
	else sources.delete( id );

}

/**
 * Publishes the latest physical sample, not an unbounded event queue. Identity contains vendorId/productId and/or
 * family (dualsense, dualshock4, switch); a padKey may explicitly bind a trusted source to a Gamepad identity.
 * Returns false for malformed rates. Caller supplies local monotonic milliseconds, never a native wall clock.
 */
export function Gyro_Sample( id, rate, identity = {}, at = now() ) {

	if ( typeof id !== 'string' || ! [ rate?.pitch, rate?.yaw, rate?.roll, at ].every( Number.isFinite ) ||
		Math.max( Math.abs( rate.pitch ), Math.abs( rate.yaw ), Math.abs( rate.roll ) ) > 4000 ) return false;
	let source = sources.get( id );
	if ( ! source ) { source = { bias: [ 0, 0, 0 ], still: 0, at: at, ...identity }; sources.set( id, source ); }
	const dt = Math.max( 0, Math.min( ( at - source.at ) / 1000, 0.05 ) );
	const rates = [ rate.pitch, rate.yaw, rate.roll ];
	// Only a sustained sub-degree noise floor is learnt. A moving controller resets the still timer immediately.
	if ( rates.every( ( v, i ) => Math.abs( v - source.bias[ i ] ) < 0.6 ) ) {

		source.still += dt;
		if ( source.still > 1 ) for ( let i = 0; i < 3; i ++ ) source.bias[ i ] += ( rates[ i ] - source.bias[ i ] ) * ( 1 - Math.exp( - dt / 2 ) );

	} else source.still = 0;
	source.pairPressed = !! identity.pairPressed;
	source.rate = rates; source.at = at;
	return true;

}

function family( pad ) {

	const id = String( pad.id ).toLowerCase();
	if ( /dualsense|0ce6|0df2/.test( id ) ) return 'dualsense';
	if ( /dualshock|054c.*(?:05c4|09cc)|(?:05c4|09cc).*054c/.test( id ) ) return 'dualshock4';
	// WebKit (Safari, the Mac app) names a pad by its product name only, e.g. "Pro Controller" or "Joy-Con (L/R)"
	if ( /switch|nintendo|pro controller|joy-?con|057e.*20(?:06|07|09|0e)|20(?:06|07|09|0e).*057e/.test( id ) ) return 'switch';
	return null;

}

function matches( source, pad ) {

	if ( source.padKey ) return source.padKey === pad.index + '|' + pad.id;
	const id = String( pad.id ).toLowerCase();
	if ( source.vendorId && source.productId && id.includes( source.vendorId.toString( 16 ).padStart( 4, '0' ) ) &&
		id.includes( source.productId.toString( 16 ).padStart( 4, '0' ) ) ) return true;
	return source.family && source.family === family( pad );

}

// Selection is shared with the menu's read-only motion display; only aiming may establish a pairing.
function selectSource( pad, pads, at, pair = false ) {

	if ( ! pad ) return null;
	const key = pad.index + '|' + pad.id;
	const familySources = [ ...sources.values() ].filter( s => at - s.at >= 0 && at - s.at < 100 && matches( { ...s, padKey: null }, pad ) );
	const samePads = pads.filter( p => p?.connected && p.mapping === 'standard' && familySources.some( s => matches( { ...s, padKey: null }, p ) ) );
	if ( pair && samePads.length > 1 && pad.buttons?.[ 11 ]?.pressed ) {

		const pressedSources = familySources.filter( s => s.pairPressed );
		const pressedPads = samePads.filter( p => p.buttons?.[ 11 ]?.pressed );
		if ( pressedSources.length === 1 && pressedPads.length === 1 ) pressedSources[ 0 ].padKey = key;

	}
	// A read-only caller must see the same disconnected-pair cleanup as aiming, without changing pairing history.
	const fresh = [ ...sources.values() ].filter( s => at - s.at >= 0 && at - s.at < 100 ).map( s =>
		s.padKey && ! pads.some( p => p?.connected && p.index + '|' + p.id === s.padKey ) ? { ...s, padKey: null } : s );
	const bound = fresh.filter( s => s.padKey === key );
	const connected = pads.filter( p => p?.connected );
	let candidates = bound.length ? bound : fresh.filter( s => matches( s, pad ) );
	// One controller and one motion source belong together whatever their names say (a platform may name the pad
	// differently from the sensor); names only matter for telling several controllers apart.
	const single = candidates.length === 0 && fresh.length === 1 && connected.length === 1 && connected[ 0 ] === pad;
	if ( single ) candidates = fresh;
	if ( candidates.length !== 1 ) return null;
	const source = candidates[ 0 ];
	if ( ! single && connected.filter( p => p.mapping === 'standard' && matches( source, p ) ).length !== 1 ) return null;
	return source;

}

/** Returns paired, bias-corrected degrees/second, or null for missing, stale or ambiguous motion. Never consumes aim. */
export function Gyro_Rate( pad, pads, at = now() ) {

	const source = selectSource( pad, pads, at );
	if ( ! source ) return null;
	const [ pitch, yaw, roll ] = correctedRate( source );
	return Object.freeze( { pitch, yaw, roll } );

}

function correctedRate( source ) {

	return source.rate.map( ( v, i ) => Math.abs( v - source.bias[ i ] ) < 0.08 ? 0 : v - source.bias[ i ] );

}

/**
 * Adds fine aim to the selected pad's view angles (pitch at 0, yaw at 1), once per move command. Ambiguous devices
 * produce no motion; ordering two identical devices differently must never aim another player's view. Inactive,
 * missing, stale or newly selected input drains a frame rather than replaying motion after menus or reassignment.
 */
export function Gyro_Move( angles, pad, pads, seconds, active, at = now() ) {

	Gyro_Init();
	const key = pad ? pad.index + '|' + pad.id : null;
	for ( const source of sources.values() ) if ( source.padKey && ! pads.some( p => p?.connected && p.index + '|' + p.id === source.padKey ) ) delete source.padKey;
	if ( ! active || ! pad || ! Cvar_FindVar( 'gyro_enable' ).value ) { selected = null; return false; }
	if ( selected !== key ) { selected = key; return false; }
	const source = selectSource( pad, pads, at, true );
	if ( ! source ) return false;
	if ( Cvar_FindVar( 'gyro_hold' ).value ) {

		const index = Math.trunc( Cvar_FindVar( 'gyro_button' ).value );
		const button = pad.buttons?.[ index ];
		if ( ! ( typeof button === 'object' ? button?.pressed : button ) ) return false;

	}
	const sensitivity = Math.max( 0, Math.min( 10, Cvar_FindVar( 'gyro_sensitivity' ).value ) );
	const dt = Math.max( 0, Math.min( 0.05, seconds ) );
	if ( ! Number.isFinite( sensitivity ) || ! Number.isFinite( dt ) ) return false;
	const rate = correctedRate( source );
	const pitch = - rate[ 0 ] * dt * sensitivity * ( Cvar_FindVar( 'gyro_invert_y' ).value ? - 1 : 1 );
	angles[ 0 ] = Math.max( - 70, Math.min( 80, angles[ 0 ] + pitch ) );
	const yaw = ( rate[ 1 ] + rate[ 2 ] ) * Math.SQRT1_2 * dt * sensitivity;
	angles[ 1 ] += yaw;
	return pitch !== 0 || yaw !== 0;

}
