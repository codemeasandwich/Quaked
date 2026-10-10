/**
 * @module engine/render/gl_rmain
 *
 * The renderer's main loop (WinQuake gl_rmain.c) on Three.js: the frame, the view, the entities, and the calls into
 * Newer Game's effects and post-processing.
 *
 * Types: exported classes `mplane_t`.
 *
 * State: mutable exports `r_worldentity`, `r_cache_thrash`, `currententity`, `r_visframecount`, `c_brush_polys`,
 * `c_alias_polys`, `envmap`, `currenttexture`, `particletexture`, `playertextures`, `mirror`, `mirror_plane`,
 * `r_viewleaf`, `r_oldviewleaf`, `r_notexture_mip`, `gldepthmin`, `gldepthmax`, `glx`, `scene`, `camera`;
 * module-level variables `_entityMeshesInScene`, `_entityMeshesThisFrame`, `_gunPlacedFrame`, `_fireTexture`,
 * `_fireMaterial`, `_fireGeometry`, `_shadowFrame`, `_shadowCount`, `polyBlendMesh`, `polyBlendScene`,
 * `polyBlendCamera`, `_classicRestore` and 8 more; 5 module-level collections (Map/Set).
 *
 * Errors: catches at 3 places.
 */
import {R_RendVeilSeen,R_RendVeilRelease,R_RendVeilClear,R_RendVeilBegin,R_RendVeilEnd,R_RendVeilCapture} from '../../r_rendveil.js';
import {sv,svs} from '../server/server.js';
import { R_RespawnCameraFrame } from '../../r_respawn.js';
import { R_DemonBakeRelease } from '../../r_demonbakes.js';
import { R_CompileSceneAsync, R_ShaderAssetStamp } from '../../r_shaderwarm.js';
import { R_RockfieldSetLimits, R_RockfieldStatus } from '../../r_rockfield.js';
import { R_IntroLoadingHolding, R_DemoLoadingWelcome, R_DemoLoadingFrame, R_IntroReadinessChecks } from '../../r_demoloading.js';
import { R_NewerTexturesStatus,R_NewerNormalsStatus,R_NewerNormalsPrepare } from '../../r_newertextures.js';
import { R_NewerSkinsPrepare, R_NewerSkinsStatus, R_NewerSkinsMaterials, R_NewerSkinsTextures } from '../../newer/render/r_newerskins.js';
import { R_WeaponsPreload, R_WeaponStatus, R_WeaponMaterials, R_WeaponTextures, R_WeaponsEnabled, R_WeaponHeldPullback } from '../../newer/render/r_weapons.js';
import { R_NewerHudPreload, R_NewerHudStatus } from '../../r_newerhud.js';
import { r_powerups, R_PowerupBegin, R_PowerupSeen, R_PowerupEnd, R_PowerupClear } from '../../r_powerups.js';
import { R_AxeCorpsesFrame, R_ClearAxeCorpses } from '../../newer/render/r_axecorpses.js';
import { SV_AxeEntitySuppressed } from '../../newer/gameplay/sv_axecut.js';
import { R_PointShadowStatus, R_WaterStartupStatus } from '../../gl_post.js';
import { R_DemonReliefStatus, R_ClassicArchVisibility } from './gl_rsurf.js';
// Ported from: WinQuake/gl_rmain.c -- main GL renderer
// + WinQuake/glquake.h -- GL definitions

import * as THREE from 'three';
import { Sys_FloatTime } from '../common/sys.js';
import { Con_Printf } from '../common/common.js';
import { PITCH, YAW, ROLL } from '../common/quakedef.js';
import { cvar_t, Cvar_RegisterVariable } from '../common/cvar.js';
import { r_rockfield } from '../../r_rockfield.js';
import { r_portals, R_PortalsBeginFrame, R_RenderPortals, R_GetPortals, R_LevelPortalMatrix, R_ImpactPortalPlanes } from '../../gl_portal.js';
import { r_heightshadows, R_HeightShadowScope } from '../../r_heightshadows.js';
import { R_AnimEnabled, R_NewerLightingActive, R_NewerGame, R_SmoothMove, r_lerpmodels, r_newer_lighting, r_newer_normals, r_newer_water, r_newer_enemies, r_newer_portals, r_newer_textures, r_newer_hud, r_newer_shadows, r_newer_crates } from '../../newer/render/r_anim.js';
import { R_NewerTexturesFrame } from '../../r_newertextures.js';
import { R_PerfStage, R_PerfInit, cl_showfps } from '../../r_perf.js';
import { R_WarmLevel, R_WarmFrame } from '../../r_prewarm.js';
import { CL_TeleportSpots } from '../client/cl_tent.js';
import { R_SetupLevelViews, R_LevelViewUseSnapshots, R_UpdateLevelViewEntities, R_SyncLevelViews } from '../../newer/render/r_levelview.js';
import { R_WeaponSurfaceContext, R_WeaponSurfaceFrame } from '../../newer/render/r_weapon_surface.js';
import { R_ScreenDropsSetView, R_ScreenDropsView, R_ScreenDropsReset } from '../../r_screendrops.js';
import { R_MistFrame, R_MistClear } from '../../r_mist.js';
import { r_fireball, r_fireballalpha, r_smoketrails, R_FireballSetup, R_FireballFrame, R_FireballClear, R_FireballReplacesSprite } from '../../r_fireball.js';
import { r_impactripples, R_ImpactRipplesSetup, R_ImpactRippleFrame, R_ImpactRippleReset, R_ImpactRippleListen } from '../../r_impactripples.js';
import { R_WavesSetup, R_WavesFrame, R_WavesReset, R_WaveImpact } from '../../r_waves.js';
import { r_newer_lightning, R_LightningSetup, R_LightningFrame, R_LightningClear, R_LightningTakesBeam } from '../../r_lightning.js';
import { CL_PlayerLightning } from '../client/cl_tent.js';
import { r_newer_wallburn, R_WallBurnSetup, R_WallBurnFrame, R_WallBurnClear, R_AliasFrameBox } from '../../r_wallburn.js';
import { r_dof, R_DofSetup, R_DofFrame, R_DofClear } from '../../r_dof.js';
import { r_shotgunfx, R_ShotgunSetup, R_ShotgunFrame, R_ShotgunClear, viewModelMuzzles } from '../../r_shotgun.js';
import { r_torchfire, R_TorchFire, TORCH_WHOLE, TORCH_HANDLE, torchParts, R_TorchFireSetup, R_TorchFireBegin, R_TorchFireFlush, R_TorchFireClear } from '../../r_torchfire.js';
import { CL_AllocDlight } from '../client/cl_main.js';
import { R_ClassicTexture } from '../../r_newertextures.js';
import { R_AnimSetClassicPass, R_ClassicPassActive, R_IsNewer } from '../../newer/render/r_anim.js';
import { R_SaveClassicScene, R_ClassicMaterial } from '../../newer/render/r_classicstate.js';
import { R_DemoSplitFull, R_DemoSplitActive, R_DemoSplitClassic, r_demosplit } from '../../r_demosplit.js';
import { r_decals, R_DecalsSetup, R_DecalsFrame, R_DecalsClear, R_DecalGibTrack } from '../../r_decals.js';
import { r_newer_weapons } from '../../newer/render/r_weapons.js';
import { R_ShellsSetup, R_ShellsNewMap, R_ShellsFrame } from '../../newer/render/r_shells.js';
import { R_ShellTrace } from '../../newer/render/r_shelltrace.js';
import { R_BestiaryApplyCamera, R_BestiaryObserve, R_BestiaryInputLocked } from '../../r_bestiary.js';
import { r_flashlight, R_FlashlightInit, R_FlashlightUpdate, R_FlashlightBeam } from '../../r_flashlight.js';
import { R_MuzzleSetView, R_MuzzleSetProbe } from '../../r_muzzle.js';
import { SV_SeamlessCrossings, SV_SeamlessPending, SV_SetLiquidLinks, SV_SetWarmLevel, SV_LevelSnapshotEntities } from '../../newer/gameplay/sv_seamless.js';
import { r_newer_variety, R_NewerSkinsNewMap, R_CloneAliasMaterial, R_ReleaseAliasReceiver, R_HeldVisionTag } from '../../newer/render/r_newerskins.js';
import { PowerVisionMode } from '../../newer/gameplay/powervision_state.js';
import { R_PostSetSplit, classicLook, R_WaterProbesFrame, r_reflect_screen, r_bounce, r_cloudspeed, r_pillars, r_heathaze, r_mist, r_reflect, r_water_look, r_hdr, r_pointshadows, r_newdark, r_newedges, r_bloom, r_volumetric, r_caustics, r_newbright, r_newcontrast, R_PostBegin, R_PostBind, R_PostFinish, R_PostLightsFrame, R_PostActive, R_WaterActive, R_MapHasSky, R_RegisterGlow, R_PostSetUnderwater, R_GetLiquidLinks, R_GetWorldLights, R_FireFlicker, R_DynResScale, r_dynres, r_fps_target, SUN_SHADOW_LAYER } from '../../gl_post.js';
import { vid, renderer } from './vid.js';
import { r_refdef, r_origin, vpn, vright, vup, entity_t } from './render.js';
import {
	M_PI, DotProduct, VectorCopy, VectorAdd, VectorSubtract, VectorMA,
	VectorNormalize, AngleVectors, Length, RotatePointAroundVector, BoxOnPlaneSide
} from '../common/mathlib.js';
import { R_DrawWorld as R_DrawWorld_impl, R_MarkLeaves as R_MarkLeaves_impl, GL_BuildLightmaps as GL_BuildLightmaps_rsurf, R_DrawBrushModel as R_DrawBrushModel_rsurf, R_DrawWaterSurfaces as R_DrawWaterSurfaces_rsurf, R_CleanupWaterMeshes as R_CleanupWaterMeshes_rsurf, createQuakeLightmapMaterial, R_WorldShowAll, R_ClassicSurfaceMaterial, R_ClassicLightmapsFrame, R_ClassicLightmap } from './gl_rsurf.js';
import { Mod_PointInLeaf, Mod_LeafPVS, SPR_SINGLE, SPR_ORIENTED } from './gl_model.js';
import { R_AnimateLight as R_AnimateLight_impl, R_PushDlights as R_PushDlights_impl, R_RenderDlights as R_RenderDlights_impl, R_LightPoint, lightspot, lightplane } from './gl_rlight.js';
import { R_DrawAliasModel as R_DrawAliasModel_mesh, GL_DrawAliasShadow, GL_DrawAliasLightShadow } from './gl_mesh.js';
import { r_avertexnormal_dots } from '../common/anorm_dots.js';
import { V_SetContentsColor as V_SetContentsColor_view, V_CalcBlend as V_CalcBlend_view } from '../client/view.js';
import { chase_active } from '../client/chase.js';
import {
	R_InitParticles, R_SetParticleExternals, R_ClearParticles,
	R_DrawParticles as R_DrawParticles_impl
} from './r_part.js';
import { isXRActive, getXRRig, XR_SetCamera, XR_SCALE, XR_GetControllerWorldPose } from '../../platform/webxr.js';
import {
	cl, cls, ca_connected, cl_visedicts, cl_numvisedicts, cl_dlights, cl_entities,
	cl_static_entities, cl_temp_entities, cl_lightstyle
} from '../client/client.js';
import { d_lightstylevalue, r_framecount, set_r_framecount, inc_r_framecount,
	v_blend, v_liquid_blend, mirrortexturenum, set_mirrortexturenum,
	r_norefresh, r_drawentities, r_drawviewmodel, r_speeds,
	r_fullbright, r_lightmap, r_shadows, r_mirroralpha,
	r_wateralpha, r_dynamic, r_novis, r_drawworld, r_waterwarp,
	gl_clear, gl_cull, gl_texsort, gl_smoothmodels, gl_affinemodels,
	gl_polyblend, gl_flashblend, gl_playermip, gl_nocolors,
	gl_keeptjunctions, gl_reporttjunctions,
	gl_doubleeyes, gl_max_size
} from './glquake.js';
export { GL_BuildLightmaps_rsurf as GL_BuildLightmaps };
export { r_norefresh, r_drawentities, r_drawviewmodel, r_speeds,
	v_blend, mirrortexturenum, set_mirrortexturenum,
	r_fullbright, r_lightmap, r_shadows, r_mirroralpha,
	r_wateralpha, r_dynamic, r_novis, r_drawworld, r_waterwarp,
	gl_clear, gl_cull, gl_texsort, gl_smoothmodels, gl_affinemodels,
	gl_polyblend, gl_flashblend, gl_playermip, gl_nocolors,
	gl_keeptjunctions, gl_reporttjunctions,
	gl_doubleeyes, gl_max_size };

//============================================================================
// glquake.h constants
//============================================================================

export const ALIAS_BASE_SIZE_RATIO = ( 1.0 / 11.0 );
export const MAX_LBM_HEIGHT = 480;

export const TILE_SIZE = 128;
export const SKYSHIFT = 7;
export const SKYSIZE = ( 1 << SKYSHIFT );
export const SKYMASK = ( SKYSIZE - 1 );

export const BACKFACE_EPSILON = 0.01;

export const VERTEXSIZE = 7; // x, y, z, s, t, lightmap_s, lightmap_t

// plane types for fast side tests
export const PLANE_X = 0;
export const PLANE_Y = 1;
export const PLANE_Z = 2;
export const PLANE_ANYZ = 3;

// model types
export const mod_brush = 0;
export const mod_sprite = 1;
export const mod_alias = 2;

// surface flags
export const SURF_PLANEBACK = 2;
export const SURF_DRAWSKY = 4;
export const SURF_DRAWSPRITE = 8;
export const SURF_DRAWTURB = 0x10;
export const SURF_DRAWTILED = 0x20;
export const SURF_DRAWBACKGROUND = 0x40;
export const SURF_UNDERWATER = 0x80;

// max dlights
export const MAX_DLIGHTS = 32;
export const MAXLIGHTMAPS = 4;
export const MAX_VISEDICTS = 256;

//============================================================================
// Globals from gl_rmain.c
//============================================================================

// Deferred initialization — entity_t may not be available at module load time
// due to circular imports (gl_rmain -> gl_model -> gl_mesh -> gl_rmisc -> gl_rmain).
// Initialized in R_Init().
export let r_worldentity = null;

export let r_cache_thrash = false; // compatability

export const modelorg = new Float32Array( 3 );
export const r_entorigin = new Float32Array( 3 );
export let currententity = null; // entity_t pointer

export let r_visframecount = 0; // bumped when going to a new PVS

// frustum planes (4 planes for view frustum)
export class mplane_t {

	constructor() {

		this.normal = new Float32Array( 3 );
		this.dist = 0;
		this.type = 0; // for texture axis selection and fast side tests
		this.signbits = 0; // signx + signy<<1 + signz<<2

	}

}

export const frustum = [
	new mplane_t(), new mplane_t(), new mplane_t(), new mplane_t()
];

export let c_brush_polys = 0;
export let c_alias_polys = 0;

export let envmap = false; // true during envmap command capture

export let currenttexture = - 1; // to avoid unnecessary texture sets
export const cnttextures = [ - 1, - 1 ]; // cached

export let particletexture = 0; // little dot for particles
export let playertextures = 0; // up to 16 color translated skins

export let mirror = false;
export let mirror_plane = null; // mplane_t pointer

export const r_world_matrix = new Float32Array( 16 );
const r_base_world_matrix = new Float32Array( 16 );

export let r_viewleaf = null; // mleaf_t
export let r_oldviewleaf = null; // mleaf_t

export let r_notexture_mip = null;

// Shared renderer state is imported from glquake.js and re-exported here so
// gl_rsurf.js keeps its existing dependency without adding a gl_rlight cycle.
export { d_lightstylevalue, r_framecount, set_r_framecount, inc_r_framecount };
export { chase_active };

export let gldepthmin = 0;
export let gldepthmax = 1;

// Setter functions for mutable state (ES module imports are read-only)
export function set_r_visframecount( v ) { r_visframecount = v; }
export function inc_r_visframecount() { return ++ r_visframecount; }
export function set_r_worldentity( value ) { r_worldentity = value; }
export function set_currententity( value ) { currententity = value; }
export function set_c_brush_polys( v ) { c_brush_polys = v; }
export function inc_c_brush_polys() { return ++ c_brush_polys; }
export function set_currenttexture( v ) { currenttexture = v; }
export function set_r_oldviewleaf( v ) { r_oldviewleaf = v; }
export function set_r_viewleaf( v ) { r_viewleaf = v; }
export function set_mirror( v ) { mirror = v; }
export function set_mirror_plane( v ) { mirror_plane = v; }

export let glx = 0, gly = 0, glwidth = 0, glheight = 0;

//============================================================================
// Three.js scene and camera (replace raw GL state)
//============================================================================

export let scene = null; // THREE.Scene
export let camera = null; // THREE.PerspectiveCamera

//============================================================================
// Cvars
//============================================================================

// Most cvars are defined in glquake.js and imported+re-exported above.
// They are registered in gl_rmisc.js R_Init().
// gl_ztrick is unique to gl_rmain (not in glquake.js).
export const gl_ztrick = new cvar_t( 'gl_ztrick', '1' );

//============================================================================
// R_CullBox
//
// Returns true if the box is completely outside the frustum
//============================================================================

export function R_CullBox( mins, maxs ) {

	for ( let i = 0; i < 4; i ++ ) {

		if ( BoxOnPlaneSide( mins, maxs, frustum[ i ] ) === 2 )
			return true;

	}

	return false;

}

//============================================================================
// SignbitsForPlane
//============================================================================

function SignbitsForPlane( out ) {

	// for fast box on planeside test
	let bits = 0;
	for ( let j = 0; j < 3; j ++ ) {

		if ( out.normal[ j ] < 0 )
			bits |= 1 << j;

	}

	return bits;

}

//============================================================================
// R_SetFrustum
//============================================================================

export function R_SetFrustum() {

	if ( r_refdef.fov_x === 90 ) {

		// front side is visible
		VectorAdd( vpn, vright, frustum[ 0 ].normal );
		VectorSubtract( vpn, vright, frustum[ 1 ].normal );

		VectorAdd( vpn, vup, frustum[ 2 ].normal );
		VectorSubtract( vpn, vup, frustum[ 3 ].normal );

	} else {

		// rotate VPN right by FOV_X/2 degrees
		RotatePointAroundVector( frustum[ 0 ].normal, vup, vpn, - ( 90 - r_refdef.fov_x / 2 ) );
		// rotate VPN left by FOV_X/2 degrees
		RotatePointAroundVector( frustum[ 1 ].normal, vup, vpn, 90 - r_refdef.fov_x / 2 );
		// rotate VPN up by FOV_Y/2 degrees
		RotatePointAroundVector( frustum[ 2 ].normal, vright, vpn, 90 - r_refdef.fov_y / 2 );
		// rotate VPN down by FOV_Y/2 degrees
		RotatePointAroundVector( frustum[ 3 ].normal, vright, vpn, - ( 90 - r_refdef.fov_y / 2 ) );

	}

	for ( let i = 0; i < 4; i ++ ) {

		frustum[ i ].type = PLANE_ANYZ;
		frustum[ i ].dist = DotProduct( r_origin, frustum[ i ].normal );
		frustum[ i ].signbits = SignbitsForPlane( frustum[ i ] );

	}

}

//============================================================================
// R_SetupFrame
//============================================================================

const _bloodRay=new THREE.Raycaster(),_bloodBox=new THREE.Box3(),_bloodCentre=new THREE.Vector3(),_bloodOrigin=new THREE.Vector3();
const _surfaceBloodContact=point=>{
 const mesh=cl.viewent?._aliasMesh;if(!mesh||!mesh.visible||mesh.parent!==scene||!point)return null;
 for(let p=mesh.parent;p;p=p.parent)if(!p.visible)return null;
 mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
 mesh.updateMatrixWorld(true);_bloodBox.setFromObject(mesh);_bloodBox.getCenter(_bloodCentre);_bloodOrigin.fromArray(point);
 const distance=_bloodCentre.distanceTo(_bloodOrigin);if(distance<.001)return null;
 _bloodRay.set(_bloodOrigin,_bloodCentre.sub(_bloodOrigin).normalize());_bloodRay.far=distance+100;
 const hit=_bloodRay.intersectObject(mesh,false)[0];return hit?.uv?[hit.uv.x,hit.uv.y]:null;
};
const _surfaceBloodVisible=(a,b)=>{const trace=R_ShellTrace(cl.worldmodel,a,b,0,cl_entities);return !trace.startsolid&&!trace.allsolid&&trace.fraction>=.999;};
export function R_SetupFrame() {

	// don't allow cheats in multiplayer
	if ( cl && cl.maxclients > 1 ) {

		r_fullbright.value = 0;
		r_fullbright.string = '0';

	}

	R_AnimateLight();

	inc_r_framecount();

	// build the transformation matrix for the given view angles
	VectorCopy( r_refdef.vieworg, r_origin );

	AngleVectors( r_refdef.viewangles, vpn, vright, vup );

	// current viewleaf
	r_oldviewleaf = r_viewleaf;
	if ( cl && cl.worldmodel ) {

		r_viewleaf = Mod_PointInLeaf( r_origin, cl.worldmodel );
		R_ScreenDropsSetView( r_origin );
		R_ScreenDropsView( r_viewleaf.contents );
  R_WeaponSurfaceContext(R_NewerGame(),r_origin,_surfaceBloodVisible,_surfaceBloodContact);
  if(cls.signon===4)R_WeaponSurfaceFrame(cl.time,r_viewleaf.contents,cl.paused);
		R_PostSetUnderwater( r_viewleaf.contents === - 3 || r_viewleaf.contents === - 4 || r_viewleaf.contents === - 5 );

	}

	V_SetContentsColor( r_viewleaf ? r_viewleaf.contents : 0 );
	V_CalcBlend();

	r_cache_thrash = false;

	c_brush_polys = 0;
	c_alias_polys = 0;

}

//============================================================================
// R_ComputeViewport
//
// The 3D view's rectangle: physical pixels ( width / height, used to size the
// HDR target ) and the logical rectangle handed to Three.js.
//============================================================================

const _viewport = { width: 0, height: 0, lx: 0, ly: 0, lw: 0, lh: 0 };

function R_ComputeViewport() {

	renderer.getDrawingBufferSize( _setupgl_drawingBufferSize );
	const bufferWidth = _setupgl_drawingBufferSize.x;
	const bufferHeight = _setupgl_drawingBufferSize.y;
	const scale = r_refdef.vrectScale;
	let x = r_refdef.vrect.x * scale;
	let x2 = ( r_refdef.vrect.x + r_refdef.vrect.width ) * scale;
	let y = bufferHeight - r_refdef.vrect.y * scale;
	let y2 = bufferHeight -
		( r_refdef.vrect.y + r_refdef.vrect.height ) * scale;

	// Match GLQuake's one-pixel expansion around fractional view boundaries.
	if ( x > 0 ) x --;
	if ( x2 < bufferWidth ) x2 ++;
	if ( y2 < 0 ) y2 --;
	if ( y < bufferHeight ) y ++;

	const pixelRatio = renderer.getPixelRatio();
	_viewport.width = Math.round( x2 - x );
	_viewport.height = Math.round( y - y2 );
	_viewport.lx = x / pixelRatio;
	_viewport.ly = y2 / pixelRatio;
	_viewport.lw = ( x2 - x ) / pixelRatio;
	_viewport.lh = ( y - y2 ) / pixelRatio;

	return _viewport;

}

//============================================================================
// R_SetupGL
//
// Instead of raw GL matrix setup, we configure the Three.js camera
// to match Quake's projection and modelview matrices.
//============================================================================

export function R_SetupGL() {

	const screenaspect = r_refdef.vrect.width / r_refdef.vrect.height;

	// set up Three.js camera to match Quake's perspective
	if ( camera == null ) {

		camera = new THREE.PerspectiveCamera(
			r_refdef.fov_y,
			screenaspect,
			4, // zNear
			4096 // zFar
		);

		// Parent camera to XR rig (if available).
		// In non-XR: parent doesn't matter (matrixAutoUpdate = false).
		// In XR: Three.js composes rig.matrixWorld × camera.matrix (headset pose).
		XR_SetCamera( camera );

	} else {

		camera.fov = r_refdef.fov_y;
		camera.aspect = screenaspect;

		// In XR mode, scene is in meters (1/XR_SCALE). Three.js XR uses
		// camera.near/far for clipping, so convert to meters.
		if ( isXRActive() ) {

			camera.near = 4 / XR_SCALE;
			camera.far = 4096 / XR_SCALE;

		} else {

			camera.near = 4;
			camera.far = 4096;

		}

		camera.updateProjectionMatrix();

	}

	//
	// Quake's coordinate system:
	//   X = forward, Y = left, Z = up
	//
	// Three.js coordinate system:
	//   X = right, Y = up, Z = backward (out of screen)
	//
	// The original GL code does:
	//   glRotatef(-90, 1, 0, 0) -- put Z going up
	//   glRotatef(90, 0, 0, 1)  -- put Z going up
	//   glRotatef(-viewangles[ROLL], 1, 0, 0)
	//   glRotatef(-viewangles[PITCH], 0, 1, 0)
	//   glRotatef(-viewangles[YAW], 0, 0, 1)
	//   glTranslatef(-vieworg[0], -vieworg[1], -vieworg[2])
	//
	// We replicate this with Three.js by setting camera position and rotation.

	//
	// Position the camera in Quake world coordinates.
	// Geometry vertices are in Quake coords (X=forward, Y=left, Z=up).
	// Three.js camera looks down -Z with Y=up.
	//
	// We keep all geometry in Quake coordinate space and set up the camera
	// to match, using the same modelview matrix as the original GL code:
	//
	//   glRotatef(-90, 1, 0, 0)   -- maps Quake Z-up to GL Y-up
	//   glRotatef(90, 0, 0, 1)    -- maps Quake X-forward to GL -Z-forward
	//   glRotatef(-roll, 1, 0, 0)
	//   glRotatef(-pitch, 0, 1, 0)
	//   glRotatef(-yaw, 0, 0, 1)
	//   glTranslatef(-vieworg)
	//

	// Set camera position directly in Quake coordinates
	camera.position.set(
		r_refdef.vieworg[ 0 ],
		r_refdef.vieworg[ 1 ],
		r_refdef.vieworg[ 2 ]
	);

	// Build orientation using AngleVectors to get forward/right/up
	AngleVectors( r_refdef.viewangles, _setupgl_forward, _setupgl_right, _setupgl_up );

	// Build a rotation matrix from the Quake basis vectors.
	// In Quake: forward = where camera looks, right = camera right, up = camera up.
	// Three.js camera looks down -Z, X=right, Y=up.
	// GLQuake uses glCullFace(GL_FRONT) to cull front faces (keeping back faces).
	// We match this with THREE.BackSide on materials.
	const forward = _setupgl_forward, right = _setupgl_right, up = _setupgl_up;
	const m = _setupgl_matrix;

	if ( isXRActive() ) {

		// In XR mode: scene.scale = 1/XR_SCALE puts everything in meters.
		// The rig is NOT in the scene, so it operates in meter space directly.
		// Three.js XR composes: rig.matrixWorld × camera.matrix (headset pose).
		//
		// Position the rig at vieworg (player eye level).
		// With 'local' reference space, the XR origin is at the headset's
		// starting position (no floor offset), so the rig position directly
		// corresponds to where the user sees from in the Quake world.
		const rig = getXRRig();
		if ( rig != null ) {

			const s = 1 / XR_SCALE;
			rig.position.set(
				r_refdef.vieworg[ 0 ] * s,
				r_refdef.vieworg[ 1 ] * s,
				r_refdef.vieworg[ 2 ] * s
			);

			// Build rotation-only matrix (coord conversion + viewangles)
			m.set(
				right[ 0 ], up[ 0 ], - forward[ 0 ], 0,
				right[ 1 ], up[ 1 ], - forward[ 1 ], 0,
				right[ 2 ], up[ 2 ], - forward[ 2 ], 0,
				0, 0, 0, 1
			);
			rig.quaternion.setFromRotationMatrix( m );

			// Rig is not in the scene graph, so manually update its matrixWorld
			rig.updateMatrixWorld( true );

		}

		// Let Three.js compose matrixWorld from rig × headset pose
		camera.matrixWorldAutoUpdate = true;

	} else {

		// Non-XR mode: set camera matrixWorld directly (existing behavior).
		// matrixWorldAutoUpdate must be false so Three.js doesn't overwrite
		// our manually-set matrixWorld from the parent rig's transform.
		m.set(
			right[ 0 ], up[ 0 ], - forward[ 0 ], r_refdef.vieworg[ 0 ],
			right[ 1 ], up[ 1 ], - forward[ 1 ], r_refdef.vieworg[ 1 ],
			right[ 2 ], up[ 2 ], - forward[ 2 ], r_refdef.vieworg[ 2 ],
			0, 0, 0, 1
		);

		camera.matrixAutoUpdate = false;
		camera.matrixWorldAutoUpdate = false;
		camera.matrixWorld.copy( m );
		camera.matrixWorldInverse.copy( m ).invert();
		camera.matrixWorld.decompose( camera.position, camera.quaternion, camera.scale );

	}

	R_RespawnCameraFrame( camera );
	if ( R_BestiaryApplyCamera( camera ) ) {
		const e=camera.matrixWorld.elements;
		vpn.set([-e[8],-e[9],-e[10]]);vright.set([e[0],e[1],e[2]]);vup.set([e[4],e[5],e[6]]);
		R_SetFrustum();
	}

	// Store world matrix for later use (mirror rendering, etc.)
	const elements = camera.matrixWorldInverse.elements;
	for ( let i = 0; i < 16; i ++ ) {

		r_world_matrix[ i ] = elements[ i ];

	}

	// The view rectangle uses virtual 2D coordinates with a top-left origin.
	// Recreate Quake's physical-pixel viewport, then convert back to the logical
	// coordinates Three.js expects before it reapplies the renderer pixel ratio.
	if ( isXRActive() === false && renderer !== null ) {

		const vp = R_ComputeViewport();
		renderer.setViewport( vp.lx, vp.ly, vp.lw, vp.lh );

	}

	// Update viewport dimensions
	glx = 0;
	gly = 0;
	glwidth = vid.width;
	glheight = vid.height;

}

//============================================================================
// R_Clear
//============================================================================

export function R_Clear() {

	if ( ! renderer ) return;

	// In Three.js, clearing is handled by renderer.clear()
	// We configure the clear behavior based on cvars

	if ( gl_clear.value || R_PostActive() ) {

		renderer.setClearColor( 0x000000, 1 );
		renderer.clear( true, true, false );

	} else {

		renderer.clear( false, true, false ); // depth only

	}

	gldepthmin = 0;
	gldepthmax = 1;

}

//============================================================================
// R_DrawEntitiesOnList
//============================================================================

export function R_DrawEntitiesOnList() {

	if ( ! r_drawentities.value )
		return;

	// first pass: draw alias and brush models
	for ( let i = 0; i < cl_numvisedicts; i ++ ) {

		currententity = cl_visedicts[ i ];

		if ( ! currententity || ! currententity.model )
			continue;

		switch ( currententity.model.type ) {

			case mod_alias:
				if ( currententity._playerLightning === true && R_LightningTakesBeam() ) break; // drawn by r_lightning.js (card [30a])
				R_DrawAliasModel( currententity );
				break;

			case mod_brush:
				// Cached brush geometry/poses are shared; only its material needs
				// replacing in the classic pass. Avoid rebaking enhanced atlases.
				if ( ! R_ClassicPassActive() ) R_DrawBrushModel( currententity );
				break;

			default:
				break;

		}

	}

	// second pass: draw sprites separately because of alpha blending
	for ( let i = 0; i < cl_numvisedicts; i ++ ) {

		currententity = cl_visedicts[ i ];

		if ( ! currententity || ! currententity.model )
			continue;

		switch ( currententity.model.type ) {

			case mod_sprite:
				if ( R_FireballReplacesSprite( currententity ) ) break; // the Fireball is this explosion
				R_DrawSpriteModel( currententity );
				break;

		}

	}

}

//============================================================================
// R_DrawViewModel
//============================================================================

const SHADEDOT_QUANT = 16;
const _heldPullbackDirection = new THREE.Vector3();

// Cached callbacks for viewmodel depthRange hack (no closures in render loop)
function _viewmodelBeforeRender( r, scene, drawCamera ) {
 if(drawCamera!==camera)return;

	r.getContext().depthRange( 0, 0.3 );

}

function _viewmodelAfterRender( r, scene, drawCamera ) {
 if(drawCamera!==camera)return;

	r.getContext().depthRange( 0, 1 );

}

// No-op callback (Three.js requires onBeforeRender/onAfterRender to be functions, never null)
function _noop() {}

// Cached objects for XR weapon positioning (Golden Rule #4: no allocations in render loop)
const _xrControllerWorldPos = new THREE.Vector3();
const _xrControllerQuat = new THREE.Quaternion();

// Alignment quaternion: maps Quake model axes to XR controller axes.
// Quake model: +X = barrel forward, +Y = left, +Z = up
// XR pointer:  -Z = forward,       -X = left,  +Y = up
// Rotation matrix: model→controller = [[0,-1,0],[0,0,1],[-1,0,0]]
const _xrWeaponAlignQuat = new THREE.Quaternion().setFromRotationMatrix(
	new THREE.Matrix4().set(
		0, - 1, 0, 0,
		0, 0, 1, 0,
		- 1, 0, 0, 0,
		0, 0, 0, 1
	)
);

export function R_DrawViewModel() {
	if ( R_BestiaryInputLocked() ) { const mesh=cl?.viewent?._aliasMesh;if(mesh?.parent===scene)scene.remove(mesh);return; }

	if ( r_drawviewmodel.value === 0 )
		return;

	if ( chase_active.value !== 0 )
		return;

	if ( envmap )
		return;

	if ( r_drawentities.value === 0 )
		return;

	if ( cl == null )
		return;

	// With the Ring, Quake hides the gun. In Newer Game's Unseen World vision the gun is drawn and tagged as a subject, so the
	// vision renders it as it renders the enemies; Classic (and Newer without the vision pass) keeps it hidden.
	const unseenWorld = R_NewerGame() && PowerVisionMode( cl, R_PostActive() ) === 1;
	R_HeldVisionTag.value = unseenWorld ? .065 : .08;
	if ( ( cl.items & 524288 ) && ! unseenWorld ) // IT_INVISIBILITY
		return;

	if ( cl.stats != null && cl.stats[ 0 ] <= 0 ) // STAT_HEALTH
		return;

	currententity = cl.viewent;
	if ( currententity == null || currententity.model == null )
		return;

	// Draw normally — stays in main scene with all lights
	R_DrawAliasModel( currententity );

	const mesh = currententity._aliasMesh;
	if ( mesh == null )
		return;
	_gunPlacedFrame = r_framecount; // (the gun is placed this frame: the shotgun's muzzle may be read from it)

	// In XR mode: position weapon at controller.
	// Scene is scaled 1/XR_SCALE (meters). Controller world pos is in meters.
	// Weapon mesh is a child of scene, so its position is in scene-local Quake units.
	// Convert: controller meters * XR_SCALE = Quake units.
	if ( isXRActive() ) {

		// Ensure weapon mesh is in the scene
		if ( mesh.parent !== scene && scene != null ) {

			scene.add( mesh );
			_entityMeshesInScene.add( mesh );

		}

		if ( XR_GetControllerWorldPose( _xrControllerWorldPos, _xrControllerQuat ) ) {

			// Controller world pos is in meters → multiply by XR_SCALE for scene-local Quake units
			mesh.position.copy( _xrControllerWorldPos ).multiplyScalar( XR_SCALE );

			// Rotation: controller world quat * alignment to orient Quake model axes
			mesh.quaternion.copy( _xrControllerQuat ).multiply( _xrWeaponAlignQuat );

			// Scale 1: geometry is in Quake units, scene.scale handles the rest
			mesh.scale.setScalar( 1 );

		}

		// No depthRange hack in XR — weapon renders at actual world position
		mesh.renderOrder = 0;
		mesh.onBeforeRender = _noop;
		mesh.onAfterRender = _noop;

	} else {

		// Non-XR: ensure mesh is in scene (handles returning from XR too)
		if ( mesh.parent !== scene && scene != null ) {

			scene.add( mesh );
			mesh.scale.setScalar( 1 );
			_entityMeshesInScene.add( mesh );

		}

		// Non-XR: apply depthRange hack so weapon renders on top of world
		const baseMaterial = mesh.material;
		const slot = R_ClassicPassActive() ? '_classicViewmodelMaterial' : '_viewmodelMaterial';
		const baseSlot = slot + 'Base';
		if ( currententity[ slot ] == null || currententity[ baseSlot ] !== baseMaterial ) {

			// A previous clone may still be compiling asynchronously. Retain one
			// per base until map teardown instead of disposing on a weapon switch.
			const cacheSlot = slot + 'Cache';
			if ( ! currententity[ cacheSlot ] ) currententity[ cacheSlot ] = new Map();
			let clone = currententity[ cacheSlot ].get( baseMaterial );
			if ( ! clone ) {

				clone = R_CloneAliasMaterial( baseMaterial );
    if(slot==='_classicViewmodelMaterial')clone.transparent=true;
    else {clone.userData.quakeViewmodel=true;clone.userData.quakePlayerSurface=true;}
				currententity[ cacheSlot ].set( baseMaterial, clone );

			}
			currententity[ slot ] = clone;
			currententity[ baseSlot ] = baseMaterial;

		}

		mesh.material = currententity[ slot ];
		mesh.renderOrder = 999;

		mesh.onBeforeRender = _viewmodelBeforeRender;
		mesh.onAfterRender = _viewmodelAfterRender;
		// Base drawing resets mesh.position each frame. Move only the render
		// mesh, leaving native entity origin, firing and baked pose data intact.
		const pullback=R_WeaponHeldPullback(currententity.model.name);
		if(pullback){camera.getWorldDirection(_heldPullbackDirection);mesh.position.addScaledVector(_heldPullbackDirection,-pullback);}

	}

}

//============================================================================
// R_DrawAliasModel (stub -- full implementation requires gl_mesh.js)
//============================================================================

// Track entity meshes currently in the scene for efficient add/remove
let _entityMeshesInScene = new Set();
let _entityMeshesThisFrame = new Set();
const _entityMeshCacheOwners = new Set();

function _disposeEntityGeometry( geometry, geometries ) {

	if ( geometry == null || geometries.has( geometry ) ) return;
	geometries.add( geometry );
	geometry.dispose();

}

function _disposeEntityMaterial( material, materials ) {

	if ( material == null || materials.has( material ) ) return;
	materials.add( material );
	material.dispose();

}

function _detachEntityMesh( mesh ) {

	if ( mesh == null ) return;
	if ( mesh.parent != null ) mesh.parent.remove( mesh );
	mesh._quakeOwner = null;

}

function _clearEntityMeshCache( entity, geometries, materials ) {

	if ( entity == null ) return;
	R_RendVeilRelease(entity);

	const spriteMesh = entity._spriteMesh;
	const aliasMesh = entity._aliasMesh;
	const shadowMesh = entity._aliasShadowMesh;
	const aliasGeometry = entity._aliasGeo;
	const shadowGeometry = entity._aliasShadowGeo;
	if(entity._aliasMesh)R_ReleaseAliasReceiver(entity._aliasMesh);
	const viewmodelMaterial = entity._viewmodelMaterial;
	const playerMaterial = entity._playerMaterial;
	if ( spriteMesh == null && aliasMesh == null && shadowMesh == null &&
		aliasGeometry == null && shadowGeometry == null &&
		viewmodelMaterial == null && playerMaterial == null ) return;

	_detachEntityMesh( spriteMesh );
	_detachEntityMesh( aliasMesh );
	_detachEntityMesh( shadowMesh );

	_disposeEntityGeometry( spriteMesh != null ? spriteMesh.geometry : null, geometries );
	_disposeEntityGeometry( aliasGeometry, geometries );
	_disposeEntityGeometry( shadowGeometry, geometries );
	_disposeEntityMaterial( viewmodelMaterial, materials );
	_disposeEntityMaterial( entity._classicViewmodelMaterial, materials );
	for ( const slot of [ '_viewmodelMaterialCache', '_classicViewmodelMaterialCache', '_playerCoatMaterialCache' ] ) {

		for ( const material of entity[ slot ]?.values() || [] ) _disposeEntityMaterial( material, materials );
		entity[ slot ] = null;

	}
	_disposeEntityMaterial( playerMaterial, materials );

	entity._spriteMesh = null;
	entity._aliasMesh = null;
	entity._aliasGeo = null;
	entity._aliasColorArray = null;
	entity._aliasPaliashdr = null;
	entity._aliasPosenum = undefined;
	entity._aliasShadowMesh = null;
	entity._aliasShadowGeo = null;
	entity._aliasShadowPosArray = null;
	entity._aliasShadowVertCount = undefined;
	entity._viewmodelMaterial = null;
	entity._viewmodelMaterialBase = null;
	entity._classicViewmodelMaterial = null;
	entity._classicViewmodelMaterialBase = null;
	entity._playerMaterial = null;
	entity._playerSkinTexture = null;

}

// Pre-allocated vector for dynamic light distance calculation (avoid per-frame allocation)
const _dlightDist = [ 0, 0, 0 ];
const _shadevector = new Float32Array( 3 );

// Cached buffers for R_SetupGL (Golden Rule #4)
const _setupgl_forward = new Float32Array( 3 );
const _setupgl_right = new Float32Array( 3 );
const _setupgl_up = new Float32Array( 3 );
const _setupgl_matrix = new THREE.Matrix4();
const _setupgl_drawingBufferSize = new THREE.Vector2();
// The muzzle point(s) of the viewmodel in world space for the shotgun's pellets (r_shotgun.js): the front of the
// gun's own geometry; before the first frame has placed a gun, a point in front of the eye.
let _gunPlacedFrame = - 1;
// the held lightning gun's muzzle (the front of its own geometry) and its placement, for the beam (r_lightning.js): only a gun
// placed this frame
// The depth-of-field focus ray (card [38]): the level, its brush entities (doors, lifts, trains) and the models drawn
// this frame (monsters, items; in the chase view the player) by their boxes. { fraction, startsolid }.
const _dofBrushes = [];
function R_DofTrace( a, b ) {

	_dofBrushes.length = 0;
	for ( let i = 0; i < cl_numvisedicts; i ++ ) { const e = cl_visedicts[ i ]; if ( e?.model?.name?.startsWith( '*' ) ) _dofBrushes.push( e ); }
	const t = R_ShellTrace( cl.worldmodel, a, b, 0, _dofBrushes );
	if ( t.startsolid ) return { fraction: 0, startsolid: true };
	let fraction = t.fraction;
	for ( let i = 0; i < cl_numvisedicts; i ++ ) {

		const e = cl_visedicts[ i ], m = e?.model;
		if ( m == null || m.type !== mod_alias ) continue;
		const box = R_AliasFrameBox( e ); // (the frame's own bounds: the model's are a generic cube)
		if ( box === null ) continue;
		let t0 = 0, t1 = fraction, hit = true;
		for ( let k = 0; k < 3 && hit; k ++ ) {

			const d = b[ k ] - a[ k ], lo = e.origin[ k ] + box[ 0 ][ k ], hi = e.origin[ k ] + box[ 1 ][ k ];
			if ( Math.abs( d ) < 1e-9 ) { if ( a[ k ] < lo || a[ k ] > hi ) hit = false; continue; }
			let u = ( lo - a[ k ] ) / d, v = ( hi - a[ k ] ) / d;
			if ( u > v ) [ u, v ] = [ v, u ];
			t0 = Math.max( t0, u ); t1 = Math.min( t1, v ); if ( t0 > t1 ) hit = false;

		}
		if ( hit && t0 > 0 ) fraction = t0; // (a box the eye is inside is not a target)

	}
	return { fraction, startsolid: false };

}

function R_LightningMuzzle() {

	const e = cl?.viewent, mesh = e?._aliasMesh;
	if ( mesh == null || e._aliasTemplate == null || _gunPlacedFrame !== r_framecount || ! /v_light\.mdl$/.test( e.model?.name ?? '' ) ) return null;
	const points = viewModelMuzzles( mesh, e._aliasTemplate, 1 );
	if ( points == null ) return null;
	if ( mesh.matrixAutoUpdate ) mesh.updateMatrix();
	return { point: points[ 0 ], matrix: mesh.matrix };

}

function R_ShotgunMuzzles( count ) {

	// only a gun that was placed this frame (not hidden by the ring of shadows, the chase camera or r_drawviewmodel 0)
	// and that is a shotgun: otherwise its mesh is wherever it was last drawn
	const e = cl?.viewent, mesh = e?._aliasMesh;
	if ( mesh != null && e._aliasTemplate != null && _gunPlacedFrame === r_framecount && /v_shot2?\.mdl$|shotgun/i.test( e.model?.name ?? '' ) ) {

		const points = viewModelMuzzles( mesh, e._aliasTemplate, count );
		if ( points != null ) return points;

	}
	const o = r_refdef.vieworg, list = [];
	for ( let i = 0; i < count; i ++ ) {

		const side = count === 2 ? ( i === 0 ? - 3 : 3 ) : 0;
		list.push( [ o[ 0 ] + vpn[ 0 ] * 18 + vright[ 0 ] * ( 4 + side ) - vup[ 0 ] * 6, o[ 1 ] + vpn[ 1 ] * 18 + vright[ 1 ] * ( 4 + side ) - vup[ 1 ] * 6, o[ 2 ] + vpn[ 2 ] * 18 + vright[ 2 ] * ( 4 + side ) - vup[ 2 ] * 6 ] );

	}
	return list;

}

const _fireballView = [ 0, 0 ], _fireballForward = new Float32Array( 3 ), _fireballRight = new Float32Array( 3 ), _fireballUp = new Float32Array( 3 );


function R_DrawAliasModel( e ) {
	if ( R_IsNewer() && SV_AxeEntitySuppressed( e?._entityIndex ) ) return;

	// gibs leave a pool where they come to rest (Newer Game)
	if ( e.model != null && ( e.model.flags & 4 ) !== 0 && cl != null ) R_DecalGibTrack( e, cl.time );

	// walking monsters glide between the game's steps (Newer Game)
	if ( e !== cl.viewent && R_AnimEnabled() && e._entityIndex !== undefined && ( e._entityIndex > cl.maxclients ) && cl != null )
		R_SmoothMove( e, cl.time );

	if ( ! e || ! e.model ) return;
	const paliashdr = e.model.cache ? e.model.cache.data : null;
	if ( ! paliashdr || ! paliashdr.posedata ) return;

	//
	// get lighting information
	//
	let ambientlight = 0;
	let shadelight = 0;
	let shadedots = null;

	if ( cl && e.origin ) {

		ambientlight = shadelight = R_LightPoint( e.origin, cl );

		// always give the gun some light
		if ( ! R_NewerLightingActive() && e === cl.viewent && ambientlight < 24 )
			ambientlight = shadelight = 24;

		// add dynamic lights to ambient/shade (gl_rmain.c:482-497)
		for ( let lnum = 0; !R_NewerLightingActive() && lnum < MAX_DLIGHTS; lnum ++ ) {

			if ( cl_dlights[ lnum ].die >= cl.time ) {

				VectorSubtract( e.origin, cl_dlights[ lnum ].origin, _dlightDist );
				const add = cl_dlights[ lnum ].radius - Length( _dlightDist );

				if ( add > 0 ) {

					ambientlight += add;
					shadelight += add;

				}

			}

		}

		// clamp lighting so it doesn't overbright as much
		if ( ambientlight > 128 )
			ambientlight = 128;
		if ( ambientlight + shadelight > 192 )
			shadelight = 192 - ambientlight;

		// ZOID: never allow players to go totally black
		if ( cl_entities != null && cl.maxclients > 0 ) {

			const idx = e._entityIndex;
			if ( idx !== undefined && idx >= 1 && idx <= cl.maxclients ) {

				if ( ! R_NewerLightingActive() && ambientlight < 8 )
					ambientlight = shadelight = 8;

			}

		}

		// HACK HACK HACK -- no fullbright colors, so make torches full light
		const clmodel = e.model;
		if ( clmodel.name === 'progs/flame2.mdl' || clmodel.name === 'progs/flame.mdl' )
			ambientlight = shadelight = R_NewerLightingActive() ? 960 : 256; // flames glow past white in HDR

		// select shadedots row based on yaw angle
		const yaw = e.angles ? e.angles[ 1 ] : 0;
		shadedots = r_avertexnormal_dots[ ( ( yaw * ( SHADEDOT_QUANT / 360.0 ) ) | 0 ) & ( SHADEDOT_QUANT - 1 ) ];
		shadelight = shadelight / 200.0;

	}

	// Compute shadevector from entity yaw (for shadows, computed before mesh call)
	// Ported from WinQuake/gl_rmain.c:519-523
	const an = ( e.angles ? e.angles[ 1 ] : 0 ) / 180 * M_PI;
	_shadevector[ 0 ] = Math.cos( - an );
	_shadevector[ 1 ] = Math.sin( - an );
	_shadevector[ 2 ] = 1;
	const svLen = Math.sqrt( _shadevector[ 0 ] * _shadevector[ 0 ] + _shadevector[ 1 ] * _shadevector[ 1 ] + _shadevector[ 2 ] * _shadevector[ 2 ] );
	if ( svLen > 0 ) {

		_shadevector[ 0 ] /= svLen;
		_shadevector[ 1 ] /= svLen;
		_shadevector[ 2 ] /= svLen;

	}

	// Newer Game: the supplied flame takes a torch or fire pit (r_torchfire.js); its native model is not
	// built. The container's shadow below still follows from the entity.
	const torch = R_TorchFire( e );
	// (a torch's handle is hardware and stays: only the flame triangles are left out)
	e._aliasPart = torch === TORCH_HANDLE ? torchParts( e.model.name, paliashdr ).select : null;
	const mesh = torch === TORCH_WHOLE ? null : R_DrawAliasModel_mesh( e, paliashdr, shadedots, shadelight );
	if ( mesh != null ) {

		// Newer Game: the sun's light is blocked by monsters and items too
		if ( R_IsNewer() && r_newer_shadows.value !== 0 ) mesh.layers.enable( SUN_SHADOW_LAYER );
		else mesh.layers.disable( SUN_SHADOW_LAYER );

		if(R_IsNewer() && e!==cl.viewent && e._entityIndex===cl.viewentity){
   const base=mesh.material,cache=e._playerCoatMaterialCache ||= new Map();let clone=cache.get(base);
   if(!clone){clone=R_CloneAliasMaterial(base);clone.userData.quakePlayerSurface=true;cache.set(base,clone);}
   mesh.material=clone;
  }
  mesh._quakeOwner = e;
		mesh.userData.quakeViewmodel = e === cl.viewent;
		_entityMeshCacheOwners.add( e );

	}
	if ( mesh && scene ) {

		if ( ! _entityMeshesInScene.has( mesh ) ) {

			scene.add( mesh );
			_entityMeshesInScene.add( mesh );

		}

		_entityMeshesThisFrame.add( mesh );
		if ( e !== cl.viewent ) R_PowerupSeen( e, mesh, scene, cl.time );

	}

	if ( mesh && scene && e !== cl.viewent ) R_RendVeilSeen( e, mesh, scene );

	// Draw shadow (Ported from WinQuake/gl_rmain.c:579-591); Newer Game casts it from the
	// lights that really shine on the model instead
	const newerShadow = R_NewerLightingActive() && r_newer_shadows.value !== 0;
	if ( ( newerShadow || r_shadows.value !== 0 ) && e !== cl.viewent && ( mesh != null || torch === TORCH_WHOLE ) && scene != null ) {

		const shadowMesh = newerShadow ? R_LightShadow( e, paliashdr ) :
			GL_DrawAliasShadow( e, paliashdr, e._aliasPosenum || 0, lightspot, _shadevector );
		if ( shadowMesh != null ) {

			shadowMesh._quakeOwner = e;
			shadowMesh.userData.newerOnly = newerShadow;
			_entityMeshCacheOwners.add( e );

			if ( ! _entityMeshesInScene.has( shadowMesh ) ) {

				scene.add( shadowMesh );
				_entityMeshesInScene.add( shadowMesh );

			}

			_entityMeshesThisFrame.add( shadowMesh );

		}

	}

	c_alias_polys ++;

}

//============================================================================
// Shadows from the lights (Newer Game)
//
// A model's shadow falls away from the lights that can see it, on the floor under it.
// Each of the nearest lights that shine on it (a torch behind a wall does not) is one
// shadow, as faint as that light is weak or far next to the others and the ambient.
//============================================================================

const SHADOW_LIGHT_REACH = 900;
const SHADOW_LIGHT_FALLOFF = 350;
const SHADOW_AMBIENT = 0.25; // what shines on everything, so one dim light does not make a black shadow
const SHADOW_DARKEST = 0.72;
const SHADOW_MAX_LIGHTS = 2;
const SHADOW_MAX_DISTANCE = 900; // monsters farther than this cast no floor shadow
const SHADOW_MAX_CASTERS = 10; // per frame, first come
const SHADOW_NO_MODELS = /flame|s_light|bolt|lavaball|spike|missile|grenade|w_spike|eyes|gib|zom_gib|h_/;

function R_ShadowLights( origin ) {

	const all = R_GetWorldLights();
	if ( all.length === 0 || cl == null || cl.worldmodel == null ) return [];

	const world = cl.worldmodel;
	const leaf = Mod_PointInLeaf( origin, world );
	const vis = leaf != null && leaf !== world.leafs[ 0 ] ? Mod_LeafPVS( leaf, world ) : null;

	const found = [];

	for ( const l of all ) {

		const dx = l.pos[ 0 ] - origin[ 0 ], dy = l.pos[ 1 ] - origin[ 1 ], dz = l.pos[ 2 ] - origin[ 2 ];
		const d2 = dx * dx + dy * dy + dz * dz;
		if ( d2 > SHADOW_LIGHT_REACH * SHADOW_LIGHT_REACH || dz < 56 ) continue;

		// can it see the model at all?
		if ( vis != null && l.leaf != null && l.leaf.contents !== - 2 ) {

			if ( l._leafNum === undefined ) l._leafNum = world.leafs.indexOf( l.leaf );
			const n = l._leafNum;
			if ( n > 0 && ( vis[ ( n - 1 ) >> 3 ] & ( 1 << ( ( n - 1 ) & 7 ) ) ) === 0 ) continue;

		}

		let power = l.power;
		if ( l.style !== 0 && d_lightstylevalue[ l.style ] !== undefined ) power *= d_lightstylevalue[ l.style ] / 264;
		if ( power <= 0.02 ) continue;

		const strength = power / ( 1 + d2 / ( SHADOW_LIGHT_FALLOFF * SHADOW_LIGHT_FALLOFF ) );
		found.push( { pos: l.pos, strength } );

	}

	if ( found.length === 0 ) return [];

	found.sort( ( a, b ) => b.strength - a.strength );
	const chosen = found.slice( 0, SHADOW_MAX_LIGHTS );

	let total = SHADOW_AMBIENT;
	for ( const f of found ) total += f.strength;

	return chosen.map( ( f ) => ( { pos: f.pos, opacity: Math.min( SHADOW_DARKEST, f.strength / total * 2.4 ) } ) );

}

// A fire standing on something (a cauldron, a brazier, a pit): the dark of its base on
// the floor under it.  Wall torches are far from any floor and get none.
let _fireTexture = null;
let _fireMaterial = null;
let _fireGeometry = null;

function R_FireBase( e ) {

	R_LightPoint( e.origin, cl );
	// (the bottom of a bowl or brazier may slope)
	if ( lightplane == null || lightplane.normal[ 2 ] < 0.5 ) return null;
	const drop = e.origin[ 2 ] - lightspot[ 2 ];
	if ( drop < - 4 || drop > 72 ) return null;

	if ( _fireMaterial === null ) {

		const c = document.createElement( 'canvas' );
		c.width = c.height = 64;
		const g = c.getContext( '2d' );
		const gr = g.createRadialGradient( 32, 32, 2, 32, 32, 31 );
		gr.addColorStop( 0, 'rgba(0,0,0,0.9)' );
		gr.addColorStop( 0.55, 'rgba(0,0,0,0.5)' );
		gr.addColorStop( 1, 'rgba(0,0,0,0)' );
		g.fillStyle = gr;
		g.fillRect( 0, 0, 64, 64 );

		_fireTexture = new THREE.CanvasTexture( c );
		_fireMaterial = new THREE.MeshBasicMaterial( { map: _fireTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 2 } );
		_fireGeometry = new THREE.PlaneGeometry( 1, 1 );

	}

	let mesh = e._fireShadowMesh;
	if ( mesh == null ) {

		mesh = new THREE.Mesh( _fireGeometry, _fireMaterial );
		mesh.renderOrder = 1;
		e._fireShadowMesh = mesh;

	}

	// the container's shadow breathes a little with the fire
	const k = R_FireFlicker( e.origin[ 0 ], e.origin[ 1 ], e.origin[ 2 ], cl.time );
	const size = 52 + ( k - 0.9 ) * 14;
	mesh.position.set( e.origin[ 0 ], e.origin[ 1 ], Math.max( lightspot[ 2 ], e.origin[ 2 ] - ( 12 ) ) + 0.4 );
	mesh.scale.set( size, size, 1 );

	return mesh;

}

let _shadowFrame = - 1;
let _shadowCount = 0;

function R_LightShadow( e, paliashdr ) {

	if ( e.model != null && e.model.name === 'progs/flame2.mdl' ) return R_FireBase( e );

	if ( e.model == null || SHADOW_NO_MODELS.test( e.model.name ) ) return null;

	// far monsters are small and dim, and only so many are shadowed at once
	const dx = e.origin[ 0 ] - r_origin[ 0 ], dy = e.origin[ 1 ] - r_origin[ 1 ], dz = e.origin[ 2 ] - r_origin[ 2 ];
	if ( dx * dx + dy * dy + dz * dz > SHADOW_MAX_DISTANCE * SHADOW_MAX_DISTANCE ) return null;
	if ( _shadowFrame !== r_framecount ) { _shadowFrame = r_framecount; _shadowCount = 0; }
	if ( e._shadowFloorMesh == null && _shadowCount >= SHADOW_MAX_CASTERS ) return null;
	_shadowCount ++;

	// only on a flat floor close below
	R_LightPoint( e.origin, cl );
	if ( lightplane == null || lightplane.normal[ 2 ] < 0.9 ) return null;
	const floorZ = lightspot[ 2 ];
	if ( e.origin[ 2 ] - floorZ > 160 || e.origin[ 2 ] < floorZ - 8 ) return null;

	const lights = R_ShadowLights( e.origin );
	if ( lights.length === 0 ) return null;

	return GL_DrawAliasLightShadow( e, paliashdr, e._aliasPosenum || 0, floorZ, lights );

}

//============================================================================
// R_DrawBrushModel (stub -- full implementation in gl_rsurf.js)
//============================================================================

function R_DrawBrushModel( e ) {

	R_DrawBrushModel_rsurf( e );

}

//============================================================================
// R_DrawSpriteModel
// Ported from: WinQuake/gl_rmain.c
//============================================================================

/*
================
R_GetSpriteFrame
Ported from: WinQuake/gl_rmain.c:144-188
================
*/
function R_GetSpriteFrame( e ) {

	const psprite = e.model.cache.data;
	let frame = e.frame;

	if ( frame >= psprite.numframes || frame < 0 ) {

		Con_Printf( 'R_DrawSprite: no such frame ' + frame + '\n' );
		frame = 0;

	}

	if ( psprite.frames[ frame ].type === SPR_SINGLE ) {

		return psprite.frames[ frame ].frameptr;

	} else {

		const pspritegroup = psprite.frames[ frame ].frameptr;
		const pintervals = pspritegroup.intervals;
		const numframes = pspritegroup.numframes;
		const fullinterval = pintervals[ numframes - 1 ];

		const time = cl.time + e.syncbase;

		// when loading in Mod_LoadSpriteGroup, we guaranteed all interval values
		// are positive, so we don't have to worry about division by 0
		const targettime = time - ( ( time / fullinterval ) | 0 ) * fullinterval;

		let i;
		for ( i = 0; i < ( numframes - 1 ); i ++ ) {

			if ( pintervals[ i ] > targettime )
				break;

		}

		return pspritegroup.frames[ i ];

	}

}

// Sprite material cache: texture -> material
const _spriteMaterialCache = new Map();
// Cached vectors for SPR_ORIENTED AngleVectors output
const _sprite_v_forward = new Float32Array( 3 );
const _sprite_v_right = new Float32Array( 3 );
const _sprite_v_up = new Float32Array( 3 );

function R_DrawSpriteModel( e ) {

	if ( e == null || e.model == null ) return;
	const psprite = e.model.cache ? e.model.cache.data : null;
	if ( psprite == null || psprite.frames == null || psprite.frames.length === 0 ) return;

	const frame = R_GetSpriteFrame( e );
	if ( frame == null ) return;

	const texture = frame.gl_texturenum;
	if ( texture == null ) return;

	// Get or create cached geometry and material for this entity
	let mesh = e._spriteMesh;
	let positions, posAttr;

	if ( ! mesh ) {

		// First time: create geometry with pre-allocated buffers
		positions = new Float32Array( 12 ); // 4 vertices * 3
		const uvs = new Float32Array( [ 0, 1, 1, 1, 1, 0, 0, 0 ] );

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
		geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
		geometry.setIndex( [ 0, 1, 2, 0, 2, 3 ] );

		// Get cached material
		let material = _spriteMaterialCache.get( texture );
		if ( ! material ) {

			material = new THREE.MeshBasicMaterial( {
				map: texture,
				transparent: true,
				alphaTest: 0.5,
				depthWrite: false,
				side: THREE.DoubleSide
			} );
			_spriteMaterialCache.set( texture, material );

		}

		mesh = new THREE.Mesh( geometry, material );
		e._spriteMesh = mesh;

	} else {

		// Update material if texture changed
		let material = _spriteMaterialCache.get( texture );
		if ( ! material ) {

			material = new THREE.MeshBasicMaterial( {
				map: texture,
				transparent: true,
				alphaTest: 0.5,
				depthWrite: false,
				side: THREE.DoubleSide
			} );
			_spriteMaterialCache.set( texture, material );

		}

		if ( mesh.material !== material ) mesh.material = material;

	}
	mesh._quakeOwner = e;
	_entityMeshCacheOwners.add( e );

	// Update billboard vertex positions every frame
	posAttr = mesh.geometry.attributes.position;
	positions = posAttr.array;

	const ox = e.origin[ 0 ];
	const oy = e.origin[ 1 ];
	const oz = e.origin[ 2 ];

	// SPR_ORIENTED uses entity angles for orientation (bullet marks on walls)
	// Normal sprites use camera-facing vup/vright
	let up_vec, right_vec;
	if ( psprite.type === SPR_ORIENTED ) {

		AngleVectors( e.angles, _sprite_v_forward, _sprite_v_right, _sprite_v_up );
		up_vec = _sprite_v_up;
		right_vec = _sprite_v_right;

	} else {

		up_vec = vup;
		right_vec = vright;

	}

	const ux = up_vec[ 0 ], uy = up_vec[ 1 ], uz = up_vec[ 2 ];
	const rx = right_vec[ 0 ], ry = right_vec[ 1 ], rz = right_vec[ 2 ];
	const l = frame.left, r = frame.right, u = frame.up, d = frame.down;

	positions[ 0 ] = ox + ux * d + rx * l;
	positions[ 1 ] = oy + uy * d + ry * l;
	positions[ 2 ] = oz + uz * d + rz * l;

	positions[ 3 ] = ox + ux * d + rx * r;
	positions[ 4 ] = oy + uy * d + ry * r;
	positions[ 5 ] = oz + uz * d + rz * r;

	positions[ 6 ] = ox + ux * u + rx * r;
	positions[ 7 ] = oy + uy * u + ry * r;
	positions[ 8 ] = oz + uz * u + rz * r;

	positions[ 9 ] = ox + ux * u + rx * l;
	positions[ 10 ] = oy + uy * u + ry * l;
	positions[ 11 ] = oz + uz * u + rz * l;

	posAttr.needsUpdate = true;

	if ( scene ) {

		if ( ! _entityMeshesInScene.has( mesh ) ) {

			scene.add( mesh );
			_entityMeshesInScene.add( mesh );

		}

		_entityMeshesThisFrame.add( mesh );

	}

}

//============================================================================
// R_PolyBlend
//
// Draws a full-screen color blend for damage flashes, powerups, etc.
// In Three.js, we use a screen-space overlay.
//============================================================================

let polyBlendMesh = null;
let polyBlendScene = null;
let polyBlendCamera = null;

export function R_PolyBlend() {

	if ( gl_polyblend.value === 0 )
		return;

	if ( v_blend[ 3 ] === 0 )
		return;

	if ( renderer == null )
		return;

	// Per-pixel liquid optics already supply contents colour. Exclude only
	// that layer: damage, pickups and powerups retain their full contribution.
	const opticalLiquid = R_WaterActive() && r_viewleaf != null && ( r_viewleaf.contents === - 3 || r_viewleaf.contents === - 4 );
	const blend = opticalLiquid ? v_liquid_blend : v_blend;
	if ( blend[ 3 ] === 0 && ! R_DemoSplitActive() ) return;

	// create overlay geometry on first use
	if ( polyBlendScene == null ) {

		polyBlendScene = new THREE.Scene();
		polyBlendCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );

		const geometry = new THREE.PlaneGeometry( 2, 2 );
		const material = new THREE.MeshBasicMaterial( {
			transparent: true,
			depthTest: false,
			depthWrite: false
		} );
		polyBlendMesh = new THREE.Mesh( geometry, material );
		polyBlendMesh.name = 'quake_screen_blend';
		polyBlendScene.add( polyBlendMesh );

	}

	// Palette colours are sRGB; the overlay material converts them once.
	polyBlendMesh.material.color.setRGB( blend[ 0 ], blend[ 1 ], blend[ 2 ], THREE.SRGBColorSpace );
	const opacity = blend[ 3 ];
	polyBlendMesh.material.opacity = opacity;
	if ( R_DemoSplitActive() ) {

		const vp = R_ComputeViewport();
		const half = Math.floor( vp.lw / 2 );
		const scissor = renderer.getScissor( new THREE.Vector4() ), scissorTest = renderer.getScissorTest();
		try {

			renderer.setScissorTest( true );
			if ( ! R_DemoSplitFull() ) {

				renderer.setScissor( vp.lx, vp.ly, half, vp.lh );
				renderer.render( polyBlendScene, polyBlendCamera );

			}
			polyBlendMesh.material.color.setRGB( v_blend[ 0 ], v_blend[ 1 ], v_blend[ 2 ], THREE.SRGBColorSpace );
			polyBlendMesh.material.opacity = v_blend[ 3 ];
			renderer.setScissor( vp.lx + ( R_DemoSplitFull() ? 0 : half ), vp.ly, R_DemoSplitFull() ? vp.lw : vp.lw - half, vp.lh );
			renderer.render( polyBlendScene, polyBlendCamera );

		} finally {

			polyBlendMesh.material.color.setRGB( blend[ 0 ], blend[ 1 ], blend[ 2 ], THREE.SRGBColorSpace );
			polyBlendMesh.material.opacity = opacity;
			renderer.setScissor( scissor ); renderer.setScissorTest( scissorTest );

		}

	} else renderer.render( polyBlendScene, polyBlendCamera );

}

//============================================================================
// R_RenderScene
//
// r_refdef must be set before the first call
//============================================================================

export function R_RenderScene() {

	// Begin new frame: clear the "this frame" set
	_entityMeshesThisFrame.clear();
	R_PowerupBegin( scene );
	R_RendVeilBegin(scene);

	// portal views are rendered per camera, which XR's stereo pair doesn't allow
	R_PortalsBeginFrame( isXRActive() === false && envmap === false );

	// Dynamic lights are managed by R_RenderDlights - it updates intensity
	// each frame and removes expired lights from scene

	R_SetupFrame();

	R_SetFrustum();

	R_SetupGL();

	R_MarkLeaves(); // done here so we know if we're in water

	R_DrawWorld(); // adds static entities to the list
	R_AxeCorpsesFrame( scene );

	S_ExtraUpdate(); // don't let sound get messed up if going slow

	R_TorchFireBegin();
	R_DrawEntitiesOnList();
	R_TorchFireFlush( cl != null ? cl.time : 0, r_refdef.vieworg, vpn, _fireballView ); // (after the list: it is this frame's torches)
	R_PowerupEnd();
	R_RendVeilEnd(scene);
	R_BestiaryObserve( scene, camera, cl_visedicts.slice( 0, cl_numvisedicts ) );

	// Remove entity meshes that were in the scene last frame but not this frame
	for ( const mesh of _entityMeshesInScene ) {

		if ( ! _entityMeshesThisFrame.has( mesh ) ) {

			if ( scene ) scene.remove( mesh );
			_entityMeshesInScene.delete( mesh );

		}

	}

	R_RenderDlights();

	R_DrawParticles();

}

//============================================================================
// The classic half of the title demo (r_demosplit.js)
//
// Everything Newer is switched off, what the frame built for Newer Game is built again the classic way
// (the models with their original skins, the water as the original had it), the world's materials are
// given the original textures, and what only Newer Game draws (marks, mist, enhanced shadows, the views of other
// levels) is hidden.  Then the scene is drawn, and all of it put back.
//============================================================================

let _classicRestore = null;

function R_ClassicOn() {

	const previousPass = R_ClassicPassActive(), previousLook = classicLook.value;
	const previousEntity = currententity, previousPolys = c_alias_polys;
	const inScene = _entityMeshesInScene, thisFrame = _entityMeshesThisFrame;
	const blend = Array.from( v_blend ), liquidBlend = Array.from( v_liquid_blend );
	const restoreScene = R_SaveClassicScene( scene, cl.time );
	let restoreArch = () => {};
	// Install rollback before any preparation can throw.
	_classicRestore = () => {

		restoreArch(); restoreScene();
		_entityMeshesInScene = inScene; _entityMeshesThisFrame = thisFrame;
		currententity = previousEntity; c_alias_polys = previousPolys;
		for ( let i = 0; i < 4; i ++ ) { v_blend[ i ] = blend[ i ]; v_liquid_blend[ i ] = liquidBlend[ i ]; }
		classicLook.value = previousLook;
		R_AnimSetClassicPass( previousPass );

	};
	_entityMeshesInScene = new Set( inScene );
	_entityMeshesThisFrame = new Set( thisFrame );
	R_AnimSetClassicPass( true );
	classicLook.value = 1;
	restoreArch = R_ClassicArchVisibility();

	R_DrawEntitiesOnList();
	R_DrawViewModel();
	R_RenderDlights(); // native dynamic lights, not the enhanced fixed light slots
	R_ClassicLightmapsFrame();

	scene.traverse( o => {
		if ( o.userData.archHidden ) o.visible = true;
		// the title demo's Classic-only explosion particles: shown in this pass alone
		if ( o.userData.classicOnly ) { o.visible = true; return; }

		if ( o.userData.newerOnly || ( o.isPointLight && gl_flashblend.value === 0 ) || o.name === 'quake_decals' || o.name === 'quake_level_portal' || o.name === 'quake_level_view' ) {

			o.visible = false;
			return;

		}
		// Original particles, original optional shadows and fullbright texels
		// belong to Quake and are deliberately retained.
		const source = R_ClassicSurfaceMaterial( o );
		if ( source == null ) return;
		const native = m => R_ClassicMaterial( m, R_ClassicTexture, R_ClassicLightmap );
		o.material = Array.isArray( source ) ? source.map( native ) : native( source );
		if ( o.userData.quakeSky ) o.material.depthWrite = true;

	} );

}

function R_ClassicOff() {

	if ( _classicRestore ) {

		try { _classicRestore(); } finally { _classicRestore = null; }

	}

}

//============================================================================
// R_RenderView
//
// r_refdef must be set before the first call
//============================================================================

export function R_RenderView() {

	let time1, time2;

	if ( r_norefresh.value )
		return;

	if ( ! r_worldentity.model || ( cl && ! cl.worldmodel ) )
		return; // worldmodel not loaded yet

	if ( r_speeds.value ) {

		time1 = Sys_FloatTime();
		c_brush_polys = 0;
		c_alias_polys = 0;

	}

	mirror = false;

	// "Newer" lighting: render through the HDR pipeline (r_hdr 1); otherwise
	// the classic direct-to-screen path below is untouched.
	let post = false;
	if ( renderer != null && isXRActive() === false && envmap === false ) {

		const vp = R_ComputeViewport();
		post = R_PostBegin( renderer, true, vp.width, vp.height );

	} else {

		R_PostBegin( renderer, false, 0, 0 );

	}

	if ( post ) R_PostBind( renderer );

	R_Clear();

	// the shoulder flashlight follows the view with a lag
	R_MuzzleSetView( r_refdef.vieworg );

	R_NewerTexturesFrame( cl != null ? cl.worldmodel : null );
	R_WarmFrame();

	// what moves in the other levels seen through their windows
	if ( cl != null && r_newer_portals.value !== 0 ) R_UpdateLevelViewEntities( r_refdef.vieworg, cl.time );
	R_SyncLevelViews(); // (a way back the server has shut loses its window)

	// marks on the world
	R_DecalsFrame();
	R_ShellsFrame( cl != null ? cl.time : 0 );
	R_MistFrame( scene, cl != null ? cl.time : 0 );
	// (the view's forward vector is worked out here: vpn is only brought up to date by R_SetupFrame,
	// inside R_RenderScene, so it would be the last frame's; the spark width follows the target
	// actually rendered, which dynamic resolution shrinks)
	AngleVectors( r_refdef.viewangles, _fireballForward, _fireballRight, _fireballUp );
	_fireballView[ 0 ] = r_refdef.vrect.width * r_refdef.vrectScale * R_DynResScale();
	_fireballView[ 1 ] = r_refdef.vrect.height * r_refdef.vrectScale * R_DynResScale();
	R_FireballFrame( cl != null ? cl.time : 0, r_refdef.vieworg, _fireballForward, _fireballView );

	R_ImpactRippleFrame( cl != null ? cl.time : 0 ); // (the detector's list of hits, aged)
	R_WavesFrame( cl != null ? cl.time : 0 ); // (and the ripples they make, stepped to now)
	// render normal view
	R_RenderScene();
	R_FlashlightUpdate( r_refdef.vieworg, vpn, vright, vup );
	R_DrawViewModel();
	R_ShotgunFrame( cl != null ? cl.time : 0, r_refdef.vieworg, vpn, _fireballView ); // (after the gun is placed: the pellets leave its muzzle)
	R_LightningFrame( cl != null ? cl.time : 0 ); // (after the gun is placed: the beam leaves its muzzle, card [30a])
	R_WallBurnFrame( cl != null ? cl.time : 0 ); // (the beam's and the pellets' burn on the walls, card [30c])
	R_DofFrame( cl != null ? cl.time : 0, cl?.worldmodel, r_refdef.vieworg, vpn, vright, vup ); // (the focus, card [38]: vpn is this frame's here)
	R_DrawWaterSurfaces();

	// render mirror view
	R_Mirror();

	R_PerfStage( 'scene build' );

	// render what teleporters lead to
	R_PortalViews();

	R_PerfStage( 'portal views' );

	// Present the frame via Three.js
	if ( renderer && scene && camera ) {

		// crossing into the next level: from the moment the player is through, and
		// while the level loads, keep showing the level they are entering
		const leaving = R_LevelTransitionBegin();

		if ( post ) {

			R_WaterProbesFrame( renderer, scene, camera, R_WorldShowAll, { initializing:R_IntroLoadingHolding(), ready:_introWaterReady } );

			R_PostBind( renderer );

			if ( _needCompile && r_framecount > 1 ) {

				_needCompile = false;
				try { renderer.compile( scene, camera ); } catch ( e ) { console.warn( 'compile failed', e ); }
				R_WarmShaders( renderer, scene, camera );
				R_PerfStage( 'compile' );

			}

			R_PostLightsFrame( renderer, scene, camera, r_visframecount, d_lightstylevalue, cl_dlights, cl != null ? cl.time : 0, R_MapHasSky() );
			R_RendVeilCapture(renderer,scene,camera);
			try { renderer.render( scene, camera ); } finally { R_HeightShadowScope( false ); }
			R_PerfStage( 'world draw' );
			// the title demo, half Newer and half classic
			const split = R_DemoSplitActive();
			const sceneTarget = renderer.getRenderTarget(); // exact enhanced scene raster size
			R_PostSetSplit( split && ! R_DemoSplitFull() );
			R_PostFinish( renderer, scene, camera, _viewport, r_visframecount, d_lightstylevalue,
				cl_dlights, cl != null ? cl.time : 0, renderer.toneMappingExposure, R_MapHasSky() );
			if ( split ) R_DemoSplitClassic( renderer, scene, camera, _viewport, R_ClassicOn, R_ClassicOff, sceneTarget );

		} else {

			renderer.render( scene, camera );
			R_PerfStage( 'world draw' );

		}

		if ( leaving !== null ) R_LevelTransitionEnd( leaving );

	}

	// Draw screen blend overlay AFTER main scene (damage flash, powerups, underwater tint)
	// Skip in XR mode — the 2D ortho overlay doesn't work with stereo rendering
	if ( isXRActive() === false ) {

		R_PolyBlend();

	}

	// Clean up water meshes AFTER rendering (they need to exist during render)
	R_CleanupWaterMeshes_rsurf();

	R_PerfStage( 'overlays and water' );
	if(R_IntroLoadingHolding())R_UpdateIntroReadiness();

	if ( r_speeds.value ) {

		time2 = Sys_FloatTime();
		Con_Printf( ( ( ( time2 - time1 ) * 1000 ) | 0 ) + ' ms  ' + c_brush_polys + ' wpoly ' + c_alias_polys + ' epoly' );

	}

}

//============================================================================
// The crossing into the next level
//
// The game decides the player has gone through an exit a moment before the next
// level is loaded, and the screen holds the last frame while it loads.  That frame
// must be the level being entered (as the window showed it), not the back of the
// doorway in the level being left: so the view is moved into the other level's
// window, and the weapon with it.
//============================================================================

const _transitionMatrix = new THREE.Matrix4();

function R_LevelTransitionBegin() {

	const pend = SV_SeamlessPending();
	if ( pend === null || pend.index === undefined || camera == null ) return null;

	const m = R_LevelPortalMatrix( pend.index );
	if ( m === null ) return null;

	_transitionMatrix.fromArray( m );

	camera.updateMatrixWorld( true );
	const saved = { world: camera.matrixWorld.clone(), auto: camera.matrixWorldAutoUpdate, weapon: null, weaponMatrix: null, weaponAuto: true };

	camera.matrixWorldAutoUpdate = false;
	camera.matrixWorld.premultiply( _transitionMatrix );
	camera.matrixWorldInverse.copy( camera.matrixWorld ).invert();

	// the gun is drawn in the world at the eye: it goes along
	const gun = cl != null && cl.viewent != null ? cl.viewent._aliasMesh : null;
	if ( gun != null ) {

		gun.updateMatrix();
		saved.weapon = gun;
		saved.weaponMatrix = gun.matrix.clone();
		saved.weaponAuto = gun.matrixAutoUpdate;
		gun.matrixAutoUpdate = false;
		gun.matrix.premultiply( _transitionMatrix );
		gun.matrixWorld.copy( gun.matrix );

	}

	return saved;

}

function R_LevelTransitionEnd( saved ) {

	camera.matrixWorld.copy( saved.world );
	camera.matrixWorldInverse.copy( saved.world ).invert();
	camera.matrixWorldAutoUpdate = saved.auto;

	if ( saved.weapon !== null ) {

		saved.weapon.matrix.copy( saved.weaponMatrix );
		saved.weapon.matrixAutoUpdate = saved.weaponAuto;

	}

}

//============================================================================
// R_PortalViews
//
// Every teleporter surface drawn this frame is a window onto its receiver.
//============================================================================

const _portalHidden = [];

function R_PortalViews() {

	if ( renderer == null || scene == null || camera == null ) return;

	// the weapon belongs to the main view only
	_portalHidden.length = 0;
	if ( cl != null && cl.viewent != null && cl.viewent._aliasMesh != null )
		_portalHidden.push( cl.viewent._aliasMesh );

	const scale = r_refdef.vrectScale;
	R_RenderPortals(
		renderer, scene, camera,
		r_refdef.vrect.width * scale * R_DynResScale(), r_refdef.vrect.height * scale * R_DynResScale(),
		Sys_FloatTime(), _portalHidden );

}

//============================================================================
// R_Mirror
//
// Only one mirror exists in the entire game (e2m3).
// Requires render-to-texture with flipped camera — not yet implemented.
//============================================================================

let _mirrorWarned = false;

function R_Mirror() {

	if ( mirror === false )
		return;

	if ( _mirrorWarned === false ) {

		Con_Printf( 'R_Mirror: mirror rendering not yet implemented\n' );
		_mirrorWarned = true;

	}

}

//============================================================================
// R_Init
//
// Called at startup to initialize the renderer
//============================================================================

export function R_Init() {

	Con_Printf( 'R_Init' );

	// Initialize r_worldentity here (deferred from module scope to avoid circular dep crash)
	r_worldentity = new entity_t();

	// create the Three.js scene
	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x000000 );

	// initialize light style values to default
	for ( let i = 0; i < 256; i ++ ) {

		d_lightstylevalue[ i ] = 264; // 'm' is normal light (char 109, 109-'a' = 12, 12*22 = 264)

	}

	Cvar_RegisterVariable( r_portals );
	Cvar_RegisterVariable( r_hdr );
	Cvar_RegisterVariable( r_pointshadows );
	Cvar_RegisterVariable( r_heightshadows );
	Cvar_RegisterVariable( r_powerups );
	Cvar_RegisterVariable( cl_showfps );
	R_PerfInit( renderer );
	Cvar_RegisterVariable( r_dynres );
	Cvar_RegisterVariable( r_fps_target );
	Cvar_RegisterVariable( r_newdark );
	Cvar_RegisterVariable( r_newedges );
	Cvar_RegisterVariable( r_bloom );
	Cvar_RegisterVariable( r_bounce );
	Cvar_RegisterVariable( r_cloudspeed );
	Cvar_RegisterVariable( r_pillars );
	Cvar_RegisterVariable( r_heathaze );
	Cvar_RegisterVariable( r_mist );
	Cvar_RegisterVariable( r_fireball );
	Cvar_RegisterVariable( r_fireballalpha );
	Cvar_RegisterVariable( r_smoketrails );
	Cvar_RegisterVariable( r_torchfire );
	Cvar_RegisterVariable( r_shotgunfx );
	Cvar_RegisterVariable( r_impactripples );
	Cvar_RegisterVariable( r_newer_lightning );
	Cvar_RegisterVariable( r_newer_wallburn );
	Cvar_RegisterVariable( r_dof );
	Cvar_RegisterVariable( r_reflect );
	Cvar_RegisterVariable( r_water_look );
	Cvar_RegisterVariable( r_reflect_screen );
	Cvar_RegisterVariable( r_demosplit );
	Cvar_RegisterVariable( r_volumetric );
	Cvar_RegisterVariable( r_caustics );
	Cvar_RegisterVariable( r_newbright );
	Cvar_RegisterVariable( r_newcontrast );
	Cvar_RegisterVariable( r_lerpmodels );
	Cvar_RegisterVariable( r_newer_variety );
	Cvar_RegisterVariable( r_newer_lighting );
	Cvar_RegisterVariable( r_newer_normals );
	Cvar_RegisterVariable( r_rockfield );
	Cvar_RegisterVariable( r_newer_water );
	Cvar_RegisterVariable( r_newer_enemies );
	Cvar_RegisterVariable( r_newer_textures );
	Cvar_RegisterVariable( r_newer_hud );
	Cvar_RegisterVariable( r_newer_shadows );
	Cvar_RegisterVariable( r_newer_crates );
	Cvar_RegisterVariable( r_newer_portals );
	Cvar_RegisterVariable( r_flashlight );
	Cvar_RegisterVariable( r_decals );
	Cvar_RegisterVariable( r_newer_weapons );
	// what the server sends you: through water, and through the windows of the
	// level's own teleporters (a secret seen through one is there to be seen)
	SV_SetLiquidLinks( () => {

		const links = R_GetLiquidLinks();
		if ( r_newer_portals.value === 0 ) return links;
		const portals = R_GetPortals();
		if ( portals.length === 0 ) return links;
		const all = links.slice();
		for ( const p of portals )
			if ( p.srcLeaf != null ) all.push( p._svLink || ( p._svLink = { above: p.srcLeaf, below: null, aboveVis: [], belowVis: p.destVis } ) );
		return all;

	} );
	R_LevelViewUseSnapshots( SV_LevelSnapshotEntities );
	SV_SetWarmLevel( R_WarmLevel );
	R_FlashlightInit();

	R_InitParticles();
	R_SetParticleExternals( { scene: scene } );

	R_RockfieldSetLimits(renderer);
	Con_Printf( 'R_Init: Three.js renderer ready' );

}

//============================================================================
// R_NewMap
//
// Called when a new map is loaded
//============================================================================

// A new level's materials are compiled (and their textures put on the card) on its first
// frames, while the screen is still held back, instead of one at a time as they first come
// into view: each of those is a stall of a good fraction of a second.
let _needCompile = false;
let _shaderWarmPending=0,_shaderWarmFailure='',_introWorld=null,_introShaderStamp='',_introWaterReady=false;
const _introWarnings=new Set();

function R_UpdateIntroReadiness(){
 const model=cl.worldmodel;if(!model)return;
 const models=cl.model_precache.filter(Boolean);
 if(_introWorld!==model){_introWorld=model;_introShaderStamp='';R_WeaponsPreload();R_NewerHudPreload();}
 R_NewerSkinsPrepare(models);
 const textures=R_NewerTexturesStatus(model),skins=R_NewerSkinsStatus(models),weapons=R_WeaponStatus(),hud=R_NewerHudStatus(),rock=R_RockfieldStatus(),demon=R_DemonReliefStatus(),shadows=R_PointShadowStatus(),water=R_WaterStartupStatus(camera);
 const enhanced=R_PostActive(),skinRequired=enhanced&&(r_newer_enemies.value!==0||r_newer_normals.value!==0),weaponRequired=R_WeaponsEnabled();
 const assets=[];
 if(enhanced&&r_newer_normals.value!==0)R_NewerNormalsPrepare(model);
 if(enhanced&&r_newer_normals.value!==0)assets.push(['surface normal samples',R_NewerNormalsStatus(model)]);
 if(enhanced&&r_newer_textures.value!==0)assets.push(['textures',textures]);
 if(skinRequired)assets.push(['enemy and item art',skins]);
 if(weaponRequired)assets.push(['weapon models',weapons]);
 if(enhanced&&r_newer_hud.value!==0)assets.push(['status bar',hud]);
 const {pending,fallbacks}=R_IntroReadinessChecks({assets,shaderPending:enhanced&&_needCompile||_shaderWarmPending>0,shaderFailure:_shaderWarmFailure,rock,demon,shadows,water,captureEnabled:enhanced&&r_newer_lighting.value!==0&&r_pointshadows.value!==0,spotOn:R_FlashlightBeam().on});
 const stamp=JSON.stringify([model.name,textures.ready,textures.fallback,skins.ready,skins.fallback,weapons.ready,hud.ready,hud.fallback,rock.preparedTiles,rock.resident,demon.ready,demon.triangles]);
 if(enhanced&&assets.every(([,state])=>state.settled)){
  const materials=[...(skinRequired?R_NewerSkinsMaterials(models):[]),...(weaponRequired?R_WeaponMaterials():[])];
  const uploaded=[...(skinRequired?R_NewerSkinsTextures(models):[]),...(weaponRequired?R_WeaponTextures():[])];
  // Tile residency and sculpted triangle counts affect stable-frame readiness,
  // not these prepared shader families. Rewarm only changed actual bindings.
  const uploadStamp=R_ShaderAssetStamp([model.name,textures.ready,textures.fallback,skins.ready,skins.fallback,weapons.ready,hud.ready,hud.fallback],materials,uploaded);
  if(_introShaderStamp!==uploadStamp){
   const previous=renderer.getRenderTarget();R_PostBind(renderer);
   try{R_WarmShaders(renderer,scene,camera,materials,uploaded);}finally{renderer.setRenderTarget(previous);}
   // Three compiles both sides of transparent DoubleSide materials by changing
   // their version synchronously. Retain the completed compile's revision.
   _introShaderStamp=R_ShaderAssetStamp([model.name,textures.ready,textures.fallback,skins.ready,skins.fallback,weapons.ready,hud.ready,hud.fallback],materials,uploaded);
   pending.push('GPU asset upload');
  }
 }
 // This uses the existing readiness results; only water/shadow capture remains
 // after final current art/geometry/uploads. No gate is released by this hint.
 _introWaterReady=assets.every(([,state])=>state.settled)&&!pending.some(name=>['GPU shaders','GPU asset upload','continuous rock relief','sculpted surfaces'].includes(name));
 for(const warning of fallbacks)if(!_introWarnings.has(warning)){_introWarnings.add(warning);Con_Printf('Enhanced intro fallback: '+warning+'\n');}
 R_DemoLoadingFrame({world:model.name,signon:cls.signon,rendered:true,pending,fallbacks,revision:stamp+':'+(renderer.info?.programs?.length||0)});
}

// The kinds of material that only appear once something spawns, is fired or comes into view
// (monster skins, sprites, marks, shadows, doors...). Each is a stall of a second or more the
// first time it is drawn, so they are all started compiling up front, off the main thread
// where the browser allows it. Nothing here is ever drawn.
let _warmGroup = null;

function R_WarmShaders( renderer, scene, camera, extraMaterials=[], extraTextures=[] ) {

	if ( _warmGroup === null ) {

		const tex = () => {

			const t = new THREE.DataTexture( new Uint8Array( [ 255, 255, 255, 255 ] ), 1, 1 );
			t.colorSpace = THREE.SRGBColorSpace;
			t.needsUpdate = true;
			return t;

		};

		const map = tex();
		const geometry = new THREE.PlaneGeometry( 1, 1 );
		geometry.setAttribute( 'color', new THREE.BufferAttribute( new Float32Array( 12 ).fill( 1 ), 3 ) );
		geometry.setAttribute( 'uv1', geometry.getAttribute( 'uv' ) );

		const lm = tex();
		lm.channel = 1;
		const lit = createQuakeLightmapMaterial( map, lm );
		const materials = [
			lit,
			new THREE.MeshBasicMaterial( { map } ),
			new THREE.MeshBasicMaterial( { map, vertexColors: true } ),
			new THREE.MeshBasicMaterial( { color: 0xcccccc, vertexColors: true } ),
			new THREE.MeshBasicMaterial( { map, transparent: true, opacity: 0.5, side: THREE.DoubleSide } ),
			new THREE.MeshBasicMaterial( { map, transparent: true, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide } ),
			new THREE.MeshBasicMaterial( { map, transparent: true, depthWrite: false, polygonOffset: true } ),
			new THREE.MeshBasicMaterial( { map, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide } ),
			new THREE.MeshBasicMaterial( { color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide } )
		];

		_warmGroup = new THREE.Group();
		for ( const material of materials ) {

			const mesh = new THREE.Mesh( geometry, material );
			mesh.frustumCulled = false;
			_warmGroup.add( mesh );

		}

	}

	// they are only in the scene while the programs are being started
	const extra=[];
	try {
	if(renderer.initTexture)for(const texture of new Set(extraTextures))renderer.initTexture(texture);
	for(const material of extraMaterials){
		const mesh=new THREE.Mesh(_warmGroup.children[0].geometry,material);mesh.frustumCulled=false;_warmGroup.add(mesh);extra.push(mesh);
		const textures=new Set();for(const value of Object.values(material))if(value?.isTexture)textures.add(value);for(const uniform of Object.values(material.uniforms||{}))if(uniform?.value?.isTexture)textures.add(uniform.value);
		if(renderer.initTexture)for(const texture of textures)renderer.initTexture(texture);
	}
	scene.add( _warmGroup );

		const started = R_CompileSceneAsync( renderer, scene, camera );
		if(started&&typeof started.then==='function'){_shaderWarmPending++;Promise.resolve(started).catch(error=>{_shaderWarmFailure=String(error.message||error);}).finally(()=>{_shaderWarmPending--;});}

	} catch ( e ) {

		console.warn( 'shader warm-up failed', e );
		_shaderWarmFailure=String(e.message||e);

	}

	scene.remove( _warmGroup );
	for(const mesh of extra)_warmGroup.remove(mesh);

}

export function R_NewMap() {
	R_DemonBakeRelease();
	// All paired local Newer arrivals share the existing physics/input hold;
	// network games and recorded/timed demos retain their established clocks.
	const local=cls.netcon,peer=local?.driverdata;
	if(r_hdr.value!==0&&sv.active&&svs.maxclients===1&&!cls.demoplayback&&cls.state===ca_connected&&local?.driver===0&&!local.disconnected&&peer?.driverdata===local&&!peer.disconnected&&svs.clients[0]?.active&&svs.clients[0].netconnection===peer)R_DemoLoadingWelcome();
	R_ClearAxeCorpses();

	R_PowerupClear();

	_needCompile = true;
	_introWorld=null;_introShaderStamp='';_shaderWarmFailure='';_introWaterReady=false;

	// clear old data
	r_viewleaf = null;
	r_oldviewleaf = null;
	const resetWorldEntity = new entity_t();
	if ( r_worldentity == null ) {

		r_worldentity = resetWorldEntity;

	} else {

		// WinQuake memsets one static entity, so preserve its published identity.
		for ( const key of Object.keys( r_worldentity ) )
			delete r_worldentity[ key ];
		Object.assign( r_worldentity, resetWorldEntity );

	}
	r_worldentity.model = cl != null ? cl.worldmodel : null;

	R_NewerSkinsNewMap(); // monsters roll their Newer skins again

	// reset framecount
	set_r_framecount( 1 );
	r_visframecount = 0;

	R_ClearParticles();
	R_DecalsSetup( { scene, cl: () => cl, pointInLeaf: Mod_PointInLeaf, lightPoint: R_LightPoint } );
	R_FireballSetup( { scene, cl: () => cl, pointInLeaf: Mod_PointInLeaf, allocDlight: CL_AllocDlight } );
	R_FireballClear();
	R_TorchFireSetup( { scene } );
	R_TorchFireClear();
	R_ImpactRipplesSetup( { contents: p => ( cl?.worldmodel ? Mod_PointInLeaf( p, cl.worldmodel )?.contents : undefined ), portals: R_ImpactPortalPlanes } );
	R_LightningSetup( { scene, camera: () => camera, muzzle: R_LightningMuzzle, beam: CL_PlayerLightning, allocDlight: CL_AllocDlight } );
	R_DofSetup( { xr: isXRActive, trace: R_DofTrace, pointInLeaf: Mod_PointInLeaf, contents: p => ( cl?.worldmodel ? Mod_PointInLeaf( p, cl.worldmodel )?.contents : undefined ) } );
	R_WallBurnSetup( { scene, renderer: () => renderer, cl: () => cl, pointInLeaf: Mod_PointInLeaf, beam: CL_PlayerLightning, entities: () => cl_visedicts.slice( 0, cl_numvisedicts ), self: () => cl_entities[ cl?.viewentity ] } );
	R_WavesSetup( { contents: p => ( cl?.worldmodel ? Mod_PointInLeaf( p, cl.worldmodel )?.contents : undefined ), waterOn: R_WaterActive } );
	R_ImpactRippleListen( R_WaveImpact );
	R_ShotgunSetup( { scene, muzzles: R_ShotgunMuzzles, contents: p => ( cl?.worldmodel ? Mod_PointInLeaf( p, cl.worldmodel )?.contents : undefined ) } );
	R_ShotgunClear();
	R_DecalsClear();
	let shellBrushes = [];
	R_ShellsSetup( { scene, client: () => cl, refresh: () => { shellBrushes = cl_entities.filter( e => e?.model?.name?.startsWith( '*' ) ); },
		trace: ( a, b, radius ) => R_ShellTrace( cl?.worldmodel, a, b, radius, shellBrushes ),
		entity: id => cl_entities[ id ], light: p => R_LightPoint( p, cl ) } );
	R_ShellsNewMap( cl?.worldmodel?.name || '' );
	R_MistClear();
	R_ScreenDropsReset();
	R_MuzzleSetProbe( ( p ) => R_LightPoint( p, cl ) );

	// Clean up all cached entity resources from the previous map. Static
	// entities keep their JS identity across CL_ClearState, so invalidate the
	// owner-side caches as well as the scene tracking sets.
	R_RendVeilClear();
	const geometries = new Set();
	const materials = new Set();
	for ( const owner of _entityMeshCacheOwners )
		_clearEntityMeshCache( owner, geometries, materials );
	_entityMeshCacheOwners.clear();

	for ( let i = 0; i < cl_entities.length; i ++ )
		_clearEntityMeshCache( cl_entities[ i ], geometries, materials );
	for ( let i = 0; i < cl_static_entities.length; i ++ )
		_clearEntityMeshCache( cl_static_entities[ i ], geometries, materials );
	for ( let i = 0; i < cl_temp_entities.length; i ++ )
		_clearEntityMeshCache( cl_temp_entities[ i ], geometries, materials );
	if ( cl != null ) _clearEntityMeshCache( cl.viewent, geometries, materials );

	for ( const mesh of _entityMeshesInScene ) {

		if ( mesh.parent != null ) mesh.parent.remove( mesh );
		if ( mesh.geometry != null && geometries.has( mesh.geometry ) === false ) {

			geometries.add( mesh.geometry );
			mesh.geometry.dispose();

		}

	}

	_entityMeshesInScene.clear();
	_entityMeshesThisFrame.clear();
	for ( const material of _spriteMaterialCache.values() ) {

		if ( materials.has( material ) === false ) {

			materials.add( material );
			material.dispose();

		}

	}
	_spriteMaterialCache.clear();

	// rebuild lightmaps
	GL_BuildLightmaps_rsurf();

	// the next level, seen through this level's doorway and pit exits
	R_SetupLevelViews( scene, SV_SeamlessCrossings() );
	R_ImpactRippleReset();
	R_WavesReset();
	R_LightningClear();
	R_WallBurnClear();
	R_DofClear();

}

//============================================================================
// Stub functions for external dependencies
// These will be connected to real implementations later
//============================================================================

function R_AnimateLight() {

	if ( cl ) R_AnimateLight_impl( cl, cl_lightstyle );

}

// Mod_PointInLeaf: imported from gl_model.js

function V_SetContentsColor( contents ) {

	V_SetContentsColor_view( contents );

}

function V_CalcBlend() {

	V_CalcBlend_view();

}

function R_MarkLeaves() {

	R_MarkLeaves_impl();

}

function R_DrawWorld() {

	R_DrawWorld_impl();

}

function R_DrawWaterSurfaces() {

	R_DrawWaterSurfaces_rsurf();

}

function S_ExtraUpdate() {

	// Sound system updates independently via S_Update() in the frame loop

}

function R_RenderDlights() {

	if ( cl != null ) {

		R_RenderDlights_impl( cl, scene );

	}

}

function R_DrawParticles() {

	R_DrawParticles_impl();

}
