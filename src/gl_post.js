import { R_ExitFixturePairs, R_LightCone, POINT_CONE_GLSL } from './r_fixturelights.js';
import { R_ClearPowerupFireTarget } from './r_powerupfire.js';
import { R_BestiaryPortraitLight } from './r_bestiary.js';
import { R_ArchSurfaceHidden } from './r_archframe.js';
import { R_PowerupLights, R_PowerupPulse, R_DrawPowerupFire, R_PowerupShroudFrame, POWERUP_SHROUD_COMPOSITE_GLSL, POWERUP_COOKIE_GLSL } from './r_powerups.js';
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
// It is a rasterised approximation (no path tracing): bounced light and point-light
// occlusion only know about what is on screen. Costly composition follows the
// scene's dynamic resolution; only its inexpensive presentation fills the display.

import * as THREE from 'three';
import { cl } from './client.js';
import { PowerVisionMode } from './powervision_state.js';
import { R_PowerVisionRender, R_PowerVisionReset } from './r_powervision.js';
import { VISION_UV_PACK_GLSL } from './vision_coordinates.js';
import { R_QuadVisionActive, R_QuadVisionRender, R_QuadVisionReset } from './r_quadvision.js';
import { R_IntroLoadingHolding } from './r_demoloading.js';
import { cvar_t } from './cvar.js';
import { R_ParseEntityLump } from './gl_portal.js';
import { Mod_PointInLeaf, Mod_LeafPVS, solidskytexture, alphaskytexture } from './gl_model.js';
import { R_NormalMapFor } from './gl_normals.js';
import {R_NormalPrepare,R_NormalPreparationNeeded} from './normal_prepare.js';
import { R_PatchRockShader, ROCK_PARALLAX_GLSL, ROCK_NORMAL_GLSL } from './r_rockshader.js';
import { rockUniforms } from './r_rockfield.js';
import { GL_SetForceLinear } from './glquake.js';
import { R_AliasReceiverPass } from './r_newerskins.js';
import { R_ActiveWeaponSurface } from './r_weapon_surface.js';
import { R_ScreenDropsUpdate } from './r_screendrops.js';
import { R_TeleportFx } from './r_teleportfx.js';
import { R_PerfStage, R_PerfSetScale } from './r_perf.js';
import { R_FlashlightBeam, FLASHLIGHT_OUTER, FLASHLIGHT_INNER } from './r_flashlight.js';
import { R_WaterProbeUpdate, R_WaterProbeFor, R_WaterProbes, R_WaterProbeReadiness, WATER_PROBE_LIFT } from './r_waterprobe.js';
import { R_AnimSetNewer, R_AnimSetLighting, R_NewerGame, r_newer_lighting, r_newer_normals, r_newer_water, r_newer_textures, r_newer_shadows } from './r_anim.js';
import { R_DemonSurfaceData } from './r_demonrelief.js';
import { R_DemonBakePrepare, R_DemonBakeSurface } from './r_demonbakes.js';
import { PointShadowAtlas, POINT_SHADOW_GLSL, POINT_SHADOW_SLOTS, SPOT_WORLD_SHADOW_GLSL, NEAR_SUN_SHADOW_GLSL } from './r_pointshadows.js';
import { r_heightshadows, heightShadowUniforms, R_HeightShadowFrame, R_HeightShadowScope, HEIGHT_SHADOW_GLSL, HEIGHT_MASK_DECODE_GLSL } from './r_heightshadows.js';

// 0 = the classic lighting, 1 = the HDR pipeline ("Newer Game"); switchable at any time
export const r_hdr = new cvar_t( 'r_hdr', '0' );
export const r_pointshadows = new cvar_t( 'r_pointshadows', '1' ); // 0 compares the former screen-space approximation
export const r_bloom = new cvar_t( 'r_bloom', '0.9' );
export const r_heathaze = new cvar_t( 'r_heathaze', '0.6' ); // the shimmer over lava (0 off)
export const r_mist = new cvar_t( 'r_mist', '0.6' ); // Muddy surface haze and Toxic vapour (0 off)
// Water appearance: 0 map defaults, 1 clear, 2 tinted, 3 muddy, 4 toxic.
// Presentation only: contents, swimming and damage remain the map's contract.
export const r_water_look = new cvar_t( 'r_water_look', '0', true );
export const r_reflect = new cvar_t( 'r_reflect', '0.6' ); // how reflective water is (0 off)
export const r_reflect_screen = new cvar_t( 'r_reflect_screen', '1' ); // 1 = reflections take what is on the screen first, 0 = only the pool's probe
export const r_pillars = new cvar_t( 'r_pillars', '0.5' ); // how strong the light shafts are: 0 off, 1 the strongest (PILLAR_MAX), 0.5 the default
export const r_cloudspeed = new cvar_t( 'r_cloudspeed', '0.1875' ); // how fast the cloud pattern drifts over the ground, against the sky's own scrolling (1 = the same)
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
// 1 while the classic half of the title demo is drawn (see r_demosplit.js): no bounce floor, the original light curve, no relief
export const classicLook = { value: 0 };
// Unlit material colour is retained separately from baked lighting. A surface
// without a light source need not be lifted merely to recover its colour later.

// glquake.h flags (not imported: keeps this module out of the renderer's import cycle)
const SURF_DRAWSKY = 4;
const SURF_DRAWTURB = 0x10;

export const MAX_VOLUME_LIGHTS = POINT_SHADOW_SLOTS;

// Objects on this layer cast sun shadows (the world; sky deliberately is not)
export const SUN_SHADOW_LAYER = 3;

// Tunables
const EMISSIVE_BOOST = 4.5; // fullbright texels, in HDR
const LAVA_BOOST = 6.0; // bright lava texels remain above the bloom threshold even at the low pulse
const LAVA_PULSE = 0.14; // and it breathes, slowly
export const EMITTER_LIGHT_GAIN = 2.0; // physical emitters send twice the prior local radiance
const LIGHT_GAIN = 5.0; // radiance per unit of light power
const SCATTER = 0; // source-lit receivers remain; broad point-light fog is removed
const LIGHT_FLOOR = 0.12; // light on a surface the lightmap left dark
const LIGHT_SURFACE = 0.16; // direct light from point lights on surfaces
const SPOT_POWER = 1.6; // the flashlight, in the same units as the point lights
const MAX_RAY = 3600;
const SUN_COLOR = [ 3.4, 2.7, 1.9 ]; // warm white; tinted by the sky's own colour
const PILLAR_MAX = 0.35; // original sun scattering scale, before the shared shaft gain
const PILLAR_DEFAULT = 0.5;
const SHAFT_GAIN = 4; // all shaft types share one gain; .5 remains the slider's nominal setting
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
const CAUSTIC = 0.75; // stronger received-light floor patterns, still subdued in sediment
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
let glowActive = false; // advanced lighting and emissive boost
let postActive = false; // shared render targets, also needed by normals and liquids
let detailActive = false;
const lightingLook = { value: 0 };


// The eye is under water, slime or lava: no drops on the lens, no edge outlines
let underwater = false;

export function R_PostSetUnderwater( v ) {

	underwater = v === true;

}

export function R_PostActive() {

	return postActive && classicLook.value === 0;

}

// Newer liquids use the shared targets, independently of advanced lighting.
export function R_WaterActive() {

	return R_PostActive() && r_newer_water.value !== 0;

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
	material.userData.baseGlowBoost = boost;
	// Keep the native tint for the isolated classic demo material.
	if ( material.color && material.userData.classicGlowColor === undefined )
		material.userData.classicGlowColor = material.color.toArray();
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
	for ( const m of glowMaterials )
		applyGlow( m, m.userData.glowBoost );

}

function setDetailActive( active ) {

	if ( active === detailActive ) return;
	detailActive = active;
	for ( const m of detailMaterials ) applyDetail( m );

}

//============================================================================
// Surface detail: generated normal maps, parallax and the normal G-buffer
//============================================================================

const detailMaterials = new Set();

const PARALLAX_DEPTH = 0.02; // in texture tiles
const PARALLAX_LAYERS = 10;

// Parallax: shift the texture lookups along the view ray by the height stored in
// the normal map's alpha, so bricks stand proud of the mortar and shift as you
// move.  Runs only when the independently switched normal map is attached.
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

	float pAmt = ( 1.0 - uClassic ) * ${PARALLAX_DEPTH} * ( 1.0 - smoothstep( 260.0, 820.0, length( vViewPosition ) ) ) * mix( 0.3, 1.0, smoothstep( 30.0, 150.0, length( vViewPosition ) ) );
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

// Retain the surface normal/distance and unlit diffuse colour in the scene's
// normal and albedo attachments. The compositor lights the original material.
function patchDetailShader( shader ) {

	const thisMaterial = this;
	let f = shader.fragmentShader;

	f = 'layout(location = 1) out highp vec4 gNormal;\nlayout(location = 2) out highp vec4 gAlbedo;\nlayout(location = 3) out highp vec4 gHeightMask;\nuniform float uLmGamma;\nuniform float uLighting;\nuniform float uClassic;\n' + f;
	shader.uniforms.uLmGamma = lightCurve;
	shader.uniforms.uLighting = lightingLook;
	shader.uniforms.uClassic = classicLook;
	// Average one-texel pigment grain while retaining authored two-texel features.
	// Four texels forced mip 2 even close up, hiding most of a 4x replacement's
	// added detail. Keep the source, native UVs, normal/height sampling and Classic
	// untouched; larger screen footprints still select their natural mip levels.
	shader.uniforms.uPigmentMinFootprint = { get value() { return thisMaterial.userData.detailDiffuse?.userData.newerPicture ? 2 : 0; } };
	Object.assign( shader.uniforms, heightShadowUniforms );
	shader.uniforms.uHasHeightShadow = { get value() { return thisMaterial.normalMap?.userData.heightSource ? 1 : 0; } };

	// the baked light, curved: only what a source really lights stays bright
	f = f.replace( '#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace(
		'lightMapTexel.rgb * lightMapIntensity', 'pow( max( lightMapTexel.rgb, vec3( 0.0 ) ), vec3( mix( uLmGamma, 1.0, uClassic ) ) ) * lightMapIntensity' ) );

	// texture lookups follow the parallax-shifted coordinates
	const rock = this.userData.rockField === true;
	const reference = this.normalMap?.userData.referenceHeight;
	const relief = this.normalMap?.userData.surfaceRelief;
 const glass = this.normalMap?.userData.glassGloss;
	if ( reference ) {

		shader.uniforms.uCarveReference = this.userData.carveUniforms.uCarveReference;
		shader.uniforms.uCarveReferenceUV = this.userData.carveUniforms.uCarveReferenceUV;
		f = 'uniform sampler2D uCarveReference;\nuniform vec4 uCarveReferenceUV;\n' + f;

	}
	let parallax = rock ? ROCK_PARALLAX_GLSL + PARALLAX_GLSL.replace( /vMapUv/g, 'qrRockBaseUv' )
  .replace( 'vec2 pUv = qrRockBaseUv;', 'vec2 pUv = vMapUv + qrRockUvShift + qrRockBandOffset(qrRockQ);' )
  .replace( 'vec2 uv = qrRockBaseUv;', 'vec2 uv = pUv;' ) : PARALLAX_GLSL;
	if ( this.userData.realDisplacement ) parallax = '#ifdef USE_NORMALMAP\nvec2 pUv = vMapUv;\n#endif\n';
	if ( relief && ! reference ) {

		parallax = parallax.replace( `* ${PARALLAX_DEPTH} *`, `* ${relief.depth} *` )
			.replace( `const float LAYERS = ${PARALLAX_LAYERS}.0;`, `const float LAYERS = ${relief.layers}.0;` )
			.replace( `i < ${PARALLAX_LAYERS}`, `i < ${relief.layers}` );

	}
	if ( reference ) {

		// March the original wall depth plus a deeper virtual cut. Multiplying
		// the entire parallax amount would also displace the surrounding grain.
		const depth = uv => `( 1.0 - textureGrad( uCarveReference, fract( ${uv} ) * uCarveReferenceUV.xy + uCarveReferenceUV.zw, gx * uCarveReferenceUV.xy, gy * uCarveReferenceUV.xy ).a + 8.0 * max( 0.0, textureGrad( uCarveReference, fract( ${uv} ) * uCarveReferenceUV.xy + uCarveReferenceUV.zw, gx * uCarveReferenceUV.xy, gy * uCarveReferenceUV.xy ).a - textureGrad( normalMap, ${uv}, gx, gy ).a ) )`;
		parallax = parallax.replace( `const float LAYERS = ${PARALLAX_LAYERS}.0;`, 'const float LAYERS = 60.0;' )
			.replace( 'vec2 dUv = P / LAYERS;', 'vec2 dUv = P * 6.0 / LAYERS;' )
			.replace( 'float layer = 1.0 / LAYERS;', 'float layer = 6.0 / LAYERS;' )
			.replace( `i < ${PARALLAX_LAYERS}`, 'i < 60' )
			.replaceAll( '1.0 - textureGrad( normalMap, uv, gx, gy ).a', depth( 'uv' ) )
			.replaceAll( '1.0 - textureGrad( normalMap, prev, gx, gy ).a', depth( 'prev' ) );

	}
	let pigment = `
 #ifdef USE_MAP
 vec2 qrPigmentDx=dFdx(vMapUv),qrPigmentDy=dFdy(vMapUv);
 vec2 qrPigmentSize=vec2(textureSize(map,0));
 // Enforce both footprint axes: widening only the larger derivative leaves
 // black grain resolved along the minor axis on angled walls.
 vec2 qrPigmentFootprint=vec2(length(qrPigmentDx*qrPigmentSize),length(qrPigmentDy*qrPigmentSize));
 vec2 qrPigmentFilter=max(vec2(1.),uPigmentMinFootprint*(1.-uClassic)/max(qrPigmentFootprint,vec2(1e-6)));
 #endif
 `;
 if(glass) pigment=pigment.replace('uPigmentMinFootprint*(1.-uClassic)', 'mix(uPigmentMinFootprint,1.,step(.5,texture2D(uGlassGloss,pUv).g))*(1.-uClassic)');
 f = 'uniform float uPigmentMinFootprint;\n' + f;
 f = f.replace( '#include <map_fragment>', ( rock ? parallax + pigment.replace( /vMapUv/g, 'qrRockBaseUv' ) : glass ? parallax + pigment : pigment + parallax ) + THREE.ShaderChunk.map_fragment.replace( 'texture2D( map, vMapUv )', 'textureGrad( map, _pUv, qrPigmentDx*qrPigmentFilter.x, qrPigmentDy*qrPigmentFilter.y )' ) + '\nvec3 gDiffuse = diffuseColor.rgb;' );
	// the relief is softer the nearer it is: close up, a wall should be smooth but for small flaws; the full
	// depth is for looking at it from a little way off
	f = f.replace( '#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace( /vNormalMapUv/g, '_pUv' )
		.replace( 'mapN.xy *= normalScale;', this.userData.realDisplacement ? 'mapN.xy *= 0.0;' : glass ? 'mapN.xy *= normalScale * mix(mix(0.4,1.0,smoothstep(24.0,150.0,length(vViewPosition))),1.0,step(.08,texture2D(uGlassGloss,pUv).r)*step(.5,texture2D(uGlassGloss,pUv).g)) * (1.0-uClassic);' : 'mapN.xy *= normalScale * mix( 0.4, 1.0, smoothstep( 24.0, 150.0, length( vViewPosition ) ) ) * ( 1.0 - uClassic );' ) );
	if ( rock ) f = f.replace( '#include <emissivemap_fragment>', ROCK_NORMAL_GLSL + '\n#include <emissivemap_fragment>' );
	f = f.replace( '#include <emissivemap_fragment>', THREE.ShaderChunk.emissivemap_fragment.replace( /vEmissiveMapUv/g, '_pUv' ) );
	f = f.replace( '#include <opaque_fragment>', '#include <opaque_fragment>\n	gNormal = vec4( normalize( normal ) * 0.5 + 0.5, vViewPosition.z );\n\tgAlbedo = vec4( gDiffuse, 1.0 );' );

	// Glass tag occupies the byte-safe gap between carving and rock masks.
 // RGBA8 cannot carry tags above one. Only the supplied glossy pane mask is tagged.
 if(glass){
  shader.uniforms.uGlassGloss=this.userData.glassUniforms.uGlassGloss;
  f='uniform sampler2D uGlassGloss;\n'+f;
  f=f.replace('#include <opaque_fragment>', `
  // Keep dark leading out of the clear coat. Fullbright panes retain their
  // original pigment even when their base map was split to black.
  vec3 qrGlassPigment=textureGrad(map,_pUv,dFdx(vMapUv),dFdy(vMapUv)).rgb;
  #ifdef USE_EMISSIVEMAP
  qrGlassPigment+=textureGrad(emissiveMap,_pUv,dFdx(vMapUv),dFdy(vMapUv)).rgb;
  #endif
  float qrGlassPane=step(0.08,texture2D(uGlassGloss,_pUv).r)*step(0.5,texture2D(uGlassGloss,_pUv).g)*step(0.035,max(qrGlassPigment.r,max(qrGlassPigment.g,qrGlassPigment.b)))*(1.0-uClassic);
  #include <opaque_fragment>`);
  f=f.replace('vec4( gDiffuse, 1.0 )','vec4( gDiffuse, mix(1.0,0.5,qrGlassPane) )');
 }
 // without a normal map there is no parallax; keep the names valid
	f = f.replace( /_pUv/g, 'DETAIL_UV' );
	f = '#ifdef USE_NORMALMAP\n#define DETAIL_UV pUv\n#else\n#define DETAIL_UV vMapUv\n#endif\n' + f;

	if ( rock ) {
		f = f.replace( '#include <opaque_fragment>', 'outgoingLight = (outgoingLight - totalEmissiveRadiance) * qrRockAO + totalEmissiveRadiance;\n#include <opaque_fragment>' );
		f = f.replace( 'vec4( gDiffuse, 1.0 )', 'vec4( gDiffuse, 0.51 + 0.49 * qrRockSunVisibility )' );
	}
	if ( reference ) {

		// Height-derived local occlusion inside the cut. The original pigment
		// and emissive texels are unchanged, and uncarved material stays at 1.
		f = f.replace( '#include <opaque_fragment>', `
		float carveBase = texture2D( uCarveReference, fract( DETAIL_UV ) * uCarveReferenceUV.xy + uCarveReferenceUV.zw ).a;
		float carveDepth = max( 0.0, carveBase - texture2D( normalMap, DETAIL_UV ).a );
		float carveAO = mix( 1.0, clamp( 1.0 - carveDepth * 3.0, 0.08, 1.0 ), 1.0 - uClassic );
		outgoingLight = ( outgoingLight - totalEmissiveRadiance ) * carveAO + totalEmissiveRadiance;
		#include <opaque_fragment>` );
		// A separate byte-safe alpha band carries recess occlusion to deferred
		// lights. RGB is still the original pigment; rock's .51..1 band is intact.
		f = f.replace( 'vec4( gDiffuse, 1.0 )', 'vec4( gDiffuse, 0.1 + 0.39 * carveAO )' );

	}
	if ( relief && ! reference ) {

		// Sculpted plaques stand above their shallow background. Only cavities
		// below that plane receive occlusion; raised bone and glowing eyes retain
		// their authored colour and emissive light.
		const glFloat = value => Number.isInteger( value ) ? value.toFixed( 1 ) : String( value );
		f = f.replace( '#include <opaque_fragment>', `
		float sculptDepth = max( 0.0, ${glFloat( relief.cavityFloor )} - texture2D( normalMap, DETAIL_UV ).a );
		float sculptAO = mix( 1.0, clamp( 1.0 - sculptDepth * ${glFloat( relief.cavityScale )}, ${glFloat( relief.cavityMin )}, 1.0 ), 1.0 - uClassic );
		outgoingLight = ( outgoingLight - totalEmissiveRadiance ) * sculptAO + totalEmissiveRadiance;
		#include <opaque_fragment>` );
		f = f.replace( 'vec4( gDiffuse, 1.0 )', 'vec4( gDiffuse, 0.1 + 0.39 * sculptAO )' );

	}
 // Compute per-source visibility from the same scalar fields used by POM and
 // normals. Original albedo and baked/indirect lighting remain untouched.
 const microDepth = reference ? PARALLAX_DEPTH * 6 : relief?.depth ?? PARALLAX_DEPTH;
 const provider = `
 uniform float uHasHeightShadow;
 vec2 qrShadowDx,qrShadowDy;
 float qrShadowHeight(vec2 uv,int layer) {
  ${rock ? 'if(layer==1)return qrRockHeight(uv);' : ''}
  #ifdef USE_NORMALMAP
  float h=textureGrad(normalMap,uv,qrShadowDx,qrShadowDy).a;
  ${reference ? 'float b=textureGrad(uCarveReference,fract(uv)*uCarveReferenceUV.xy+uCarveReferenceUV.zw,qrShadowDx*uCarveReferenceUV.xy,qrShadowDy*uCarveReferenceUV.xy).a; return clamp(1.-(1.-b+8.*max(0.,b-h))/6.,0.,1.);' : 'return h;'}
  #else
  return 1.;
  #endif
 }
 bool qrShadowKnown(vec2 uv,int layer) {
  ${rock ? 'if(layer==1)return qrRockPage(floor(uv),vRockInfo.x)>=0;' : ''}
  return true;
 }
 `;
 f = HEIGHT_SHADOW_GLSL + f.replace( 'void main() {', provider + '\nvoid main() {\n#ifdef USE_MAP\nqrShadowDx=dFdx(vMapUv);qrShadowDy=dFdy(vMapUv);\n#else\nqrShadowDx=vec2(0.);qrShadowDy=vec2(0.);\n#endif' );
 const ctx = `
 vec4 qrHeightMask=vec4(1.);
 #ifdef USE_NORMALMAP
 HeightShadowContext hctx;
 hctx.microUv=DETAIL_UV;hctx.macroUv=vec2(0.);
 hctx.normal=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
 qrHeightGradients(-vViewPosition,vMapUv,hctx.normal,hctx.microGradU,hctx.microGradV,hctx.microUnit);
 hctx.macroGradU=vec3(0.);hctx.macroGradV=vec3(0.);hctx.macroUnit=0.;
 hctx.microAmp=${Number(microDepth).toFixed(8)};hctx.macroAmp=0.;
 hctx.microMaxUv=${reference ? '1.5' : '.35'};hctx.macroMaxUv=1.5;
 hctx.microValid=uHasHeightShadow*(1.-uClassic);hctx.macroValid=0.;hctx.macroSun=1.;
 ${this.userData.realDisplacement ? 'hctx.microValid=0.;' : ''}
 ${rock ? 'hctx.macroUv=qrRockQ;qrHeightGradients(-vViewPosition,vRockUv,hctx.normal,hctx.macroGradU,hctx.macroGradV,hctx.macroUnit);hctx.macroUnit=256.;hctx.macroAmp=qrRockAmp;hctx.macroValid=qrRockAmp>0.?1.:0.;hctx.macroSun=qrRockSunVisibility;' : ''}
 float unusedDiffuseVisibility;
 qrHeightMask=qrHeightBuildMask(-vViewPosition,hctx,unusedDiffuseVisibility);
 ${rock ? 'if(vRockWall>.5&&hctx.macroValid>.5&&uHeightShadowOn>.5&&uClassic<.5){uint alpha=uint(floor(qrHeightMask.a*255.+.5));if((alpha&192u)==64u)qrHeightMask.a=float((alpha&63u)|128u)/255.;}' : ''}
 #endif
 ${this.depthWrite === false ? 'qrHeightMask=vec4(0.);' : this.transparent ? 'qrHeightMask=vec4(1.);' : ''}
 `;
 f = f.replace( '#include <opaque_fragment>', ctx + '\n#include <opaque_fragment>' );
 // Packed normal alpha is view distance, not blend coverage. Transparent
 // effects preserve the solid normal packet instead of blending depth as alpha.
 f = f.replace( '#include <colorspace_fragment>', '#include <colorspace_fragment>\n gHeightMask=qrHeightMask;' + ( this.transparent || this.depthWrite === false ? '\n gNormal=vec4(0.);' : '' ) );

	shader.fragmentShader = f;
	if ( rock ) {
  // Warped rest coordinates own the micro sampler metric, while macro POM
  // still converts its physical view ray through the native map gradients.
  shader.fragmentShader = shader.fragmentShader.replace( 'qrShadowDx=dFdx(vMapUv);qrShadowDy=dFdy(vMapUv);', 'vec2 qrRockBaseUv=vMapUv+qrRockBandOffset(vRockUv);\nqrShadowDx=dFdx(qrRockBaseUv);qrShadowDy=dFdy(qrRockBaseUv);' )
   .replace( 'qrHeightGradients(-vViewPosition,vMapUv,hctx.normal', 'qrHeightGradients(-vViewPosition,qrRockBaseUv,hctx.normal' );
  R_PatchRockShader( shader );
 }

}

// Every material drawn into the HDR target has to write all attachments. Those
// that know nothing about the normal G-buffer (entities, sky, water, sprites,
// portals...) write "no normal here", which also replaces a stale normal from
// whatever they were drawn over. Alpha 0 selects a depth normal or marks an
// unavailable albedo. Transparent effects do not masquerade as opaque surfaces.
function patchGBufferShader( shader ) {

	let f = shader.fragmentShader;
	if ( f.indexOf( 'gNormal' ) !== - 1 || f.indexOf( '#include <colorspace_fragment>' ) === - 1 ) return;
	const surface = f.includes( '#include <map_fragment>' ) && this.depthWrite !== false && this.transparent !== true;
	// Alias vertex colours contain baked illumination. Capture the texture/material
	// before color_fragment multiplies that lighting in; zero cannot be divided out.
	if ( surface ) f = f.replace( '#include <map_fragment>', '#include <map_fragment>\nvec3 gDiffuse = diffuseColor.rgb;' );
	shader.fragmentShader = 'layout(location = 1) out highp vec4 gNormal;\nlayout(location = 2) out highp vec4 gAlbedo;\nlayout(location = 3) out highp vec4 gHeightMask;\n' +
		f.replace( '#include <colorspace_fragment>', '#include <colorspace_fragment>\n\tgNormal = vec4( 0.0 );\n\tgAlbedo = ' + ( surface ? 'vec4( gDiffuse, 1.0 )' : 'vec4( 0.0 )' ) + ';\n gHeightMask = ' + ( this.depthWrite !== false ? 'vec4( 1.0 )' : 'vec4( 0.0 )' ) + ';' );

}

THREE.Material.prototype.onBeforeCompile = patchGBufferShader;

function applyDetail( material ) {

	const diffuse = material.userData.detailDiffuse;
	if ( material.emissive !== undefined ) {

		const emission = diffuse?._fullbright || null;
		if ( material.emissiveMap !== emission ) {

			const changedKind = !! material.emissiveMap !== !! emission;
			material.emissiveMap = emission;
			material.emissive.setRGB( emission ? 1 : 0, emission ? 1 : 0, emission ? 1 : 0 );
			if ( changedKind ) material.needsUpdate = true;

		}
		if ( glowMaterials.has( material ) && ! lavaMaterials.has( material ) ) {

			material.userData.glowBoost = diffuse?.userData.newerGlowBoost ?? material.userData.baseGlowBoost;
			applyGlow( material, material.userData.glowBoost );

		}

	}
	const waiting=detailActive&&diffuse?.userData.newerPending;
	if(detailActive&&!waiting&&diffuse?.image?.data&&typeof window!=='undefined'&&R_NormalPreparationNeeded(diffuse))R_NormalPrepare(diffuse);
	const wanted = detailActive && !waiting && diffuse != null ? R_NormalMapFor( diffuse ) : null;

	if ( material.normalMap === wanted ) return;

	const changedKind = ( material.normalMap != null ) !== ( wanted != null );
	const changedCarving = !! material.normalMap?.userData.referenceHeight !== !! wanted?.userData.referenceHeight;
	const changedRelief = JSON.stringify( material.normalMap?.userData.surfaceRelief ) !== JSON.stringify( wanted?.userData.surfaceRelief );
	const changedGlass=!!material.normalMap?.userData.glassGloss !== !!wanted?.userData.glassGloss;
 material.normalMap = wanted;
 const glassUniforms=material.userData.glassUniforms ||= {uGlassGloss:{value:null}};
 glassUniforms.uGlassGloss.value=wanted?.userData.glassGloss||null;
	if ( wanted?.userData.referenceHeight ) {

		// Cached shader variants share these holders across mode/texture changes.
		const uniforms = material.userData.carveUniforms ||= { uCarveReference: { value: null }, uCarveReferenceUV: { value: null } };
		uniforms.uCarveReference.value = wanted.userData.referenceHeight;
		uniforms.uCarveReferenceUV.value = wanted.userData.referenceUV;

	}
	if ( material.normalScale !== undefined ) material.normalScale.set( 1, 1 );
	if ( changedKind || changedCarving || changedRelief || changedGlass ) material.needsUpdate = true;

}

// World materials keep normal maps and parallax independently of lighting,
// and always write the normal G-buffer.
export function R_RegisterDetail( material, diffuse ) {

	bindDetailTexture( material, diffuse );
	material.onBeforeCompile = patchDetailShader;
	material.customProgramCacheKey = function () {

		return ( this.userData.rockField ? 'quake-detail-rock-v2-bandwarp' : 'quake-detail' ) + ( this.normalMap?.userData.referenceHeight ? '-carved' : '' ) + ( this.normalMap?.userData.surfaceRelief ? '-sculpted:' + JSON.stringify( this.normalMap.userData.surfaceRelief ) : '' ) + ( this.userData.realDisplacement ? '-displaced' : '' ) + ( this.normalMap?.userData.glassGloss ? '-glass-v2-regions' : '' ) + '-height-shadow-filtered-v2';

	};

	applyDetail( material );
	detailMaterials.add( material );
	material.addEventListener( 'dispose', () => {

		detailMaterials.delete( material );
		detailTextureListeners.get( material )?.();
		detailTextureListeners.delete( material );

	} );

}

// the material's diffuse texture changed (texture animation)
export function R_RefreshDetail( material, diffuse ) {

	if ( ! detailMaterials.has( material ) ) return;
	bindDetailTexture( material, diffuse );
	applyDetail( material );

}

// Async art/height can arrive after world materials compile. Listen on the
// existing Three texture without a reverse import into the renderer graph.
// Animation changes and material disposal detach the previous texture listener.
const detailTextureListeners = new WeakMap();
function bindDetailTexture( material, diffuse ) {

	detailTextureListeners.get( material )?.();
	material.userData.detailDiffuse = diffuse;
	const refresh = () => applyDetail( material );
	diffuse?.addEventListener( 'newertextureupdated', refresh );
	detailTextureListeners.set( material, () => diffuse?.removeEventListener( 'newertextureupdated', refresh ) );

}

//============================================================================
// Light database
//============================================================================

let worldLights = [];
let hasSky = false;

// Pools of water and slime: { kind, min: [x, y], max: [x, y], z }.  A ray that
// passes through one loses light to it, and surfaces beneath it get caustics.
let liquidRegions = [];
let lavaRegions = [];
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
// Stock Quake's water textures: *water0-2, *04water1/2, *04awater1 and, in Episode 3 (E3M3 to E3M5), *04mwat1/2 (murky
// water, the name has no "water" in it). Anything else starting with '*' is slime, lava or a teleporter.
// Murky water (Episode 3) is brown sediment like E1M3's *04water1, so it shares that look (see liquidMapLook).
const MURKY_WATER = /mwat/i;
export const R_IsWaterTextureName = name => name.charAt( 0 ) === '*' && /water|mwat/i.test( name ) && ! /slime|lava|teleport/i.test( name );

function liquidKind( name ) {

	const n = name.toLowerCase();
	if ( n.charAt( 0 ) !== '*' || n.indexOf( 'lava' ) >= 0 || n.indexOf( 'teleport' ) >= 0 ) return - 1;
	if ( n.indexOf( 'slime' ) >= 0 ) return 1;
	if ( R_IsWaterTextureName( n ) ) return 0;
	return - 1;

}

// Shared optical authoring: one source for materials and generated GLSL.
// Scattering uses received light. Only the toxic profile has intentional glow.
export const LIQUID_LOOKS = Object.freeze( [
	Object.freeze( { name: 'Clear', opacity: 0.05, absorption: [ 0.006, 0.0012, 0.00025 ], scatter: [ 0.035, 0.09, 0.14 ], emission: [ 0, 0, 0 ], caustic: 1.15, refraction: 1, ripple: 0.70, speed: 0.60 } ),
	Object.freeze( { name: 'Tinted', opacity: 0.08, absorption: [ 0.0065, 0.0011, 0.0045 ], scatter: [ 0.09, 0.25, 0.06 ], emission: [ 0, 0, 0 ], caustic: 1.05, refraction: 1, ripple: 0.65, speed: 0.55 } ),
	Object.freeze( { name: 'Muddy', opacity: 0.10, absorption: [ 0.009, 0.014, 0.020 ], scatter: [ 0.38, 0.22, 0.09 ], emission: [ 0, 0, 0 ], caustic: 0.65, refraction: 0.45, ripple: 0.60, speed: 0.50 } ),
	Object.freeze( { name: 'Toxic', opacity: 0.22, absorption: [ 0.017, 0.0028, 0.024 ], scatter: [ 0.15, 0.8, 0.025 ], emission: [ 0.035, 0.20, 0.002 ], caustic: 2.6, refraction: 0.8, ripple: 0.80, speed: 0.70 } )
] );

export function R_LiquidLookIndex( kind, mapLook = 0 ) {

	if ( kind === 1 ) return 3; // actual slime always retains its hazard identity
	const choice = Number.isFinite( r_water_look.value ) ? Math.round( r_water_look.value ) : 0;
	if ( choice === 0 ) return mapLook;
	return Math.max( 0, Math.min( 3, choice - 1 ) );

}

export function R_LiquidOpacity( name, fallback ) {

	if ( r_newer_water.value === 0 ) return fallback;
	const kind = liquidKind( name );
	return kind < 0 ? fallback : LIQUID_LOOKS[ R_LiquidLookIndex( kind, liquidMapLook( name ) ) ].opacity;

}

// Stock E1M3's brown sediment water is authored by its texture identity.
// This affects optics only; contents, movement and damage remain map-owned.
function liquidMapLook( name ) {
	const n = name.toLowerCase();
	return n === '*04water1' || MURKY_WATER.test( n ) ? 2 : 0; // brown sediment: E1M3's water and E3's murky water
}

// Generated constants keep the GPU's optical values identical to the material
// policy above. The profile id fits in the existing pool-bound uniform's w.
const liquidLookGLSL = [ [ 'Absorption', 'absorption' ], [ 'Scatter', 'scatter' ], [ 'Emission', 'emission' ] ].map( ( [ fn, field ] ) =>
	`vec3 liquid${fn}( float look ) {
` + LIQUID_LOOKS.map( ( p, i ) => `if ( look < ${i + .5} ) return vec3( ${p[ field ].map( n => n.toFixed( 6 ) ).join( ', ' )} );` ).join( '\n' ) + '\nreturn vec3( 0.0 );\n}\n' ).join( '\n' ) +
	[ [ 'Caustic', 'caustic' ], [ 'Refraction', 'refraction' ], [ 'Ripple', 'ripple' ], [ 'Speed', 'speed' ] ].map( ( [ fn, field ] ) =>
		`float liquid${fn}( float look ) {
` + LIQUID_LOOKS.map( ( p, i ) => `if ( look < ${i + .5} ) return ${p[ field ].toFixed( 6 )};` ).join( '\n' ) + '\nreturn 0.0;\n}\n' ).join( '\n' );

// merge the many small faces of a pool into one box
function mergeLiquidFaces( faces ) {

	const parent = faces.map( ( f, i ) => i );
	const find = i => parent[ i ] === i ? i : ( parent[ i ] = find( parent[ i ] ) );

	for ( let i = 0; i < faces.length; i ++ ) {

		for ( let j = i + 1; j < faces.length; j ++ ) {

			const a = faces[ i ], b = faces[ j ];
			if ( a.kind !== b.kind || a.mapLook !== b.mapLook || Math.abs( a.z - b.z ) > 1.5 ) continue;
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

			merged.set( r, { kind: f.kind, mapLook: f.mapLook || 0, min: f.min.slice(), max: f.max.slice(), z: f.z, probePoints: f.probePoint ? [ f.probePoint ] : [] } );

		} else {

			if ( f.probePoint ) m.probePoints.push( f.probePoint );
			for ( let a = 0; a < 2; a ++ ) {

				m.min[ a ] = Math.min( m.min[ a ], f.min[ a ] );
				m.max[ a ] = Math.max( m.max[ a ], f.max[ a ] );

			}

		}

	}

	return [ ...merged.values() ].filter( r => ( r.max[ 0 ] - r.min[ 0 ] ) * ( r.max[ 1 ] - r.min[ 1 ] ) > 64 * 64 );

}

export function R_GetLavaRegions() {

	return lavaRegions;

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
	lavaRegions = [];
	liquidLinks = [];
	buildSkyCookie();
	sunDirection = [ - 0.28, - 0.18, 0.94 ];

	if ( model == null || model.nodes == null ) return worldLights;

	const entities = model.entities != null ? R_ParseEntityLump( model.entities ) : [];
	// light entities
	if ( model.entities != null ) {


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
				classname: ent.classname,
				emitter: FIRE_LIGHT.test( ent.classname ) ? 1 : 0,
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

	const fixturePairs=R_ExitFixturePairs(model,entities,worldLights,{info:polyInfo,bounds:polyBounds,leaf:Mod_PointInLeaf});
 const fixtureFaces=new Set(fixturePairs.map(pair=>pair.face));
 for(const pair of fixturePairs){
  const light=pair.helper;
  light.fixture={face:pair.face,authoredPosition:light.pos.slice(),panelCenter:pair.center};
  light.pos=pair.position;light.direction=pair.direction;light.cone=pair.cone;
  light.priority=4; // source membership only; retain authored radiance/style
  light.radius=96; // calibrated spread/falloff, not an authored BSP cone
  light.leaf=Mod_PointInLeaf(light.pos,model);
 }

	// emissive surfaces (lava, light panels, glowing buttons...)
	if ( model.surfaces != null ) {

		const first = model.firstmodelsurface || 0;
		const last = first + ( model.nummodelsurfaces || model.surfaces.length );
		const clusters = new Map();
		const liquidFaces = [];
		const lavaFaces = [];
		const linkSeen = new Set();
		const visCache = new Map();

		for ( let i = first; i < last; i ++ ) {

			const surf = model.surfaces[ i ];
			if ( surf == null || surf.texinfo == null || surf.texinfo.texture == null ) continue;
			if ( surf.flags & SURF_DRAWSKY ) { hasSky = true; continue; }

			// lava: the pools the heat shimmers over
			const lname = surf.texinfo.texture.name.toLowerCase();
			if ( lname.charAt( 0 ) === '*' && lname.indexOf( 'lava' ) >= 0 && Math.abs( surf.plane.normal[ 2 ] ) > 0.95 ) {

				const linfo = polyInfo( surf );
				const lbox = polyBounds( surf );
				if ( linfo != null && lbox != null ) lavaFaces.push( { kind: 2, min: [ lbox[ 0 ], lbox[ 1 ] ], max: [ lbox[ 3 ], lbox[ 4 ] ], z: linfo.center[ 2 ] } );

			}

			const liquid = liquidKind( surf.texinfo.texture.name );
			if ( liquid >= 0 && Math.abs( surf.plane.normal[ 2 ] ) > 0.95 ) {

				const info = polyInfo( surf );
				const box = polyBounds( surf );
				if ( info != null && box != null ) {

					const probePoint = [ info.center[ 0 ], info.center[ 1 ], info.center[ 2 ] + WATER_PROBE_LIFT ];
					const validProbe = Mod_PointInLeaf( probePoint, model ).contents === - 1;
					liquidFaces.push( { kind: liquid, mapLook: liquidMapLook( surf.texinfo.texture.name ), min: [ box[ 0 ], box[ 1 ] ], max: [ box[ 3 ], box[ 4 ] ], z: info.center[ 2 ], probePoint: validProbe ? probePoint : null } );

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

			if(fixtureFaces.has(i))continue; // matched physical source already owns its added light
			const emission = surfaceEmission( surf );
			if ( emission == null ) continue;

			// Large turbulent faces already contain subdivided polygons. Cluster
			// lava from those actual patches, not one distant pool-centre light.
			const lava = lname.indexOf( '*lava' ) === 0;
			const patches = [];
			if ( lava ) {
				for ( let p = surf.polys; p; p = p.next ) patches.push( polyInfo( { polys: { numverts: p.numverts, verts: p.verts, next: null } } ) );
			} else patches.push( polyInfo( surf ) );
			for ( const info of patches ) {
				if ( info == null || info.area < 64 ) continue;

				const key = surf.texinfo.texture.name + '|' +
					Math.floor( info.center[ 0 ] / SURFACE_CELL ) + ',' +
					Math.floor( info.center[ 1 ] / SURFACE_CELL ) + ',' +
					Math.floor( info.center[ 2 ] / SURFACE_CELL ) +
					// Opposite lava faces must not average their source into the pool.
					( lava ? '|' + Array.from( surf.plane.normal ).map( v => v * ( surf.flags & 2 ? -1 : 1 ) ).join( ',' ) : '' );

				let c = clusters.get( key );
				if ( c === undefined ) {

					c = { emission, texture: surf.texinfo.texture.name, area: 0, sum: [ 0, 0, 0 ], normal: [ 0, 0, 0 ] };
					clusters.set( key, c );

				}

				const sign = ( surf.flags & 2 ) ? - 1 : 1; // SURF_PLANEBACK
				c.area += info.area;
				for ( let a = 0; a < 3; a ++ ) {

					c.sum[ a ] += info.center[ a ] * info.area;
					c.normal[ a ] += surf.plane.normal[ a ] * sign * info.area;

				}
			}

		}

		liquidRegions = mergeLiquidFaces( liquidFaces );
		lavaRegions = mergeLiquidFaces( lavaFaces );

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
				emitter: 1,
				texture: c.texture, // source provenance; entity/dynamic lamps have no surface texture
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

	rockUniforms.qrRockSun.value.set( ...sunDirection ).normalize();
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
	gpu?.pointShadows?.setGeometry( null );
	occluder.geometry.dispose();
	occluder = null;

}

export function R_BuildSunOccluder( model ) {
	const bake=model&&R_NewerGame()&&r_newer_normals.value!==0&&r_newer_textures.value!==0?R_DemonBakePrepare(model,model.surfaces||[]):null;

	disposeOccluder();
	if ( model == null || model.surfaces == null ) return 0;

	const first = model.firstmodelsurface || 0;
	const last = first + ( model.nummodelsurfaces || model.surfaces.length );
	let positions = [];const chunks=[];

	for ( let i = first; i < last; i ++ ) {

		const surf = model.surfaces[ i ];
		if ( surf == null || surf.polys == null ) continue;
		if ( R_NewerGame() && R_ArchSurfaceHidden( surf ) ) continue;
		if ( surf.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) continue;

		for ( let p = surf.polys; p; p = p.next ) {

			const v = p.verts;
			const at = ( n, k ) => v instanceof Float32Array ? v[ n * 7 + k ] : v[ n ][ k ];

			for ( let n = 2; n < p.numverts; n ++ ) {

				for ( const idx of [ 0, n - 1, n ] )
					positions.push( at( idx, 0 ), at( idx, 1 ), at( idx, 2 ) );

			}

		}
		// The retained wall backing plus its actual raised relief forms the
		// same occluder seen by the enhanced scene. Classic keeps native geometry.
		if ( R_NewerGame() && r_newer_normals.value !== 0 && r_newer_textures.value !== 0 ) {

			const prepared=R_DemonBakeSurface(surf);
			const relief = bake?.status==='loading'||bake?.status==='error'?null:prepared.status==='ready'?prepared.data:prepared.status==='unprepared'?R_DemonSurfaceData(surf):null;
			if(relief){if(positions.length){chunks.push({positions:new Float32Array(positions)});positions=[];}chunks.push(relief.interleaved?{interleaved:relief.interleaved,indices:relief.indices}:{positions:relief.positions});}

		}

	}

	if(positions.length)chunks.push({positions:new Float32Array(positions)});
 const indexed=chunks.some(c=>c.interleaved);
 const vertices=chunks.reduce((sum,c)=>sum+(c.interleaved?c.interleaved.length/10:c.positions.length/3),0);
 const corners=chunks.reduce((sum,c)=>sum+(c.indices?c.indices.length:c.positions.length/3),0);if(!corners)return 0;
 const combined=new Float32Array(vertices*3),order=indexed?new Uint32Array(corners):null;let base=0,corner=0;
 for(const c of chunks){
  const count=c.interleaved?c.interleaved.length/10:c.positions.length/3;
  if(c.interleaved){for(let i=0;i<count;i++){combined[(base+i)*3]=c.interleaved[i*10];combined[(base+i)*3+1]=c.interleaved[i*10+1];combined[(base+i)*3+2]=c.interleaved[i*10+2];}}
  else combined.set(c.positions,base*3);
  if(order){if(c.indices)for(const index of c.indices)order[corner++]=base+index;else for(let i=0;i<count;i++)order[corner++]=base+i;}
  base+=count;
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(combined,3));
 if(order)geometry.setIndex(new THREE.BufferAttribute(order,1));geometry.computeBoundingSphere();

	occluder = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } ) );
	occluder.name = 'quake_sun_occluder';
	if ( occluder.layers !== undefined ) occluder.layers.set( SUN_SHADOW_LAYER ); // invisible to every ordinary camera
	occluder.matrixAutoUpdate = false;
	gpu?.pointShadows?.setGeometry( geometry );

	return corners / 3;
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
	_selected.push( { pos: [ 0, 0, 0 ], worldPos: [ 0, 0, 0 ], source: null, color: [ 0, 0, 0 ], radius: 30, range: 300, score: 0 } );
let selectedCount = 0;

const DLIGHT_COLOR = [ 1.0, 0.62, 0.28 ];
const MUZZLE_COLOR = [ 1.0, 0.78, 0.45 ]; // a muzzle flash is whiter and much stronger than an ember
const MUZZLE_POWER = 3;

function consider( px, py, pz, color, power, radius, view, add = 0, source = null, rankPower = power ) {

	// view space
	const vx = view[ 0 ] * px + view[ 4 ] * py + view[ 8 ] * pz + view[ 12 ];
	const vy = view[ 1 ] * px + view[ 5 ] * py + view[ 9 ] * pz + view[ 13 ];
	const vz = view[ 2 ] * px + view[ 6 ] * py + view[ 10 ] * pz + view[ 14 ];

	const dist2 = vx * vx + vy * vy + vz * vz;
	// Receiver lighting must not change when the camera turns at one location.
	// Visible flames receive priority over invisible baked-light helper entities.
	const score = rankPower / ( dist2 + 6000 ) * ( source?.bestiary ? 16 : source?.priority || ( source?.emitter === 1 ? 4 : 1 ) );

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
	slot.source = source; slot.worldPos[ 0 ] = px; slot.worldPos[ 1 ] = py; slot.worldPos[ 2 ] = pz;
 const shape=R_LightCone(source?.direction,source?.cone);
 slot.direction=shape?.direction || [0,0,0];slot.cone=shape?.cone || [1,1];
 slot.viewDirection=shape?[
 view[0]*shape.direction[0]+view[4]*shape.direction[1]+view[8]*shape.direction[2],
 view[1]*shape.direction[0]+view[5]*shape.direction[1]+view[9]*shape.direction[2],
 view[2]*shape.direction[0]+view[6]*shape.direction[1]+view[10]*shape.direction[2]]:[0,0,0];
	slot.add = add;
	slot.pos[ 0 ] = vx; slot.pos[ 1 ] = vy; slot.pos[ 2 ] = vz;
	slot.radius = radius;
	// Pickup pulses change radiance, not receiver reach or shadow residency.
	slot.range = 130 + 170 * Math.sqrt( source?.powerup || source?.bestiary ? rankPower : power );
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

		const rankPower = power; // flicker changes radiance, not slot membership
		if ( l.emitter === 1 ) power *= EMITTER_LIGHT_GAIN;
		if ( l.flicker === 1 ) power *= R_FireFlicker( l.pos[ 0 ], l.pos[ 1 ], l.pos[ 2 ], time );

		if ( power <= 0.001 ) continue;
		consider( l.pos[ 0 ], l.pos[ 1 ], l.pos[ 2 ], l.color, power, l.radius, view, 0, l, rankPower );

	}

	// Live pickup sources enter the SAME selection/snapshot/shadow slots as
	// map lights. Only radiance pulses; ranking and cube range stay stable.
	for ( const l of R_PowerupLights() ) {
		const pulse = l.powerup === 'quad' ? R_PowerupPulse( time ) : 1;
		consider( ...l.pos, l.color, l.power * pulse, l.radius, view, .65, l, l.power );
	}
	const portrait=R_BestiaryPortraitLight();
	if(portrait&&portrait.fade>0)consider(...portrait.pos,portrait.color,portrait.power*portrait.fade,portrait.radius,view,0,portrait,portrait.power);

	if ( dlights != null ) {

		for ( let i = 0; i < dlights.length; i ++ ) {

			const d = dlights[ i ];
			if ( d == null || d.radius <= 0 || d.die < time ) continue;

			// (the game gives a muzzle flash a minimum light of 32)
			const muzzle = d.minlight === 32;
			// an ordinary light fades over its last 0.3 s; a flash is only 0.1 s long and full strength until it is gone
			const fade = Math.min( 1, ( d.die - time ) / ( muzzle ? 0.1 : 0.3 ) );
			consider( d.origin[ 0 ], d.origin[ 1 ], d.origin[ 2 ], muzzle ? MUZZLE_COLOR : DLIGHT_COLOR,
				d.radius / 300 * 1.4 * fade * ( muzzle ? MUZZLE_POWER * ( d.flashScale === undefined ? 1 : d.flashScale ) : 1 ), 40, view, 1, d, d.radius / 300 * 1.4 * (muzzle?MUZZLE_POWER:1) );

		}

	}

}

// Read-only diagnostic/public-test endpoint; normal rendering uses the same
// selection without allocating snapshots every frame.
export function R_SelectWorldLights( viewMatrix, visframe, styles, dlights, time ) {
 selectLights( viewMatrix, visframe, styles, dlights, time );
 return _selected.slice( 0, selectedCount ).map( light => ( { source: light.source, position: light.worldPos.slice(), color: light.color.slice(), range: light.range, score: light.score, direction:light.direction.slice(), cone:light.cone.slice() } ) );
}
export function R_PointShadowAtlas() { return gpu?.pointShadows || null; }
export function R_PointShadowStatus() { return gpu?.pointShadows?.status() || { ready: 0, pending: 0, resident: 0, chunks: 0 }; }
export function R_ReleaseShadowCaster( mesh ) { gpu?.pointShadows?.forgetDynamic( mesh ); }

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
${POINT_SHADOW_GLSL}
${SPOT_WORLD_SHADOW_GLSL}
${NEAR_SUN_SHADOW_GLSL}
uniform sampler2D tDepth;
${HEIGHT_MASK_DECODE_GLSL}
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
uniform float uLightCookie[ ${MAX_VOLUME_LIGHTS} ];
uniform vec4 uLightRotation[ ${MAX_VOLUME_LIGHTS} ];
uniform vec3 uLightDirection[ ${MAX_VOLUME_LIGHTS} ];
uniform vec2 uLightCone[ ${MAX_VOLUME_LIGHTS} ];
${POINT_CONE_GLSL}
uniform float uPowerupTime;
${POWERUP_COOKIE_GLSL}
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

	// point lights: analytic scattering with the same whole-world static occlusion as receivers
	vec3 acc = vec3( 0.0 );
	if ( uScatter > 0.0 ) for ( int i = 0; i < ${MAX_VOLUME_LIGHTS}; i ++ ) {
		if ( i >= uCount ) break;

		vec3 L = uLightPos[ i ].xyz;
		float R = uLightPos[ i ].w;

		float t0 = dot( L, dirV );
		float h = sqrt( max( dot( L, L ) - t0 * t0, 0.0 ) + R * R );
		float integral = ( atan( ( D - t0 ) / h ) + atan( t0 / h ) ) / h;
		float range = uLightCol[ i ].w;
		integral *= 1.0 - smoothstep( 0.25 * range, range, h );
		// An out-of-range light contributes exactly zero. Avoid its twelve depth
		// marches rather than calculating a visibility that will be multiplied away.
		if ( integral <= 0.0 ) continue;

		vec3 Q = dirV * clamp( t0, 0.0, D );
  bool directional=dot(uLightDirection[i],uLightDirection[i])>.5;
  if(directional){
   float begin=max(0.,t0-range),end=min(D,t0+range),stepLength=max(0.,end-begin)/12.;
   integral=0.;float peak=0.;
   for(int k=0;k<12;k++){
    vec3 sampleV=dirV*(begin+(float(k)+.5)*stepLength);vec3 delta=sampleV-L;
    float distance=length(delta),weight=pointCone(sampleV,i)*(1.-smoothstep(.25*range,range,distance))*stepLength/(dot(delta,delta)+R*R);
    if(weight<=0.)continue;
    if(uPointShadowInfo[i].x>=0.)weight*=pointWorldVisibility((uViewInv*vec4(sampleV,1.)).xyz,(uViewInv*vec4(L,1.)).xyz,i);
    integral+=weight;if(weight>peak){peak=weight;Q=sampleV;}
   }
   if(integral<=0.)continue;
  }
		float worldVisibility = 1.0;
  if ( !directional && uPointShadowInfo[ i ].x >= 0.0 ) {
   vec3 receiver = ( uViewInv * vec4( Q, 1.0 ) ).xyz;
   vec3 source = ( uViewInv * vec4( L, 1.0 ) ).xyz;
   worldVisibility = pointWorldVisibility( receiver, source, i );
   if ( worldVisibility <= 0.0 ) continue;
  }
		float lit = 0.0;
		for ( int k = 0; k < SHADOW_STEPS; k ++ ) {
			float s = ( float( k ) + 0.5 ) / float( SHADOW_STEPS ); // (no per-pixel jitter: it showed as speckle round lights)
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
		acc += uLightCol[ i ].rgb * integral * worldVisibility * lit * lit * phase;
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
			float beamVisibility=spotWorldVisibility((uViewInv*vec4(P,1.)).xyz);
			beam += uSpotCol * cone * cone * beamVisibility / ( 1.0 + dist * dist / ( 200.0 * 200.0 ) );
		}
		float phase = henyeyGreenstein( dot( dirV, uSpotDir ), 0.5 );
		result += beam * ds * 0.0000011 * phase;
	}

	gl_FragColor = vec4( result + acc * uScatter, 1.0 );
}`;

const BLOOM_PREFILTER_FRAGMENT = `
uniform sampler2D tPowerupFire;
uniform float uPowerupFireOn;
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uThreshold;
varying vec2 vUv;
// threshold first, then weight by brightness so single hot pixels can't flicker
vec4 fetch( vec2 o ) {
	vec2 uv=vUv+o*uTexel;
 vec4 fire=uPowerupFireOn>.5?texture2D(tPowerupFire,uv):vec4(0.);
 vec3 c=(texture2D(tScene,uv).rgb+fire.rgb*(1.-clamp(fire.a,0.,1.)))*uExposure;
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
layout(location = 1) out highp vec4 visionCoordinates;
${VISION_UV_PACK_GLSL}
#include <common>
uniform sampler2D tPowerupFire;
uniform float uPowerupFireOn;
vec4 powerupFireAt(vec2 uv){return uPowerupFireOn>.5?texture2D(tPowerupFire,uv):vec4(0.);}
vec3 powerupEmissionAt(vec2 uv){vec4 fire=powerupFireAt(uv);return fire.rgb*(1.-clamp(fire.a,0.,1.));}
uniform sampler2D tScene;
uniform sampler2D tNormal;
uniform sampler2D tAlbedo;
uniform sampler2D tVolume;
uniform sampler2D tBloom;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uBloom;
uniform float uVolume;
uniform float uSunSurface;
uniform vec3 uSunSurfaceCol;
uniform float uLightSurface;
uniform float uLightFloor;
uniform float uLightAdd[ ${MAX_VOLUME_LIGHTS} ];
uniform float uEdge;
uniform float uDropDensity;
uniform float uDropBlood;
uniform float uBumpLight;
uniform float uActorWet;
uniform float uLighting;
uniform float uOffscreen;
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
uniform float uUnderwater;
uniform samplerCube tProbeA;
uniform samplerCube tProbeB;
uniform vec3 uProbeCenter[ 2 ];
uniform vec3 uProbeMin[ 2 ];
uniform vec3 uProbeMax[ 2 ];
uniform int uProbeOf[ ${MAX_LIQUID_REGIONS} ]; // which probe a pool uses (-1 none)
uniform float uScreenReflect;
uniform int uLavaCount;
uniform vec4 uLavaMin[ 4 ]; // xy = min corner, z = the lava's height
uniform vec4 uLavaMax[ 4 ];
uniform float uHeat;
uniform float uReflect;
uniform int uWaterCount;
uniform float uMist;
uniform vec4 uWaterMin[ ${MAX_LIQUID_REGIONS} ]; // xy = min corner, z = surface height, w = kind
uniform vec4 uWaterMax[ ${MAX_LIQUID_REGIONS} ]; // xy = max corner, w = optical look

${liquidLookGLSL}
const int RELIGHT_STEPS = 8;

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

bool heldReceiver(vec4 packet){return packet.a < -2.;}
float receiverDistance(vec4 packet){return heldReceiver(packet)?-packet.a-2.:packet.a;}
bool actorReceiver(float tag){return tag>.05&&tag<.095;}
bool glassReceiver(float tag){return tag>.495&&tag<.505;}
vec3 viewPosAt( vec2 uv ) {
 vec4 packet=texture2D(tNormal,uv);
 if(heldReceiver(packet)){
  vec4 ray=uProjInv*vec4(uv*2.-1.,1.,1.);vec3 r=ray.xyz/ray.w;
  return r*(receiverDistance(packet)/max(-r.z,1e-6));
 }
 float d=texture2D(tDepth,uv).x;
 vec4 p=uProjInv*vec4(uv*2.-1.,d*2.-1.,1.);
 return p.xyz/p.w;
}

${POWERUP_SHROUD_COMPOSITE_GLSL}

// Share ordinary point/torch receiver lighting with confirmed water SSR
// hits. Cheap incident estimates rank candidates before any shadow sampling.
vec3 pointSurfaceIncident( vec3 P, vec3 normal, int index ) {
	vec3 L = uLightPos[ index ].xyz - P;
	float distance = length( L ), range = uLightCol[ index ].w;
	if ( distance >= range ) return vec3( 0.0 );
	float facing = max( dot( normal, L / max( distance, 0.001 ) ), 0.0 );
	if ( facing <= 0.0 ) return vec3( 0.0 );
	// Ordinary map lamps (radius28) and dynamic lights (radius40) retain their
	// sixty-unit falloff. Existing broad surface emitters reach their own edges.
	float extent = max( 60.0, uLightPos[ index ].w );
	float fall = 1.0 / ( 1.0 + distance * distance / ( extent * extent ) );
	fall *= 1.0 - smoothstep( 0.55 * range, range, distance );
	float cookie=1.;
	if(uLightCookie[index]>.5){
	 vec3 direction=(uViewInv*vec4(P-uLightPos[index].xyz,0.)).xyz;
	 cookie=powerupFlameCookie(powerupLocalDirection(direction,uLightRotation[index]),uPowerupTime);
	}
	return uLightCol[ index ].rgb * uLightSurface * facing * fall * cookie * pointCone(P,index);
}

float pointSurfaceVisibility( vec3 P, vec3 normal, int index, float bias ) {
 // Hidden static columns/walls cannot leak light. Keep the existing screen
 // test as well, so current actors and moving brush doors retain occlusion.
 float worldVisibility = 1.0;
 if ( uPointShadowInfo[ index ].x >= 0.0 ) {
  vec3 receiver = ( uViewInv * vec4( P + normal * bias, 1.0 ) ).xyz;
  vec3 source = ( uViewInv * vec4( uLightPos[ index ].xyz, 1.0 ) ).xyz;
  worldVisibility = pointWorldVisibility( receiver, source, index );
  return worldVisibility;
 }
 float visibility = 0.0;
	for ( int k = 0; k < RELIGHT_STEPS; k ++ ) {
		float fraction = ( float( k ) + 0.5 ) / float( RELIGHT_STEPS );
		vec3 Q = mix( P + normal * 2.0, uLightPos[ index ].xyz, fraction * 0.95 );
		if ( Q.z > - uNear ) { visibility += 1.0; continue; }
		vec4 clip = uProj * vec4( Q, 1.0 );
		vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
		if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) { visibility += 1.0; continue; }
		visibility += sceneDist( uv ) < ( - Q.z ) - ( 5.0 + 0.012 * ( - Q.z ) ) ? 0.0 : 1.0;
	}
	visibility /= float( RELIGHT_STEPS );
	return worldVisibility * visibility * visibility;
}

float pointSurfaceVisibility(vec3 P,vec3 normal,int index){return pointSurfaceVisibility(P,normal,index,1.);}

float receiverHeightVisibility(vec3 P,vec2 uv,int index) {
 vec4 packet=texture2D(tNormal,uv);
 if(receiverDistance(packet)<=0. || abs(receiverDistance(packet)+P.z)>.025*(-P.z)+1.)return 1.;
 return heightMaskVisibility(uv,index);
}
float receiverRockContrast(vec3 P,vec2 uv,float shadowedWeight,float visibleWeight) {
 // A transparent foreground depth writer can leave the background's packed
 // mask intact. Only the matching solid receiver owns the rock-wall tag.
 vec4 packet=texture2D(tNormal,uv);
 if(receiverDistance(packet)<=0. || abs(receiverDistance(packet)+P.z)>.025*(-P.z)+1.)return 1.;
 float gain=heightRockContrast(uv,shadowedWeight,visibleWeight);
 if(gain>1.){
  float existingLight=dot(texture2D(tScene,uv).rgb,vec3(.2126,.7152,.0722));
  gain=mix(gain,1.,smoothstep(.08,.30,existingLight));
 }
 return gain;
}
float receiverReliefNormalMix(vec2 uv,float baseMix){
 if(uHeightMasks<.5)return baseMix;
 uint tag=uint(floor(clamp(texture2D(tHeightShadow,uv).a,0.,1.)*255.+.5))&192u;
 return tag==128u?.8:baseMix;
}
float pointHeightSurfaceVisibility(vec3 P,vec3 normal,int index,vec2 uv) {
 return pointSurfaceVisibility(P,normal,index,actorReceiver(texture2D(tAlbedo,uv).a)?.1:1.)*receiverHeightVisibility(P,uv,index);
}

// Reuse the solid receiver's cone, falloff and shadow test for reflected
// receivers and water. Incident light here excludes the receiver's N dot L.
float flashlightIrradiance( vec3 P, vec3 offsetNormal ) {
	if ( uSpotOn < 0.5 ) return 0.0;
	vec3 L = uSpotPos - P;
	float distance = length( L );
	if ( distance >= 1500.0 ) return 0.0;
	float cosS = dot( - L / max( distance, 1.0 ), uSpotDir );
	float cone = smoothstep( uSpotCone.x, uSpotCone.y, cosS ) * mix( 0.62, 1.0, smoothstep( uSpotCone.y, 0.995, cosS ) );
	if ( cone <= 0.0 ) return 0.0;
	float fall = 1.0 / ( 1.0 + distance * distance / ( 280.0 * 280.0 ) );
	fall *= 1.0 - smoothstep( 800.0, 1500.0, distance );
 if(uSpotWorldShadowOn>.5){vec3 receiver=(uViewInv*vec4(P+offsetNormal*.1,1.)).xyz;return fall*cone*spotWorldVisibility(receiver);}
	float visibility = 0.0;
	for ( int k = 0; k < RELIGHT_STEPS; k ++ ) {
		float fraction = ( float( k ) + 0.5 ) / float( RELIGHT_STEPS );
		vec3 Q = mix( P + offsetNormal * 2.0, uSpotPos, fraction * 0.95 );
		if ( Q.z > - uNear ) { visibility += 1.0; continue; }
		vec4 clip = uProj * vec4( Q, 1.0 );
		vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
		if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) { visibility += 1.0; continue; }
		visibility += sceneDist( uv ) < ( - Q.z ) - ( 5.0 + 0.012 * ( - Q.z ) ) ? 0.0 : 1.0;
	}
	visibility /= float( RELIGHT_STEPS );
 vec3 receiverWorld=(uViewInv*vec4(P+offsetNormal,1.)).xyz;
 return fall*cone*visibility*visibility*spotWorldVisibility(receiverWorld);
}

vec3 depthSurfaceNormal( vec2 uv, vec3 P ) {
	vec3 Pl = viewPosAt( uv - vec2( uTexel.x, 0.0 ) );
	vec3 Pr = viewPosAt( uv + vec2( uTexel.x, 0.0 ) );
	vec3 Pd = viewPosAt( uv - vec2( 0.0, uTexel.y ) );
	vec3 Pu = viewPosAt( uv + vec2( 0.0, uTexel.y ) );
	vec3 dx = abs( Pr.z - P.z ) < abs( P.z - Pl.z ) ? Pr - P : P - Pl;
	vec3 dy = abs( Pu.z - P.z ) < abs( P.z - Pd.z ) ? Pu - P : P - Pd;
	vec3 N = normalize( cross( dx, dy ) );
	return dot( N, P ) > 0.0 ? - N : N;
}

float surfaceCarveAO( float tag ) {
	return tag >= 0.1 && tag < 0.5 ? clamp( ( tag - 0.1 ) / 0.39, 0.08, 1.0 ) : 1.0;
}

// SSR reads the pre-deferred scene. Shade valid opaque reflected receivers
// with the same material/lighting policy, once AFTER a successful ray hit.
// Rank up to eight incident candidates, shadow only the strongest three.
vec3 litReflectionAt( vec2 uv ) {
	vec3 scene = texture2D( tScene, uv ).rgb;
	if ( uLighting < 0.5 || ( uCount == 0 && uSpotOn < 0.5 ) || texture2D( tDepth, uv ).x >= 0.99999 ) return scene+powerupEmissionAt(uv);
	vec4 g = texture2D( tNormal, uv ), base = texture2D( tAlbedo, uv );
	if ( g.a < - 0.5 || base.a < 0.05 ) return scene+powerupEmissionAt(uv);
	float carveAO = surfaceCarveAO( base.a );
	vec3 P = viewPosAt( uv );
	if ( - P.z < 8.0 ) return scene+powerupEmissionAt(uv);
	// A flashlight-only miss needs no receiver reconstruction.
	if ( uCount == 0 && dot( normalize( P - uSpotPos ), uSpotDir ) <= uSpotCone.x ) return scene+powerupEmissionAt(uv);
	vec3 Ng = depthSurfaceNormal( uv, P );
	// Transparent overlays may leave a blended normal from another depth.
	vec3 N = abs( g.a + P.z ) < 0.025 * ( - P.z ) + 1.0 ? normalize( g.rgb * 2.0 - 1.0 ) : Ng;
	if ( dot( N, P ) > 0.0 ) N = - N;
	vec3 Nl = normalize( mix( Ng, N, receiverReliefNormalMix(uv,uBumpLight) ) );
	int first = - 1, second = - 1, third = - 1;
	float scoreA = 0.0, scoreB = 0.0, scoreC = 0.0;
	for ( int i = 0; i < ${MAX_VOLUME_LIGHTS}; i ++ ) {
		if ( i >= uCount ) break;
		float score = dot( pointSurfaceIncident( P, Nl, i ), vec3( 0.2126, 0.7152, 0.0722 ) );
		if ( score > scoreA ) { third = second; scoreC = scoreB; second = first; scoreB = scoreA; first = i; scoreA = score; }
		else if ( score > scoreB ) { third = second; scoreC = scoreB; second = i; scoreB = score; }
		else if ( score > scoreC ) { third = i; scoreC = score; }
	}
	vec3 relit = vec3( 0.0 ), flash = vec3( 0.0 );
 float visibleWeight=0.,shadowedWeight=0.;
	for ( int k = 0; k < 3; k ++ ) {
		int index = k == 0 ? first : ( k == 1 ? second : third );
		if ( index < 0 ) continue;
		vec3 reached=pointSurfaceIncident(P,Nl,index)*pointSurfaceVisibility(P,Ng,index);
  float localShadow=receiverHeightVisibility(P,uv,index),weight=dot(reached,vec3(.2126,.7152,.0722));
  visibleWeight+=weight;shadowedWeight+=weight*localShadow;
  vec3 light=reached*localShadow;
		relit += light; flash += light * uLightAdd[ index ];
	}
	vec3 colour = scene * ( 1.0 + relit * carveAO ) + ( relit * uLightFloor * base.rgb + flash * ( base.rgb * 0.3 + scene * 0.6 ) ) * carveAO;
	if ( uSpotOn > 0.5 ) {
		float facing = max( dot( Nl, normalize( uSpotPos - P ) ), 0.0 );
		if(facing>0.){
   float worldBeam=flashlightIrradiance(P,Ng),localShadow=receiverHeightVisibility(P,uv,9);
   float weight=dot(uSpotCol,vec3(.2126,.7152,.0722))*facing*worldBeam;
   visibleWeight+=weight;shadowedWeight+=weight*localShadow;
   colour+=base.rgb*uSpotCol*1.15*facing*worldBeam*localShadow*carveAO;
  }
	}
	return colour*receiverRockContrast(P,uv,shadowedWeight,visibleWeight)+powerupEmissionAt(uv);
}

// Dielectric GGX glint from the live shoulder light. Its normal is the same
// ripple normal used by environment reflection, with no diffuse grey lift.
float waterFlashlightSpecular( vec3 P, vec3 N, vec3 V ) {
	vec3 L = normalize( uSpotPos - P );
	float nl = max( dot( N, L ), 0.0 ), nv = max( dot( N, V ), 0.0 );
	if ( nl <= 0.0 || nv <= 0.0 ) return 0.0;
	vec3 H = normalize( L + V );
	float nh = max( dot( N, H ), 0.0 ), vh = max( dot( V, H ), 0.0 );
	const float alpha = 0.08;
	float denominator = nh * nh * ( alpha * alpha - 1.0 ) + 1.0;
	float distribution = alpha * alpha / ( 3.141593 * denominator * denominator );
	float masking = nl / ( nl * ( 1.0 - alpha * 0.5 ) + alpha * 0.5 )
		* nv / ( nv * ( 1.0 - alpha * 0.5 ) + alpha * 0.5 );
	float fresnel = 0.02 + 0.98 * pow( 1.0 - vh, 5.0 );
	return min( distribution * masking * fresnel / max( 4.0 * nv, 0.001 ), 8.0 );
}

// Crossing capillary ripples share world coordinates across every face of a
// pool. The derivative of wave height bends reflections and refraction alike.
// Fade wavelengths smaller than a few scene pixels to avoid distant sparkle.
vec3 waterRippleNormal( vec2 p, float distance, float look ) {
	float time = uTime * liquidSpeed( look );
	float footprint = distance * 2.0 * uTexel.y / max( uProj[ 1 ][ 1 ], 0.2 );
	vec2 slope = vec2( 0.0 );
	vec2 a = vec2( 0.8, 0.6 );
	vec2 b = vec2( - 0.45, 0.893 );
	vec2 c = vec2( 0.933, - 0.36 );
	slope += a * 0.055 * cos( dot( p, a ) * 0.07 + time * 0.8 ) * ( 1.0 - smoothstep( 9.0, 36.0, footprint ) );
	slope += b * 0.015 * cos( dot( p, b ) * 0.145 - time * 1.2 ) * ( 1.0 - smoothstep( 4.0, 17.0, footprint ) );
	slope += c * 0.009 * ( look > 1.5 && look < 2.5 ? 0.35 : 0.65 ) * cos( dot( p, c ) * 0.29 + time * 1.8 ) * ( 1.0 - smoothstep( 2.0, 8.0, footprint ) );
	// Keep moving reflection definition without a faceted/prismatic surface.
	return normalize( vec3( - slope * liquidRipple( look ) * 0.65, 1.0 ) );
}

// Bend the submerged scene before its albedo, normals and deferred lighting
// are sampled. A depth/region guide rejects the weapon, dry banks and portals,
// so their colours cannot bleed into the pool at its edge. No extra draw pass.
vec2 waterRefractionUv( vec2 uv ) {
	if ( uWaterCount == 0 || texture2D( tNormal, uv ).a < - 0.5 ) return uv;
	float rawDepth = texture2D( tDepth, uv ).x;
	bool sky = rawDepth >= 0.99999;
	vec3 P = viewPosAt( uv );
	vec3 cam = uViewInv[ 3 ].xyz;
	vec3 hit = ( uViewInv * vec4( P, 1.0 ) ).xyz;
	vec3 ray = normalize( hit - cam );
	if ( abs( ray.z ) < 0.001 ) return uv;
	for ( int i = 0; i < ${MAX_LIQUID_REGIONS}; i ++ ) {
		if ( i >= uWaterCount ) break;
		vec4 lo = uWaterMin[ i ];
		vec4 hi = uWaterMax[ i ];
		bool below = uUnderwater > 0.5 && cam.z < lo.z && cam.z > lo.z - 900.0 && cam.x > lo.x && cam.x < hi.x && cam.y > lo.y && cam.y < hi.y;
		if ( below ) {
			if ( ray.z <= 0.001 || ( ! sky && hit.z <= lo.z + 0.5 ) ) continue;
		} else if ( sky || cam.z <= lo.z || ray.z >= - 0.001 || hit.z >= lo.z - 0.5 ) continue;
		float tp = ( lo.z - cam.z ) / ray.z;
		vec3 hp = cam + ray * tp;
		float shore = min( min( hp.x - lo.x, hi.x - hp.x ), min( hp.y - lo.y, hi.y - hp.y ) );
		if ( tp <= 0.0 || shore <= 0.0 || tp >= length( hit - cam ) ) continue;
		vec3 n = waterRippleNormal( hp.xy, tp, hi.w ) * ( below ? - 1.0 : 1.0 );
		vec3 bent = refract( ray, n, below ? 1.333 : 1.0 / 1.333 );
		// Outside the underwater Snell window there is no transmitted ray.
		if ( dot( bent, bent ) < 0.0001 ) return uv;
		float depth = min( abs( lo.z - hit.z ), 192.0 );
		vec3 target = hp + bent * ( depth / max( abs( bent.z ), 0.1 ) );
		vec3 straight = hp + ray * ( depth / max( abs( ray.z ), 0.1 ) );
		mat3 toView = transpose( mat3( uViewInv ) );
		vec4 qb = uProj * vec4( toView * ( target - cam ), 1.0 );
		vec4 qs = uProj * vec4( toView * ( straight - cam ), 1.0 );
		vec2 offset = ( qb.xy / qb.w - qs.xy / qs.w ) * 0.5;
		// Refraction is a restrained visual offset, while physical IOR still owns
		// the underwater Snell window and total internal reflection.
		vec2 limit = vec2( 0.004 * uProj[ 0 ][ 0 ] / uProj[ 1 ][ 1 ], 0.004 );
		vec2 candidate = uv + clamp( offset * 0.35, - limit, limit ) * smoothstep( 0.0, 6.0, shore ) * liquidRefraction( hi.w );
		if ( any( lessThan( candidate, vec2( 0.0 ) ) ) || any( greaterThan( candidate, vec2( 1.0 ) ) ) ) return uv;
		if ( texture2D( tNormal, candidate ).a < - 0.5 ) return uv;
		bool candidateSky = texture2D( tDepth, candidate ).x >= 0.99999;
		if ( candidateSky && ( ! below || ! sky ) ) return uv;
		vec3 checkHit = ( uViewInv * vec4( viewPosAt( candidate ), 1.0 ) ).xyz;
		if ( below ) {
			if ( checkHit.z <= lo.z + 0.5 ) return uv;
			vec3 candidateRay = normalize( checkHit - cam );
			if ( candidateRay.z <= 0.001 ) return uv;
			float candidateDistance = ( lo.z - cam.z ) / candidateRay.z;
			vec3 candidateSurface = cam + candidateRay * candidateDistance;
			if ( candidateDistance <= 0.0 || candidateDistance >= length( checkHit - cam )
				|| candidateSurface.x <= lo.x || candidateSurface.x >= hi.x || candidateSurface.y <= lo.y || candidateSurface.y >= hi.y ) return uv;
			if ( sky && ! candidateSky ) return uv;
		} else if ( checkHit.z >= lo.z - 0.5 || checkHit.x < lo.x || checkHit.x > hi.x || checkHit.y < lo.y || checkHit.y > hi.y ) return uv;
		return candidate;
	}
	return uv;
}

// Keep normal-incidence clarity, but broaden the above-water grazing response
// for the reference's visible surface. From below use water-to-air dielectric
// Fresnel, including total internal reflection outside the ~49-degree window.
float waterInterfaceReflectance( float cosine, bool below ) {
	float c = clamp( cosine, 0.0, 1.0 );
	if ( ! below ) return 0.02 + 0.98 * pow( 1.0 - c, 2.5 );
	const float eta = 1.333;
	float transmittedSin2 = eta * eta * ( 1.0 - c * c );
	if ( transmittedSin2 >= 1.0 ) return 1.0;
	float ct = sqrt( max( 0.0, 1.0 - transmittedSin2 ) );
	float rs = ( eta * c - ct ) / max( eta * c + ct, 0.0001 );
	float rp = ( eta * ct - c ) / max( eta * ct + c, 0.0001 );
	return ( rs * rs + rp * rp ) * 0.5;
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

// what a pool's probe (a cube map taken from above the pool) shows in the direction a ray goes, the picture treated as
// having been taken in a box round the pool (so a wall at its edge is where the wall is)
vec3 probeColor( int which, vec3 hp, vec3 rW ) {
	vec3 rd = rW + vec3( 1e-5 );
	vec3 first = ( uProbeMax[ which ] - hp ) / rd;
	vec3 second = ( uProbeMin[ which ] - hp ) / rd;
	vec3 farT = max( first, second );
	float dist = min( min( farT.x, farT.y ), farT.z );
	vec3 dir = normalize( hp + rW * max( dist, 0.0 ) - uProbeCenter[ which ] );
	return which == 0 ? textureCube( tProbeA, dir ).rgb : textureCube( tProbeB, dir ).rgb;
}

// Ineligible depth is empty space for an SSR crossing, including the floor
// beneath an above-water ray. Each query uses one existing depth sample.
float reflectionDistanceAt( vec2 uv, bool below, vec4 lo, vec4 hi ) {
	if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return 1e6;
	float depth = texture2D( tDepth, uv ).x;
 if(heldReceiver(texture2D(tNormal,uv)))return 1e6;
	if ( depth >= 0.99999 ) return 1e6;
	vec4 decoded = uProjInv * vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
	vec3 P = decoded.xyz / decoded.w;
	if ( - P.z < 8.0 ) return 1e6;
	vec3 world = ( uViewInv * vec4( P, 1.0 ) ).xyz;
	if ( below ) {
		if ( world.z >= lo.z || world.x < lo.x || world.x > hi.x || world.y < lo.y || world.y > hi.y ) return 1e6;
	} else if ( world.z < lo.z - 0.5 ) return 1e6;
	return - P.z;
}

void main() {
	vec2 uvd = vUv;
	float jit0 = noise( gl_FragCoord.xy );
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
	// Heat haze: over a pool of lava the air shimmers, and whatever is seen through that column of air wobbles.  Each
	// pool is a box from its surface up; the longer the sight line runs through it, the more the picture is bent.
	if ( uLavaCount > 0 && uHeat > 0.0 && !heldReceiver(texture2D(tNormal,uvd)) ) {
		float d0 = texture2D( tDepth, uvd ).x;
		vec4 r0 = uProjInv * vec4( uvd * 2.0 - 1.0, 1.0, 1.0 );
		vec3 dv0 = normalize( r0.xyz / r0.w );
		float D0 = d0 >= 0.99999 ? uMaxRay : min( - perspectiveDepthToViewZ( d0, uNear, uFar ) / max( - dv0.z, 0.05 ), uMaxRay );
		vec3 cam0 = uViewInv[ 3 ].xyz;
		vec3 dw0 = mat3( uViewInv ) * dv0;
		vec3 inv0 = 1.0 / ( dw0 + vec3( 1e-6 ) );
		vec2 wob = vec2( 0.0 );
		for ( int i = 0; i < 4; i ++ ) {
			if ( i >= uLavaCount ) break;
			vec4 lo = uLavaMin[ i ];
			vec4 hi = uLavaMax[ i ];
			vec3 bmin = vec3( lo.xy - 48.0, lo.z );
			vec3 bmax = vec3( hi.xy + 48.0, lo.z + 150.0 );
			vec3 t1 = ( bmin - cam0 ) * inv0;
			vec3 t2 = ( bmax - cam0 ) * inv0;
			vec3 tn = min( t1, t2 );
			vec3 tf = max( t1, t2 );
			float tIn = max( max( tn.x, tn.y ), max( tn.z, 0.0 ) );
			float tOut = min( min( tf.x, tf.y ), min( tf.z, D0 ) );
			if ( tOut > tIn ) {
				float len = clamp( ( tOut - tIn ) / 170.0, 0.0, 1.0 );
				vec3 mid = cam0 + dw0 * ( 0.5 * ( tIn + tOut ) );
				// rising, rippling columns of warm air
				float up = mid.z * 0.11 - uTime * 3.4;
				wob += vec2( sin( up + mid.x * 0.06 ) + 0.5 * sin( up * 1.7 + mid.y * 0.09 ),
					cos( up * 0.8 + mid.y * 0.05 ) ) * len * 0.5 * smoothstep( lo.z + 150.0, lo.z + 30.0, mid.z );
			}
		}
		uvd += wob * vec2( 1.0, 0.7 ) * 0.0055 * uHeat;
	}
	uvd = waterRefractionUv( uvd );
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
 if(heldReceiver(texture2D(tNormal,uvd)))D=receiverDistance(texture2D(tNormal,uvd))/max(-dirV.z,.05);

	vec3 c = scene;
	vec3 Nw = vec3( 0.0, 0.0, 1.0 );
	float spotMask = 0.0;
	float creaseK = 1.0; // the corner accent, applied after the liquids (which switch it off below their surface)

	// Direct light from the sun and the nearby lights, applied to what the
	// classic lightmaps already put on the surface.
	// alpha < 0 in the normal buffer marks a window onto another level: leave it as drawn
	if ( d < 0.99999 && ( texture2D( tNormal, uvd ).a > - 0.5 || heldReceiver(texture2D(tNormal,uvd)) ) ) {
		vec3 P = viewPosAt( uvd );
		vec3 N;
		vec4 g = texture2D( tNormal, uvd );
		float here = - P.z;
		if ( (heldReceiver(g)||actorReceiver(texture2D(tAlbedo,uvd).a)||here>8.0) && abs( receiverDistance(g) - here ) < 0.025 * here + 1.0 ) {
			// the surface's own (normal-mapped) normal, written while it was drawn
			N = normalize( g.rgb * 2.0 - 1.0 );
			if ( dot( N, P ) > 0.0 ) N = - N;
		} else {
			// other geometry: the normal of the depth surface
			N = depthSurfaceNormal( uvd, P );
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
		bool actor=actorReceiver(texture2D(tAlbedo,uvd).a);
  bool glass=glassReceiver(texture2D(tAlbedo,uvd).a);
  if(actor)Ng=N;
  vec3 Nl = actor||glass?N:normalize( mix( Ng, N, receiverReliefNormalMix(uvd,uBumpLight) ) );

		if ( uLighting > 0.5 ) {
			vec4 base = texture2D( tAlbedo, uvd );
			// 0 is unavailable, .1.. .49 carries carving AO, .51..1 carries
			// rock sun visibility. Ordinary opaque pixels remain at 1.
			float rockSunVisibility = heightMaskValid(uvd) ? receiverHeightVisibility(P,uvd,8) : ( glass ? 1.0 : ( base.a > 0.5 ? clamp( ( base.a - 0.51 ) / 0.49, 0.0, 1.0 ) : 1.0 ) );
			float carveAO = surfaceCarveAO( base.a );
			vec3 relit = vec3( 0.0 );
   float visibleReliefWeight=0.,shadowedReliefWeight=0.;
			vec3 surfaceSpecular=vec3(0.);
   float film=glass?1.:(actor&&base.a>.07?uActorWet*uActorWet:0.);
   vec3 V=normalize(-P);
   vec3 flashAdd = vec3( 0.0 ); // light from a muzzle flash, which shows even on a dark surface

			if ( uSunOn > 0.5 ) {
				float ndl = max( dot( Nl, uSunDirV ), 0.0 );
				if ( ndl > 0.0 ) {
					vec3 pw = ( uViewInv * vec4( P + Ng * 1.5, 1.0 ) ).xyz;
					float sunVisibility=actor?min(sunLitSoft(pw),nearSunVisibility((uViewInv*vec4(P,1.)).xyz+Nw*.08)):sunLitSoft(pw);
     vec3 incidentSun=uSunSurfaceCol*uSunSurface*ndl*sunVisibility*skyCookieRGB(pw);
     float sunWeight=dot(incidentSun,vec3(.2126,.7152,.0722));
     visibleReliefWeight+=sunWeight;shadowedReliefWeight+=sunWeight*rockSunVisibility;
     relit+=incidentSun*rockSunVisibility;
     if(film>0.)surfaceSpecular+=uSunSurfaceCol*pow(max(dot(Nl,normalize(uSunDirV+V)),0.),glass?24.:48.)*sunVisibility*skyCookieRGB(pw)*rockSunVisibility;
				}
			}

			float jit = noise( gl_FragCoord.xy );
			for ( int i = 0; i < ${MAX_VOLUME_LIGHTS}; i ++ ) {
				if ( i >= uCount ) break;
				vec3 incident = pointSurfaceIncident( P, Nl, i );
				if ( dot( incident, vec3( 1.0 ) ) <= 0.0 ) continue;
				vec3 reached=incident*pointSurfaceVisibility(P,Ng,i,actor?.1:1.);
    float localShadow=receiverHeightVisibility(P,uvd,i),weight=dot(reached,vec3(.2126,.7152,.0722));
    visibleReliefWeight+=weight;shadowedReliefWeight+=weight*localShadow;
    vec3 lightHere=reached*localShadow;
				relit += lightHere;
    if(film>0.)surfaceSpecular+=uLightCol[i].rgb*pointCone(P,i)*pow(max(dot(Nl,normalize(normalize(uLightPos[i].xyz-P)+V)),0.),glass?24.:48.)*pointSurfaceVisibility(P,Ng,i,actor?.1:1.)*localShadow*pow(max(0.,1.-length(uLightPos[i].xyz-P)/uLightCol[i].a),2.);
				flashAdd += lightHere * uLightAdd[ i ];
			}

			// A real source can light a surface even when its baked light is zero.
			vec3 spot = vec3( 0.0 );
			if ( uSpotOn > 0.5 ) {
				vec3 Ls = uSpotPos - P;
				float sndl = max( dot( Nl, normalize( Ls ) ), 0.0 );
				if ( sndl > 0.0 ) {
					float worldBeam=flashlightIrradiance(P,Ng),localShadow=receiverHeightVisibility(P,uvd,9);
     float beam=worldBeam*localShadow,weight=dot(uSpotCol,vec3(.2126,.7152,.0722))*sndl*worldBeam;
     visibleReliefWeight+=weight;shadowedReliefWeight+=weight*localShadow;
					spot = uSpotCol * sndl * beam;
     if(film>0.)surfaceSpecular+=uSpotCol*pow(max(dot(Nl,normalize(normalize(Ls)+V)),0.),glass?24.:48.)*beam;
					spotMask = clamp( sndl * beam * 1.6, 0.0, 1.0 );
				}
			}

			// Read the actual unlit material colour. The lit scene has lost it where
			// the baked lighting is zero; a neutral grey lift cannot reconstruct it.
			vec3 albedo = base.a > 0.05 ? base.rgb : scene;
			// Bounce light.  What a surface sees of its neighbours on the screen lights it a little: each of a handful of
			// points round it (out to about 150 units) gives the light it is sending this way, if the two face each
			// other, less with distance; and the receiver's own colour tints it (a red wall casts red on the floor, and
			// a lit patch of floor lights the wall above it).  This is what stops the places no lamp reaches from being
			// flat black, and why a room round a bright light glows with its colour.
			vec3 bounce = vec3( 0.0 );
			if ( uBounce > 0.0 ) {
				const int BOUNCE_SAMPLES = 16;
				float rad = clamp( 150.0 * uProj[ 0 ][ 0 ] * 0.5 / max( here, 8.0 ), 0.01, 0.22 );
				float aspect = uTexel.y / uTexel.x;
    // Fixed sampling avoids pixel-random low-light speckle and camera crawl.
				float turn = 0.0;
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
					// Coplanar/back-facing neighbours transfer no light. Their three
					// HDR colour reads and beam estimate cannot change the result.
					if ( w <= 0.0 ) continue;
					// what that point is sending: its lit colour, and the flashlight's light on it (the beam is added after
					// this picture, so estimate it with its physical source shadow)
					float beamS = 0.0;
					if ( uSpotOn > 0.5 ) {
						vec3 sn = normalize( uSpotPos - Ps );
      beamS = max(dot(Ns,sn),0.) * flashlightIrradiance(Ps,Ns);
					}
					// a lamp or flame is far brighter than the wall round it, and one lucky sample on it showed as a speckle of dots
					// on the wall: what a point sends is squashed (so a flame is a few times a wall, not a hundred), and
					// averaged over a few neighbouring texels
					vec2 ob = uTexel * 3.0;
					vec3 src = ( texture2D( tScene, uvs ).rgb * 2.0 + texture2D( tScene, uvs + ob ).rgb + texture2D( tScene, uvs - ob ).rgb ) * 0.25;
					if ( beamS > 0.0 ) {
						vec4 sourceBase = texture2D( tAlbedo, uvs );
						if ( sourceBase.a > 0.05 ) src += sourceBase.rgb * uSpotCol * 1.15 * beamS * surfaceCarveAO( sourceBase.a ) * receiverHeightVisibility(Ps,uvs,9);
					}
					bounce += src / ( 1.0 + 0.9 * max( src.r, max( src.g, src.b ) ) ) * w;
				}
				bounce *= uBounce * 22.0 / float( BOUNCE_SAMPLES );
			}
			vec3 receiver = albedo * 0.55;
			c = actor ? scene + albedo*(relit*.55+spot*1.15+flashAdd*.3+bounce*.55)+surfaceSpecular*film*.16 : scene * ( 1.0 + relit * carveAO ) + ( bounce * receiver + relit * uLightFloor * albedo + spot * albedo * 1.15 + flashAdd * ( 0.3 * albedo + scene * 0.6 ) ) * carveAO;

   if(glass)c+=surfaceSpecular*.12;
   c*=receiverRockContrast(P,uvd,shadowedReliefWeight,visibleReliefWeight);

			// what the beam hits is not just brighter, it is richer: colour and contrast rise with it
			if ( spotMask > 0.0 ) {
				float ls = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
				c = mix( vec3( ls ), c, 1.0 + 0.2 * spotMask );
				c *= 1.0 + 0.08 * spotMask;
			}

		} // advanced lighting

		// corners and edges
		if ( uEdge > 0.0 && !actorReceiver(texture2D(tAlbedo,uvd).a) ) creaseK = creaseAccent( P, normalize( cross( dxG, dyG ) ) * ( dot( normalize( cross( dxG, dyG ) ), P ) > 0.0 ? - 1.0 : 1.0 ) );
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
			float look = hi.w;
			bool toxic = look > 2.5;
			vec3 bmin = vec3( lo.xy, top - 900.0 );
			vec3 bmax = vec3( hi.xy, top );

			vec3 t1 = ( bmin - camW ) * inv;
			vec3 t2 = ( bmax - camW ) * inv;
			vec3 tn = min( t1, t2 );
			vec3 tf = max( t1, t2 );
			float tEnter = max( max( tn.x, tn.y ), max( tn.z, 0.0 ) );
			float tExit = min( min( tf.x, tf.y ), min( tf.z, D ) );
			bool muddy = look > 1.5 && look < 2.5;
			// A bounded, low sediment layer borrows real incident light. It is
			// optical scattering, not Toxic's additive particles or emission.
			float sedimentLight = 0.0, sedimentPath = 0.0;
			if ( muddy && camW.z > top && texture2D( tNormal, uvd ).a > - 0.5 ) {
				vec3 fogMin = vec3( lo.xy, top ), fogMax = vec3( hi.xy, top + 18.0 );
				vec3 f1 = ( fogMin - camW ) * inv, f2 = ( fogMax - camW ) * inv;
				vec3 fn = min( f1, f2 ), ff = max( f1, f2 );
				float enter = max( max( fn.x, fn.y ), max( fn.z, 0.0 ) );
				float exit = min( min( ff.x, ff.y ), min( ff.z, D ) );
				if ( exit > enter ) {
					vec3 sampleW = camW + dirW * ( enter + exit ) * 0.5;
					vec3 sampleV = transpose( mat3( uViewInv ) ) * ( sampleW - camW );
					vec3 up = transpose( mat3( uViewInv ) ) * vec3( 0.0, 0.0, 1.0 );
					float strongest = 0.0; int source = - 1;
					if ( uLighting > 0.5 ) for ( int j = 0; j < ${MAX_VOLUME_LIGHTS}; j ++ ) {
						if ( j >= uCount ) break;
						float value = dot( pointSurfaceIncident( sampleV, up, j ), vec3( 0.2126, 0.7152, 0.0722 ) );
						if ( value > strongest ) { strongest = value; source = j; }
					}
					if ( source >= 0 ) sedimentLight = strongest * pointSurfaceVisibility( sampleV, up, source );
					float margin = min( min( sampleW.x - lo.x, hi.x - sampleW.x ), min( sampleW.y - lo.y, hi.y - sampleW.y ) );
					sedimentPath = min( exit - enter, 240.0 ) * smoothstep( 0.0, 12.0, margin );
				}
			}

			vec3 transmittedReceiver = c;
			if ( tExit > tEnter ) {
				vec3 sigma = liquidAbsorption( look );
				float received = max( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0 );
				if ( look > 1.5 && look < 2.5 ) {
					// Sediment scatters a low-frequency light field, not the floor's
					// texture. Bounded taps remain below this pool and reject banks,
					// sky and live portals; reflection is composed afterward.
					float softLight = dot( scene, vec3( 0.2126, 0.7152, 0.0722 ) ), weight = 1.0;
					for ( int tap = 0; tap < 4; tap ++ ) {
						float angle = float( tap ) * 1.570796;
						vec2 uv = clamp( uvd + vec2( cos( angle ), sin( angle ) ) * uTexel * 14.0, uTexel, vec2( 1.0 ) - uTexel );
						// Pair radiance with the exact depth texel being classified.
						// Linear colour filtering must not leak a dry marker into fog.
						uv = ( floor( uv / uTexel ) + 0.5 ) * uTexel;
						if ( texture2D( tDepth, uv ).x >= 0.99999 || texture2D( tNormal, uv ).a < - 0.5 ) continue;
						vec3 point = ( uViewInv * vec4( viewPosAt( uv ), 1.0 ) ).xyz;
						if ( point.z >= top - 0.5 || point.x < lo.x || point.x > hi.x || point.y < lo.y || point.y > hi.y ) continue;
						softLight += dot( texture2D( tScene, uv ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) ); weight += 1.0;
					}
					float direct = max( received - dot( scene, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0 );
					received = max( softLight / weight + direct, sedimentLight * 0.45 );
				}
				vec3 T = exp( - sigma * ( tExit - tEnter ) );
				transmittedReceiver = c * T;
				// Ordinary water scatters received light. Toxic liquid alone emits.
				c = c * T + ( liquidScatter( look ) * received + liquidEmission( look ) ) * ( 1.0 - T );
			}

			// Caustics modulate transmitted receivers, never reflected walls.
			if ( d < 0.99999
				&& hitW.x > bmin.x && hitW.x < bmax.x && hitW.y > bmin.y && hitW.y < bmax.y
				&& hitW.z > bmin.z && hitW.z < top + 2.0 ) {
				float depth = top - hitW.z;
				vec2 plane = abs( Nw.z ) > 0.5 ? hitW.xy : ( abs( Nw.x ) > abs( Nw.y ) ? hitW.yz : hitW.xz );
				float cs = caustic( plane * 0.0045, uTime * 0.6 );
				float facing = 0.06 + 0.94 * smoothstep( 0.3, 0.9, Nw.z ); // on floors, not the walls
				float fade = exp( - depth / 420.0 ) * smoothstep( 6.0, 40.0, depth );
				vec3 glow = toxic ? vec3( 0.35, 1.0, 0.16 ) : vec3( 1.0 );
				// Sediment itself must not acquire the floor's caustic pattern.
				// Only the transmitted Muddy receiver carries it, fading with path.
				c += ( muddy ? transmittedReceiver : c ) * glow * cs * uCaustic * facing * fade * liquidCaustic( look );
			}

			// Reflection: water gives back the picture of what is above it, more at a low angle than looking straight down.
			// The reflected ray is marched across the screen against what is already drawn.
			bool belowSurface = uUnderwater > 0.5 && camW.z < top && camW.z > top - 900.0 && camW.x > lo.x && camW.x < hi.x && camW.y > lo.y && camW.y < hi.y;
			bool towardSurface = belowSurface ? dirW.z > 0.001 : camW.z > top && dirW.z < - 0.001;
			if ( ( uReflect > 0.0 || uSpotOn > 0.5 ) && towardSurface && texture2D( tNormal, uvd ).a > - 0.5 ) {
				float tp = ( top - camW.z ) / dirW.z;
				vec3 hp = camW + dirW * tp;
				if ( tp > 0.0 && tp < ( belowSurface ? D - 0.25 : D + 2.0 ) && hp.x > lo.x && hp.x < hi.x && hp.y > lo.y && hp.y < hi.y ) {
					vec3 nW = waterRippleNormal( hp.xy, tp, hi.w ) * ( belowSurface ? - 1.0 : 1.0 );
					float edge = smoothstep( 0.0, 6.0, min( min( hp.x - lo.x, hi.x - hp.x ), min( hp.y - lo.y, hi.y - hp.y ) ) );
					mat3 toView = transpose( mat3( uViewInv ) );
					vec3 hv = toView * ( hp - camW );
					vec3 surfaceLight = vec3( 0.0 );
					if ( uSpotOn > 0.5 ) {
						vec3 Nv = toView * nW;
						float specular = waterFlashlightSpecular( hv, Nv, normalize( - hv ) );
						if ( specular > 0.0 ) surfaceLight = uSpotCol * specular * flashlightIrradiance( hv, Nv ) * edge;
					}
					if ( uReflect > 0.0 ) {
						vec3 rW = reflect( dirW, nW );
						vec3 rv = toView * rW;
						// nothing found on the screen: what the pool's probe shows (or a dark sky if it has none yet)
						int pr = uProbeOf[ i ];
						vec3 fallback = vec3( 0.0 );
						// Existing probes are captured above the pool. An internal fallback
						// may only look DOWN at captured submerged radiance, never up at sky.
						if ( pr >= 0 && ( ! belowSurface || rW.z < - 0.001 ) ) {
							fallback = probeColor( pr, hp, rW );
							if ( look > 1.5 && look < 2.5 ) {
								vec3 spread = vec3( 0.035, 0.0, 0.0 );
								fallback = fallback * 0.6 + ( probeColor( pr, hp, normalize( rW + spread ) ) + probeColor( pr, hp, normalize( rW - spread ) ) ) * 0.2;
							}
						}
						vec3 refl = fallback;
						float found = 0.0;
						bool refinedCrossing = false;
						float stepLen = 10.0;
						vec3 pv = hv + rv * 6.0 * ( 0.6 + 0.8 * jit0 );
						float previousGap = - 1e6;
						if ( uScreenReflect > 0.0 && pv.z <= - uNear ) {
							vec4 initial = uProj * vec4( pv, 1.0 );
							previousGap = - pv.z - reflectionDistanceAt( initial.xy / initial.w * 0.5 + 0.5, belowSurface, lo, hi );
						}
						if ( uScreenReflect > 0.0 ) for ( int k = 0; k < 28; k ++ ) {
							vec3 previous = pv;
							float gapBefore = previousGap;
							pv += rv * stepLen;
							stepLen *= 1.16;
							if ( pv.z > - uNear ) break;
							vec4 cq = uProj * vec4( pv, 1.0 );
							vec2 uvq = cq.xy / cq.w * 0.5 + 0.5;
							if ( uvq.x < 0.0 || uvq.x > 1.0 || uvq.y < 0.0 || uvq.y > 1.0 ) break;
							float dq = texture2D( tDepth, uvq ).x;
							if ( dq >= 0.99999 ) {
								// Internal reflection stays in water: an above-sky hit is invalid.
								if ( belowSurface ) break;
								refl = mix( fallback, texture2D( tScene, uvq ).rgb, uScreenReflect );
								found = 1.0;
								break;
							}
							vec3 qView = viewPosAt( uvq );
							if ( - qView.z < 8.0 ) break; // viewmodel's special depth range is not reflected geometry
							float gap = - pv.z + qView.z;
							vec3 coarseWorld = ( uViewInv * vec4( qView, 1.0 ) ).xyz;
							bool eligible = belowSurface ? coarseWorld.z < top && coarseWorld.x >= lo.x && coarseWorld.x <= hi.x && coarseWorld.y >= lo.y && coarseWorld.y <= hi.y : coarseWorld.z >= top - 0.5;
							previousGap = eligible ? gap : - 1e6;
							if ( ! eligible ) { if ( belowSurface ) break; else continue; }
							if ( gap > 0.0 && gap < 60.0 + stepLen ) {
								if ( gapBefore > 0.0 ) continue; // no front-to-back crossing
								// Resolve the crossing before reading colour: the coarse
								// step can jump past a narrow lamp onto the wall behind it.
								// At most five extra depth taps for this entire reflected ray.
								if ( ! refinedCrossing ) {
									refinedCrossing = true;
									vec3 before = previous, after = pv;
									for ( int refine = 0; refine < 5; refine ++ ) {
										vec3 middle = ( before + after ) * 0.5;
										vec4 clip = uProj * vec4( middle, 1.0 );
										vec2 sampleUv = clip.xy / clip.w * 0.5 + 0.5;
										if ( middle.z > - uNear || any( lessThan( sampleUv, vec2( 0.0 ) ) ) || any( greaterThan( sampleUv, vec2( 1.0 ) ) ) ) { before = middle; continue; }
										float distance = reflectionDistanceAt( sampleUv, belowSurface, lo, hi );
										if ( - middle.z > distance ) after = middle; else before = middle;
								}
								vec4 refined = uProj * vec4( after, 1.0 );
								uvq = refined.xy / refined.w * 0.5 + 0.5;
									qView = viewPosAt( uvq );
								if ( - qView.z < 8.0 ) break;
								}
								if ( belowSurface ) {
									vec3 qWorld = ( uViewInv * vec4( qView, 1.0 ) ).xyz;
									if ( qWorld.z >= top || qWorld.x < lo.x || qWorld.x > hi.x || qWorld.y < lo.y || qWorld.y > hi.y ) break;
								} else if ( ( uViewInv * vec4( qView, 1.0 ) ).z < top - 0.5 ) {
									// A wide depth tolerance can encounter the submerged floor
									// before the actual wall/marker. Keep seeking an air-side hit.
									continue;
								}
								refl = mix( fallback, litReflectionAt( uvq ), uScreenReflect * smoothstep( 0.0, 0.08, min( min( uvq.x, 1.0 - uvq.x ), min( uvq.y, 1.0 - uvq.y ) ) ) );
								found = 1.0;
								break;
							}
						}
						float cosT = clamp( dot( - dirW, nW ), 0.0, 1.0 );
						float fres = waterInterfaceReflectance( cosT, belowSurface );
						float k = clamp( fres * 1.65 * uReflect * edge, 0.0, 0.98 );
						// TIR has no air transmission. Reflection-off remains an explicit
						// optics opt-out, but a lower enabled strength cannot open the window.
						if ( belowSurface && fres >= 1.0 ) k = 1.0;
						if ( belowSurface ) refl *= exp( - liquidAbsorption( look ) * tp );
						c = mix( c, min( refl, vec3( 8.0 ) ), k );
					}
					c += surfaceLight;
				}
			}
			if ( muddy && sedimentPath > 0.0 ) {
				float haze = 1.0 - exp( - sedimentPath * 0.0012 * clamp( uMist, 0.0, 1.5 ) );
				c = mix( c, liquidScatter( look ) * sedimentLight, haze );
			}

			// below the surface of a pool: no outlines (the pool's walls stand on its edge, so a margin)
			if ( d < 0.99999
				&& hitW.x > bmin.x - 24.0 && hitW.x < bmax.x + 24.0 && hitW.y > bmin.y - 24.0 && hitW.y < bmax.y + 24.0
				&& hitW.z > bmin.z && hitW.z < top + 2.0 ) creaseK = 1.0;

		}
	}

	c *= creaseK;

	// No screen-wide atmospheric haze. Directional shafts and the flashlight
	// retain their source-shaped volume; point lamps illuminate receivers.
	c += texture2D( tVolume, uvd ).rgb * uVolume;
	vec4 fire=powerupFireAt(uvd);
	c += texture2D( tBloom, uvd ).rgb * uBloom * (1.-clamp(fire.a,0.,1.));
	// tScene contains the black shroud and original glyph. Prevent deferred
	// light, shafts and bloom from filling the void; add the independently
	// integrated fire emission afterward, without relighting or recolouring it.
	c = mix( c, scene, powerupShroudMask( uvd ) );
	c += fire.rgb*(1.-clamp(fire.a,0.,1.));

	c = max( c * uExposure, 0.0 );

	if ( uLighting > 0.5 ) {
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
	}

	// the drops: a little darker at the edge where they bend the light, a bright
	// glint, and blood-red where it is blood
	if ( dropMask > 0.0 ) {
		// water is clear: only a small neutral glint on the edge, no tint, no darkening
		c += vec3( 1.0 ) * dropGlint * 0.35 * ( 1.0 - uDropBlood );
		vec3 red = c * vec3( 0.75, 0.06, 0.05 ) + vec3( 0.05, 0.0, 0.0 ) * dropMask;
		c = mix( c, red, uDropBlood * clamp( dropMask * 1.4, 0.0, 1.0 ) );
	}

	gl_FragColor = vec4( c, 1.0 );
	if ( uOffscreen < 0.5 ) {
		#include <colorspace_fragment>
		// brightness, then contrast about a mid tone, on the displayed values
		vec3 shown = gl_FragColor.rgb * uBright;
		shown = max( uContrastPivot + ( shown - uContrastPivot ) * uContrastGain, 0.0 );
		gl_FragColor = vec4( shown, 1.0 );
	}
	visionCoordinates=visionEncodeUV(clamp(uvd,uTexel*.5,1.-uTexel*.5));
}`;

// The composite target stores linear colour. Convert and grade exactly once,
// after upscaling, so brightness/contrast keep their display-space meaning.
const PRESENT_FRAGMENT = `
uniform sampler2D tComposite;
uniform float uBright;
uniform float uContrastGain;
uniform float uContrastPivot;
varying vec2 vUv;
void main() {
	gl_FragColor = texture2D( tComposite, vUv );
	#include <colorspace_fragment>
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

	const material = new THREE.ShaderMaterial( {
		uniforms,
		vertexShader: QUAD_VERTEX,
		fragmentShader: fragment,
		depthTest: false,
		depthWrite: false
	} );
	// Fullscreen passes own their outputs. The world-material prototype hook
	// must not attach a second G-buffer declaration to the optical UV output.
	material.onBeforeCompile=()=>{};
	return material;

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
		tHeightShadow: { value: null },
		uHeightMasks: { value: 0 },
		tNearSunShadow: { value: null }, uNearSunShadowVP: { value: new THREE.Matrix4() }, uNearSunShadowOn: { value: 0 },
  tSpotShadow: { value: null },
		uSpotShadowVP: { value: new THREE.Matrix4() },
		uSpotShadowLightWorld: { value: new THREE.Vector4() },
		uSpotWorldShadowOn: { value: 0 },
		tPointShadow: { value: null },
		uPointShadowInfo: { value: Array.from( { length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector2( -1, 0 ) ) },
		uLightPos: { value: lightPos },
		uLightCol: { value: lightCol },
		uLightCookie: { value: new Float32Array( MAX_VOLUME_LIGHTS ) },
		uLightDirection: { value: Array.from({length:MAX_VOLUME_LIGHTS},()=>new THREE.Vector3()) },
  uLightCone: { value: Array.from({length:MAX_VOLUME_LIGHTS},()=>new THREE.Vector2(1,1)) },
		uLightRotation: { value: Array.from( { length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector4( 0, 0, 0, 1 ) ) },
		uPowerupTime: { value: 0 },
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
		pointShadows: new PointShadowAtlas( occluder?.geometry ),
		scene, mesh, shared,
		camera: new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 ),
		hdr: null, volume: null, composite: null, down: [], up: [],
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
			uOpenFog: { value: 0 },
			uShaftFog: { value: 1.3 },
			uShadowSpread: { value: 100 / ( SUN_SHADOW_EXTENT * 2 ) },
			uScatter: { value: SCATTER }
		}, shared ) ),
		prefilterMaterial: makeMaterial( BLOOM_PREFILTER_FRAGMENT, {
			tScene: { value: null }, tPowerupFire: { value: null }, uPowerupFireOn: { value: 0 }, uTexel: { value: new THREE.Vector2() },
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
			tPowerupShrouds: { value: null }, uPowerupShroudCount: { value: 0 }, tPowerupFire: { value: null }, uPowerupFireOn: { value: 0 },
			tScene: { value: null }, tNormal: { value: null }, tAlbedo: { value: null }, tVolume: { value: null }, tBloom: { value: null },
			uTexel: { value: new THREE.Vector2() },
			uExposure: { value: 1 }, uBloom: { value: 0.6 }, uVolume: { value: 1 },
			uSunSurface: { value: SUN_SURFACE },
			uSunSurfaceCol: { value: new THREE.Vector3( ...SUN_SURFACE_COLOR ) },
			uLightSurface: { value: LIGHT_SURFACE },
			uLightFloor: { value: LIGHT_FLOOR },
			uLightAdd: { value: new Array( MAX_VOLUME_LIGHTS ).fill( 0 ) },
			uEdge: { value: 1 },
			uDropDensity: { value: 0 },
			uDropBlood: { value: 0 },
			uActorWet: { value: 0 }, uBumpLight: { value: BUMP_LIGHT },
			uLighting: lightingLook,
			uOffscreen: { value: 0 },
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
			uCaustic: { value: CAUSTIC }, uUnderwater: { value: 0 },
			tProbeA: { value: null },
			tProbeB: { value: null },
			uProbeCenter: { value: [ new THREE.Vector3(), new THREE.Vector3() ] },
			uProbeMin: { value: [ new THREE.Vector3(), new THREE.Vector3() ] },
			uProbeMax: { value: [ new THREE.Vector3(), new THREE.Vector3() ] },
			uProbeOf: { value: new Array( MAX_LIQUID_REGIONS ).fill( - 1 ) },
			uScreenReflect: { value: 1 },
			uLavaCount: { value: 0 },
			uLavaMin: { value: Array.from( { length: 4 }, () => new THREE.Vector4() ) },
			uLavaMax: { value: Array.from( { length: 4 }, () => new THREE.Vector4() ) },
			uHeat: { value: 0.6 },
			uReflect: { value: 0.6 },
			uWaterCount: { value: 0 },
			uMist: { value: 0 },
			uWaterMin: { value: Array.from( { length: MAX_LIQUID_REGIONS }, () => new THREE.Vector4() ) },
			uWaterMax: { value: Array.from( { length: MAX_LIQUID_REGIONS }, () => new THREE.Vector4() ) }
		}, shared ) ),
		presentMaterial: makeMaterial( PRESENT_FRAGMENT, {
			tComposite: { value: null }, uBright: { value: 1 },
			uContrastGain: { value: 1 }, uContrastPivot: { value: 0.2 }
		} )
	};

}

function disposeTargets() {

	if ( gpu.hdr === null ) return;
	gpu.hdr.dispose();
	gpu.hdr.depthTexture.dispose();
	gpu.volume.dispose();
	if ( gpu.composite !== null ) gpu.composite.dispose();
	gpu.composite = null;
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

	const heightMasks = glowActive && detailActive && r_heightshadows.value !== 0;
	// Packed visibility is data: MSAA averaging would mix unrelated source bits.
	// Receiver classes and true view depth are data even with micro relief off.
 // Multisample resolution would average a model packet with background.
 const samples = 0;
	const count = glowActive || PowerVisionMode(cl, R_NewerGame()) ? 4 : 2; // vision also consumes unlit pigment
	if ( gpu.hdr !== null && gpu.width === width && gpu.height === height && gpu.samples === samples && gpu.hdr.textures.length === count ) return;

	disposeTargets();
	gpu.width = width;
	gpu.height = height;
	gpu.samples = samples;

	const depth = new THREE.DepthTexture( width, height );
	gpu.hdr = makeRT( width, height, { depthBuffer: true, depthTexture: depth, samples, count } );
 // A normal packet's alpha is view distance. Linear interpolation across
 // different receivers creates a second, invalid apparent lighting surface.
 gpu.hdr.textures[1].minFilter=gpu.hdr.textures[1].magFilter=THREE.NearestFilter;
	// SRGB8 storage preserves dark authored texels at half the bandwidth of HDR.
	// The attachment encodes linear shader output and texture reads decode it;
	// alpha marks valid surfaces. No extra geometry pass or baked-light floor.
	if ( count >= 3 ) {

		gpu.hdr.textures[ 2 ].type = THREE.UnsignedByteType;
		gpu.hdr.textures[ 2 ].colorSpace = THREE.SRGBColorSpace;
		gpu.hdr.textures[ 2 ].minFilter = THREE.NearestFilter;
		gpu.hdr.textures[ 2 ].magFilter = THREE.NearestFilter;

	}
 if ( heightMasks ) {
  const mask = gpu.hdr.textures[ 3 ];
  mask.type = THREE.UnsignedByteType; mask.format = THREE.RGBAFormat;
  mask.colorSpace = THREE.NoColorSpace; mask.internalFormat = 'RGBA8';
  mask.minFilter = mask.magFilter = THREE.NearestFilter; mask.generateMipmaps = false;
  mask.name = 'quake_height_light_visibility';
 }
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

let heightFrameSnapshot = null;
export function R_PostLightsFrame( renderer, scene, camera, visframe, styles, dlights, time, hasSkyView ) {
 if ( ! gpu ) { heightFrameSnapshot = null; R_HeightShadowScope( false ); return null; }
 camera.updateMatrixWorld( true );
 if ( glowActive ) selectLights( camera.matrixWorldInverse, visframe, styles, dlights, time );
 else selectedCount = 0;
 const lights = _selected.slice( 0, selectedCount ).map( light => ( { ...light, pos: light.pos.slice(), worldPos: light.worldPos.slice(), color: light.color.slice(), direction:light.direction.slice(), viewDirection:light.viewDirection.slice(), cone:light.cone.slice(), powerupRotation: light.source?.rotation?.slice() || [ 0, 0, 0, 1 ] } ) );
 const liveBeam = R_FlashlightBeam();
 const beam = { ...liveBeam, pos: liveBeam.pos.slice(), dir: liveBeam.dir.slice() };
 heightFrameSnapshot = { camera, visframe, time, lights, beam, hasSkyView };
 const sh = gpu.shared, shadowSources = [];
 for ( const light of lights ) if ( light.source ) shadowSources.push( { source: light.source, position: light.worldPos,
  far: light.source.pos?130+170*Math.sqrt(light.source.power*(light.source.emitter===1?EMITTER_LIGHT_GAIN:1)*2.25):light.range*1.5, live: !light.source.pos||light.source.bestiary===true } );
 shadowSources.sort((a,b)=>Number(b.live)-Number(a.live));
 const spotCasters=[];
 if(glowActive&&r_pointshadows.value!==0){
  scene.updateMatrixWorld(true);
  scene.traverse(object=>{
   if(!object.isMesh||!object.visible)return;
   const aliasOwner=object._quakeOwner,brushOwner=object.parent?._quakeOwner;
   const physicalAlias=aliasOwner?._aliasMesh===object&&!/flame|bolt|eyes/.test(aliasOwner.model?.name||'');
   const physicalBrush=brushOwner?._brushGroup===object.parent;
   object.userData.quakePhysicalAlias=physicalAlias;
   if((physicalAlias||object.userData.quakeAxePart===true)&&r_newer_shadows.value!==0||physicalBrush)spotCasters.push(object);
  });
  gpu.pointShadows.update(renderer,shadowSources,spotCasters,{frozenPose:R_IntroLoadingHolding()});
 }
 gpu.pointShadows.updateSun(renderer,{on:glowActive&&hasSkyView&&r_pointshadows.value!==0,direction:sunDirection,focus:camera.position.toArray()},spotCasters);
 sh.tNearSunShadow.value=gpu.pointShadows.sunTexture;sh.uNearSunShadowVP.value.copy(gpu.pointShadows.sunVP);sh.uNearSunShadowOn.value=gpu.pointShadows.sunReady?1:0;
 sh.tPointShadow.value = gpu.pointShadows.target.texture;
 for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ ) {
  const source = lights[ i ]?.source;
  const shadow = glowActive && r_pointshadows.value !== 0 && source ? gpu.pointShadows.lookup( source ) : null;
  sh.uPointShadowInfo.value[ i ].set( shadow?.ready ? shadow.slot : -1, shadow?.far || 0 );
 }
 if(glowActive && beam.on && r_pointshadows.value!==0) {
  gpu.pointShadows.updateSpot(renderer,{...beam,range:1500,outerCos:FLASHLIGHT_OUTER},spotCasters);
 } else gpu.pointShadows.clearSpot();
 sh.tSpotShadow.value=gpu.pointShadows.spotTexture;
 sh.uSpotShadowVP.value.copy(gpu.pointShadows.spotVP);
 sh.uSpotShadowLightWorld.value.set(...beam.pos,1500);
 sh.uSpotWorldShadowOn.value=glowActive && beam.on && r_pointshadows.value!==0 && gpu.pointShadows.spotReady?1:0;
 const masks = glowActive && detailActive && r_heightshadows.value !== 0 && gpu.hdr?.textures.length === 4;
 sh.tHeightShadow.value = masks ? gpu.hdr.textures[ 3 ] : null; sh.uHeightMasks.value = masks ? 1 : 0;
 R_HeightShadowFrame( {
  points: lights.map( light => ( { position: light.worldPos, range: light.range, color: light.color, direction:light.direction, cone:light.cone } ) ),
  sun: { direction: sunDirection, on: glowActive && hasSkyView, color: SUN_SURFACE_COLOR },
  spot: { position: beam.pos, range: 1500, direction: beam.dir, cone: [ FLASHLIGHT_INNER, FLASHLIGHT_OUTER ], on: glowActive && beam.on,
   color: [ SPOT_POWER, SPOT_POWER * .985, SPOT_POWER * .96 ] }
 } );
 R_HeightShadowScope( masks );
 return heightFrameSnapshot;
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
	heightFrameSnapshot = null; R_HeightShadowScope( false );

	// The shared targets serve three independent visual options. Turning lighting
	// off keeps relief and liquid compositing available without relighting the world.
	const newer = enabled && r_hdr.value !== 0;
	const wanted = r_newer_lighting.value !== 0 || r_newer_normals.value !== 0 || r_newer_water.value !== 0 || PowerVisionMode(cl,newer) !== 0 || R_QuadVisionActive();
	const active = newer && wanted && R_PostSupported( renderer ) && width > 8 && height > 8;
	postActive = active;
	const lighting = active && r_newer_lighting.value !== 0;
	setGlowActive( lighting );
	setDetailActive( active && r_newer_normals.value !== 0 );
	GL_SetForceLinear( active );
	R_AnimSetNewer( newer );
	R_AnimSetLighting( lighting );
	lightingLook.value = lighting ? 1 : 0;
	lightCurve.value = lighting ? Math.max( 1, r_newdark.value ) : 1;
	if ( lighting ) pulseLava( performance.now() / 1000 );
	skySeen = false;

	if ( active === false ) { R_PowerVisionReset(); R_QuadVisionReset(); return false; }

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

// Before the frame is drawn: a pool that has just come into view gets its reflection probe
export function R_WaterProbesFrame( renderer, scene, camera, showAll, { initializing = false, ready = true } = {} ) {

	if ( ! R_WaterActive() || r_reflect.value <= 0 || liquidRegions.length === 0 ) return;
	// A cached intro probe must reflect final enabled art, not an earlier
	// native texture that is about to be replaced. Normal play is unchanged.
	if ( initializing && !ready ) return;

	const cw = camera.matrixWorld.elements;
	const near = [];
	for ( const r of liquidRegions ) {

		if ( r.kind !== 0 && r.kind !== 1 ) continue;
		const dx = Math.max( r.min[ 0 ] - cw[ 12 ], 0, cw[ 12 ] - r.max[ 0 ] );
		const dy = Math.max( r.min[ 1 ] - cw[ 13 ], 0, cw[ 13 ] - r.max[ 1 ] );
		const dist = Math.hypot( dx, dy, Math.max( 0, r.z - cw[ 14 ], cw[ 14 ] - r.z - 900 ) );
		if ( dist < 2400 ) near.push( { r, dist } );

	}

	near.sort( ( a, b ) => a.dist - b.dist );
	R_WaterProbeUpdate( renderer, scene, camera, near.map( n => n.r ), showAll, liquidRegions, { initializing } );

}

export function R_WaterStartupStatus(camera){
 if(!R_WaterActive()||r_reflect.value<=0)return {pending:0,ready:0};
 const p=camera.matrixWorld.elements,near=[];
 for(const r of liquidRegions){if(r.kind!==0&&r.kind!==1)continue;const distance=Math.hypot(Math.max(r.min[0]-p[12],0,p[12]-r.max[0]),Math.max(r.min[1]-p[13],0,p[13]-r.max[1]),Math.max(0,r.z-p[14],p[14]-r.z-900));if(distance<2400)near.push({r,distance});}
 near.sort((a,b)=>a.distance-b.distance);return R_WaterProbeReadiness(camera,near.map(n=>n.r));
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

	const lighting = glowActive;
 const hadSnapshot = heightFrameSnapshot?.camera === camera && heightFrameSnapshot.time === time && heightFrameSnapshot.visframe === visframe;
 if ( ! hadSnapshot ) {
  R_PostLightsFrame( renderer, scene, camera, visframe, styles, dlights, time, hasSkyView );
  // Legacy public callers did not draw with this snapshot, so ignore mask data.
  p.shared.uHeightMasks.value = 0; R_HeightShadowScope( false );
 }
 const frame = heightFrameSnapshot;
 selectedCount = frame?.lights.length || 0;
 R_AliasReceiverPass(renderer,scene,camera,hdr);
 const fireFrame=R_DrawPowerupFire( renderer, scene, camera, hdr );
 R_PerfStage( 'power-up fire' );


	sh.tDepth.value = hdr.depthTexture;
	sh.uProj.value.copy( camera.projectionMatrix );
	sh.uProjInv.value.copy( camera.projectionMatrixInverse );
	sh.uViewInv.value.copy( camera.matrixWorld );
	sh.uNear.value = camera.near;
	sh.uFar.value = camera.far;
	sh.uCount.value = selectedCount;
	sh.uPowerupTime.value = time;

	// the flashlight, in view space
	const beam = frame?.beam || R_FlashlightBeam();
	sh.uSpotOn.value = lighting && beam.on ? 1 : 0;
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

		const s = frame.lights[ i ];
		sh.uLightPos.value[ i ].set( s.pos[ 0 ], s.pos[ 1 ], s.pos[ 2 ], s.radius );
		sh.uLightCol.value[ i ].set( s.color[ 0 ], s.color[ 1 ], s.color[ 2 ], s.range );
		p.compositeMaterial.uniforms.uLightAdd.value[ i ] = s.add || 0;
		sh.uLightCookie.value[ i ] = s.source?.cookie || 0;
		sh.uLightRotation.value[ i ].fromArray( s.powerupRotation );
  sh.uLightDirection.value[i].fromArray(s.viewDirection);
  sh.uLightCone.value[i].fromArray(s.cone);

	}

	// the sun, when the map has sky to light it; how strong, what colour and what
	// pattern all come from the map's sky
	const sunOn = lighting && hasSkyView === true;
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
	// Hold the original nominal sun density. One common compositing gain below
	// makes sun, point lights and the flashlight respond to the same slider once.
	p.volumeMaterial.uniforms.uSunScatter.value = SUN_SCATTER * PILLAR_MAX * PILLAR_DEFAULT * ( 1.4 + 1.0 * bright );
	// a bright, clear sky leaves open air nearly free of haze; a dark one hazier
	p.volumeMaterial.uniforms.uOpenFog.value = 0; // no broad atmospheric veil
	// a bright, clear sky is crisp; a dark one a little hazier
	sh.uBounce.value = lighting ? Math.max( 0, r_bounce.value ) : 0;
	sh.tCookie.value = skyCookie;
	sh.tCookieCloud.value = skyCookieCloud;
	sh.uCookieCloud.value = skyCookieCloud !== null ? 1 : 0;
	sh.uCookie.value = skyCookie !== null ? 1 : 0;
	sh.uCookieTime.value = time * Math.max( 0, r_cloudspeed.value );
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
	const volume = lighting ? Math.max( 0, r_volumetric.value ) * SHAFT_GAIN * Math.max( 0, r_pillars.value ) / PILLAR_DEFAULT : 0;
	if ( volume > 0 ) runPass( renderer, p.volumeMaterial, p.volume );
	R_PerfStage( 'light shafts' );

	// bloom
	const bloom = lighting ? Math.max( 0, r_bloom.value ) : 0;
	if ( bloom > 0 ) {

		const pm = p.prefilterMaterial.uniforms;
		pm.tScene.value = hdr.texture;
		pm.tPowerupFire.value=fireFrame?.texture||null;pm.uPowerupFireOn.value=fireFrame?.count?1:0;
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
	cm.tPowerupFire.value=fireFrame?.texture||null;cm.uPowerupFireOn.value=fireFrame?.count?1:0;
	const shrouds = R_PowerupShroudFrame( scene, camera );
	cm.tPowerupShrouds.value = shrouds.texture; cm.uPowerupShroudCount.value = shrouds.count;


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
	cm.uMist.value = Math.max( 0, r_mist.value );
	for ( let i = 0; i < waterCount; i ++ ) {

		const r = ranked[ i ].r;
		cm.uWaterMin.value[ i ].set( r.min[ 0 ], r.min[ 1 ], r.z, r.kind );
		cm.uProbeOf.value[ i ] = - 1;
		cm.uWaterMax.value[ i ].set( r.max[ 0 ], r.max[ 1 ], r.z, R_LiquidLookIndex( r.kind, r.mapLook ) );

	}

	// lava near the camera, for the heat haze
	let lavaCount = 0;
	if ( r_newer_water.value !== 0 && r_heathaze.value > 0 ) {

		const near = [];
		for ( const r of lavaRegions ) {

			const dx = Math.max( r.min[ 0 ] - cw[ 12 ], 0, cw[ 12 ] - r.max[ 0 ] );
			const dy = Math.max( r.min[ 1 ] - cw[ 13 ], 0, cw[ 13 ] - r.max[ 1 ] );
			const dist = Math.hypot( dx, dy, Math.max( 0, cw[ 14 ] - r.z - 150 ) );
			if ( dist < 2400 ) near.push( { r, dist } );

		}

		near.sort( ( a, b ) => a.dist - b.dist );
		lavaCount = Math.min( near.length, 4 );
		for ( let i = 0; i < lavaCount; i ++ ) {

			const r = near[ i ].r;
			cm.uLavaMin.value[ i ].set( r.min[ 0 ], r.min[ 1 ], r.z, 0 );
			cm.uLavaMax.value[ i ].set( r.max[ 0 ], r.max[ 1 ], r.z, 0 );

		}

	}

	cm.uLavaCount.value = lavaCount;
	cm.uUnderwater.value = underwater ? 1 : 0;
	cm.uHeat.value = underwater ? 0 : Math.max( 0, r_heathaze.value );
	cm.uReflect.value = Math.max( 0, r_reflect.value ); // the per-pool interface selects top/underside optics

	// the pools' reflection probes (at most two are used at once)
	const probeList = R_WaterProbes();
	cm.tProbeA.value = probeList[ 0 ] != null ? probeList[ 0 ].rt.texture : null;
	cm.tProbeB.value = probeList[ 1 ] != null ? probeList[ 1 ].rt.texture : null;
	for ( let k = 0; k < 2; k ++ ) {

		const pb = probeList[ k ];
		if ( pb == null ) continue;
		cm.uProbeCenter.value[ k ].set( pb.center[ 0 ], pb.center[ 1 ], pb.center[ 2 ] );
		cm.uProbeMin.value[ k ].set( pb.min[ 0 ], pb.min[ 1 ], pb.min[ 2 ] );
		cm.uProbeMax.value[ k ].set( pb.max[ 0 ], pb.max[ 1 ], pb.max[ 2 ] );

	}

	for ( let i = 0; i < waterCount; i ++ ) {

		const r = ranked[ i ].r;
		const k = probeList.findIndex( ( pb ) => pb.region === r );
		cm.uProbeOf.value[ i ] = k;

	}

	cm.uScreenReflect.value = r_reflect_screen.value !== 0 ? 1 : 0;

	cm.uEdge.value = underwater || ! lighting ? 0 : Math.max( 0, r_newedges.value );
	const drops = R_ScreenDropsUpdate();
	cm.uDropDensity.value = underwater ? 0 : drops.density;
	cm.uDropBlood.value = drops.blood;
	const tele = R_TeleportFx( performance.now() / 1000 );
	cm.uTeleStretch.value = tele.stretch;
	cm.uTeleChroma.value = tele.chroma;
	cm.uDropAge.value = drops.age;
	cm.uTime.value = time;
 cm.uActorWet.value=R_ActiveWeaponSurface().wet;
	cm.uCaustic.value = r_newer_water.value !== 0 ? CAUSTIC * Math.max( 0, r_caustics.value ) : 0;
	cm.tScene.value = hdr.textures[ 0 ];
	cm.tNormal.value = hdr.textures[ 1 ];
	cm.tAlbedo.value = hdr.textures[ 2 ] || null;
	cm.tVolume.value = volume > 0 ? p.volume.texture : null;
	cm.tBloom.value = bloom > 0 ? p.bloomResult.texture : null;
	cm.uTexel.value.set( 1 / hdr.width, 1 / hdr.height );
	// brightness and contrast are applied to the picture as displayed (below), so
	// 0.6 is 40% darker and 1.4 is 40% more contrast as seen
	const newBright = lighting ? Math.max( 0, r_newbright.value ) : 1;
	cm.uExposure.value = lighting ? exposure * HDR_EXPOSURE * ( hasSkyView === true ? OUTDOOR_EXPOSURE : 1 ) : exposure;
	cm.uBright.value = newBright;
	cm.uContrastGain.value = lighting ? Math.max( 0, r_newcontrast.value ) : 1;
	cm.uContrastPivot.value = newBright * 0.2; // deviations are taken from a typical scene brightness
	cm.uBloom.value = bloom * ( hasSkyView === true ? OUTDOOR_BLOOM : 1 );
	cm.uVolume.value = volume;

	R_PerfStage( 'bloom' );

	// Previously the expensive ray marches/bounce still ran at full device-pixel
	// resolution when the scene shrank. At half scale that did four times the
	// scene's work, preventing dynamic resolution from meeting its frame budget.
	const vision = PowerVisionMode(cl, R_NewerGame());
	const visionOn=vision!==0 || R_QuadVisionActive();
	const upscale = (lighting && dyn.scale < 1) || visionOn;
	cm.uOffscreen.value = upscale ? 1 : 0;
	if ( upscale ) {

		const count=visionOn?2:1;
		if (p.composite===null || p.composite.textures.length!==count) {
			p.composite?.dispose();p.composite=makeRT(hdr.width,hdr.height,{count});
			if(visionOn){const t=p.composite.textures[1];t.type=THREE.UnsignedByteType;t.minFilter=t.magFilter=THREE.NearestFilter;t.userData.visionEncoded=true;}
		}
		runPass( renderer, p.compositeMaterial, p.composite );
		R_PerfStage( 'final lighting pass' );
		const shown = p.presentMaterial.uniforms;
		const coordinates=visionOn?p.composite.textures[1]:null;
		const visionSource=R_PowerVisionRender(renderer,p.composite.texture,hdr,camera,vision,cl,coordinates);
		shown.tComposite.value = R_QuadVisionRender(renderer,visionSource,hdr,camera,scene,coordinates);
		shown.uBright.value = cm.uBright.value;
		shown.uContrastGain.value = cm.uContrastGain.value;
		shown.uContrastPivot.value = cm.uContrastPivot.value;

	} else { R_PowerVisionReset(); R_QuadVisionReset(); }

	renderer.setRenderTarget( null );
	renderer.setViewport( viewport.lx, viewport.ly, viewport.lw, viewport.lh );
	gpu.mesh.material = upscale ? p.presentMaterial : p.compositeMaterial;
	if ( splitLeft ) {

		renderer.setScissor( viewport.lx, viewport.ly, Math.floor( viewport.lw / 2 ), viewport.lh );
		renderer.setScissorTest( true );

	}

	renderer.render( p.scene, p.camera );
	if ( splitLeft ) renderer.setScissorTest( false );
	R_PerfStage( upscale ? 'lighting upscale' : 'final lighting pass' );

}

// the title demo's half-and-half comparison: the final pass fills the left half only
let splitLeft = false;

export function R_PostSetSplit( on ) {

	splitLeft = on === true;

}

export function R_PostShutdown() {
	R_PowerVisionReset(true);
	R_QuadVisionReset();

	R_ClearPowerupFireTarget();

	if ( gpu === null ) return;
	disposeTargets();
	gpu.pointShadows.dispose();
	gpu.sunTarget.dispose();
	gpu.sunTarget.depthTexture.dispose();
	gpu = null;

}
