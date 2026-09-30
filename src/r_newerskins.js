// Newer Game enemy skins: custom upsampled replacements listed in
// newer/enemies/index.json. Each model currently has one custom diffuse map;
// models without an entry retain their original Quake skins.
//
// The loader also supports multiple variants and optional material maps:
//
//   diffuse  replaces the skin
//   luma     glows on top of the lit skin (brighter than white in HDR)
//   gloss    a wet rim sheen where the surface turns away from you
//   normal   bump detail; also written to the lighting pass's normal buffer, so
//            the sun and torches light the relief (tangent frame from the skin's
//            UVs).  Supplied maps are OpenGL style, so their green is flipped;
//            generated ones are not.
//
// Textures load in the background the first time a skin is chosen; until they
// have arrived the original skin is shown.

import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { R_IsNewer, R_NewerLightingActive, r_newer_enemies } from './r_anim.js';

// 1 = each monster picks one of its model's skins at random, 0 = always the first
export const r_newer_variety = new cvar_t( 'r_newer_variety', '1' );

const BASE = 'newer/enemies/';

// model name -> [ { dir, maps: { diffuse, normal, luma, gloss }, flipGreen } ]
let skinIndex = null;
let indexRequested = false;

export function R_NewerSetIndex( index ) {

	skinIndex = index != null && index.models != null ? index.models : null;

}

function requestIndex() {

	if ( indexRequested || typeof fetch === 'undefined' ) return;
	indexRequested = true;

	fetch( BASE + 'index.json' )
		.then( ( r ) => r.ok ? r.json() : null )
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

function createSet( variant ) {

	const key = variant.dir;
	const set = {
		key,
		diffuse: null,
		materials: [ null, null, null, null ], // [ lit, unlit ] with the Newer lighting, then without
		uniforms: {
			qrNormal: { value: null },
			qrLuma: { value: null },
			qrGloss: { value: null },
			uHasNormal: { value: 0 },
			uHasLuma: { value: 0 },
			uHasGloss: { value: 0 },
			uFlipGreen: { value: variant.flipGreen === true ? 1 : 0 },
			uLumaBoost: { value: 1.6 }
		}
	};

	if ( typeof THREE.TextureLoader === 'undefined' ) return set;

	const loader = new THREE.TextureLoader();

	const load = ( name, colour, done ) => {

		const file = variant.maps[ name ];
		if ( file === undefined ) return;

		loader.load( BASE + key + '/' + file, ( texture ) => {

			texture.flipY = false; // skins are stored top row first, like Quake's own
			texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
			texture.anisotropy = 16;
			texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
			done( texture );

		}, undefined, () => { /* this skin has no such map */ } );

	};

	load( 'diffuse', true, ( t ) => { set.diffuse = t; } );
	load( 'normal', false, ( t ) => { set.uniforms.qrNormal.value = t; set.uniforms.uHasNormal.value = 1; } );
	load( 'luma', true, ( t ) => { set.uniforms.qrLuma.value = t; set.uniforms.uHasLuma.value = 1; } );
	load( 'gloss', false, ( t ) => { set.uniforms.qrGloss.value = t; set.uniforms.uHasGloss.value = 1; } );

	return set;

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
uniform float uHasLuma;
uniform float uHasGloss;
uniform float uFlipGreen;
uniform float uLumaBoost;
`;

const FRAGMENT_NORMAL = `
	vec3 qrN = normalize( vQrNormal );
	if ( uHasNormal > 0.5 ) {
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
	if ( uHasLuma > 0.5 )
		outgoingLight += texture2D( qrLuma, vMapUv ).rgb * uLumaBoost;
	if ( uHasGloss > 0.5 ) {
		float rim = pow( 1.0 - abs( dot( qrN, normalize( vQrView ) ) ), 3.0 );
		outgoingLight += texture2D( qrGloss, vMapUv ).r * rim * 0.3 * ( outgoingLight + 0.08 );
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
export function R_NewerAliasMaterial( entity, modelName, hasLighting ) {

	if ( ! R_IsNewer() || r_newer_enemies.value === 0 ) return null;

	if ( skinIndex === null ) {

		requestIndex();
		return null;

	}

	const key = R_NewerModelKey( modelName );
	const variants = key !== null ? skinIndex[ key ] : undefined;
	if ( variants === undefined || variants.length === 0 ) return null;

	const variant = variants[ R_NewerPickVariant( entity, key, variants.length ) ];

	let set = sets.get( variant.dir );
	if ( set === undefined ) {

		set = createSet( variant );
		sets.set( variant.dir, set );

	}

	if ( set.diffuse === null ) return null;

	// with the Newer lighting the skin is relit by the pipeline; without it (the
	// classic lighting) it is the same picture lit the classic way
	const relit = R_NewerLightingActive();
	const index = ( hasLighting ? 1 : 0 ) + ( relit ? 0 : 2 );
	if ( set.materials[ index ] === null ) {

		const material = new THREE.MeshBasicMaterial( { map: set.diffuse, vertexColors: hasLighting } );
		if ( relit ) {

			material.onBeforeCompile = patchShader( set );
			material.customProgramCacheKey = () => 'quake-custom-skin-' + variant.dir + index;

		}

		set.materials[ index ] = material;

	}

	return set.materials[ index ];

}

export function R_NewerSkinsShutdown() {

	for ( const set of sets.values() ) {

		for ( const m of set.materials ) if ( m !== null ) m.dispose();
		if ( set.diffuse !== null ) set.diffuse.dispose();
		for ( const u of [ set.uniforms.qrNormal, set.uniforms.qrLuma, set.uniforms.qrGloss ] )
			if ( u.value !== null ) u.value.dispose();

	}

	sets.clear();

}
