// The main menu family on its own (card [44j]): the main menu opens over the demos, its cursor moves and wraps, Enter
// opens single player, ESC returns, and quit's No comes back. Through the public interface of menu_main.js, with the
// host's key destination and drawing recorded.
import * as cmd from '../src/engine/common/cmd.js';
import * as keys from '../src/engine/client/keys.js';
import * as common from '../src/engine/client/menu_common.js';
import * as main from '../src/engine/client/menu_main.js';
import '../src/engine/client/menu.js'; // fills menuOpeners

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
// gl_draw.js sizes the menu from the window: a 640 x 400 stand-in while a test draws
const win = () => { const old = Object.getOwnPropertyDescriptor( globalThis, 'window' ); Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 } } ); return () => { if ( old ) Object.defineProperty( globalThis, 'window', old ); else delete globalThis.window; }; };
let dest = keys.key_game, drawn = [];
cmd.Cbuf_Init(); cmd.Cmd_Init();
common.M_SetExternals( { key_dest_set: v => { dest = v; }, key_dest_get: () => dest, cls: { state: 0, demonum: 2, demoplayback: true }, sv: { active: false }, svs: { maxclients: 1 }, S_LocalSound: () => {},
	Draw_CachePic: name => ( { name, width: 8, height: 8 } ), Draw_TransPic: ( x, y, p ) => drawn.push( [ x, y, p.name ] ), Draw_Pic: () => {}, Draw_SubPic: () => {}, Draw_Character: () => {}, host_time_get: () => 0 } );
// where the menu's spinning dot is drawn: its row is the cursor
const dot = () => { drawn = []; main.M_Main_Draw(); return drawn.find( d => /menudot/.test( d[ 2 ] ) ); };

Deno.test( 'the main menu: opened, its cursor moving and wrapping, Enter into single player, ESC back', () => {
	const restore = win();
	try {
		main.M_Menu_Main_f();
		check( common.m_state === common.m_main && dest === keys.key_menu, 'opens, keys to the menu' );
		const first = dot()[ 1 ];
		main.M_Main_Key( keys.K_DOWNARROW ); check( dot()[ 1 ] === first + 20, 'down a row (20 pixels)' );
		for ( let i = 0; i < 5; i ++ ) main.M_Main_Key( keys.K_DOWNARROW );
		check( dot()[ 1 ] === first, 'six items, then round to the first' );
		main.M_Main_Key( keys.K_ENTER ); check( common.m_state === common.m_singleplayer, 'Enter on the first item: single player' );
		main.M_SinglePlayer_Key( keys.K_ESCAPE ); check( common.m_state === common.m_main, 'ESC: back to the main menu' );
		main.M_Menu_Quit_f(); check( common.m_state === common.m_quit, 'quit asks' );
		main.M_Quit_Key( 110 ); check( common.m_state === common.m_main, 'N: back to the main menu' );
		main.M_Main_Key( keys.K_ESCAPE ); check( common.m_state === common.m_none && dest === keys.key_game, 'ESC closes the menu' );
	} finally { restore(); }
} );
