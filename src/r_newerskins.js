// Newer Game enemy skins: custom upsampled replacements listed in
// newer/enemies/index.json. Each model currently has one custom diffuse map;
// models without an entry retain their original Quake skins.
//
// Every enemy skin has stored or generated height-driven relief. Native skins
// keep their selected skin and animation frame; replacement art stays optional.
// The loader also supports multiple variants and optional material maps:
//
//   diffuse  replaces the skin
//   luma     glows on top of the lit skin (brighter than white in HDR)
//   gloss    a wet rim sheen where the surface turns away from you
//   height   top-row-first grayscale relief; generates normals in the existing
//            gl_normals pipeline, sharing the diffuse UVs (no atlas parallax)
//   normal   bump detail; also written to the lighting pass's normal buffer, so
//            the sun and torches light the relief (tangent frame from the skin's
//            UVs).  Supplied maps are OpenGL style, so their green is flipped;
//            generated ones are not.
//
// Textures load in the background the first time a skin is chosen; until they
// have arrived the original skin is shown.

import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { R_IsNewer, R_NewerLightingActive, r_newer_enemies, r_newer_normals } from './r_anim.js';
import { COM_NewerJSON, COM_NewerURL } from './pak.js';
import { R_NormalMapFor, R_HeightFromRGBA, R_MultiScaleHeight } from './gl_normals.js';

// 1 = each monster picks one of its model's skins at random, 0 = always the first
export const r_newer_variety = new cvar_t( 'r_newer_variety', '1' );

const BASE = 'newer/enemies/';

// model name -> [ { dir, maps: { diffuse, normal, luma, gloss }, flipGreen } ]
let skinIndex = null;
let indexRequested = false;
let nativeHeights = {};
let skinVersion = '0';

// Stock Quake enemies, enemy heads and shared gore. Native height generation
// also covers registered-game models absent from this checkout's shareware pak.
export const ENEMY_SKIN_MODELS = new Set( [
	'boss', 'demon', 'dog', 'enforcer', 'fish', 'hknight', 'knight', 'ogre', 'oldone',
	'shalrath', 'shambler', 'soldier', 'tarbaby', 'wizard', 'zombie', 'h_demon',
	'h_dog', 'h_hellkn', 'h_knight', 'h_ogre', 'h_shal', 'h_shams', 'h_guard',
	'h_wizard', 'h_zombie', 'gib1', 'gib2', 'gib3', 'zom_gib'
] );

export function R_NewerSetIndex( index ) {

	skinIndex = index != null && index.models != null ? index.models : null;
	nativeHeights = index != null && index.nativeHeights != null ? index.nativeHeights : {};
	skinVersion = String( index != null && index.version != null ? index.version : 0 );

}

function requestIndex() {

	if ( indexRequested || typeof fetch === 'undefined' ) return;
	indexRequested = true;

	COM_NewerJSON( BASE + 'index.json', BASE + 'index.json' )
		.then( R_NewerSetIndex )
		.catch( () => { /* no replacement skins available */ } );

}

// "progs/wizard.mdl" -> "wizard"
export function R_NewerModelKey( modelName ) {

	if ( modelName == null || modelName.indexOf( 'progs/' ) !== 0 || modelName.slice( - 4 ) !== '.mdl' ) return null;
	return modelName.slice( 6, - 4 );

}

let levelSalt = ( Math.random() * 0xffffffff ) >>> 0;

// a fresh roll for every monster whenever a level starts
export function R_NewerSkinsNewMap() {

	levelSalt = ( Math.random() * 0xffffffff ) >>> 0;

}

export function R_NewerSetSalt( salt ) {

	levelSalt = salt >>> 0;

}

function hash32( a, b ) {

	let h = ( a ^ 0x9e3779b9 ) + Math.imul( b | 0, 0x85ebca6b );
	h ^= h >>> 16;
	h = Math.imul( h, 0x7feb352d );
	h ^= h >>> 15;
	h = Math.imul( h, 0x846ca68b );
	h ^= h >>> 16;
	return h >>> 0;

}

function stringHash( str ) {

	let h = 2166136261;
	for ( let i = 0; i < str.length; i ++ ) h = Math.imul( h ^ str.charCodeAt( i ), 16777619 );
	return h >>> 0;

}

/*
================
R_NewerPickVariant

Which of count skins this monster wears.  Stable for the monster for the whole
level; random between monsters and between levels.
================
*/
export function R_NewerPickVariant( entity, modelKey, count ) {

	if ( count <= 1 || r_newer_variety.value === 0 ) return 0;

	let id = entity._entityIndex;
	if ( id === undefined ) {

		// entities without a slot number (static ones) get one of their own
		if ( entity._qrSeed === undefined ) entity._qrSeed = ( Math.random() * 0x7fffffff ) | 0;
		id = entity._qrSeed;

	}

	return hash32( levelSalt ^ stringHash( modelKey ), id ) % count;

}

const sets = new Map();
let dummy = null;

function dummyTexture() {

	if ( dummy === null ) {

		dummy = new THREE.DataTexture( new Uint8Array( [ 128, 128, 255, 255 ] ), 1, 1, THREE.RGBAFormat );
		dummy.needsUpdate = true;

	}

	return dummy;

}

function createSet( variant, modelKey ) {

	const key = variant.dir;
	const set = {
		key,
		version: skinVersion,
		alive: true,
		diffuse: null,
		detailDiffuse: null,
		heightTexture: null,
		variant,
		isEnemy: ENEMY_SKIN_MODELS.has( modelKey ),
		materials: [ null, null, null, null ], // [ lit, unlit ] with the Newer lighting, then without
		uniforms: {
			qrNormal: { value: null },
			qrLuma: { value: null },
			qrGloss: { value: null },
			uHasNormal: { value: 0 },
			uSkinDetail: { get value() { return R_IsNewer() && r_newer_normals.value !== 0 ? 1 : 0; } },
			uSkinRelit: { get value() { return R_IsNewer() && R_NewerLightingActive() ? 1 : 0; } },
			uHasLuma: { value: 0 },
			uHasGloss: { value: 0 },
			uFlipGreen: { value: variant.flipGreen === true ? 1 : 0 },
			uLumaBoost: { value: 1.6 }
		}
	};

	if ( typeof THREE.TextureLoader === 'undefined' || typeof document === 'undefined' ) return set;

	const loader = new THREE.TextureLoader();

	const load = ( name, colour, done ) => {

		const file = variant.maps[ name ];
		if ( file === undefined ) return;

		loader.load( COM_NewerURL( BASE + key + '/' + file, BASE + key + '/' + file + '?v=' + skinVersion ), ( texture ) => {

			if ( ! set.alive ) { texture.dispose(); return; }
			texture.flipY = false; // skins are stored top row first, like Quake's own
			texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
			texture.anisotropy = 16;
			texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
			done( texture );

		}, undefined, () => {

			if ( ! set.alive ) return;
			if ( name === 'height' ) { set.heightFailed = true; refreshHeight( set ); }

		} );

	};

	load( 'diffuse', true, ( t ) => { set.diffuse = t; refreshHeight( set ); } );
	load( 'height', false, ( t ) => { set.heightTexture = t; refreshHeight( set ); } );
	load( 'normal', false, ( t ) => {

		set.uniforms.qrNormal.value = t; set.uniforms.uHasNormal.value = 1;
		set.uniforms.uFlipGreen.value = variant.flipGreen === true ? 1 : 0;
		if ( set.heightTexture != null ) refreshHeight( set );

	} );
	load( 'luma', true, ( t ) => { set.uniforms.qrLuma.value = t; set.uniforms.uHasLuma.value = 1; } );
	load( 'gloss', false, ( t ) => { set.uniforms.qrGloss.value = t; set.uniforms.uHasGloss.value = 1; } );

	return set;

}

// Decode once, retaining the actual diffuse Texture's browser image for upload.
// R_NormalMapFor expects readable DataTexture pixels, so it gets a data-only
// companion with identical dimensions/UV offset rather than changing the image type.
function readablePixels( texture ) {

	const image = texture != null ? texture.image : null;
	if ( image == null ) return null;
	if ( image.data != null ) return image;
	if ( typeof document === 'undefined' ) return null;
	const canvas = document.createElement( 'canvas' );
	canvas.width = image.width; canvas.height = image.height;
	const ctx = canvas.getContext( '2d', { willReadFrequently: true } );
	ctx.drawImage( image, 0, 0 );
	return { data: ctx.getImageData( 0, 0, image.width, image.height ).data, width: image.width, height: image.height };

}

function refreshHeight( set ) {

	if ( ! set.isEnemy || set.diffuse == null ) return;
	if ( set.heightTexture == null && set.variant.maps.height !== undefined && ! set.heightFailed ) return;
	if ( set.heightTexture == null && set.variant.maps.normal !== undefined ) return;
	const pixels = readablePixels( set.diffuse );
	if ( pixels == null ) return;
	let stored = readablePixels( set.heightTexture );
	// Mismatched downloads never attach a height field to the wrong skin layout.
	if ( stored != null && ( stored.width !== pixels.width || stored.height !== pixels.height ) ) {

		set.heightTexture.dispose(); set.heightTexture = null; set.heightFailed = true;
		if ( set.detailDiffuse !== null ) return; // existing generated relief remains valid
		stored = null; // generate from this custom diffuse if no fallback exists yet

	}
	const previousNormal = set.uniforms.qrNormal.value;
	const ownedNormal = set.detailDiffuse != null ? set.detailDiffuse._normalMap : null;
	if ( previousNormal != null && previousNormal !== ownedNormal ) previousNormal.dispose();
	// A fresh data companion owns one generated normal and one dispose listener.
	// Reusing a disposed companion would retain old normal-dispose callbacks.
	if ( set.detailDiffuse != null ) set.detailDiffuse.dispose();
	set.detailDiffuse = new THREE.DataTexture( pixels.data, pixels.width, pixels.height, THREE.RGBAFormat );
	set.detailDiffuse.offset.copy( set.diffuse.offset );

	const height = stored != null ? Float32Array.from( { length: stored.width * stored.height }, ( _, i ) => stored.data[ i * 4 ] / 255 )
		: R_MultiScaleHeight( R_HeightFromRGBA( pixels.data, pixels.width, pixels.height, null ), pixels.width, pixels.height );
	set.detailDiffuse.userData.newerHeight = {
		file: 'enemy:' + set.version + ':' + set.key + ( stored != null ? ':stored' : ':generated' ),
		width: pixels.width, height: pixels.height, data: height,
		strength: set.variant.heightStrength ?? 0.65, cap: set.variant.heightCap ?? 0.55
	};
	set.uniforms.qrNormal.value = R_NormalMapFor( set.detailDiffuse );
	set.uniforms.uHasNormal.value = 1;
	set.uniforms.uFlipGreen.value = 0; // same top-row-first convention as the engine generator

}

const nativeSets = new Map(); // selected native Texture -> detail/material set

export function R_EnemyAliasMaterial( texture, modelName, hasLighting, skinnum = 0, frame = 0 ) {

	const key = R_NewerModelKey( modelName );
	if ( ! R_IsNewer() || r_newer_normals.value === 0 || ! ENEMY_SKIN_MODELS.has( key ) || texture == null ) return null;
	if ( skinIndex === null ) requestIndex();
	let set = nativeSets.get( texture );
	if ( set === undefined ) {

		const variant = { dir: 'native/' + key + '/' + skinnum + '/' + frame + '/' + texture.uuid, maps: {}, heightStrength: 0.65, heightCap: 0.55 };
		set = createSet( variant, key );
		set.diffuse = texture;
		refreshHeight( set ); // all native skins/animated frames work even without a stored asset
		nativeSets.set( texture, set );
		set.onDiffuseDispose = () => {

			set.alive = false;

			for ( const m of set.materials ) if ( m !== null ) m.dispose();
			if ( set.detailDiffuse !== null ) set.detailDiffuse.dispose();
			if ( set.heightTexture !== null ) set.heightTexture.dispose();
			nativeSets.delete( texture );

		};
		texture.addEventListener( 'dispose', set.onDiffuseDispose );

	}

	const groups = nativeHeights[ key ];
	const list = groups != null ? ( groups[ skinnum ] || groups[ 0 ] ) : null;
	// Match gl_model's j & 3 animation slots, including groups longer than four.
	const stored = list != null && list.length > 0 ? ( list.length <= 4 ? list[ frame % list.length ]
		: list.filter( ( _, i ) => ( i & 3 ) === frame ).at( - 1 ) ) : null;
	const requestKey = stored != null ? skinVersion + ':' + stored.file : null;
	const requestVersion = skinVersion;
	if ( stored != null && set.requestedHeight !== requestKey && typeof THREE.TextureLoader !== 'undefined' && typeof document !== 'undefined' ) {

		set.requestedHeight = requestKey;
		new THREE.TextureLoader().load( COM_NewerURL( BASE + stored.file, BASE + stored.file + '?v=' + skinVersion ), ( height ) => {

			if ( nativeSets.get( texture ) !== set || ! set.alive || set.requestedHeight !== requestKey ) { height.dispose(); return; }
			height.flipY = false; height.colorSpace = THREE.NoColorSpace;
			if ( set.heightTexture !== null ) set.heightTexture.dispose();
			set.heightTexture = height; set.version = requestVersion;
			set.variant.heightStrength = stored.strength; set.variant.heightCap = stored.cap;
			refreshHeight( set );

		}, undefined, () => { /* generated height remains active on download failure */ } );

	}

	return materialFor( set, hasLighting );

}

function materialFor( set, hasLighting ) {

	const relit = R_NewerLightingActive();
	const index = ( hasLighting ? 1 : 0 ) + ( relit ? 0 : 2 );
	if ( set.materials[ index ] === null ) {

		const material = new THREE.MeshBasicMaterial( { map: set.diffuse, vertexColors: hasLighting } );
		if ( relit || set.isEnemy ) {

			material.onBeforeCompile = patchShader( set );
			material.customProgramCacheKey = () => 'quake-custom-skin-' + set.key + index;

		}
		set.materials[ index ] = material;

	}
	return set.materials[ index ];

}

const VERTEX_ADD = `
	vQrView = - mvPosition.xyz;
	vQrNormal = normalize( normalMatrix * normal );`;

const FRAGMENT_HEAD = `
layout(location = 1) out highp vec4 gNormal;
varying vec3 vQrView;
varying vec3 vQrNormal;
uniform sampler2D qrNormal;
uniform sampler2D qrLuma;
uniform sampler2D qrGloss;
uniform float uHasNormal;
uniform float uSkinDetail;
uniform float uSkinRelit;
uniform float uHasLuma;
uniform float uHasGloss;
uniform float uFlipGreen;
uniform float uLumaBoost;
`;

const FRAGMENT_NORMAL = `
	vec3 qrN = normalize( vQrNormal );
	if ( uHasNormal > 0.5 && uSkinDetail > 0.5 ) {
		vec3 q0 = dFdx( - vQrView );
		vec3 q1 = dFdy( - vQrView );
		vec2 st0 = dFdx( vMapUv );
		vec2 st1 = dFdy( vMapUv );
		vec3 q1perp = cross( q1, qrN );
		vec3 q0perp = cross( qrN, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = det == 0.0 ? 0.0 : inversesqrt( det );
		vec3 mapN = texture2D( qrNormal, vMapUv ).xyz * 2.0 - 1.0;
		if ( uFlipGreen > 0.5 ) mapN.y = - mapN.y; // OpenGL style maps
		qrN = normalize( mat3( T * scale, B * scale, qrN ) * mapN );
	}
`;

const FRAGMENT_LIGHT = `
	if ( uSkinRelit > 0.5 ) {
	if ( uHasLuma > 0.5 )
		outgoingLight += texture2D( qrLuma, vMapUv ).rgb * uLumaBoost;
	if ( uHasGloss > 0.5 ) {
		float rim = pow( 1.0 - abs( dot( qrN, normalize( vQrView ) ) ), 3.0 );
		outgoingLight += texture2D( qrGloss, vMapUv ).r * rim * 0.3 * ( outgoingLight + 0.08 );
	}
	}
`;

function patchShader( set ) {

	return function ( shader ) {

		Object.assign( shader.uniforms, set.uniforms );

		shader.vertexShader = 'varying vec3 vQrView;\nvarying vec3 vQrNormal;\n' +
			shader.vertexShader.replace( '#include <project_vertex>', '#include <project_vertex>' + VERTEX_ADD );

		shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
			.replace( '#include <map_fragment>', '#include <map_fragment>' + FRAGMENT_NORMAL )
			.replace( '#include <opaque_fragment>', FRAGMENT_LIGHT + '#include <opaque_fragment>' )
			.replace( '#include <colorspace_fragment>', '#include <colorspace_fragment>\n	gNormal = vec4( qrN * 0.5 + 0.5, vQrView.z );' );

	};

}

/*
================
R_NewerAliasMaterial

The replacement material for this monster, or null when its model has no custom
skin, Newer Game or its enemies are off, or the skin has not finished loading.
================
*/
export function R_NewerAliasMaterial( entity, modelName, hasLighting, skinnum = 0 ) {

	if ( ! R_IsNewer() || r_newer_enemies.value === 0 ) return null;

	if ( skinIndex === null ) {

		requestIndex();
		return null;

	}

	const key = R_NewerModelKey( modelName );
	const all = key !== null ? skinIndex[ key ] : undefined;
	if ( all === undefined ) return null;

	// a variant with a "skin" number is for that skin of the model only (the armor's
	// green, yellow and red); the others are the model's skin 0
	if ( all._bySkin === undefined ) all._bySkin = {};
	let variants = all._bySkin[ skinnum ];
	if ( variants === undefined ) variants = all._bySkin[ skinnum ] = all.filter( ( v ) => ( v.skin || 0 ) === skinnum );
	if ( variants.length === 0 ) return null;

	const variant = variants[ R_NewerPickVariant( entity, key, variants.length ) ];

	const setKey = skinVersion + ':' + variant.dir;
	let set = sets.get( setKey );
	if ( set === undefined ) {

		set = createSet( variant, key );
		sets.set( setKey, set );

	}

	if ( set.diffuse === null ) return null;

	// with the Newer lighting the skin is relit by the pipeline; without it (the
	// classic lighting) it is the same picture lit the classic way
	return materialFor( set, hasLighting );

}

export function R_NewerSkinsShutdown() {

	for ( const set of sets.values() ) {

		set.alive = false;

		for ( const m of set.materials ) if ( m !== null ) m.dispose();
		const ownedNormal = set.detailDiffuse != null ? set.detailDiffuse._normalMap : null;
		if ( set.diffuse !== null ) set.diffuse.dispose();
		if ( set.detailDiffuse !== null ) set.detailDiffuse.dispose();
		if ( set.heightTexture !== null ) set.heightTexture.dispose();
		for ( const u of [ set.uniforms.qrNormal, set.uniforms.qrLuma, set.uniforms.qrGloss ] )
			if ( u.value !== null && u.value !== ownedNormal ) u.value.dispose();

	}

	sets.clear();
	for ( const [ texture, set ] of nativeSets ) {

		set.alive = false;

		for ( const m of set.materials ) if ( m !== null ) m.dispose();
		if ( set.detailDiffuse !== null ) set.detailDiffuse.dispose();
		if ( set.heightTexture !== null ) set.heightTexture.dispose();
		texture.removeEventListener( 'dispose', set.onDiffuseDispose );
		// Native diffuse textures belong to the model loader, never to this cache.

	}
	nativeSets.clear();

}
