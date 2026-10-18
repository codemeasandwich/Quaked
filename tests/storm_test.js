// Living skies (src/newer/render/r_storm.js; card T-3faa98e3 item 5, docs/storms-2026-10-14.md): a thunder sound the game
// plays lights the sky in quick flickers, stronger the louder and nearer it is; out under the sky a gust passes now
// and then, the game's own gust sounds first; New Game, demos and the switch off are untouched. Through the public
// sound system (S_Init, S_StartSound) and the sky's material, with the shareware pack's real sounds and e1m1's leaves.
import { readFileSync } from './helpers/resource_fs.mjs';
await import( '../src/newer/install.js' );
const dma = await import( '../src/engine/sound/snd_dma.js' ), sound = await import( '../src/engine/sound/sound.js' ), pak = await import( '../src/engine/common/pak.js' );
const { Mod_Init, Mod_ForName } = await import( '../src/engine/render/gl_model.js' );
const { cl, cls } = await import( '../src/engine/client/client.js' );
const cvar = await import( '../src/engine/common/cvar.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const mode = await import( '../src/newer/mode.js' );
const THREE = await import( 'three' );
const { R_FogSkyMaterial } = await import( '../src/engine/render/r_fog.js' );
const { r_storm, R_StormFrame, R_StormClear, R_StormSound, STORM } = await import( '../src/newer/render/r_storm.js' );
const fx = await import( '../src/newer/render/fx_world.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
Mod_Init();
for ( const v of [ r_hdr, r_storm ] ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
const node = kind => ( { kind, gain: { value: 1 }, pan: { value: 0 }, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } } );
class Context {
	constructor() { this.destination = {}; this.sampleRate = 44100; this.state = 'running'; this.sources = []; }
	createGain() { return node( 'gain' ); } createStereoPanner() { return node( 'pan' ); }
	createBuffer( c, l, r ) { return { channels: c, length: l, rate: r, data: new Float32Array( l ), getChannelData() { return this.data; } }; }
	createBufferSource() { const s = node( 'source' ); this.sources.push( s ); return s; }
	resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
}
const e1m1 = Mod_ForName( 'maps/e1m1.bsp', true );
const centre = l => [ 0, 1, 2 ].map( i => ( l.minmaxs[ i ] + l.minmaxs[ i + 3 ] ) / 2 );
const outdoors = centre( e1m1.leafs.find( l => l.contents === - 1 && l.ambient_sound_level[ sound.AMBIENT_SKY ] === 255 ) );
const indoors = centre( e1m1.leafs.find( l => l.contents === - 1 && l.ambient_sound_level[ sound.AMBIENT_SKY ] === 0 ) );
// the sky material's flash uniform, as a sky shader sees it
const sky = R_FogSkyMaterial( new THREE.MeshBasicMaterial() ), shader = { uniforms: {}, fragmentShader: 'void main() {\n#include <fog_fragment>\n}' };
sky.onBeforeCompile( shader, null );
let clock = 100;
function withSound( body ) {

	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' ), world = cl.worldmodel;
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
	try {

		dma.S_Init(); dma.S_SetCallbacks( { getHostFrametime: () => .05 } ); dma.S_StopAllSounds( true ); for ( const c of sound.channels ) c.sfx = null;
		cl.worldmodel = e1m1; cl.paused = false; cls.demoplayback = false; cvar.Cvar_Set( 'r_hdr', '1' ); cvar.Cvar_Set( 'r_storm', '1' ); mode.R_AnimSetClassicPass( false ); R_StormClear();
		clock += 100; cl.time = clock; R_StormFrame( clock, outdoors );
		body();

	} finally {

		dma.S_Shutdown(); cl.worldmodel = world; cvar.Cvar_Set( 'r_hdr', '1' ); cvar.Cvar_Set( 'r_storm', '1' ); cls.demoplayback = false;
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;

	}

}
// the flash every 10 ms for `seconds`
function flashes( seconds, eye = outdoors ) { const out = []; for ( let i = 0; i < seconds * 100; i ++ ) { clock = Math.round( ( clock + 0.01 ) * 1000 ) / 1000; cl.time = clock; out.push( R_StormFrame( clock, eye ) ); } return out; }
const thunder = ( name = 'ambience/thunder1.wav', at = outdoors, vol = 1, attn = 0 ) => dma.S_StartSound( - 1, 0, dma.S_PrecacheSound( name ), at, vol, attn );

Deno.test( 'a thunder sound the game plays lights the sky in quick flickers, gone within half a second', () => withSound( () => {

	thunder();
	const f = flashes( 0.6 );
	check( f[ 0 ] > 1, 'at once, bright: ' + f[ 0 ] );
	same( shader.uniforms.uQuakedSkyFlash.value, f[ f.length - 1 ], 'the sky\'s material is given the flash' );
	let flickers = 0; for ( let i = 1; i < f.length; i ++ ) if ( f[ i ] > f[ i - 1 ] + 0.2 ) flickers ++;
	check( flickers >= 2, 'it flickers more than once: ' + flickers );
	check( f.slice( 30 ).every( v => v === 0 ), 'and is over by 0.3 s' );
	check( f.every( v => v <= STORM.most ), 'never brighter than its most' );
	check( shader.fragmentShader.includes( 'gl_FragColor.rgb *= 1.0 + uQuakedSkyFlash;' ) && shader.fragmentShader.includes( 'fogColor, uQuakedSkyFog' ), 'the sky shader brightens before the fog share, which is unchanged' );

} ) );

Deno.test( 'louder and nearer thunder flashes brighter; far thunder or any other sound does not flash', () => withSound( () => {

	thunder( 'ambience/thunder1.wav', outdoors, 0.4 ); const quiet = Math.max( ...flashes( 1.2 ) );
	thunder( 'ambience/thunder1.wav', outdoors, 1 ); const loud = Math.max( ...flashes( 1.2 ) );
	check( quiet > 0 && quiet < loud, 'quieter, dimmer: ' + quiet + ' < ' + loud );
	thunder( 'ambience/thunder1.wav', [ outdoors[ 0 ] + 2000, outdoors[ 1 ], outdoors[ 2 ] ], 1, 1 ); same( Math.max( ...flashes( 1.2 ) ), 0, 'thunder 2000 units off at normal attenuation is not heard, so no flash' );
	dma.S_StartSound( - 1, 0, dma.S_PrecacheSound( 'weapons/r_exp3.wav' ), outdoors, 1, 0 ); same( Math.max( ...flashes( 0.5 ) ), 0, 'an explosion is not thunder' );

} ) );

Deno.test( 'New Game, a demo, the switch off and the classic half: no flash; the sky\'s flash is 0', () => withSound( () => {

	for ( const [ name, setup, undo ] of [ [ 'New Game', () => cvar.Cvar_Set( 'r_hdr', '0' ), () => cvar.Cvar_Set( 'r_hdr', '1' ) ], [ 'a demo', () => { cls.demoplayback = true; }, () => { cls.demoplayback = false; } ], [ 'r_storm 0', () => cvar.Cvar_Set( 'r_storm', '0' ), () => cvar.Cvar_Set( 'r_storm', '1' ) ], [ 'the classic half', () => mode.R_AnimSetClassicPass( true ), () => mode.R_AnimSetClassicPass( false ) ] ] ) {

		setup(); thunder(); const f = flashes( 0.4 ); undo();
		same( Math.max( ...f ), 0, name ); same( shader.uniforms.uQuakedSkyFlash.value, 0, name + ': the sky as always' );

	}

} ) );

Deno.test( 'out under the sky a gust passes now and then, on a free channel; indoors, or paused, none', () => withSound( () => {

	const gustsHeard = eye => { let n = 0; for ( let i = 0; i < 60 * 10; i ++ ) { clock = Math.round( ( clock + 0.1 ) * 1000 ) / 1000; cl.time = clock; R_StormFrame( clock, eye ); n += sound.channels.filter( c => c.sfx?.name === 'ambience/windfly.wav' && c.master_vol > 0 ).length > 0 ? 1 : 0; for ( const c of sound.channels ) if ( c.sfx?.name === 'ambience/windfly.wav' ) c.sfx = null; } return n; };
	const out = gustsHeard( outdoors );
	check( out >= Math.floor( 60 / STORM.gust[ 1 ] ) && out <= Math.ceil( 60 / STORM.gust[ 0 ] ), 'a minute outdoors: a gust every 9 to 26 s: ' + out );
	same( gustsHeard( indoors ), 0, 'indoors, none' );
	cl.paused = true; same( gustsHeard( outdoors ), 0, 'paused, none' ); cl.paused = false;

} ) );

Deno.test( 'a game\'s own gust sounds are used before Quake\'s windfly; drips\' random numbers are not touched', () => withSound( () => {

	const wav = new Uint8Array( 44 + 100 ), v = new DataView( wav.buffer ), tag = ( at, s ) => { for ( let i = 0; i < 4; i ++ ) wav[ at + i ] = s.charCodeAt( i ); };
	tag( 0, 'RIFF' ); v.setUint32( 4, wav.length - 8, true ); tag( 8, 'WAVE' ); tag( 12, 'fmt ' ); v.setUint32( 16, 16, true ); v.setUint16( 20, 1, true ); v.setUint16( 22, 1, true ); v.setUint32( 24, 11025, true ); v.setUint32( 28, 11025, true ); v.setUint16( 32, 1, true ); v.setUint16( 34, 8, true ); tag( 36, 'data' ); v.setUint32( 40, 100, true ); wav.fill( 140, 44 );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'gusts.pak', pak.COM_BuildPack( [ { name: 'sound/ambience/windgust1.wav', data: wav } ] ) ) );
	R_StormClear(); let name = null;
	for ( let i = 0; i < 400 && ! name; i ++ ) { clock = Math.round( ( clock + 0.1 ) * 1000 ) / 1000; cl.time = clock; R_StormFrame( clock, outdoors ); name = sound.channels.find( c => /^ambience\/wind(gust|fly)/.test( c.sfx?.name ?? '' ) )?.sfx.name ?? null; }
	same( name, 'ambience/windgust1.wav', 'the game\'s own gust' );
	fx.FX_Seed( 9 ); const a = Array.from( { length: 32 }, () => fx.FX_Random( 'drips' ) );
	fx.FX_Seed( 9 ); for ( let i = 0; i < 50; i ++ ) fx.FX_Random( 'storm' ); const b = Array.from( { length: 32 }, () => fx.FX_Random( 'drips' ) );
	same( b.join(), a.join(), 'the storm\'s draws leave the drips\' sequence alone' );

} ) );

Deno.test( 'for the eyes\' sake: thunder within a second is one flash; a pause never holds a flash; the sun flashes with the sky', async () => {

	const { R_StormFlashNow } = await import( '../src/newer/render/r_storm.js' );
	withSound( () => {

		thunder(); flashes( 0.3 ); thunder(); const f = flashes( 1.2 );
		let starts = 0; for ( let i = 1; i < f.length; i ++ ) if ( f[ i ] > f[ i - 1 ] + 0.2 ) starts ++;
		check( starts <= 2, 'the second thunder 0.3 s later adds no flickers of its own: ' + starts );
		thunder(); flashes( 0.01 ); cl.paused = true; const held = flashes( 0.5 ); cl.paused = false;
		check( held.every( v => v === 0 ) && shader.uniforms.uQuakedSkyFlash.value === 0, 'paused: the sky as always' );
		flashes( 1.2 ); thunder(); flashes( 0.01 );
		check( R_StormFlashNow() > 0 && R_StormFlashNow() === shader.uniforms.uQuakedSkyFlash.value, 'the Newer sun reads the same flash as the sky' );
		const sky = readFileSync( new URL( '../src/newer/render/r_post_sky.js', import.meta.url ), 'utf8' );
		check( /const flash = R_StormFlashNow\(\);/.test( sky ) && /\( 0\.5 \+ 0\.9 \* bright \) \* \( 1 \+ flash \)/.test( sky ) && /SUN_SURFACE \* \( 0\.5 \+ 0\.8 \* bright \) \* \( 1 \+ flash \)/.test( sky ), 'and brightens the sun\'s light on the sky and the surfaces by it' );
		flashes( 1.2 ); dma.S_StartSound( cl.viewentity = 1, 0, dma.S_PrecacheSound( 'ambience/thunder1.wav' ), [ outdoors[ 0 ] + 5000, outdoors[ 1 ], outdoors[ 2 ] ], 1, 1 );
		check( Math.max( ...flashes( 0.3 ) ) > 1, 'the player\'s own thunder (as the mixer hears it, at full) flashes fully' );

	} );

} );
