/**
 * @module newer/render/gl_post
 *
 * The HDR pipeline: emissive surfaces, sun and light shafts, relighting, water and its looks, bloom, depth of field
 * and the final composite.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `heightFrameSnapshot`.
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
import { R_PostVolumeBloom, R_PostComposite, R_PostSetSplit } from './r_post_composite.js';
export { R_PostSetSplit } from './r_post_composite.js';
import { R_PostLightUniforms } from './r_post_lights.js';
import { R_PostSkyUniforms } from './r_post_sky.js';

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


	R_PostLightUniforms( p, camera, frame, time, lighting );
	const sunOn = R_PostSkyUniforms( p, camera, time, lighting, hasSkyView );
	if ( sunOn ) {

		R_PostRenderSunShadow( renderer, scene, camera );
		R_PerfStage( 'sun shadow' );

	}

	const { volume, bloom } = R_PostVolumeBloom( renderer, p, fireFrame, exposure, hasSkyView, lighting );
	R_PostComposite( renderer, scene, camera, viewport, p, fireFrame, time, exposure, hasSkyView, lighting, volume, bloom );

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
