// Public selected-asset readiness and terminal native fallbacks. Timers/image
// transport are controlled at endpoints; actual loaders/materials remain used.
import * as THREE from 'three';
import { R_AnimSetNewer, R_AnimSetLighting, R_AnimSetClassicPass, r_newer_normals, r_newer_textures, r_newer_enemies } from '../src/r_anim.js';
import { r_hdr } from '../src/gl_post.js';
import { Cvar_FindVar, Cvar_RegisterVariable } from '../src/engine/common/cvar.js';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const equal = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( r_hdr );
async function flush() { for ( let i = 0; i < 25; i ++ ) await Promise.resolve(); }
function pixels( value = 128 ) { return new THREE.DataTexture( new Uint8Array( 16 * 16 * 4 ).fill( value ), 16, 16 ); }
async function endpoints( fn ) {
	const saved = { document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ),
		fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, load: THREE.TextureLoader.prototype.load,
		hdr: r_hdr.value, hdrString: r_hdr.string, normals: r_newer_normals.value, textures: r_newer_textures.value, enemies: r_newer_enemies.value };
	const timers = new Map(), images = [], textures = []; let serial = 0;
	globalThis.setTimeout = ( callback, ms ) => { check( ms === 30000, 'asset deadline is native30s' ); const id = ++ serial; timers.set( id, callback ); return id; };
	globalThis.clearTimeout = id => timers.delete( id );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: () => ( { getContext: () => ( { drawImage() {}, getImageData: () => ( { data: new Uint8Array( [ 140, 100, 80, 255 ] ) } ) } ) } ) } } );
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class { constructor() { this.width = this.height = 1; images.push( this ); } set src( value ) { this.url = value; } } } );
	THREE.TextureLoader.prototype.load = function ( url, onLoad, _, onError ) { const texture = pixels(); textures.push( { url, onLoad, onError, texture } ); return texture; };
	r_hdr.value = 1; r_hdr.string = '1'; r_newer_normals.value = r_newer_textures.value = r_newer_enemies.value = 1;
	R_AnimSetClassicPass( false ); R_AnimSetNewer( true ); R_AnimSetLighting( true );
	try { await fn( { timers, images, textures, expire: () => { for ( const callback of [ ...timers.values() ] ) callback(); } } ); }
	finally {
		THREE.TextureLoader.prototype.load = saved.load; globalThis.fetch = saved.fetch; globalThis.setTimeout = saved.setTimeout; globalThis.clearTimeout = saved.clearTimeout;
		for ( const [ name, descriptor ] of [ [ 'document', saved.document ], [ 'Image', saved.image ] ] ) { if ( descriptor ) Object.defineProperty( globalThis, name, descriptor ); else delete globalThis[ name ]; }
		r_hdr.value = saved.hdr; r_hdr.string = saved.hdrString; r_newer_normals.value = saved.normals; r_newer_textures.value = saved.textures; r_newer_enemies.value = saved.enemies;
		R_AnimSetNewer( false ); R_AnimSetLighting( false ); R_AnimSetClassicPass( false );
	}
}

Deno.test( 'world readiness is selected-model scoped and image timeout permanently settles native without late pixel replacement', async () => endpoints( async env => {
	globalThis.fetch = async () => ( { ok: true, json: async () => ( { version: 1, textures: { wall: 'wall.webp', preview: 'preview.webp' } } ) } );
	const loader = await import( '../src/r_newertextures.js?readiness-wall' ), texture = pixels(), native = texture.image;
	const model = { textures: [ { name: 'wall', gl_texture: texture }, { name: 'unknown', gl_texture: pixels() } ] };
	loader.R_NewerTexturesForModel( model ); await flush(); equal( loader.R_NewerTexturesStatus( model ).pending, 1, 'only selected known wall pending' );
	const preview = { textures: [ { name: 'preview', gl_texture: pixels() } ] }; loader.R_NewerTexturesForModel( preview ); await flush();
	const wall = env.images.find( image => image.url.includes( 'wall.webp' ) ), late = wall.onload;
	const timer = [ ...env.timers.values() ][ 0 ]; timer(); await flush();
	const status = loader.R_NewerTexturesStatus( model ); equal( status.pending, 0, 'wall timeout terminal' ); check( status.settled, 'unknown+failed native are settled' ); equal( status.fallback, 2, 'both native fallbacks counted' );
	check( loader.R_NewerTextureSettled( 'wall', texture ), 'legacy settled query recognizes explicit fallback' ); check( status.errors[ 'wall.webp' ], 'timeout reason retained' );
	late(); await flush(); equal( texture.image, native, 'late image cannot replace native pixels' );
	const before = env.images.length; loader.R_NewerTexturesForModel( model ); equal( env.images.length, before, 'terminal native fallback never retries every frame' );
	check( ! loader.R_NewerTexturesStatus( preview ).settled, 'unrelated preview still pending independently' ); env.expire(); await flush();
} ) );

Deno.test( 'failed or stalled texture manifest is terminal native and ignores late manifest response', async () => endpoints( async env => {
	let release; globalThis.fetch = () => new Promise( resolve => { release = resolve; } );
	const loader = await import( '../src/r_newertextures.js?readiness-index-stall' ), texture = pixels(), model = { textures: [ { name: 'wall', gl_texture: texture } ] };
	loader.R_NewerTexturesForModel( model ); await flush(); equal( loader.R_NewerTexturesStatus( model ).index, 'loading', 'index loading' );
	env.expire(); await flush(); equal( loader.R_NewerTexturesStatus( model ).index, 'fallback', 'index terminal fallback' ); check( loader.R_NewerTextureSettled( 'wall', texture ), 'index failure settles texture' );
	release( { ok: true, json: async () => ( { textures: { wall: 'late.webp' } } ) } ); await flush(); equal( env.images.length, 0, 'late index cannot start art requests' );
} ) );

Deno.test( 'successful world diffuse/height readiness waits for all selected art and explicit image failure settles native', async () => endpoints( async env => {
	globalThis.fetch = async () => ( { ok: true, json: async () => ( { textures: { wall: 'd.webp', broken: 'broken.webp' }, normals: { wall: { file: 'h.webp', strength: .5 } } } ) } );
	const loader = await import( '../src/r_newertextures.js?readiness-world-success' ), wall = pixels(), broken = pixels(), native = wall.image;
	const model = { textures: [ { name: 'wall', gl_texture: wall }, { name: 'broken', gl_texture: broken } ] }; loader.R_NewerTexturesForModel( model ); await flush();
	env.images.find( image => image.url.includes( 'd.webp' ) ).onload(); await flush(); equal( wall.image, native, 'diffuse waits for selected height' );
	env.images.find( image => image.url.includes( 'broken.webp' ) ).onerror(); env.images.find( image => image.url.includes( 'h.webp' ) ).onload(); await flush();
	const status = loader.R_NewerTexturesStatus( model ); check( status.settled, 'allselectedmaps terminal' ); equal( status.ready, 1, 'replacement ready' ); equal( status.fallback, 1, 'missing native fallback' );
	check( wall.image !== native && wall.userData.newerHeight, 'actual upgraded diffuse and height attached' ); equal( env.timers.size, 0, 'completed image deadlines cleared' );
} ) );

Deno.test( 'selected custom and native skin height requests settle with diagnostics and reject late textures', async () => endpoints( async env => {
	const skins = await import( '../src/r_newerskins.js?readiness-selected' );
	skins.R_NewerSetIndex( { models: { shambler: [ { dir: 'shambler/readiness', maps: { diffuse: 'd.webp', height: 'h.webp' } } ],
		wizard: [ { dir: 'wizard/preview', maps: { diffuse: 'd.webp' } } ] }, nativeHeights: { dog: [ [ { file: 'dog-height.webp' } ] ] }, version: 1 } );
	const entity = { _entityIndex: 1 }; skins.R_NewerAliasMaterial( entity, 'progs/shambler.mdl', true );
	skins.R_NewerAliasMaterial( { _entityIndex: 2 }, 'progs/wizard.mdl', true ); const native = pixels(); skins.R_EnemyAliasMaterial( native, 'progs/dog.mdl', true );
	equal( skins.R_NewerSkinsStatus( [ { name: 'progs/shambler.mdl' }, 'progs/dog.mdl' ] ).pending, 3, 'chosen custom2/native1 counted' );
	const diffuse = env.textures.find( request => request.url.includes( 'shambler' ) && request.url.includes( 'd.webp' ) ); diffuse.onLoad( diffuse.texture );
	equal( skins.R_NewerSkinsStatus( 'progs/shambler.mdl' ).pending, 1, 'height stays pending after diffuse' );
	const pending = env.textures.filter( request => request !== diffuse ); env.expire();
	check( skins.R_NewerSkinsStatus( [ 'progs/shambler.mdl', 'progs/dog.mdl' ] ).settled, 'selected timeouts settled' );
	check( Object.keys( skins.R_NewerSkinsStatus().errors ).length >= 3, 'map failures visible' );
	let disposed = 0; for ( const request of pending ) { request.texture.addEventListener( 'dispose', () => disposed ++ ); request.onLoad( request.texture ); }
	equal( disposed, pending.length, 'late custom/native textures all disposed' );
	check( skins.R_NewerAliasMaterial( entity, 'progs/shambler.mdl', true ), 'matching diffuse/generated relief remains usable' );
	skins.R_NewerSkinsShutdown(); equal( env.timers.size, 0, 'shutdown clears deadlines' );
} ) );

Deno.test( 'skin index timeout is terminal and late response cannot create a replacement', async () => endpoints( async env => {
	let release; globalThis.fetch = () => new Promise( resolve => { release = resolve; } );
	const skins = await import( '../src/r_newerskins.js?readiness-index' ), entity = { _entityIndex: 1 };
	skins.R_NewerAliasMaterial( entity, 'progs/shambler.mdl', true ); equal( skins.R_NewerSkinsStatus( 'progs/shambler.mdl' ).pending, 1, 'selected index pending' );
	env.expire(); check( skins.R_NewerSkinsStatus( 'progs/shambler.mdl' ).settled, 'index native fallback settles' );
	release( { ok: true, json: async () => ( { models: { shambler: [ { dir: 'late', maps: { diffuse: 'd.webp' } } ] } } ) } ); await flush();
	equal( skins.R_NewerAliasMaterial( entity, 'progs/shambler.mdl', true ), null, 'late index cannot replace terminal native' ); equal( env.textures.length, 0, 'late index requests no textures' ); skins.R_NewerSkinsShutdown();
} ) );

Deno.test( 'failed authored skin normal is terminal and generates matching relief from the loaded diffuse', async () => endpoints( async env => {
	const skins = await import( '../src/r_newerskins.js?readiness-normal-failure' );
	skins.R_NewerSetIndex( { version: 1, models: { shambler: [ { dir: 'shambler/normalfailure', maps: { diffuse: 'd.webp', normal: 'n.webp' } } ] } } );
	const entity = { _entityIndex: 1 }; skins.R_NewerAliasMaterial( entity, 'progs/shambler.mdl', true );
	const diffuse = env.textures.find( request => request.url.includes( 'd.webp' ) ), normal = env.textures.find( request => request.url.includes( 'n.webp' ) ); diffuse.onLoad( diffuse.texture ); normal.onError();
	check( skins.R_NewerSkinsStatus( 'progs/shambler.mdl' ).settled, 'authored normal failure settles' );
	const material = skins.R_NewerAliasMaterial( entity, 'progs/shambler.mdl', true ), shader = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <map_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>' }; material.onBeforeCompile( shader );
	equal( shader.uniforms.uHasNormal.value, 1, 'generated normal fallback active' ); equal( shader.uniforms.qrNormal.value.image.width, diffuse.texture.image.width, 'generated detail matches actual diffuse' ); skins.R_NewerSkinsShutdown();
} ) );

Deno.test( 'weapon preload status observes concurrent requests, bounds stalled textures, and rejects late art after native fallback', async () => endpoints( async env => {
	const manifest = { models: { v_shot: { source: 'shotgun' } }, sources: { shotgun: { maps: { diffuse: 'd.webp', normal: 'n.webp' } }, shell: { maps: { diffuse: 's.webp' } } } };
	const geometry = { poses: [ [ 0, 0, 0, 1, 0, 0, 0, 1, 0 ] ], uv: [ 0, 0, 1, 0, 0, 1 ], indices: [ 0, 1, 2 ] };
	globalThis.fetch = async path => ( { ok: true, json: async () => String( path ).endsWith( 'index.json' ) ? manifest : geometry } );
	const weapons = await import( '../src/r_weapons.js?readiness-preload' ), preload = weapons.R_WeaponsPreload(); await flush();
	equal( weapons.R_WeaponStatus().preload, 'loading', 'preload loading' ); equal( weapons.R_WeaponStatus().pending.length, 2, 'held and shell concurrent' ); check( ! weapons.R_WeaponStatus().settled, 'images keep startup unready' );
	env.expire(); await preload; const status = weapons.R_WeaponStatus(); check( status.settled, 'preload failures terminal' ); equal( status.preload, 'fallback', 'preload fallback diagnostic' ); equal( status.pending.length, 0, 'no dangling role pending' );
	let disposed = 0; for ( const request of env.textures ) { request.texture.addEventListener( 'dispose', () => disposed ++ ); request.onLoad( request.texture ); }
	equal( disposed, env.textures.length, 'late weapon images disposed' ); equal( weapons.R_WeaponAsset( 'progs/v_shot.mdl' ), null, 'late art cannot replace native' );
	check( weapons.R_WeaponsPreload() === preload, 'terminal preload reused' );
} ) );

Deno.test( 'successful weapon preload exposes terminal readiness and a stalled manifest cannot later enable art', async () => endpoints( async env => {
	const manifest = { models: { v_shot: { source: 'shotgun' } }, sources: { shotgun: { maps: { diffuse: 'd.webp', normal: 'n.webp' } }, shell: { maps: { diffuse: 's.webp' } } } }, geometry = { poses: [ [ 0, 0, 0, 1, 0, 0, 0, 1, 0 ] ], uv: [ 0, 0, 1, 0, 0, 1 ], indices: [ 0, 1, 2 ] };
	globalThis.fetch = async path => ( { ok: true, json: async () => String( path ).endsWith( 'index.json' ) ? manifest : geometry } );
	const weapons = await import( '../src/r_weapons.js?readiness-success' ), preload = weapons.R_WeaponsPreload(); await flush();
	for ( const request of env.textures ) request.onLoad( request.texture ); await preload;
	const status = weapons.R_WeaponStatus(); equal( status.preload, 'ready', 'successful preload state' ); check( status.settled && status.ready.includes( 'v_shot' ) && status.ready.includes( 'shell' ), 'successful roles ready' );
	const before = env.textures.length, materials = weapons.R_WeaponMaterials(); equal( materials.length, 2, 'readyheld+shell warmmaterials' );
	check( materials.includes( weapons.R_WeaponAsset( 'progs/v_shot.mdl' ).material ), 'weapongetterreturns actualcachedmaterial' ); equal( env.textures.length, before, 'weapongetterrequests none' );
	const textures = weapons.R_WeaponTextures(); equal( textures.length, 3, 'readyhelddiffuse/normal+shell actualtexturebindings' ); check( textures.includes( weapons.R_WeaponAsset( 'progs/v_shot.mdl' ).material.map ), 'weapontexturegetter exactdiffuseidentity' );
	check( textures.includes( env.textures.find( request => request.url.includes( 'n.webp' ) ).texture ), 'weapontexturegetter exactnormalidentity' ); equal( env.textures.length, before, 'weapontexturegetterrequests none' );
	let release; globalThis.fetch = () => new Promise( resolve => { release = resolve; } );
	const stalled = await import( '../src/r_weapons.js?readiness-manifest-stall' ), wait = stalled.R_WeaponsPreload(); await flush(); env.expire(); await wait;
	check( stalled.R_WeaponStatus().settled && stalled.R_WeaponStatus().failures.manifest, 'manifest timeout settles startup' );
	release( { ok: true, json: async () => manifest } ); await flush(); equal( stalled.R_WeaponStatus().ready.length, 0, 'late manifest enables no art' );
} ) );
