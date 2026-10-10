// Level Select offers the episode first and then that episode's levels (card [L1]). Public menu input only (keys and
// touch), the real pak0.pak; the owned full-game archive (resources/id1/pak0.pak) is read from the local installation
// only, never copied, and its part of the test is skipped when it is absent.
import { readFileSync, existsSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as keys from '../src/engine/client/keys.js';
import * as menu from '../src/engine/client/menu.js';
import * as draw from '../src/engine/render/gl_draw.js';
const check = ( value, message ) => { if ( ! value ) throw Error( message ); }, same = ( a, b, m ) => check( JSON.stringify( a ) === JSON.stringify( b ), `${m}: ${JSON.stringify( a )} != ${JSON.stringify( b )}` );
const buffer = bytes => bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );
const OWNED = new URL( '../resources/id1/pak0.pak', import.meta.url );

let commands, dest, spCursor = 0;
function open() {

	dest = keys.key_game; commands = [];
	cmd.Cbuf_Init(); cmd.Cmd_Init(); menu.M_Init();
	for ( const name of [ 'r_hdr', 'map', 'maxplayers', 'disconnect' ] ) cmd.Cmd_AddCommand( name, () => commands.push( [ name, cmd.Cmd_Argv( 1 ) ] ) );
	menu.M_SetExternals( { key_dest_set: value => { dest = value; }, key_dest_get: () => dest, cls: { demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 }, S_LocalSound: () => {}, IN_RequestPointerLock: () => {} } );
	cmd.Cmd_ExecuteString( 'menu_singleplayer' );
	// the single-player menu keeps its cursor between visits: step to the Level Select row (index 4) from wherever it was
	for ( let i = 0; i < ( 4 - spCursor + 5 ) % 5; i ++ ) menu.M_Keydown( keys.K_DOWNARROW );
	spCursor = 4; menu.M_Keydown( keys.K_ENTER );
	check( menu.m_state === menu.m_levelselect, 'Level Select opens (state ' + menu.m_state + ', key dest ' + dest + ')' );

}
const press = ( ...list ) => { for ( const k of list ) menu.M_Keydown( k ); };
const launched = () => { cmd.Cbuf_Execute(); const m = commands.find( ( [ n ] ) => n === 'map' ); commands.length = 0; return m ? m[ 1 ] : null; };
const win = () => { const old = Object.getOwnPropertyDescriptor( globalThis, 'window' ); Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 } } ); return () => { if ( old ) Object.defineProperty( globalThis, 'window', old ); else delete globalThis.window; }; };
// The menu remembers its cursor, episode and game between visits, so each step navigates to a known place by public input.
const toRow = row => { for ( let i = 0; i < 40 && menu.M_LevelSelectOffer().cursor !== row; i ++ ) press( keys.K_DOWNARROW ); check( menu.M_LevelSelectOffer().cursor === row, 'reached row ' + row ); };
const toEpisode = ep => { toRow( 2 ); for ( let i = 0; i < 8 && menu.M_LevelSelectOffer().episode !== ep; i ++ ) press( keys.K_RIGHTARROW ); check( menu.M_LevelSelectOffer().episode === ep, 'reached episode ' + ep ); };
const toLevel = ( ep, map ) => { toEpisode( ep ); const index = menu.M_LevelSelectOffer().levels.indexOf( map ); check( index >= 0, map + ' is offered' ); toRow( 3 + index ); };

Deno.test( 'with only the shareware maps: the Introduction and Episode 1; Episode 1 first; its eight levels', () => {

	const restore = win();
	try {

		pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', buffer( readFileSync( new URL( '../pak0.pak', import.meta.url ) ) ) ) );
		open();
		let o = menu.M_LevelSelectOffer();
		same( o.episodes, [ 0, 1 ], 'the shareware copy has the Introduction and Episode 1' ); same( o.episode, 1, 'the default is Episode 1' );
		same( o.levels, [ 'e1m1', 'e1m2', 'e1m3', 'e1m4', 'e1m5', 'e1m6', 'e1m7', 'e1m8' ], 'its eight levels' ); same( o.cursor, 3, 'the cursor starts on its first level (rows: game, skill, episode, then the levels)' );
		press( keys.K_UPARROW ); same( menu.M_LevelSelectOffer().cursor, 2, 'up from the first level is the Episode row' );
		press( keys.K_LEFTARROW ); o = menu.M_LevelSelectOffer(); same( o.episode, 0, 'left steps to the Introduction' ); same( o.levels, [ 'start' ], 'which has one level' );
		press( keys.K_LEFTARROW ); same( menu.M_LevelSelectOffer().episode, 1, 'and wraps round to Episode 1' );
		press( keys.K_ENTER ); same( menu.M_LevelSelectOffer().episode, 0, 'Enter on the Episode row also steps on' );
		toLevel( 0, 'start' ); press( keys.K_ENTER ); same( launched(), 'start', 'the Introduction starts' );
		toLevel( 1, 'e1m5' ); press( keys.K_ENTER ); same( launched(), 'e1m5', 'the fifth level of Episode 1 starts' );

	} finally { restore(); }

} );

Deno.test( 'with the owned full game: all five episodes, each with its own levels, launched in Newer and Classic', () => {

	if ( ! existsSync( OWNED ) ) { console.log( 'LEVEL_SELECT owned pak absent: the full-game part did NOT run' ); return; }
	console.log( 'LEVEL_SELECT owned pak present: the full-game part runs' );
	const restore = win();
	try {

		pak.COM_AddPack( pak.COM_LoadPackFile( 'owned-local', buffer( readFileSync( OWNED ) ) ) );
		open(); let o = menu.M_LevelSelectOffer();
		same( o.episodes, [ 0, 1, 2, 3, 4 ], 'all five episodes' );
		const want = { 1: [ 'e1m1', 'e1m2', 'e1m3', 'e1m4', 'e1m5', 'e1m6', 'e1m7', 'e1m8' ], 2: [ 'e2m1', 'e2m2', 'e2m3', 'e2m4', 'e2m5', 'e2m6', 'e2m7' ], 3: [ 'e3m1', 'e3m2', 'e3m3', 'e3m4', 'e3m5', 'e3m6', 'e3m7' ], 4: [ 'e4m1', 'e4m2', 'e4m3', 'e4m4', 'e4m5', 'e4m6', 'e4m7', 'e4m8', 'end' ] };
		for ( const ep of [ 1, 2, 3, 4 ] ) { toEpisode( ep ); same( menu.M_LevelSelectOffer().levels, want[ ep ], 'episode ' + ep + ' levels' ); }
		toEpisode( 4 ); press( keys.K_RIGHTARROW ); same( menu.M_LevelSelectOffer().episode, 0, 'after Episode 4 it wraps to the Introduction' );
		toLevel( 3, 'e3m3' ); press( keys.K_ENTER );
		const newer = ( cmd.Cbuf_Execute(), commands.slice() ); commands.length = 0; same( ( newer.find( ( [ n ] ) => n === 'map' ) || [] )[ 1 ], 'e3m3', 'Newer starts E3M3' ); check( newer.some( ( [ n, v ] ) => n === 'r_hdr' && v === '1' ), 'in Newer Game' );
		same( menu.M_LevelSelectOffer().episode, 3, 'the episode is remembered' );
		toRow( 0 ); press( keys.K_ENTER ); // the Game row steps from Newer to Classic
		toLevel( 3, 'e3m3' ); press( keys.K_ENTER );
		cmd.Cbuf_Execute(); const classic = commands.slice(); commands.length = 0; same( ( classic.find( ( [ n ] ) => n === 'map' ) || [] )[ 1 ], 'e3m3', 'Classic starts the same level' ); check( classic.some( ( [ n, v ] ) => n === 'r_hdr' && v === '0' ), 'in Classic' );
		toRow( 0 ); press( keys.K_ENTER ); // back to Newer for the next test
		toLevel( 4, 'end' ); press( keys.K_ENTER ); same( launched(), 'end', 'the last level, Shub-Niggurath\'s Pit (the map named end), starts' );
		toLevel( 4, 'e4m8' ); press( keys.K_ENTER ); same( launched(), 'e4m8', 'E4M8 is a different level (the Nameless City) and starts too' );

	} finally { restore(); }

} );

Deno.test( 'touch: the Episode row steps on, and a tap on a level starts it', () => {

	if ( ! existsSync( OWNED ) ) { console.log( 'LEVEL_SELECT owned pak absent: the touch part did NOT run' ); return; }
	const restore = win();
	try {

		if ( pak.COM_FindFile( 'maps/e2m1.bsp' ) === null ) pak.COM_AddPack( pak.COM_LoadPackFile( 'owned-local', buffer( readFileSync( OWNED ) ) ) ); // (stands alone: it does not rely on an earlier test)
		open(); const w = draw.Draw_GetVirtualWidth(), h = draw.Draw_GetVirtualHeight(), touch = ( x, y ) => menu.M_TouchInput( x + ( w - 320 ) / 2, y + ( h - 200 ) / 2, w, h );
		toEpisode( 2 ); const before = menu.M_LevelSelectOffer().episode; touch( 190, 68 ); const after = menu.M_LevelSelectOffer().episode;
		same( after, 3, 'a tap on the Episode row (y 64 to 71) steps from Episode ' + before + ' to the next' );
		touch( 120, 80 ); same( launched(), null, 'a tap between the Episode row and the first level starts nothing' ); touch( 120, 84 - 1 ); same( launched(), null, 'nor one just above the first level' );
		const levels = menu.M_LevelSelectOffer().levels; touch( 120, 84 + 8 * 2 + 2 );
		same( launched(), levels[ 2 ], 'a tap on the third level row starts it' );

	} finally { restore(); }

} );

Deno.test( 'what Level Select draws: the Episode row at y 64 with its name at x 184, and level row i at y 84 + 8 i (the rows touch uses)', () => {

	const restore = win();
	try {

		if ( pak.COM_FindFile( 'maps/e1m1.bsp' ) === null ) pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', buffer( readFileSync( new URL( '../pak0.pak', import.meta.url ) ) ) ) );
		open();
		const glyphs = [];
		menu.M_SetExternals( { key_dest_set: value => { dest = value; }, key_dest_get: () => dest, cls: { demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 }, Draw_CachePic: () => ( { width: 0, height: 0 } ), Draw_TransPic: () => {}, Draw_Pic: () => {}, Draw_Character: ( x, y, code ) => glyphs.push( { x, y, code } ), Draw_FadeScreen: () => {}, S_LocalSound: () => {}, realtime_get: () => 0 } );
		const dx = ( draw.Draw_GetVirtualWidth() - 320 ) >> 1, dy = ( draw.Draw_GetVirtualHeight() - 200 ) >> 1;
		const text = ( y, from = 0 ) => { let out = '', last = null; for ( const g of glyphs.filter( g => g.y === y + dy && g.x >= from + dx ).sort( ( a, b ) => a.x - b.x ) ) { if ( last !== null && g.x - last > 8 ) out += ' '; out += String.fromCharCode( g.code >= 128 ? g.code - 128 : g.code ); last = g.x; } return out.trim(); };
		const draw1 = () => { glyphs.length = 0; menu.M_Draw(); };
		toEpisode( 1 ); draw1();
		check( text( 48 ).includes( 'Game' ) && text( 56 ).includes( 'Skill' ), 'the Game and Skill rows' ); check( text( 64 ).includes( 'Episode' ), 'the Episode label is at y 64: ' + text( 64 ) );
		same( text( 64, 184 ), 'E1 Doomed', 'the episode name is at x 184 on that row' );
		const levels = menu.M_LevelSelectOffer().levels; same( levels.length, 8, 'eight levels' );
		levels.forEach( ( map, i ) => check( text( 84 + 8 * i ).toUpperCase().startsWith( map.toUpperCase() ), 'level row ' + i + ' at y ' + ( 84 + 8 * i ) + ' is ' + map + ': ' + text( 84 + 8 * i ) ) );
		check( text( 76 ) === '', 'nothing at the old first-level row (y 76)' );
		toEpisode( 0 ); draw1(); same( text( 64, 184 ), 'Introduction', 'the Introduction episode name' ); check( text( 84 ).toUpperCase().startsWith( 'START' ), 'its one level is at y 84' ); check( text( 92 ) === '', 'and no second row' );

	} finally { restore(); }

} );
