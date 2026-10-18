import {ResourceURL} from '../src/platform/resource_paths.js';
// Public loader contract for ordinary expansion artwork sharing a base-game name.
// Only fetch/Image/canvas transport is controlled; selection, identities, normal
// binding, readiness, Classic isolation and decoded-cache reuse run real code.
import * as THREE from 'three';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';

const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const flush = async () => { for ( let i = 0; i < 50; i ++ ) await Promise.resolve(); };
const native = ( value = 31, width = 2, height = 2 ) => {

	const bytes = new Uint8Array( width * height * 4 );
	for ( let i = 0; i < bytes.length; i += 4 ) bytes.set( [ value, value + 1, value + 2, 255 ], i );
	const t = new THREE.DataTexture( bytes, width, height );
	t.wrapS = t.wrapT = THREE.RepeatWrapping; t.offset.set( .125, .25 ); t.repeat.set( 2, 3 ); return t;

};
async function fixture( run ) {

	const saved = { fetch: globalThis.fetch, Image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ), document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), classic: mode.R_ClassicPassActive() };
	const options = [ r_hdr, mode.r_newer_textures ];
	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const values = options.map( v => v.string ), images = [], fetches = [];
	const base = native(), variant = native( 71, 1, 2 ), unknown = native( 91 );
	const baseKey = R_GlassTextureKey( base ), variantKey = R_GlassTextureKey( variant );
	const manifest = {
		version: 792, textures: { metal5_6: 'base.png', free_name: 'free.png', glass_name: 'unsafe-base.png' },
		sources: { metal5_6: [ baseKey ] },
		normals: { metal5_6: { file: 'base-height.png', strength: .5, cap: .8 } },
		ordinaryVariants: {
			metal5_6: { [ variantKey ]: { file: 'expansion.png', normal: { file: 'expansion-height.png', strength: 2.5, cap: .7, sampling: 'clamp', normalFile: 'expansion-normal.png' } } },
			only_variant: { [ variantKey ]: { file: 'only.png' } },
			glass_name: { [ variantKey ]: { file: 'unsafe-ordinary.png' }, [ baseKey ]: { file: 'unsafe-ordinary-base.png' } }
		},
		glass: { glass_name: { [ variantKey ]: { file: 'glass.png', heightFile: 'glass-height.png', normalFile: 'glass-normal.png' } } }
	};
	const pigments = { 'base.png': 20, 'expansion.png': 160, 'only.png': 170, 'free.png': 190, 'base-height.png': 50, 'expansion-height.png': 120, 'expansion-normal.png': 128, 'glass.png': 210, 'glass-height.png': 100, 'glass-normal.png': 128 };
	globalThis.fetch = async url => { fetches.push( ResourceURL(url,true) ); same( ResourceURL(url,true), 'newer/textures/index.json', 'only manifest fetched' ); return { ok: true, json: async () => manifest }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class {
		constructor() { this.width = this.height = 4; images.push( this ); }
		set src( url ) { this.url = ResourceURL(url,true); this.file = this.url.replace( /^newer\/textures\//, '' ).split( '?' )[ 0 ]; }
		finish( fail = false ) {
			if ( fail ) { this.onerror?.( Error( 'fixture missing image' ) ); return; }
			check( pigments[ this.file ] !== undefined, 'unexpected image requested: ' + this.file );
			this.pixels = new Uint8ClampedArray( 4 * 4 * 4 );
			for ( let i = 0; i < this.pixels.length; i += 4 ) this.pixels.set( [ pigments[ this.file ], 80, 90, 255 ], i );
			this.onload?.();
		}
	} } );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: tag => {
		same( tag, 'canvas', 'decoder requests only canvas' ); let image;
		return { getContext: () => ( { drawImage: value => image = value, getImageData: () => ( { data: image.pixels } ) } ) };
	} } } );
	mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( r_hdr.name, 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, 1 );
	try {
		const api = await import( '../src/newer/render/r_newertextures.js?identity-variants-' + Math.random() );
		await run( { api, images, fetches, manifest, base, variant, unknown, variantKey,
			finish: async () => { await flush(); for ( const image of images ) if ( image.onload ) image.finish(); await flush(); },
			model: ( name, texture ) => ( { textures: [ { name, gl_texture: texture } ] } ) } );
	} finally {
		for ( const image of images ) if ( image.onload || image.onerror ) image.finish( true ); await flush();
		globalThis.fetch = saved.fetch;
		for ( const key of [ 'Image', 'document' ] ) if ( saved[ key ] ) Object.defineProperty( globalThis, key, saved[ key ] ); else delete globalThis[ key ];
		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, values[ i ] ) ); mode.R_AnimSetClassicPass( saved.classic );
		base.dispose(); variant.dispose(); unknown.dispose();
	}

}

Deno.test( 'same-name native identities select separate ordinary pictures and their own relief without changing UVs', () => fixture( async f => {
	const baseImage = f.base.image, variantImage = f.variant.image; let updates = 0, droppedNormals = 0;
	f.variant.addEventListener( 'newertextureupdated', () => updates ++ ); f.variant._normalMap = { dispose: () => droppedNormals ++ };
	f.api.R_NewerTextureUpgrade( 'metal5_6', f.base ); f.api.R_NewerTextureUpgrade( 'metal5_6', f.variant ); await f.finish();
	same( f.base.image.data[ 0 ], 20, 'base pixels selected' ); same( f.variant.image.data[ 0 ], 160, 'expansion pixels selected' );
	same( f.base.userData.newerHeight.file, 'base-height.png', 'base relief selected' );
	const height = f.variant.userData.newerHeight;
	same( height.file, 'expansion-height.png', 'variant relief selected' ); same( height.strength, 2.5, 'variant strength' ); same( height.cap, .7, 'variant cap' );
	same( height.sampling, 'clamp', 'existing height options preserved' ); same( height.data[ 0 ], Math.fround( 120 / 255 ), 'decoded height bound' );
	same( height.authoredNormal.file, 'expansion-normal.png', 'authored normal belongs to variant' ); same( height.authoredNormal.data[ 3 ], 120, 'normal alpha uses its own height' );
	same( f.base.userData.classicImage, baseImage, 'base native retained' ); same( f.variant.userData.classicImage, variantImage, 'expansion native retained' );
	same( R_GlassTextureKey( f.variant ), f.variantKey, 'upgraded texture retains native identity' );
	same( f.variant.repeat.x, 2, 'U scale unchanged' ); same( f.variant.repeat.y, 3, 'V scale unchanged' );
	same( f.variant.offset.x, .125, 'U offset unchanged' ); same( f.variant.offset.y, .25, 'V offset unchanged' );
	same( f.variant.wrapS, THREE.RepeatWrapping, 'wrap preserved' ); same( updates, 1, 'one material update event' ); same( droppedNormals, 1, 'stale normal invalidated' );
	const count = f.images.length; f.api.R_NewerTextureUpgrade( 'metal5_6', f.variant ); await flush(); same( f.images.length, count, 'idempotent upgrade' );
} ) );

Deno.test( 'unknown identity retains native art while legacy unguarded names remain compatible', () => fixture( async f => {
	const original = f.unknown.image;
	f.api.R_NewerTextureUpgrade( 'metal5_6', f.unknown ); await f.finish();
	same( f.images.length, 0, 'unmatched guarded identity requests no art' ); same( f.unknown.image, original, 'native image retained' );
	same( f.unknown.userData.newerFallback, true, 'unknown identity is terminal fallback' ); same( f.api.R_NewerTextureSettled( 'metal5_6', f.unknown ), true, 'fallback settles readiness' );
	f.api.R_NewerTextureUpgrade( 'free_name', f.base ); await f.finish(); same( f.base.image.data[ 0 ], 190, 'name-only legacy selection remains' );
} ) );

Deno.test( 'variant-only names remain pending until actual installation and unknown variants settle to native fallback', () => fixture( async f => {
	await f.api.R_NewerTexturesPrefetch( [] );
	const model = f.model( 'only_variant', f.variant );
	same( f.api.R_NewerTextureSettled( 'only_variant', f.variant ), false, 'listed variant-only name is not prematurely settled' );
	same( f.api.R_NewerTexturesStatus( model ).pending, 1, 'listed unapplied variant counts pending' );
	f.api.R_NewerTextureUpgrade( 'only_variant', f.variant ); await flush();
	same( f.api.R_NewerTexturesStatus( model ).pending, 1, 'image transport remains pending' ); await f.finish();
	same( f.api.R_NewerTextureSettled( 'only_variant', f.variant ), true, 'actual variant installation settles' );
	same( f.api.R_NewerTexturesStatus( model ).ready, 1, 'actual variant counted ready' );
	same( f.variant.userData.newerHeight, undefined, 'colour-only variant has no invented relief' );
	f.api.R_NewerTextureUpgrade( 'only_variant', f.unknown ); await f.finish();
	same( f.api.R_NewerTexturesStatus( f.model( 'only_variant', f.unknown ) ).fallback, 1, 'unknown variant-only identity settles fallback' );
} ) );

Deno.test( 'ordinary variant without relief never borrows another identity base height', () => fixture( async f => {
	delete f.manifest.ordinaryVariants.metal5_6[ f.variantKey ].normal;
	f.api.R_NewerTextureUpgrade( 'metal5_6', f.variant ); await f.finish();
	same( f.variant.image.data[ 0 ], 160, 'own ordinary picture installs' ); same( f.variant.userData.newerHeight, undefined, 'no unrelated base height attached' );
	same( f.images.map( i => i.file ).join(), 'expansion.png', 'only variant diffuse requested' );
} ) );

Deno.test( 'malformed exact variant cannot silently substitute unrelated base artwork', () => fixture( async f => {
	// This is the base identity too: even an allowed primary source must not
	// hide a broken explicit variant registration by loading different art.
	f.manifest.ordinaryVariants.metal5_6[ R_GlassTextureKey( f.base ) ] = { file: '' };
	const original = f.base.image;
	f.api.R_NewerTextureUpgrade( 'metal5_6', f.base ); await f.finish();
	same( f.base.image, original, 'malformed variant preserves native pixels' ); same( f.images.length, 0, 'no substitute artwork request' );
	same( f.base.userData.newerFallback, true, 'malformed variant settles native fallback' );
} ) );

Deno.test( 'glass selection and glass mismatch remain authoritative over ordinary variants', () => fixture( async f => {
	f.api.R_NewerTextureUpgrade( 'glass_name', f.variant ); f.api.R_NewerTextureUpgrade( 'glass_name', f.base ); await f.finish();
	same( f.variant.image.data[ 0 ], 210, 'matching glass art wins' ); same( f.variant.userData.newerHeight.file, 'glass-height.png', 'glass height unchanged' );
	same( f.variant.userData.newerHeight.strength, 1, 'glass strength unchanged' ); same( f.base.userData.newerFallback, true, 'glass mismatch does not become ordinary material' );
	check( f.images.every( i => ! i.file.startsWith( 'unsafe-' ) ), 'no base/ordinary bypass of glass identity guard' );
} ) );

Deno.test( 'name-only prefetch requests base art only; actual identity then reuses caches and requests expansion art on demand', () => fixture( async f => {
	const prefetch = f.api.R_NewerTexturesPrefetch( [ 'metal5_6', 'metal5_6', 'only_variant' ] ); await f.finish(); await prefetch;
	same( f.images.map( i => i.file ).sort().join(), 'base-height.png,base.png', 'no speculative variant prefetch' );
	f.api.R_NewerTextureUpgrade( 'metal5_6', f.base ); await flush(); same( f.images.length, 2, 'base upgrade reuses decoded cache' );
	f.api.R_NewerTextureUpgrade( 'metal5_6', f.variant ); await f.finish();
	same( f.images.length, 5, 'expansion diffuse/height/normal requested only after identity known' ); same( f.fetches.length, 1, 'single shared manifest request' );
} ) );

Deno.test( 'variant image failure records a terminal native fallback and leaves other actual requests pending', () => fixture( async f => {
	const original = f.variant.image, model = { textures: [ { name: 'metal5_6', gl_texture: f.variant }, { name: 'free_name', gl_texture: f.base } ] };
	f.api.R_NewerTextureUpgrade( 'metal5_6', f.variant ); f.api.R_NewerTextureUpgrade( 'free_name', f.base ); await flush();
	for ( const i of f.images ) if ( i.file.startsWith( 'expansion' ) ) i.finish( i.file === 'expansion.png' ); await flush();
	const status = f.api.R_NewerTexturesStatus( model ); same( status.fallback, 1, 'failed variant counts fallback' ); same( status.pending, 1, 'other real request remains pending' );
	check( status.errors[ 'expansion.png' ], 'failure is public diagnostic' ); same( f.variant.image, original, 'missing variant keeps native pixels' );
	const count = f.images.length; f.api.R_NewerTextureUpgrade( 'metal5_6', f.variant ); await flush(); same( f.images.length, count, 'terminal failure does not retry or substitute base art' );
	await f.finish(); same( f.api.R_NewerTexturesStatus( model ).settled, true, 'all actual terminal outcomes settle' );
} ) );

Deno.test( 'Classic pass, disabled Newer mode and disabled texture option suppress variant transport; reversion restores native art', () => fixture( async f => {
	const original = f.variant.image;
	for ( const setting of [ 'classic', 'hdr', 'textures' ] ) {
		mode.R_AnimSetClassicPass( setting === 'classic' ); vars.Cvar_SetValue( r_hdr.name, setting === 'hdr' ? 0 : 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, setting === 'textures' ? 0 : 1 );
		f.api.R_NewerTextureUpgrade( 'metal5_6', f.variant ); await flush(); same( f.images.length, 0, setting + ' prevents image requests' ); same( f.fetches.length, 0, setting + ' prevents manifest request' );
		same( f.variant.image, original, setting + ' preserves native image' ); same( f.api.R_NewerTextureSettled( 'metal5_6', f.variant ), true, setting + ' readiness settles' );
	}
	mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( r_hdr.name, 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, 1 );
	f.api.R_NewerTextureUpgrade( 'metal5_6', f.variant ); await f.finish();
	same( f.variant.userData.newerPicture, true, 'reenabled mode actually installs variant before reversion' );
	same( f.api.R_ClassicTexture( f.variant ).image.data, original.data, 'Classic twin uses native data' );
	f.api.R_NewerTexturesRevert(); same( f.variant.image, original, 'reversion restores original image' ); same( f.variant.userData.newerHeight, undefined, 'reversion clears variant relief' );
} ) );
