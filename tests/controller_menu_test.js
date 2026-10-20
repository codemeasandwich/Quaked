// Shared controller pages through public input, key, menu and model interfaces.
await import( '../src/engine/render/gl_rsurf.js' );
const keys = await import( '../src/engine/client/keys.js' );
const input = await import( '../src/platform/in_web.js' );
const gyro = await import( '../src/platform/gyro.js' );
const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const names = [ 'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'LSTICK', 'RSTICK', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'GUIDE' ];
Deno.test( 'pad key names round-trip without colliding with existing keys and persist through config', () => {
	const numbers = names.map( name => keys.Key_StringToKeynum( 'PAD_' + name ) );
	check( numbers.every( n => n >= 153 && n < 200 ) && new Set( numbers ).size === 17, 'seventeen unused key numbers' );
	check( Object.entries( keys ).filter( ( [ name ] ) => name.startsWith( 'K_' ) && ! name.startsWith( 'K_PAD_' ) ).every( ( [ , number ] ) => ! numbers.includes( number ) ), 'no existing key collides' );
	for ( const name of names ) {
		const number = keys.Key_StringToKeynum( 'PAD_' + name );
		check( keys.Key_KeynumToString( number ) === 'PAD_' + name, 'round trip ' + name );
		keys.Key_SetBinding( number, '+jump' );
		check( keys.Key_WriteBindings().includes( 'bind "PAD_' + name + '" "+jump"\n' ), 'saved ' + name );
		keys.Key_SetBinding( number, '' );
	}
} );
Deno.test( 'gyro exposes the paired bias-corrected rate without consuming an aiming frame', () => {
	check( typeof gyro.Gyro_Rate === 'function', 'read-only rate accessor exists' );
	gyro.Gyro_Remove(); gyro.Gyro_Init();
	const pad = { index: 0, id: 'Pro Controller', connected: true, mapping: 'standard', buttons: [] };
	gyro.Gyro_Sample( 'motion', { pitch: 10, yaw: 20, roll: 30 }, { family: 'switch' }, 100 );
	check( gyro.Gyro_Rate( pad, [ pad ], 110 )?.yaw === 20, 'paired rate' );
	check( gyro.Gyro_Rate( pad, [ pad ], 201 ) === null, 'stale source' );
	check( gyro.Gyro_Rate( pad, [ pad, { ...pad, index: 1 } ], 110 ) === null, 'ambiguous pads' );
	const angles = [ 0, 0, 0 ];
	check( ! gyro.Gyro_Move( angles, pad, [ pad ], .01, true, 110 ), 'accessor does not select/drain game frame' );
	check( gyro.Gyro_Move( angles, pad, [ pad ], .01, true, 110 ), 'next game frame still moves' );
	gyro.Gyro_Remove();
} );
Deno.test( 'a bound pad input uses its key in game, default clears it, and None suppresses fallback', async () => {
	let pads = [], events = [];
	if ( ! globalThis.navigator ) Object.defineProperty( globalThis, 'navigator', { value: {}, configurable: true } );
	Object.defineProperty( navigator, 'getGamepads', { value: () => pads, configurable: true } );
	const sink = ( key, down ) => events.push( [ key, down ] );
	input.IN_GamepadRelease( sink ); keys.set_key_dest( keys.key_game );
	const pad = { index: 0, id: 'Xbox', mapping: 'standard', connected: true, axes: [], buttons: Array.from( { length: 17 }, () => ( { pressed: false, value: 0 } ) ) };
	pads = [ pad ];
	const tap = () => { events = []; pad.buttons[ 0 ].pressed = true; input.IN_GamepadPoll( null, sink ); pad.buttons[ 0 ].pressed = false; input.IN_GamepadPoll( null, sink ); return events; };
	const number = keys.Key_StringToKeynum( 'PAD_A' );
	keys.Key_SetBinding( number, '+attack' );
	check( tap()[ 0 ]?.[ 0 ] === number, 'bound pad sends its own key' );
	keys.set_key_dest( keys.key_menu ); check( tap()[ 0 ]?.[ 0 ] === keys.K_ENTER, 'menus retain Enter' );
	keys.set_key_dest( keys.key_game ); keys.Key_SetBinding( number, ';' ); check( tap().length === 0, 'None sends no game event' );
	keys.Key_SetBinding( number, '' ); check( tap()[ 0 ]?.[ 0 ] === keys.K_SPACE, 'default restores legacy fallback' );
	check( typeof input.IN_GamepadState === 'function', 'snapshot accessor exists' );
	const snapshot = input.IN_GamepadState(); check( snapshot.pad?.id === pad.id && Object.isFrozen( snapshot.pad.buttons ), 'immutable primary snapshot' );
	pads = []; input.IN_GamepadRelease( sink );
} );

Deno.test( 'reference model retains every callout anchor and live controls return to their rest transforms', async () => {
	const THREE = await import( 'three' );
	const { buildController } = await import( '../src/engine/render/r_controller_model.js' );
	const { R_ControllerPose } = await import( '../src/engine/render/r_controller_preview.js' );
	const { CONTROLLER_INPUTS } = await import( '../src/engine/client/menu_controller_layout.js' );
	const model = buildController( THREE );
	for ( const input of CONTROLLER_INPUTS ) check( model.anchors[ input.anchor ]?.toArray().every( Number.isFinite ), 'finite anchor: ' + input.anchor );
	check( Object.keys( model.controls ).length === 17, 'all reference controls retained' );
	model.group.traverse( node => { if ( node.geometry ) check( Array.from( node.geometry.attributes.position.array ).every( Number.isFinite ), 'finite mesh ' + node.name ); } );
	const pad = { axes: [ 1, - 1, -.5, .5 ], buttons: Array.from( { length: 17 }, () => ( { pressed: true, value: .75 } ) ) };
	R_ControllerPose( model, pad, 'button-a' );
	check( model.controls[ 'button-a' ].group.position.y < model.controls[ 'button-a' ].restPosition.y, 'button depressed' );
	check( model.controls[ 'button-a' ].meshes.some( m => m.material.emissiveIntensity > 0 ), 'highlighted' );
	check( model.controls[ 'left-trigger' ].group.rotation.x < 0, 'analogue trigger pull' );
	check( model.controls[ 'left-stick' ].group.rotation.x !== 0, 'analogue stick tilt' );
	R_ControllerPose( model, null );
	for ( const control of Object.values( model.controls ) ) {
		check( control.group.position.equals( control.restPosition ), 'restored position' );
		check( control.group.rotation.equals( control.restRotation ), 'restored rotation including bumper/trigger baselines' );
	}
} );

Deno.test( 'callout layout is finite, within the viewport, disjoint and ordered at narrow, wide and tall aspects', async () => {
	const { M_ControllerLayout, M_ControllerInputName } = await import( '../src/engine/client/menu_controller_layout.js' );
	for ( const [ width, height ] of [ [ 320, 200 ], [ 640, 200 ], [ 320, 480 ], [ 960, 540 ], [ 320, 180 ], [ 640, 160 ] ] ) {
		const { labels, model } = M_ControllerLayout( width, height );
		check( labels.length === 19 && model.width > 0, 'all labels and model fit' );
		for ( const [ i, a ] of labels.entries() ) {
			check( [ a.x, a.y, a.width, a.height ].every( Number.isFinite ) && a.height > 0 && 16 * a.textScale <= a.height + 1e-8, 'two fitted lines fit ' + a.id );
			check( a.x >= 0 && a.x + a.width <= width && a.y >= 24 && a.y + a.height <= height - 16 + 1e-8, 'bounds' );
			for ( const b of labels.slice( i + 1 ) ) check( a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y + 1e-8 || b.y + b.height <= a.y + 1e-8, 'disjoint ' + a.id + '/' + b.id );
		}
		check( M_ControllerInputName( labels.find( x => x.index === 0 ), 'Pro Controller' ) === 'B', 'Nintendo positions' );
		check( M_ControllerInputName( labels.find( x => x.index === 1 ), 'DualSense' ) === 'Circle', 'PlayStation positions' );
	}
} );

// Use the same host seams as the maintained menu suites. Native lettering is captured character-by-character;
// the 3D context is absent, so these checks also exercise the complete no-WebGL editor.
async function menuFixture() {
	if ( ! globalThis.window ) Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 } } );
	const common = await import( '../src/engine/client/menu_common.js' );
	const menu = await import( '../src/engine/client/menu.js' );
	const pages = await import( '../src/engine/client/menu_controller.js' );
	const layout = await import( '../src/engine/client/menu_controller_layout.js' );
	const vars = await import( '../src/engine/common/cvar.js' );
	const profile = await import( '../src/engine/common/game_profile.js' );
	const hooks = await import( '../src/engine/common/hooks.js' );
	let text = [];
	const table = Object.fromEntries( Object.entries( hooks ).filter( ( [ name ] ) => ! name.startsWith( 'Hooks_' ) ) );
	hooks.Hooks_Install( { ...table, MainMenu_Text: ( x, y, value ) => { text.push( value ); return true; }, MainMenu_Glyph: () => false } );
	common.M_SetExternals( { key_dest_set: keys.set_key_dest, key_dest_get: () => keys.key_dest,
		cls: { state: 0, demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 },
		Draw_CachePic: () => ( { width: 16, height: 16 } ), Draw_Pic: () => {}, Draw_TransPic: () => {},
		Draw_Character: ( x, y, n ) => text.push( String.fromCharCode( n & 127 ) ), S_LocalSound: () => {}, realtime_get: () => 0, host_time_get: () => 0 } );
	const labels = layout.M_ControllerLayout( common._vid.width, common._vid.height ).labels;
	const touch = ( x, y ) => menu.M_TouchInput( x, y, common._vid.width, common._vid.height );
	const tapLabel = id => { const box = labels.find( x => x.id === id ); touch( box.x + 1, box.y + 1 ); return box; };
	const draw = () => { text = []; pages.M_Controller_Draw(); return text.join( '' ); };
	return { common, menu, pages, vars, profile, labels, touch, tapLabel, draw };
}

Deno.test( 'both games route the first two Controller rows and preserve the Options return', async () => {
	const f = await menuFixture(), gyroMenu = await import( '../src/engine/client/menu_gyro.js' );
	for ( const game of [ 'quake', 'hexen2' ] ) {
		f.profile.GameProfile_Set( game );
		const parent = game === 'quake' ? f.common.m_options : f.common.m_hexen2_options;
		gyroMenu.M_Menu_Gyro_f( parent );
		for ( const [ y, state ] of [ [ 41, f.common.m_controller_customise ], [ 57, f.common.m_controller_test ] ] ) {
			gyroMenu.M_Gyro_Touch( 50, y ); check( f.common.m_state === state, 'shared row opens ' + game );
			f.menu.M_Keydown( keys.K_ESCAPE ); check( f.common.m_state === f.common.m_gyro, 'page returns to Controller' );
		}
		f.menu.M_Keydown( keys.K_ESCAPE ); check( f.common.m_state === parent, 'Controller returns to correct Options' );
	}
} );

Deno.test( 'customise navigation, action scrolling, real binding/config, Default, None, and fixed inputs', async () => {
	const f = await menuFixture(), { M_ControllerActions } = await import( '../src/engine/client/menu_actions.js' );
	const command = await import( '../src/engine/common/cmd.js' ), cli = await import( '../src/engine/client/cl_input.js' );
	f.profile.GameProfile_Set( 'hexen2' );
	f.pages.M_Menu_Controller_f();
	const x = keys.Key_StringToKeynum( 'PAD_X' ); keys.Key_SetBinding( x, '' );
	f.tapLabel( 'button-x' ); check( f.draw().includes( 'Default' ), 'click opens dropdown' );
	// Every action, including the last native Hexen action, is reachable by scrolling.
	const actions = M_ControllerActions();
	for ( let i = 0; i < actions.length + 1; i ++ ) f.menu.M_Keydown( keys.K_DOWNARROW );
	check( f.draw().includes( actions.at( - 1 )[ 1 ] ), 'last action scrolls into view' );
	f.menu.M_Keydown( keys.K_ENTER );
	check( keys.keybindings[ x ] === actions.at( - 1 )[ 0 ], 'last action binds to PAD_X' );
	check( keys.Key_WriteBindings().includes( 'bind "PAD_X" "' + actions.at( - 1 )[ 0 ] + '"' ), 'config writes pad binding' );
	f.tapLabel( 'button-x' ); f.menu.M_Keydown( keys.K_ESCAPE ); check( ! f.draw().includes( '> ' ), 'Escape closes dropdown only' );
	check( f.common.m_state === f.common.m_controller_customise, 'still on customise' );
	// Default (empty string) restores the live fallback binding's label.
	keys.Key_SetBinding( x, '' ); keys.Key_SetBinding( '/'.charCodeAt( 0 ), 'invuse' );
	check( f.pages.M_ControllerActionLabel( f.labels.find( p => p.index === 2 ) ) === 'use inv item', 'live fallback action' );
	f.tapLabel( 'button-x' ); f.menu.M_Keydown( keys.K_DOWNARROW ); f.menu.M_Keydown( keys.K_ENTER );
	check( keys.keybindings[ x ] === ';', 'None is explicit persisted separator' );
	f.tapLabel( 'button-x' ); f.menu.M_Keydown( keys.K_UPARROW ); f.menu.M_Keydown( keys.K_ENTER ); check( keys.keybindings[ x ] === '', 'Default removes binding' );
	// Choose jump from the real action list; execute via the real Key_Event/Cbuf +/- path.
	f.tapLabel( 'button-x' );
	for ( let i = 0; i < actions.findIndex( a => a[ 0 ] === '+jump' ) + 2; i ++ ) f.menu.M_Keydown( keys.K_DOWNARROW );
	f.menu.M_Keydown( keys.K_ENTER );
	command.Cbuf_Init(); if ( ! command.Cmd_Exists( '+jump' ) ) cli.CL_InitInput(); keys.Key_Init(); keys.Key_ClearStates();
	keys.set_key_dest( keys.key_game ); keys.Key_Event( x, true, 'pad' ); command.Cbuf_Execute(); check( cli.in_jump.state & 1, '+jump executes' );
	keys.Key_Event( x, false, 'pad' ); command.Cbuf_Execute(); check( ! ( cli.in_jump.state & 1 ), '-jump executes' );
	f.pages.M_Menu_Controller_f();
	// Spatial arrows: LT -> right RT -> down RB. Fixed axes cannot open a dropdown.
	f.menu.M_Keydown( keys.K_RIGHTARROW ); f.menu.M_Keydown( keys.K_DOWNARROW ); f.menu.M_Keydown( keys.K_ENTER );
	f.menu.M_Keydown( keys.K_DOWNARROW ); f.menu.M_Keydown( keys.K_ENTER );
	check( keys.keybindings[ keys.K_PAD_RB ] === ';', 'spatial right/down select RB' );
	f.tapLabel( 'left-move' ); check( ! f.draw().includes( 'Default' ), 'analogue movement is fixed' );
	const mode = await import( '../src/newer/mode.js' );
	if ( ! f.vars.Cvar_FindVar( 'joy_wheel' ) ) f.vars.Cvar_RegisterVariable( new f.vars.cvar_t( 'joy_wheel', '1', true ) );
	if ( ! f.vars.Cvar_FindVar( 'r_hdr' ) ) f.vars.Cvar_RegisterVariable( new f.vars.cvar_t( 'r_hdr', '0' ) );
	const previous = f.vars.Cvar_VariableValue( 'r_hdr' );
	try {
		f.vars.Cvar_SetValue( 'r_hdr', 1 ); f.vars.Cvar_SetValue( 'joy_wheel', 1 );
		check( input.IN_GamepadWheelFixed(), 'Newer wheel eligible' );
		keys.Key_SetBinding( keys.K_PAD_LSTICK, '+attack' ); f.tapLabel( 'left-stick' );
		check( f.pages.M_ControllerActionLabel( f.labels.find( p => p.index === 10 ) ) === 'Weapon wheel', 'fixed wheel label' );
		check( ! f.draw().includes( 'Default' ), 'reserved wheel has no dropdown' );
		f.vars.Cvar_SetValue( 'joy_wheel', 0 ); f.tapLabel( 'left-stick' ); check( f.draw().includes( 'Default' ), 'otherwise press is bindable' );
	} finally { f.vars.Cvar_SetValue( 'r_hdr', previous ); f.vars.Cvar_SetValue( 'joy_wheel', 1 ); }
	f.menu.M_Keydown( keys.K_ESCAPE ); f.menu.M_Keydown( keys.K_ESCAPE );
	for ( const name of names ) keys.Key_SetBinding( keys.Key_StringToKeynum( 'PAD_' + name ), '' );
} );

Deno.test( 'Test swallows every pad menu key, B hold cancels/reset/reconnects correctly, keyboard and click leave', async () => {
	const f = await menuFixture(); let pads = [], events = [];
	Object.defineProperty( navigator, 'getGamepads', { value: () => pads, configurable: true } );
	const makePad = id => ( { index: 0, id, connected: true, mapping: 'standard', axes: [ 0, 0, 0, 0 ], buttons: Array.from( { length: 17 }, () => ( { pressed: false, value: 0 } ) ) } );
	let pad = makePad( 'DualSense' ); pads = [ pad ];
	const poll = () => input.IN_GamepadPoll( null, ( key, down ) => events.push( [ key, down ] ) );
	input.IN_GamepadRelease( () => {} ); f.pages.M_Menu_Controller_f( true );
	for ( const index of [ 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16 ] ) {
		pad.buttons[ index ] = { pressed: true, value: 1 }; poll(); f.pages.M_ControllerTest_Update( 100 );
		check( f.common.m_state === f.common.m_controller_test, 'test retains button ' + index );
	}
	check( events.length === 0, 'no mapped menu key dispatched, including RT mouse1' );
	const frozen = input.IN_GamepadState(); check( frozen.pad.buttons[ 7 ].value === 1, 'raw trigger retained' );
	pad.buttons[ 7 ].value = .2; check( frozen.pad.buttons[ 7 ].value === 1, 'caller cannot mutate snapshot through source' );
	pad.buttons[ 1 ].pressed = true; poll(); check( f.pages.M_ControllerTest_Update( 1000 ) === 0, 'B starts hold' );
	check( f.pages.M_ControllerTest_Update( 1749 ) > .49, 'visible hold progress' );
	pad.buttons[ 1 ].pressed = false; poll(); check( f.pages.M_ControllerTest_Update( 1800 ) === 0, 'release cancels' );
	pad.buttons[ 1 ].pressed = true; poll(); f.pages.M_ControllerTest_Update( 2000 );
	pads = []; poll(); f.pages.M_ControllerTest_Update( 4000 ); check( f.common.m_state === f.common.m_controller_test, 'disconnect cannot finish hold' );
	pad = makePad( 'DualSense replacement' ); pad.buttons[ 1 ].pressed = true; pads = [ pad ]; poll(); f.pages.M_ControllerTest_Update( 5000 );
	f.pages.M_ControllerTest_Update( 6499 ); check( f.common.m_state === f.common.m_controller_test, 'less than 1.5 seconds stays' );
	f.pages.M_ControllerTest_Update( 6500 ); check( f.common.m_state === f.common.m_gyro, '1.5s returns' );
	// Consumed held B must not immediately escape the parent too.
	events = []; poll(); check( events.length === 0, 'held exit button suppressed until released' );
	f.pages.M_Menu_Controller_f( true ); f.menu.M_Keydown( keys.K_ESCAPE ); check( f.common.m_state === f.common.m_gyro, 'keyboard Escape immediate' );
	f.pages.M_Menu_Controller_f( true ); f.touch( 100, 100 ); check( f.common.m_state === f.common.m_gyro, 'click immediate' );
	pad = makePad( 'Pro Controller' ); pads = [ pad ]; f.pages.M_Menu_Controller_f( true );
	pad.buttons[ 0 ].pressed = true; poll(); f.pages.M_ControllerTest_Update( 7000 ); f.pages.M_ControllerTest_Update( 8500 );
	check( f.common.m_state === f.common.m_gyro, 'Nintendo labelled B position leaves' );
	pads = []; input.IN_GamepadRelease( () => {} );
} );

Deno.test( 'read-only gyro selection ignores orphan pairing exactly as aiming does', () => {
	gyro.Gyro_Remove(); gyro.Gyro_Init();
	const sony = { index: 0, id: 'DualSense', connected: true, mapping: 'standard', buttons: [] };
	const nintendo = { ...sony, index: 1, id: 'Pro Controller' }, pads = [ sony, nintendo ];
	gyro.Gyro_Sample( 'sony', { pitch: 10, yaw: 20, roll: 30 }, { family: 'dualsense', padKey: '9|Disconnected DualSense' }, 100 );
	gyro.Gyro_Sample( 'switch', { pitch: 40, yaw: 50, roll: 60 }, { family: 'switch' }, 100 );
	check( gyro.Gyro_Rate( sony, pads, 110 )?.pitch === 10, 'orphan pairing ignored without a preceding aim frame' );
	const angles = [ 0, 0, 0 ]; gyro.Gyro_Move( angles, sony, pads, .01, true, 110 );
	check( gyro.Gyro_Move( angles, sony, pads, .01, true, 110 ) && Math.abs( angles[ 0 ] + .1 ) < 1e-8, 'same source aims' );
	gyro.Gyro_Remove();
} );

Deno.test( 'real pad bindings execute +/- commands and the raw Newer wheel keeps the left-stick press', async () => {
	const f = await menuFixture(), cmd = await import( '../src/engine/common/cmd.js' ), cli = await import( '../src/engine/client/cl_input.js' );
	const hooks = await import( '../src/engine/common/hooks.js' );
	const client = await import( '../src/engine/client/client.js' );
	let pads = [], wheel = 0;
	Object.defineProperty( navigator, 'getGamepads', { value: () => pads, configurable: true } );
	input.IN_GamepadRelease( () => {} ); keys.Key_ClearStates(); keys.set_key_dest( keys.key_game ); client.cls.demoplayback = false;
	cmd.Cbuf_Init(); if ( ! cmd.Cmd_Exists( '+jump' ) ) cli.CL_InitInput();
	const pad = { index: 0, id: 'Xbox', connected: true, mapping: 'standard', axes: [ 0, 0, 0, 0 ], buttons: Array.from( { length: 17 }, () => ( { pressed: false, value: 0 } ) ) };
	pads = [ pad ];
	keys.Key_SetBinding( keys.K_PAD_X, '+jump' );
	pad.buttons[ 2 ] = { pressed: true, value: 1 }; input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
	check( cli.in_jump.state & 1, 'input poll runs PAD_X +jump' );
	keys.set_key_dest( keys.key_menu ); pad.buttons[ 2 ] = { pressed: false, value: 0 }; input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
	check( ! ( cli.in_jump.state & 1 ), 'game press releases its own pad key after menu opens' );
	keys.Key_SetBinding( keys.K_PAD_B, ';' ); pad.buttons[ 1 ] = { pressed: true, value: 1 };
	const menuEvents = []; input.IN_GamepadPoll( null, ( key, down ) => menuEvents.push( [ key, down ] ) );
	check( menuEvents.some( ( [ key, down ] ) => key === keys.K_ESCAPE && down ), 'None never removes menu Back' );
	pad.buttons[ 1 ].pressed = false; input.IN_GamepadPoll( null, () => {} ); keys.set_key_dest( keys.key_game );
	const table = Object.fromEntries( Object.entries( hooks ).filter( ( [ name ] ) => ! name.startsWith( 'Hooks_' ) ) );
	const previousHDR = f.vars.Cvar_VariableValue( 'r_hdr' );
	try {
		hooks.Hooks_Install( { ...table, R_ControllerPoll: raw => { if ( raw.buttons[ 10 ].pressed ) wheel ++; return false; } } );
		f.vars.Cvar_SetValue( 'r_hdr', 1 ); f.vars.Cvar_SetValue( 'joy_wheel', 1 );
		keys.Key_SetBinding( keys.K_PAD_LSTICK, '+jump' ); pad.buttons[ 10 ] = { pressed: true, value: 1 };
		input.IN_GamepadPoll( { forwardmove: 0, sidemove: 0, upmove: 0 } ); cmd.Cbuf_Execute();
		check( wheel === 1 && ! ( cli.in_jump.state & 1 ), 'wheel sees raw press and reserved binding does not run' );
		pad.buttons[ 10 ].pressed = false; input.IN_GamepadPoll( null );
		f.vars.Cvar_SetValue( 'joy_wheel', 0 ); pad.buttons[ 10 ].pressed = true; input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
		check( cli.in_jump.state & 1, 'disabled wheel leaves stick press bindable' );
		pad.buttons[ 10 ].pressed = false; input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
		cmd.Cmd_ExecuteString( 'unbindall' ); check( ! keys.keybindings[ keys.K_PAD_LSTICK ] && ! keys.keybindings[ keys.K_PAD_B ], 'unbindall clears overrides including None' );
	} finally {
		hooks.Hooks_Install( table ); f.vars.Cvar_SetValue( 'r_hdr', previousHDR ); f.vars.Cvar_SetValue( 'joy_wheel', 1 );
		pads = []; input.IN_GamepadRelease( () => {} );
	}
} );

Deno.test( 'changing a held dedicated pad binding releases its old action and waits for physical release', async () => {
	const f = await menuFixture(), cmd = await import( '../src/engine/common/cmd.js' ), cli = await import( '../src/engine/client/cl_input.js' );
	let pads = []; Object.defineProperty( navigator, 'getGamepads', { value: () => pads, configurable: true } );
	input.IN_GamepadRelease( () => {} ); keys.Key_ClearStates(); keys.set_key_dest( keys.key_game );
	cmd.Cbuf_Init(); if ( ! cmd.Cmd_Exists( '+jump' ) ) cli.CL_InitInput();
	const pad = { index: 0, id: 'Xbox', connected: true, mapping: 'standard', axes: [], buttons: Array.from( { length: 17 }, () => ( { pressed: false, value: 0 } ) ) };
	pads = [ pad ]; keys.Key_SetBinding( keys.K_PAD_A, '+jump' );
	pad.buttons[ 0 ] = { pressed: true, value: 1 }; input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
	check( cli.in_jump.state & 1, 'old pad action held' );
	keys.Key_SetBinding( keys.K_PAD_A, '+jump' ); cmd.Cbuf_Execute();
	check( keys.Key_IsDown( keys.K_PAD_A ) && ( cli.in_jump.state & 1 ), 'same binding preserves held action' );
	keys.Key_SetBinding( keys.K_SPACE, '+jump' ); keys.Key_Event( keys.K_SPACE, true, 'kbd' ); cmd.Cbuf_Execute();
	f.pages.M_Menu_Controller_f();
	keys.Key_SetBinding( keys.K_PAD_A, '+attack' ); cmd.Cbuf_Execute();
	check( ! keys.Key_IsDown( keys.K_PAD_A ) && ( cli.in_jump.state & 1 ), 'pad release preserves the keyboard-held old action' );
	keys.Key_Event( keys.K_SPACE, false, 'kbd' ); cmd.Cbuf_Execute();
	check( ! ( cli.in_jump.state & 1 ), 'rebinding released old +jump before replacing the binding' );
	keys.set_key_dest( keys.key_game ); input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
	check( ! ( cli.in_attack.state & 1 ), 'still-held button does not start the replacement action' );
	keys.Key_SetBinding( keys.K_CTRL, '+attack' ); keys.Key_Event( keys.K_CTRL, true, 'kbd' ); cmd.Cbuf_Execute();
	pad.buttons[ 0 ] = { pressed: false, value: 0 }; input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
	check( cli.in_attack.state & 1, 'physical release preserves keyboard-held replacement action' );
	keys.Key_Event( keys.K_CTRL, false, 'kbd' ); cmd.Cbuf_Execute();
	pad.buttons[ 0 ] = { pressed: true, value: 1 }; input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
	check( cli.in_attack.state & 1, 'a fresh press uses the replacement' );
	pad.buttons[ 0 ] = { pressed: false, value: 0 }; input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
	check( ! ( cli.in_attack.state & 1 ), 'replacement releases normally' );
	for ( const empty of [ ';', '' ] ) {
		keys.Key_SetBinding( keys.K_PAD_A, '+jump' ); pad.buttons[ 0 ] = { pressed: true, value: 1 };
		input.IN_GamepadPoll( null ); cmd.Cbuf_Execute(); check( cli.in_jump.state & 1, 'action before None/Default' );
		keys.Key_SetBinding( keys.K_PAD_A, empty ); cmd.Cbuf_Execute(); check( ! ( cli.in_jump.state & 1 ), 'None/Default releases old action' );
		input.IN_GamepadPoll( null ); cmd.Cbuf_Execute(); check( ! ( cli.in_jump.state & 1 ), 'None/Default waits for fresh press' );
		pad.buttons[ 0 ] = { pressed: false, value: 0 }; input.IN_GamepadPoll( null ); cmd.Cbuf_Execute();
	}
	keys.Key_SetBinding( keys.K_PAD_A, '' ); pads = []; input.IN_GamepadRelease( () => {} );
} );

Deno.test( 'Test shows a label and leader only while its input is pressed or pushed', async () => {
	const f = await menuFixture(); let pads = [];
	Object.defineProperty( navigator, 'getGamepads', { value: () => pads, configurable: true } );
	const pad = { index: 0, id: 'Pro Controller Extended Gamepad', connected: true, mapping: 'standard', axes: [ 0, 0, 0, 0 ], buttons: Array.from( { length: 17 }, () => ( { pressed: false, value: 0 } ) ) };
	pads = [ pad ]; input.IN_GamepadRelease( () => {} );
	f.pages.M_Menu_Controller_f( true ); input.IN_GamepadPoll( null, () => {} );
	const idle = f.draw();
	check( ! idle.includes( 'Move (fixed)' ) && ! idle.includes( 'ZR' ), 'nothing in use: no input labels' );
	pad.buttons[ 7 ] = { pressed: true, value: 0.8 }; pad.axes = [ 0.5, 0, 0, 0 ]; input.IN_GamepadPoll( null, () => {} );
	const busy = f.draw();
	check( busy.includes( 'ZR' ) && busy.includes( 'Move (fixed)' ), 'the pulled trigger and pushed stick show' );
	check( ! busy.includes( 'Look (fixed)' ), 'the untouched right stick stays hidden' );
	const inputs = f.labels;
	check( f.pages.M_ControllerInputActive( inputs.find( x => x.id === 'right-trigger' ), { buttons: [ , , , , , , , { pressed: false, value: 0.1 } ] } ) === false, 'a trigger resting under a fifth is idle' );
	f.menu.M_Keydown( keys.K_ESCAPE ); f.pages.M_Menu_Controller_f( false ); input.IN_GamepadPoll( null, () => {} );
	check( f.draw().includes( 'Look (fixed)' ), 'Customise still labels every input' );
	f.menu.M_Keydown( keys.K_ESCAPE ); f.menu.M_Keydown( keys.K_ESCAPE );
	pads = []; input.IN_GamepadRelease( () => {} );
} );
