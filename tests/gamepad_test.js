// Gamepads (card [36]) through the browser's Gamepad API (stubbed here): each button's key goes down and up with it, the
// same key even when a menu opens in between; a key two buttons hold goes up with the last; a disconnect or a change of
// controller releases only the controller's own keys; the controller playing stays while connected, a standard one is
// preferred; triggers at half travel; sticks with deadzones move and look in the game only; X changes weapon.
await import( '../src/engine/render/gl_rsurf.js' );
const input = await import( '../src/platform/in_web.js' ), keys = await import( '../src/engine/client/keys.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

let pads = [];
if ( ! globalThis.navigator ) Object.defineProperty( globalThis, 'navigator', { value: {}, configurable: true } ); Object.defineProperty( globalThis.navigator, 'getGamepads', { value: () => pads, configurable: true } );
const pad = ( index, { mapping = 'standard', id = 'Pad ' + index } = {} ) => ( { index, id, mapping, connected: true, axes: [ 0, 0, 0, 0 ], buttons: Array.from( { length: 17 }, () => ( { pressed: false, value: 0 } ) ) } );
const press = ( p, i, on = true, value = on ? 1 : 0 ) => { p.buttons[ i ] = { pressed: on, value }; };
let events = [];
const sink = ( key, down ) => events.push( ( down ? '+' : '-' ) + key );
const poll = ( cmd = null ) => { events = []; return input.IN_GamepadPoll( cmd, sink ); };
const { K_SPACE, K_ENTER, K_ESCAPE, K_MOUSE1, K_TAB } = keys;
const reset = () => { pads = []; poll(); keys.set_key_dest( keys.key_game ); };

Deno.test( 'each button releases the key it pressed, even when a menu opens in between; a key two buttons hold goes up with the last', () => {
	reset(); const p = pad( 0 ); pads = [ p ];
	press( p, 0 ); poll(); same( events.join(), '+' + K_SPACE, 'A in the game: jump (Space)' );
	keys.set_key_dest( keys.key_menu ); press( p, 0, false ); poll(); same( events.join(), '-' + K_SPACE, 'let go in a menu: Space comes up (not Enter)' );
	press( p, 0 ); poll(); same( events.join(), '+' + K_ENTER, 'A in a menu: Enter' ); press( p, 0, false ); poll(); same( events.join(), '-' + K_ENTER, 'and up' );
	keys.set_key_dest( keys.key_game );
	press( p, 1 ); poll(); press( p, 9 ); poll(); same( events.join(), '', 'B then Start: Escape is already down' );
	press( p, 1, false ); poll(); same( events.join(), '', 'B let go, Start still held: Escape stays down' );
	press( p, 9, false ); poll(); same( events.join(), '-' + K_ESCAPE, 'Start let go: Escape up' );
	press( p, 2 ); poll(); same( events.join(), '+' + '/'.charCodeAt( 0 ), 'X: change weapon (the default "/" binding, impulse 10)' ); press( p, 2, false ); poll();
	press( p, 3 ); poll(); same( events.join(), '+' + K_TAB, 'Y: scores' ); press( p, 3, false ); poll();
} );

Deno.test( 'triggers at half travel; a disconnect or another controller taking over releases only the controller\'s own keys', () => {
	reset(); const p = pad( 0 ), q = pad( 1 ); pads = [ p, q ];
	press( p, 7, true, .4 ); poll(); same( events.join(), '', 'right trigger at 0.4: not yet' );
	press( p, 7, true, .6 ); poll(); same( events.join(), '+' + K_MOUSE1, 'at 0.6: fire' );
	press( p, 0 ); poll();
	pads = [ q ]; poll(); same( events.sort().join(), [ '-' + K_MOUSE1, '-' + K_SPACE ].sort().join(), 'pad 0 gone: only its fire and jump come up (the keyboard\'s keys are not touched)' );
	press( q, 7 ); poll(); same( events.join(), '+' + K_MOUSE1, 'the other controller plays on, from nothing held' );
	pads = []; poll(); same( events.join(), '-' + K_MOUSE1, 'all gone: its fire comes up' ); poll(); same( events.join(), '', 'and nothing more' );
} );

Deno.test( 'the controller playing stays while connected; a standard layout is preferred to a nonstandard one', () => {
	reset(); const odd = pad( 0, { mapping: '', id: 'Odd' } ), std = pad( 1 );
	pads = [ odd, std ]; same( poll()?.id, 'Pad 1', 'standard preferred' );
	pads = [ odd ]; same( poll()?.id, 'Odd', 'only the nonstandard one: it is used' );
	press( odd, 0 ); poll(); pads = [ odd, std ]; same( poll()?.id, 'Odd', 'kept while it holds a key' );
	press( odd, 0, false ); poll(); same( poll()?.id, 'Pad 1', 'holding nothing, it gives way to the standard pad' );
	reset(); const a = pad( 0 ), b = pad( 1 ); pads = [ a, b ]; same( poll()?.index, 0, 'the first' ); pads = [ b, a ]; same( poll()?.index, 0, 'kept when the list reorders' );
} );

Deno.test( 'sticks: deadzones, then movement and look in the game; nothing in a menu or without a command', () => {
	reset(); const p = pad( 0 ); pads = [ p ];
	const cmd = () => ( { forwardmove: 0, sidemove: 0, upmove: 0 } );
	p.axes = [ .1, - .1, 0, 0 ]; let c = cmd(); poll( c ); same( c.forwardmove, 0, 'inside the deadzone: still' ); same( c.sidemove, 0, 'still sideways' );
	p.axes = [ 1, - 1, 0, 0 ]; c = cmd(); poll( c ); check( c.forwardmove > 0 && c.sidemove > 0, 'full forward and right' );
	p.axes = [ .575, 0, 0, 0 ]; c = cmd(); poll( c ); const half = c.sidemove; p.axes = [ 1, 0, 0, 0 ]; c = cmd(); poll( c );
	check( Math.abs( half / c.sidemove - .5 ) < 1e-9, 'rescaled from the deadzone\'s edge: 0.575 is half (' + half / c.sidemove + ')' );
	keys.set_key_dest( keys.key_menu ); p.axes = [ 1, - 1, 0, 0 ]; c = cmd(); poll( c ); same( c.forwardmove + c.sidemove, 0, 'in a menu: no movement' );
	keys.set_key_dest( keys.key_game );
} );

// review of [36]: through the real Key_Event and bindings, a key the keyboard and the controller both hold stays down
// until both let go; the buttons are read every host frame (IN_Commands), with no level running
Deno.test( 'keyboard and controller on the same key: neither cuts the other (real Key_Event, bindings and buttons)', async () => {
	const cmd = await import( '../src/engine/common/cmd.js' ), cli = await import( '../src/engine/client/cl_input.js' );
	cmd.Cbuf_Init(); if ( ! cmd.Cmd_Exists( '+jump' ) ) cli.CL_InitInput();
	reset(); keys.Key_ClearStates(); keys.Key_SetBinding( K_SPACE, '+jump' ); keys.Key_SetBinding( keys.K_CTRL, '+attack' );
	const run = () => cmd.Cbuf_Execute(), held = b => ( b.state & 1 ) !== 0;
	const p = pad( 0 ); pads = [ p ];
	keys.Key_Event( K_SPACE, true ); run(); check( held( cli.in_jump ), 'keyboard Space: jump held' );
	press( p, 0 ); input.IN_GamepadPoll( null ); run(); press( p, 0, false ); input.IN_GamepadPoll( null ); run();
	check( held( cli.in_jump ), 'pad A tapped while Space is held: still jumping' );
	keys.Key_Event( K_SPACE, false ); run(); check( ! held( cli.in_jump ), 'Space let go: jump released' );
	press( p, 0 ); input.IN_GamepadPoll( null ); run(); keys.Key_Event( K_SPACE, true ); keys.Key_Event( K_SPACE, false ); run();
	check( held( cli.in_jump ), 'Space tapped while pad A is held: still jumping' ); press( p, 0, false ); input.IN_GamepadPoll( null ); run(); check( ! held( cli.in_jump ), 'A let go: released' );
	keys.Key_Event( keys.K_CTRL, true ); press( p, 5 ); input.IN_GamepadPoll( null ); run(); pads = []; input.IN_GamepadPoll( null ); run();
	check( held( cli.in_attack ), 'Ctrl held, the pad (holding RB) disconnects: still firing' ); keys.Key_Event( keys.K_CTRL, false ); run(); check( ! held( cli.in_attack ), 'Ctrl let go: stops' );
} );

Deno.test( 'the buttons are read every host frame, with no level running; WebXR makes the controller let go', async () => {
	const cmd = await import( '../src/engine/common/cmd.js' ), vars = await import( '../src/engine/common/cvar.js' );
	reset(); keys.Key_ClearStates(); cmd.Cbuf_Init();
	if ( ! vars.Cvar_FindVar( 'gp_probe' ) ) vars.Cvar_RegisterVariable( new vars.cvar_t( 'gp_probe', '0' ) );
	keys.Key_SetBinding( '/'.charCodeAt( 0 ), 'gp_probe 7' ); vars.Cvar_SetValue( 'gp_probe', 0 );
	const p = pad( 0 ); pads = [ p ]; press( p, 2 ); input.IN_Commands(); cmd.Cbuf_Execute();
	same( vars.Cvar_VariableValue( 'gp_probe' ), 7, 'X pressed, only the host frame ran (no level, no command built): its binding ran' );
	press( p, 2, false ); input.IN_Commands();
	// held, then WebXR: released at once
	events = []; press( p, 7 ); input.IN_GamepadPoll( null, sink ); input.IN_GamepadRelease( sink ); same( events.join(), '+' + K_MOUSE1 + ',-' + K_MOUSE1, 'fire released when WebXR takes over' );
	reset();
} );

Deno.test( 'look: right stick turns and tilts the view by the look settings; no sticks in a demo; the layout note once; a new id at the same index is a new controller', async () => {
	const host = await import( '../src/engine/server/host.js' ), client = await import( '../src/engine/client/client.js' ), vars = await import( '../src/engine/common/cvar.js' ), cli = await import( '../src/engine/client/cl_input.js' );
	for ( const c of [ cli.cl_yawspeed, cli.cl_pitchspeed, cli.cl_forwardspeed, cli.cl_sidespeed ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
	reset(); const p = pad( 0 ); pads = [ p ]; host.set_host_frametime( .1 );
	const cmd = () => ( { forwardmove: 0, sidemove: 0, upmove: 0 } );
	client.cl.viewangles[ 1 ] = 0; client.cl.viewangles[ 0 ] = 0; p.axes = [ 0, 0, 1, 0 ]; poll( cmd() );
	check( Math.abs( client.cl.viewangles[ 1 ] + cli.cl_yawspeed.value * .1 ) < 1e-6, 'right stick right: turns right by cl_yawspeed x frame time (' + client.cl.viewangles[ 1 ] + ')' );
	p.axes = [ 0, 0, 0, 1 ]; poll( cmd() ); check( client.cl.viewangles[ 0 ] > 0, 'right stick down: looks down' );
	client.cl.viewangles[ 1 ] = 0; client.cls.demoplayback = true; p.axes = [ 1, 1, 1, 0 ]; const c = cmd(); poll( c );
	same( c.forwardmove + c.sidemove + client.cl.viewangles[ 1 ], 0, 'a demo playing: the sticks do nothing' ); client.cls.demoplayback = false;
	reset(); const printed = []; const odd = pad( 0, { mapping: '', id: 'Odd once' } ); pads = [ odd ];
	for ( let i = 0; i < 3; i ++ ) input.IN_GamepadPoll( null, sink, m => printed.push( m ) ); same( printed.length, 1, 'the nonstandard layout is noted once' );
	const fresh = pad( 0, { id: 'Another' } ); press( odd, 0 ); input.IN_GamepadPoll( null, sink ); events = []; pads = [ fresh ]; input.IN_GamepadPoll( null, sink );
	same( events.join(), '-' + K_SPACE, 'a different controller at the same index: the old one\'s keys released' );
	host.set_host_frametime( 0 ); reset();
} );

// card [37c]: in local play across windows every window sees the same controllers; each plays only the one player 1's
// page gave its player (players 2 and up first: player 1 has the keyboard and mouse)
Deno.test( 'in local play player 1\'s page plays only the controller given to player 1', async () => {
	const { Window_Host } = await import( '../src/engine/net/net_window.js' );
	const { sv, svs, client_t } = await import( '../src/engine/server/server.js' );
	const { PadShare_Table } = await import( '../src/platform/pad_share.js' );
	try {
		reset(); const first = pad( 0 ), second = pad( 1 ); pads = [ first ];
		check( Window_Host( 'pads-test' ), 'hosting local play' );
		sv.active = true; svs.maxclients = 2; svs.clients = [ new client_t(), new client_t() ];
		svs.clients[ 0 ].active = svs.clients[ 1 ].active = true; svs.clients[ 0 ].name = 'player'; svs.clients[ 1 ].name = 'Player 2';
		press( first, 0 ); same( poll(), null, 'one controller: it is player 2\'s, so player 1\'s page plays none' ); same( events.join(), '', 'and its A does nothing here' );
		same( JSON.stringify( PadShare_Table() ), JSON.stringify( [ [ '0|Pad 0', 2 ] ] ), 'the assignment: controller 0 to player 2' );
		pads = [ first, second ]; press( second, 0 );
		same( poll()?.index, 1, 'a second controller goes to player 1' ); same( events.join(), '+' + K_SPACE, 'and its A jumps here' );
		same( JSON.stringify( PadShare_Table() ), JSON.stringify( [ [ '0|Pad 0', 2 ], [ '1|Pad 1', 1 ] ] ), 'player 2 keeps controller 0' );
		press( second, 0, false ); poll();
	} finally {
		Window_Host( null ); sv.active = false; svs.maxclients = 1; poll();
	}
} );
