// Card [44j]: proves the split of menu.js draws and behaves the same. The real application starts (main.js), its
// animation loop is stopped, and the native demo1 is replayed to one packet and frozen there as the menus' background
// (the world frame trial's pins: page clock, realtime, frame time, seeded chance). Then scripts of menu commands and
// keys run through the menu's own entry points (`menu_*` commands, `M_Keydown`), Classic and Newer. After every step
// the screen is drawn by the engine's own SCR_UpdateScreen; the step's record is the canvas pixels' SHA-256, the menu
// state, every archived cvar (what the options set) and the key bindings. tools: run it on the commit before the
// split and after each step (tools/menu_split_frames.mjs); the digests must match.
// No step starts a game, quits, runs the profiler or resets the configuration: ENTER is pressed only where it opens a
// screen, and the command buffer is never run.
// On the unchanged menus (Dev fa1ef637, Metal) the digest is e38d89be…e3c2; changing one label or one key's cursor
// step changes it. (The first version stopped the application before its startup commands had always run, and so had
// two digests, by how fast the page started.)
import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
const report = document.querySelector( '#report' ), views = document.querySelector( '#views' ), errors = [];
window.addEventListener( 'error', e => errors.push( { runtime: e.message } ) ); window.addEventListener( 'unhandledrejection', e => errors.push( { rejection: String( e.reason ) } ) );
const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );
const hash = async bytes => Array.from( new Uint8Array( await crypto.subtle.digest( 'SHA-256', bytes ) ), v => v.toString( 16 ).padStart( 2, '0' ) ).join( '' );
const W = 640, H = 400, PACKET = 300, DEBUG = new URLSearchParams( location.search ).has( 'debug' ); // ?debug shows each screen

// cosmetic chance comes from fixed-seed generators (as in the world frame trial)
const seeded = seed => () => { seed = ( seed + 0x6D2B79F5 ) | 0; let t = Math.imul( seed ^ ( seed >>> 15 ), 1 | seed ); t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t; return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296; };
Math.random = seeded( 1 );
{
	let seed = 0x44a1;
	crypto.getRandomValues = array => { for ( let i = 0; i < array.length; i ++ ) { seed = ( Math.imul( seed, 1664525 ) + 1013904223 ) >>> 0; array[ i ] = seed >>> ( 32 - 8 * Math.min( 4, array.BYTES_PER_ELEMENT ) ); } return array; };
}
try {
	const started = performance.now();
	await import( '../main.js' );
	while ( ! window.Cbuf_AddText || ! window.renderer ) { if ( performance.now() - started > 115000 ) throw Error( 'Application startup exceeded 115 seconds' ); await sleep( 50 ); }
	// the loop runs the startup's queued commands (quake.rc, the default bindings and speeds) on its first frames: stop
	// it only after they have run, or the configuration depends on how fast the page started
	const hostState = await import( '../src/engine/common/host_state.js' );
	while ( hostState.host_framecount < 3 ) { if ( performance.now() - started > 115000 ) throw Error( 'The host did not run its first frames' ); await sleep( 20 ); }
	const renderer = window.renderer; renderer.setAnimationLoop( null );
	const { COM_FindFile } = await import( '../src/engine/common/pak.js' );
	const client = await import( '../src/engine/client/client.js' ), { cl, cls } = client;
	const { CL_PlayDemoFromData, CL_GetMessage } = await import( '../src/engine/client/cl_demo.js' ), { CL_ParseServerMessage } = await import( '../src/engine/client/cl_parse.js' );
	const { CL_RelinkEntities } = await import( '../src/engine/client/cl_main.js' ), { V_CalcRefdef } = await import( '../src/engine/client/view.js' );
	const { SCR_UpdateScreen, SCR_EndLoadingPlaque } = await import( '../src/engine/render/gl_screen.js' );
	const { Cvar_Set, Cvar_SetValue, Cvar_WriteVariables } = await import( '../src/engine/common/cvar.js' ), { Cmd_ExecuteString } = await import( '../src/engine/common/cmd.js' );
	const keys = await import( '../src/engine/client/keys.js' ), menu = await import( '../src/engine/client/menu.js' );
	const { R_DemoLoadingCancel } = await import( '../src/newer/ui/r_demoloading.js' ), { LoadingScreen_Remove } = await import( '../src/newer/ui/loading_screen.js' );
	const { R_ClearParticles } = await import( '../src/engine/render/r_part.js' ), { set_host_frametime, set_realtime } = await import( '../src/engine/common/host_state.js' );
	const { vid } = await import( '../src/engine/render/vid.js' );
	const draw2d = await import( '../src/engine/render/gl_draw.js' ), { S_LocalSound } = await import( '../src/engine/sound/snd_dma.js' );
	const { MainMenu_Frame } = await import( '../src/newer/ui/menu_webgl.js' );
	const data = COM_FindFile( 'demo1.dem' )?.data; if ( ! data ) throw Error( 'Native demo1.dem unavailable' );
	const demo = data instanceof Uint8Array ? data : new Uint8Array( data );
	renderer.setPixelRatio( 1 ); renderer.setSize( W, H ); vid.width = W; vid.height = H; vid.recalc_refdef = true;
	const gl = renderer.getContext();
	// the HUD, the console and the menus are drawn on gl_draw.js's 2D overlay canvas, laid over the WebGL one
	const overlay = [ ...document.querySelectorAll( 'canvas' ) ].find( c => c !== renderer.domElement && c.style.pointerEvents === 'none' );
	if ( ! overlay ) throw Error( 'No 2D overlay canvas' );
	const overlayCtx = overlay.getContext( '2d' );

	// the background: demo1 replayed natively to PACKET, frozen
	CL_PlayDemoFromData( demo.buffer.slice( demo.byteOffset, demo.byteOffset + demo.byteLength ), false ); cls.timedemo = false;
	Math.random = seeded( PACKET ); cl.paused = false; R_DemoLoadingCancel();
	for ( let n = 0; n < PACKET; n ++ ) {
		R_DemoLoadingCancel(); cl.time = cl.mtime[ 0 ] + 1;
		if ( CL_GetMessage() !== 1 ) throw Error( 'Native parser stopped at packet ' + n ); CL_ParseServerMessage();
		if ( n % 64 === 0 ) await sleep( 0 );
	}
	const time = cl.mtime[ 0 ]; cl.paused = true; R_DemoLoadingCancel(); SCR_EndLoadingPlaque(); LoadingScreen_Remove();

	// what the menus draw, exactly: the host gives menu.js its drawing, sound and clocks (M_SetExternals); here each
	// drawing and sound call is recorded and then made, and the two clocks are pinned. The skinned (WebGL) menu's own
	// commands come from MainMenu_Frame. The overlay's pixels are kept out of the digest: compositing the skinned
	// menu's canvas onto the 2D overlay changes a few pixels from one identical draw to the next.
	let trace = [];
	const arg = v => v == null || typeof v !== 'object' && typeof v !== 'function' ? v : typeof v === 'function' ? 'fn' : ( v.name ?? v.path ?? ( v.width + 'x' + v.height ) );
	const record = ( name, fn ) => ( ...args ) => { trace.push( name + '(' + args.map( a => JSON.stringify( arg( a ) ) ).join( ',' ) + ')' ); return fn( ...args ); };
	const externals = { S_LocalSound: record( 'S_LocalSound', S_LocalSound ), host_time_get: () => 44, realtime_get: () => time };
	for ( const name of [ 'Draw_CachePic', 'Draw_TransPic', 'Draw_Pic', 'Draw_Character', 'Draw_Fill', 'Draw_FadeScreen', 'Draw_ConsoleBackground', 'Draw_String', 'Draw_TransPicTranslate', 'Draw_SubPic', 'Draw_WithAlpha' ] ) externals[ name ] = record( name, draw2d[ name ] );
	menu.M_SetExternals( externals );
	const CLOCK = 123456.789, realNow = performance.now.bind( performance );
	// one drawn screen with every pin of the world frame trial; its record
	async function draw( label ) {
		Math.random = seeded( 44 ); R_ClearParticles(); set_host_frametime( 0.05 ); set_realtime( time );
		for ( const shift of [ client.CSHIFT_DAMAGE, client.CSHIFT_BONUS ] ) { cl.cshifts[ shift ].percent = 0; if ( cl.prev_cshifts?.[ shift ] ) cl.prev_cshifts[ shift ].percent = 0; }
		cl.time = time; cl.oldtime = time; CL_RelinkEntities(); cl.time = time;
		const onground = cl.onground; cl.onground = false; V_CalcRefdef(); cl.onground = onground; V_CalcRefdef();
		Object.defineProperty( performance, 'now', { configurable: true, value: () => CLOCK } );
		let pixels;
		try {
			SCR_UpdateScreen(); trace = []; SCR_UpdateScreen(); // the second draw's calls
			pixels = new Uint8Array( W * H * 4 ); gl.readPixels( 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels );
		} finally { Object.defineProperty( performance, 'now', { configurable: true, value: realNow } ); }
		const drawn = overlayCtx.getImageData( 0, 0, overlay.width, overlay.height ).data;
		if ( DEBUG ) {
			const both = document.createElement( 'canvas' ); both.width = W; both.height = H; const c = both.getContext( '2d' ); c.drawImage( renderer.domElement, 0, 0, W, H ); c.drawImage( overlay, 0, 0, W, H );
			const figure = document.createElement( 'figure' ), img = document.createElement( 'img' ), caption = document.createElement( 'figcaption' ); img.src = both.toDataURL(); caption.textContent = label; figure.append( img, caption ); views.append( figure );
		}
		const skinned = MainMenu_Frame(), calls = trace; trace = [];
		return { label, sha256: await hash( pixels ), draws: await hash( new TextEncoder().encode( calls.join( '\n' ) ) ), drawCount: calls.length, skinned: await hash( new TextEncoder().encode( JSON.stringify( skinned ) ) ), skinnedCount: skinned.commands.length, overlay: await hash( drawn ), state: menu.m_state, keyDest: keys.key_dest, cvars: await hash( new TextEncoder().encode( Cvar_WriteVariables() ) ), bindings: await hash( new TextEncoder().encode( keys.keybindings.map( b => b ?? '' ).join( '\n' ) ) ), glError: gl.getError(), ...DEBUG ? { cvarText: Cvar_WriteVariables(), bindText: keys.keybindings.map( ( b, i ) => i + ' ' + ( b ?? '' ) ).join( '\n' ) } : {} };
	}
	const K = { DOWN: keys.K_DOWNARROW, UP: keys.K_UPARROW, LEFT: keys.K_LEFTARROW, RIGHT: keys.K_RIGHTARROW, ENTER: keys.K_ENTER, ESC: keys.K_ESCAPE, N: 110 };
	const times = ( n, key ) => new Array( n ).fill( key );
	// each script: commands (strings with a space or starting "menu_") and keys; every step is recorded
	const SCRIPTS = [
		[ 'main', [ 'menu_main', ...times( 7, 'DOWN' ), 'UP', 'ESC' ] ],
		[ 'single player and level select', [ 'menu_singleplayer', ...times( 4, 'DOWN' ), 'ENTER', ...times( 3, 'DOWN' ), 'RIGHT', 'LEFT', 'UP', 'ESC', 'ESC' ] ],
		[ 'load', [ 'menu_load', 'DOWN', 'DOWN', 'ESC' ] ],
		[ 'multiplayer choice and local play', [ 'menu_main', 'DOWN', 'ENTER', 'DOWN', 'UP', 'ENTER', 'DOWN', 'ESC', 'ESC' ] ],
		[ 'multiplayer', [ 'menu_multiplayer', 'DOWN', 'DOWN', 'UP', 'ESC' ] ],
		[ 'setup', [ 'menu_setup', 'DOWN', 'DOWN', 'RIGHT', 'RIGHT', 'DOWN', 'LEFT', 'ESC' ] ],
		[ 'lan config', [ 'menu_lanconfig', 'DOWN', 'UP', 'ESC' ] ],
		[ 'game options', [ 'menu_gameoptions', 'RIGHT', 'DOWN', 'RIGHT', 'DOWN', 'RIGHT', 'LEFT', 'DOWN', 'RIGHT', 'ESC' ] ],
		[ 'options and Newer\'s options', [ 'menu_options', 'ENTER', ...times( 3, 'DOWN' ), 'RIGHT', 'LEFT', 'DOWN', 'RIGHT', 'ESC' ] ],
		[ 'options\' sliders', [ 'menu_options', ...times( 5, 'DOWN' ), 'RIGHT', 'DOWN', 'RIGHT', 'RIGHT', 'DOWN', 'LEFT', 'DOWN', 'RIGHT', 'DOWN', 'LEFT', ...times( 6, 'DOWN' ), 'RIGHT', 'ESC' ] ],
		[ 'cheats', [ 'menu_options', 'UP', 'ENTER', 'DOWN', 'DOWN', 'ESC', 'ESC' ] ],
		[ 'keys', [ 'menu_keys', 'DOWN', 'DOWN', 'DOWN', 'UP', 'ESC' ] ],
		[ 'video', [ 'menu_video', 'ESC' ] ],
		[ 'credits', [ 'menu_credits', 'ESC' ] ],
		[ 'bestiary', [ 'menu_bestiary', 'RIGHT', 'RIGHT', 'LEFT', 'ESC' ] ],
		[ 'quit', [ 'menu_quit', 'N' ] ]
	];
	const frames = [];
	const run = async ( mode, script, steps, into ) => {
		for ( const step of steps ) {
			if ( step.startsWith( 'menu_' ) || step.includes( ' ' ) ) Cmd_ExecuteString( step ); else menu.M_Keydown( K[ step ] );
			into.push( await draw( mode + ' · ' + script + ' · ' + step ) );
		}
		keys.set_key_dest( keys.key_game ); // close whatever the script left open
	};
	try {
		const config = Cvar_WriteVariables(), bindings = keys.keybindings.slice();
		for ( const [ mode, hdr ] of [ [ 'Classic', 0 ], [ 'Newer', 1 ] ] ) {
			// both modes start from the page's configuration: the options scripts change archived cvars and the keys
			for ( const [ , name, value ] of config.matchAll( /^(\S+) "(.*)"$/gm ) ) Cvar_Set( name, value );
			keys.keybindings.splice( 0, keys.keybindings.length, ...bindings );
			for ( const [ name, value ] of Object.entries( { r_hdr: hdr, r_newer_lighting: hdr, r_dynres: 0, r_demosplit: 0, viewsize: 120, r_torchfire: 0, cl_bob: 0, r_pointshadows: 0 } ) ) Cvar_SetValue( name, value );
			// a first pass over every script starts what is made in the background (menu art, fonts); the measured pass
			// follows once the first script's screens stop changing
			// each screen is opened by its command alone (no cursor moves, no cvar changes) and drawn until it stops
			// changing, which starts what is made in the background (menu art, fonts); then every script runs once, the
			// same sequence every run (the menus keep their cursors from one script to the next)
			for ( const [ script, steps ] of SCRIPTS ) {
				for ( let settled = 0, last = '', tries = 0; settled < 2; tries ++ ) {
					if ( tries === 20 ) throw Error( mode + ': ' + script + ' did not settle' );
					Cmd_ExecuteString( steps[ 0 ] ); const warm = await draw( 'warm' ), now = warm.sha256 + warm.draws + warm.skinned; keys.set_key_dest( keys.key_game );
					settled = now === last ? settled + 1 : 0; last = now; if ( settled < 2 ) await sleep( 300 );
				}
			}
			for ( const [ script, steps ] of SCRIPTS ) await run( mode, script, steps, frames );
		}
	} catch ( error ) { errors.push( { thrown: String( error.stack || error ) } ); }
	const result = { status: errors.length === 0 && frames.length > 100 && frames.every( f => f.glError === 0 ) ? 'PASS' : 'FAIL', steps: frames.length, frames, errors,
		digest: await hash( new TextEncoder().encode( frames.map( f => [ f.label, f.sha256, f.draws, f.skinned, f.state, f.keyDest, f.cvars, f.bindings ].join( ':' ) ).join( '\n' ) ) ) };
	window.menuSplitResult = result; report.textContent = JSON.stringify( { status: result.status, steps: result.steps, digest: result.digest, errors }, null, 2 );
} catch ( error ) { window.renderer?.setAnimationLoop( null ); report.textContent = String( error.stack || error ); window.menuSplitResult = { status: 'FAIL', error: String( error.stack || error ) }; }
