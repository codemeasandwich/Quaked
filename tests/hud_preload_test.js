// Public HUD preload/status uses the existing lazy sprite canvas cache. No game
// or RAF loop is started; only fetch/image/deadline endpoints are controlled.
import { readFileSync } from 'node:fs';
const faceManifest=JSON.parse(readFileSync(new URL('../newer/hud/playerface/manifest.json',import.meta.url),'utf8'));
const faceSources=new Set(faceManifest.assets.map(a=>a.source).filter(Boolean));
import { r_hdr } from '../src/gl_post.js';
import { R_AnimSetClassicPass, r_newer_hud } from '../src/newer/render/r_anim.js';
import { Cvar_RegisterVariable, Cvar_FindVar } from '../src/engine/common/cvar.js';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const equal = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( r_hdr );
async function flush() { for ( let i = 0; i < 25; i ++ ) await Promise.resolve(); }
async function fixture( fn ) {
	const old = { fetch: globalThis.fetch, document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ),
		setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, hdr: r_hdr.string, hud: r_newer_hud.value };
	const images = [], timers = new Map(); let serial = 0;
	globalThis.setTimeout = ( callback, ms ) => { equal( ms, 30000, 'perrequest30s deadline' ); const id = ++ serial; timers.set( id, callback ); return id; };
	globalThis.clearTimeout = id => timers.delete( id );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: () => ( { getContext: () => ( { drawImage() {} } ) } ) } } );
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class { constructor() { this.width = this.height = 96; images.push( this ); } set src( value ) { this.url = value; } } } );
	r_hdr.string = '1'; r_newer_hud.value = 1; R_AnimSetClassicPass( false );
	try { await fn( { images, timers, expire: () => { for ( const callback of [ ...timers.values() ] ) callback(); } } ); }
	finally { globalThis.fetch = old.fetch; globalThis.setTimeout = old.setTimeout; globalThis.clearTimeout = old.clearTimeout; r_hdr.string = old.hdr; r_newer_hud.value = old.hud;
		for ( const [ name, descriptor ] of [ [ 'document', old.document ], [ 'Image', old.image ] ] ) { if ( descriptor ) Object.defineProperty( globalThis, name, descriptor ); else delete globalThis[ name ]; } }
}

Deno.test( 'HUD preload starts all unique catalog images behind fullconsole and shares cached canvases with lazy sprite requests', async () => fixture( async env => {
	globalThis.fetch = async path => ( { ok: true, json: async () => String(path).includes('/playerface/manifest.json')?faceManifest:({ version: 7, sprites: { face1: 'face.webp', face2: 'face.webp', num_0: 'zero.webp' } }) } );
	const hud = await import( '../src/r_newerhud.js?preload-success' ), preload = hud.R_NewerHudPreload(); equal( hud.R_NewerHudPreload(), preload, 'preloadidempotent' );
	await flush(); equal( env.images.length, 2+faceSources.size, 'unique catalog plus all donor source images start without Sbar draws' ); equal( hud.R_NewerHudStatus().pending, 3, 'two catalog images and one shared face batch pending' ); check( ! hud.R_NewerHudStatus().settled, 'preload holds until images terminal' );
	const pic = { _name: 'face1', width: 24, height: 24 }; equal( hud.R_NewerHudCanvas( pic ), null, 'lazy native until decoded' ); await flush(); equal( env.images.length, 2+faceSources.size, 'lazy request shares existing preload promise' );
	for ( const image of env.images ) image.onload(); await preload; await flush();
	const status = hud.R_NewerHudStatus(); equal( status.preload, 'ready', 'preload ready' ); check( status.settled && status.ready === 2 && status.pending === 0 && status.face.state === 'ready', 'catalog and full donor face batch are ready' );
	const alias = { _name: 'face2' }; equal( hud.R_NewerHudCanvas( alias ), pic._hi, 'first unseen HUD lookup returns enhancedcanvas synchronously without a tick' ); equal( alias._hi, pic._hi, 'same file shares actualcanvas' ); equal( env.images.length, 2+faceSources.size, 'firstlive lookup makesnoextraImage' ); equal( pic._hi.width, 96, 'actual decoded canvas retained' ); equal( env.timers.size, 0, 'success timers cleared' );
	equal( hud.R_NewerHudCanvas( { _name: 'unknown' } ), null, 'unknownsprite terminalnative immediately' );
	r_newer_hud.value = 0; equal( hud.R_NewerHudCanvas( pic ), null, 'preload never bypasses HUD option gate' );
} ) );

Deno.test( 'HUD image timeout/error resolves preload as native fallback and late images cannot populate lazy sprites', async () => fixture( async env => {
	globalThis.fetch = async () => ( { ok: true, json: async () => ( { sprites: { face1: 'slow.webp', face2: 'missing.webp' } } ) } );
	const hud = await import( '../src/r_newerhud.js?preload-fallback' ), preload = hud.R_NewerHudPreload(); await flush();
	const pic = { _name: 'face1' }; hud.R_NewerHudCanvas( pic ); await flush();
	const slow = env.images.find( image => image.url.includes( 'slow.webp' ) ), late = slow.onload;
	env.images.find( image => image.url.includes( 'missing.webp' ) ).onerror(); env.expire(); await preload; await flush();
	const status = hud.R_NewerHudStatus(); equal( status.preload, 'fallback', 'terminal fallbackstate' ); equal( status.fallback, 2, 'bothunique failurescounted' ); check( status.settled && Object.keys( status.errors ).length === 2, 'errorsvisiblewithoutstartuphang' );
	equal( pic._hi, null, 'native sprite remainsfallback' ); late(); await flush(); equal( pic._hi, null, 'late savedcallbackguarded' ); equal( env.timers.size, 0, 'terminaltimerscleared' );
	const missing = { _name: 'face2' }; equal( hud.R_NewerHudCanvas( missing ), null, 'firstfailedsprite native immediately' ); equal( missing._hi, null, 'fallbackcached synchronously without a tick' );
	const before = env.images.length; await hud.R_NewerHudPreload(); hud.R_NewerHudCanvas( { _name: 'face1' } ); await flush(); equal( env.images.length, before, 'fallback no retrywave' );
} ) );

Deno.test( 'HUD missing and stalled indices settle preload without late catalog requests', async () => fixture( async env => {
	globalThis.fetch = async () => ( { ok: false } ); const missing = await import( '../src/r_newerhud.js?preload-noindex' ); await missing.R_NewerHudPreload();
	check( missing.R_NewerHudStatus().settled && missing.R_NewerHudStatus().errors.index, 'missingindexnativefallback' );
	let release; globalThis.fetch = () => new Promise( resolve => { release = resolve; } );
	const hud = await import( '../src/r_newerhud.js?preload-indexstall' ), preload = hud.R_NewerHudPreload(); await flush(); equal( hud.R_NewerHudStatus().index, 'loading', 'indexpending' );
	env.expire(); await preload; equal( hud.R_NewerHudStatus().index, 'fallback', 'deadlineindexterminal' );
	release( { ok: true, json: async () => ( { sprites: { face1: 'late.webp' } } ) } ); await flush(); equal( env.images.length, 0, 'lateindexrequestsnoart' ); check( hud.R_NewerHudStatus().settled, 'startupcanrelease' );
} ) );
