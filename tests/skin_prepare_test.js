// Public startup preparation of unseen model precaches, using the existing
// native alias-header layout and later actual material selection cache.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName, aliashdr_t } from '../src/engine/render/gl_model.js';
import * as anim from '../src/newer/render/r_anim.js';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const equal = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const pixels = () => new THREE.DataTexture( new Uint8Array( 16 * 16 * 4 ).fill( 128 ), 16, 16 );
async function flush() { for ( let i = 0; i < 25; i ++ ) await Promise.resolve(); }
async function fixture( fn ) {
	const old = { fetch: globalThis.fetch, document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), load: THREE.TextureLoader.prototype.load,
		normals: anim.r_newer_normals.value, enemies: anim.r_newer_enemies.value };
	const requests = []; Object.defineProperty( globalThis, 'document', { configurable: true, value: {} } );
	THREE.TextureLoader.prototype.load = function ( url, onLoad, _, onError ) { const texture = pixels(); requests.push( { url, onLoad, onError, texture } ); return texture; };
	anim.R_AnimSetNewer( true ); anim.R_AnimSetLighting( true ); anim.r_newer_normals.value = anim.r_newer_enemies.value = 1;
	try { await fn( requests ); } finally { globalThis.fetch = old.fetch; THREE.TextureLoader.prototype.load = old.load;
		if ( old.document ) Object.defineProperty( globalThis, 'document', old.document ); else delete globalThis.document;
		anim.r_newer_normals.value = old.normals; anim.r_newer_enemies.value = old.enemies; anim.R_AnimSetNewer( false ); anim.R_AnimSetLighting( false ); }
}
function shader( material ) { const source = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <map_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>' }; material.onBeforeCompile( source ); return source; }

Deno.test( 'startup prepare begins every unseen custom variant and native skin/frame, then actual draws reuse them without another download', async () => fixture( async requests => {
	const skins = await import( '../src/newer/render/r_newerskins.js?prepare-all' ), header = new aliashdr_t(); header.numskins = 2;
	const textureGroups = Array.from( { length: 2 }, () => Array.from( { length: 4 }, pixels ) );
	header.gl_texturenum = textureGroups;
	const model = { name: 'progs/dog.mdl', cache: { data: header } }, preview = { name: 'progs/wizard.mdl', cache: { data: new aliashdr_t() } };
	let release;
	globalThis.fetch = () => new Promise( resolve => { release = resolve; } );
	const models = [ null, model, model ], preparing = skins.R_NewerSkinsPrepare( models );
	equal( skins.R_NewerSkinsPrepare( [ model ] ), preparing, 'identityset preparation idempotent' ); equal( skins.R_NewerSkinsStatus( [ model ] ).preparePending, 1, 'preparation stays pending before index' );
	await flush(); release( { ok: true, json: async () => ( { version: 31, models: { dog: [ { dir: 'dog/a', maps: { diffuse: 'a.webp' } }, { dir: 'dog/b', skin: 1, maps: { diffuse: 'b.webp', height: 'height.webp' } } ], wizard: [ { dir: 'wizard/unseenpreview', maps: { diffuse: 'preview.webp' } } ] },
		nativeHeights: { dog: textureGroups.map( ( _, skin ) => Array.from( { length: 4 }, ( _, frame ) => ( { file: `native-${skin}-${frame}.webp` } ) ) ) } } ) } );
	const prepared = await preparing; check( prepared.started, 'preparation resolves after requests started' );
	equal( requests.length, 11, 'allcustom3 plusnative8 frame maps requested' ); check( ! requests.some( request => request.url.includes( 'preview.webp' ) ), 'future model outside precache not prepared' );
	const status = skins.R_NewerSkinsStatus( [ model ] ); equal( status.preparePending, 0, 'requestinitiation done' ); equal( status.pending, 11, 'all unseen map loads keep startup held' ); check( ! status.settled, 'not falselyreadyafterpreparepromise' );
	for ( const request of requests ) request.onLoad( request.texture );
	check( skins.R_NewerSkinsStatus( [ model ] ).settled, 'all actual image callbacks ready' ); equal( skins.R_NewerSkinsStatus( [ model ] ).ready, 11, 'allmaps countedready' );
	equal( skins.R_NewerSkinsPrepare( [ model ] ), preparing, 'completed preparation reused' );
	for ( const skin of [ 0, 1 ] ) check( skins.R_NewerAliasMaterial( { _entityIndex: 4 }, model.name, true, skin ), 'offscreencustomvariant cached for actual style selection' );
	for ( let skin = 0; skin < 2; skin ++ ) for ( let frame = 0; frame < 4; frame ++ ) check( skins.R_EnemyAliasMaterial( textureGroups[ skin ][ frame ], model.name, true, skin, frame ), 'nativeframe cached for actual draw' );
	equal( requests.length, 11, 'lateractualdrawdownloads none' );
	const materials = skins.R_NewerSkinsMaterials( [ model ] ); equal( materials.length, 20, 'preparedcustom2+native8 lit/unlit actualfamilies' );
	check( materials.includes( skins.R_NewerAliasMaterial( { _entityIndex: 4 }, model.name, true, 0 ) ), 'getter returns actualcustomrender cachedobject' );
	check( materials.includes( skins.R_EnemyAliasMaterial( textureGroups[ 1 ][ 3 ], model.name, false, 1, 3 ) ), 'getter returns actualnativeunlit cachedobject' );
	equal( skins.R_NewerSkinsMaterials( [ preview ] ).length, 0, 'futureunpreparedmap excluded' ); equal( requests.length, 11, 'materialgetterdownloads nothing' );
	const textures = skins.R_NewerSkinsTextures( [ model ] ), actual = skins.R_EnemyAliasMaterial( textureGroups[ 1 ][ 3 ], model.name, true, 1, 3 );
	check( textures.includes( actual.map ), 'texturegetter includes exactrender native diffuse' ); check( textures.includes( shader( actual ).uniforms.qrNormal.value ), 'texturegetter includes exactshadercallbacknormal binding' );
	check( textures.includes( skins.R_NewerAliasMaterial( { _entityIndex: 4 }, model.name, true, 0 ).map ), 'texturegetter includes exactcustomdiffuse' );
	equal( textures.length, new Set( textures ).size, 'allactualbindings deduplicated' ); equal( skins.R_NewerSkinsTextures( [ preview ] ).length, 0, 'unpreparedfuturetextures excluded' ); equal( requests.length, 11, 'texturegetterdownloads nothing' );
	skins.R_NewerSkinsShutdown(); textureGroups.flat().forEach( texture => texture.dispose() );
} ) );

Deno.test( 'actual native loaded Quake model header prepares stored relief without drawing and keeps native diffuse ownership', async () => fixture( async requests => {
	const bytes = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) ) );
	VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
	const model = Mod_ForName( 'progs/dog.mdl', true ), header = model.cache.data, texture = header.gl_texturenum[ 0 ][ 0 ];
	const skins = await import( '../src/newer/render/r_newerskins.js?prepare-real-model' ); skins.R_NewerSetIndex( { version: 1, models: {}, nativeHeights: { dog: [ [ { file: 'real-dog.webp' } ] ] } } );
	let disposed = 0; texture.addEventListener( 'dispose', () => disposed ++ );
	await skins.R_NewerSkinsPrepare( [ model ] ); equal( requests.length, 1, 'staticnativefour slots share one request' ); equal( skins.R_NewerSkinsStatus( [ model ] ).pending, 1, 'actualnativeheight pending' );
	requests[ 0 ].onError(); check( skins.R_NewerSkinsStatus( [ model ] ).settled, 'storedfailure fallsbackwithoutlatepop' );
	const material = skins.R_EnemyAliasMaterial( texture, model.name, true ); equal( material.map, texture, 'later draw keeps exactnative diffuse' ); equal( shader( material ).uniforms.uHasNormal.value, 1, 'generateddetail remainsusable' );
	skins.R_NewerSkinsShutdown(); equal( disposed, 0, 'preparecache shutdown doesnotdispose modelownedskin' );
} ) );

Deno.test( 'startup preparation respects independent skin/normal gates and shutdown prevents delayed index from preparing a retired map', async () => fixture( async requests => {
	const skins = await import( '../src/newer/render/r_newerskins.js?prepare-cancel' ), model = { name: 'progs/dog.mdl', cache: { data: { numskins: 1, gl_texturenum: [ Array( 4 ).fill( pixels() ) ] } } };
	anim.r_newer_normals.value = anim.r_newer_enemies.value = 0; let fetches = 0;
	globalThis.fetch = async () => { fetches ++; return { ok: false }; }; await skins.R_NewerSkinsPrepare( [ model ] ); equal( fetches, 0, 'disabledfeatures requestnothing' ); equal( requests.length, 0, 'disabledfeatures noimages' );
	anim.r_newer_enemies.value = 1; let release; globalThis.fetch = () => new Promise( resolve => { release = resolve; } );
	const preparing = skins.R_NewerSkinsPrepare( [ model ] ); await flush(); skins.R_NewerSkinsShutdown();
	release( { ok: true, json: async () => ( { version: 2, models: { dog: [ { dir: 'dog/retired', maps: { diffuse: 'd.webp' } } ] } } ) } );
	check( ( await preparing ).cancelled, 'retiredpreparation rejectedbyepoch' ); equal( requests.length, 0, 'retiredmap getsnoimage callbacks' );
	skins.R_NewerSkinsShutdown(); model.cache.data.gl_texturenum[ 0 ][ 0 ].dispose();
} ) );
