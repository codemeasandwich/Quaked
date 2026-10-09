// Gamepads (card [36]) through the browser's Gamepad API (stubbed here): each button's key goes down and up with it, the
// same key even when a menu opens in between; a key two buttons hold goes up with the last; a disconnect or a change of
// controller releases only the controller's own keys; the controller playing stays while connected, a standard one is
// preferred; triggers at half travel; sticks with deadzones move and look in the game only; X changes weapon.
await import( '../src/gl_rsurf.js' );
const input = await import( '../src/in_web.js' ), keys = await import( '../src/keys.js' );
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
	pads = []; poll(); same( events.length, 0, 'no controller ever: no key events at all' );
} );

Deno.test( 'the controller playing stays while connected; a standard layout is preferred to a nonstandard one', () => {
	reset(); const odd = pad( 0, { mapping: '', id: 'Odd' } ), std = pad( 1 );
	pads = [ odd, std ]; same( poll()?.id, 'Pad 1', 'standard preferred' );
	pads = [ odd ]; same( poll()?.id, 'Odd', 'only the nonstandard one: it is used' );
	pads = [ odd, std ]; same( poll()?.id, 'Odd', 'and kept while it stays connected' );
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
