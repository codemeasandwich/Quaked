// What every menu screen shares, on its own (card [44j]): the state's setters (seen live through menu.js too), the
// in-game test, the drawing helpers' placement and the player colour table. Through the public interface of
// menu_common.js, with the host's drawing recorded.
import * as common from '../src/engine/client/menu_common.js';
import * as menu from '../src/engine/client/menu.js';
import { Draw_GetVirtualWidth, Draw_GetVirtualHeight } from '../src/engine/render/gl_draw.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
// gl_draw.js sizes the menu from the window: a 640 x 400 stand-in while a test draws
const win = () => { const old = Object.getOwnPropertyDescriptor( globalThis, 'window' ); Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 } } ); return () => { if ( old ) Object.defineProperty( globalThis, 'window', old ); else delete globalThis.window; }; };

Deno.test( 'the menu state is set only through its setters, and menu.js shows the same binding', () => {
	common.set_m_state( common.m_options ); check( common.m_state === common.m_options && menu.m_state === common.m_options, 'm_state, here and re-exported' );
	common.set_m_entersound( true ); check( common.m_entersound === true && menu.m_entersound === true, 'm_entersound' );
	common.set_m_state( common.m_none ); common.set_m_entersound( false );
	check( typeof common.menuOpeners.options === 'function' && typeof common.menuOpeners.levelSelect === 'function' && typeof common.menuOpeners.multiplayerChoice === 'function', 'menu.js fills the openers of the later families' );
} );

Deno.test( 'M_InGame: a local server or a connection, but not a demo', () => {
	common.M_SetExternals( { cls: { state: 0, demoplayback: false }, sv: { active: true } } ); check( common.M_InGame(), 'a local server' );
	common.M_SetExternals( { cls: { state: 2, demoplayback: false }, sv: { active: false } } ); check( common.M_InGame(), 'connected' );
	common.M_SetExternals( { cls: { state: 2, demoplayback: true }, sv: { active: false } } ); check( ! common.M_InGame(), 'not while a demo plays' );
} );

Deno.test( 'menu art is placed at 320 x 200 positions centred on the screen; the setup player through the colour table', () => {
	const restore = win();
	try {
		const calls = [];
		common.M_SetExternals( { Draw_Pic: ( x, y, p ) => calls.push( [ 'pic', x, y, p.name ] ), Draw_Character: ( x, y, n ) => calls.push( [ 'char', x, y, n ] ), Draw_TransPicTranslate: ( x, y, p, table ) => calls.push( [ 'translate', x, y, Array.from( table ) ] ) } );
		const dx = ( Draw_GetVirtualWidth() - 320 ) >> 1, dy = ( Draw_GetVirtualHeight() - 200 ) >> 1;
		common.M_DrawPic( 10, 20, { name: 'gfx/p.lmp' } );
		common.M_DrawPic( 10, 20, null );
		common.M_Print( 0, 8, 'AB' ); common.M_PrintWhite( 0, 16, 'A' );
		check( JSON.stringify( calls ) === JSON.stringify( [ [ 'pic', 10 + dx, 20 + dy, 'gfx/p.lmp' ], [ 'char', dx, 8 + dy, 65 + 128 ], [ 'char', 8 + dx, 8 + dy, 66 + 128 ], [ 'char', dx, 16 + dy, 65 ] ] ), 'placed, nothing for a missing picture, the brown and white fonts: ' + JSON.stringify( calls ) );
		calls.length = 0; common.M_BuildTranslationTable( 4 * 16, 13 * 16 ); common.M_DrawTransPicTranslate( 0, 0, { name: 'player' } );
		const t = calls[ 0 ][ 3 ];
		check( t[ 0 ] === 0 && t[ 255 ] === 255 && t[ 50 ] === 50, 'the rest of the palette as it is' );
		check( t[ 16 ] === 64 && t[ 31 ] === 79, 'the shirt range from colour 4' );
		check( t[ 96 ] === 13 * 16 + 15 && t[ 111 ] === 13 * 16, 'the pants range from colour 13, backwards (128 and up)' );
	} finally { restore(); }
} );
