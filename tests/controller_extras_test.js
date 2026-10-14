// The controller as the re-release has it (src/newer/ui/r_controller.js; card T-3faa98e3 item 14,
// docs/controller-2026-10-14.md): holding the left stick's button opens the weapon wheel, the right stick points,
// letting go takes the weapon; the right stick does not turn the view meanwhile; rumble for hurt, a blast and a hard
// landing, never for firing; prompts at a menu's foot when the controller was last used; New Game exactly as before.
// Through the existing controller path (IN_GamepadPoll, with the browser's Gamepad API stubbed) and the public module.
await import( '../src/newer/install.js' );
const input = await import( '../src/platform/in_web.js' ), keys = await import( '../src/engine/client/keys.js' );
const { cl, cls, cl_entities, CSHIFT_DAMAGE } = await import( '../src/engine/client/client.js' );
const cmd = await import( '../src/engine/common/cmd.js' ), cvar = await import( '../src/engine/common/cvar.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const ctl = await import( '../src/newer/ui/r_controller.js' );
const host = await import( '../src/engine/common/host_state.js' );
host.set_host_frametime( 0.016 );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
for ( const v of [ r_hdr, ctl.joy_wheel, ctl.joy_prompts, ctl.joy_rumble ] ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
let pads = [], effects = [];
if ( ! globalThis.navigator ) Object.defineProperty( globalThis, 'navigator', { value: {}, configurable: true } );
Object.defineProperty( globalThis.navigator, 'getGamepads', { value: () => pads, configurable: true } );
const pad = () => ( { index: 0, id: 'Pad', mapping: 'standard', connected: true, axes: [ 0, 0, 0, 0 ], buttons: Array.from( { length: 17 }, () => ( { pressed: false, value: 0 } ) ),
	vibrationActuator: { playEffect: ( type, p ) => { effects.push( { type, ...p } ); return Promise.resolve(); } } } );
const press = ( p, i, on = true ) => { p.buttons[ i ] = { pressed: on, value: on ? 1 : 0 }; };
const command = () => ( { forwardmove: 0, sidemove: 0, upmove: 0 } );
cmd.Cbuf_Init(); cmd.Cmd_Init();
// every impulse the command buffer runs, once registered for the whole file (each test clears it)
const seen = [];
cmd.Cmd_AddCommand( 'impulse', () => seen.push( Number( cmd.Cmd_Argv( 1 ) ) ) );
function frame( p ) { cl.time += 0.016; return input.IN_GamepadPoll( command(), () => {} ); }
function reset() {

	pads = [ pad() ]; effects = [];
	cvar.Cvar_Set( 'r_hdr', '1' ); for ( const v of [ 'joy_wheel', 'joy_prompts', 'joy_rumble' ] ) cvar.Cvar_Set( v, '1' );
	keys.set_key_dest( keys.key_game ); cls.demoplayback = false; cl.intermission = 0; cl.stats[ 0 ] = 100;
	cl.items = 4096 | 1 | 4 | 32; cl.stats[ 6 ] = 20; cl.stats[ 7 ] = 0; cl.stats[ 8 ] = 5; cl.stats[ 9 ] = 0; // axe, shotgun, nailgun (no nails), rocket launcher
	cl.viewangles.fill( 0 ); cl.time = 10; keys.Key_Event( keys.K_SPACE, true, 'pad' ); keys.Key_Event( keys.K_SPACE, false, 'pad' );
	frame(); cmd.Cbuf_Execute(); return pads[ 0 ];

}

Deno.test( 'holding the left stick\'s button opens the wheel; the right stick points; letting go takes that weapon', () => {

	const p = reset(), picks = [];
	const take = ( x, y ) => { press( p, ctl.WHEEL_BUTTON ); frame(); p.axes[ 2 ] = x; p.axes[ 3 ] = y; frame(); const state = ctl.R_WeaponWheelState(); p.axes[ 2 ] = 0; p.axes[ 3 ] = 0; press( p, ctl.WHEEL_BUTTON, false ); return state; };
	check( ! ctl.R_WeaponWheelState().open, 'closed at first' );
	let s = take( 0, - 1 ); same( s.choice, 0, 'up: the axe' );
	s = take( 1, - 1 ); same( s.choice, 1, 'up and right: the shotgun' );
	s = take( 0, 1 ); same( s.choice, 4, 'down: the super nailgun' );
	s = take( - 1, 0 ); same( s.choice, 6, 'left: the rocket launcher' );
	const choices = ctl.R_WeaponWheelChoices();
	same( choices.map( c => c.usable ? 'U' : c.owned ? 'o' : '-' ).join( '' ), 'UU-o--U-', 'what can be used: axe, shotgun, nailgun had but no nails, rocket launcher' );

} );

Deno.test( 'letting go on a weapon takes it (impulse N); on one that cannot be used, or pointing nowhere, nothing', () => {

	const p = reset(); seen.length = 0;
	const pick = ( x, y ) => { press( p, ctl.WHEEL_BUTTON ); frame(); p.axes[ 2 ] = x; p.axes[ 3 ] = y; frame(); p.axes[ 2 ] = p.axes[ 3 ] = 0; press( p, ctl.WHEEL_BUTTON, false ); frame(); cmd.Cbuf_Execute(); };
	pick( - 1, 0 ); same( seen.join(), '7', 'the rocket launcher: impulse 7' );
	pick( 1, 0 ); same( seen.join(), '7', 'right: the nailgun, had but no nails: nothing' );
	pick( 0, 0 ); same( seen.join(), '7', 'let go without pointing: nothing' );

} );

Deno.test( 'while the wheel is open the right stick does not turn the view; closed, it does as before', () => {

	const p = reset();
	p.axes[ 2 ] = 1; frame(); const turned = cl.viewangles[ 1 ];
	check( turned !== 0, 'closed: the right stick turns the view' );
	press( p, ctl.WHEEL_BUTTON ); frame(); const before = cl.viewangles[ 1 ]; frame(); frame();
	same( cl.viewangles[ 1 ], before, 'open: the view stays' );
	press( p, ctl.WHEEL_BUTTON, false ); p.axes[ 2 ] = 0; frame();

} );

Deno.test( 'rumble: hurt, a blast reaching the player and a hard landing; never firing; only from the controller in use', () => {

	const p = reset(); effects.length = 0;
	cl.cshifts[ CSHIFT_DAMAGE ].percent = 0; frame(); cl.cshifts[ CSHIFT_DAMAGE ].percent = 60; frame();
	check( effects.length === 1 && effects[ 0 ].type === 'dual-rumble' && effects[ 0 ].strongMagnitude > 0.5, 'hurt: a strong shake: ' + JSON.stringify( effects ) );
	cl.cshifts[ CSHIFT_DAMAGE ].percent = 50; effects.length = 0; frame(); same( effects.length, 0, 'the flash fading: no new shake' );
	press( p, 7 ); frame(); frame(); press( p, 7, false ); frame(); same( effects.length, 0, 'firing: none' );
	keys.Key_Event( keys.K_SPACE, true, 'kbd' ); keys.Key_Event( keys.K_SPACE, false, 'kbd' );
	cl.cshifts[ CSHIFT_DAMAGE ].percent = 0; frame(); cl.cshifts[ CSHIFT_DAMAGE ].percent = 60; frame(); same( effects.length, 0, 'the keyboard last used: the pad does not shake' );

} );

Deno.test( 'New Game, demos and the switches off: the controller exactly as before', () => {

	for ( const [ name, set ] of [ [ 'New Game', () => cvar.Cvar_Set( 'r_hdr', '0' ) ], [ 'joy_wheel 0', () => cvar.Cvar_Set( 'joy_wheel', '0' ) ], [ 'a demo', () => { cls.demoplayback = true; } ] ] ) {

		const p = reset(); set();
		press( p, ctl.WHEEL_BUTTON ); frame(); check( ! ctl.R_WeaponWheelState().open, name + ': no wheel' );
		press( p, ctl.WHEEL_BUTTON, false ); frame(); cls.demoplayback = false;

	}
	const p = reset(); cvar.Cvar_Set( 'r_hdr', '0' ); effects.length = 0;
	cl.cshifts[ CSHIFT_DAMAGE ].percent = 0; frame(); cl.cshifts[ CSHIFT_DAMAGE ].percent = 60; frame(); same( effects.length, 0, 'New Game: no rumble' );
	cvar.Cvar_Set( 'r_hdr', '1' );

} );

Deno.test( 'in a menu, while the controller was last used, the screen\'s foot says what its buttons do', () => {

	reset(); keys.set_key_dest( keys.key_menu );
	keys.Key_Event( keys.K_DOWNARROW, true, 'pad' ); keys.Key_Event( keys.K_DOWNARROW, false, 'pad' );
	same( ctl.R_ControllerPromptText(), '(A) Select   (B) Back   (D-pad) Move', 'the controller last: the prompts' );
	keys.Key_Event( keys.K_DOWNARROW, true, 'kbd' ); keys.Key_Event( keys.K_DOWNARROW, false, 'kbd' );
	same( ctl.R_ControllerPromptText(), null, 'the keyboard last: none' );
	keys.Key_Event( keys.K_DOWNARROW, true, 'pad' ); keys.Key_Event( keys.K_DOWNARROW, false, 'pad' ); cvar.Cvar_Set( 'r_hdr', '0' );
	same( ctl.R_ControllerPromptText(), null, 'New Game: none' ); cvar.Cvar_Set( 'r_hdr', '1' );
	keys.set_key_dest( keys.key_game ); same( ctl.R_ControllerPromptText(), null, 'in the game: none' );

} );

Deno.test( 'the wheel never sticks open or takes a stale choice: a disconnect, another controller, a gap, the bestiary', async () => {

	const p = reset(); seen.length = 0;
	press( p, ctl.WHEEL_BUTTON ); frame(); p.axes[ 2 ] = - 1; frame(); check( ctl.R_WeaponWheelState().open && ctl.R_WeaponWheelState().choice === 6, 'open, on the rocket launcher' );
	pads = []; frame(); same( ctl.R_WeaponWheelState().open, false, 'disconnected: closed' );
	pads = [ p ]; press( p, ctl.WHEEL_BUTTON, false ); frame(); cmd.Cbuf_Execute(); same( seen.length, 0, 'back, button up: nothing taken' );
	press( p, ctl.WHEEL_BUTTON ); frame(); p.axes[ 2 ] = - 1; frame();
	const q = pad(); q.index = 1; q.id = 'Other'; pads = [ q ]; frame(); cmd.Cbuf_Execute();
	same( ctl.R_WeaponWheelState().open, false, 'another controller took over: closed' ); same( seen.length, 0, 'and nothing taken' );
	pads = [ p ]; frame(); p.axes[ 2 ] = 0; press( p, ctl.WHEEL_BUTTON, false ); frame();
	press( p, ctl.WHEEL_BUTTON ); frame(); p.axes[ 2 ] = - 1; frame(); cl.time += 1; press( p, ctl.WHEEL_BUTTON, false ); frame(); cmd.Cbuf_Execute();
	same( seen.length, 0, 'not looked after for a second: closed, nothing taken' );
	p.axes[ 2 ] = 0; frame();
	// a bestiary encounter takes the controls with the game's clock stopped: the controller path closes the wheel
	// (R_ControllerCancel) on every poll while it does, so a release during it takes nothing afterwards
	const web = ( await import( 'node:fs' ) ).readFileSync( new URL( '../src/platform/in_web.js', import.meta.url ), 'utf8' );
	check( /if \( R_BestiaryInputLocked\(\) \) R_ControllerCancel\(\);\n[^\n]*\n\tconst inMenu/.test( web ), 'the controller path closes the wheel while the bestiary has the controls, before the buttons are read' );
	press( p, ctl.WHEEL_BUTTON ); frame(); p.axes[ 2 ] = - 1; frame(); check( ctl.R_WeaponWheelState().choice === 6, 'open on the rocket launcher' );
	ctl.R_ControllerCancel(); same( ctl.R_WeaponWheelState().open, false, 'cancelled: closed' );
	press( p, ctl.WHEEL_BUTTON, false ); p.axes[ 2 ] = 0; frame(); cmd.Cbuf_Execute();
	same( seen.length, 0, 'released after: nothing taken' );

} );

Deno.test( 'rumble on a blast reaching the player and on a hard landing; a new map forgets the last one', async () => {

	const blast = await import( '../src/newer/render/v_blastshake.js' ), dma = await import( '../src/engine/sound/snd_dma.js' );
	if ( ! cvar.Cvar_FindVar( 'v_blastshake' ) ) cvar.Cvar_RegisterVariable( blast.v_blastshake );
	const p = reset(); cl.worldmodel = { name: 'maps/test.bsp' }; cls.state = 2; cls.signon = 4; cl.paused = false;
	cl.viewentity = 1; cl_entities[ 1 ] = { origin: new Float32Array( 3 ), angles: new Float32Array( 3 ) };
	effects.length = 0; frame(); blast.V_BlastShakeEvent( [ 0, 0, 0 ] ); frame(); frame();
	check( effects.some( e => e.weakMagnitude > 0.5 ), 'a rocket going off beside the player: a shake: ' + JSON.stringify( effects.slice( 0, 2 ) ) );
	// a new map: the clock starts again, and the last map's rumble must not hold the next one back
	effects.length = 0; cl.time = 500; cl.cshifts[ CSHIFT_DAMAGE ].percent = 0; frame(); cl.cshifts[ CSHIFT_DAMAGE ].percent = 60; frame();
	cl.worldmodel = { name: 'maps/next.bsp' }; cl.time = 5; cl.cshifts[ CSHIFT_DAMAGE ].percent = 0; frame(); effects.length = 0;
	cl.cshifts[ CSHIFT_DAMAGE ].percent = 60; frame();
	same( effects.length, 1, 'hurt on the new map: a shake, at once' );
	cl.worldmodel = null;

} );

Deno.test( 'a hard landing (the game\'s land2.wav from the player) shakes the controller; another\'s does not', () => {

	const p = reset(); cl.worldmodel = { name: 'maps/test.bsp' }; cl.viewentity = 1; cl_entities[ 1 ] = { origin: new Float32Array( 3 ), angles: new Float32Array( 3 ) };
	frame(); effects.length = 0;
	ctl.R_ControllerSound( { name: 'player/land2.wav' }, [ 0, 0, 0 ], 1, 1, 2 ); frame(); same( effects.length, 0, 'another player\'s landing: none' );
	ctl.R_ControllerSound( { name: 'player/land.wav' }, [ 0, 0, 0 ], 1, 1, 1 ); frame(); same( effects.length, 0, 'a soft landing: none' );
	ctl.R_ControllerSound( { name: 'player/land2.wav' }, [ 0, 0, 0 ], 1, 1, 1 ); frame();
	check( effects.length === 1 && effects[ 0 ].strongMagnitude >= 0.5, 'the player\'s hard landing: a strong shake: ' + JSON.stringify( effects ) );
	cl.worldmodel = null;

} );
