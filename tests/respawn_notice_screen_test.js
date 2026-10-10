// The respawn-health corner message (card [4]) is drawn by the real 2D screen code, top right under the FPS line, only
// while it is active. The real draw function and Draw_String onto a real canvas; pixels counted in the message's rectangle.
// (SCR_UpdateScreen calls it once, after SCR_DrawPerf; the last test reads that call out of the source.)
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/vid.js';
import { readFileSync } from 'node:fs';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
Deno.test( 'the corner message is drawn while active at the top right, and not before or after', async () => {

	const canvas = await import( process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js' );
	const draw = await import( '../src/gl_draw.js' ), screen = await import( '../src/gl_screen.js' ), state = await import( '../src/engine/client/client.js' ), vars = await import( '../src/engine/common/cvar.js' ), keys = await import( '../src/engine/client/keys.js' );
	const notice = await import( '../src/respawn_notice.js' ), cmd = await import( '../src/engine/common/cmd.js' ), console_ = await import( '../src/engine/common/console.js' );
	const oldWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' ), oldDocument = Object.getOwnPropertyDescriptor( globalThis, 'document' );
	globalThis.window = { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 }; globalThis.document = { createElement: () => canvas.createCanvas( 1, 1 ) };
	const saved = { state: state.cls.state, signon: state.cls.signon, world: state.cl.worldmodel, time: state.cl.time };
	try {

		const bytes = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) ); VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
		const wad = await import( '../src/engine/common/wad.js' ); const wadData = pak.COM_LoadFile( 'gfx.wad' ); check( wadData, 'gfx.wad in pak0' ); wad.W_LoadWadFile( wadData );
		cmd.Cbuf_Init(); cmd.Cmd_Init();
		const overlay = canvas.createCanvas( 640, 400 ); draw.Draw_Init( overlay );
		screen.SCR_SetExternals( { cls: state.cls, cl: state.cl, vid: { width: 640, height: 400, recalc_refdef: true }, V_RenderView: () => {} } );
		state.cls.state = state.ca_connected; state.cls.signon = 4; state.cl.worldmodel = { name: 'maps/x.bsp' }; keys.set_key_dest( keys.key_game );
		draw.Draw_SetExternals( { vid: { width: 640, height: 400 }, host_basepal: pak.COM_FindFile( 'gfx/palette.lmp' ).data } );
		const ctx = overlay.getContext( '2d' ), text = notice.RESPAWN_MINUS, w = text.length * 8, x = 640 - w - 8;
		const inked = () => { const d = ctx.getImageData( x, 16, w, 8 ).data; let n = 0; for ( let i = 3; i < d.length; i += 4 ) if ( d[ i ] > 0 && ( d[ i - 3 ] > 40 || d[ i - 2 ] > 40 || d[ i - 1 ] > 40 ) ) n ++; return n; };
		const frame = time => { state.cl.time = time; ctx.clearRect( 0, 0, 640, 400 ); screen.SCR_DrawRespawnNotice(); };
		notice.Respawn_NoticeClear(); frame( 10 ); const empty = inked();
		notice.Respawn_NoticeSet( text, 10 ); frame( 10.5 ); const shown = inked();
		check( shown > empty + 40, `the message inks its rectangle (${shown} pixels against ${empty})` );
		frame( 10 + notice.RESPAWN_NOTICE_SECONDS + .5 ); same( inked(), empty, 'and it is gone after three seconds' );
		notice.Respawn_NoticeSet( text, 30 ); state.cls.demoplayback = true; frame( 30.5 ); same( inked(), empty, 'not drawn over a demo' ); state.cls.demoplayback = false;
		keys.set_key_dest( keys.key_console ); frame( 30.5 ); same( inked(), empty, 'not drawn over the console or a menu' ); keys.set_key_dest( keys.key_game ); frame( 30.5 ); check( inked() > empty + 40, 'drawn again in the game' );
		notice.Respawn_NoticeSet( notice.RESPAWN_PLUS, 20 ); frame( 21 ); const plus = notice.RESPAWN_PLUS; check( ctx.getImageData( 640 - plus.length * 8 - 8, 16, plus.length * 8, 8 ).data.some( ( v, i ) => i % 4 === 3 && v > 0 ), 'the other message is drawn at its own width' );

	} finally {

		Object.assign( state.cls, { state: saved.state, signon: saved.signon } ); state.cl.worldmodel = saved.world; state.cl.time = saved.time; notice.Respawn_NoticeClear();
		if ( oldWindow ) Object.defineProperty( globalThis, 'window', oldWindow ); else delete globalThis.window; if ( oldDocument ) Object.defineProperty( globalThis, 'document', oldDocument ); else delete globalThis.document;

	}

} );

Deno.test( 'SCR_UpdateScreen calls the corner message once, outside the in-game-only block, after the perf text', () => {

	const source = readFileSync( new URL( '../src/gl_screen.js', import.meta.url ), 'utf8' ), calls = source.split( 'SCR_DrawRespawnNotice();' ).length - 1;
	same( calls, 1, 'one call' ); const perf = source.indexOf( '\tSCR_DrawPerf();\n\tSCR_DrawRespawnNotice();' ); check( perf > 0, 'directly after SCR_DrawPerf at the top level of SCR_UpdateScreen' );

} );
