// A demo's new level is held on its first frame while its shaders compile (gl_rmain.js R_LevelWarmHolding,
// R_LevelShaderWarm; docs/demo-performance-2026-10-14.md), and a held timedemo's clock starts after the hold
// (cl_demo.js CL_GetMessage). Runs the unchanged source of those functions with stand-ins for what they call, as
// tests/startup_collector_test.js does for the intro's warm-up; R_NewMap's own reset line is taken from the source too.
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} !== ${b}` );
const rmain = readFileSync( new URL( '../src/engine/render/gl_rmain.js', import.meta.url ), 'utf8' );

function holdFixture() {

	const begin = rmain.indexOf( '// Every demo level, not only the one the loading welcome holds back' ), end = rmain.indexOf( '// A new level\'s materials are compiled', begin );
	check( begin >= 0 && end > begin, 'the level warm-up source is where expected' );
	const reset = rmain.match( /\t(_levelWarmStart=performance\.now\(\);[^\n]*?;) \/\// );
	check( reset, 'R_NewMap resets the level warm-up' );
	check( /export function R_NewMap\(\) \{[\s\S]{0,700}_levelWarmStart=performance\.now\(\)/.test( rmain ), 'the reset is in R_NewMap' );
	check( /else R_LevelShaderWarm\(\);\n\tif\(cls\.signon===4\)_levelSignedFrames\+\+;/.test( rmain ), 'each frame warms and counts signed-on frames' );
	let now = 1000, warms = 0;
	const status = { skins: { ready: 2, fallback: 0, settled: true }, weapons: { ready: [ 'v_shot' ], settled: true }, textures: { ready: 3, fallback: 0, settled: true } };
	const context = {
		performance: { now: () => now }, console, JSON,
		cls: { demoplayback: true, signon: 4 }, cl: { worldmodel: null, model_precache: [] },
		renderer: { getRenderTarget: () => null, setRenderTarget() {} }, scene: {}, camera: {}, r_framecount: 10, mod_brush: 0,
		_needCompile: false, _introWorld: null, _introShaderStamp: '', _shaderWarmPending: 0, post: true,
		R_PostActive: () => context.post, R_IntroLoadingHolding: () => false, r_newer_enemies: { value: 1 }, r_newer_normals: { value: 1 }, r_newer_textures: { value: 1 },
		R_WeaponsEnabled: () => true, R_NewerSkinsPrepare() {}, R_NewerSkinsStatus: () => status.skins, R_WeaponStatus: () => status.weapons, R_NewerTexturesStatus: () => status.textures,
		R_NewerSkinsMaterials: () => [], R_WeaponMaterials: () => [], R_NewerSkinsTextures: () => [], R_WeaponTextures: () => [], R_ShaderAssetStamp: ( r ) => JSON.stringify( r ),
		R_LevelWarmBrushes: () => [], R_LevelWarmEffects: () => [], R_BrushModelWarmDispose() {}, R_PostBind() {}, R_WarmShaders() { warms ++; }
	};
	context.cl.worldmodel = { name: 'maps/e1m3.bsp', type: 0 }; context.cl.model_precache = [ null, context.cl.worldmodel, { name: '*1', type: 0 }, { name: 'progs/zombie.mdl', type: 2 } ];
	const body = rmain.slice( begin, end ).replace( 'export function R_LevelWarmHolding', 'function R_LevelWarmHolding' );
	const api = new Script( body + `\n({ hold: R_LevelWarmHolding, warm: R_LevelShaderWarm, newMap() { ${ reset[ 1 ] } }, frame() { R_LevelShaderWarm(); if ( cls.signon === 4 ) _levelSignedFrames ++; }, failed: () => _levelWarmFailed })`, { filename: 'level-warm.js' } ).runInNewContext( context );
	return { api, context, status, advance: ms => { now += ms; }, warms: () => warms };

}

Deno.test( 'a demo\'s level is held until its warm-up has run and four frames are drawn, never past 4 s', () => {

	const f = holdFixture();
	same( f.api.hold(), false, 'nothing held before any level loads' );
	f.api.newMap();
	same( f.api.hold(), true, 'held from the level load' );
	f.api.frame();
	same( f.warms(), 1, 'the warm-up ran once its skins and weapons had settled' );
	same( f.api.hold(), true, 'still held for the first frames' );
	for ( let i = 0; i < 3; i ++ ) f.api.frame();
	same( f.api.hold(), false, 'released after four signed-on frames' );
	f.api.frame(); same( f.warms(), 1, 'nothing changed: not warmed again' );
	// skins still loading: held until the cap
	f.status.skins = { ready: 1, fallback: 0, settled: false };
	f.api.newMap(); for ( let i = 0; i < 10; i ++ ) f.api.frame();
	same( f.api.hold(), true, 'held while the skins load' ); same( f.warms(), 1, 'nothing warmed before they settle' );
	f.advance( 4001 ); same( f.api.hold(), false, 'never held past 4 s' );
	// the level's own textures still landing: held for them, warmed again when they land, within the cap
	f.status.skins = { ready: 2, fallback: 0, settled: true }; f.status.textures = { ready: 1, fallback: 0, settled: false };
	f.api.newMap(); for ( let i = 0; i < 6; i ++ ) f.api.frame();
	same( f.api.hold(), true, 'held while the level\'s textures land' );
	const before = f.warms(); f.status.textures = { ready: 3, fallback: 0, settled: true }; f.api.frame();
	check( f.warms() === before + 1, 'warmed again for the landed textures' ); same( f.api.hold(), false, 'then released' );

} );

Deno.test( 'only a demo in the enhanced view is held, and a level whose warm-up throws plays on as before', () => {

	const f = holdFixture();
	f.api.newMap(); f.context.cls.demoplayback = false;
	same( f.api.hold(), false, 'the player\'s own game is never held (its loading welcome warms it)' );
	f.api.frame(); same( f.warms(), 0, 'and not warmed here' );
	f.context.cls.demoplayback = true; f.context.post = false;
	same( f.api.hold(), false, 'Classic is never held' );
	f.context.post = true; f.context.cls.signon = 3;
	same( f.api.hold(), false, 'not before the demo has signed on' );
	f.context.cls.signon = 4;
	const warn = console.warn; let warned = ''; console.warn = m => { warned += m; };
	f.context.R_WarmShaders = () => { throw new Error( 'a surface without a texture' ); };
	try { f.api.frame(); } finally { console.warn = warn; }
	check( warned.includes( 'level shader warm-up failed' ), 'reported' ); same( f.api.failed(), true, 'given up for this level' );
	for ( let i = 0; i < 4; i ++ ) f.api.frame();
	same( f.api.hold(), false, 'the demo plays on' );
	f.api.newMap(); same( f.api.failed(), false, 'the next level tries again' );

} );

Deno.test( 'a held timedemo starts its clock on the first frame after the hold', () => {

	const source = readFileSync( new URL( '../src/engine/client/cl_demo.js', import.meta.url ), 'utf8' );
	const begin = source.indexOf( 'export function CL_GetMessage() {' ), end = source.indexOf( '\nexport function', begin + 10 );
	check( begin >= 0 && end > begin, 'CL_GetMessage source found' );
	let held = true, stopped = 0;
	const context = {
		SIGNONS: 4, host_framecount: 100, realtime: 50, cl: { time: 0, mtime: [ 0 ], mviewangles: [ [], [] ] },
		cls: { demoplayback: true, signon: 4, timedemo: true, td_startframe: 99, td_lastframe: - 1, td_starttime: 0, demodata: new Uint8Array( 0 ), demopos: 0 },
		R_DemoLoadingFreeze: () => false, R_LevelWarmHolding: () => held, CL_StopPlayback() { stopped ++; }
	};
	const get = new Script( source.slice( begin, end ).replace( 'export function', 'function' ) + '\nCL_GetMessage', { filename: 'cl_demo.js' } ).runInNewContext( context );
	for ( let f = 100; f < 140; f ++ ) { context.host_framecount = f; context.realtime = f / 10; same( get(), 0, 'held: no message' ); }
	same( context.cls.td_starttime, 0, 'no start time while held' ); same( stopped, 0, 'and nothing read' );
	held = false; context.host_framecount = 140; context.realtime = 14; get();
	same( context.cls.td_starttime, 14, 'the clock starts on the first frame after the hold' );

} );
