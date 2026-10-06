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

import {R_NormalPrepare} from './normal_prepare.js';
import * as THREE from 'three';
import { R_LevelEntities } from './r_levelents.js';
import { ACTOR_COAT_GLSL, ACTOR_COAT_MAP_GLSL, R_ActiveWeaponSurface } from './r_weapon_surface.js';
import { R_WeaponStyleGLSL } from './r_weaponstyle.js';
import { heightShadowUniforms, HEIGHT_SHADOW_GLSL } from './r_heightshadows.js';
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
export const NEWER_SKIN_TIMEOUT_MS = 30000;
let indexState = 'idle', indexError = null, indexGeneration = 0, indexTimer = null;
let indexPromise = null, indexResolve = null;
const preparations = new Map(), modelIdentities = new WeakMap();
let modelSerial = 0, preparationEpoch = 0;

// TextureLoader has no abort API. A terminal request rejects late callbacks and
// disposes late textures; shutdown/revision cancellation also clears its timer.
function loadSkinTexture( set, key, url, done, failed = () => {} ) {
	set.loads ||= new Map(); set.cancellations ||= new Set();
	let terminal = false;
	const finish = ( error, texture ) => {
		if ( terminal ) { texture?.dispose(); return; }
		terminal = true; clearTimeout( timer ); set.cancellations.delete( cancel );
		if ( ! set.alive ) { texture?.dispose(); set.loads.set( key, { status: 'fallback', error: 'Cancelled' } ); return; }
		if ( error ) { set.loads.set( key, { status: 'fallback', error: String( error.message || error ) } ); failed(); return; }
		try { done( texture ); set.loads.set( key, { status: 'ready', error: null } ); }
		catch ( caught ) { texture.dispose(); set.loads.set( key, { status: 'fallback', error: String( caught.message || caught ) } ); failed(); }
	};
	const cancel = () => finish( new Error( 'Cancelled' ) );
	const timer = setTimeout( () => finish( new Error( key + ' timed out' ) ), NEWER_SKIN_TIMEOUT_MS );
	set.loads.set( key, { status: 'loading', error: null } ); set.cancellations.add( cancel );
	try { new THREE.TextureLoader().load( url, texture => finish( null, texture ), undefined, () => finish( new Error( key + ' unavailable' ) ) ); }
	catch ( error ) { finish( error ); }
	return cancel;
}
function cancelSkinLoads( set ) { for ( const cancel of set.cancellations || [] ) cancel(); }

// Stock Quake enemies, enemy heads and shared gore. Native height generation
// also covers registered-game models absent from this checkout's shareware pak.
export const ENEMY_SKIN_MODELS = new Set( [
	'boss', 'demon', 'dog', 'enforcer', 'fish', 'hknight', 'knight', 'ogre', 'oldone',
	'shalrath', 'shambler', 'soldier', 'tarbaby', 'wizard', 'zombie', 'h_demon',
	'h_dog', 'h_hellkn', 'h_knight', 'h_ogre', 'h_shal', 'h_shams', 'h_guard',
	'h_wizard', 'h_zombie', 'gib1', 'gib2', 'gib3', 'zom_gib'
] );

export function R_NewerSetIndex( index ) {

	clearTimeout( indexTimer ); indexGeneration ++;
	skinIndex = index != null ? index.models || {} : null;
	indexState = index == null ? 'idle' : index.models ? 'ready' : 'fallback';
	indexError = index != null && ! index.models ? 'Missing skin manifest' : null;
	if ( index == null ) indexRequested = false;
	nativeHeights = index != null && index.nativeHeights != null ? index.nativeHeights : {};
	skinVersion = String( index != null && index.version != null ? index.version : 0 );
	indexResolve?.(); indexResolve = null;
	indexPromise = index == null ? null : Promise.resolve();

}

function requestIndex() {

	if ( skinIndex !== null || indexRequested ) return indexPromise || Promise.resolve();
	if ( typeof fetch === 'undefined' ) { skinIndex = {}; indexState = 'fallback'; indexError = 'Skin index transport unavailable'; return Promise.resolve(); }
	indexPromise = new Promise( resolve => { indexResolve = resolve; } );
	const requested = indexPromise;
	indexRequested = true; indexState = 'loading';
	const generation = ++ indexGeneration;
	const fallback = error => { if ( generation !== indexGeneration ) return; clearTimeout( indexTimer ); skinIndex = {}; indexState = 'fallback'; indexError = String( error.message || error ); indexGeneration ++; indexResolve?.(); indexResolve = null; };
	indexTimer = setTimeout( () => fallback( new Error( 'Skin index timed out' ) ), NEWER_SKIN_TIMEOUT_MS );

	COM_NewerJSON( BASE + 'index.json', BASE + 'index.json' )
		.then( data => { if ( generation === indexGeneration ) R_NewerSetIndex( data ); } )
		.catch( fallback );
	return requested;

}

// "progs/wizard.mdl" -> "wizard"
export function R_NewerModelKey( modelName ) {

	if ( modelName == null || modelName.indexOf( 'progs/' ) !== 0 || modelName.slice( - 4 ) !== '.mdl' ) return null;
	return modelName.slice( 6, - 4 );

}

// Existing variants stay filename/skin compatible. A constrained variant may
// be selected only after its actual loaded native model identity is ready.
export function R_NewerVariantMatchesModel(variant,model){
 const expected=variant?.nativeModelSha256;
 if(expected===undefined)return true;
 return typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&model?.aliasSourceIdentity?.state==='ready'&&model.aliasSourceIdentity.sha256===expected;
}
function setMatchesModels(set,models){
 if(set.variant?.nativeModelSha256===undefined||models==null)return true;
 const current=Array.isArray(models)?models:[models];
 return current.some(model=>typeof model==='object'&&model&&R_NewerModelKey(model.name)===set.modelKey&&R_NewerVariantMatchesModel(set.variant,model));
}

let levelSalt = ( Math.random() * 0xffffffff ) >>> 0;

// a fresh roll for every monster whenever a level starts
export function R_NewerSkinsNewMap() {

	levelSalt = ( Math.random() * 0xffffffff ) >>> 0;

}

export function R_NewerSetSalt( salt ) {

	levelSalt = salt >>> 0;

}
export function R_NewerSkinSalt() { return levelSalt; }

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

	return hash32( ( entity._qrSalt ?? levelSalt ) ^ stringHash( modelKey ), id ) % count;

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
		modelKey, loads: new Map(), cancellations: new Set(),
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

	const load = ( name, colour, done ) => {

		const file = variant.maps[ name ];
		if ( file === undefined ) return;

		loadSkinTexture( set, name, COM_NewerURL( BASE + key + '/' + file, BASE + key + '/' + file + '?v=' + skinVersion ), ( texture ) => {

			if ( ! set.alive ) { texture.dispose(); return; }
			texture.flipY = false; // skins are stored top row first, like Quake's own
			texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
			texture.anisotropy = 16;
			texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
			done( texture );

		}, () => {

			if ( ! set.alive ) return;
			if ( name === 'height' ) { set.heightFailed = true; refreshHeight( set ); }
			if ( name === 'normal' ) { set.normalFailed = true; refreshHeight( set ); }

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

	if ( ! set.isEnemy || set.diffuse == null || typeof window!=='undefined'&&r_newer_normals.value===0 ) return;
	if ( set.heightTexture == null && set.variant.maps.height !== undefined && ! set.heightFailed ) return;
	if ( set.heightTexture == null && set.variant.maps.normal !== undefined && ! set.normalFailed ) return;
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
		: typeof window!=='undefined'?undefined:R_MultiScaleHeight( R_HeightFromRGBA( pixels.data, pixels.width, pixels.height, null ), pixels.width, pixels.height );
	set.detailDiffuse.userData.newerHeight = {
		file: 'enemy:' + set.version + ':' + set.key + ( stored != null ? ':stored' : ':generated' ),
		width: pixels.width, height: pixels.height, data: height, derive:stored==null,
		strength: set.variant.heightStrength ?? 0.65, cap: set.variant.heightCap ?? 0.55
	};
 const companion=set.detailDiffuse;
 const bind=()=>{if(!set.alive||set.detailDiffuse!==companion)return;set.uniforms.qrNormal.value=R_NormalMapFor(companion);set.uniforms.uHasNormal.value=set.uniforms.qrNormal.value?1:0;set.uniforms.uFlipGreen.value=0;};
 if(typeof window!=='undefined'){set.normalWork=R_NormalPrepare(companion);set.normalWork.promise.then(bind);}
 bind();

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
			cancelSkinLoads( set );

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
		set.cancelHeight?.();
		set.cancelHeight = loadSkinTexture( set, 'native-height', COM_NewerURL( BASE + stored.file, BASE + stored.file + '?v=' + skinVersion ), ( height ) => {

			if ( nativeSets.get( texture ) !== set || ! set.alive || set.requestedHeight !== requestKey ) { height.dispose(); return; }
			height.flipY = false; height.colorSpace = THREE.NoColorSpace;
			if ( set.heightTexture !== null ) set.heightTexture.dispose();
			set.heightTexture = height; set.version = requestVersion;
			set.variant.heightStrength = stored.strength; set.variant.heightCap = stored.cap;
			refreshHeight( set );

		} ); // generated height remains active on explicit failure/timeout

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
			material.customProgramCacheKey = () => 'quake-custom-skin-height-shadow-v1-' + set.key + index;

		}
		set.materials[ index ] = material;

	}
	return set.materials[ index ];

}

const VERTEX_ADD = `
	vActorUv=uv;
 vQrView = - mvPosition.xyz;
	#ifdef USE_INSTANCING
		mat3 qrInstance = mat3( instanceMatrix );
		vec3 qrInstanceNormal = normal / vec3( dot( qrInstance[ 0 ], qrInstance[ 0 ] ), dot( qrInstance[ 1 ], qrInstance[ 1 ] ), dot( qrInstance[ 2 ], qrInstance[ 2 ] ) );
		vQrNormal = normalize( normalMatrix * ( qrInstance * qrInstanceNormal ) );
	#else
		vQrNormal = normalize( normalMatrix * normal );
	#endif`;

const FRAGMENT_HEAD = `
layout(location = 1) out highp vec4 gNormal;
layout(location = 2) out highp vec4 gAlbedo;
layout(location = 3) out highp vec4 gHeightMask;
varying vec2 vActorUv;
#ifndef USE_MAP
#define vMapUv vActorUv
#endif
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
	float qrCoverage=diffuseColor.a;
 vec3 qrAlbedo = diffuseColor.rgb; // before baked vertex lighting
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
	if ( uHasLuma > 0.5 ) {
		vec3 qrEmission = texture2D( qrLuma, vMapUv ).rgb * uLumaBoost;
		// imported_emission_style
		outgoingLight += qrEmission;
	}
	if ( uHasGloss > 0.5 ) {
		float rim = pow( 1.0 - abs( dot( qrN, normalize( vQrView ) ) ), 3.0 );
		outgoingLight += texture2D( qrGloss, vMapUv ).r * rim * 0.3 * outgoingLight;
	}
	}
`;

function patchShader( set ) {

	return function ( shader ) {

		Object.assign( shader.uniforms, set.uniforms, heightShadowUniforms );
  const surface=this.userData.quakePlayerSurface===true;
  shader.uniforms.uActorCoatOn={get value(){return surface&&R_IsNewer()?1:0;}};
  shader.uniforms.uActorBloodSpots={get value(){return R_ActiveWeaponSurface().spots;}};
		shader.uniforms.uHasSkinHeightShadow = { get value() { return set.uniforms.qrNormal.value?.userData.heightSource ? 1 : 0; } };

		shader.vertexShader = 'varying vec2 vActorUv;\nvarying vec3 vQrView;\nvarying vec3 vQrNormal;\n' +
			shader.vertexShader.replace( '#include <project_vertex>', '#include <project_vertex>' + VERTEX_ADD );

		shader.fragmentShader = FRAGMENT_HEAD + ACTOR_COAT_GLSL + HEIGHT_SHADOW_GLSL + ( set.fragmentHead || '' ) + shader.fragmentShader
			.replace( '#include <map_fragment>', '#include <map_fragment>' + ( set.mapFragment || '' ) + ACTOR_COAT_MAP_GLSL + FRAGMENT_NORMAL )
			.replace( '#include <opaque_fragment>', `
 vec4 skinHeightMask=vec4(1.);HeightShadowContext hctx;
 hctx.microUv=vMapUv;hctx.macroUv=vec2(0.);
 hctx.normal=normalize(vQrNormal)*(gl_FrontFacing?1.:-1.);
 qrHeightGradients(-vQrView,vMapUv,hctx.normal,hctx.microGradU,hctx.microGradV,hctx.microUnit);
 hctx.macroGradU=vec3(0.);hctx.macroGradV=vec3(0.);hctx.macroUnit=0.;
 hctx.microAmp=.015;hctx.macroAmp=0.;hctx.microMaxUv=.03;hctx.macroMaxUv=0.;
 hctx.microValid=uHasSkinHeightShadow*uSkinDetail*uSkinRelit;hctx.macroValid=0.;hctx.macroSun=1.;
 float unusedSkinDiffuseVisibility;skinHeightMask=qrHeightBuildMask(-vQrView,hctx,unusedSkinDiffuseVisibility);
 ${this.depthWrite === false ? 'skinHeightMask=vec4(0.);' : this.transparent && !this.userData.quakeViewmodel ? 'skinHeightMask=vec4(1.);' : ''}
 ` + FRAGMENT_LIGHT.replace( '// imported_emission_style', set.emissionFragment || '' ) + '#include <opaque_fragment>' )
			.replace( '#include <colorspace_fragment>', '#include <colorspace_fragment>\n\tgNormal = ' + ( this.depthWrite === false || this.transparent && !this.userData.quakeViewmodel ? 'vec4(0.)' : this.userData.quakeViewmodel ? 'vec4(qrN*0.5+0.5,-vQrView.z-2.)' : 'vec4(qrN*0.5+0.5,vQrView.z)' ) + ';\n\tgAlbedo = vec4( '+(this.userData.quakeReceiverOnly?'qrAlbedo*qrCoverage':'qrAlbedo')+', '+(surface?'0.08':'0.06')+' );\n gHeightMask=skinHeightMask;' );

  shader.fragmentShader = shader.fragmentShader.replace( 'void main() {', `
 uniform float uHasSkinHeightShadow;
 float qrShadowHeight(vec2 uv,int layer){return textureLod(qrNormal,uv,0.).a;}
 bool qrShadowKnown(vec2 uv,int layer){return all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)));}
 void main() {` );

	};

}

// Imported alias geometry uses the same baked-light/normal/albedo contract as
// custom skins. The caller owns these already-loaded textures and materials.
export function R_AssetAliasMaterial( maps, key, authored = {} ) {

	const material = new THREE.MeshBasicMaterial( { map: maps.diffuse, vertexColors: true } );
	const style = R_WeaponStyleGLSL( authored.style, key );
	material.transparent = style.opacity < 1;
	if ( authored.baseColorFactor ) material.color.fromArray( authored.baseColorFactor );
	if ( authored.doubleSided ) material.side = THREE.DoubleSide;
	const set = { uniforms: {
		qrNormal: { value: maps.normal || null }, qrLuma: { value: maps.luma || null }, qrGloss: { value: null },
		uHasNormal: { value: maps.normal ? 1 : 0 }, uHasLuma: { value: maps.luma ? 1 : 0 }, uHasGloss: { value: 0 },
		uSkinDetail: { get value() { return R_IsNewer() && r_newer_normals.value !== 0 ? 1 : 0; } },
		uSkinRelit: { get value() { return R_NewerLightingActive() ? 1 : 0; } },
		uFlipGreen: { value: authored.normalFlipGreen ? 1 : 0 }, uLumaBoost: { value: Math.max( ...( authored.emissiveFactor || [ 0, 0, 0 ] ) ) }
	} };
	set.fragmentHead = style.head; set.mapFragment = style.map; set.emissionFragment = style.emission;
	if ( style.wrap ) {

		set.uniforms.qrNativeSkin = { value: null }; set.uniforms.uHasNativeSkin = { value: 0 };
		material._quakeNativeSkin = { texture: set.uniforms.qrNativeSkin, ready: set.uniforms.uHasNativeSkin };

	}
	material.onBeforeCompile = patchShader( set );
	material.customProgramCacheKey = () => 'quake-imported-alias-height-shadow-v1-' + key;
	return material;

}

// Three's Material.clone intentionally omits shader callbacks. Alias materials
// must keep their normal/albedo outputs when the view or instances clone them.
export function R_CloneAliasMaterial( material ) {

	const clone = material.clone();
	clone.onBeforeCompile = material.onBeforeCompile;
	clone.customProgramCacheKey = function(){return material.customProgramCacheKey.call(this)+(this.userData.quakeViewmodel?'-held-receiver':'')+(this.userData.quakePlayerSurface?'-player-surface':'')+(this.userData.quakeReceiverOnly?'-receiver-data':'');};
	clone._quakeNativeSkin = material._quakeNativeSkin;
	return clone;

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
 const constrained=all.some(variant=>variant.nativeModelSha256!==undefined);
 const identity=entity?.model?.aliasSourceIdentity;
 const cacheKey=constrained?skinnum+':'+(identity?.state==='ready'?identity.sha256:'pending'):skinnum;
 let variants=all._bySkin[cacheKey];
 if(variants===undefined)variants=all._bySkin[cacheKey]=all.filter(variant=>(variant.skin||0)===skinnum&&R_NewerVariantMatchesModel(variant,entity?.model));
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

	preparationEpoch ++; preparations.clear();

	for ( const set of sets.values() ) {

		set.alive = false;
		cancelSkinLoads( set );

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
		cancelSkinLoads( set );

		for ( const m of set.materials ) if ( m !== null ) m.dispose();
		if ( set.detailDiffuse !== null ) set.detailDiffuse.dispose();
		if ( set.heightTexture !== null ) set.heightTexture.dispose();
		texture.removeEventListener( 'dispose', set.onDiffuseDispose );
		// Native diffuse textures belong to the model loader, never to this cache.

	}
	nativeSets.clear();

}

// Actual chosen sets/native animation heights only; callers may restrict this
// read-only snapshot to the current/demo model precache instead of portal art.
export function R_NewerSkinsStatus( modelNames ) {
	const names = modelNames == null ? null : ( Array.isArray( modelNames ) ? modelNames : [ modelNames ] );
	const keys = names ? new Set( names.map( value => R_NewerModelKey( typeof value === 'string' ? value : value?.name ) ).filter( Boolean ) ) : null;
	const selected = [ ...sets.values(), ...nativeSets.values() ].filter( set => set.alive && ( ! keys || keys.has( set.modelKey ) ) && setMatchesModels(set,modelNames) );
	let pending = 0, ready = 0, fallback = 0, preparePending = 0; const errors = {}; const normals={pending:0,ready:0,shipped:0,disk:0,generated:0,errors:{}};
	for ( const work of preparations.values() ) if ( ! work.started && ( ! work.isCurrent || work.isCurrent() ) && ( ! keys || [ ...work.keys ].some( key => keys.has( key ) ) ) ) preparePending ++;
	pending += preparePending;
	if ( R_IsNewer() && ( indexState === 'loading' || indexState === 'idle' && keys?.size ) ) pending ++;
	for ( const set of selected ) for ( const [ name, load ] of set.loads || [] ) {
		if ( load.status === 'loading' ) pending ++;
		else if ( load.status === 'ready' ) ready ++;
		else { fallback ++; if ( load.error ) errors[ set.modelKey + ':' + set.key + ':' + name ] = load.error; }
	}
	for(const set of selected)if(R_IsNewer()&&r_newer_normals.value!==0&&set.normalWork){if(set.normalWork.status!=='ready'){pending++;normals.pending++;if(set.normalWork.error){errors[set.modelKey+':normal']=set.normalWork.error;normals.errors[set.modelKey]=set.normalWork.error;}}else{normals.ready++;if(set.normalWork.source==='shipped')normals.shipped++;else if(set.normalWork.source==='disk')normals.disk++;else if(set.normalWork.source==='generated-and-stored')normals.generated++;}}
	if ( indexError ) errors.index = indexError;
	return { index: indexState, normals, preparePending, pending, ready, fallback, total: pending + ready + fallback, settled: pending === 0, errors };
}

// Only the initial BSP's native entity catalog is inspected before model setup.
// Start the existing custom-set requests; actual precache preparation/readiness
// still decides which material families must be uploaded before entry.
export function R_NewerSkinsPrefetchBsp(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<124)return Promise.resolve();
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),offset=view.getInt32(4,true),length=view.getInt32(8,true);
 if(![29,0x32505342,0x42535032].includes(view.getInt32(0,true))||offset<124||length<0||length>4*1024*1024||offset+length>bytes.length)return Promise.resolve();
 const text=new TextDecoder().decode(bytes.subarray(offset,offset+length)),keys=new Set(['gib1','gib2','gib3','zom_gib']);
 const heads={demon:'h_demon',dog:'h_dog',hknight:'h_hellkn',knight:'h_knight',ogre:'h_ogre',shalrath:'h_shal',shambler:'h_shams',enforcer:'h_guard',wizard:'h_wizard',zombie:'h_zombie'};
 for(let skill=0;skill<3;skill++)for(const entity of R_LevelEntities(text,null,null,skill)){const key=R_NewerModelKey(entity.model);if(key){keys.add(key);if(heads[key])keys.add(heads[key]);}}
 return requestIndex().then(()=>{for(const key of keys)for(const variant of skinIndex?.[key]||[]){if(variant.nativeModelSha256!==undefined)continue;const id=skinVersion+':'+variant.dir;if(!sets.has(id))sets.set(id,createSet(variant,key));}});
}

// Startup-only caller-owned preparation: all current-map variants and native
// skin animation slots share the exact caches used by later actual draws.
// Promise settlement means requests were started; Status waits for their images.
export function R_NewerSkinsPrepare( models ) {
	const current = [ ...new Set( ( models || [] ).filter( model => model && typeof model === 'object' && R_NewerModelKey( model.name ) ) ) ];
	const custom = R_IsNewer() && r_newer_enemies.value !== 0, native = R_IsNewer() && r_newer_normals.value !== 0;
	const sourceIdentities=current.map(model=>model.aliasSourceIdentity);
 const identityId=object=>{if(!object||typeof object!=='object')return 0;if(!modelIdentities.has(object))modelIdentities.set(object,++modelSerial);return modelIdentities.get(object);};
 const ids=current.map((model,i)=>identityId(model)+'@'+identityId(sourceIdentities[i])).sort();
 const sameSources=()=>current.every((model,i)=>model.aliasSourceIdentity===sourceIdentities[i]);
	const key = ids.join( ',' ) + ':' + Number( custom ) + ':' + Number( native ), previous = preparations.get( key );
	if ( previous && ( ! previous.started || previous.version === skinVersion ) ) return previous.promise;
	const epoch = preparationEpoch, work = { keys: new Set( current.map( model => R_NewerModelKey( model.name ) ) ), started: false, version: null, isCurrent:sameSources };
	preparations.set( key, work );
	work.promise = ( custom || native ? requestIndex() : Promise.resolve() ).then( () => {
  // Reuse the preparation promise/epoch so identity work cannot reveal a
  // half-loaded custom skin or start requests after shutdown.
  if(epoch!==preparationEpoch||!sameSources())return false;
  const required=custom?current.filter(model=>(skinIndex?.[R_NewerModelKey(model.name)]||[]).some(variant=>variant.nativeModelSha256!==undefined)):[];
  return Promise.all(required.map(model=>model.aliasSourceIdentity?.promise)).then(()=>true);
 }).then( allowed => {
  if(!allowed||epoch!==preparationEpoch||!sameSources()){work.started=true;work.version=skinVersion;work.cancelled=true;return {models:[],cancelled:true};}
		for ( const model of current ) {
			const modelKey = R_NewerModelKey( model.name );
			if ( custom ) for ( const variant of skinIndex?.[ modelKey ] || [] ) {
    if(!R_NewerVariantMatchesModel(variant,model))continue;
				const setKey = skinVersion + ':' + variant.dir;
				if ( ! sets.has( setKey ) ) sets.set( setKey, createSet( variant, modelKey ) );
				const set=sets.get(setKey);if(native&&set.isEnemy&&set.diffuse&&!set.normalWork)refreshHeight(set);
				sets.get( setKey ).prepared = true;
			}
			if ( native && ENEMY_SKIN_MODELS.has( modelKey ) ) {
				const header = model.cache?.data;
				for ( let skin = 0; skin < ( header?.numskins || header?.gl_texturenum?.length || 0 ); skin ++ ) {
					const group = header.gl_texturenum?.[ skin ] || [];
					for ( let frame = 0; frame < Math.min( 4, group.length ); frame ++ ) if ( group[ frame ]?.isTexture ) {
						R_EnemyAliasMaterial( group[ frame ], model.name, true, skin, frame );
						const set = nativeSets.get( group[ frame ] ); if ( set ) set.prepared = true;
					}
				}
			}
		}
		work.started = true; work.version = skinVersion;
		return { models: current.map( model => model.name ), started: true };
	} ).catch( error => { work.started = true; work.version = skinVersion; indexError = String( error.message || error ); return { models: current.map( model => model.name ), fallback: true }; } );
	return work.promise;
}

// Only explicit startup-prepared material families for this precache. These
// exact cached materials are used by later lit/unlit entity draws; no network,
// variant choice or future-map preparation is initiated by this getter.
function preparedSets( models ) {
	const names = Array.isArray( models ) ? models : [ models ];
	const keys = new Set( names.map( model => R_NewerModelKey( typeof model === 'string' ? model : model?.name ) ).filter( Boolean ) );
	return [ ...sets.values(), ...nativeSets.values() ].filter( set => set.prepared && set.alive && set.diffuse !== null && keys.has( set.modelKey ) && setMatchesModels(set,models) );
}

export function R_NewerSkinsMaterials( models ) {
	return [ ...new Set( preparedSets( models ).flatMap( set => [ materialFor( set, true ), materialFor( set, false ) ] ) ) ];
}

// Shader callback uniforms are not material.uniforms on MeshBasicMaterial.
// Expose their actual texture bindings for renderer.initTexture without cloning
// or storing them in JSON userData, and without requesting any additional art.
export function R_NewerSkinsTextures( models ) {
	return [ ...new Set( preparedSets( models ).flatMap( set => [ set.diffuse, set.detailDiffuse, set.heightTexture,
		...Object.values( set.uniforms ).map( uniform => uniform.value ) ] ).filter( texture => texture?.isTexture ) ) ];
}

// Translucent alias colour uses its authored blend, but normal/depth/albedo
// packets are data, never blend coverage. Repair only these three attachments
// with the same posed geometry; colour0 and source meshes remain untouched.
const receiverScene=new THREE.Scene(),receiverCopies=new WeakMap();
export function R_ReleaseAliasReceiver(source){
 const record=receiverCopies.get(source);if(!record)return;
 record.base.removeEventListener('dispose',record.listener);record.mesh.material.dispose();record.mesh.geometry=null;receiverCopies.delete(source);
}
export function R_AliasReceiverPass(renderer,scene,camera,target){
 if(!renderer?.isWebGLRenderer||!target?.textures||target.textures.length!==4)return 0;
 const borrowed=[];scene.updateMatrixWorld(true);
 scene.traverse(source=>{
  if(!source.isMesh||!source.visible||source._quakeOwner?._aliasMesh!==source||!source.material.transparent||source.material.depthWrite===false)return;
  for(let p=source.parent;p;p=p.parent)if(!p.visible)return;
  let record=receiverCopies.get(source);
  if(!record||record.base!==source.material){
   if(record){record.base.removeEventListener('dispose',record.listener);record.mesh.material.dispose();}
   const base=source.material,material=R_CloneAliasMaterial(base);material.transparent=false;material.blending=THREE.NoBlending;material.userData.quakeReceiverOnly=true;
   record={base,mesh:new THREE.Mesh(source.geometry,material),listener:null};record.mesh.matrixAutoUpdate=false;
   record.listener=()=>{base.removeEventListener('dispose',record.listener);material.dispose();if(receiverCopies.get(source)===record)receiverCopies.delete(source);};
   receiverCopies.set(source,record);base.addEventListener('dispose',record.listener);
  }
  const copy=record.mesh;copy.geometry=source.geometry;copy.matrix.copy(source.matrixWorld);copy.renderOrder=source.renderOrder;
  const held=source.userData.quakeViewmodel===true;copy.onBeforeRender=r=>{if(held)r.getContext().depthRange(0,.3);};copy.onAfterRender=r=>{if(held)r.getContext().depthRange(0,1);};receiverScene.add(copy);borrowed.push(copy);
 });
 if(!borrowed.length)return 0;
 const gl=renderer.getContext(),oldClear=renderer.autoClear,oldTarget=renderer.getRenderTarget(),range=gl.getParameter(gl.DEPTH_RANGE);
 try{renderer.autoClear=false;renderer.setRenderTarget(target);gl.drawBuffers([gl.NONE,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2,gl.COLOR_ATTACHMENT3]);renderer.render(receiverScene,camera);}
 finally{gl.depthRange(range[0],range[1]);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2,gl.COLOR_ATTACHMENT3]);for(const m of borrowed)receiverScene.remove(m);renderer.autoClear=oldClear;renderer.setRenderTarget(oldTarget);}
 return borrowed.length;
}
