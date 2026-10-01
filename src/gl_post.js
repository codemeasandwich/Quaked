// HDR lighting pipeline: emissive surfaces, sun and light shafts, relighting
// and bloom.
//
// The world is rendered into a half-float target (with a depth texture) instead
// of straight to the screen, so surfaces can be brighter than white.  Then:
//
//   1. Sun.  A shadow map of the world is rendered from the sky's direction
//      (sky is not a shadow caster, so skylights and windows let light in).
//      Every view ray is marched through it: the lit stretches of air become
//      the light shafts, and lit surfaces get direct sun on top of their
//      lightmaps.
//   2. Lights.  Map lights, emissive surfaces (lava, light panels) and dynamic
//      lights scatter through the air (analytic inverse-square along the view
//      ray) and relight nearby surfaces, occluded by screen-space ray marches
//      against the depth buffer.
//   3. Bloom: threshold + mip chain, so anything over-bright glows.
//   4. Composite: grade, exposure, and a filmic shoulder that rolls highlights
//      off instead of clipping.
//
// It is a rasterised approximation (no path tracing): light does not bounce,
// and point-light occlusion only knows about what is on screen.

import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { R_ParseEntityLump } from './gl_portal.js';
import { Mod_PointInLeaf, Mod_LeafPVS, solidskytexture, alphaskytexture } from './gl_model.js';
import { R_NormalMapFor } from './gl_normals.js';
import { GL_SetForceLinear } from './glquake.js';
import { R_ScreenDropsUpdate } from './r_screendrops.js';
import { R_TeleportFx } from './r_teleportfx.js';
import { R_PerfStage, R_PerfSetScale } from './r_perf.js';
import { R_FlashlightBeam, FLASHLIGHT_OUTER, FLASHLIGHT_INNER } from './r_flashlight.js';
import { R_AnimSetNewer, R_AnimSetLighting, r_newer_lighting, r_newer_water } from './r_anim.js';

// 0 = the classic lighting, 1 = the HDR pipeline ("Newer Game"); switchable at any time
export const r_hdr = new cvar_t( 'r_hdr', '0' );
export const r_bloom = new cvar_t( 'r_bloom', '0.9' );
export const r_bounce = new cvar_t( 'r_bounce', '1' ); // bounced light between surfaces (0 off)
export const r_volumetric = new cvar_t( 'r_volumetric', '1' );
// Newer Game's overall look: 1 = as designed.  0.6 is 40% darker, 1.4 is 40% more contrast.
export const r_newbright = new cvar_t( 'r_newbright', '0.6' );
export const r_newcontrast = new cvar_t( 'r_newcontrast', '1.4' );
export const r_caustics = new cvar_t( 'r_caustics', '1' ); // strength of light patterns beneath water
// How hard the baked lighting falls off in Newer Game: the lightmap is raised to
// this power, so what is lit by a clear source stays bright and what is not goes
// dark (1 = as baked).  Light that does not come from a source is not invented.
export const r_newdark = new cvar_t( 'r_newdark', '2.2' );

// Accent on the corners and edges where surfaces really meet at an angle: the
// inside of a corner darkens, the outer edge catches a little light.  1 = as
// designed, 0 = off.  Faces in one plane (however they are cut up) are untouched.
export const r_newedges = new cvar_t( 'r_newedges', '1' );

// Newer Game holds a frame rate by itself: when frames take longer than the target
// allows, the picture is drawn at a lower resolution (and scaled up to fill the
// screen) until they fit, and creeps back up when there is room.  r_dynres 0 = always
// full resolution; r_fps_target is the frames per second aimed for.
export const r_dynres = new cvar_t( 'r_dynres', '1' );
export const r_fps_target = new cvar_t( 'r_fps_target', '60' );
const DYNRES_MIN = 0.5;
const dyn = { scale: 1, last: 0, sum: 0, frames: 0, cool: 0, probing: false, probeEvery: 240, since: 0 };

export function R_DynResScale() {

	return dyn.scale;

}

// once a frame while the pipeline draws: the average frame time of the last stretch
// decides the resolution of the next
function dynResUpdate( now ) {

	if ( r_dynres.value === 0 ) {

		dyn.scale = 1;
		R_PerfSetScale( 1 );
		dyn.last = now;
		return;

	}

	let dt = now - dyn.last;
	dyn.last = now;
	if ( dt <= 0 || dt > 2 ) { dyn.sum = 0; dyn.frames = 0; return; } // a level load or a pause, not a slow picture
	dt = Math.min( dt, 0.25 ); // (one long frame does not count for more than that)

	dyn.sum += dt;
	dyn.frames ++;
	dyn.since ++;
	if ( dyn.frames < 24 && dyn.sum < 1.2 ) return;

	const avg = dyn.sum / dyn.frames;
	dyn.sum = 0;
	dyn.frames = 0;

	const budget = 1 / Math.max( 20, r_fps_target.value );
	const before = dyn.scale;

	if ( avg > budget * 1.12 ) {

		// too slow: smaller, in proportion to how slow (frame cost follows the pixel count)
		if ( dyn.probing ) { dyn.probeEvery = Math.min( 1800, dyn.probeEvery * 2 ); dyn.probing = false; }
		dyn.scale = Math.max( DYNRES_MIN, dyn.scale * Math.max( 0.8, Math.min( 0.95, Math.sqrt( budget / avg ) ) ) );
		dyn.since = 0;

	} else if ( dyn.scale < 1 && dyn.since >= dyn.probeEvery ) {

		// it fits: see whether one step bigger fits too
		dyn.scale = Math.min( 1, dyn.scale * 1.08 );
		dyn.probing = true;
		dyn.since = 0;

	} else if ( dyn.probing ) {

		dyn.probing = false; // the bigger picture held: keep it

	}

	dyn.scale = Math.round( dyn.scale * 100 ) / 100;
	R_PerfSetScale( dyn.scale );
	if ( dyn.scale !== before ) dyn.frames = 0;

}

// shared with the lit world materials' shader
const lightCurve = { value: 1 };
// Bounce light: no surface is left pure black.  Where the baked light never reached, light still arrives from the rest of the
// level, a little, so the surface keeps its own picture (the flashlight and any glow can then bring it out) instead of
// being a flat black the beam can only paint grey.
const BOUNCE_LIGHT = 0.025;

// glquake.h flags (not imported: keeps this module out of the renderer's import cycle)
const SURF_DRAWSKY = 4;
const SURF_DRAWTURB = 0x10;

export const MAX_VOLUME_LIGHTS = 8;

// Objects on this layer cast sun shadows (the world; sky deliberately is not)
export const SUN_SHADOW_LAYER = 3;

// Tunables
const EMISSIVE_BOOST = 3.0; // fullbright texels, in HDR
const LAVA_BOOST = 1.1; // lava is a light source: brighter than white, so it blooms
const LAVA_PULSE = 0.14; // and it breathes, slowly
const LIGHT_GAIN = 5.0; // radiance per unit of light power
const SCATTER = 0.03; // point light in-scattering
const LIGHT_FLOOR = 0.12; // light on a surface the lightmap left dark
const LIGHT_SURFACE = 0.16; // direct light from point lights on surfaces
const HAZE_DENSITY = 0.000022; // ambient extinction per unit, before the sky scales it
const SPOT_POWER = 1.6; // the flashlight, in the same units as the point lights
const MAX_RAY = 3600;
const SUN_COLOR = [ 3.4, 2.7, 1.9 ]; // warm white; tinted by the sky's own colour
const SUN_SCATTER = 0.00003; // sun in-scattering per unit of lit air
const SUN_SURFACE = 0.6; // direct sun on surfaces (multiplies the lightmapped colour, so this is a gain)
const SUN_SURFACE_COLOR = [ 1.0, 0.9, 0.76 ];
const SATURATION = 1.15;
const VIBRANCE = 0.12; // extra saturation for the colours that have little
const CONTRAST = 0.5; // extra gain for mid-tones and highlights
const HDR_EXPOSURE = 1.3; // the lit parts of a level should read as lit, the rest as dark
const OUTDOOR_EXPOSURE = 0.85; // open daylight needs less gain than a dim interior
const OUTDOOR_BLOOM_THRESHOLD = 2.4; // the sky itself is bright: only real highlights (lava, lights) glow, not the daylight
const OUTDOOR_BLOOM = 0.5; // and what does glow is softer under the open sky
const CAUSTIC = 0.6;
const BUMP_LIGHT = 0.3; // how much of the normal map's relief takes the direct light (1 = all of it) // brightness of caustics beneath water

// direction towards the sun (worldspawn "_sun_mangle" "yaw pitch" overrides it)
let sunDirection = [ - 0.28, - 0.18, 0.94 ];

function sunFromAngles( yaw, pitch ) {

	const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
	// a sun at pitch -90 shines straight down, so the direction to it points up
	return [ Math.cos( y ) * Math.cos( p ) * - 1, Math.sin( y ) * Math.cos( p ) * - 1, - Math.sin( p ) ];

}

//============================================================================
// Emissive materials
//============================================================================

const glowMaterials = new Set();
let glowActive = false;


// The eye is under water, slime or lava: no drops on the lens, no edge outlines
let underwater = false;

export function R_PostSetUnderwater( v ) {

	underwater = v === true;

}

export function R_PostActive() {

	return glowActive;

}

// Newer Game's water: see-through liquids, absorption and caustics.  It is part
// of the lighting pipeline, so it needs that as well as its own switch.
export function R_WaterActive() {

	return glowActive && r_newer_water.value !== 0;

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
	if ( boost === LAVA_BOOST ) lavaMaterials.add( material );
	material.addEventListener( 'dispose', () => {

		glowMaterials.delete( material );
		lavaMaterials.delete( material );

	} );

}

// lava materials, whose glow slowly swells and fades
const lavaMaterials = new Set();

function pulseLava( seconds ) {

	const pulse = 1 + LAVA_PULSE * Math.sin( seconds * 1.6 ) + LAVA_PULSE * 0.5 * Math.sin( seconds * 4.3 + 1.3 );
	for ( const m of lavaMaterials ) {

		m.userData.glowBoost = LAVA_BOOST * pulse;
		applyGlow( m, m.userData.glowBoost );

	}

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
	GL_SetForceLinear( active ); // smooth texture filtering in Newer Game
	for ( const m of glowMaterials )
		applyGlow( m, m.userData.glowBoost );
	for ( const m of detailMaterials )
		applyDetail( m );

}

//============================================================================
// Surface detail: generated normal maps, parallax and the normal G-buffer
//============================================================================

const detailMaterials = new Set();

const PARALLAX_DEPTH = 0.02; // in texture tiles
const PARALLAX_LAYERS = 10;

// Parallax: shift the texture lookups along the view ray by the height stored in
// the normal map's alpha, so bricks stand proud of the mortar and shift as you
// move.  Runs only when a normal map is attached (the Newer lighting).
const PARALLAX_GLSL = `
#ifdef USE_NORMALMAP
vec2 pUv = vMapUv;
{
	vec3 pq0 = dFdx( - vViewPosition );
	vec3 pq1 = dFdy( - vViewPosition );
	vec2 pst0 = dFdx( vMapUv );
	vec2 pst1 = dFdy( vMapUv );
	vec3 pN = normalize( cross( pq0, pq1 ) );
	vec3 pq1p = cross( pq1, pN );
	vec3 pq0p = cross( pN, pq0 );
	vec3 pT = pq1p * pst0.x + pq0p * pst1.x;
	vec3 pB = pq1p * pst0.y + pq0p * pst1.y;
	float pdet = max( dot( pT, pT ), dot( pB, pB ) );
	float pscale = pdet == 0.0 ? 0.0 : inversesqrt( pdet );
	vec3 pV = normalize( vViewPosition );
	vec3 pVt = vec3( dot( pV, pT * pscale ), dot( pV, pB * pscale ), dot( pV, pN ) );

	float pAmt = ${PARALLAX_DEPTH} * ( 1.0 - smoothstep( 260.0, 820.0, length( vViewPosition ) ) ) * mix( 0.3, 1.0, smoothstep( 30.0, 150.0, length( vViewPosition ) ) );
	if ( pAmt > 0.0005 ) {
		const float LAYERS = ${PARALLAX_LAYERS}.0;
		vec2 P = pVt.xy / max( abs( pVt.z ), 0.35 ) * pAmt;
		vec2 dUv = P / LAYERS;
		vec2 gx = dFdx( vMapUv );
		vec2 gy = dFdy( vMapUv );
		float layer = 1.0 / LAYERS;
		float cur = 0.0;
		vec2 uv = vMapUv;
		float depthHere = 1.0 - textureGrad( normalMap, uv, gx, gy ).a;
		for ( int i = 0; i < ${PARALLAX_LAYERS}; i ++ ) {
			if ( cur >= depthHere ) break;
			uv -= dUv;
			depthHere = 1.0 - textureGrad( normalMap, uv, gx, gy ).a;
			cur += layer;
		}
		vec2 prev = uv + dUv;
		float after = depthHere - cur;
		float before = ( 1.0 - textureGrad( normalMap, prev, gx, gy ).a ) - cur + layer;
		float w = after / ( after - before + 1e-5 );
		pUv = mix( uv, prev, clamp( w, 0.0, 1.0 ) );
	}
}
#endif
`;

// Writes the surface normal and its distance to a second render target; the
// composite pass uses it to light the relief.
function patchDetailShader( shader ) {

	let f = shader.fragmentShader;

	f = 'layout(location = 1) out highp vec4 gNormal;\nuniform float uLmGamma;\n' + f;
	shader.uniforms.uLmGamma = lightCurve;

	// the baked light, curved: only what a source really lights stays bright
	f = f.replace( '#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace(
		'lightMapTexel.rgb * lightMapIntensity', 'max( pow( max( lightMapTexel.rgb, vec3( 0.0001 ) ), vec3( uLmGamma ) ), vec3( ' + BOUNCE_LIGHT + ' ) ) * lightMapIntensity' ) );

	// texture lookups follow the parallax-shifted coordinates
	f = f.replace( '#include <map_fragment>', PARALLAX_GLSL + THREE.ShaderChunk.map_fragment.replace( /vMapUv/g, '_pUv' ) );
	// the relief is softer the nearer it is: close up, a wall should be smooth but for small flaws; the full
	// depth is for looking at it from a little way off
	f = f.replace( '#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace( /vNormalMapUv/g, '_pUv' )
		.replace( 'mapN.xy *= normalScale;', 'mapN.xy *= normalScale * mix( 0.4, 1.0, smoothstep( 24.0, 150.0, length( vViewPosition ) ) );' ) );
	f = f.replace( '#include <emissivemap_fragment>', THREE.ShaderChunk.emissivemap_fragment.replace( /vEmissiveMapUv/g, '_pUv' ) );
	f = f.replace( '#include <opaque_fragment>', '#include <opaque_fragment>\n	gNormal = vec4( normalize( normal ) * 0.5 + 0.5, vViewPosition.z );' );

	// without a normal map there is no parallax; keep the names valid
	f = f.replace( /_pUv/g, 'DETAIL_UV' );
	f = '#ifdef USE_NORMALMAP\n#define DETAIL_UV pUv\n#else\n#define DETAIL_UV vMapUv\n#endif\n' + f;

	shader.fragmentShader = f;

}

// Every material drawn into the HDR target has to write both attachments.  Those
// that know nothing about the normal G-buffer (entities, sky, water, sprites,
// portals...) write "no normal here", which also replaces a stale normal from
// whatever they were drawn over.  Alpha 0 makes the composite fall back to the
// normal of the depth surface.
function patchGBufferShader( shader ) {

	const f = shader.fragmentShader;
	if ( f.indexOf( 'gNormal' ) !== - 1 || f.indexOf( '#include <colorspace_fragment>' ) === - 1 ) return;

	shader.fragmentShader = 'layout(location = 1) out highp vec4 gNormal;\n' +
		f.replace( '#include <colorspace_fragment>', '#include <colorspace_fragment>\n	gNormal = vec4( 0.0 );' );

}

THREE.Material.prototype.onBeforeCompile = patchGBufferShader;

function applyDetail( material ) {

	const diffuse = material.userData.detailDiffuse;
	const wanted = glowActive && diffuse != null ? R_NormalMapFor( diffuse ) : null;

	if ( material.normalMap === wanted ) return;

	const changedKind = ( material.normalMap != null ) !== ( wanted != null );
	material.normalMap = wanted;
	if ( material.normalScale !== undefined ) material.normalScale.set( 1, 1 );
	if ( changedKind ) material.needsUpdate = true;

}

// Lit world materials: gets a generated normal map and parallax while the HDR
// pipeline is on, and always writes the normal G-buffer.
export function R_RegisterDetail( material, diffuse ) {

	material.userData.detailDiffuse = diffuse;
	material.onBeforeCompile = patchDetailShader;
	material.customProgramCacheKey = function () {

		return 'quake-detail';

	};

	applyDetail( material );
	detailMaterials.add( material );
	material.addEventListener( 'dispose', () => detailMaterials.delete( material ) );

}

// the material's diffuse texture changed (texture animation)
export function R_RefreshDetail( material, diffuse ) {

	if ( ! detailMaterials.has( material ) ) return;
	material.userData.detailDiffuse = diffuse;
	applyDetail( material );

}

//============================================================================
// Light database
//============================================================================

let worldLights = [];
let hasSky = false;

// Pools of water and slime: { kind, min: [x, y], max: [x, y], z }.  A ray that
// passes through one loses light to it, and surfaces beneath it get caustics.
let liquidRegions = [];
let leafKeyCounter = 0;

export const MAX_LIQUID_REGIONS = 6;

// qbsp treats water as opaque when computing visibility, so the leaves under a
// pool are not visible from outside it.  To see the bottom through a translucent
// surface, the leaves beneath each liquid face join the visible set whenever the
// leaf above that face is visible, and the other way round from inside the
// liquid, so you can see out.   [ { above, below, aboveVis, belowVis } ]
let liquidLinks = [];

export function R_GetLiquidLinks() {

	return liquidLinks;

}

// 0 water, 1 slime, -1 not a see-through liquid (lava is opaque, teleporters are portals)
function liquidKind( name ) {

	const n = name.toLowerCase();
	if ( n.charAt( 0 ) !== '*' || n.indexOf( 'lava' ) >= 0 || n.indexOf( 'teleport' ) >= 0 ) return - 1;
	if ( n.indexOf( 'slime' ) >= 0 ) return 1;
	if ( n.indexOf( 'water' ) >= 0 ) return 0;
	return - 1;

}

// how opaque the liquid's surface is drawn in the HDR pipeline
export function R_LiquidOpacity( name, fallback ) {

	if ( r_newer_water.value === 0 ) return fallback;

	const kind = liquidKind( name );
	if ( kind === 0 ) return 0.42;
	if ( kind === 1 ) return 0.62;
	return fallback;

}

// merge the many small faces of a pool into one box
function mergeLiquidFaces( faces ) {

	const parent = faces.map( ( f, i ) => i );
	const find = i => parent[ i ] === i ? i : ( parent[ i ] = find( parent[ i ] ) );

	for ( let i = 0; i < faces.length; i ++ ) {

		for ( let j = i + 1; j < faces.length; j ++ ) {

			const a = faces[ i ], b = faces[ j ];
			if ( a.kind !== b.kind || Math.abs( a.z - b.z ) > 1.5 ) continue;
			if ( a.min[ 0 ] > b.max[ 0 ] + 24 || b.min[ 0 ] > a.max[ 0 ] + 24 ) continue;
			if ( a.min[ 1 ] > b.max[ 1 ] + 24 || b.min[ 1 ] > a.max[ 1 ] + 24 ) continue;
			parent[ find( i ) ] = find( j );

		}

	}

	const merged = new Map();
	for ( let i = 0; i < faces.length; i ++ ) {

		const r = find( i );
		const f = faces[ i ];
		const m = merged.get( r );
		if ( m === undefined ) {

			merged.set( r, { kind: f.kind, min: f.min.slice(), max: f.max.slice(), z: f.z } );

		} else {

			for ( let a = 0; a < 2; a ++ ) {

				m.min[ a ] = Math.min( m.min[ a ], f.min[ a ] );
				m.max[ a ] = Math.max( m.max[ a ], f.max[ a ] );

			}

		}

	}

	return [ ...merged.values() ].filter( r => ( r.max[ 0 ] - r.min[ 0 ] ) * ( r.max[ 1 ] - r.min[ 1 ] ) > 64 * 64 );

}

export function R_GetLiquidRegions() {

	return liquidRegions;

}

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

function polyBounds( surf ) {

	const b = [ 1e9, 1e9, 1e9, - 1e9, - 1e9, - 1e9 ];
	let any = false;

	for ( let p = surf.polys; p; p = p.next ) {

		const v = p.verts;
		for ( let i = 0; i < p.numverts; i ++ ) {

			for ( let k = 0; k < 3; k ++ ) {

				const x = v instanceof Float32Array ? v[ i * 7 + k ] : v[ i ][ k ];
				if ( x < b[ k ] ) b[ k ] = x;
				if ( x > b[ k + 3 ] ) b[ k + 3 ] = x;

			}

			any = true;

		}

	}

	return any ? b : null;

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

	if ( name.indexOf( '*lava' ) === 0 ) return { color: [ 1.0, 0.36, 0.1 ], coverage: 2.4 };
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
	liquidRegions = [];
	liquidLinks = [];
	buildSkyCookie();
	sunDirection = [ - 0.28, - 0.18, 0.94 ];

	if ( model == null || model.nodes == null ) return worldLights;

	// light entities
	if ( model.entities != null ) {

		const entities = R_ParseEntityLump( model.entities );

		const world = entities.find( e => e.classname === 'worldspawn' );
		if ( world != null && world._sun_mangle != null ) {

			const a = parseVector( world._sun_mangle, null );
			if ( a != null ) sunDirection = sunFromAngles( a[ 0 ], a[ 1 ] );

		}

		for ( const ent of entities ) {

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
				// torches and fires burn unevenly: their light flickers (a light with a style of its own follows that)
				flicker: FIRE_LIGHT.test( ent.classname ) && ( parseInt( ent.style, 10 ) || 0 ) === 0 ? 1 : 0,
				leaf: Mod_PointInLeaf( pos, model )
			} );

		}

	}

	// emissive surfaces (lava, light panels, glowing buttons...)
	if ( model.surfaces != null ) {

		const first = model.firstmodelsurface || 0;
		const last = first + ( model.nummodelsurfaces || model.surfaces.length );
		const clusters = new Map();
		const liquidFaces = [];
		const linkSeen = new Set();
		const visCache = new Map();

		for ( let i = first; i < last; i ++ ) {

			const surf = model.surfaces[ i ];
			if ( surf == null || surf.texinfo == null || surf.texinfo.texture == null ) continue;
			if ( surf.flags & SURF_DRAWSKY ) { hasSky = true; continue; }

			const liquid = liquidKind( surf.texinfo.texture.name );
			if ( liquid >= 0 && Math.abs( surf.plane.normal[ 2 ] ) > 0.95 ) {

				const info = polyInfo( surf );
				const box = polyBounds( surf );
				if ( info != null && box != null ) {

					liquidFaces.push( { kind: liquid, min: [ box[ 0 ], box[ 1 ] ], max: [ box[ 3 ], box[ 4 ] ], z: info.center[ 2 ] } );

					// the air above this face and the liquid just below it
					const above = Mod_PointInLeaf( [ info.center[ 0 ], info.center[ 1 ], info.center[ 2 ] + 4 ], model );
					const below = Mod_PointInLeaf( [ info.center[ 0 ], info.center[ 1 ], info.center[ 2 ] - 4 ], model );
					if ( above !== below && below.contents !== - 2 ) {

						const key = above.__portalKey ?? ( above.__portalKey = ++ leafKeyCounter );
						const key2 = below.__portalKey ?? ( below.__portalKey = ++ leafKeyCounter );
						if ( ! linkSeen.has( key * 1e6 + key2 ) ) {

							linkSeen.add( key * 1e6 + key2 );
							if ( ! visCache.has( key2 ) )
								visCache.set( key2, Mod_LeafPVS( below, model ).slice( 0, ( model.numleafs + 7 ) >> 3 ) );
							if ( ! visCache.has( - key ) )
								visCache.set( - key, Mod_LeafPVS( above, model ).slice( 0, ( model.numleafs + 7 ) >> 3 ) );
							liquidLinks.push( { above, below, belowVis: visCache.get( key2 ), aboveVis: visCache.get( - key ) } );

						}

					}

				}

				continue;

			}

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

		liquidRegions = mergeLiquidFaces( liquidFaces );

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

//============================================================================
// Sun occluder
//
// The sun's shadow map must contain the whole map, not just what happens to be
// visible or loaded this frame: a ceiling that is not being drawn would let the
// sun through into a closed room.  So the shadow casters are their own static
// mesh, built once per map from every solid world surface (no sky, no liquids),
// and only ever seen by the shadow camera.
//============================================================================

let occluder = null;

function disposeOccluder() {

	if ( occluder === null ) return;
	if ( occluder.parent != null ) occluder.parent.remove( occluder );
	occluder.geometry.dispose();
	occluder = null;

}

export function R_BuildSunOccluder( model ) {

	disposeOccluder();
	if ( model == null || model.surfaces == null ) return 0;

	const first = model.firstmodelsurface || 0;
	const last = first + ( model.nummodelsurfaces || model.surfaces.length );
	const positions = [];

	for ( let i = first; i < last; i ++ ) {

		const surf = model.surfaces[ i ];
		if ( surf == null || surf.polys == null ) continue;
		if ( surf.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) continue;

		for ( let p = surf.polys; p; p = p.next ) {

			const v = p.verts;
			const at = ( n, k ) => v instanceof Float32Array ? v[ n * 7 + k ] : v[ n ][ k ];

			for ( let n = 2; n < p.numverts; n ++ ) {

				for ( const idx of [ 0, n - 1, n ] )
					positions.push( at( idx, 0 ), at( idx, 1 ), at( idx, 2 ) );

			}

		}

	}

	if ( positions.length === 0 ) return 0;

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( positions ), 3 ) );
	geometry.computeBoundingSphere();

	occluder = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } ) );
	occluder.name = 'quake_sun_occluder';
	if ( occluder.layers !== undefined ) occluder.layers.set( SUN_SHADOW_LAYER ); // invisible to every ordinary camera
	occluder.matrixAutoUpdate = false;

	return positions.length / 9;

}

//============================================================================
// Sky analysis
//
// How much light comes through the sky, what colour it is and what pattern it
// has all come from the map's own sky textures, so a bright clear sky gives a
// bright sunlit outdoors and crisp shafts with little haze, while a dark or
// stormy sky gives dim light, faint shafts and more haze.  The pattern (clouds)
// becomes a "cookie" that is projected along the sun so shafts and sunlit
// patches break up the way the sky does.
//============================================================================

const SKY_DEFAULT = { luma: 0.5, color: [ 1, 0.85, 0.65 ], contrast: 0 };
let skyInfo = SKY_DEFAULT;
let skyCookie = null;
let skyCookieCloud = null;
const cookieNorm = new THREE.Vector3( 1, 1, 1 );
const cookieMean = new THREE.Vector3( 1, 1, 1 );
const cookieDepth = { value: 1 };

// brightness is judged the way it looks (display values), not in linear light,
// so a sky that looks mid-dark is not rated as black
function srgbToLinear( v ) {

	return v / 255;

}

// analyse RGBA sky layers; returns { luma, color, contrast, cookie: Float32Array(n) } or null
export function R_AnalyseSky( solid, cloud, size ) {

	if ( solid == null || solid.length < size * size * 4 ) return null;

	const n = size * size;
	const luma = new Float32Array( n );
	let r = 0, g = 0, b = 0, sum = 0;

	for ( let i = 0; i < n; i ++ ) {

		let cr = srgbToLinear( solid[ i * 4 ] ), cg = srgbToLinear( solid[ i * 4 + 1 ] ), cb = srgbToLinear( solid[ i * 4 + 2 ] );

		if ( cloud != null && cloud.length >= n * 4 ) {

			const a = cloud[ i * 4 + 3 ] / 255;
			cr += ( srgbToLinear( cloud[ i * 4 ] ) - cr ) * a;
			cg += ( srgbToLinear( cloud[ i * 4 + 1 ] ) - cg ) * a;
			cb += ( srgbToLinear( cloud[ i * 4 + 2 ] ) - cb ) * a;

		}

		luma[ i ] = cr * 0.2126 + cg * 0.7152 + cb * 0.0722;
		r += cr; g += cg; b += cb; sum += luma[ i ];

	}

	const mean = sum / n;
	let variance = 0;
	for ( let i = 0; i < n; i ++ ) variance += ( luma[ i ] - mean ) * ( luma[ i ] - mean );
	const contrast = Math.min( 1, Math.sqrt( variance / n ) / ( mean + 0.02 ) );

	// the average colour, kept saturated but normalised so it tints and does not dim
	const peak = Math.max( r, g, b ) / n || 1;
	const color = [ r / n / peak, g / n / peak, b / n / peak ];

	// mean-1 cookie: brighter than average sky passes more light
	const cookie = new Float32Array( n );
	for ( let i = 0; i < n; i ++ ) cookie[ i ] = luma[ i ] / ( mean + 1e-4 );

	return { luma: mean, color, contrast, cookie };

}

// shared strength derived from the sky: 0 = a dark sky, 1 = a bright clear one
export function R_SkyBrightness( luma ) {

	const t = Math.max( 0, Math.min( 1, ( luma - 0.05 ) / 0.4 ) );
	return t * t * ( 3 - 2 * t );

}

export function R_GetSkyInfo() {

	return skyInfo;

}

function buildSkyCookie() {

	skyInfo = SKY_DEFAULT;
	if ( skyCookie !== null ) { skyCookie.dispose(); skyCookie = null; }
	if ( skyCookieCloud !== null ) { skyCookieCloud.dispose(); skyCookieCloud = null; }

	const sd = solidskytexture != null && solidskytexture.image != null ? solidskytexture.image.data : null;
	const ad = alphaskytexture != null && alphaskytexture.image != null ? alphaskytexture.image.data : null;
	const size = solidskytexture != null && solidskytexture.image != null ? solidskytexture.image.width : 0;
	const result = size > 0 ? R_AnalyseSky( sd, ad, size ) : null;
	if ( result == null ) return;

	skyInfo = { luma: result.luma, color: result.color, contrast: result.contrast };

	// how much of the pattern shows through: a clear sky barely varies, a cloudy or veined one (lightning,
	// storm) carries its pattern well into the shafts
	const depth = 0.75 + 1.1 * result.contrast;

	// the pattern in colour: how much brighter than the sky's average each part is (a steeper curve,
	// so the bright veins stand out from the dark clouds), and where the colour differs from the average
	const n = size * size;
	const mean = [ 0, 0, 0 ];
	const pix = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) {

		let cr = sd[ i * 4 ] / 255, cg = sd[ i * 4 + 1 ] / 255, cb = sd[ i * 4 + 2 ] / 255;
		if ( ad != null && ad.length >= n * 4 ) {

			const a = ad[ i * 4 + 3 ] / 255;
			cr += ( ad[ i * 4 ] / 255 - cr ) * a;
			cg += ( ad[ i * 4 + 1 ] / 255 - cg ) * a;
			cb += ( ad[ i * 4 + 2 ] / 255 - cb ) * a;

		}

		pix[ i * 3 ] = cr; pix[ i * 3 + 1 ] = cg; pix[ i * 3 + 2 ] = cb;
		mean[ 0 ] += cr; mean[ 1 ] += cg; mean[ 2 ] += cb;

	}

	for ( let k = 0; k < 3; k ++ ) mean[ k ] = mean[ k ] / n + 1e-4;

	let total = [ 0, 0, 0 ];
	const rgb = new Float32Array( n * 3 );
	for ( let i = 0; i < n; i ++ ) {

		const bright = Math.pow( Math.max( result.cookie[ i ], 0 ), 1 + 0.9 * depth );
		for ( let k = 0; k < 3; k ++ ) {

			const hue = Math.pow( pix[ i * 3 + k ] / mean[ k ] / Math.max( result.cookie[ i ], 1e-3 ), 0.6 );
			rgb[ i * 3 + k ] = Math.max( 0, bright * Math.min( hue, 2.5 ) );
			total[ k ] += rgb[ i * 3 + k ];

		}

	}

	// each channel averages 1 (so the pattern shapes the light and does not dim or tint the whole of it): the
	// shader works the same curve out for each point, and divides by these
	cookieNorm.set( total[ 0 ] / n + 1e-4, total[ 1 ] / n + 1e-4, total[ 2 ] / n + 1e-4 );
	cookieMean.set( mean[ 0 ], mean[ 1 ], mean[ 2 ] );
	cookieDepth.value = depth;

	// The sky is two layers that move at their own speeds (the solid one 8 units a second, the clouds over it
	// 16), so the pattern is kept as the two layers and put together in the shader, each scrolled at its own
	// speed: the light on the ground then moves as the clouds overhead do.
	const make = ( withAlpha ) => {

		const data = new Uint16Array( n * 4 );
		const src = withAlpha ? ad : sd;
		for ( let i = 0; i < n * 4; i ++ ) data[ i ] = THREE.DataUtils.toHalfFloat( ( withAlpha || ( i & 3 ) !== 3 ) && src != null ? src[ i ] / 255 : 1 );

		const t = new THREE.DataTexture( data, size, size, THREE.RGBAFormat, THREE.HalfFloatType );
		t.wrapS = THREE.RepeatWrapping;
		t.wrapT = THREE.RepeatWrapping;
		t.magFilter = THREE.LinearFilter;
		t.minFilter = THREE.LinearFilter;
		t.colorSpace = THREE.NoColorSpace;
		t.needsUpdate = true;
		return t;

	};

	skyCookie = make( false );
	if ( skyCookieCloud !== null ) skyCookieCloud.dispose();
	skyCookieCloud = ad != null && ad.length >= n * 4 ? make( true ) : null;

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
const MUZZLE_COLOR = [ 1.0, 0.78, 0.45 ]; // a muzzle flash is whiter and much stronger than an ember
const MUZZLE_POWER = 3;

function consider( px, py, pz, color, power, radius, view, add = 0 ) {

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
	slot.add = add;
	slot.pos[ 0 ] = vx; slot.pos[ 1 ] = vy; slot.pos[ 2 ] = vz;
	slot.radius = radius;
	slot.range = 130 + 170 * Math.sqrt( power );
	slot.color[ 0 ] = color[ 0 ] * power * LIGHT_GAIN;
	slot.color[ 1 ] = color[ 1 ] * power * LIGHT_GAIN;
	slot.color[ 2 ] = color[ 2 ] * power * LIGHT_GAIN;

}

const FIRE_LIGHT = /torch|flame|fire|brazier/i;

// How bright a fire is at a moment: a slow swell and quick flutters, a little
// different for every fire so a row of torches does not pulse together.
export function R_FireFlicker( x, y, z, time ) {

	const ph = ( x * 0.013 + y * 0.017 + z * 0.011 ) % 6.2832;
	const a = Math.sin( time * 2.3 + ph ) * 0.5 + Math.sin( time * 5.1 + ph * 2.1 ) * 0.3;
	const b = Math.sin( time * 13.7 + ph * 3.3 ) * Math.sin( time * 8.9 + ph * 1.7 );
	return Math.min( 1.25, Math.max( 0.55, 0.9 + a * 0.15 + b * 0.18 ) );

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

		if ( l.flicker === 1 ) power *= R_FireFlicker( l.pos[ 0 ], l.pos[ 1 ], l.pos[ 2 ], time );

		if ( power <= 0.001 ) continue;
		consider( l.pos[ 0 ], l.pos[ 1 ], l.pos[ 2 ], l.color, power, l.radius, view );

	}

	if ( dlights != null ) {

		for ( let i = 0; i < dlights.length; i ++ ) {

			const d = dlights[ i ];
			if ( d == null || d.radius <= 0 || d.die < time ) continue;

			// (the game gives a muzzle flash a minimum light of 32)
			const muzzle = d.minlight === 32;
			// an ordinary light fades over its last 0.3 s; a flash is only 0.1 s long and full strength until it is gone
			const fade = Math.min( 1, ( d.die - time ) / ( muzzle ? 0.1 : 0.3 ) );
			consider( d.origin[ 0 ], d.origin[ 1 ], d.origin[ 2 ], muzzle ? MUZZLE_COLOR : DLIGHT_COLOR,
				d.radius / 300 * 1.4 * fade * ( muzzle ? MUZZLE_POWER * ( d.flashScale === undefined ? 1 : d.flashScale ) : 1 ), 40, view, muzzle ? 1 : 0 );

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

// shared by the volumetric and composite passes
const COMMON_FRAGMENT = `
precision highp float;
#include <packing>
uniform sampler2D tDepth;
uniform sampler2D tSunShadow;
uniform mat4 uProj;
uniform float uBounce;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform mat4 uSunVP;
uniform float uNear;
uniform float uFar;
uniform int uCount;
uniform float uSpotOn;
uniform vec3 uSpotPos;
uniform vec3 uSpotDir;
uniform vec3 uSpotCol;
uniform vec2 uSpotCone;
uniform vec4 uLightPos[ ${MAX_VOLUME_LIGHTS} ];
uniform vec4 uLightCol[ ${MAX_VOLUME_LIGHTS} ];
uniform vec3 uSunDirV;
uniform vec3 uSunDirW;
uniform vec3 uSunCol;
uniform float uSunOn;
uniform float uShadowTexel;
uniform float uMaxRay;
uniform sampler2D tCookie;
uniform float uCookie; // 0 = no pattern, 1 = the sky's own pattern
uniform float uCookieTime;
uniform sampler2D tCookieCloud;
uniform float uCookieCloud;
uniform vec3 uCookieMean;
uniform vec3 uCookieNorm;
uniform float uCookieDepth;
const float COOKIE_SCALE = 700.0; // world units to one repeat of the sky picture
varying vec2 vUv;

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

// how much of the sky's pattern reaches a point: the sky texture projected along
// the sun's direction and scrolled the way the sky drifts, so shafts and sunlit
// patches break up the way the clouds do
vec3 skyCookieRGB( vec3 worldPos ) {
	vec3 sd = normalize( uSunDirW );
	vec2 uv = ( worldPos.xy - sd.xy / max( sd.z, 0.2 ) * ( worldPos.z - 1000.0 ) ) / COOKIE_SCALE;
	// the sky's own scrolling (see EmitSkyPolysQuake: 8 and 16 units a second of a 128 unit picture)
	vec3 pix = texture2D( tCookie, uv + vec2( 1.0 ) * uCookieTime * ( 8.0 / 128.0 ) ).rgb;
	if ( uCookieCloud > 0.5 ) {
		vec4 cl = texture2D( tCookieCloud, uv + vec2( 1.0 ) * uCookieTime * ( 16.0 / 128.0 ) );
		pix = mix( pix, cl.rgb, cl.a );
	}
	float L = dot( pix, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( uCookieMean, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 );
	float bright = pow( max( L, 0.0 ), 1.0 + 0.9 * uCookieDepth );
	vec3 hue = min( pow( max( pix / uCookieMean / max( L, 1e-3 ), vec3( 0.0 ) ), vec3( 0.6 ) ), vec3( 2.5 ) );
	vec3 v = min( bright * hue / uCookieNorm, vec3( 6.0 ) );
	return mix( vec3( 1.0 ), v, uCookie );
}

float skyCookie( vec3 worldPos ) {
	return dot( skyCookieRGB( worldPos ), vec3( 0.2126, 0.7152, 0.0722 ) );
}

// 1 where the sun reaches a world-space point, 0 in shadow
float sunLit( vec3 worldPos ) {
	vec3 u = ( uSunVP * vec4( worldPos, 1.0 ) ).xyz * 0.5 + 0.5;
	// beyond the shadow map nothing is known: assume shadow, never light
	if ( u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0 || u.z > 1.0 ) return 0.0;
	return step( u.z - 0.0012, texture2D( tSunShadow, u.xy ).x );
}

float sunLitSoft( vec3 worldPos ) {
	vec3 u = ( uSunVP * vec4( worldPos, 1.0 ) ).xyz * 0.5 + 0.5;
	if ( u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0 || u.z > 1.0 ) return 0.0;
	float ref = u.z - 0.0012;
	float t = uShadowTexel;
	float lit = step( ref, texture2D( tSunShadow, u.xy + vec2( -t, -t ) ).x )
		+ step( ref, texture2D( tSunShadow, u.xy + vec2( t, -t ) ).x )
		+ step( ref, texture2D( tSunShadow, u.xy + vec2( -t, t ) ).x )
		+ step( ref, texture2D( tSunShadow, u.xy + vec2( t, t ) ).x );
	return lit * 0.25;
}
`;

const VOLUME_FRAGMENT = COMMON_FRAGMENT + `
uniform float uSunScatter;
uniform float uScatter;
uniform float uOpenFog;
uniform float uShaftFog;
uniform float uShadowSpread;

const int SHADOW_STEPS = 12;
const int SUN_STEPS = 56;

void main() {
	vec4 r = uProjInv * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
	vec3 dirV = normalize( r.xyz / r.w );

	float zd = sceneDist( vUv );
	float D = zd > 1e5 ? min( uMaxRay, 1800.0 ) : min( zd / max( - dirV.z, 0.05 ), uMaxRay );
	float jit = noise( gl_FragCoord.xy );

	vec3 result = vec3( 0.0 );

	// sun: march the view ray through the sun's shadow map
	if ( uSunOn > 0.5 ) {
		float dMax = min( D, zd > 1e5 ? 500.0 : 2600.0 );
		float ds = dMax / float( SUN_STEPS );
		vec3 lit = vec3( 0.0 );
		for ( int k = 0; k < SUN_STEPS; k ++ ) {
			float t = ( float( k ) + jit ) * ds;
			vec3 pw = ( uViewInv * vec4( dirV * t, 1.0 ) ).xyz;
			vec3 u = ( uSunVP * vec4( pw, 1.0 ) ).xyz * 0.5 + 0.5;
			if ( u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0 || u.z > 1.0 ) continue;
			float ref = u.z - 0.0012;
			float here = step( ref, texture2D( tSunShadow, u.xy ).x );
			if ( here < 0.5 ) continue;
			// Light only shows up in air where it is contrasted with shade: the
			// more of the surroundings are in shadow, the denser the shaft.  Wide
			// open lit air is faint, so daylight outdoors stays clear.
			float around = step( ref, texture2D( tSunShadow, u.xy + vec2( uShadowSpread, 0.0 ) ).x )
				+ step( ref, texture2D( tSunShadow, u.xy - vec2( uShadowSpread, 0.0 ) ).x )
				+ step( ref, texture2D( tSunShadow, u.xy + vec2( 0.0, uShadowSpread ) ).x )
				+ step( ref, texture2D( tSunShadow, u.xy - vec2( 0.0, uShadowSpread ) ).x );
			// (squared: the edge of a pillar is where it goes from the full density to none, not a soft ramp)
			float edge = 1.0 - around * 0.25;
			float density = uOpenFog + edge * edge * uShaftFog;
			lit += density * skyCookieRGB( pw ) * exp( - t * 0.0007 );
		}
		lit *= ds;
		float phase = henyeyGreenstein( dot( dirV, uSunDirV ), 0.3 );
		result += uSunCol * lit * uSunScatter * phase * ( zd > 1e5 ? 0.1 : 1.0 );
	}

	// point lights: analytic inverse-square scattering, occluded on screen
	vec3 acc = vec3( 0.0 );
	for ( int i = 0; i < ${MAX_VOLUME_LIGHTS}; i ++ ) {
		if ( i >= uCount ) break;

		vec3 L = uLightPos[ i ].xyz;
		float R = uLightPos[ i ].w;

		float t0 = dot( L, dirV );
		float h = sqrt( max( dot( L, L ) - t0 * t0, 0.0 ) + R * R );
		float integral = ( atan( ( D - t0 ) / h ) + atan( t0 / h ) ) / h;
		float range = uLightCol[ i ].w;
		integral *= 1.0 - smoothstep( 0.25 * range, range, h );

		vec3 Q = dirV * clamp( t0, 0.0, D );
		float lit = 0.0;
		for ( int k = 0; k < SHADOW_STEPS; k ++ ) {
			float s = ( float( k ) + jit ) / float( SHADOW_STEPS );
			vec3 P = mix( Q, L, s * 0.97 );
			if ( P.z > - uNear ) { lit += 1.0; continue; }
			vec4 c = uProj * vec4( P, 1.0 );
			vec2 uv = c.xy / c.w * 0.5 + 0.5;
			if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) { lit += 1.0; continue; }
			float bias = 6.0 + 0.015 * ( - P.z );
			lit += sceneDist( uv ) < ( - P.z ) - bias ? 0.0 : 1.0;
		}
		lit /= float( SHADOW_STEPS );

		float phase = henyeyGreenstein( dot( normalize( Q - L ), - dirV ), 0.3 );
		acc += uLightCol[ i ].rgb * integral * lit * lit * phase;
	}

	// the flashlight's beam: the air in the cone lights up, thickest where you look along it
	if ( uSpotOn > 0.5 ) {
		float dMax = min( D, 900.0 );
		float ds = dMax / 20.0;
		vec3 beam = vec3( 0.0 );
		for ( int k = 0; k < 20; k ++ ) {
			float t = ( float( k ) + jit ) * ds;
			vec3 P = dirV * t;
			vec3 toP = P - uSpotPos;
			float dist = length( toP );
			float cone = smoothstep( uSpotCone.x, uSpotCone.y, dot( toP / max( dist, 1.0 ), uSpotDir ) );
			if ( cone <= 0.0 ) continue;
			// thickest near the lamp, thinning out with distance: a faint shaft, not a veil
			beam += uSpotCol * cone * cone / ( 1.0 + dist * dist / ( 200.0 * 200.0 ) );
		}
		float phase = henyeyGreenstein( dot( dirV, uSpotDir ), 0.5 );
		result += beam * ds * 0.0000011 * phase;
	}

	gl_FragColor = vec4( result + acc * uScatter, 1.0 );
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

const COMPOSITE_FRAGMENT = COMMON_FRAGMENT + `
#include <common>
uniform sampler2D tScene;
uniform sampler2D tNormal;
uniform sampler2D tVolume;
uniform sampler2D tBloom;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uBloom;
uniform float uVolume;
uniform float uHaze;
uniform vec3 uHazeColor;
uniform float uSunSurface;
uniform vec3 uSunSurfaceCol;
uniform float uLightSurface;
uniform float uLightFloor;
uniform float uLightAdd[ ${MAX_VOLUME_LIGHTS} ];
uniform float uEdge;
uniform float uDropDensity;
uniform float uDropBlood;
uniform float uBumpLight;
uniform float uTeleStretch;
uniform float uTeleChroma;
uniform float uDropAge;
uniform float uSaturation;
uniform float uVibrance;
uniform float uContrast;
uniform float uBright;
uniform float uContrastGain;
uniform float uContrastPivot;
uniform float uTime;
uniform float uCaustic;
uniform int uWaterCount;
uniform vec4 uWaterMin[ ${MAX_LIQUID_REGIONS} ]; // xy = min corner, z = surface height, w = kind
uniform vec4 uWaterMax[ ${MAX_LIQUID_REGIONS} ]; // xy = max corner

const int RELIGHT_STEPS = 6;

// tiling water caustics: the bright network light makes when it is bent by ripples
float caustic( vec2 uv, float t ) {
	vec2 p = mod( uv * 6.28318, 6.28318 ) - 250.0;
	vec2 i = p;
	float c = 1.0;
	float inten = 0.005;
	for ( int n = 0; n < 4; n ++ ) {
		float tt = t * ( 1.0 - ( 3.5 / float( n + 1 ) ) );
		i = p + vec2( cos( tt - i.x ) + sin( tt + i.y ), sin( tt - i.y ) + cos( tt + i.x ) );
		c += 1.0 / length( vec2( p.x / ( sin( i.x + tt ) / inten ), p.y / ( cos( i.y + tt ) / inten ) ) );
	}
	c /= 4.0;
	c = 1.17 - pow( c, 1.4 );
	return pow( abs( c ), 8.0 );
}

vec3 viewPosAt( vec2 uv ) {
	float d = texture2D( tDepth, uv ).x;
	vec4 p = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
	return p.xyz / p.w;
}

// keeps values under the knee untouched; rolls highlights off toward white
vec3 shoulder( vec3 c ) {
	float knee = 0.8;
	float m = max( c.r, max( c.g, c.b ) );
	if ( m <= knee ) return c;
	float range = 1.0 - knee;
	float mapped = knee + range * ( 1.0 - exp( - ( m - knee ) / range ) );
	vec3 scaled = c * ( mapped / m );
	float hot = smoothstep( 1.0, 4.0, m );
	return mix( scaled, vec3( mapped ), hot * 0.45 );
}

// Ambient accent at real creases.  The surface's plane comes from the depth
// buffer (not the normal map, whose bumps are not corners); each neighbour within
// a few units is above the plane (the other wall of an inside corner: darken) or
// below it (past an outer edge: lighten).  Neighbours on the plane, which is what
// a flat wall made of several pieces looks like, count for nothing.
float creaseAccent( vec3 P, vec3 Ng ) {
	float dist = - P.z;
	if ( dist < 24.0 ) return 1.0; // the weapon, right at the eye
	const float R = 7.0;
	vec2 px = clamp( vec2( uProj[ 0 ][ 0 ], uProj[ 1 ][ 1 ] ) * 0.5 * ( R / dist ), uTexel * 1.5, uTexel * 16.0 );
	float occ = 0.0;
	float edge = 0.0;
	for ( int i = 0; i < 8; i ++ ) {
		float a = float( i ) * 0.785398;
		vec2 dir = vec2( cos( a ), sin( a ) );
		for ( int k = 1; k <= 2; k ++ ) {
			vec3 Pn = viewPosAt( vUv + dir * px * ( float( k ) * 0.5 ) );
			vec3 v = Pn - P;
			float vd = length( v );
			if ( vd < 0.5 ) continue;
			float h = dot( v, Ng ) / vd;
			float w = 1.0 - smoothstep( R * 1.3, R * 3.5, vd ); // far things are another surface, not a corner
			if ( h > 0.18 ) occ += ( h - 0.18 ) * w;
			else if ( h < - 0.18 ) edge += ( - h - 0.18 ) * w;
		}
	}
	occ /= 16.0;
	edge /= 16.0;
	return ( 1.0 - clamp( occ * 6.0, 0.0, 0.8 ) * uEdge ) * ( 1.0 + clamp( edge * 4.0, 0.0, 0.45 ) * uEdge );
}

float dropHash( vec2 p ) {
	p = fract( p * vec2( 123.34, 345.45 ) );
	p += dot( p, p + 34.345 );
	return fract( p.x * p.y );
}

// Drops on the lens.  Cells of a grid each hold at most one drop; how many cells
// are wet is the density, so as the view dries the drops go one by one.  Some
// columns of the grid slide downwards over time, carrying their drops with them
// and leaving a thin wet line behind.  Returns ( bend x, bend y, drop, glint ).
vec4 lensDrops( vec2 uv, float grid, float seed ) {
	vec2 g = uv * vec2( grid * 1.7, grid );
	float col = floor( g.x );
	float runs = step( 0.55, dropHash( vec2( col + seed, 3.0 ) ) );
	float speed = runs * ( 0.35 + 1.1 * dropHash( vec2( col, 9.0 + seed ) ) );
	g.y += uDropAge * speed * 0.7 * min( 1.0, uDropAge * 0.6 );
	vec2 id = floor( g );
	vec2 f = fract( g ) - 0.5;
	float r1 = dropHash( id + seed );
	float r2 = dropHash( id * 1.7 + 11.3 + seed );
	float r3 = dropHash( id * 2.3 + 5.1 + seed );
	if ( r1 > uDropDensity * 0.5 ) return vec4( 0.0 );
	vec2 p = ( vec2( r2, r3 ) - 0.5 ) * 0.5;
	float size = 0.1 + 0.2 * r2 * r3 + 0.05 * r3;
	vec2 d = ( f - p ) * vec2( 1.0, 1.15 );
	float dist = length( d );
	float drop = smoothstep( size, size * 0.55, dist );
	// the wet line above a running drop
	float line = 0.0;
	if ( runs > 0.5 && uDropAge > 0.4 ) {
		float above = f.y - p.y;
		line = smoothstep( 0.03, 0.0, abs( f.x - p.x ) ) * step( 0.0, above ) * smoothstep( 0.5, 0.0, above ) * 0.55;
	}
	float mask = max( drop, line * 0.6 );
	// the drop is a lens: it shows the picture upside-down and bent
	vec2 bend = - ( f - p ) * drop * 1.5 / grid;
	float glint = smoothstep( 0.55, 1.0, dot( normalize( vec2( - 0.6, 0.8 ) ), d / max( size, 1e-3 ) ) ) * drop;
	return vec4( bend, mask, glint );
}

void main() {
	vec2 uvd = vUv;
	// teleporting: the picture is pulled upwards (the middle rows fill the screen)
	if ( uTeleStretch > 0.0 ) {
		float S = 1.0 + uTeleStretch * uTeleStretch * 9.0;
		uvd.y = 0.5 + ( vUv.y - 0.5 ) / S;
		uvd.x = 0.5 + ( vUv.x - 0.5 ) * ( 1.0 + uTeleStretch * 0.35 );
	}
	float dropMask = 0.0;
	float dropGlint = 0.0;
	if ( uDropDensity > 0.001 ) {
		vec4 a = lensDrops( vUv, 9.0, 0.0 );
		vec4 b = lensDrops( vUv, 21.0, 17.0 );
		uvd += a.xy + b.xy * 0.7;
		dropMask = clamp( a.z + b.z * 0.8, 0.0, 1.0 );
		dropGlint = clamp( a.w + b.w * 0.6, 0.0, 1.0 );
	}
	vec3 scene = texture2D( tScene, uvd ).rgb;
	if ( uTeleChroma > 0.0 ) {
		// red, green and blue come apart, along the stretch
		vec2 sp = vec2( uTeleChroma * 0.006 * ( 1.0 + 3.0 * uTeleStretch ), uTeleChroma * 0.05 );
		scene = vec3( texture2D( tScene, uvd + sp ).r, scene.g, texture2D( tScene, uvd - sp ).b );
		scene *= 1.0 + uTeleChroma * 0.35;
	}
	if ( dropMask > 0.0 ) {
		// what is seen through a drop is slightly out of focus
		vec2 bl = uTexel * 3.5;
		vec3 soft = ( scene
			+ texture2D( tScene, uvd + vec2( bl.x, 0.0 ) ).rgb + texture2D( tScene, uvd - vec2( bl.x, 0.0 ) ).rgb
			+ texture2D( tScene, uvd + vec2( 0.0, bl.y ) ).rgb + texture2D( tScene, uvd - vec2( 0.0, bl.y ) ).rgb
			+ texture2D( tScene, uvd + bl ).rgb + texture2D( tScene, uvd - bl ).rgb
			+ texture2D( tScene, uvd + vec2( bl.x, - bl.y ) ).rgb + texture2D( tScene, uvd - vec2( bl.x, - bl.y ) ).rgb ) / 9.0;
		scene = mix( scene, soft, clamp( dropMask * 1.2, 0.0, 1.0 ) );
	}
	float d = texture2D( tDepth, uvd ).x;

	vec4 r = uProjInv * vec4( uvd * 2.0 - 1.0, 1.0, 1.0 );
	vec3 dirV = normalize( r.xyz / r.w );
	float D = d >= 0.99999 ? uMaxRay : min( - perspectiveDepthToViewZ( d, uNear, uFar ) / max( - dirV.z, 0.05 ), uMaxRay );

	vec3 c = scene;
	vec3 Nw = vec3( 0.0, 0.0, 1.0 );
	float spotMask = 0.0;
	float creaseK = 1.0; // the corner accent, applied after the liquids (which switch it off below their surface)

	// Direct light from the sun and the nearby lights, applied to what the
	// classic lightmaps already put on the surface.
	// alpha < 0 in the normal buffer marks a window onto another level: leave it as drawn
	if ( d < 0.99999 && texture2D( tNormal, uvd ).a > - 0.5 ) {
		vec3 P = viewPosAt( uvd );
		vec3 N;
		vec4 g = texture2D( tNormal, uvd );
		float here = - P.z;
		if ( here > 8.0 && abs( g.a - here ) < 0.025 * here + 1.0 ) {
			// the surface's own (normal-mapped) normal, written while it was drawn
			N = normalize( g.rgb * 2.0 - 1.0 );
			if ( dot( N, P ) > 0.0 ) N = - N;
		} else {
			// other geometry: the normal of the depth surface
			vec3 Pl = viewPosAt( uvd - vec2( uTexel.x, 0.0 ) );
			vec3 Pr = viewPosAt( uvd + vec2( uTexel.x, 0.0 ) );
			vec3 Pd = viewPosAt( uvd - vec2( 0.0, uTexel.y ) );
			vec3 Pu = viewPosAt( uvd + vec2( 0.0, uTexel.y ) );
			vec3 dx = abs( Pr.z - P.z ) < abs( P.z - Pl.z ) ? Pr - P : P - Pl;
			vec3 dy = abs( Pu.z - P.z ) < abs( P.z - Pd.z ) ? Pu - P : P - Pd;
			N = normalize( cross( dx, dy ) );
			if ( dot( N, P ) > 0.0 ) N = - N;
		}
		Nw = normalize( mat3( uViewInv ) * N );

		// the plane of the surface from the depth buffer, for the corner accent
		vec3 dxG = viewPosAt( uvd + vec2( uTexel.x, 0.0 ) ) - P;
		vec3 dxL = P - viewPosAt( uvd - vec2( uTexel.x, 0.0 ) );
		vec3 dyG = viewPosAt( uvd + vec2( 0.0, uTexel.y ) ) - P;
		vec3 dyL = P - viewPosAt( uvd - vec2( 0.0, uTexel.y ) );
		dxG = abs( dxG.z ) < abs( dxL.z ) ? dxG : dxL;
		dyG = abs( dyG.z ) < abs( dyL.z ) ? dyG : dyL;

		// The relief is lit by a softened normal: the surface's own plane with only a
		// part of the bumps.  Lit by the full normal, one side of every bump is hit
		// full on (a white speckle) and the other side not at all (harsh contrast).
		vec3 Ng = normalize( cross( dxG, dyG ) );
		if ( dot( Ng, P ) > 0.0 ) Ng = - Ng;
		vec3 Nl = normalize( mix( Ng, N, uBumpLight ) );

		vec3 relit = vec3( 0.0 );
		vec3 flashAdd = vec3( 0.0 ); // light from a muzzle flash, which shows even on a dark surface

		if ( uSunOn > 0.5 ) {
			float ndl = max( dot( Nl, uSunDirV ), 0.0 );
			if ( ndl > 0.0 ) {
				vec3 pw = ( uViewInv * vec4( P + Ng * 1.5, 1.0 ) ).xyz;
				relit += uSunSurfaceCol * uSunSurface * ndl * sunLitSoft( pw ) * skyCookieRGB( pw );
			}
		}

		float jit = noise( gl_FragCoord.xy );
		for ( int i = 0; i < ${MAX_VOLUME_LIGHTS}; i ++ ) {
			if ( i >= uCount ) break;
			vec3 L = uLightPos[ i ].xyz - P;
			float dist = length( L );
			float range = uLightCol[ i ].w;
			if ( dist > range ) continue;
			float ndl = max( dot( Nl, L / dist ), 0.0 );
			if ( ndl <= 0.0 ) continue;

			float fall = 1.0 / ( 1.0 + dist * dist / ( 60.0 * 60.0 ) );
			fall *= 1.0 - smoothstep( 0.55 * range, range, dist );

			float vis = 0.0;
			for ( int k = 0; k < RELIGHT_STEPS; k ++ ) {
				float s = ( float( k ) + jit ) / float( RELIGHT_STEPS );
				vec3 Q = mix( P + Ng * 2.0, uLightPos[ i ].xyz, s * 0.95 );
				if ( Q.z > - uNear ) { vis += 1.0; continue; }
				vec4 cq = uProj * vec4( Q, 1.0 );
				vec2 uv = cq.xy / cq.w * 0.5 + 0.5;
				if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) { vis += 1.0; continue; }
				vis += sceneDist( uv ) < ( - Q.z ) - ( 5.0 + 0.012 * ( - Q.z ) ) ? 0.0 : 1.0;
			}
			vis /= float( RELIGHT_STEPS );

			vec3 lightHere = uLightCol[ i ].rgb * uLightSurface * ndl * fall * vis * vis;
			relit += lightHere;
			flashAdd += lightHere * uLightAdd[ i ];
		}

		// a source lights a surface whatever its baked light was; the small floor
		// stands for the surface's own colour, which is not known here
		// the flashlight
		vec3 spot = vec3( 0.0 );
		if ( uSpotOn > 0.5 ) {
			vec3 Ls = uSpotPos - P;
			float sd = length( Ls );
			vec3 Sn = Ls / max( sd, 1.0 );
			float sndl = max( dot( Nl, Sn ), 0.0 );
			float cosS = dot( - Sn, uSpotDir );
			// a defined edge, and a brighter core
			float cone = smoothstep( uSpotCone.x, uSpotCone.y, cosS ) * mix( 0.62, 1.0, smoothstep( uSpotCone.y, 0.995, cosS ) );
			if ( sndl > 0.0 && cone > 0.0 && sd < 1500.0 ) {
				float fall = 1.0 / ( 1.0 + sd * sd / ( 280.0 * 280.0 ) );
				fall *= 1.0 - smoothstep( 800.0, 1500.0, sd );
				float svis = 0.0;
				for ( int k = 0; k < RELIGHT_STEPS; k ++ ) {
					float s = ( float( k ) + jit ) / float( RELIGHT_STEPS );
					vec3 Q = mix( P + Ng * 2.0, uSpotPos, s * 0.95 );
					if ( Q.z > - uNear ) { svis += 1.0; continue; }
					vec4 cq = uProj * vec4( Q, 1.0 );
					vec2 uv = cq.xy / cq.w * 0.5 + 0.5;
					if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) { svis += 1.0; continue; }
					svis += sceneDist( uv ) < ( - Q.z ) - ( 5.0 + 0.012 * ( - Q.z ) ) ? 0.0 : 1.0;
				}
				svis /= float( RELIGHT_STEPS );
				spot = uSpotCol * sndl * fall * cone * svis * svis;
				spotMask = clamp( sndl * fall * cone * svis * svis * 1.6, 0.0, 1.0 );
			}
		}

		// (tinted by the surface's own colour, so stone stays stone and does not
		// wash out to grey where a light falls on it)
		vec3 tint = scene / max( max( scene.r, max( scene.g, scene.b ) ), 0.01 );
		// the beam adds less to what is already bright (an enemy in it would wash out: a flat lift on a pale surface
		// is grey), and its flat tint only lifts the darks
		float sl = dot( scene, vec3( 0.2126, 0.7152, 0.0722 ) );
		float spotGain = 1.15 * ( 1.0 + 4.0 * ( 1.0 - smoothstep( 0.0, 0.06, sl ) ) ) * ( 1.0 - 0.55 * smoothstep( 0.2, 0.8, sl ) );
		float spotLift = 0.12 * ( 1.0 - smoothstep( 0.15, 0.6, sl ) );
		// a surface the baked light never reached is black, and black has no colour to tint the beam with: it
		// gets a plain warm one, so the flashlight always has something to light
		float darkness = 1.0 - smoothstep( 0.0, 0.04, sl );
		vec3 beamTint = mix( vec3( 0.3 ), tint, smoothstep( 0.0, 0.03, max( scene.r, max( scene.g, scene.b ) ) ) );
		// Bounce light.  What a surface sees of its neighbours on the screen lights it a little: each of a handful of
		// points round it (out to about 150 units) gives the light it is sending this way, if the two face each
		// other, less with distance; and the receiver's own colour tints it (a red wall casts red on the floor, and
		// a lit patch of floor lights the wall above it).  This is what stops the places no lamp reaches from being
		// flat black, and why a room round a bright light glows with its colour.
		vec3 bounce = vec3( 0.0 );
		if ( uBounce > 0.0 ) {
			const int BOUNCE_SAMPLES = 10;
			float rad = clamp( 150.0 * uProj[ 0 ][ 0 ] * 0.5 / max( here, 8.0 ), 0.01, 0.22 );
			float aspect = uTexel.y / uTexel.x;
			float turn = jit * 6.2831;
			for ( int i = 0; i < BOUNCE_SAMPLES; i ++ ) {
				float fi = float( i ) + 0.5;
				float a = fi * 2.39996 + turn;
				float rr = sqrt( fi / float( BOUNCE_SAMPLES ) );
				vec2 uvs = uvd + vec2( cos( a ), sin( a ) * aspect ) * rr * rad;
				if ( uvs.x < 0.0 || uvs.x > 1.0 || uvs.y < 0.0 || uvs.y > 1.0 ) continue;
				if ( texture2D( tDepth, uvs ).x >= 0.99999 ) continue;
				vec4 gs = texture2D( tNormal, uvs );
				if ( gs.a < - 0.5 ) continue;
				vec3 Ps = viewPosAt( uvs );
				vec3 v = Ps - P;
				float dist = length( v );
				if ( dist < 3.0 || dist > 260.0 ) continue;
				vec3 dir = v / dist;
				float cosR = max( dot( Ng, dir ), 0.0 );
				vec3 Ns = gs.a > 0.0 ? normalize( gs.rgb * 2.0 - 1.0 ) : - dir;
				if ( dot( Ns, Ps ) > 0.0 ) Ns = - Ns;
				float cosS = max( dot( Ns, - dir ), 0.0 );
				float w = cosR * cosS / ( 1.0 + dist * dist / ( 80.0 * 80.0 ) );
				// what that point is sending: its lit colour, and the flashlight's light on it (the beam is added after
				// this picture, so it is estimated here, without shadows)
				float beamS = 0.0;
				if ( uSpotOn > 0.5 ) {
					vec3 Ls = uSpotPos - Ps;
					float sd = length( Ls );
					vec3 sn = Ls / max( sd, 1.0 );
					float coneS = smoothstep( uSpotCone.x, uSpotCone.y, dot( - sn, uSpotDir ) );
					beamS = coneS * max( dot( Ns, sn ), 0.0 ) / ( 1.0 + sd * sd / ( 280.0 * 280.0 ) ) * ( 1.0 - smoothstep( 800.0, 1500.0, sd ) );
				}
				bounce += min( texture2D( tScene, uvs ).rgb * ( 1.0 + 5.0 * beamS ), vec3( 6.0 ) ) * w;
			}
			bounce *= uBounce * 14.0 / float( BOUNCE_SAMPLES );
		}
		vec3 receiver = mix( vec3( 0.6 ), tint, 0.7 ) * 0.55;
		c = scene * ( 1.0 + relit ) + bounce * receiver + relit * uLightFloor * tint + spot * ( scene * spotGain + ( spotLift + 0.0 * darkness ) * beamTint ) + flashAdd * ( 0.3 * tint + scene * 0.6 );

		// what the beam hits is not just brighter, it is richer: colour and contrast rise with it
		if ( spotMask > 0.0 ) {
			float ls = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
			c = mix( vec3( ls ), c, 1.0 + 0.2 * spotMask );
			c *= 1.0 + 0.08 * spotMask;
		}

		// corners and edges
		if ( uEdge > 0.0 ) creaseK = creaseAccent( P, normalize( cross( dxG, dyG ) ) * ( dot( normalize( cross( dxG, dyG ) ), P ) > 0.0 ? - 1.0 : 1.0 ) );
	}

	// Liquids: water and slime take light out of any ray that travels through
	// them (so shallows stay clear and depths go dark and blue-green), and the
	// surfaces beneath them get caustics.
	if ( uWaterCount > 0 ) {
		vec3 camW = uViewInv[ 3 ].xyz;
		vec3 dirW = mat3( uViewInv ) * dirV;
		vec3 inv = 1.0 / ( dirW + vec3( 1e-6 ) );
		vec3 hitW = camW + dirW * D;

		for ( int i = 0; i < ${MAX_LIQUID_REGIONS}; i ++ ) {
			if ( i >= uWaterCount ) break;

			vec4 lo = uWaterMin[ i ];
			vec4 hi = uWaterMax[ i ];
			float top = lo.z;
			bool slime = lo.w > 0.5;
			vec3 bmin = vec3( lo.xy, top - 900.0 );
			vec3 bmax = vec3( hi.xy, top );

			vec3 t1 = ( bmin - camW ) * inv;
			vec3 t2 = ( bmax - camW ) * inv;
			vec3 tn = min( t1, t2 );
			vec3 tf = max( t1, t2 );
			float tEnter = max( max( tn.x, tn.y ), max( tn.z, 0.0 ) );
			float tExit = min( min( tf.x, tf.y ), min( tf.z, D ) );

			if ( tExit > tEnter ) {
				vec3 sigma = slime ? vec3( 0.0065, 0.0016, 0.0058 ) : vec3( 0.0030, 0.0010, 0.0007 );
				vec3 tint = slime ? vec3( 0.010, 0.040, 0.006 ) : vec3( 0.005, 0.030, 0.045 );
				vec3 T = exp( - sigma * ( tExit - tEnter ) );
				c = c * T + tint * ( 1.0 - T ) * 0.3;
			}

			// below the surface of a pool: no outlines (the pool's walls stand on its edge, so a margin)
			if ( d < 0.99999
				&& hitW.x > bmin.x - 24.0 && hitW.x < bmax.x + 24.0 && hitW.y > bmin.y - 24.0 && hitW.y < bmax.y + 24.0
				&& hitW.z > bmin.z && hitW.z < top + 2.0 ) creaseK = 1.0;

			if ( d < 0.99999
				&& hitW.x > bmin.x && hitW.x < bmax.x && hitW.y > bmin.y && hitW.y < bmax.y
				&& hitW.z > bmin.z && hitW.z < top + 2.0 ) {
				float depth = top - hitW.z;
				vec2 plane = abs( Nw.z ) > 0.5 ? hitW.xy : ( abs( Nw.x ) > abs( Nw.y ) ? hitW.yz : hitW.xz );
				float cs = caustic( plane * 0.0045, uTime * 0.6 );
				float facing = 0.06 + 0.94 * smoothstep( 0.3, 0.9, Nw.z ); // on floors, not the walls
				float fade = exp( - depth / 420.0 ) * smoothstep( 6.0, 40.0, depth );
				vec3 glow = slime ? vec3( 0.55, 1.0, 0.5 ) : vec3( 0.75, 1.0, 1.15 );
				c += max( scene, vec3( 0.05 ) ) * glow * cs * uCaustic * facing * fade;
			}
		}
	}

	c *= creaseK;

	// ambient haze
	float T = exp( - uHaze * D );
	c = c * T + uHazeColor * ( 1.0 - T );

	c += texture2D( tVolume, uvd ).rgb * uVolume;
	c += texture2D( tBloom, uvd ).rgb * uBloom;

	c = max( c * uExposure, 0.0 );

	// grade: punchier mid-tones and highlights (darks are left alone), richer colour
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c *= 1.0 + uContrast * smoothstep( 0.04, 0.5, l );
	l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = mix( vec3( l ), c, uSaturation );

	// atmosphere: deep blacks (the darks are pressed down), colour that is richer where it is
	// weak (a vibrance on top of the saturation), cold shadows and warm lights
	l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c *= mix( 0.85, 1.0, smoothstep( 0.0, 0.2, l ) );
	float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) );
	float chroma = ( mx - mn ) / max( mx, 1e-4 );
	c = mix( vec3( l ), c, 1.0 + uVibrance * ( 1.0 - chroma ) );
	c *= mix( vec3( 0.94, 0.97, 1.05 ), vec3( 1.03, 1.0, 0.95 ), smoothstep( 0.02, 0.40, l ) );

	c = shoulder( c );

	// the drops: a little darker at the edge where they bend the light, a bright
	// glint, and blood-red where it is blood
	if ( dropMask > 0.0 ) {
		// water is clear: only a small neutral glint on the edge, no tint, no darkening
		c += vec3( 1.0 ) * dropGlint * 0.35 * ( 1.0 - uDropBlood );
		vec3 red = c * vec3( 0.75, 0.06, 0.05 ) + vec3( 0.05, 0.0, 0.0 ) * dropMask;
		c = mix( c, red, uDropBlood * clamp( dropMask * 1.4, 0.0, 1.0 ) );
	}

	gl_FragColor = vec4( c, 1.0 );
	#include <colorspace_fragment>

	// brightness, then contrast about a mid tone, on the displayed values
	vec3 shown = gl_FragColor.rgb * uBright;
	shown = max( uContrastPivot + ( shown - uContrastPivot ) * uContrastGain, 0.0 );
	gl_FragColor = vec4( shown, 1.0 );
}`;

//============================================================================
// Pipeline
//============================================================================

const BLOOM_LEVELS = 5;
const SUN_SHADOW_SIZE = 2048;
const SUN_SHADOW_EXTENT = 1700; // half-size of the shadowed area around the camera, in units
const SUN_SHADOW_DEPTH = 3400;

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

	// uniforms shared by the volumetric and composite passes
	const shared = {
		tDepth: { value: null },
		tSunShadow: { value: null },
		uProj: { value: new THREE.Matrix4() },
		uProjInv: { value: new THREE.Matrix4() },
		uViewInv: { value: new THREE.Matrix4() },
		uSunVP: { value: new THREE.Matrix4() },
		uNear: { value: 4 }, uFar: { value: 4096 },
		uCount: { value: 0 },
		uSpotOn: { value: 0 },
		uBounce: { value: 1 },
		uSpotPos: { value: new THREE.Vector3() },
		uSpotDir: { value: new THREE.Vector3( 0, 0, - 1 ) },
		uSpotCol: { value: new THREE.Vector3( 1, 0.985, 0.96 ).multiplyScalar( SPOT_POWER ) },
		uSpotCone: { value: new THREE.Vector2( FLASHLIGHT_OUTER, FLASHLIGHT_INNER ) },
		uLightPos: { value: lightPos },
		uLightCol: { value: lightCol },
		uSunDirV: { value: new THREE.Vector3() },
		uSunDirW: { value: new THREE.Vector3() },
		tCookie: { value: null },
		tCookieCloud: { value: null },
		uCookieCloud: { value: 0 },
		uCookieMean: { value: cookieMean },
		uCookieNorm: { value: cookieNorm },
		uCookieDepth: cookieDepth,
		uCookie: { value: 0 },
		uCookieTime: { value: 0 },
		uSunCol: { value: new THREE.Vector3( ...SUN_COLOR ) },
		uSunOn: { value: 0 },
		uShadowTexel: { value: 0.5 / SUN_SHADOW_SIZE },
		uMaxRay: { value: MAX_RAY }
	};

	const sunCamera = new THREE.OrthographicCamera( - SUN_SHADOW_EXTENT, SUN_SHADOW_EXTENT,
		SUN_SHADOW_EXTENT, - SUN_SHADOW_EXTENT, 1, SUN_SHADOW_DEPTH * 2 );

	return {
		width: 0, height: 0,
		scene, mesh, shared,
		camera: new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 ),
		hdr: null, volume: null, down: [], up: [],
		sunCamera,
		sunTarget: new THREE.WebGLRenderTarget( SUN_SHADOW_SIZE, SUN_SHADOW_SIZE, {
			depthBuffer: true,
			depthTexture: new THREE.DepthTexture( SUN_SHADOW_SIZE, SUN_SHADOW_SIZE ),
			generateMipmaps: false,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter
		} ),
		sunOverride: new THREE.MeshBasicMaterial( { colorWrite: false, side: THREE.DoubleSide } ),
		volumeMaterial: makeMaterial( VOLUME_FRAGMENT, Object.assign( {
			uSunScatter: { value: SUN_SCATTER },
			uOpenFog: { value: 0.05 },
			uShaftFog: { value: 1.3 },
			uShadowSpread: { value: 100 / ( SUN_SHADOW_EXTENT * 2 ) },
			uScatter: { value: SCATTER }
		}, shared ) ),
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
		compositeMaterial: makeMaterial( COMPOSITE_FRAGMENT, Object.assign( {
			tScene: { value: null }, tNormal: { value: null }, tVolume: { value: null }, tBloom: { value: null },
			uTexel: { value: new THREE.Vector2() },
			uExposure: { value: 1 }, uBloom: { value: 0.6 }, uVolume: { value: 1 },
			uHaze: { value: HAZE_DENSITY },
			uHazeColor: { value: new THREE.Vector3( 0.0015, 0.002, 0.004 ) },
			uSunSurface: { value: SUN_SURFACE },
			uSunSurfaceCol: { value: new THREE.Vector3( ...SUN_SURFACE_COLOR ) },
			uLightSurface: { value: LIGHT_SURFACE },
			uLightFloor: { value: LIGHT_FLOOR },
			uLightAdd: { value: new Array( MAX_VOLUME_LIGHTS ).fill( 0 ) },
			uEdge: { value: 1 },
			uDropDensity: { value: 0 },
			uDropBlood: { value: 0 },
			uBumpLight: { value: BUMP_LIGHT },
			uTeleStretch: { value: 0 },
			uTeleChroma: { value: 0 },
			uDropAge: { value: 0 },
			uSaturation: { value: SATURATION },
			uVibrance: { value: VIBRANCE },
			uContrast: { value: CONTRAST },
			uBright: { value: 0.6 },
			uContrastGain: { value: 1.4 },
			uContrastPivot: { value: 0.12 },
			uTime: { value: 0 },
			uCaustic: { value: CAUSTIC },
			uWaterCount: { value: 0 },
			uWaterMin: { value: Array.from( { length: MAX_LIQUID_REGIONS }, () => new THREE.Vector4() ) },
			uWaterMax: { value: Array.from( { length: MAX_LIQUID_REGIONS }, () => new THREE.Vector4() ) }
		}, shared ) )
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

// Multisampling is a large part of the cost of a picture: it is given up in steps as the
// picture gets smaller (the smaller picture is scaled up smoothly anyway)
function samplesFor( scale ) {

	return scale >= 0.85 ? 4 : scale >= 0.65 ? 2 : 0;

}

function ensureTargets( width, height ) {

	const samples = samplesFor( dyn.scale );
	if ( gpu.hdr !== null && gpu.width === width && gpu.height === height && gpu.samples === samples ) return;

	disposeTargets();
	gpu.width = width;
	gpu.height = height;
	gpu.samples = samples;

	const depth = new THREE.DepthTexture( width, height );
	gpu.hdr = makeRT( width, height, { depthBuffer: true, depthTexture: depth, samples, count: 2 } );
	gpu.volume = makeRT( Math.ceil( width * 0.75 ), Math.ceil( height * 0.75 ) );

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

	// Newer Game is on; its lighting pipeline can be switched off on its own
	const newer = enabled && r_hdr.value !== 0;
	const active = newer && r_newer_lighting.value !== 0 && R_PostSupported( renderer ) && width > 8 && height > 8;
	setGlowActive( active );
	R_AnimSetNewer( newer );
	R_AnimSetLighting( active );
	lightCurve.value = active ? Math.max( 1, r_newdark.value ) : 1;
	if ( active ) pulseLava( performance.now() / 1000 );
	skySeen = false;

	if ( active === false ) return false;

	if ( gpu === null ) gpu = createPipeline();
	dynResUpdate( performance.now() / 1000 );
	ensureTargets( Math.max( 16, Math.round( width * dyn.scale / 2 ) * 2 ), Math.max( 16, Math.round( height * dyn.scale / 2 ) * 2 ) );
	return true;

}

export function R_PostBind( renderer ) {

	renderer.setRenderTarget( gpu.hdr );

}

const _sunRight = new THREE.Vector3();
const _sunUp = new THREE.Vector3();
const _sunCenter = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _clearColor = new THREE.Color();

// Depth of the world as the sun sees it.  Sky is not on the shadow layer, so
// skylights and windows let the light through.
function renderSunShadow( renderer, scene, camera ) {

	const p = gpu;
	const cam = p.sunCamera;

	_sunDir.set( sunDirection[ 0 ], sunDirection[ 1 ], sunDirection[ 2 ] ).normalize();

	const e = camera.matrixWorld.elements;
	_sunCenter.set( e[ 12 ], e[ 13 ], e[ 14 ] );

	cam.up.set( 0, 0, 1 );
	if ( Math.abs( _sunDir.z ) > 0.95 ) cam.up.set( 1, 0, 0 );

	// snap the centre to whole shadow texels so the shadows don't crawl
	cam.position.copy( _sunCenter ).addScaledVector( _sunDir, SUN_SHADOW_DEPTH );
	cam.lookAt( _sunCenter );
	cam.updateMatrixWorld( true );
	const m = cam.matrixWorld.elements;
	_sunRight.set( m[ 0 ], m[ 1 ], m[ 2 ] );
	_sunUp.set( m[ 4 ], m[ 5 ], m[ 6 ] );
	const texel = ( SUN_SHADOW_EXTENT * 2 ) / SUN_SHADOW_SIZE;
	const cr = _sunCenter.dot( _sunRight ), cu = _sunCenter.dot( _sunUp );
	_sunCenter.addScaledVector( _sunRight, - ( cr - Math.round( cr / texel ) * texel ) );
	_sunCenter.addScaledVector( _sunUp, - ( cu - Math.round( cu / texel ) * texel ) );
	cam.position.copy( _sunCenter ).addScaledVector( _sunDir, SUN_SHADOW_DEPTH );
	cam.lookAt( _sunCenter );
	cam.updateMatrixWorld( true );
	cam.matrixWorldInverse.copy( cam.matrixWorld ).invert();

	cam.layers.set( SUN_SHADOW_LAYER );
	if ( occluder !== null && occluder.parent !== scene ) scene.add( occluder );

	renderer.getClearColor( _clearColor );
	const clearAlpha = renderer.getClearAlpha();
	const override = scene.overrideMaterial;

	scene.overrideMaterial = p.sunOverride;
	renderer.setRenderTarget( p.sunTarget );
	renderer.setClearColor( 0xffffff, 1 );
	renderer.clear( true, true, false );
	renderer.render( scene, cam );

	scene.overrideMaterial = override;
	renderer.setClearColor( _clearColor, clearAlpha );

	p.shared.uSunVP.value.multiplyMatrices( cam.projectionMatrix, cam.matrixWorldInverse );
	p.shared.tSunShadow.value = p.sunTarget.depthTexture;

}

/*
================
R_PostFinish

Turn the HDR image into the frame that is shown: sun shadows, volumetrics,
direct lighting, bloom, grade and tone map.  viewport is the on-screen
rectangle in logical pixels ( lx, ly, lw, lh ).
================
*/
export function R_PostFinish( renderer, scene, camera, viewport, visframe, styles, dlights, time, exposure, hasSkyView ) {

	const p = gpu;
	const hdr = p.hdr;
	const sh = p.shared;

	selectLights( camera.matrixWorldInverse, visframe, styles, dlights, time );

	sh.tDepth.value = hdr.depthTexture;
	sh.uProj.value.copy( camera.projectionMatrix );
	sh.uProjInv.value.copy( camera.projectionMatrixInverse );
	sh.uViewInv.value.copy( camera.matrixWorld );
	sh.uNear.value = camera.near;
	sh.uFar.value = camera.far;
	sh.uCount.value = selectedCount;

	// the flashlight, in view space
	const beam = R_FlashlightBeam();
	sh.uSpotOn.value = beam.on ? 1 : 0;
	if ( beam.on ) {

		const v = camera.matrixWorldInverse.elements;
		const bp = beam.pos, bd = beam.dir;
		sh.uSpotPos.value.set(
			v[ 0 ] * bp[ 0 ] + v[ 4 ] * bp[ 1 ] + v[ 8 ] * bp[ 2 ] + v[ 12 ],
			v[ 1 ] * bp[ 0 ] + v[ 5 ] * bp[ 1 ] + v[ 9 ] * bp[ 2 ] + v[ 13 ],
			v[ 2 ] * bp[ 0 ] + v[ 6 ] * bp[ 1 ] + v[ 10 ] * bp[ 2 ] + v[ 14 ] );
		sh.uSpotDir.value.set(
			v[ 0 ] * bd[ 0 ] + v[ 4 ] * bd[ 1 ] + v[ 8 ] * bd[ 2 ],
			v[ 1 ] * bd[ 0 ] + v[ 5 ] * bd[ 1 ] + v[ 9 ] * bd[ 2 ],
			v[ 2 ] * bd[ 0 ] + v[ 6 ] * bd[ 1 ] + v[ 10 ] * bd[ 2 ] ).normalize();

	}
	for ( let i = 0; i < selectedCount; i ++ ) {

		const s = _selected[ i ];
		sh.uLightPos.value[ i ].set( s.pos[ 0 ], s.pos[ 1 ], s.pos[ 2 ], s.radius );
		sh.uLightCol.value[ i ].set( s.color[ 0 ], s.color[ 1 ], s.color[ 2 ], s.range );
		p.compositeMaterial.uniforms.uLightAdd.value[ i ] = s.add || 0;

	}

	// the sun, when the map has sky to light it; how strong, what colour and what
	// pattern all come from the map's sky
	const sunOn = hasSkyView === true;
	sh.uSunOn.value = sunOn ? 1 : 0;

	const bright = R_SkyBrightness( skyInfo.luma );
	const sunGain = 0.5 + 0.9 * bright; // a dark sky still gives a little
	const tint = skyInfo.color;
	sh.uSunCol.value.set(
		SUN_COLOR[ 0 ] * sunGain * ( 0.55 + 0.45 * tint[ 0 ] ),
		SUN_COLOR[ 1 ] * sunGain * ( 0.55 + 0.45 * tint[ 1 ] ),
		SUN_COLOR[ 2 ] * sunGain * ( 0.55 + 0.45 * tint[ 2 ] ) );
	p.compositeMaterial.uniforms.uSunSurfaceCol.value.set(
		SUN_SURFACE_COLOR[ 0 ] * ( 0.6 + 0.4 * tint[ 0 ] ),
		SUN_SURFACE_COLOR[ 1 ] * ( 0.6 + 0.4 * tint[ 1 ] ),
		SUN_SURFACE_COLOR[ 2 ] * ( 0.6 + 0.4 * tint[ 2 ] ) );
	p.compositeMaterial.uniforms.uSunSurface.value = SUN_SURFACE * ( 0.5 + 0.8 * bright );
	p.volumeMaterial.uniforms.uSunScatter.value = SUN_SCATTER * ( 1.4 + 1.0 * bright );
	// a bright, clear sky leaves open air nearly free of haze; a dark one hazier
	p.volumeMaterial.uniforms.uOpenFog.value = 0.035 - 0.03 * bright;
	// a bright, clear sky is crisp; a dark one a little hazier
	p.compositeMaterial.uniforms.uHaze.value = HAZE_DENSITY * ( 1.5 - 1.05 * bright );
	sh.uBounce.value = Math.max( 0, r_bounce.value );
	sh.tCookie.value = skyCookie;
	sh.tCookieCloud.value = skyCookieCloud;
	sh.uCookieCloud.value = skyCookieCloud !== null ? 1 : 0;
	sh.uCookie.value = skyCookie !== null ? 1 : 0;
	sh.uCookieTime.value = time;
	if ( sunOn ) {

		const e = camera.matrixWorldInverse.elements;
		const sd = sunDirection;
		sh.uSunDirV.value.set(
			e[ 0 ] * sd[ 0 ] + e[ 4 ] * sd[ 1 ] + e[ 8 ] * sd[ 2 ],
			e[ 1 ] * sd[ 0 ] + e[ 5 ] * sd[ 1 ] + e[ 9 ] * sd[ 2 ],
			e[ 2 ] * sd[ 0 ] + e[ 6 ] * sd[ 1 ] + e[ 10 ] * sd[ 2 ] ).normalize();
		sh.uSunDirW.value.set( sd[ 0 ], sd[ 1 ], sd[ 2 ] ).normalize();
		renderSunShadow( renderer, scene, camera );
		R_PerfStage( 'sun shadow' );

	}

	// volumetric pass
	const volume = Math.max( 0, r_volumetric.value );
	if ( volume > 0 ) runPass( renderer, p.volumeMaterial, p.volume );
	R_PerfStage( 'light shafts' );

	// bloom
	const bloom = Math.max( 0, r_bloom.value );
	if ( bloom > 0 ) {

		const pm = p.prefilterMaterial.uniforms;
		pm.tScene.value = hdr.texture;
		pm.uTexel.value.set( 1 / hdr.width, 1 / hdr.height );
		pm.uExposure.value = exposure;
		pm.uThreshold.value = hasSkyView === true ? OUTDOOR_BLOOM_THRESHOLD : 1.1;
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

	// the pools nearest the camera
	const cw = camera.matrixWorld.elements;
	const ranked = [];
	for ( const r of liquidRegions ) {

		const dx = Math.max( r.min[ 0 ] - cw[ 12 ], 0, cw[ 12 ] - r.max[ 0 ] );
		const dy = Math.max( r.min[ 1 ] - cw[ 13 ], 0, cw[ 13 ] - r.max[ 1 ] );
		const dz = Math.max( r.z - 900 - cw[ 14 ], 0, cw[ 14 ] - r.z );
		const dist = Math.hypot( dx, dy, dz );
		if ( dist < 3200 ) ranked.push( { r, dist } );

	}

	ranked.sort( ( a, b ) => a.dist - b.dist );
	const waterCount = r_newer_water.value !== 0 ? Math.min( ranked.length, MAX_LIQUID_REGIONS ) : 0;
	cm.uWaterCount.value = waterCount;
	for ( let i = 0; i < waterCount; i ++ ) {

		const r = ranked[ i ].r;
		cm.uWaterMin.value[ i ].set( r.min[ 0 ], r.min[ 1 ], r.z, r.kind );
		cm.uWaterMax.value[ i ].set( r.max[ 0 ], r.max[ 1 ], r.z, 0 );

	}

	cm.uEdge.value = underwater ? 0 : Math.max( 0, r_newedges.value );
	const drops = R_ScreenDropsUpdate();
	cm.uDropDensity.value = underwater ? 0 : drops.density;
	cm.uDropBlood.value = drops.blood;
	const tele = R_TeleportFx( performance.now() / 1000 );
	cm.uTeleStretch.value = tele.stretch;
	cm.uTeleChroma.value = tele.chroma;
	cm.uDropAge.value = drops.age;
	cm.uTime.value = time;
	cm.uCaustic.value = r_newer_water.value !== 0 ? CAUSTIC * Math.max( 0, r_caustics.value ) : 0;
	cm.tScene.value = hdr.textures[ 0 ];
	cm.tNormal.value = hdr.textures[ 1 ];
	cm.tVolume.value = volume > 0 ? p.volume.texture : null;
	cm.tBloom.value = bloom > 0 ? p.bloomResult.texture : null;
	cm.uTexel.value.set( 1 / hdr.width, 1 / hdr.height );
	// brightness and contrast are applied to the picture as displayed (below), so
	// 0.6 is 40% darker and 1.4 is 40% more contrast as seen
	const newBright = Math.max( 0, r_newbright.value );
	cm.uExposure.value = exposure * HDR_EXPOSURE * ( hasSkyView === true ? OUTDOOR_EXPOSURE : 1 );
	cm.uBright.value = newBright;
	cm.uContrastGain.value = Math.max( 0, r_newcontrast.value );
	cm.uContrastPivot.value = newBright * 0.2; // deviations are taken from a typical scene brightness
	cm.uBloom.value = bloom * ( hasSkyView === true ? OUTDOOR_BLOOM : 1 );
	cm.uVolume.value = volume;

	R_PerfStage( 'bloom' );

	renderer.setRenderTarget( null );
	renderer.setViewport( viewport.lx, viewport.ly, viewport.lw, viewport.lh );
	gpu.mesh.material = p.compositeMaterial;
	renderer.render( p.scene, p.camera );
	R_PerfStage( 'final lighting pass' );

}

export function R_PostShutdown() {

	if ( gpu === null ) return;
	disposeTargets();
	gpu.sunTarget.dispose();
	gpu.sunTarget.depthTexture.dispose();
	gpu = null;

}
