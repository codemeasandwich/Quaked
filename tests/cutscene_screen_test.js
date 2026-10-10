// A cutscene (cl.intermission 3, svc_cutscene) shows only its text, as WinQuake's SCR_UpdateScreen does (card [44m],
// item 20): this port drew the crosshair and the status bar over it. Through the real SCR_UpdateScreen and Draw
// functions onto a real canvas, with the shareware pack's gfx.wad; the crosshair's pixels at the screen's centre are
// read. SCR_CenterPrint counts the lines of the text it keeps.
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { readFileSync } from 'node:fs';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'in a cutscene the crosshair is not drawn; in play it is', async () => {

	const canvas = await import( process.env.QUAKED_CANVAS_MODULE );
	const draw = await import( '../src/engine/render/gl_draw.js' ), screen = await import( '../src/engine/render/gl_screen.js' ), state = await import( '../src/engine/client/client.js' );
	const cmd = await import( '../src/engine/common/cmd.js' ), keys = await import( '../src/engine/client/keys.js' ), vars = await import( '../src/engine/common/cvar.js' );
	const oldWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' ), oldDocument = Object.getOwnPropertyDescriptor( globalThis, 'document' );
	globalThis.window = { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 }; globalThis.document = { createElement: () => canvas.createCanvas( 1, 1 ) };
	const saved = { state: state.cls.state, signon: state.cls.signon, world: state.cl.worldmodel, intermission: state.cl.intermission };
	try {
		const bytes = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) ); pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) );
		VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
		const wad = await import( '../src/engine/common/wad.js' ); wad.W_LoadWadFile( pak.COM_LoadFile( 'gfx.wad' ) );
		cmd.Cbuf_Init(); cmd.Cmd_Init();
		if ( ! vars.Cvar_FindVar( 'crosshair' ) ) vars.Cvar_RegisterVariable( new vars.cvar_t( 'crosshair', '1' ) ); vars.Cvar_Set( 'crosshair', '1' );
		const overlay = canvas.createCanvas( 640, 400 ); draw.Draw_Init( overlay );
		draw.Draw_SetExternals( { vid: { width: 640, height: 400 }, host_basepal: pak.COM_FindFile( 'gfx/palette.lmp' ).data } );
		const consoleUI = await import( '../src/engine/common/console.js' );
		consoleUI.Con_SetExternals( { cls: state.cls, getRealtime: () => 100, Draw_Character: draw.Draw_Character, Draw_ConsoleBackground: draw.Draw_ConsoleBackground } ); consoleUI.Con_Init();
		const vw = draw.Draw_GetVirtualWidth(), vh = draw.Draw_GetVirtualHeight(); // the screen's own size, as the game gives it
		screen.SCR_SetExternals( { cls: state.cls, cl: state.cl, vid: { width: vw, height: vh, recalc_refdef: true }, V_RenderView: () => {}, V_UpdatePalette: () => {} } ); screen.SCR_Init();
		state.cls.state = state.ca_connected; state.cls.signon = 4; state.cl.worldmodel = { name: 'maps/x.bsp' }; keys.set_key_dest( keys.key_game );
		const ctx = overlay.getContext( '2d' );
		const centre = () => { const w = draw.Draw_GetVirtualWidth(), h = draw.Draw_GetVirtualHeight(), s = 640 / w, d = ctx.getImageData( Math.floor( ( w / 2 - 4 ) * s ), Math.floor( ( h / 2 - 4 ) * s ), Math.ceil( 8 * s ), Math.ceil( 8 * s ) ).data; let n = 0; for ( let i = 3; i < d.length; i += 4 ) if ( d[ i ] > 0 ) n ++; return n; };
		const frame = intermission => { state.cl.intermission = intermission; ctx.clearRect( 0, 0, 640, 400 ); screen.SCR_UpdateScreen(); return centre(); };
		const play = frame( 0 ), cutscene = frame( 3 );
		check( play > 0, 'in play the crosshair inks the centre (' + play + ')' );
		check( cutscene === 0, 'in a cutscene it does not (' + cutscene + ')' );
	} finally {
		Object.assign( state.cls, { state: saved.state, signon: saved.signon } ); state.cl.worldmodel = saved.world; state.cl.intermission = saved.intermission;
		if ( oldWindow ) Object.defineProperty( globalThis, 'window', oldWindow ); else delete globalThis.window; if ( oldDocument ) Object.defineProperty( globalThis, 'document', oldDocument ); else delete globalThis.document;
	}

} );
