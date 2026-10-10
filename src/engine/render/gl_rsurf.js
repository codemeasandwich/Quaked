/**
 * @module engine/render/gl_rsurf
 *
 * World surfaces (WinQuake gl_rsurf.c): the BSP walk, lightmaps, brush models, and Newer Game's materials and relief
 * on them. Since card [44i] this module keeps only the two sequences, the frame's (`R_DrawWorld`) and the map load's
 * (`GL_BuildLightmaps`), and the public names, re-exported from the stages it was split into: gl_rsurf_state.js (the
 * world's groups), gl_rsurf_lightmaps.js (atlases, surface polygons), gl_rsurf_materials.js (the lit material,
 * texture animation), gl_rsurf_liquids.js (liquids and sky), gl_rsurf_batches.js (the cached world meshes, leaf
 * marking and visibility), gl_rsurf_world.js (the BSP walk and the texture chains) and gl_rsurf_brush.js (brush
 * entities). Each stage imports only those before it in that list.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/gl_rsurf.c -- surface-related refresh code

import { R_RockfieldUpdate } from '../common/hooks.js'; // installed by newer/render/r_rockfield.js
import { R_NewerGame } from '../common/hooks.js'; // installed by newer/mode.js
import { cl } from '../client/client.js';
import { R_BuildWorldLights } from '../common/hooks.js'; // installed by newer/render/gl_post.js
import { R_BuildPortals } from '../common/hooks.js'; // installed by newer/render/gl_portal.js
import { r_refdef } from './render.js';
import { SURF_DRAWSKY, SURF_DRAWTURB, modelorg, r_worldentity, r_framecount, set_r_framecount, set_currententity, set_currenttexture } from './gl_rmain.js';
import { VectorCopy } from '../common/mathlib.js';
import { worldState, R_EnsureWorldGroup } from './gl_rsurf_state.js';
import { MAX_LIGHTMAPS, lightmap_polys, R_BlendLightmaps, BuildSurfaceDisplayList, GL_CreateSurfaceLightmap, R_LightmapsClear, R_LightmapsSetFormat, R_LightmapsSetModel, R_LightmapsUpload } from './gl_rsurf_lightmaps.js';
export { BLOCK_WIDTH, BLOCK_HEIGHT, MAX_LIGHTMAPS, gl_lightmap_format, gl_solid_format, gl_alpha_format, gl_mtexable, DYNAMIC_SHARE, R_BuildLightMap, R_BlendLightmaps, AllocBlock, BuildSurfaceDisplayList, GL_CreateSurfaceLightmap, lightmapTextures, R_ClassicLightmap, R_ClassicLightmapsFrame } from './gl_rsurf_lightmaps.js';
export { createQuakeLightmapMaterial, R_TextureAnimation, R_UpdateAnimatedMaterial, DrawGLPoly } from './gl_rsurf_materials.js';
import { clearWaterTextureLight, R_LiquidsClear, R_LiquidsBeginFrame, R_SkyClear } from './gl_rsurf_liquids.js';
export { R_UpdateWaterTextureLight, R_ClassicSurfaceMaterial, DrawGLWaterPoly, R_CleanupWaterMeshes, R_LiquidSurfaceMaterial } from './gl_rsurf_liquids.js';
import { R_UpdateDemonSurfaces, R_WorldBatchesClear, R_BuildWorldMeshes, R_UpdateWorldTextureAnimations, R_BuildWorldOccluder, R_UpdateWorldVisibility } from './gl_rsurf_batches.js';
export { R_DemonReliefStatus, R_MarkLeaves, R_WorldShowAll, R_ClassicArchVisibility } from './gl_rsurf_batches.js';
import { R_AddPortalReceiverSurfaces, R_RecursiveWorldNode, DrawTextureChains } from './gl_rsurf_world.js';
export { skytexturenum, set_skytexturenum, R_DrawSequentialPoly, R_RenderBrushPoly, R_RenderDynamicLightmaps, R_RecursiveWorldNode, DrawTextureChains, R_DrawWaterSurfaces } from './gl_rsurf_world.js';
import { R_BrushClear, R_BrushBeginFrame } from './gl_rsurf_brush.js';
export { R_DrawBrushModel } from './gl_rsurf_brush.js';

//============================================================================
// R_DrawWorld
//============================================================================

/**
 * Draws the world for this frame (WinQuake gl_rsurf.c): makes `r_worldentity` current, removes last frame's brush
 * entity groups from the scene, walks the BSP (`R_RecursiveWorldNode`) and the portal receivers, updates the cached
 * world batches' visibility from the PVS (and Newer Game's demon relief and rock field), then draws the texture
 * chains and uploads changed lightmaps. Creates the `quake_world` group on first use. Called once per frame from
 * `R_RenderScene` (gl_rmain.js), after `R_MarkLeaves`; does nothing without a world model.
 */
export function R_DrawWorld() {

	const cl_ref = cl;
	if ( ! cl_ref || ! cl_ref.worldmodel ) return;
	r_worldentity.model = cl_ref.worldmodel;
	r_worldentity.frame = 0;
	set_currententity( r_worldentity );

	VectorCopy( r_refdef.vieworg, modelorg );
	R_UpdateWorldTextureAnimations();

	set_currenttexture( - 1 );

	// clear lightmap polys
	for ( let i = 0; i < MAX_LIGHTMAPS; i ++ )
		lightmap_polys[ i ] = null;

	// create world group if needed
	R_EnsureWorldGroup();

	// Begin new water/sky frame: clear "this frame" set
	R_LiquidsBeginFrame();

	R_BrushBeginFrame();

	// Set the render group to the world's group for world surface rendering
	worldState.renderGroup = worldState.group;

	R_RecursiveWorldNode( cl_ref.worldmodel.nodes[ 0 ] );

	R_AddPortalReceiverSurfaces( cl_ref.worldmodel );

	// Update mesh visibility based on PVS (leaf visframe set by R_MarkLeaves)
	R_UpdateDemonSurfaces();
	R_UpdateWorldVisibility();
	R_RockfieldUpdate( r_refdef.vieworg, r_framecount );

	DrawTextureChains();

	R_BlendLightmaps();

}

/**
 * Builds the lightmap texture with all the surfaces from all brush models (WinQuake gl_rsurf.c). In Three.js, we
 * create THREE.DataTexture objects for each lightmap atlas. Called at every map load by `R_NewMap` (gl_rmain.js),
 * and by tools that bake world data.
 *
 * First it throws away the previous map's render state: world batches, liquid and sky meshes and materials, brush
 * entity groups and materials, the lightmap textures, and the atlas count goes back to 64. Then, for every loaded
 * brush model (inline `*` submodels are covered by the world's surface list), it places and builds each surface's
 * lightmap and rebuilds its polygon. The atlas holds one byte per texel, or red, green and blue when the map has a
 * coloured (.lit) lightmap and Newer Game is on; this choice is fixed until the next call. Finally it uploads each
 * used atlas as RGBA brightness, builds the cached world meshes, links teleporter portals and builds the HDR
 * pipeline's world lights and shadow occluder. Resets `r_framecount` to 1. Returns early without a client state.
 *
 * @throws {Error} via `Sys_Error` when the lightmap atlases are full (`AllocBlock: full`)
 */
export function GL_BuildLightmaps() {

	clearWaterTextureLight();

	const cl_ref = cl;
	if ( ! cl_ref ) return;

	R_WorldBatchesClear();

	R_LiquidsClear();

	R_BrushClear();

	R_SkyClear();

	R_LightmapsClear();

	set_r_framecount( 1 ); // no dlightcache

	// set lightmap format -- use luminance (1 byte per texel)
	// (3 bytes, red green blue, when the level has coloured lightmaps and Newer Game is on)
	R_LightmapsSetFormat( ( cl_ref.worldmodel != null && cl_ref.worldmodel.litdata != null && R_NewerGame() ) ? 3 : 1 );

	// build lightmaps for all brush models
	const count = cl_ref.model_precache ? cl_ref.model_precache.length : 0; // up to MAX_MODELS (card [34f])
	for ( let j = 1; j < count; j ++ ) {

		const m = cl_ref.model_precache ? cl_ref.model_precache[ j ] : null;
		if ( ! m ) break;
		if ( m.name && m.name.charAt( 0 ) === '*' )
			continue;

		R_LightmapsSetModel( m );

		if ( m.surfaces ) {

			// Iterate ALL surfaces (m->numsurfaces), not just the world model's
			// own range. The world model's surfaces array includes submodel
			// surfaces (doors, platforms, buttons) which also need polys built.
			// This matches the original C: for (i=0; i<m->numsurfaces; i++)
			for ( let i = 0; i < m.numsurfaces; i ++ ) {

				GL_CreateSurfaceLightmap( m.surfaces[ i ] );

				if ( m.surfaces[ i ].flags & SURF_DRAWTURB )
					continue;
				if ( m.surfaces[ i ].flags & SURF_DRAWSKY )
					continue;

				BuildSurfaceDisplayList( m.surfaces[ i ] );

			}

		}

	}

	R_LightmapsUpload();

	// Build cached meshes for all world surfaces (after lightmap textures are ready)
	R_BuildWorldMeshes();

	// link teleporter surfaces to their receivers
	R_BuildPortals( cl_ref.worldmodel );

	// lights and emitters for the HDR pipeline's volumetrics
	R_BuildWorldLights( cl_ref.worldmodel );
	R_BuildWorldOccluder( cl_ref.worldmodel );

}

//============================================================================
// Stub for external dependency
//============================================================================

// Mod_LeafPVS: imported from gl_model.js at top of file

// cl is imported from client.js at the top of this file
