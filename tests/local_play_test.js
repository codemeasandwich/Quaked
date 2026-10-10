// Multiplayer > Local (cards [37a]-[37c]; owner direction 10 Oct 2026: each other player in a window of their own):
// through the public menu, Start runs the commands that host a co-op or deathmatch game for 2 to 4 players and opens
// player 2's window; while hosting, the screen opens the next missing player's window, or says every player is in,
// and ends local play; in a player's own window it says which player it is and leaves. Also the player window's
// address and start-up commands. The browser trial (docs/local-play-2026-10-10.md) covers real windows.
const cmd = await import( '../src/engine/common/cmd.js' );
const keys = await import( '../src/engine/client/keys.js' );
const menu = await import( '../src/engine/client/menu.js' );
const lp = await import( '../src/engine/client/local_play.js' );
const { sv, svs, client_t } = await import( '../src/engine/server/server.js' );
const { Window_Host, Window_HostSession } = await import( '../src/engine/net/net_window.js' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
cmd.Cbuf_Init(); cmd.Cmd_Init(); keys.Key_Init(); menu.M_Init();
let dest = keys.key_game;
menu.M_SetExternals( { key_dest_set: d => { dest = d; }, key_dest_get: () => dest } );

// the commands the menu leaves in the buffer, as they run
const ran = [];
for ( const name of [ 'disconnect', 'windowhost', 'maxplayers', 'coop', 'deathmatch', 'map', 'name', 'color', 'connect' ] )
	cmd.Cmd_AddCommand( name, () => ran.push( [ name, ...Array.from( { length: cmd.Cmd_Argc() - 1 }, ( _, i ) => cmd.Cmd_Argv( i + 1 ) ) ].join( ' ' ) ) );
const run = () => { ran.length = 0; cmd.Cbuf_Execute(); return ran.slice(); };
const opened = [];
lp.LocalPlay_SetOpener( ( url, target, features ) => { opened.push( { url, target, features } ); return null; } );
const press = ( ...list ) => list.forEach( k => menu.M_Keydown( k ) );
const openLocal = () => { menu.M_Menu_MultiplayerChoice_f(); press( keys.K_ENTER ); same( menu.m_state, menu.m_splitscreen, 'Local opens the local play screen' ); };

Deno.test( 'Start hosts the chosen players and mode, then opens player 2\'s window', () => {

	openLocal();
	run();
	press( keys.K_DOWNARROW, keys.K_RIGHTARROW, keys.K_RIGHTARROW, keys.K_RIGHTARROW ); // Players: 2 -> 4 (and no further)
	press( keys.K_DOWNARROW, keys.K_RIGHTARROW ); // Game Type: Deathmatch
	press( keys.K_UPARROW, keys.K_UPARROW, keys.K_ENTER ); // Start local play
	same( menu.m_state, menu.m_none, 'the menu closes' );
	same( dest, keys.key_game, 'into the game' );
	const commands = run();
	const host = commands.filter( c => /^(disconnect|windowhost|maxplayers|coop|deathmatch|map)/.test( c ) );
	const session = /^windowhost ([0-9a-f]{16})$/.exec( host.find( c => /^windowhost [0-9a-f]/.test( c ) ) || '' )?.[ 1 ];
	check( session, 'a new session is hosted: ' + host.join( ' | ' ) );
	same( host.join( ' | ' ), `disconnect | windowhost - | maxplayers 4 | coop 0 | deathmatch 1 | windowhost ${session} | map e1m1`, 'the commands, in order' );
	same( opened.length, 1, 'one window opens (browsers allow one per key press)' );
	check( opened[ 0 ].url.endsWith( `?window=${session}&player=2` ), 'it is player 2\'s, for that session: ' + opened[ 0 ].url );
	check( /noopener/.test( opened[ 0 ].features ) && /popup/.test( opened[ 0 ].features ), 'a popup window with no opener' );
	opened.length = 0;

} );

Deno.test( 'while hosting: open the next missing player\'s window, every player is in, end local play', () => {

	const session = 'abc123';
	check( Window_Host( session ), 'hosting a session' );
	sv.active = true; svs.maxclients = 3; svs.clients = Array.from( { length: 4 }, () => new client_t() );
	svs.clients[ 0 ].active = true; svs.clients[ 0 ].name = 'player';
	svs.clients[ 1 ].active = true; svs.clients[ 1 ].name = 'Player 3'; // player 3's window is in, player 2's is not
	check( lp.LocalPlay_Hosting(), 'the page is hosting' );
	same( lp.LocalPlay_NextPlayer(), 2, 'player 2 is the one missing' );
	openLocal();
	press( keys.K_ENTER );
	same( opened.length, 1, 'Enter on the first row opens a window' );
	check( opened[ 0 ].url.endsWith( '?window=abc123&player=2' ), 'player 2\'s: ' + opened[ 0 ].url );
	same( menu.m_state, menu.m_splitscreen, 'the screen stays up to open more' );

	svs.clients[ 2 ].active = true; svs.clients[ 2 ].name = 'Player 2';
	same( lp.LocalPlay_NextPlayer(), null, 'with three of three in, nobody is missing' );
	press( keys.K_ENTER );
	same( opened.length, 1, 'and "Every player is in" opens nothing' );

	run();
	press( keys.K_DOWNARROW, keys.K_ENTER ); // End local play
	same( run().join( ' | ' ), 'disconnect | windowhost - | maxplayers 1', 'ending: the server stops, the session closes, one player again' );
	same( menu.m_state, menu.m_main, 'back to the main menu' );
	opened.length = 0;
	sv.active = false; svs.maxclients = 1; Window_Host( null );

} );

Deno.test( 'a player\'s window: its address, its start-up commands, and Leave', () => {

	same( lp.LocalPlay_PlayerWindow( '?window=abc123&player=3' )?.player, 3, 'a player window address is read' );
	for ( const bad of [ '', '?window=abc123', '?window=abc123&player=1', '?window=abc123&player=5', '?window=bad id&player=2', '?player=2' ] )
		same( lp.LocalPlay_PlayerWindow( bad ), null, 'not a player window: ' + JSON.stringify( bad ) );
	same( lp.LocalPlay_PlayerCommands( { session: 'abc123', player: 3 } ), 'name "Player 3"\ncolor 13 13\nconnect "window:abc123"\n', 'name, colours and the join' );

	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	let closed = 0;
	globalThis.window = { location: { search: '?window=abc123&player=3' }, close: () => closed ++ };
	try {

		openLocal();
		run();
		press( keys.K_ENTER ); // Leave local play
		same( run().join( ' | ' ), 'disconnect', 'leaving disconnects' );
		same( closed, 1, 'and closes the window' );

	} finally {

		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;

	}
	same( Window_HostSession(), null, 'a player\'s window hosts nothing' );

} );
