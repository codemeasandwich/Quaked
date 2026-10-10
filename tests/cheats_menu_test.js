// Options > Cheats (card [L1]): the game's own cheat commands as toggles and quick gives, only in a local single-player game.
// Public menu input (keys and touch) and the menu's own drawing; the server is a stand-in for the state the menu reads.
await import( '../src/engine/render/gl_rsurf.js' );
const cmd = await import( '../src/engine/common/cmd.js' ), menu = await import( '../src/engine/client/menu.js' ), keys = await import( '../src/engine/client/keys.js' ), draw = await import( '../src/engine/render/gl_draw.js' ), cvar = await import( '../src/engine/common/cvar.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( JSON.stringify( a ) === JSON.stringify( b ), `${m}: ${JSON.stringify( a )} != ${JSON.stringify( b )}` );
for ( const name of [ 'deathmatch', 'coop' ] ) if ( ! cvar.Cvar_FindVar( name ) ) cvar.Cvar_RegisterVariable( new cvar.cvar_t( name, '0' ) );

Deno.test( 'Options lists Cheats last; it opens the Cheats menu; Escape returns to Options', () => {

	const oldWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' ); Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } } );
	try {

		cmd.Cbuf_Init(); cmd.Cmd_Init(); keys.Key_Init(); menu.M_Init();
		const glyphs = [];
		menu.M_SetExternals( { key_dest_set: keys.set_key_dest, key_dest_get: () => keys.key_dest, cls: { demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 }, Draw_CachePic: () => ( { width: 0, height: 0 } ), Draw_TransPic: () => {}, Draw_Pic: () => {}, Draw_Character: ( x, y, code ) => glyphs.push( { x, y, code } ), Draw_FadeScreen: () => {}, S_LocalSound: () => {}, realtime_get: () => 0 } );
		const dx = ( draw.Draw_GetVirtualWidth() - 320 ) >> 1, dy = ( draw.Draw_GetVirtualHeight() - 200 ) >> 1;
		cmd.Cmd_ExecuteString( 'menu_options' ); glyphs.length = 0; menu.M_Draw();
		const text = y => { let out = '', last = null; for ( const g of glyphs.filter( g => g.y === y + dy ).sort( ( a, b ) => a.x - b.x ) ) { if ( last !== null && g.x - last > 8 ) out += ' '; out += String.fromCharCode( g.code >= 128 ? g.code - 128 : g.code ); last = g.x; } return out.trim(); };
		same( text( 32 + 17 * 8 ), 'Cheats', 'the last Options row is Cheats' );
		menu.M_Keydown( keys.K_UPARROW ); menu.M_Keydown( keys.K_ENTER ); // up from the first row wraps to the last
		same( menu.m_state, menu.m_cheats, 'Enter on it opens Cheats' );
		menu.M_Keydown( keys.K_ESCAPE ); same( menu.m_state, menu.m_options, 'Escape returns to Options' );
		cmd.Cmd_ExecuteString( 'menu_options' ); menu.M_TouchInput( 201 + dx, 32 + dy + 17 * 8 + 2, draw.Draw_GetVirtualWidth(), draw.Draw_GetVirtualHeight() ); same( menu.m_state, menu.m_cheats, 'a tap on the row opens Cheats' );

	} finally { if ( oldWindow ) Object.defineProperty( globalThis, 'window', oldWindow ); else delete globalThis.window; }

} );

Deno.test( 'the cheats run the game\'s own commands, show their state, say when one was used, and refuse outside a single-player game', () => {

	const oldWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' ); Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } } );
	try {

		const commands = [], glyphs = [], player = { v: { flags: 0, movetype: 3 }, _cheatPowers: 0 }, server = { active: true, name: 'e1m1', edicts: [ {}, player ] }, svs = { maxclients: 1 };
		cmd.Cbuf_Init(); cmd.Cmd_Init(); keys.Key_Init(); menu.M_Init();
		for ( const name of [ 'god', 'noclip', 'notarget', 'fly', 'impulse', 'give', 'cheat_power', 'cheat_weapons' ] ) cmd.Cmd_AddCommand( name, () => commands.push( [ name, ...Array.from( { length: cmd.Cmd_Argc() - 1 }, ( _, i ) => cmd.Cmd_Argv( i + 1 ) ) ].join( ' ' ) ) );
		menu.M_SetExternals( { key_dest_set: keys.set_key_dest, key_dest_get: () => keys.key_dest, cls: { demonum: - 1 }, sv: server, svs, Draw_CachePic: () => ( { width: 0, height: 0 } ), Draw_TransPic: () => {}, Draw_Pic: () => {}, Draw_Character: ( x, y, code ) => glyphs.push( { x, y, code } ), Draw_FadeScreen: () => {}, S_LocalSound: () => {}, realtime_get: () => 0 } );
		const dx = ( draw.Draw_GetVirtualWidth() - 320 ) >> 1, dy = ( draw.Draw_GetVirtualHeight() - 200 ) >> 1, w = draw.Draw_GetVirtualWidth(), h = draw.Draw_GetVirtualHeight();
		const text = y => { let out = '', last = null; for ( const g of glyphs.filter( g => g.y === y + dy ).sort( ( a, b ) => a.x - b.x ) ) { if ( last !== null && g.x - last > 8 ) out += ' '; out += String.fromCharCode( g.code >= 128 ? g.code - 128 : g.code ); last = g.x; } return out.trim(); }; // (spaces are not drawn: a gap is one)
		const screen = () => { glyphs.length = 0; menu.M_Draw(); return menu.CHEATS.map( ( c, i ) => text( 48 + i * 8 ) ); };
		const status = () => { screen(); return text( 48 + menu.CHEATS.length * 8 + 16 ); }; // (draws first: the note is read from the frame)
		const open = () => { cmd.Cmd_ExecuteString( 'menu_options' ); menu.M_TouchInput( 201 + dx, 32 + dy + 17 * 8 + 2, w, h ); check( menu.m_state === menu.m_cheats, 'Cheats opened' ); };
		const run = () => { cmd.Cbuf_Execute(); const out = commands.slice(); commands.length = 0; return out; };
		same( menu.CHEATS.map( c => c.command ), [ 'noclip', 'notarget', 'fly', 'cheat_power ring', 'cheat_power quad', 'cheat_power pentagram', 'cheat_weapons', 'give h 100' ], 'the commands, God mode gone' );

		open(); let rows = screen();
		same( rows.slice( 0, 6 ), [ 'No clip off', 'No target off', 'Fly off', 'Invisibility (Ring) off', 'Invincibility (Quad) off', 'Invulnerability (Pentagram) off' ], 'the switches start off' ); same( rows.slice( 6 ), [ 'All weapons and ammo', 'Full health' ], 'the quick gives' );
		check( glyphs.filter( g => g.y - dy >= 48 ).every( g => g.x - dx >= 44 && g.x - dx + 8 <= 320 ), 'every row is clear of the plaque (left of x 44) and fits the 320-pixel menu' );
		check( status().startsWith( 'Cheats used in this game: no' ), 'none used yet: ' + status() );
		// switches: Enter, Right and Left all apply the command; the state read from the player
		menu.M_Keydown( keys.K_ENTER ); same( run(), [ 'noclip' ], 'Enter on No clip sends noclip' ); check( status().startsWith( 'Cheats used in this game: yes' ), 'now used: ' + status() );
		player.v.movetype = 8; same( screen()[ 0 ], 'No clip on', 'noclip shown from the movement type' );
		menu.M_Keydown( keys.K_RIGHTARROW ); menu.M_Keydown( keys.K_LEFTARROW ); same( run(), [ 'noclip', 'noclip' ], 'Right and Left apply too' );
		menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_ENTER ); same( run(), [ 'notarget' ], 'notarget' ); player.v.flags |= 128; same( screen()[ 1 ], 'No target on', 'notarget shown' );
		menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_ENTER ); same( run(), [ 'fly' ], 'fly' ); player.v.movetype = 5; same( screen()[ 2 ], 'Fly on', 'fly shown' );
		for ( const [ row, name, bit ] of [ [ 3, 'ring', 1 ], [ 4, 'quad', 2 ], [ 5, 'pentagram', 4 ] ] ) {
			menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_ENTER ); same( run(), [ 'cheat_power ' + name ], 'row ' + row + ' switches the ' + name );
			player._cheatPowers |= bit; check( screen()[ row ].endsWith( ' on' ), name + ' shown on' ); player._cheatPowers &= ~ bit; check( screen()[ row ].endsWith( ' off' ), name + ' shown off' );
			menu.M_Keydown( keys.K_RIGHTARROW ); same( run(), [ 'cheat_power ' + name ], 'the arrows switch it too' );
		}
		for ( const [ row, want ] of [ [ 6, 'cheat_weapons' ], [ 7, 'give h 100' ] ] ) { menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_ENTER ); same( run(), [ want ], 'row ' + row + ' sends ' + want ); }
		menu.M_Keydown( keys.K_RIGHTARROW ); menu.M_Keydown( keys.K_LEFTARROW ); same( run(), [], 'the arrows do not fire a give; Enter and a tap do' );
		menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_ENTER ); same( run(), [ 'noclip' ], 'the cursor wraps from the last row to the first' );
		menu.M_Keydown( keys.K_UPARROW ); menu.M_Keydown( keys.K_ENTER ); same( run(), [ 'give h 100' ], 'and up from the first to the last' );
		// touch
		menu.M_TouchInput( 120 + dx, 48 + dy + 2 * 8 + 2, w, h ); same( run(), [ 'fly' ], 'a tap on a row applies it' );
		// a different game: the "used" note starts again
		server.edicts = [ {}, player ]; check( status().startsWith( 'Cheats used in this game: no' ), 'a new game (a new entity list, here on the same map) starts the note again: ' + status() );
		menu.M_Keydown( keys.K_ENTER ); run(); check( status().startsWith( 'Cheats used in this game: yes' ), 'used again in the new game' ); server.name = 'e1m2'; check( status().startsWith( 'Cheats used in this game: yes' ), 'a map name alone does not reset it: ' + status() );
		// outside a single-player game
		for ( const [ label, setup, undo ] of [ [ 'multiplayer', () => { svs.maxclients = 4; }, () => { svs.maxclients = 1; } ], [ 'no game', () => { server.active = false; }, () => { server.active = true; } ],
			[ 'deathmatch', () => cvar.Cvar_SetValue( 'deathmatch', 1 ), () => cvar.Cvar_SetValue( 'deathmatch', 0 ) ], [ 'coop', () => cvar.Cvar_SetValue( 'coop', 1 ), () => cvar.Cvar_SetValue( 'coop', 0 ) ] ] ) {

			setup(); screen(); menu.M_Keydown( keys.K_ENTER ); same( run(), [], label + ': nothing is sent' );
			check( status().startsWith( 'Cheats need a single player game' ), label + ': the menu says so: ' + status() ); same( screen().slice( 0, 6 ).every( r => r.endsWith( 'off' ) ), true, label + ': switches read off' ); undo();

		}
		menu.M_Keydown( keys.K_ESCAPE ); same( menu.m_state, menu.m_options, 'Escape returns to Options' );

	} finally { if ( oldWindow ) Object.defineProperty( globalThis, 'window', oldWindow ); else delete globalThis.window; }

} );
