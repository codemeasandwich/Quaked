/**
 * @module newer/render/gl_post
 *
 * The HDR pipeline: emissive surfaces, sun and light shafts, relighting, water and its looks, bloom, depth of field
 * and the final composite.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `sunDirection`, `worldLights`, `hasSky`, `leafKeyCounter`,
 * `occluder`, `skyInfo`, `skyCookie`, `skyCookieCloud`, `skySeen`, `selectedCount`, `portraitLight`, `gpu` and 2
 * more; 4 module-level collections (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Its G-buffer patch on `THREE.Material.prototype.onBeforeCompile` is installed by `R_PostInstallGBufferPatch`, from
 * `R_Init` and `R_PostBegin` (it ran as the module loaded until [44g], debt D10).
 */
import { R_ExitFixturePairs, R_LightCone, POINT_CONE_GLSL } from './r_fixturelights.js';
import { WATER as WAVE_WATER, SIZE as WAVE_SIZE, WAVE_GLSL, waterWave, R_WaveTexture, R_WaterWavesLive } from './r_waves.js';
import { R_ClearPowerupFireTarget } from './r_powerupfire.js';
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
import { cl } from '../../engine/client/client.js';
import { PowerVisionMode } from '../gameplay/powervision_state.js';
import { R_PowerVisionRender, R_PowerVisionReset } from './r_powervision.js';
import { VISION_UV_PACK_GLSL } from './vision_coordinates.js';
import { R_QuadVisionActive, R_QuadVisionRender, R_QuadVisionReset } from './r_quadvision.js';
import { R_IntroLoadingHolding } from '../ui/r_demoloading.js';
import { cvar_t } from '../../engine/common/cvar.js';
import { R_ParseEntityLump } from './gl_portal.js';
import { Mod_PointInLeaf, Mod_LeafPVS, solidskytexture, alphaskytexture } from '../../engine/render/gl_model.js';
import { R_NormalMapFor } from './gl_normals.js';
import {R_NormalPrepare,R_NormalPreparationNeeded} from '../assets/normal_prepare.js';
import { R_PatchRockShader, ROCK_PARALLAX_GLSL, ROCK_NORMAL_GLSL } from './r_rockshader.js';
import { rockUniforms } from './r_rockfield.js';
import { GL_SetForceLinear } from '../../engine/render/glquake.js';
import { R_AliasReceiverPass } from './r_newerskins.js';
import { R_ActiveWeaponSurface } from './r_weapon_surface.js';
import { R_ScreenDropsUpdate } from './r_screendrops.js';
import { R_TeleportFx } from './r_teleportfx.js';
import { R_RendVeilFields, R_RendVeilBackgroundDepth, R_RendVeilLights } from './r_rendveil.js';
import { R_RendVeilOptics, R_RendVeilOpticsShutdown } from './r_rendveil_optics.js';
import { R_PerfStage, R_PerfSetScale } from './r_perf.js';
import { R_DofFocus, R_DofCircle, R_DofFar } from './r_dof.js';
import { R_FlashlightBeam, FLASHLIGHT_OUTER, FLASHLIGHT_INNER } from './r_flashlight.js';
import { R_WaterProbeUpdate, R_WaterProbeFor, R_WaterProbes, R_WaterProbeReadiness, WATER_PROBE_LIFT } from './r_waterprobe.js';
import { R_AnimSetNewer, R_AnimSetLighting, R_NewerGame, r_newer_lighting, r_newer_normals, r_newer_water, r_newer_textures, r_newer_shadows } from '../mode.js';
import { R_DemonSurfaceData } from './r_demonrelief.js';
import { R_DemonBakePrepare, R_DemonBakeSurface } from '../assets/r_demonbakes.js';
import { PointShadowAtlas, R_CreateShadowCaptureMaterial, POINT_SHADOW_GLSL, POINT_SHADOW_SLOTS, SPOT_WORLD_SHADOW_GLSL, NEAR_SUN_SHADOW_GLSL } from './r_pointshadows.js';
import { r_heightshadows, heightShadowUniforms, R_HeightShadowFrame, R_HeightShadowScope, HEIGHT_SHADOW_GLSL, HEIGHT_MASK_DECODE_GLSL } from './r_heightshadows.js';
import { r_hdr, r_pointshadows, r_bloom, r_heathaze, r_mist, r_water_look, r_reflect, r_reflect_screen, r_pillars, r_cloudspeed, r_bounce, r_volumetric, r_newbright, r_newcontrast, r_caustics, r_newdark, r_newedges, r_dynres, r_fps_target, MAX_VOLUME_LIGHTS, SUN_SHADOW_LAYER, EMITTER_LIGHT_GAIN, SURF_DRAWSKY, SURF_DRAWTURB, EMISSIVE_BOOST, LAVA_BOOST, LAVA_PULSE, LIGHT_GAIN, SCATTER, LIGHT_FLOOR, LIGHT_SURFACE, SPOT_POWER, MAX_RAY, SUN_COLOR, PILLAR_MAX, PILLAR_DEFAULT, SHAFT_GAIN, SUN_SCATTER, SUN_SURFACE, SUN_SURFACE_COLOR, SATURATION, VIBRANCE, CONTRAST, HDR_EXPOSURE, OUTDOOR_EXPOSURE, OUTDOOR_BLOOM_THRESHOLD, OUTDOOR_BLOOM, CAUSTIC, BUMP_LIGHT, BLOOM_LEVELS, SUN_SHADOW_SIZE, SUN_SHADOW_EXTENT, SUN_SHADOW_DEPTH } from './r_post_config.js';
export { r_hdr, r_pointshadows, r_bloom, r_heathaze, r_mist, r_water_look, r_reflect, r_reflect_screen, r_pillars, r_cloudspeed, r_bounce, r_volumetric, r_newbright, r_newcontrast, r_caustics, r_newdark, r_newedges, r_dynres, r_fps_target, MAX_VOLUME_LIGHTS, SUN_SHADOW_LAYER, EMITTER_LIGHT_GAIN } from './r_post_config.js';
import { postState, lightCurve, classicLook, lightingLook, R_PostSetUnderwater, R_PostActive, R_WaterActive } from './r_post_state.js';
export { classicLook, R_PostSetUnderwater, R_PostActive, R_WaterActive } from './r_post_state.js';
import { MAX_LIQUID_REGIONS, R_GetLiquidLinks, R_IsWaterTextureName, LIQUID_LOOKS, R_LiquidLookIndex, R_LiquidOpacity, R_GetLavaRegions, R_GetLiquidRegions, R_WaterProbesFrame, R_WaterStartupStatus, liquidKind, liquidMapLook, liquidLookGLSL, R_PostLiquidsReset, R_PostAddLiquidLink, R_PostSetLiquidRegions } from './r_post_liquids.js';
export { MAX_LIQUID_REGIONS, R_GetLiquidLinks, R_IsWaterTextureName, LIQUID_LOOKS, R_LiquidLookIndex, R_LiquidOpacity, R_GetLavaRegions, R_GetLiquidRegions, R_WaterProbesFrame, R_WaterStartupStatus } from './r_post_liquids.js';
import { QUAD_VERTEX, VOLUME_FRAGMENT, BLOOM_PREFILTER_FRAGMENT, BLOOM_DOWN_FRAGMENT, BLOOM_UP_FRAGMENT, COMPOSITE_FRAGMENT, DOF_FRAGMENT, PRESENT_FRAGMENT } from './r_post_shaders.js';

const DYNRES_MIN = 0.5;
const dyn = { scale: 1, last: 0, sum: 0, frames: 0, cool: 0, probing: false, probeEvery: 240, since: 0 };

/**
 * The current dynamic-resolution scale: the fraction of the full width and height the HDR targets are drawn at
 * (r_dynres), updated once a frame in `R_PostBegin` from the average frame time against r_fps_target. gl_rmain.js
 * multiplies the view size by it for screen-space effects.
 *
 * @returns {number} 0.5..1 (rounded to hundredths); 1 when r_dynres is 0
 */
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

// Unlit material colour is retained separately from baked lighting. A surface
// without a light source need not be lifted merely to recover its colour later.


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
function applyGlow( material, boost ) {

	if ( material.emissive !== undefined ) {

		material.emissiveIntensity = postState.glowActive ? boost : 1;

	} else if ( material.color !== undefined ) {

		material.color.setScalar( postState.glowActive ? boost : 1 );

	}

}

/**
 * Marks a material as light emitting: it is boosted above white while the HDR pipeline is running (its
 * `emissiveIntensity`, or its colour when it has no emissive). Called as world, sky and level-view materials are
 * made (gl_rsurf.js, r_levelview.js). Lava materials (boost `LAVA_BOOST`) also pulse slowly. The native tint is
 * kept in `userData.classicGlowColor` for the isolated classic demo material. The material stays registered until
 * it is disposed.
 *
 * @param {THREE.Material} material the material; mutated (`userData.glowBoost`, `baseGlowBoost`, colour/emissive)
 * @param {number} [boost=EMISSIVE_BOOST] HDR multiplier while lit (4.5 for fullbright texels; see
 *   `R_GlowBoostForTexture`)
 */
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

/**
 * The glow boost a liquid surface's material registers with (gl_rsurf.js, as the material is made).
 *
 * @param {string} name texture name, e.g. '*lava1' (case-insensitive)
 * @returns {number} 6 (`LAVA_BOOST`) for '*lava…', 1.5 for '*slime…', otherwise 1 (no glow)
 */
export function R_GlowBoostForTexture( name ) {

	const n = name.toLowerCase();
	if ( n.indexOf( '*lava' ) === 0 ) return LAVA_BOOST;
	if ( n.indexOf( '*slime' ) === 0 ) return 1.5;
	return 1;

}

function setGlowActive( active ) {

	if ( active === postState.glowActive ) return;
	postState.glowActive = active;
	for ( const m of glowMaterials )
		applyGlow( m, m.userData.glowBoost );

}

function setDetailActive( active ) {

	if ( active === postState.detailActive ) return;
	postState.detailActive = active;
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

/**
 * Installs the G-buffer patch as `THREE.Material.prototype.onBeforeCompile`, so every material drawn into the HDR
 * target writes all attachments (materials with their own `onBeforeCompile` keep theirs). Installed by the
 * renderer's start-up (R_Init) and again by every R_PostBegin, before anything is drawn into the HDR target;
 * idempotent. (It ran as this module loaded until card [44g]: debt D10.) Lasts for the page; it is never removed.
 */
export function R_PostInstallGBufferPatch() {

	THREE.Material.prototype.onBeforeCompile = patchGBufferShader;

}

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
	const waiting=postState.detailActive&&diffuse?.userData.newerPending;
	if(postState.detailActive&&!waiting&&diffuse?.image?.data&&typeof window!=='undefined'&&R_NormalPreparationNeeded(diffuse))R_NormalPrepare(diffuse);
	const wanted = postState.detailActive && !waiting && diffuse != null ? R_NormalMapFor( diffuse ) : null;

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

/**
 * Registers a world material for surface detail: generated normal maps, parallax and the normal G-buffer. World
 * materials keep normal maps and parallax independently of lighting, and always write the normal G-buffer.
 * Called by gl_rsurf.js as each world material is made. Installs its own `onBeforeCompile` and program cache key,
 * applies the current detail state, and follows `newertextureupdated` events on `diffuse` (asynchronous art and
 * height can arrive after the material compiles). Registered until the material is disposed.
 *
 * @param {THREE.Material} material world surface material; mutated (shader hooks, normal map, emissive map, userData)
 * @param {?THREE.Texture} diffuse its diffuse texture, the source of its normal map and fullbright emission
 */
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

/**
 * The material's diffuse texture changed (texture animation; gl_rsurf.js `R_UpdateAnimatedMaterial`): rebinds its
 * texture listener and re-applies its normal and emissive maps. Does nothing for a material not registered with
 * `R_RegisterDetail`.
 *
 * @param {THREE.Material} material a registered world material
 * @param {?THREE.Texture} diffuse the new diffuse texture
 */
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

let leafKeyCounter = 0;

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

/**
 * Builds the level's light database once per map (gl_rsurf.js `GL_BuildLightmaps`): the map's light entities
 * (power = light / 300, colour from `_color` or the class), exit-fixture lights, and up to 500 clustered emissive
 * surface lights (lava, light panels, glowing buttons), strongest first; also the water, slime and lava regions,
 * the liquid visibility links, whether the map has sky, the sky analysis and cookie, and the sun direction
 * (worldspawn `_sun_mangle` "yaw pitch" overrides the default). Replaces everything from the previous map.
 *
 * @param {?object} model the world brush model (`cl.worldmodel`); null clears the database
 * @returns {Array<object>} the new world light list (also kept for `R_GetWorldLights`): each `{ pos, color, power,
 *   radius, style, leaf, emitter, ... }` with `pos` in Quake units
 */
export function R_BuildWorldLights( model ) {

	worldLights = [];
	hasSky = false;
	R_PostLiquidsReset();
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
							R_PostAddLiquidLink( { above, below, belowVis: visCache.get( key2 ), aboveVis: visCache.get( - key ) } );

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

		R_PostSetLiquidRegions( liquidFaces, lavaFaces );

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

/**
 * Builds the sun occluder for a map: one static mesh, on `SUN_SHADOW_LAYER` only, of every solid world surface
 * (no sky, no liquids, no hidden arch surfaces in Newer), with the retained wall relief in Newer Game when
 * normals and textures are on. Disposes the previous occluder first and gives the geometry to the point-shadow
 * atlas. Called by gl_rsurf.js `R_BuildWorldOccluder` and when demon relief bakes arrive (r_demonbakes.js).
 * Kept until the next build.
 *
 * @param {?object} model the world brush model
 * @returns {number} the number of triangles in the occluder; 0 when there is no model or nothing to cast
 */
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

/**
 * Analyse RGBA sky layers: the clouds are blended over the solid layer by their alpha and judged in display values
 * (not linear light). Used by the sky cookie built at `R_BuildWorldLights` (and by tests).
 *
 * @param {?ArrayLike<number>} solid the solid sky layer, RGBA bytes, at least `size`² x 4
 * @param {?ArrayLike<number>} cloud the cloud layer, RGBA bytes (ignored when shorter than the solid layer)
 * @param {number} size side of the square layers, texels
 * @returns {?{ luma: number, color: Array<number>, contrast: number, cookie: Float32Array }} mean luma 0..1, the
 *   average colour normalised so its largest channel is 1, contrast 0..1, and a mean-1 cookie (brighter than
 *   average sky passes more light), one value per texel; null when `solid` is missing or too short
 */
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

/**
 * Shared strength derived from the sky: 0 = a dark sky, 1 = a bright clear one.
 *
 * @param {number} luma mean sky luma 0..1 (from `R_AnalyseSky`)
 * @returns {number} 0..1, a smoothstep from luma 0.05 to 0.45
 */
export function R_SkyBrightness( luma ) {

	const t = Math.max( 0, Math.min( 1, ( luma - 0.05 ) / 0.4 ) );
	return t * t * ( 3 - 2 * t );

}

/**
 * The current map's sky analysis, rebuilt at `R_BuildWorldLights`. Not called elsewhere in the current tree.
 *
 * @returns {{ luma: number, color: Array<number>, contrast: number }} the live module object (do not mutate); the
 *   default `{ luma: 0.5, color: [1, 0.85, 0.65], contrast: 0 }` when the map's sky could not be analysed
 */
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

/**
 * The light database built by `R_BuildWorldLights` (gl_rmain.js `R_ShadowLights` picks monsters' floor-shadow
 * lights from it).
 *
 * @returns {Array<object>} the live module list, replaced at each map (do not mutate)
 */
export function R_GetWorldLights() {

	return worldLights;

}

// the world renderer reports when it draws sky; sun shafts only make sense then
let skySeen = false;

/**
 * The world renderer reports when it draws sky (gl_rsurf.js `R_DrawSkyChain`); sun shafts only make sense then.
 * Reset by every `R_PostBegin`.
 */
export function R_PostNoteSky() {

	skySeen = true;

}

/**
 * Whether the current map has any sky surface (found by `R_BuildWorldLights`); gl_rmain.js passes it to
 * `R_PostLightsFrame` and `R_PostFinish` as `hasSkyView`.
 *
 * @returns {boolean} true when the world model has a sky surface
 */
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
	slot.range = source?.rendVeil ? source.range : 130 + 170 * Math.sqrt( source?.powerup || source?.bestiary ? rankPower : power );
	slot.color[ 0 ] = color[ 0 ] * power * LIGHT_GAIN;
	slot.color[ 1 ] = color[ 1 ] * power * LIGHT_GAIN;
	slot.color[ 2 ] = color[ 2 ] * power * LIGHT_GAIN;

}

const FIRE_LIGHT = /torch|flame|fire|brazier/i;

/**
 * How bright a fire is at a moment: a slow swell and quick flutters, a little different for every fire (phased by
 * its position) so a row of torches does not pulse together. Used for the flickering map lights here, for the
 * fire models' light (gl_rmain.js) and for the torch fire (r_torchfire.js).
 *
 * @param {number} x fire position x, Quake units
 * @param {number} y fire position y, Quake units
 * @param {number} z fire position z, Quake units
 * @param {number} time client time, seconds
 * @returns {number} brightness multiplier, 0.55..1.25
 */
export function R_FireFlicker( x, y, z, time ) {

	const ph = ( x * 0.013 + y * 0.017 + z * 0.011 ) % 6.2832;
	const a = Math.sin( time * 2.3 + ph ) * 0.5 + Math.sin( time * 5.1 + ph * 2.1 ) * 0.3;
	const b = Math.sin( time * 13.7 + ph * 3.3 ) * Math.sin( time * 8.9 + ph * 1.7 );
	return Math.min( 1.25, Math.max( 0.55, 0.9 + a * 0.15 + b * 0.18 ) );

}

// The Bestiary's portrait light while a first-sighting page is up ({ pos, color, power, radius, fade }, or null), given
// each frame by the renderer (gl_rmain.js) rather than imported, so post-processing does not depend on the interface
// (card [44g], debt D1c)
let portraitLight = null;
/**
 * Sets the Bestiary's portrait light for the next light selection; called each frame by gl_rmain.js before
 * `R_PostLightsFrame`. Kept until replaced.
 *
 * @param {?{ pos: Array<number>, color: Array<number>, power: number, radius: number, fade: number }} light the
 *   portrait light (world space, fade 0..1), or null/undefined when no first-sighting page is up
 */
export function R_PostSetPortraitLight( light ) {

	portraitLight = light ?? null;

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
	for(const l of R_RendVeilLights())consider(...l.origin,l.color,l.power,l.radius,view,0,l,l.power);
	const portrait=portraitLight;
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

/**
 * Read-only diagnostic/public-test endpoint; normal rendering uses the same selection without allocating snapshots
 * every frame. Runs the per-frame light selection: map lights in the PVS (scaled by their light style, emitter
 * gain and flicker), power-up lights, Rend the Veil lights, the Bestiary portrait light and live dynamic lights,
 * keeping the `MAX_VOLUME_LIGHTS` best by power over distance. Overwrites the shared selection used by rendering.
 *
 * @param {THREE.Matrix4} viewMatrix world-to-view matrix (`camera.matrixWorldInverse`)
 * @param {number} visframe the current visibility frame (`r_visframecount`); a light's leaf must carry it
 * @param {?ArrayLike<number>} styles light style values (`d_lightstylevalue`, 264 = normal)
 * @param {?Array<object>} dlights client dynamic lights (`cl_dlights`)
 * @param {number} time client time, seconds
 * @returns {Array<{ source: ?object, position: Array<number>, color: Array<number>, range: number, score: number,
 *   direction: Array<number>, cone: Array<number> }>} fresh copies: world position (Quake units), HDR colour
 *   (colour x power x light gain), receiver range in Quake units and the ranking score
 */
export function R_SelectWorldLights( viewMatrix, visframe, styles, dlights, time ) {
 selectLights( viewMatrix, visframe, styles, dlights, time );
 return _selected.slice( 0, selectedCount ).map( light => ( { source: light.source, position: light.worldPos.slice(), color: light.color.slice(), range: light.range, score: light.score, direction:light.direction.slice(), cone:light.cone.slice() } ) );
}
/**
 * Direct access to the point-shadow atlas, for GPU trials (not used by the engine).
 *
 * @returns {?PointShadowAtlas} the pipeline's live atlas, or null before the pipeline exists
 */
export function R_PointShadowAtlas() { return gpu?.pointShadows || null; }
/**
 * Point-shadow residency for the start-up status (gl_rmain.js).
 *
 * @returns {object} the atlas's `status()` (counts of ready, pending and resident slots, chunks, captures...), or
 *   `{ ready: 0, pending: 0, resident: 0, chunks: 0 }` before the pipeline exists
 */
export function R_PointShadowStatus() { return gpu?.pointShadows?.status() || { ready: 0, pending: 0, resident: 0, chunks: 0 }; }
/**
 * Makes the point-shadow atlas drop its borrowed clone of a dynamic caster (r_axecorpses.js, as a mesh is disposed),
 * so no reference to its geometry is kept. Does nothing before the pipeline exists.
 *
 * @param {THREE.Mesh} mesh the mesh previously drawn as a dynamic caster
 */
export function R_ReleaseShadowCaster( mesh ) { gpu?.pointShadows?.forgetDynamic( mesh ); }

//============================================================================
// Pipeline
//============================================================================

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
		sunOverride: R_CreateShadowCaptureMaterial( 'void main(){gl_FragColor=vec4(1.);}', {}, { colorWrite: false } ),
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
			uWaves: { value: 0 }, tDepth: shared.tDepth, tNormal: { value: null }, uProj: shared.uProj, uProjInv: shared.uProjInv, uViewInv: shared.uViewInv,
			uWaterWave: { value: waterWave }, tWaves: { value: R_WaveTexture() },
			uContrastGain: { value: 1 }, uContrastPivot: { value: 0.2 }
		} ),
		dofMaterial: makeMaterial( DOF_FRAGMENT, {
			tComposite: { value: null }, tDepth: shared.tDepth, tNormal: { value: null }, uProjInv: shared.uProjInv,
			uDof: { value: new THREE.Vector3() }, uDofTexel: { value: new THREE.Vector2() }, uDofFar: { value: 4096 }
		} ),
		dof: null
	};

}

function disposeTargets() {

	if ( gpu.hdr === null ) return;
	gpu.hdr.dispose();
	gpu.hdr.depthTexture.dispose();
	gpu.volume.dispose();
	if ( gpu.composite !== null ) gpu.composite.dispose();
	gpu.composite = null;
	if ( gpu.dof !== null ) gpu.dof.dispose();
	gpu.dof = null;
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

	const heightMasks = postState.glowActive && postState.detailActive && r_heightshadows.value !== 0;
	// Packed visibility is data: MSAA averaging would mix unrelated source bits.
	// Receiver classes and true view depth are data even with micro relief off.
 // Multisample resolution would average a model packet with background.
 const samples = 0;
	const count = postState.glowActive || PowerVisionMode(cl, R_NewerGame()) ? 4 : 2; // vision also consumes unlit pigment
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

/**
 * True when the HDR pipeline can run on this renderer: WebGL2 with float or half-float colour buffers. Checked by
 * `R_PostBegin` every frame.
 *
 * @param {?THREE.WebGLRenderer} renderer the renderer
 * @returns {boolean} whether HDR render targets can be used
 */
export function R_PostSupported( renderer ) {

	if ( renderer == null || renderer.capabilities == null || renderer.capabilities.isWebGL2 === false ) return false;
	return renderer.extensions.has( 'EXT_color_buffer_float' ) || renderer.extensions.has( 'EXT_color_buffer_half_float' );

}

let heightFrameSnapshot = null;
/**
 * Prepares this frame's lighting before the world is drawn (gl_rmain.js, after `R_PostBind`; again from
 * `R_PostFinish` when a caller skipped it): selects the lights, snapshots them and the flashlight beam, updates the
 * point, sun and spot shadow maps for the visible casters, fills the shared shadow uniforms and the height-shadow
 * frame. The snapshot is what `R_PostFinish` draws with when its camera, time and visframe match.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {THREE.Scene} scene the world scene (traversed for shadow casters)
 * @param {THREE.Camera} camera the view camera; its world matrix is updated
 * @param {number} visframe the current visibility frame (`r_visframecount`)
 * @param {?ArrayLike<number>} styles light style values (`d_lightstylevalue`)
 * @param {?Array<object>} dlights client dynamic lights (`cl_dlights`)
 * @param {number} time client time, seconds
 * @param {boolean} hasSkyView whether the map has sky (`R_MapHasSky`); enables the near sun shadow
 * @returns {?{ camera: THREE.Camera, visframe: number, time: number, lights: Array<object>, beam: object,
 *   hasSkyView: boolean }} the frame snapshot (copied lights and beam), or null when the pipeline does not exist
 */
export function R_PostLightsFrame( renderer, scene, camera, visframe, styles, dlights, time, hasSkyView ) {
 if ( ! gpu ) { heightFrameSnapshot = null; R_HeightShadowScope( false ); return null; }
 camera.updateMatrixWorld( true );
 if ( postState.glowActive ) selectLights( camera.matrixWorldInverse, visframe, styles, dlights, time );
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
 if(postState.glowActive&&r_pointshadows.value!==0){
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
 gpu.pointShadows.updateSun(renderer,{on:postState.glowActive&&hasSkyView&&r_pointshadows.value!==0,direction:sunDirection,focus:camera.position.toArray()},spotCasters);
 sh.tNearSunShadow.value=gpu.pointShadows.sunTexture;sh.uNearSunShadowVP.value.copy(gpu.pointShadows.sunVP);sh.uNearSunShadowOn.value=gpu.pointShadows.sunReady?1:0;
 sh.tPointShadow.value = gpu.pointShadows.target.texture;
 for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ ) {
  const source = lights[ i ]?.source;
  const shadow = postState.glowActive && r_pointshadows.value !== 0 && source ? gpu.pointShadows.lookup( source ) : null;
  sh.uPointShadowInfo.value[ i ].set( shadow?.ready ? shadow.slot : -1, shadow?.far || 0 );
 }
 if(postState.glowActive && beam.on && r_pointshadows.value!==0) {
  gpu.pointShadows.updateSpot(renderer,{...beam,range:1500,outerCos:FLASHLIGHT_OUTER},spotCasters);
 } else gpu.pointShadows.clearSpot();
 sh.tSpotShadow.value=gpu.pointShadows.spotTexture;
 sh.uSpotShadowVP.value.copy(gpu.pointShadows.spotVP);
 sh.uSpotShadowLightWorld.value.set(...beam.pos,1500);
 sh.uSpotWorldShadowOn.value=postState.glowActive && beam.on && r_pointshadows.value!==0 && gpu.pointShadows.spotReady?1:0;
 const masks = postState.glowActive && postState.detailActive && r_heightshadows.value !== 0 && gpu.hdr?.textures.length === 4;
 sh.tHeightShadow.value = masks ? gpu.hdr.textures[ 3 ] : null; sh.uHeightMasks.value = masks ? 1 : 0;
 R_HeightShadowFrame( {
  points: lights.map( light => ( { position: light.worldPos, range: light.range, color: light.color, direction:light.direction, cone:light.cone } ) ),
  sun: { direction: sunDirection, on: postState.glowActive && hasSkyView, color: SUN_SURFACE_COLOR },
  spot: { position: beam.pos, range: 1500, direction: beam.dir, cone: [ FLASHLIGHT_INNER, FLASHLIGHT_OUTER ], on: postState.glowActive && beam.on,
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
/**
 * Called every frame by gl_rmain.js `R_RenderView` (with `enabled` false in XR, during environment-map captures or
 * without a renderer, so its state is reset). Installs the G-buffer patch, sets the glow, detail, linear-texture
 * and animation modes for the frame, creates the pipeline on first use and sizes its targets to the
 * dynamic-resolution scale (even dimensions, at least 16).
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {boolean} enabled whether the Newer renderer may run this frame
 * @param {number} width view width, device pixels
 * @param {number} height view height, device pixels; both must exceed 8
 * @returns {boolean} true when r_hdr is on, a Newer option needs the shared targets and the renderer supports
 *   them; false otherwise (power and quad vision are then reset)
 */
export function R_PostBegin( renderer, enabled, width, height ) {
	R_PostInstallGBufferPatch();
	heightFrameSnapshot = null; R_HeightShadowScope( false );

	// The shared targets serve three independent visual options. Turning lighting
	// off keeps relief and liquid compositing available without relighting the world.
	const newer = enabled && r_hdr.value !== 0;
	const wanted = r_newer_lighting.value !== 0 || r_newer_normals.value !== 0 || r_newer_water.value !== 0 || PowerVisionMode(cl,newer) !== 0 || R_QuadVisionActive();
	const active = newer && wanted && R_PostSupported( renderer ) && width > 8 && height > 8;
	postState.postActive = active;
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

/**
 * Binds the HDR multi-target (colour, normal, albedo and height-mask attachments, with depth) as the render
 * target for the world draw. Only valid after `R_PostBegin` returned true.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 */
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
/**
 * Called by gl_rmain.js after the world has been drawn into the HDR target (and only when `R_PostBegin` returned
 * true); ends by drawing the frame to the screen, into the left half only while `R_PostSetSplit` is on.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {THREE.Scene} scene the world scene
 * @param {THREE.Camera} camera the view camera
 * @param {{ lx: number, ly: number, lw: number, lh: number }} viewport the on-screen rectangle, logical pixels
 * @param {number} visframe the current visibility frame (`r_visframecount`)
 * @param {?ArrayLike<number>} styles light style values (`d_lightstylevalue`)
 * @param {?Array<object>} dlights client dynamic lights (`cl_dlights`)
 * @param {number} time client time, seconds
 * @param {number} exposure the renderer's tone-mapping exposure (multiplied by the HDR exposure while lit)
 * @param {boolean} hasSkyView whether the map has sky (`R_MapHasSky`): outdoor exposure and softer bloom
 */
export function R_PostFinish( renderer, scene, camera, viewport, visframe, styles, dlights, time, exposure, hasSkyView ) {

	const p = gpu;
	const hdr = p.hdr;
	const sh = p.shared;

	const lighting = postState.glowActive;
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
	for ( const r of R_GetLiquidRegions() ) {

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
		for ( const r of R_GetLavaRegions() ) {

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
	cm.uUnderwater.value = postState.underwater ? 1 : 0;
	cm.uHeat.value = postState.underwater ? 0 : Math.max( 0, r_heathaze.value );
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

	cm.uEdge.value = postState.underwater || ! lighting ? 0 : Math.max( 0, r_newedges.value );
	const drops = R_ScreenDropsUpdate();
	cm.uDropDensity.value = postState.underwater ? 0 : drops.density;
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
	const waves = R_WaterActive() && R_WaterWavesLive() > 0; // (ripples on the water bend the finished picture: the present pass, card [W1])
	const upscale = (lighting && dyn.scale < 1) || visionOn || waves;
	// Rend the Veil consumes the existing linear composite, even when Newer
	// lighting is disabled. Its local optics never repeat bloom/display grading.
	const rendFields = R_NewerGame() ? R_RendVeilFields() : [];
	const dofFocus = R_DofFocus(); // (depth of field is drawn by the present pass, card [38])
	const offscreen = upscale || rendFields.length > 0 || dofFocus > 0;
	cm.uOffscreen.value = offscreen ? 1 : 0;
	if ( offscreen ) {

		const count=visionOn?2:1;
		if (p.composite===null || p.composite.textures.length!==count) {
			p.composite?.dispose();p.composite=makeRT(hdr.width,hdr.height,{count});
			if(visionOn){const t=p.composite.textures[1];t.type=THREE.UnsignedByteType;t.minFilter=t.magFilter=THREE.NearestFilter;t.userData.visionEncoded=true;}
		}
		runPass( renderer, p.compositeMaterial, p.composite );
		R_PerfStage( 'final lighting pass' );
		const shown = p.presentMaterial.uniforms;
		const coordinates=visionOn?p.composite.textures[1]:null;
		const veiled = rendFields.length > 0
			? R_RendVeilOptics( renderer, p.composite.texture, hdr.depthTexture, R_RendVeilBackgroundDepth(), camera, rendFields )
			: p.composite.texture;
		const visionSource=R_PowerVisionRender(renderer,veiled,hdr,camera,vision,cl,coordinates);
		shown.tComposite.value = R_QuadVisionRender(renderer,visionSource,hdr,camera,scene,coordinates);
		shown.uBright.value = cm.uBright.value;
		shown.uContrastGain.value = cm.uContrastGain.value;
		shown.uContrastPivot.value = cm.uContrastPivot.value;
		shown.uWaves.value = waves ? 1 : 0;
		shown.tNormal.value = cm.tNormal.value;
		if ( dofFocus > 0 ) {

			if ( p.dof === null || p.dof.width !== hdr.width || p.dof.height !== hdr.height ) { p.dof?.dispose(); p.dof = makeRT( hdr.width, hdr.height ); }
			const d = p.dofMaterial.uniforms, [ dofPx, dofMax ] = R_DofCircle( hdr.height );
			d.tComposite.value = shown.tComposite.value; d.tNormal.value = cm.tNormal.value;
			d.uDof.value.set( dofFocus, dofPx, dofMax ); d.uDofTexel.value.set( 1 / hdr.width, 1 / hdr.height ); d.uDofFar.value = R_DofFar();
			runPass( renderer, p.dofMaterial, p.dof );
			shown.tComposite.value = p.dof.texture;
			R_PerfStage( 'depth of field' );

		}

	} else { R_PowerVisionReset(); R_QuadVisionReset(); }

	renderer.setRenderTarget( null );
	renderer.setViewport( viewport.lx, viewport.ly, viewport.lw, viewport.lh );
	gpu.mesh.material = offscreen ? p.presentMaterial : p.compositeMaterial;
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

/**
 * The title demo's half-and-half comparison: while on, the final pass fills the left half only. Set each frame by
 * gl_rmain.js before `R_PostFinish`.
 *
 * @param {boolean} on true to draw only the left half (anything but `true` counts as false)
 */
export function R_PostSetSplit( on ) {

	splitLeft = on === true;

}

/**
 * Frees the pipeline: resets power and quad vision, the power-up fire target and the Rend the Veil optics, then
 * disposes the HDR targets, point-shadow atlas and sun shadow target. The next `R_PostBegin` that runs the
 * pipeline builds it again. Not called by the engine in the current tree; tests call it between fixtures.
 */
export function R_PostShutdown() {
	R_PowerVisionReset(true);
	R_QuadVisionReset();

	R_ClearPowerupFireTarget();
	R_RendVeilOpticsShutdown();

	if ( gpu === null ) return;
	disposeTargets();
	gpu.pointShadows.dispose();
	gpu.sunTarget.dispose();
	gpu.sunTarget.depthTexture.dispose();
	gpu = null;

}
