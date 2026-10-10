// The Multiplayer screen (card [MP1]): Multiplayer from the main menu offers Local (split screen) and Online; Online is
// drawn faded and cannot be chosen (the cursor passes over it, Enter does nothing); Local opens the split-screen
// screen, which says it is being built and goes back on Esc. Natively, the faded row is drawn through Draw_WithAlpha.
const cmd = await import( '../src/engine/common/cmd.js' );
const keys = await import( '../src/engine/client/keys.js' );
const menu = await import( '../src/engine/client/menu.js' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
cmd.Cbuf_Init(); cmd.Cmd_Init(); keys.Key_Init(); menu.M_Init();

Deno.test( 'Multiplayer offers Local and a disabled Online; Local opens split screen; Esc goes back', () => {

	menu.M_Menu_Main_f();
	menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_ENTER ); // Single Player -> Multiplayer
	check( menu.m_state === menu.m_mpchoice, 'the main menu\'s Multiplayer opens the choice' );
	menu.M_Keydown( keys.K_DOWNARROW );
	menu.M_Keydown( keys.K_ENTER );
	check( menu.m_state === menu.m_splitscreen, 'down passes over Online (it cannot be chosen) and Enter opens Local' );
	menu.M_Keydown( keys.K_ESCAPE );
	check( menu.m_state === menu.m_mpchoice, 'Esc goes back to the choice' );
	menu.M_Keydown( keys.K_UPARROW ); menu.M_Keydown( keys.K_ENTER );
	check( menu.m_state === menu.m_splitscreen, 'up passes over Online too' );
	menu.M_Keydown( keys.K_ESCAPE ); menu.M_Keydown( keys.K_ESCAPE );
	check( menu.m_state === menu.m_main, 'Esc again: the main menu' );

} );

Deno.test( 'natively, Online is drawn faded through Draw_WithAlpha and Local at full strength', () => {

	const drawn = [], faded = [];
	let alpha = 1;
	let dest = keys.key_game;
	menu.M_SetExternals( {
		key_dest_set: d => { dest = d; }, key_dest_get: () => dest,
		vid: { width: 320, height: 200 },
		Draw_CachePic: () => ( { width: 8, height: 8, canvas: null } ), Draw_Pic: () => {}, Draw_TransPic: () => {},
		Draw_Character: ( x, y, n ) => drawn.push( { n, alpha } ),
		Draw_WithAlpha: ( a, draw ) => { faded.push( a ); const was = alpha; alpha = a; try { draw(); } finally { alpha = was; } }
	} );
	menu.M_Menu_MultiplayerChoice_f();
	// the menu's draw path looks at the page (the WebGL menu's canvas); without one it draws natively
	const hadWindow = 'window' in globalThis; if ( ! hadWindow ) globalThis.window = globalThis;
	try { menu.M_Draw(); } finally { if ( ! hadWindow ) delete globalThis.window; }
	const text = drawn.map( d => String.fromCharCode( d.n & 127 ) ).join( '' );
	check( text.includes( 'Local (split screen)' ) && text.includes( 'Online' ), `both rows drawn (${text})` );
	check( faded.length === 1 && faded[ 0 ] === 0.4, 'one row faded, to 40%' );
	const onlineAlpha = drawn.filter( d => d.alpha === 0.4 ).map( d => String.fromCharCode( d.n & 127 ) ).join( '' );
	check( onlineAlpha === 'Online', `only Online is faded (${onlineAlpha})` );

} );
