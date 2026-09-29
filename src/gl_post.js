// HDR lighting pipeline: emissive surfaces, volumetric light and bloom.
//
// The world is rendered into a half-float target (with a depth texture) instead
// of straight to the screen, so surfaces can be brighter than white.  Then:
//
//   1. Volumetric pass (half res).  For every pixel the view ray is marched
//      analytically through the inverse-square field of the nearest lights
//      (map light entities, emissive surfaces such as lava and light panels,
//      dynamic lights), and each light is occluded by a screen-space ray march
//      against the depth buffer.  That is what carves light shafts out of
//      pillars and grates.  Sky openings add a sun shaft.
//   2. Bloom: threshold + mip chain, so anything over-bright glows.
//   3. Composite: ambient haze, exposure, and a filmic shoulder that keeps the
//      classic look below white and rolls highlights off instead of clipping.
//
// It is a rasterised approximation (no path tracing): light does not bounce,
// and occlusion only knows about what is on screen.

import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { R_ParseEntityLump } from './gl_portal.js';
import { Mod_PointInLeaf } from './gl_model.js';

// 0 = the classic lighting, 1 = the HDR pipeline ("Newer Game"); switchable at any time
export const r_hdr = new cvar_t( 'r_hdr', '0' );
export const r_bloom = new cvar_t( 'r_bloom', '0.9' );
export const r_volumetric = new cvar_t( 'r_volumetric', '1' );

// glquake.h flags (not imported: keeps this module out of the renderer's import cycle)
const SURF_DRAWSKY = 4;
const SURF_DRAWTURB = 0x10;

export const MAX_VOLUME_LIGHTS = 8;

// Tunables
const EMISSIVE_BOOST = 3.0; // fullbright texels, in HDR
const LAVA_BOOST = 2.6;
const LIGHT_GAIN = 5.0; // radiance per unit of light power
const SCATTER = 0.07; // in-scattering coefficient (radiance per unit of light power)
const HAZE_DENSITY = 0.00011; // ambient extinction per unit
const MAX_RAY = 3600;
const SUN_DIR_WORLD = [ 0.35, 0.22, 0.91 ];
const SUN_COLOR = [ 1.0, 0.72, 0.8 ];

//============================================================================
// Emissive materials
//============================================================================

const glowMaterials = new Set();
let glowActive = false;

export function R_PostActive() {

	return glowActive;

}

function applyGlow( material, boost ) {

	if ( material.emissive !== undefined ) {

		material.emissiveIntensity = glowActive ? boost : 1;

	} else if ( material.color !== undefined ) {

		material.color.setScalar( glowActive ? boost : 1 );

	}

}

// Marks a material as light emitting: it is boosted above white while the HDR
// pipeline is running.
export function R_RegisterGlow( material, boost = EMISSIVE_BOOST ) {

	material.userData.glowBoost = boost;
	applyGlow( material, boost );
	glowMaterials.add( material );
	material.addEventListener( 'dispose', () => glowMaterials.delete( material ) );

}

export function R_GlowBoostForTexture( name ) {

	const n = name.toLowerCase();
	if ( n.indexOf( '*lava' ) === 0 ) return LAVA_BOOST;
	if ( n.indexOf( '*slime' ) === 0 ) return 1.5;
	return 1;

}

function setGlowActive( active ) {

	if ( active === glowActive ) return;
	glowActive = active;
	for ( const m of glowMaterials )
		applyGlow( m, m.userData.glowBoost );

}

//============================================================================
// Light database
//============================================================================

let worldLights = [];
let hasSky = false;

function parseVector( s, fallback ) {

	if ( s == null ) return fallback;
	const parts = String( s ).trim().split( /\s+/ ).map( parseFloat );
	if ( parts.length < 3 || parts.some( Number.isNaN ) ) return fallback;
	return parts;

}

function entityLightColor( ent ) {

	const c = parseVector( ent._color, null );
	if ( c != null ) {

		const scale = Math.max( c[ 0 ], c[ 1 ], c[ 2 ] ) > 1.0 ? 1 / 255 : 1;
		return [ c[ 0 ] * scale, c[ 1 ] * scale, c[ 2 ] * scale ];

	}

	const cls = ent.classname;
	if ( cls.indexOf( 'torch' ) >= 0 || cls.indexOf( 'flame' ) >= 0 ) return [ 1.0, 0.55, 0.22 ];
	if ( cls.indexOf( 'fluoro' ) >= 0 ) return [ 0.75, 0.88, 1.0 ];
	return [ 1.0, 0.82, 0.6 ];

}

function polyInfo( surf ) {

	let area = 0, cx = 0, cy = 0, cz = 0, n = 0;

	for ( let p = surf.polys; p; p = p.next ) {

		const v = p.verts;
		const f = v instanceof Float32Array
			? ( i, k ) => v[ i * 7 + k ]
			: ( i, k ) => v[ i ][ k ];

		for ( let i = 0; i < p.numverts; i ++ ) {

			cx += f( i, 0 ); cy += f( i, 1 ); cz += f( i, 2 );
			n ++;

		}

		for ( let i = 2; i < p.numverts; i ++ ) {

			const ax = f( i - 1, 0 ) - f( 0, 0 ), ay = f( i - 1, 1 ) - f( 0, 1 ), az = f( i - 1, 2 ) - f( 0, 2 );
			const bx = f( i, 0 ) - f( 0, 0 ), by = f( i, 1 ) - f( 0, 1 ), bz = f( i, 2 ) - f( 0, 2 );
			const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
			area += 0.5 * Math.sqrt( x * x + y * y + z * z );

		}

	}

	if ( n === 0 ) return null;
	return { area, center: [ cx / n, cy / n, cz / n ] };

}

// average colour and coverage of a texture's fullbright texels
function fullbrightEmission( texture ) {

	if ( texture._emission !== undefined ) return texture._emission;

	let result = null;
	const data = texture._fullbright != null && texture._fullbright.image != null
		? texture._fullbright.image.data
		: null;

	if ( data != null ) {

		let r = 0, g = 0, b = 0, n = 0;
		const pixels = data.length / 4;
		for ( let i = 0; i < pixels; i ++ ) {

			if ( data[ i * 4 + 3 ] === 0 ) continue;
			r += Math.pow( data[ i * 4 ] / 255, 2.2 );
			g += Math.pow( data[ i * 4 + 1 ] / 255, 2.2 );
			b += Math.pow( data[ i * 4 + 2 ] / 255, 2.2 );
			n ++;

		}

		if ( n > 0 )
			result = { color: [ r / n, g / n, b / n ], coverage: n / pixels };

	}

	texture._emission = result;
	return result;

}

function surfaceEmission( surf ) {

	const tex = surf.texinfo.texture;
	const name = tex.name.toLowerCase();

	if ( name.indexOf( '*lava' ) === 0 ) return { color: [ 1.0, 0.36, 0.1 ], coverage: 1.6 };
	if ( name.indexOf( '*slime' ) === 0 ) return { color: [ 0.25, 0.95, 0.2 ], coverage: 0.6 };
	if ( name.indexOf( '*teleport' ) === 0 ) return { color: [ 0.55, 0.65, 1.0 ], coverage: 0.15 };
	if ( name.charAt( 0 ) === '*' || tex.gl_texture == null ) return null;

	return fullbrightEmission( tex.gl_texture );

}

const SURFACE_CELL = 192;
const MAX_SURFACE_LIGHTS = 500;

export function R_BuildWorldLights( model ) {

	worldLights = [];
	hasSky = false;

	if ( model == null || model.nodes == null ) return worldLights;

	// light entities
	if ( model.entities != null ) {

		for ( const ent of R_ParseEntityLump( model.entities ) ) {

			if ( ent.classname == null || ent.classname.indexOf( 'light' ) !== 0 || ent.origin == null ) continue;

			const pos = parseVector( ent.origin, null );
			if ( pos == null ) continue;

			const value = ent.light !== undefined ? parseFloat( ent.light ) : 300;
			if ( ! ( value > 0 ) ) continue;

			worldLights.push( {
				pos,
				color: entityLightColor( ent ),
				power: value / 300,
				radius: 28,
				style: parseInt( ent.style, 10 ) || 0,
				leaf: Mod_PointInLeaf( pos, model )
			} );

		}

	}

	// emissive surfaces (lava, light panels, glowing buttons...)
	if ( model.surfaces != null ) {

		const first = model.firstmodelsurface || 0;
		const last = first + ( model.nummodelsurfaces || model.surfaces.length );
		const clusters = new Map();

		for ( let i = first; i < last; i ++ ) {

			const surf = model.surfaces[ i ];
			if ( surf == null || surf.texinfo == null || surf.texinfo.texture == null ) continue;
			if ( surf.flags & SURF_DRAWSKY ) { hasSky = true; continue; }

			const emission = surfaceEmission( surf );
			if ( emission == null ) continue;

			const info = polyInfo( surf );
			if ( info == null || info.area < 64 ) continue;

			const key = surf.texinfo.texture.name + '|' +
				Math.floor( info.center[ 0 ] / SURFACE_CELL ) + ',' +
				Math.floor( info.center[ 1 ] / SURFACE_CELL ) + ',' +
				Math.floor( info.center[ 2 ] / SURFACE_CELL );

			let c = clusters.get( key );
			if ( c === undefined ) {

				c = { emission, area: 0, sum: [ 0, 0, 0 ], normal: [ 0, 0, 0 ] };
				clusters.set( key, c );

			}

			const sign = ( surf.flags & 2 ) ? - 1 : 1; // SURF_PLANEBACK
			c.area += info.area;
			for ( let a = 0; a < 3; a ++ ) {

				c.sum[ a ] += info.center[ a ] * info.area;
				c.normal[ a ] += surf.plane.normal[ a ] * sign * info.area;

			}

		}

		const surfaceLights = [];
		for ( const c of clusters.values() ) {

			const len = Math.hypot( c.normal[ 0 ], c.normal[ 1 ], c.normal[ 2 ] ) || 1;
			const pos = [
				c.sum[ 0 ] / c.area + c.normal[ 0 ] / len * 10,
				c.sum[ 1 ] / c.area + c.normal[ 1 ] / len * 10,
				c.sum[ 2 ] / c.area + c.normal[ 2 ] / len * 10
			];

			surfaceLights.push( {
				pos,
				color: c.emission.color,
				power: Math.min( 1.1, c.area * c.emission.coverage / ( 64 * 64 ) * 0.5 ),
				radius: Math.max( 24, Math.min( 110, Math.sqrt( c.area ) * 0.5 ) ),
				style: 0,
				leaf: Mod_PointInLeaf( pos, model )
			} );

		}

		surfaceLights.sort( ( a, b ) => b.power - a.power );
		for ( let i = 0; i < surfaceLights.length && i < MAX_SURFACE_LIGHTS; i ++ )
			worldLights.push( surfaceLights[ i ] );

	}

	return worldLights;

}

export function R_GetWorldLights() {

	return worldLights;

}

// the world renderer reports when it draws sky; sun shafts only make sense then
let skySeen = false;

export function R_PostNoteSky() {

	skySeen = true;

}

export function R_MapHasSky() {

	return hasSky;

}

//============================================================================
// Per-frame light selection
//============================================================================

const _selected = [];
for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ )
	_selected.push( { pos: [ 0, 0, 0 ], color: [ 0, 0, 0 ], radius: 30, range: 300, score: 0 } );
let selectedCount = 0;

const DLIGHT_COLOR = [ 1.0, 0.62, 0.28 ];

function consider( px, py, pz, color, power, radius, view ) {

	// view space
	const vx = view[ 0 ] * px + view[ 4 ] * py + view[ 8 ] * pz + view[ 12 ];
	const vy = view[ 1 ] * px + view[ 5 ] * py + view[ 9 ] * pz + view[ 13 ];
	const vz = view[ 2 ] * px + view[ 6 ] * py + view[ 10 ] * pz + view[ 14 ];

	const dist2 = vx * vx + vy * vy + vz * vz;
	const score = power / ( dist2 + 6000 ) * ( vz < 0 ? 1 : 0.3 );

	let slot = null;
	if ( selectedCount < MAX_VOLUME_LIGHTS ) {

		slot = _selected[ selectedCount ++ ];

	} else {

		let worst = 0;
		for ( let i = 1; i < selectedCount; i ++ )
			if ( _selected[ i ].score < _selected[ worst ].score ) worst = i;
		if ( _selected[ worst ].score >= score ) return;
		slot = _selected[ worst ];

	}

	slot.score = score;
	slot.pos[ 0 ] = vx; slot.pos[ 1 ] = vy; slot.pos[ 2 ] = vz;
	slot.radius = radius;
	slot.range = 130 + 170 * Math.sqrt( power );
	slot.color[ 0 ] = color[ 0 ] * power * LIGHT_GAIN;
	slot.color[ 1 ] = color[ 1 ] * power * LIGHT_GAIN;
	slot.color[ 2 ] = color[ 2 ] * power * LIGHT_GAIN;

}

function selectLights( viewMatrix, visframe, styles, dlights, time ) {

	selectedCount = 0;
	const view = viewMatrix.elements;

	for ( let i = 0; i < worldLights.length; i ++ ) {

		const l = worldLights[ i ];
		const leaf = l.leaf;
		// in the PVS (or embedded in a wall, where the leaf is solid)
		if ( leaf != null && leaf.contents !== - 2 && leaf.visframe !== visframe ) continue;

		let power = l.power;
		if ( l.style !== 0 && styles != null && styles[ l.style ] !== undefined )
			power *= styles[ l.style ] / 264;

		if ( power <= 0.001 ) continue;
		consider( l.pos[ 0 ], l.pos[ 1 ], l.pos[ 2 ], l.color, power, l.radius, view );

	}

	if ( dlights != null ) {

		for ( let i = 0; i < dlights.length; i ++ ) {

			const d = dlights[ i ];
			if ( d == null || d.radius <= 0 || d.die < time ) continue;

			const fade = Math.min( 1, ( d.die - time ) / 0.3 );
			consider( d.origin[ 0 ], d.origin[ 1 ], d.origin[ 2 ], DLIGHT_COLOR,
				d.radius / 300 * 1.4 * fade, 40, view );

		}

	}

}

//============================================================================
// Shaders
//============================================================================

const QUAD_VERTEX = `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

const VOLUME_FRAGMENT = `
precision highp float;
#include <packing>
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform float uNear;
uniform float uFar;
uniform int uCount;
uniform vec4 uLightPos[ ${MAX_VOLUME_LIGHTS} ];
uniform vec4 uLightCol[ ${MAX_VOLUME_LIGHTS} ];
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunOn;
uniform float uScatter;
uniform float uMaxRay;
varying vec2 vUv;

const int SHADOW_STEPS = 14;
const int SHAFT_STEPS = 28;

float sceneDist( vec2 uv ) {
	float d = texture2D( tDepth, uv ).x;
	if ( d >= 0.99999 ) return 1e6;
	return - perspectiveDepthToViewZ( d, uNear, uFar );
}

float noise( vec2 p ) {
	return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
}

float henyeyGreenstein( float c, float g ) {
	return ( 1.0 - g * g ) / pow( 1.0 + g * g - 2.0 * g * c, 1.5 );
}

void main() {
	vec4 r = uProjInv * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
	vec3 dirV = normalize( r.xyz / r.w );

	float zd = sceneDist( vUv );
	float D = zd > 1e5 ? uMaxRay : min( zd / max( - dirV.z, 0.05 ), uMaxRay );
	float jit = noise( gl_FragCoord.xy );

	vec3 acc = vec3( 0.0 );

	for ( int i = 0; i < ${MAX_VOLUME_LIGHTS}; i ++ ) {
		if ( i >= uCount ) break;

		vec3 L = uLightPos[ i ].xyz;
		float R = uLightPos[ i ].w;

		// closed form of the integral of 1 / |P - L|^2 along the ray
		float t0 = dot( L, dirV );
		float h = sqrt( max( dot( L, L ) - t0 * t0, 0.0 ) + R * R );
		float integral = ( atan( ( D - t0 ) / h ) + atan( t0 / h ) ) / h;
		// finite reach: the inverse-square tail would otherwise fog whole rooms
		float range = uLightCol[ i ].w;
		integral *= 1.0 - smoothstep( 0.25 * range, range, h );

		// is the point of the ray nearest the light actually lit?
		vec3 Q = dirV * clamp( t0, 0.0, D );
		float lit = 0.0;
		for ( int k = 0; k < SHADOW_STEPS; k ++ ) {
			float s = ( float( k ) + jit ) / float( SHADOW_STEPS );
			vec3 P = mix( Q, L, s * 0.97 );
			if ( P.z > - uNear ) { lit += 1.0; continue; }
			vec4 c = uProj * vec4( P, 1.0 );
			vec2 uv = c.xy / c.w * 0.5 + 0.5;
			if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) { lit += 1.0; continue; }
			float sd = sceneDist( uv );
			float bias = 6.0 + 0.015 * ( - P.z );
			lit += sd < ( - P.z ) - bias ? 0.0 : 1.0;
		}
		lit /= float( SHADOW_STEPS );

		float phase = henyeyGreenstein( dot( normalize( Q - L ), - dirV ), 0.3 );
		acc += uLightCol[ i ].rgb * integral * lit * lit * phase;
	}

	vec3 result = acc * uScatter;

	// sun shafts through openings to the sky
	if ( uSunOn > 0.5 ) {
		vec4 sc = uProj * vec4( uSunDir * 1000.0, 1.0 );
		if ( sc.w > 0.0 ) {
			vec2 suv = sc.xy / sc.w * 0.5 + 0.5;
			vec2 delta = suv - vUv;
			float open = 0.0;
			for ( int k = 0; k < SHAFT_STEPS; k ++ ) {
				float s = ( float( k ) + jit ) / float( SHAFT_STEPS );
				vec2 uv = vUv + delta * s;
				float sky = 0.0;
				if ( uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0 )
					sky = sceneDist( uv ) > 1e5 ? 1.0 : 0.0;
				open += sky * ( 1.0 - s * 0.6 );
			}
			open /= float( SHAFT_STEPS );
			float facing = pow( clamp( dot( dirV, uSunDir ), 0.0, 1.0 ), 2.0 );
			float thick = 1.0 - exp( - 0.00045 * D );
			result += uSunCol * pow( open, 3.0 ) * facing * thick * 0.5;
		}
	}

	gl_FragColor = vec4( result, 1.0 );
}`;

const BLOOM_PREFILTER_FRAGMENT = `
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uThreshold;
varying vec2 vUv;
// threshold first, then weight by brightness so single hot pixels can't flicker
vec4 fetch( vec2 o ) {
	vec3 c = texture2D( tScene, vUv + o * uTexel ).rgb * uExposure;
	float l = max( c.r, max( c.g, c.b ) );
	float soft = clamp( l - uThreshold + 0.5, 0.0, 1.0 );
	soft = soft * soft * 0.5;
	c *= max( soft, l - uThreshold ) / max( l, 1e-4 );
	float w = 1.0 / ( 1.0 + dot( c, vec3( 0.333 ) ) );
	return vec4( c * w, w );
}
void main() {
	vec4 a = fetch( vec2( -1.0, -1.0 ) ) + fetch( vec2( 1.0, -1.0 ) ) + fetch( vec2( -1.0, 1.0 ) ) + fetch( vec2( 1.0, 1.0 ) );
	gl_FragColor = vec4( a.rgb / max( a.w, 1e-4 ), 1.0 );
}`;

const BLOOM_DOWN_FRAGMENT = `
uniform sampler2D tSource;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
	vec3 c = texture2D( tSource, vUv ).rgb * 4.0;
	c += texture2D( tSource, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb;
	c += texture2D( tSource, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb;
	c += texture2D( tSource, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb;
	c += texture2D( tSource, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
	gl_FragColor = vec4( c / 8.0, 1.0 );
}`;

const BLOOM_UP_FRAGMENT = `
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 uTexel;
uniform float uWeight;
varying vec2 vUv;
void main() {
	vec3 c = texture2D( tLow, vUv + uTexel * vec2( -1.0, 0.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 1.0, 0.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 0.0, -1.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 0.0, 1.0 ) ).rgb
		+ texture2D( tLow, vUv ).rgb * 4.0
		+ texture2D( tLow, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
	gl_FragColor = vec4( texture2D( tHigh, vUv ).rgb + c / 12.0 * uWeight, 1.0 );
}`;

const COMPOSITE_FRAGMENT = `
precision highp float;
#include <common>
#include <packing>
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tVolume;
uniform sampler2D tBloom;
uniform mat4 uProjInv;
uniform float uNear;
uniform float uFar;
uniform float uExposure;
uniform float uBloom;
uniform float uVolume;
uniform float uHaze;
uniform vec3 uHazeColor;
uniform float uMaxRay;
varying vec2 vUv;

// keeps values under the knee untouched; rolls highlights off toward white
vec3 shoulder( vec3 c ) {
	float knee = 0.8;
	float m = max( c.r, max( c.g, c.b ) );
	if ( m <= knee ) return c;
	float range = 1.0 - knee;
	float mapped = knee + range * ( 1.0 - exp( - ( m - knee ) / range ) );
	vec3 scaled = c * ( mapped / m );
	// very hot colours desaturate toward white, like an overexposed sensor
	float hot = smoothstep( 1.0, 4.0, m );
	return mix( scaled, vec3( mapped ), hot * 0.45 );
}

void main() {
	vec3 scene = texture2D( tScene, vUv ).rgb;
	float d = texture2D( tDepth, vUv ).x;

	vec4 r = uProjInv * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
	vec3 dirV = normalize( r.xyz / r.w );
	float D = d >= 0.99999 ? uMaxRay : min( - perspectiveDepthToViewZ( d, uNear, uFar ) / max( - dirV.z, 0.05 ), uMaxRay );

	// ambient haze
	float T = exp( - uHaze * D );
	vec3 c = scene * T + uHazeColor * ( 1.0 - T );

	c += texture2D( tVolume, vUv ).rgb * uVolume;
	c += texture2D( tBloom, vUv ).rgb * uBloom;

	c = shoulder( max( c * uExposure, 0.0 ) );

	gl_FragColor = vec4( c, 1.0 );
	#include <colorspace_fragment>
}`;

//============================================================================
// Pipeline
//============================================================================

const BLOOM_LEVELS = 5;

let gpu = null;

function makeRT( width, height, options ) {

	return new THREE.WebGLRenderTarget( Math.max( 1, width ), Math.max( 1, height ), Object.assign( {
		type: THREE.HalfFloatType,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		generateMipmaps: false,
		depthBuffer: false
	}, options ) );

}

function makeMaterial( fragment, uniforms ) {

	return new THREE.ShaderMaterial( {
		uniforms,
		vertexShader: QUAD_VERTEX,
		fragmentShader: fragment,
		depthTest: false,
		depthWrite: false
	} );

}

function createPipeline() {

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ] ), 3 ) );
	geometry.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( [ 0, 0, 2, 0, 0, 2 ] ), 2 ) );

	const mesh = new THREE.Mesh( geometry );
	mesh.frustumCulled = false;
	const scene = new THREE.Scene();
	scene.add( mesh );

	const lightPos = [], lightCol = [];
	for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ ) {

		lightPos.push( new THREE.Vector4() );
		lightCol.push( new THREE.Vector4() );

	}

	return {
		width: 0, height: 0,
		scene, mesh,
		camera: new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 ),
		hdr: null, volume: null, down: [], up: [],
		volumeMaterial: makeMaterial( VOLUME_FRAGMENT, {
			tDepth: { value: null },
			uProj: { value: new THREE.Matrix4() },
			uProjInv: { value: new THREE.Matrix4() },
			uNear: { value: 4 }, uFar: { value: 4096 },
			uCount: { value: 0 },
			uLightPos: { value: lightPos },
			uLightCol: { value: lightCol },
			uSunDir: { value: new THREE.Vector3() },
			uSunCol: { value: new THREE.Vector3( ...SUN_COLOR ) },
			uSunOn: { value: 0 },
			uScatter: { value: SCATTER },
			uMaxRay: { value: MAX_RAY }
		} ),
		prefilterMaterial: makeMaterial( BLOOM_PREFILTER_FRAGMENT, {
			tScene: { value: null }, uTexel: { value: new THREE.Vector2() },
			uExposure: { value: 1 }, uThreshold: { value: 1 }
		} ),
		downMaterial: makeMaterial( BLOOM_DOWN_FRAGMENT, {
			tSource: { value: null }, uTexel: { value: new THREE.Vector2() }
		} ),
		upMaterial: makeMaterial( BLOOM_UP_FRAGMENT, {
			tLow: { value: null }, tHigh: { value: null },
			uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 }
		} ),
		compositeMaterial: makeMaterial( COMPOSITE_FRAGMENT, {
			tScene: { value: null }, tDepth: { value: null },
			tVolume: { value: null }, tBloom: { value: null },
			uProjInv: { value: new THREE.Matrix4() },
			uNear: { value: 4 }, uFar: { value: 4096 },
			uExposure: { value: 1 }, uBloom: { value: 0.6 }, uVolume: { value: 1 },
			uHaze: { value: HAZE_DENSITY },
			uHazeColor: { value: new THREE.Vector3( 0.018, 0.014, 0.014 ) },
			uMaxRay: { value: MAX_RAY }
		} )
	};

}

function disposeTargets() {

	if ( gpu.hdr === null ) return;
	gpu.hdr.dispose();
	gpu.hdr.depthTexture.dispose();
	gpu.volume.dispose();
	for ( const rt of gpu.down ) rt.dispose();
	for ( const rt of gpu.up ) rt.dispose();
	gpu.hdr = null;
	gpu.down = [];
	gpu.up = [];

}

function ensureTargets( width, height ) {

	if ( gpu.hdr !== null && gpu.width === width && gpu.height === height ) return;

	disposeTargets();
	gpu.width = width;
	gpu.height = height;

	const depth = new THREE.DepthTexture( width, height );
	gpu.hdr = makeRT( width, height, { depthBuffer: true, depthTexture: depth, samples: 4 } );
	gpu.volume = makeRT( Math.ceil( width / 2 ), Math.ceil( height / 2 ) );

	let w = Math.ceil( width / 2 ), h = Math.ceil( height / 2 );
	for ( let i = 0; i < BLOOM_LEVELS; i ++ ) {

		gpu.down.push( makeRT( w, h ) );
		if ( i < BLOOM_LEVELS - 1 ) gpu.up.push( makeRT( w, h ) );
		w = Math.max( 1, Math.ceil( w / 2 ) );
		h = Math.max( 1, Math.ceil( h / 2 ) );

	}

}

function runPass( renderer, material, target ) {

	gpu.mesh.material = material;
	renderer.setRenderTarget( target );
	renderer.render( gpu.scene, gpu.camera );

}

// True when the HDR pipeline can run on this renderer
export function R_PostSupported( renderer ) {

	if ( renderer == null || renderer.capabilities == null || renderer.capabilities.isWebGL2 === false ) return false;
	return renderer.extensions.has( 'EXT_color_buffer_float' ) || renderer.extensions.has( 'EXT_color_buffer_half_float' );

}

/*
================
R_PostBegin

Called at the start of a frame.  Returns true when the frame is to be rendered
through the HDR pipeline; the caller then draws the world into the target that
R_PostBind selects.
================
*/
export function R_PostBegin( renderer, enabled, width, height ) {

	const active = enabled && r_hdr.value !== 0 && R_PostSupported( renderer ) && width > 8 && height > 8;
	setGlowActive( active );
	skySeen = false;

	if ( active === false ) return false;

	if ( gpu === null ) gpu = createPipeline();
	ensureTargets( width, height );
	return true;

}

export function R_PostBind( renderer ) {

	renderer.setRenderTarget( gpu.hdr );

}

/*
================
R_PostFinish

Turn the HDR image into the frame that is shown: volumetrics, bloom, tone map.
viewport is the on-screen rectangle in logical pixels ( lx, ly, lw, lh ).
================
*/
export function R_PostFinish( renderer, camera, viewport, visframe, styles, dlights, time, exposure, hasSkyView ) {

	const p = gpu;
	const hdr = p.hdr;

	selectLights( camera.matrixWorldInverse, visframe, styles, dlights, time );

	// volumetric pass
	const vm = p.volumeMaterial.uniforms;
	vm.tDepth.value = hdr.depthTexture;
	vm.uProj.value.copy( camera.projectionMatrix );
	vm.uProjInv.value.copy( camera.projectionMatrixInverse );
	vm.uNear.value = camera.near;
	vm.uFar.value = camera.far;
	vm.uCount.value = selectedCount;
	for ( let i = 0; i < selectedCount; i ++ ) {

		const s = _selected[ i ];
		vm.uLightPos.value[ i ].set( s.pos[ 0 ], s.pos[ 1 ], s.pos[ 2 ], s.radius );
		vm.uLightCol.value[ i ].set( s.color[ 0 ], s.color[ 1 ], s.color[ 2 ], s.range );

	}

	// sun direction into view space (rotation part of the view matrix)
	const e = camera.matrixWorldInverse.elements;
	const sd = SUN_DIR_WORLD;
	vm.uSunDir.value.set(
		e[ 0 ] * sd[ 0 ] + e[ 4 ] * sd[ 1 ] + e[ 8 ] * sd[ 2 ],
		e[ 1 ] * sd[ 0 ] + e[ 5 ] * sd[ 1 ] + e[ 9 ] * sd[ 2 ],
		e[ 2 ] * sd[ 0 ] + e[ 6 ] * sd[ 1 ] + e[ 10 ] * sd[ 2 ] ).normalize();
	vm.uSunOn.value = hasSkyView === true && skySeen === true ? 1 : 0;

	const volume = Math.max( 0, r_volumetric.value );
	if ( volume > 0 ) runPass( renderer, p.volumeMaterial, p.volume );

	// bloom
	const bloom = Math.max( 0, r_bloom.value );
	if ( bloom > 0 ) {

		const pm = p.prefilterMaterial.uniforms;
		pm.tScene.value = hdr.texture;
		pm.uTexel.value.set( 1 / hdr.width, 1 / hdr.height );
		pm.uExposure.value = exposure;
		pm.uThreshold.value = 1.1;
		runPass( renderer, p.prefilterMaterial, p.down[ 0 ] );

		const dm = p.downMaterial.uniforms;
		for ( let i = 1; i < BLOOM_LEVELS; i ++ ) {

			dm.tSource.value = p.down[ i - 1 ].texture;
			dm.uTexel.value.set( 1 / p.down[ i - 1 ].width, 1 / p.down[ i - 1 ].height );
			runPass( renderer, p.downMaterial, p.down[ i ] );

		}

		const um = p.upMaterial.uniforms;
		let low = p.down[ BLOOM_LEVELS - 1 ];
		for ( let i = BLOOM_LEVELS - 2; i >= 0; i -- ) {

			um.tLow.value = low.texture;
			um.tHigh.value = p.down[ i ].texture;
			um.uTexel.value.set( 1 / low.width, 1 / low.height );
			um.uWeight.value = 0.55;
			runPass( renderer, p.upMaterial, p.up[ i ] );
			low = p.up[ i ];

		}

		p.bloomResult = low;

	}

	// composite to the screen
	const cm = p.compositeMaterial.uniforms;
	cm.tScene.value = hdr.texture;
	cm.tDepth.value = hdr.depthTexture;
	cm.tVolume.value = volume > 0 ? p.volume.texture : null;
	cm.tBloom.value = bloom > 0 ? p.bloomResult.texture : null;
	cm.uProjInv.value.copy( camera.projectionMatrixInverse );
	cm.uNear.value = camera.near;
	cm.uFar.value = camera.far;
	cm.uExposure.value = exposure;
	cm.uBloom.value = bloom;
	cm.uVolume.value = volume;

	renderer.setRenderTarget( null );
	renderer.setViewport( viewport.lx, viewport.ly, viewport.lw, viewport.lh );
	gpu.mesh.material = p.compositeMaterial;
	renderer.render( p.scene, p.camera );

}

export function R_PostShutdown() {

	if ( gpu === null ) return;
	disposeTargets();
	gpu = null;

}
