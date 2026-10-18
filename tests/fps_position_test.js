// The FPS counter's second and third lines (owner, 14 October 2026): the view's position, then its direction, so a
// screenshot says exactly where it was taken from (gl_screen.js SCR_PositionLines, drawn by SCR_DrawPerf under the
// frame rate while a level is up; the respawn corner message moves below all three while the counter is on).
import { readFileSync } from './helpers/resource_fs.mjs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { SCR_PositionLines, SCR_POSITION_Y, SCR_LINE_STEP } from '../src/engine/render/gl_screen.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} !== ${b}` );

Deno.test( 'the lines give the eye\'s position in whole units and the heading and pitch in whole degrees', () => {

	same( SCR_PositionLines( [ 704.4, 1375.6, 900.2 ], [ - 10.4, 270.2, 0 ] ).join( '|' ), 'x 704 y 1376 z 900|yaw 270 pitch -10', 'a view' );
	same( SCR_PositionLines( [ - 35, 818, - 107 ], [ 0, - 90, 0 ] ).join( '|' ), 'x -35 y 818 z -107|yaw 270 pitch 0', 'a negative yaw is turned to 0..359' );
	same( SCR_PositionLines( [ 0, 0, 0 ], [ 0, 720, 0 ] ).join( '|' ), 'x 0 y 0 z 0|yaw 0 pitch 0', 'and a yaw past a turn' );
	same( SCR_PositionLines( [ 0, 0, 0 ], [ - 0.2, 359.6, 0 ] ).join( '|' ), 'x 0 y 0 z 0|yaw 0 pitch 0', 'no "-0" and no 360' );

} );

Deno.test( 'SCR_DrawPerf draws it under the frame rate, only in a level and only with the counter on', () => {

	const source = readFileSync( new URL( '../src/engine/render/gl_screen.js', import.meta.url ), 'utf8' );
	const begin = source.indexOf( 'function SCR_DrawPerf() {' ), end = source.indexOf( '\n}\n', begin );
	const body = source.slice( begin, end );
	const off = body.indexOf( "if ( Cvar_VariableValue( 'cl_showfps' ) === 0 ) return;" ), fps = body.indexOf( 'Draw_String( _vid.width - text.length * 8 - 8, 4, text );' ), line = body.indexOf( 'Draw_String( _vid.width - lines[ i ].length * 8 - 8, SCR_POSITION_Y + i * SCR_LINE_STEP, lines[ i ] );' );
	check( off > 0 && fps > off && line > fps, 'after the counter\'s own off switch and its frame-rate line' );
	check( /_cls\.signon === 4 && _cl\.worldmodel && _r_refdef\?\.vieworg[\s\S]*SCR_PositionLines\( _r_refdef\.vieworg, _r_refdef\.viewangles \|\| _cl\.viewangles \)/.test( body ), 'from the drawn view\'s position and angles, in a level' );
	same( SCR_POSITION_Y, 14, 'just under the 8-pixel frame-rate line at 4' ); same( SCR_LINE_STEP, 10, 'and the angles 10 below the position' );
	check( /Cvar_VariableValue\( 'cl_showfps' \) === 0 \? SCR_NOTICE_Y : SCR_NOTICE_Y_UNDER_FPS/.test( source ) && /SCR_NOTICE_Y = 16, SCR_NOTICE_Y_UNDER_FPS = 36/.test( source ), 'the respawn message sits below all three lines when the counter is on, where it was otherwise' );

} );

Deno.test( 'drawn on a real canvas: both lines under the frame rate in a level, none outside one or with the counter off, and the corner message below them', async () => {

	const canvas = await import( process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js' );
	const draw = await import( '../src/engine/render/gl_draw.js' ), screen = await import( '../src/engine/render/gl_screen.js' ), state = await import( '../src/engine/client/client.js' ), vars = await import( '../src/engine/common/cvar.js' ), keys = await import( '../src/engine/client/keys.js' );
	const perf = await import( '../src/newer/render/r_perf.js' ), notice = await import( '../src/newer/ui/respawn_notice.js' ), cmd = await import( '../src/engine/common/cmd.js' ), render = await import( '../src/engine/render/render.js' ), hooks = await import( '../src/engine/common/hooks.js' );
	const oldWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' ), oldDocument = Object.getOwnPropertyDescriptor( globalThis, 'document' );
	globalThis.window = { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 }; globalThis.document = { createElement: () => canvas.createCanvas( 1, 1 ) };
	const saved = { state: state.cls.state, signon: state.cls.signon, world: state.cl.worldmodel, time: state.cl.time, demo: state.cls.demoplayback };
	try {

		if ( ! hooks.Hooks_Installed() ) ( await import( '../src/newer/install.js' ) );
		const bytes = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) ); pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) ); VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
		const wad = await import( '../src/engine/common/wad.js' ); wad.W_LoadWadFile( pak.COM_LoadFile( 'gfx.wad' ) );
		cmd.Cbuf_Init(); cmd.Cmd_Init();
		if ( ! vars.Cvar_FindVar( 'cl_showfps' ) ) vars.Cvar_RegisterVariable( perf.cl_showfps );
		const overlay = canvas.createCanvas( 640, 400 ); draw.Draw_Init( overlay );
		screen.SCR_SetExternals( { cls: state.cls, cl: state.cl, vid: { width: 640, height: 400, recalc_refdef: true }, V_RenderView: () => {}, r_refdef: render.r_refdef } );
		draw.Draw_SetExternals( { vid: { width: 640, height: 400 }, host_basepal: pak.COM_FindFile( 'gfx/palette.lmp' ).data } );
		state.cls.state = state.ca_connected; state.cls.signon = 4; state.cls.demoplayback = false; state.cl.worldmodel = { name: 'maps/x.bsp' }; keys.set_key_dest( keys.key_game );
		render.r_refdef.vieworg.set( [ 704, - 1376, 900 ] ); render.r_refdef.viewangles.set( [ 13, 55, 0 ] );
		const ctx = overlay.getContext( '2d' ), lines = screen.SCR_PositionLines( render.r_refdef.vieworg, render.r_refdef.viewangles );
		same( lines.join( '|' ), 'x 704 y -1376 z 900|yaw 55 pitch 13', 'the drawn view\'s numbers' );
		const inked = ( y, text ) => { const w = text.length * 8, d = ctx.getImageData( 640 - w - 8, y, w, 8 ).data; let n = 0; for ( let i = 3; i < d.length; i += 4 ) if ( d[ i ] > 0 && ( d[ i - 3 ] > 40 || d[ i - 2 ] > 40 || d[ i - 1 ] > 40 ) ) n ++; return n; };
		const frame = () => { ctx.clearRect( 0, 0, 640, 400 ); screen.SCR_DrawPerf(); };
		vars.Cvar_Set( 'cl_showfps', '1' ); frame();
		check( inked( 14, lines[ 0 ] ) > 60, 'the position is drawn on the second line: ' + inked( 14, lines[ 0 ] ) );
		check( inked( 24, lines[ 1 ] ) > 40, 'the angles on the third: ' + inked( 24, lines[ 1 ] ) );
		check( inked( 4, perf.R_PerfFpsText() ) > 20, 'under the frame rate' );
		state.cls.signon = 3; frame(); same( inked( 14, lines[ 0 ] ) + inked( 24, lines[ 1 ] ), 0, 'not before the level is signed on' ); state.cls.signon = 4;
		state.cl.worldmodel = null; frame(); same( inked( 14, lines[ 0 ] ) + inked( 24, lines[ 1 ] ), 0, 'nor without a level' ); state.cl.worldmodel = { name: 'maps/x.bsp' };
		vars.Cvar_Set( 'cl_showfps', '0' ); frame(); same( inked( 4, '00 fps  00.0 ms' ) + inked( 14, lines[ 0 ] ) + inked( 24, lines[ 1 ] ), 0, 'nor with the counter off' );
		// the corner message: below the three lines with the counter on, where it was with it off
		const text = notice.RESPAWN_MINUS; notice.Respawn_NoticeSet( text, 10 ); state.cl.time = 10.5;
		const corner = () => { ctx.clearRect( 0, 0, 640, 400 ); screen.SCR_DrawRespawnNotice(); };
		vars.Cvar_Set( 'cl_showfps', '1' ); corner(); check( inked( 36, text ) > 40 && inked( 16, text ) === 0, 'under the counter: at 36' );
		vars.Cvar_Set( 'cl_showfps', '0' ); corner(); check( inked( 16, text ) > 40 && inked( 36, text ) === 0, 'without it: at 16 as before' );

	} finally {

		Object.assign( state.cls, { state: saved.state, signon: saved.signon, demoplayback: saved.demo } ); state.cl.worldmodel = saved.world; state.cl.time = saved.time; notice.Respawn_NoticeClear();
		if ( oldWindow ) Object.defineProperty( globalThis, 'window', oldWindow ); else delete globalThis.window; if ( oldDocument ) Object.defineProperty( globalThis, 'document', oldDocument ); else delete globalThis.document;

	}

} );
