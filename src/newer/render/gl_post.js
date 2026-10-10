/**
 * @module newer/render/gl_post
 *
 * The HDR pipeline: emissive surfaces, sun and light shafts, relighting, water and its looks, bloom, depth of field
 * and the final composite.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `heightFrameSnapshot`, `splitLeft`.
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
import { R_RegisterGlow, R_GlowBoostForTexture, R_PostInstallGBufferPatch, R_RegisterDetail, R_RefreshDetail, pulseLava, setGlowActive, setDetailActive } from './r_post_gbuffer.js';
export { R_RegisterGlow, R_GlowBoostForTexture, R_PostInstallGBufferPatch, R_RegisterDetail, R_RefreshDetail } from './r_post_gbuffer.js';
import { skyState, sunFromAngles, buildSkyCookie, cookieNorm, cookieMean, cookieDepth, R_AnalyseSky, R_SkyBrightness, R_GetSkyInfo, R_PostNoteSky, R_MapHasSky } from './r_post_sky.js';
export { R_AnalyseSky, R_SkyBrightness, R_GetSkyInfo, R_PostNoteSky, R_MapHasSky } from './r_post_sky.js';
import { R_BuildWorldLights, R_GetWorldLights, R_FireFlicker, R_PostSetPortraitLight, R_SelectWorldLights, selectLights, _selected, R_PostSelectedCount, R_PostSetSelectedCount } from './r_post_lights.js';
export { R_BuildWorldLights, R_GetWorldLights, R_FireFlicker, R_PostSetPortraitLight, R_SelectWorldLights } from './r_post_lights.js';
import { R_BuildSunOccluder, R_PointShadowAtlas, R_PointShadowStatus, R_ReleaseShadowCaster, R_PostOccluder, R_PostRenderSunShadow, R_PostShadowsFrame } from './r_post_shadows.js';
export { R_BuildSunOccluder, R_PointShadowAtlas, R_PointShadowStatus, R_ReleaseShadowCaster } from './r_post_shadows.js';
import { R_DynResScale, R_PostSupported, dyn, dynResUpdate, makeRT, createPipeline, disposeTargets, ensureTargets, runPass } from './r_post_targets.js';
export { R_DynResScale, R_PostSupported } from './r_post_targets.js';

// Unlit material colour is retained separately from baked lighting. A surface
// without a light source need not be lifted merely to recover its colour later.


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
 if ( ! postState.gpu ) { heightFrameSnapshot = null; R_HeightShadowScope( false ); return null; }
 camera.updateMatrixWorld( true );
 if ( postState.glowActive ) selectLights( camera.matrixWorldInverse, visframe, styles, dlights, time );
 else R_PostSetSelectedCount( 0 );
 const lights = _selected.slice( 0, R_PostSelectedCount() ).map( light => ( { ...light, pos: light.pos.slice(), worldPos: light.worldPos.slice(), color: light.color.slice(), direction:light.direction.slice(), viewDirection:light.viewDirection.slice(), cone:light.cone.slice(), powerupRotation: light.source?.rotation?.slice() || [ 0, 0, 0, 1 ] } ) );
 const liveBeam = R_FlashlightBeam();
 const beam = { ...liveBeam, pos: liveBeam.pos.slice(), dir: liveBeam.dir.slice() };
 heightFrameSnapshot = { camera, visframe, time, lights, beam, hasSkyView };
 R_PostShadowsFrame( renderer, scene, camera, lights, beam, hasSkyView );
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
	skyState.seen = false;

	if ( active === false ) { R_PowerVisionReset(); R_QuadVisionReset(); return false; }

	if ( postState.gpu === null ) postState.gpu = createPipeline();
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

	renderer.setRenderTarget( postState.gpu.hdr );

}

const _clearColor = new THREE.Color();


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

	const p = postState.gpu;
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
 R_PostSetSelectedCount( frame?.lights.length || 0 );
 R_AliasReceiverPass(renderer,scene,camera,hdr);
 const fireFrame=R_DrawPowerupFire( renderer, scene, camera, hdr );
 R_PerfStage( 'power-up fire' );


	sh.tDepth.value = hdr.depthTexture;
	sh.uProj.value.copy( camera.projectionMatrix );
	sh.uProjInv.value.copy( camera.projectionMatrixInverse );
	sh.uViewInv.value.copy( camera.matrixWorld );
	sh.uNear.value = camera.near;
	sh.uFar.value = camera.far;
	sh.uCount.value = R_PostSelectedCount();
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
	for ( let i = 0, n = R_PostSelectedCount(); i < n; i ++ ) {

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

	const bright = R_SkyBrightness( skyState.info.luma );
	const sunGain = 0.5 + 0.9 * bright; // a dark sky still gives a little
	const tint = skyState.info.color;
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
	sh.tCookie.value = skyState.cookie;
	sh.tCookieCloud.value = skyState.cookieCloud;
	sh.uCookieCloud.value = skyState.cookieCloud !== null ? 1 : 0;
	sh.uCookie.value = skyState.cookie !== null ? 1 : 0;
	sh.uCookieTime.value = time * Math.max( 0, r_cloudspeed.value );
	if ( sunOn ) {

		const e = camera.matrixWorldInverse.elements;
		const sd = skyState.sunDirection;
		sh.uSunDirV.value.set(
			e[ 0 ] * sd[ 0 ] + e[ 4 ] * sd[ 1 ] + e[ 8 ] * sd[ 2 ],
			e[ 1 ] * sd[ 0 ] + e[ 5 ] * sd[ 1 ] + e[ 9 ] * sd[ 2 ],
			e[ 2 ] * sd[ 0 ] + e[ 6 ] * sd[ 1 ] + e[ 10 ] * sd[ 2 ] ).normalize();
		sh.uSunDirW.value.set( sd[ 0 ], sd[ 1 ], sd[ 2 ] ).normalize();
		R_PostRenderSunShadow( renderer, scene, camera );
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
	postState.gpu.mesh.material = offscreen ? p.presentMaterial : p.compositeMaterial;
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

	if ( postState.gpu === null ) return;
	disposeTargets();
	postState.gpu.pointShadows.dispose();
	postState.gpu.sunTarget.dispose();
	postState.gpu.sunTarget.depthTexture.dispose();
	postState.gpu = null;

}
