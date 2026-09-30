// Ported from: WinQuake/gl_rmain.c -- main GL renderer
// + WinQuake/glquake.h -- GL definitions

import * as THREE from 'three';
import { Sys_FloatTime } from './sys.js';
import { Con_Printf } from './common.js';
import { PITCH, YAW, ROLL } from './quakedef.js';
import { cvar_t, Cvar_RegisterVariable } from './cvar.js';
import { r_portals, R_PortalsBeginFrame, R_RenderPortals, R_GetPortals, R_LevelPortalMatrix } from './gl_portal.js';
import { R_AnimEnabled, R_NewerLightingActive, R_SmoothMove, r_lerpmodels, r_newer_lighting, r_newer_water, r_newer_enemies, r_newer_portals, r_newer_textures, r_newer_hud, r_newer_shadows } from './r_anim.js';
import { R_NewerTexturesFrame } from './r_newertextures.js';
import { R_SetupLevelViews, R_LevelViewUseSnapshots, R_UpdateLevelViewEntities } from './r_levelview.js';
import { R_ScreenDropsSetView, R_ScreenDropsView, R_ScreenDropsReset } from './r_screendrops.js';
import { r_decals, R_DecalsSetup, R_DecalsFrame, R_DecalsClear, R_DecalGibTrack } from './r_decals.js';
import { r_flashlight, R_FlashlightInit, R_FlashlightUpdate } from './r_flashlight.js';
import { R_MuzzleSetView, R_MuzzleSetProbe } from './r_muzzle.js';
import { SV_SeamlessCrossings, SV_SeamlessPending, SV_SetLiquidLinks, SV_LevelSnapshotEntities } from './sv_seamless.js';
import { r_newer_variety, R_NewerSkinsNewMap } from './r_newerskins.js';
import { r_hdr, r_newdark, r_newedges, r_bloom, r_volumetric, r_caustics, r_newbright, r_newcontrast, R_PostBegin, R_PostBind, R_PostFinish, R_PostActive, R_WaterActive, R_MapHasSky, R_RegisterGlow, R_PostSetUnderwater, R_GetLiquidLinks, R_GetWorldLights, R_FireFlicker, R_DynResScale, r_dynres, r_fps_target, SUN_SHADOW_LAYER } from './gl_post.js';
import { vid, renderer } from './vid.js';
import { r_refdef, r_origin, vpn, vright, vup, entity_t } from './render.js';
import {
	M_PI, DotProduct, VectorCopy, VectorAdd, VectorSubtract, VectorMA,
	VectorNormalize, AngleVectors, Length, RotatePointAroundVector, BoxOnPlaneSide
} from './mathlib.js';
import { R_DrawWorld as R_DrawWorld_impl, R_MarkLeaves as R_MarkLeaves_impl, GL_BuildLightmaps as GL_BuildLightmaps_rsurf, R_DrawBrushModel as R_DrawBrushModel_rsurf, R_DrawWaterSurfaces as R_DrawWaterSurfaces_rsurf, R_CleanupWaterMeshes as R_CleanupWaterMeshes_rsurf } from './gl_rsurf.js';
import { Mod_PointInLeaf, Mod_LeafPVS, SPR_SINGLE, SPR_ORIENTED } from './gl_model.js';
import { R_AnimateLight as R_AnimateLight_impl, R_PushDlights as R_PushDlights_impl, R_RenderDlights as R_RenderDlights_impl, R_LightPoint, lightspot, lightplane } from './gl_rlight.js';
import { R_DrawAliasModel as R_DrawAliasModel_mesh, GL_DrawAliasShadow, GL_DrawAliasLightShadow } from './gl_mesh.js';
import { r_avertexnormal_dots } from './anorm_dots.js';
import { V_SetContentsColor as V_SetContentsColor_view, V_CalcBlend as V_CalcBlend_view } from './view.js';
import { chase_active } from './chase.js';
import {
	R_InitParticles, R_SetParticleExternals, R_ClearParticles,
	R_DrawParticles as R_DrawParticles_impl
} from './r_part.js';
import { isXRActive, getXRRig, XR_SetCamera, XR_SCALE, XR_GetControllerWorldPose } from './webxr.js';
import {
	cl, cl_visedicts, cl_numvisedicts, cl_dlights, cl_entities,
	cl_static_entities, cl_temp_entities, cl_lightstyle
} from './client.js';
import { d_lightstylevalue, r_framecount, set_r_framecount, inc_r_framecount,
	v_blend, mirrortexturenum, set_mirrortexturenum,
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
				R_DrawAliasModel( currententity );
				break;

			case mod_brush:
				R_DrawBrushModel( currententity );
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
				R_DrawSpriteModel( currententity );
				break;

		}

	}

}

//============================================================================
// R_DrawViewModel
//============================================================================

const SHADEDOT_QUANT = 16;

// Cached callbacks for viewmodel depthRange hack (no closures in render loop)
function _viewmodelBeforeRender( r ) {

	r.getContext().depthRange( 0, 0.3 );

}

function _viewmodelAfterRender( r ) {

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

	if ( cl.items & 524288 ) // IT_INVISIBILITY
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
		if ( currententity._viewmodelMaterial == null || currententity._viewmodelMaterialBase !== baseMaterial ) {

			currententity._viewmodelMaterial = baseMaterial.clone();
			currententity._viewmodelMaterial.transparent = true;
			currententity._viewmodelMaterialBase = baseMaterial;

		}

		mesh.material = currententity._viewmodelMaterial;
		mesh.renderOrder = 999;

		mesh.onBeforeRender = _viewmodelBeforeRender;
		mesh.onAfterRender = _viewmodelAfterRender;

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

	const spriteMesh = entity._spriteMesh;
	const aliasMesh = entity._aliasMesh;
	const shadowMesh = entity._aliasShadowMesh;
	const aliasGeometry = entity._aliasGeo;
	const shadowGeometry = entity._aliasShadowGeo;
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

function R_DrawAliasModel( e ) {

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
		if ( e === cl.viewent && ambientlight < 24 )
			ambientlight = shadelight = 24;

		// add dynamic lights to ambient/shade (gl_rmain.c:482-497)
		for ( let lnum = 0; lnum < MAX_DLIGHTS; lnum ++ ) {

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

				if ( ambientlight < 8 )
					ambientlight = shadelight = 8;

			}

		}

		// HACK HACK HACK -- no fullbright colors, so make torches full light
		const clmodel = e.model;
		if ( clmodel.name === 'progs/flame2.mdl' || clmodel.name === 'progs/flame.mdl' )
			ambientlight = shadelight = R_PostActive() ? 640 : 256; // flames glow past white in HDR

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

	const mesh = R_DrawAliasModel_mesh( e, paliashdr, shadedots, shadelight );
	if ( mesh != null ) {

		// Newer Game: the sun's light is blocked by monsters and items too
		if ( e !== cl.viewent && r_newer_shadows.value !== 0 ) mesh.layers.enable( SUN_SHADOW_LAYER );
		else mesh.layers.disable( SUN_SHADOW_LAYER );

		mesh._quakeOwner = e;
		_entityMeshCacheOwners.add( e );

	}
	if ( mesh && scene ) {

		if ( ! _entityMeshesInScene.has( mesh ) ) {

			scene.add( mesh );
			_entityMeshesInScene.add( mesh );

		}

		_entityMeshesThisFrame.add( mesh );

	}

	// Draw shadow (Ported from WinQuake/gl_rmain.c:579-591); Newer Game casts it from the
	// lights that really shine on the model instead
	const newerShadow = R_NewerLightingActive() && r_newer_shadows.value !== 0;
	if ( ( newerShadow || r_shadows.value !== 0 ) && e !== cl.viewent && mesh != null && scene != null ) {

		const shadowMesh = newerShadow ? R_LightShadow( e, paliashdr ) :
			GL_DrawAliasShadow( e, paliashdr, e._aliasPosenum || 0, lightspot, _shadevector );
		if ( shadowMesh != null ) {

			shadowMesh._quakeOwner = e;
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
		polyBlendScene.add( polyBlendMesh );

	}

	// update blend color (values are sRGB from Quake's palette, tell Three.js to convert)
	polyBlendMesh.material.color.setRGB( v_blend[ 0 ], v_blend[ 1 ], v_blend[ 2 ], THREE.SRGBColorSpace );
	// In the HDR pipeline the water absorbs light itself, so the game's screen
	// tint is eased while you are in water or slime; otherwise it buries the view
	// out of the liquid.  Damage and powerup flashes are unaffected.
	let opacity = v_blend[ 3 ];
	if ( R_WaterActive() && r_viewleaf != null && ( r_viewleaf.contents === - 3 || r_viewleaf.contents === - 4 ) )
		opacity *= 0.45;
	polyBlendMesh.material.opacity = opacity;

	renderer.render( polyBlendScene, polyBlendCamera );

}

//============================================================================
// R_RenderScene
//
// r_refdef must be set before the first call
//============================================================================

export function R_RenderScene() {

	// Begin new frame: clear the "this frame" set
	_entityMeshesThisFrame.clear();

	// portal views are rendered per camera, which XR's stereo pair doesn't allow
	R_PortalsBeginFrame( isXRActive() === false && envmap === false );

	// Dynamic lights are managed by R_RenderDlights - it updates intensity
	// each frame and removes expired lights from scene

	R_SetupFrame();

	R_SetFrustum();

	R_SetupGL();

	R_MarkLeaves(); // done here so we know if we're in water

	R_DrawWorld(); // adds static entities to the list

	S_ExtraUpdate(); // don't let sound get messed up if going slow

	R_DrawEntitiesOnList();

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
	R_FlashlightUpdate( r_refdef.vieworg, vpn, vright, vup );
	R_MuzzleSetView( r_refdef.vieworg );

	R_NewerTexturesFrame( cl != null ? cl.worldmodel : null );

	// what moves in the other levels seen through their windows
	if ( cl != null && r_newer_portals.value !== 0 ) R_UpdateLevelViewEntities( r_refdef.vieworg, cl.time );

	// marks on the world
	R_DecalsFrame();

	// render normal view
	R_RenderScene();
	R_DrawViewModel();
	R_DrawWaterSurfaces();

	// render mirror view
	R_Mirror();

	// render what teleporters lead to
	R_PortalViews();

	// Present the frame via Three.js
	if ( renderer && scene && camera ) {

		// crossing into the next level: from the moment the player is through, and
		// while the level loads, keep showing the level they are entering
		const leaving = R_LevelTransitionBegin();

		if ( post ) {

			R_PostBind( renderer );
			renderer.render( scene, camera );
			R_PostFinish( renderer, scene, camera, _viewport, r_visframecount, d_lightstylevalue,
				cl_dlights, cl != null ? cl.time : 0, renderer.toneMappingExposure, R_MapHasSky() );

		} else {

			renderer.render( scene, camera );

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
	Cvar_RegisterVariable( r_dynres );
	Cvar_RegisterVariable( r_fps_target );
	Cvar_RegisterVariable( r_newdark );
	Cvar_RegisterVariable( r_newedges );
	Cvar_RegisterVariable( r_bloom );
	Cvar_RegisterVariable( r_volumetric );
	Cvar_RegisterVariable( r_caustics );
	Cvar_RegisterVariable( r_newbright );
	Cvar_RegisterVariable( r_newcontrast );
	Cvar_RegisterVariable( r_lerpmodels );
	Cvar_RegisterVariable( r_newer_variety );
	Cvar_RegisterVariable( r_newer_lighting );
	Cvar_RegisterVariable( r_newer_water );
	Cvar_RegisterVariable( r_newer_enemies );
	Cvar_RegisterVariable( r_newer_textures );
	Cvar_RegisterVariable( r_newer_hud );
	Cvar_RegisterVariable( r_newer_shadows );
	Cvar_RegisterVariable( r_newer_portals );
	Cvar_RegisterVariable( r_flashlight );
	Cvar_RegisterVariable( r_decals );
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
	R_FlashlightInit();

	R_InitParticles();
	R_SetParticleExternals( { scene: scene } );

	Con_Printf( 'R_Init: Three.js renderer ready' );

}

//============================================================================
// R_NewMap
//
// Called when a new map is loaded
//============================================================================

export function R_NewMap() {

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
	R_DecalsClear();
	R_ScreenDropsReset();
	R_MuzzleSetProbe( ( p ) => R_LightPoint( p, cl ) );

	// Clean up all cached entity resources from the previous map. Static
	// entities keep their JS identity across CL_ClearState, so invalidate the
	// owner-side caches as well as the scene tracking sets.
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
