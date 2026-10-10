// Card [44i]: proves the split of gl_rsurf.js draws identical frames. The real application starts (main.js), its
// animation loop is stopped, and the native demo1 is replayed packet by packet to fixed points; each view is then drawn
// by the engine's own SCR_UpdateScreen (R_RenderView: R_SetupFrame, R_MarkLeaves, R_DrawWorld, the brush entities,
// R_DrawWaterSurfaces, the render, R_CleanupWaterMeshes) with game time, real time and the page clock pinned. A view's
// digest covers its pixels, every lightmap atlas byte, the scene graph (order, visibility, draw ranges) and every
// visible mesh's geometry (so liquid and sky texture coordinates count), and c_brush_polys. tools: run it on the
// commit before the split and after each step (tools/world_split_frames.mjs); every digest must match.
// The views: Classic (r_hdr 0) and Newer (r_hdr 1) at three points of the demo, each at two game times; a light
// style changed and a dynamic light added; Classic with gl_texsort 0 and r_wateralpha .5.
// On the unchanged renderer (Dev 897e3ba6, Metal): the world digest is always e5de8891…08409 (ten runs of ten), and the
// full digest is 1b245eb2…06e8b or 6bcfc8b1…defcf, about half each: the Newer views at packets 600 and 850 settle one of
// two ways in their torch-lit areas, a choice made in the post pipeline's lighting, not in gl_rsurf.js. A split step
// must give the same world digest and one of the two full digests. Changing the liquid warp or the lightmap builder
// by one part in a hundred or one level changes the world digest (checked).
import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
const report = document.querySelector( '#report' ), views = document.querySelector( '#views' ), errors = [];
window.addEventListener( 'error', e => errors.push( { runtime: e.message } ) ); window.addEventListener( 'unhandledrejection', e => errors.push( { rejection: String( e.reason ) } ) );
const sleep = ms => new Promise( resolve => setTimeout( resolve, ms ) );
const hash = async bytes => Array.from( new Uint8Array( await crypto.subtle.digest( 'SHA-256', bytes ) ), v => v.toString( 16 ).padStart( 2, '0' ) ).join( '' );
// ?packets=300,600 draws only those packets' views (for looking into one); the digest is for all three
const DEBUG = new URLSearchParams( location.search ).has( 'debug' ); // ?debug keeps each view's scene graph and per-attribute hashes
const W = 640, H = 400, PACKETS = ( new URLSearchParams( location.search ).get( 'packets' ) || '300,600,850' ).split( ',' ).map( Number );

// cosmetic chance on this page comes from fixed-seed generators: each enemy's face is drawn from crypto.getRandomValues
// (enemy_face.js) and decals, mist and particles from Math.random, which the replay and every draw reseed, so every
// run places the same blood on the same walls
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
	const renderer = window.renderer; renderer.setAnimationLoop( null );
	const { COM_FindFile } = await import( '../src/engine/common/pak.js' );
	const client = await import( '../src/engine/client/client.js' ), { cl, cls } = client;
	const { CL_PlayDemoFromData, CL_GetMessage } = await import( '../src/engine/client/cl_demo.js' ), { CL_ParseServerMessage } = await import( '../src/engine/client/cl_parse.js' );
	const { CL_RelinkEntities } = await import( '../src/engine/client/cl_main.js' ), { V_CalcRefdef } = await import( '../src/engine/client/view.js' );
	const { SCR_UpdateScreen, SCR_EndLoadingPlaque } = await import( '../src/engine/render/gl_screen.js' );
	const { Cvar_SetValue } = await import( '../src/engine/common/cvar.js' ), keys = await import( '../src/engine/client/keys.js' );
	const { R_DemoLoadingCancel } = await import( '../src/newer/ui/r_demoloading.js' ), { LoadingScreen_Remove } = await import( '../src/newer/ui/loading_screen.js' );
	const { R_ClearParticles } = await import( '../src/engine/render/r_part.js' );
	const { set_host_frametime, set_realtime } = await import( '../src/engine/common/host_state.js' );
	const { r_refdef } = await import( '../src/engine/render/render.js' );
	const main = await import( '../src/engine/render/gl_rmain.js' ), surf = await import( '../src/engine/render/gl_rsurf.js' ), { vid } = await import( '../src/engine/render/vid.js' );
	const data = COM_FindFile( 'demo1.dem' )?.data; if ( ! data ) throw Error( 'Native demo1.dem unavailable' );
	const demo = data instanceof Uint8Array ? data : new Uint8Array( data );
	renderer.setPixelRatio( 1 ); renderer.setSize( W, H ); vid.width = W; vid.height = H; vid.recalc_refdef = true;
	const gl = renderer.getContext();

	// replays the demo once with the native parser (never the animation loop), forward to each `packet` in turn, then
	// relinks the entities at the packet's own time and pauses; a map is loaded once, so the views of later packets do
	// not pile up the levels of earlier ones
	let consumed = 0;
	CL_PlayDemoFromData( demo.buffer.slice( demo.byteOffset, demo.byteOffset + demo.byteLength ), false ); cls.timedemo = false;
	async function seek( packet ) {
		Math.random = seeded( packet ); cl.paused = false; R_DemoLoadingCancel();
		for ( ; consumed < packet; consumed ++ ) {
			R_DemoLoadingCancel(); cl.time = cl.mtime[ 0 ] + 1;
			if ( CL_GetMessage() !== 1 ) throw Error( 'Native parser stopped at packet ' + consumed ); CL_ParseServerMessage();
			if ( consumed % 64 === 0 ) await sleep( 0 );
		}
		cl.time = cl.mtime[ 0 ]; cl.oldtime = cl.time; CL_RelinkEntities(); V_CalcRefdef(); cl.paused = true;
		keys.set_key_dest( keys.key_game ); R_DemoLoadingCancel(); SCR_EndLoadingPlaque(); LoadingScreen_Remove();
		return cl.time;
	}

	// what the world renderer left behind, beyond the pixels: every lightmap atlas byte, and its own objects (the
	// quake_world group, then each brush entity's group in entity order) with their visibility, draw ranges and the
	// SHA-256 of every geometry attribute, so liquid and sky texture coordinates count. Siblings are compared as a set:
	// a liquid surface keeps one mesh all session, placed where it was first seen, so their order is the session's
	// history and not this frame's. Other objects are left out for the same reason.
	async function state() {
		const parts = [];
		for ( const t of surf.lightmapTextures ) if ( t?.image?.data ) parts.push( new Uint8Array( t.image.data.buffer, t.image.data.byteOffset, t.image.data.byteLength ) );
		const atlas = await hash( concat( parts ) );
		const describe = async o => {
			const g = o.geometry, d = g?.drawRange, lines = [ [ o.name, o.type, o.visible, o.renderOrder, g ? Object.keys( g.attributes ).join( ',' ) : '', g?.index?.count ?? -1, d ? [ d.start, d.count ] : null, Array.isArray( o.material ) ? o.material.length : o.material?.type ?? '' ].join( '|' ) ];
			if ( o.isMesh && o.visible && g ) for ( const [ k, a ] of Object.entries( g.attributes ) ) lines.push( '  ' + k + ' ' + await hash( new Uint8Array( a.array.buffer, a.array.byteOffset, a.array.byteLength ) ) );
			const children = []; for ( const c of o.children ) children.push( await describe( c ) );
			return [ ...lines, ...children.sort().map( c => c.replace( /^/gm, '    ' ) ) ].join( '\n' );
		};
		const roots = [ [ 'world', main.scene.getObjectByName( 'quake_world' ) ], ...client.cl_entities.map( ( e, i ) => [ 'entity ' + i, e?._brushGroup ] ) ].filter( r => r[ 1 ] );
		const text = []; for ( const [ label, root ] of roots ) text.push( label + '\n' + await describe( root ) );
		const all = text.join( '\n' );
		return { atlas, graph: await hash( new TextEncoder().encode( all.replace( /^ *[a-z0-9_]+ [0-9a-f]{64}$/gim, '' ) ) ), objects: ( all.match( /\|/g ) || [] ).length / 7, geometry: await hash( new TextEncoder().encode( all ) ), ...DEBUG ? { graphText: all.split( '\n' ) } : {} };
	}
	function concat( parts ) { const out = new Uint8Array( parts.reduce( ( n, p ) => n + p.byteLength, 0 ) ); let at = 0; for ( const p of parts ) { out.set( p, at ); at += p.byteLength; } return out; }

	// every draw starts from the same particles (relinking spawns trail particles, and nothing dies while time is
	// pinned) and the same random numbers
	const CLOCK = 123456.789, realNow = performance.now.bind( performance );
	async function draw( label, { time, newer, style = null, dlight = false, texsort = 1, wateralpha = 1 } ) {
		// the torch fire's buffers and the point-shadow slots follow the session's history (which torches and lights were
		// seen first), so the same view can differ between runs; both belong to the post pipeline, not the world renderer
		for ( const [ name, value ] of Object.entries( { r_hdr: newer ? 1 : 0, r_newer_lighting: newer ? 1 : 0, r_dynres: 0, r_demosplit: 0, viewsize: 120, gl_texsort: texsort, r_wateralpha: wateralpha, r_torchfire: 0, cl_bob: 0, r_pointshadows: 0 } ) ) Cvar_SetValue( name, value );
		Math.random = seeded( 44 ); R_ClearParticles();
		// the view's smoothing runs on the frame time (the step smoothing, the damage kick, the bob): a fixed frame time and
		// no bob let it reach the same resting view however long the application ran before; and the damage and bonus
		// flashes, which fade the same way, are cleared
		set_host_frametime( 0.05 );
		set_realtime( time ); // the liquids' warp and the sky's scroll (gl_rsurf.js, gl_warp.js) run on it; it rests where the application stopped
		for ( const shift of [ client.CSHIFT_DAMAGE, client.CSHIFT_BONUS ] ) { cl.cshifts[ shift ].percent = 0; if ( cl.prev_cshifts?.[ shift ] ) cl.prev_cshifts[ shift ].percent = 0; }
		cl.time = time; cl.oldtime = time; CL_RelinkEntities(); cl.time = time; // (relinking clamps the time to the packet's)
		// the stair step smoothing keeps the height it had before (it moves only as cl.time passes cl.oldtime): one view
		// computed off the ground resets it to the player's
		const onground = cl.onground; cl.onground = false; V_CalcRefdef(); cl.onground = onground; V_CalcRefdef();
		const saved = client.cl_lightstyle[ 0 ], savedLight = client.cl_dlights.map( d => [ d.key, d.die, d.radius, Array.from( d.origin ) ] );
		if ( style ) client.cl_lightstyle[ 0 ] = { map: style, length: style.length };
		if ( dlight ) { const d = client.CL_AllocDlight( 0 ); d.origin.set( client.cl_entities[ cl.viewentity ].origin ); d.origin[ 2 ] += 16; d.radius = 250; d.die = time + 5; d.decay = 0; }
		Object.defineProperty( performance, 'now', { configurable: true, value: () => CLOCK } );
		let pixels;
		try {
			for ( let i = 0; i < 4; i ++ ) SCR_UpdateScreen(); // the temporal passes reach their steady state
			pixels = new Uint8Array( W * H * 4 ); gl.readPixels( 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels );
		} finally {
			Object.defineProperty( performance, 'now', { configurable: true, value: realNow } );
			client.cl_lightstyle[ 0 ] = saved;
			client.cl_dlights.forEach( ( d, i ) => { [ d.key, d.die, d.radius ] = savedLight[ i ]; d.origin.set( savedLight[ i ][ 3 ] ); } );
		}
		const figure = document.createElement( 'figure' ), img = document.createElement( 'img' ), caption = document.createElement( 'figcaption' );
		img.src = renderer.domElement.toDataURL(); caption.textContent = label; figure.append( img, caption ); views.append( figure );
		let lit = 0; for ( let i = 0; i < pixels.length; i += 4 ) if ( pixels[ i ] + pixels[ i + 1 ] + pixels[ i + 2 ] > 30 ) lit ++;
		return { label, sha256: await hash( pixels ), ...await state(), brushPolys: main.c_brush_polys, litPixels: lit, glError: gl.getError(), view: [ ...r_refdef.vieworg, ...r_refdef.viewangles ].map( v => Math.round( v * 100 ) / 100 ) };
	}

	const frames = [], VIEWS = [];
	try {
		for ( const packet of PACKETS ) {
			for ( const newer of [ false, true ] ) for ( const dt of [ 0, 0.35 ] ) VIEWS.push( [ packet, `${ newer ? 'Newer' : 'Classic' } · packet ${ packet } · +${ dt }s`, { dt, newer } ] );
		}
		if ( PACKETS.includes( 600 ) ) VIEWS.push( [ 600, 'Classic · packet 600 · light style changed, dynamic light', { dt: 0, newer: false, style: 'az', dlight: true } ], [ 600, 'Newer · packet 600 · light style changed, dynamic light', { dt: 0, newer: true, style: 'az', dlight: true } ] );
		if ( PACKETS.includes( 850 ) ) VIEWS.push( [ 850, 'Classic · packet 850 · gl_texsort 0, r_wateralpha .5', { dt: 0, newer: false, texsort: 0, wateralpha: 0.5 } ] );
		// at each packet in turn: a first pass starts what is made in the background (textures, normal maps, probes); the
		// measured pass follows once the packet's views, drawn again and again, stop changing
		for ( const packet of PACKETS ) {
			const time = await seek( packet ), mine = VIEWS.filter( v => v[ 0 ] === packet );
			const drawAll = async () => { const out = []; for ( const [ , label, view ] of mine ) out.push( await draw( label, { ...view, time: time + view.dt } ) ); return out; };
			await drawAll(); views.replaceChildren();
			for ( let settled = 0, last = null, tries = 0; settled < 2; tries ++ ) {
				await sleep( 500 ); const now = await drawAll(); views.replaceChildren();
				if ( tries === 20 ) throw Error( 'The views at packet ' + packet + ' did not settle: ' + JSON.stringify( now.flatMap( ( f, i ) => Object.keys( f ).filter( k => f[ k ] !== last[ i ][ k ] ).map( k => f.label + ' ' + k ) ) ) );
				settled = JSON.stringify( now ) === JSON.stringify( last ) ? settled + 1 : 0; last = now;
			}
			frames.push( ...await drawAll() );
		}
		frames.sort( ( a, b ) => VIEWS.findIndex( v => v[ 1 ] === a.label ) - VIEWS.findIndex( v => v[ 1 ] === b.label ) );
	} catch ( error ) { errors.push( { thrown: String( error.stack || error ) } ); }
	const result = { status: errors.length === 0 && frames.length === VIEWS.length && frames.every( f => f.glError === 0 && f.litPixels > 0 ) ? 'PASS' : 'FAIL', frames, errors,
		digest: await hash( new TextEncoder().encode( frames.map( f => [ f.sha256, f.atlas, f.graph, f.geometry, f.brushPolys ].join( ':' ) ).join( '\n' ) ) ),
		// everything but the Newer views' pixels, which settle one of a few ways on the unchanged renderer (see the head)
		worldDigest: await hash( new TextEncoder().encode( frames.map( f => [ f.label.startsWith( 'Newer' ) ? '' : f.sha256, f.atlas, f.graph, f.geometry, f.brushPolys ].join( ':' ) ).join( '\n' ) ) ) };
	window.worldSplitResult = result; report.textContent = JSON.stringify( result, null, 2 );
} catch ( error ) { window.renderer?.setAnimationLoop( null ); report.textContent = String( error.stack || error ); window.worldSplitResult = { status: 'FAIL', error: String( error.stack || error ) }; }
