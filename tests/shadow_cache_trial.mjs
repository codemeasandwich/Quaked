// The shadow caching draws the same shadows as drawing them whole (docs/demo-performance-2026-10-14.md). Plays a demo
// in Newer Game in WebKit, freezes it at several moments and, for the same frame, reads back the point-light atlas and
// the sun's shadow map with the caching on and off (R_ShadowCacheEnable). The point atlas, cached and then drawn whole again from
// the same frame's lights and scene, must be identical (later screen updates' differences, from animated casters, are
// reported for scale as atlas/atlasNoise); the sun maps, drawn back to back, by at
// most a few texels noticeably and elsewhere by under 0.001 of the depth range.
//
// Needs the source build served with a game (python3 tools/serve.py 8811 --game-root ~/quaked) and Playwright WebKit:
//   node tests/shadow_cache_trial.mjs [port=8811] [demo=demo1] [seconds between moments=6,6,6,6,6,6]
// Exits 1 on a difference.
import { createRequire } from 'node:module';
const require = createRequire( new URL( '../package.json', import.meta.url ) );
const { webkit } = require( '@playwright/test' );
const [ port = '8811', demo = 'demo1', moments = '6,6,6,6,6,6' ] = process.argv.slice( 2 );
const browser = await webkit.launch( { headless: true } );
const page = await ( await browser.newContext( { viewport: { width: 1280, height: 800 } } ) ).newPage();
const errors = []; page.on( 'pageerror', e => errors.push( e.message ) );
await page.goto( `http://127.0.0.1:${port}/index.html?game=quake` );
await page.waitForFunction( () => typeof window.Cbuf_AddText === 'function' && window.cls, null, { timeout: 180000 } );
await page.waitForTimeout( 15000 );
await page.evaluate( async d => { const c = await import( '/src/engine/client/menu_common.js' ); window.Cbuf_AddText( 'r_hdr 1\n' + c.newerDefaults() + 'r_demosplit 0\nr_dynres 0\nplaydemo ' + d + '\n' ); }, demo );
let failed = false;
for ( const seconds of moments.split( ',' ).map( Number ) ) {

	await page.waitForTimeout( seconds * 1000 );
	const r = await page.evaluate( async () => {

		const THREE = await import( 'three' );
		const vid = await import( '/src/engine/render/vid.js' ), scr = await import( '/src/engine/render/gl_screen.js' ), sh = await import( '/src/newer/render/r_post_shadows.js' );
		const st = await import( '/src/newer/render/r_post_state.js' ), rm = await import( '/src/engine/render/gl_rmain.js' );
		const renderer = vid.renderer; renderer.setAnimationLoop( null );
		const atlas = sh.R_PointShadowAtlas(), p = st.postState.gpu;
		const readAtlas = () => { const t = atlas.target, b = new Uint8Array( t.width * t.height * 4 ); renderer.readRenderTargetPixels( t, 0, 0, t.width, t.height, b ); return b; };
		const copy = window.__depthCopy ||= ( () => {

			const target = new THREE.WebGLRenderTarget( p.sunTarget.width, p.sunTarget.height, { type: THREE.FloatType } );
			const material = new THREE.ShaderMaterial( { glslVersion: THREE.GLSL3, uniforms: { t: { value: null } }, vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
				fragmentShader: 'precision highp float;precision highp sampler2D;uniform sampler2D t;out vec4 o;void main(){o=vec4(texelFetch(t,ivec2(gl_FragCoord.xy),0).r);}' } );
			material.onBeforeCompile = () => {};
			const g = new THREE.BufferGeometry(); g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ], 3 ) );
			const mesh = new THREE.Mesh( g, material ); mesh.frustumCulled = false;
			return { target, material, scene: new THREE.Scene().add( mesh ), camera: new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 ) };

		} )();
		const readSun = () => { copy.material.uniforms.t.value = p.sunTarget.depthTexture; renderer.setRenderTarget( copy.target ); renderer.render( copy.scene, copy.camera ); const b = new Float32Array( copy.target.width * copy.target.height * 4 ); renderer.readRenderTargetPixels( copy.target, 0, 0, copy.target.width, copy.target.height, b ); renderer.setRenderTarget( null ); return b; };
		const atlasDiff = ( a, b, slots ) => { const W = atlas.target.width; let n = 0; for ( const s of slots ) for ( let y = s * 128; y < ( s + 1 ) * 128; y ++ ) for ( let x = 0; x < W; x ++ ) { const i = ( y * W + x ) * 4; if ( a[ i ] !== b[ i ] || a[ i + 1 ] !== b[ i + 1 ] || a[ i + 2 ] !== b[ i + 2 ] || a[ i + 3 ] !== b[ i + 3 ] ) n ++; } return n; };
		const sunDiff = ( a, b ) => { let big = 0, max = 0; for ( let i = 0; i < a.length; i += 4 ) { const d = Math.abs( a[ i ] - b[ i ] ); if ( d > 0.001 ) big ++; else max = Math.max( max, d ); } return { big, maxElsewhere: max }; };
		const post = await import( '/src/newer/render/gl_post.js' );
		sh.R_ShadowCacheEnable( true ); scr.SCR_UpdateScreen(); scr.SCR_UpdateScreen();
		const slots = [ ...atlas.entries.values() ].filter( e => e.ready ).map( e => e.slot );
		const atlasOn = readAtlas();
		// the same frame's point shadows drawn again whole, from the same lights and scene (nothing moved in between)
		const frame = post.R_PostLastShadowFrame();
		sh.R_ShadowCacheEnable( false, 'point' ); sh.R_PostShadowsFrame( renderer, rm.scene, frame.camera, frame.lights, frame.beam, frame.hasSkyView );
		const atlasWhole = readAtlas(); sh.R_ShadowCacheEnable( true );
		// the sun maps both ways back to back, with nothing in the scene changed between them (a screen update can move
		// an animated model, which the sun map draws too)
		sh.R_PostRenderSunShadow( renderer, rm.scene, rm.camera ); const sunOn = readSun();
		sh.R_ShadowCacheEnable( false, 'sun' ); sh.R_PostRenderSunShadow( renderer, rm.scene, rm.camera ); const sunOff = readSun();
		sh.R_ShadowCacheEnable( false ); scr.SCR_UpdateScreen(); const atlasOff = readAtlas(); scr.SCR_UpdateScreen(); const atlasOff2 = readAtlas();
		sh.R_ShadowCacheEnable( true );
		// resume the game
		const host = await import( '/src/engine/server/host.js' ); let last = performance.now();
		renderer.setAnimationLoop( () => { const now = performance.now(); host.Host_Frame( ( now - last ) / 1000 ); last = now; } );
		return { time: +window.cl.time.toFixed( 2 ), slots: slots.length, atlasSameFrame: atlasDiff( atlasOn, atlasWhole, slots ), atlas: atlasDiff( atlasOn, atlasOff, slots ), atlasNoise: atlasDiff( atlasOff, atlasOff2, slots ), sun: sunDiff( sunOn, sunOff ) };

	} );
	const ok = r.atlasSameFrame === 0 && r.sun.big <= 8 && r.sun.maxElsewhere < 0.001;
	console.log( ( ok ? 'SAME ' : 'DIFFERENT ' ) + JSON.stringify( r ) );
	if ( ! ok ) failed = true;

}
if ( errors.length ) { console.log( 'page errors: ' + errors.slice( 0, 5 ).join( ' | ' ) ); failed = true; }
await browser.close();
process.exit( failed ? 1 : 0 );
