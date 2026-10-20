/**
 * @module tests/gyro_integration
 *
 * Independent public-interface checks: synthetic motion and Gamepad API state reach the real input poll and the
 * two games' Options pages reach the shared controls. No physical controller or native sensor is exercised.
 */
import * as input from '../src/platform/in_web.js';
import { Gyro_Init, Gyro_Remove, Gyro_Sample } from '../src/platform/gyro.js';
import * as keys from '../src/engine/client/keys.js';
import { cl, cls } from '../src/engine/client/client.js';
import { cl_yawspeed, cl_pitchspeed, cl_forwardspeed, cl_sidespeed } from '../src/engine/client/cl_input.js';
import { set_host_frametime } from '../src/engine/server/host.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue, Cvar_VariableValue } from '../src/engine/common/cvar.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import * as hooks from '../src/engine/common/hooks.js';
import * as menu from '../src/engine/client/menu.js';
import * as common from '../src/engine/client/menu_common.js';
import * as options from '../src/engine/client/menu_options.js';
import * as hexenOptions from '../src/engine/client/menu_hexen2_options.js';
import { M_Gyro_Draw } from '../src/engine/client/menu_gyro.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const near = ( actual, expected, message ) => check( Math.abs( actual - expected ) < 1e-6, `${message}: ${actual} != ${expected}` );
let pads = [], locked = false, text = [];
if ( ! globalThis.window ) Object.defineProperty( globalThis, 'window', { configurable: true,
	value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 } } );
if ( ! globalThis.navigator ) Object.defineProperty( globalThis, 'navigator', { value: {}, configurable: true } );
Object.defineProperty( navigator, 'getGamepads', { value: () => pads, configurable: true } );
// The documented hook installer preserves every real dependency except the controlled input lock/controller wheel
// and drawing sink; this makes the lock independent of renderer encounters and lets assertions read public output.
const table = Object.fromEntries( Object.entries( hooks ).filter( ( [ name ] ) => ! name.startsWith( 'Hooks_' ) ) );
hooks.Hooks_Install( { ...table, R_BestiaryInputLocked: () => locked, R_ControllerPoll: () => false,
	R_ControllerCancel: () => {}, MainMenu_Text: ( x, y, value ) => { text.push( { x, y, value } ); return true; },
	MainMenu_Glyph: () => false } );
common.M_SetExternals( {
	key_dest_set: keys.set_key_dest, key_dest_get: () => keys.key_dest,
	cls: { state: 0, demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 },
	Draw_CachePic: () => ( { width: 16, height: 16 } ), Draw_Pic: () => {}, Draw_TransPic: () => {},
	Draw_Character: () => {}, S_LocalSound: () => {}, realtime_get: () => 0, host_time_get: () => 0
} );
for ( const variable of [ cl_yawspeed, cl_pitchspeed, cl_forwardspeed, cl_sidespeed ] ) {
	if ( ! Cvar_FindVar( variable.name ) ) Cvar_RegisterVariable( variable );
}
const pad = ( index = 0 ) => ( { index, id: 'DualSense 054c-0ce6', mapping: 'standard', connected: true,
	axes: [ 0, 0, 0, 0 ], buttons: Array.from( { length: 17 }, () => ( { pressed: false, value: 0 } ) ) } );
const command = () => ( { forwardmove: 0, sidemove: 0, upmove: 0 } );
const poll = ( cmd = command() ) => input.IN_GamepadPoll( cmd, () => {}, () => {} );
function reset( game = 'quake' ) {
	pads = []; locked = false; input.IN_GamepadRelease( () => {} ); Gyro_Remove(); Gyro_Init();
	GameProfile_Set( game ); keys.set_key_dest( keys.key_game ); cls.demoplayback = false;
	cl.viewangles.fill( 0 ); set_host_frametime( 0.01 );
	for ( const [ name, value ] of [ [ 'enable', 1 ], [ 'sensitivity', 1 ], [ 'invert_y', 0 ], [ 'hold', 0 ], [ 'button', 10 ] ] ) Cvar_SetValue( 'gyro_' + name, value );
	const current = pad(); pads = [ current ]; return current;
}
function sample( rate = { pitch: 100, yaw: 100, roll: 100 }, current = pads[ 0 ] ) {
	check( Gyro_Sample( 'synthetic', rate, { padKey: current.index + '|' + current.id } ), 'sample admitted' );
}

for ( const game of [ 'quake', 'hexen2' ] ) {
	Deno.test( `${game}: the public gamepad poll combines the right stick and gyro; button-only polling does not drain it`, () => {
		const current = reset( game ); current.axes = [ 0, 0, 1, 1 ];
		sample(); poll(); // First active command establishes the pairing, retaining ordinary stick look.
		cl.viewangles.fill( 0 ); sample(); poll( null ); poll();
		near( cl.viewangles[ 0 ], cl_pitchspeed.value * 0.01 - 1, 'stick pitch plus gyro pitch' );
		near( cl.viewangles[ 1 ], - cl_yawspeed.value * 0.01 + Math.SQRT2, 'stick yaw plus gyro yaw/roll' );
	} );
	Deno.test( `${game}: no gyro leaves movement and right-stick aiming unchanged`, () => {
		const current = reset( game ); current.axes = [ 1, - 1, 1, 1 ];
		const cmd = command(); poll( cmd );
		near( cmd.forwardmove, cl_forwardspeed.value, 'forward movement' );
		near( cmd.sidemove, cl_sidespeed.value, 'side movement' );
		near( cl.viewangles[ 0 ], cl_pitchspeed.value * 0.01, 'ordinary stick pitch' );
		near( cl.viewangles[ 1 ], - cl_yawspeed.value * 0.01, 'ordinary stick yaw' );
		const before = Array.from( cl.viewangles ); pads = []; poll();
		check( before.every( ( value, i ) => value === cl.viewangles[ i ] ), 'no pad produces no look' );
	} );
}

Deno.test( 'public gamepad gyro is gated in menus, demos and the input lock; returning drains one frame', () => {
	for ( const mode of [ 'menu', 'demo', 'lock' ] ) {
		reset(); sample(); poll(); sample(); poll(); check( cl.viewangles[ 0 ] < 0, mode + ': active fixture aims' );
		cl.viewangles.fill( 0 );
		if ( mode === 'menu' ) keys.set_key_dest( keys.key_menu );
		if ( mode === 'demo' ) cls.demoplayback = true;
		if ( mode === 'lock' ) locked = true;
		sample(); poll(); poll();
		near( cl.viewangles[ 0 ], 0, mode + ': pitch held' ); near( cl.viewangles[ 1 ], 0, mode + ': yaw held' );
		keys.set_key_dest( keys.key_game ); cls.demoplayback = false; locked = false;
		sample(); poll(); near( cl.viewangles[ 0 ], 0, mode + ': no motion on first resumed command' );
		sample(); poll(); near( cl.viewangles[ 0 ], - 1, mode + ': fresh motion resumes' );
	}
} );

function drawOptions( hexen ) {
	let row;
	// Hexen retains its native first page, so move through public navigation until the added row scrolls into view.
	for ( let step = 0; step < 32; step ++ ) {

		text = []; ( hexen ? hexenOptions.M_Hexen2_Options_Draw : options.M_Options_Draw )();
		row = text.find( item => item.value.trim() === 'Controller' );
		if ( row ) break;
		menu.M_Keydown( keys.K_DOWNARROW );

	}
	check( row, 'Options draws a Controller row' );
	const y = row.y - ( ( common._vid.height - 200 ) >> 1 );
	check( y >= 0 && y <= 192, 'Options gyro row is visible and touchable: y=' + y ); return y;
}

for ( const game of [ 'quake', 'hexen2' ] ) Deno.test( `${game}: Options reaches the shared gyro page through touch and keyboard, with working controls and return`, () => {
	reset( game );
	const hexen = game === 'hexen2', parent = hexen ? common.m_hexen2_options : common.m_options;
	const open = hexen ? hexenOptions.M_Hexen2_Menu_Options_f : options.M_Menu_Options_f;
	const touch = hexen ? hexenOptions.M_Hexen2_Options_Touch : options.M_Options_Touch;
	open(); const rowY = drawOptions( hexen ); touch( 100, rowY + 1 );
	check( common.m_state === common.m_gyro && keys.key_dest === keys.key_menu, 'touch opens shared page' );
	text = []; M_Gyro_Draw();
	for ( const label of [ 'Gyro aiming', 'Sensitivity', 'Invert gyro Y', 'Only while held', 'Hold button', 'Connect gyro: unavailable' ] ) {
		check( text.some( item => item.value === label ), 'shared page draws ' + label );
	}
	check( text.some( item => item.value === 'WebHID needs Chrome/Edge' ), 'unsupported browsers receive a clear capability note' );
	// Menu touch uses element coordinates; these are the centred 320x200 menu's logical coordinates transformed back.
	const tap = y => menu.M_TouchInput( 100 + ( common._vid.width - 320 ) / 2, y + ( common._vid.height - 200 ) / 2, common._vid.width, common._vid.height );
	tap( 73 ); near( Cvar_VariableValue( 'gyro_enable' ), 0, 'touch toggles gyro' );
	menu.M_Keydown( keys.K_ENTER ); near( Cvar_VariableValue( 'gyro_enable' ), 1, 'Enter toggles gyro back' );
	menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_RIGHTARROW ); near( Cvar_VariableValue( 'gyro_sensitivity' ), 1.1, 'right adjusts sensitivity' );
	tap( 105 ); near( Cvar_VariableValue( 'gyro_invert_y' ), 1, 'touch toggles invert' );
	tap( 121 ); near( Cvar_VariableValue( 'gyro_hold' ), 1, 'touch toggles hold mode' );
	tap( 137 ); near( Cvar_VariableValue( 'gyro_button' ), 11, 'touch selects hold button' );
	menu.M_Keydown( keys.K_ESCAPE ); check( common.m_state === parent, 'Escape returns to originating Options' );
	// The Options cursor remains on the touched row, so Enter exercises its separate keyboard dispatch.
	menu.M_Keydown( keys.K_ENTER ); check( common.m_state === common.m_gyro, 'Enter reopens shared page' );
	menu.M_Keydown( keys.K_ESCAPE ); check( common.m_state === parent, 'second return keeps originating Options' );
} );

Deno.test( 'Hexen Options exposes its hidden gyro row through the touch-only More and Top affordances', () => {
	reset( 'hexen2' ); hexenOptions.M_Hexen2_Menu_Options_f();
	const draw = () => { text = []; hexenOptions.M_Hexen2_Options_Draw(); };
	const tap = ( x, y ) => menu.M_TouchInput( x + ( common._vid.width - 320 ) / 2,
		y + ( common._vid.height - 200 ) / 2, common._vid.width, common._vid.height );
	draw();
	// Cursors survive reopening Options. Reach the top using touch alone when the previous trial left it scrolled.
	if ( text.some( item => item.value === 'Top ^' ) ) { tap( 260, 54 ); draw(); }
	check( text.some( item => item.value === 'More v' ), 'the first page visibly offers More' );
	check( ! text.some( item => item.value.trim() === 'Controller' ), 'gyro begins below the native first page' );
	tap( 260, 54 ); draw();
	check( common.m_state === common.m_hexen2_options, 'More scrolls without opening another page' );
	check( text.some( item => item.value === 'Top ^' ), 'the scrolled page visibly offers Top' );
	const row = text.find( item => item.value.trim() === 'Controller' );
	check( row, 'More reveals Controller' );
	const y = row.y - ( ( common._vid.height - 200 ) >> 1 );
	check( y >= 60 && y <= 192, 'revealed row remains within the touchable page' );
	tap( 120, y + 1 ); check( common.m_state === common.m_gyro, 'touch opens the revealed gyro row' );
	tap( - 1, 100 ); check( common.m_state === common.m_hexen2_options, 'outside touch returns to Hexen Options' );
	tap( 260, 54 ); draw();
	check( text.some( item => item.value === 'More v' ), 'Top returns to the first page using touch alone' );
} );

Deno.test( 'gyro uses the same effective remote PadShare population as the selected local-play controller', async () => {
	const { Window_Host } = await import( '../src/engine/net/net_window.js' );
	const { sv, svs } = await import( '../src/engine/server/server.js' );
	const share = await import( '../src/platform/pad_share.js' );
	const remote = await import( '../src/platform/pad_share.js?gyro-remote-regression' );
	const previous = { active: sv.active, maxclients: svs.maxclients };
	try {
		const current = reset(), other = pad( 1 );
		current.id = 'Xbox controller'; other.axes = [ 0, 0, 0, 0 ];
		pads = [];
		check( Window_Host( 'gyro-remote-regression' ), 'local session starts' );
		sv.active = true; svs.maxclients = 2;
		poll( null ); // Join the real input module's PadShare channel before the other window publishes its pads.
		remote.PadShare_Join( 'gyro-remote-regression', 2 );
		remote.PadShare_Frame( [ current, other ], [] );
		await new Promise( resolve => setTimeout( resolve, 20 ) );
		sample( { pitch: 100, yaw: 100, roll: 100 }, other );
		check( poll()?.index === other.index, 'player 1 selects its assigned second pad from the remote snapshot' );
		cl.viewangles.fill( 0 ); sample( { pitch: 100, yaw: 100, roll: 100 }, other ); poll();
		near( cl.viewangles[ 0 ], - 1, 'remote selected pad receives its own gyro pitch' );
		near( cl.viewangles[ 1 ], Math.SQRT2, 'remote selected pad receives its own gyro yaw' );
		check( navigator.getGamepads().length === 0, 'the fixture has no locally visible gamepads' );
		// Preserve the whole effective population, rather than substituting only the selected pad and accidentally
		// bypassing ambiguity checks for another player's identical controller.
		current.id = other.id; remote.PadShare_Frame( [ current, other ], [] );
		await new Promise( resolve => setTimeout( resolve, 20 ) );
		Gyro_Remove(); cl.viewangles.fill( 0 );
		const unbound = () => Gyro_Sample( 'unbound-remote', { pitch: 100, yaw: 100, roll: 100 }, { family: 'dualsense' } );
		unbound(); poll(); unbound(); poll();
		near( cl.viewangles[ 0 ], 0, 'two identical remote pads require pairing before gyro pitch' );
		near( cl.viewangles[ 1 ], 0, 'an unpaired sibling cannot aim another player\'s view' );
	} finally {
		remote.PadShare_Join( null ); share.PadShare_Join( null ); Window_Host( null );
		sv.active = previous.active; svs.maxclients = previous.maxclients; pads = []; poll( null );
	}
} );
