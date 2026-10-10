/**
 * @module engine/render/gl_rsurf
 *
 * World surfaces (WinQuake gl_rsurf.c): the BSP walk, lightmaps, brush models, and Newer Game's materials and relief
 * on them.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `skytexturenum`; module-level variables `_visibilityNeedsUpdate`, `skychain`, `waterchain`,
 * `worldMeshesBuilt`, `demonEnabled`, `brushEntityGroups`, `_markleaves_solid`, `_lastMarkedPostActive`,
 * `archVisibilityKey`, `occluderRevision`; 2 module-level collections (Map/Set).
 *
 * Errors: throws at 1 place; catches at 1 place.
 */
// Ported from: WinQuake/gl_rsurf.c -- surface-related refresh code

import * as THREE from 'three';
import { R_RockfieldBuild, R_RockfieldChart, R_RockfieldGeometry, R_RockfieldUpdate, R_RockfieldBrushSeen } from '../common/hooks.js'; // installed by newer/render/r_rockfield.js
import { R_NewerGame, r_newer_normals, r_newer_textures } from '../common/hooks.js'; // installed by newer/mode.js
import { R_ArchSurfaceHidden, R_ArchModelHidden, R_ArchHiddenRevision, R_HasArchHidden } from '../common/hooks.js'; // installed by newer/render/r_archframe.js
import { DEMON_TEXTURES, R_DemonSurfaceData } from '../common/hooks.js'; // installed by newer/render/r_demonrelief.js
import { R_DemonBakePrepare, R_DemonBakeSurface, R_DemonBakeStatus } from '../common/hooks.js'; // installed by newer/assets/r_demonbakes.js
import { cl, cl_dlights, MAX_DLIGHTS, MAX_VISEDICTS, cl_visedicts, cl_numvisedicts, set_cl_numvisedicts } from '../client/client.js';
import { R_StoreEfrags } from './gl_refrag.js';
import { R_BuildWorldLights, R_BuildSunOccluder, R_PostActive, R_WaterActive, R_GetLiquidLinks } from '../common/hooks.js'; // installed by newer/render/gl_post.js
import { R_BuildPortals, R_GetPortals, R_PortalsActive, R_BoxInPortalReceiver } from '../common/hooks.js'; // installed by newer/render/gl_portal.js
import { R_MarkLights } from './gl_rlight.js';
import { r_refdef } from './render.js';
import { PLANE_X, PLANE_Y, PLANE_Z, SURF_PLANEBACK, SURF_DRAWSKY, SURF_DRAWTURB, SURF_UNDERWATER, MAXLIGHTMAPS, modelorg, r_worldentity, r_visframecount, r_framecount, mirror, mirrortexturenum, d_lightstylevalue, r_dynamic, r_wateralpha, r_mirroralpha, r_novis, gl_texsort, gl_flashblend, R_CullBox, scene, r_viewleaf, r_oldviewleaf, inc_r_visframecount, set_r_framecount, set_currententity, inc_c_brush_polys, set_currenttexture, set_r_oldviewleaf, set_mirror, set_mirror_plane } from './gl_rmain.js';
import { DotProduct, VectorCopy, VectorAdd } from '../common/mathlib.js';
import { Mod_LeafPVS, Mod_PointInLeaf } from './gl_model.js';
import { realtime } from '../common/host_state.js';
import { worldState, R_EnsureWorldGroup } from './gl_rsurf_state.js';
import { BLOCK_WIDTH, BLOCK_HEIGHT, MAX_LIGHTMAPS, lightmap_bytes, lightmap_polys, lightmap_modified, lightmap_rectchange, lightmaps, R_BuildLightMap, R_BlendLightmaps, BuildSurfaceDisplayList, GL_CreateSurfaceLightmap, lightmapTextures, R_LightmapsClear, R_LightmapsSetFormat, R_LightmapsSetModel, R_LightmapsUpload } from './gl_rsurf_lightmaps.js';
import { createQuakeLightmapMaterial, R_TextureAnimation, R_UpdateAnimatedMaterial, DrawGLPoly, _mergeGLPolys } from './gl_rsurf_materials.js';
import { _getWaterMaterial, clearWaterTextureLight, _getWaterMesh, EmitWaterPolysQuake, R_LiquidsClear, R_LiquidsBeginFrame, R_DrawSkyChain, R_SkyClear } from './gl_rsurf_liquids.js';
export { R_UpdateWaterTextureLight, R_ClassicSurfaceMaterial, DrawGLWaterPoly, R_CleanupWaterMeshes, R_LiquidSurfaceMaterial } from './gl_rsurf_liquids.js';
export { createQuakeLightmapMaterial, R_TextureAnimation, R_UpdateAnimatedMaterial, DrawGLPoly } from './gl_rsurf_materials.js';
export { BLOCK_WIDTH, BLOCK_HEIGHT, MAX_LIGHTMAPS, gl_lightmap_format, gl_solid_format, gl_alpha_format, gl_mtexable, DYNAMIC_SHARE, R_BuildLightMap, R_BlendLightmaps, AllocBlock, BuildSurfaceDisplayList, GL_CreateSurfaceLightmap, lightmapTextures, R_ClassicLightmap, R_ClassicLightmapsFrame } from './gl_rsurf_lightmaps.js';

//============================================================================
// Module-level state
//============================================================================

export let skytexturenum = - 1; // index in cl.loadmodel, not gl texture object
/**
 * Sets `skytexturenum`, the world texture whose chain `DrawTextureChains` draws as sky. Set at map load by
 * `R_NewMap` (gl_rmisc.js) to the last texture whose name starts with `sky`.
 *
 * @param {number} v index into `cl.worldmodel.textures`, or -1 for none (not a GL texture object)
 */
export function set_skytexturenum( v ) { skytexturenum = v; }

// Flag to track if PVS changed and visibility needs update
let _visibilityNeedsUpdate = true;

// For gl_texsort 0
let skychain = null; // msurface_t
let waterchain = null; // msurface_t

// Three.js geometry cache for BSP surfaces
let worldMeshesBuilt = false; // true after R_BuildWorldMeshes has run

// PVS visibility using BatchedMesh for efficient rendering
// instanceVisInfo: Array<{batch: BatchedMesh, instanceId: number, leaves: leaf[]}>
// Each instance tracks all leaves that contain its surface - visible if ANY leaf is visible
const instanceVisInfo = [];

// All BatchedMesh objects for the world (one per texture/lightmap combo)
const worldBatchedMeshes = [];

// Animated materials within the cached world batches.
const worldAnimatedMeshes = [];
const demonSurfaces = [];
let demonEnabled = false;

/**
 * Reports the state of Newer Game's raised demon plaques in the current world, for the intro/loading readiness
 * checks (`R_UpdateIntroReadiness` in gl_rmain.js) and the readiness report.
 *
 * @returns {{ preparedPending: number, preparedPhase: string, preparedSource: string, persistence: ?string,
 * eligible: number, ready: number, nativeOnly: number, pending: number, triangles: number, enabled: boolean,
 * errors: Array<string> }} a new object: the `prepared*` fields and `persistence` are the prepared bakes' state from
 * `R_DemonBakeStatus` (r_demonbakes.js); `eligible` counts the world's demon-texture surfaces found at map load;
 * `ready` those with a raised mesh built; `nativeOnly` those whose prepared bake keeps the flat native face;
 * `pending` those still waiting (bake loading or failed, or no mesh yet while the texture is pending or has a
 * displacement field); `triangles` the raised meshes' total triangles; `enabled` whether relief is currently shown;
 * `errors` the bake's and surfaces' error messages
 */
export function R_DemonReliefStatus() {

	const prepared=R_DemonBakeStatus();
	return { preparedPending:prepared.pending,preparedPhase:prepared.phase,preparedSource:prepared.source,persistence:prepared.persistence,eligible: demonSurfaces.length, ready: demonSurfaces.filter( s => s.mesh ).length,
		nativeOnly: demonSurfaces.filter(s=>R_DemonBakeSurface(s.surface).status==='native').length,
		pending: demonSurfaces.filter(s=>R_DemonBakeSurface(s.surface).status!=='native'&&(['loading','error'].includes(R_DemonBakeSurface(s.surface).status)||!s.mesh&&(s.surface.texinfo.texture.gl_texture?.userData.newerPending||s.surface.texinfo.texture.gl_texture?.userData.newerHeight?.displacement))).length,
		triangles: demonSurfaces.reduce( ( sum, s ) => sum + ( s.data?.triangles || 0 ), 0 ), enabled: demonEnabled,
		errors: [prepared.error,...demonSurfaces.map(s=>R_DemonBakeSurface(s.surface).error)].filter(Boolean) };

}

// Keep native flat surfaces as backing, and retain them unchanged for Classic.
// Raised decorative meshes share their original PVS leaves and lightmap UVs.
function R_UpdateDemonSurfaces() {

	const enabled = R_NewerGame() && r_newer_normals.value !== 0 && r_newer_textures.value !== 0;
	const bake=enabled?R_DemonBakePrepare(cl.worldmodel,demonSurfaces.map(record=>record.surface)):null;
	let changed = enabled !== demonEnabled;
	demonEnabled = enabled;
	if(!enabled){for(const record of demonSurfaces)if(record.mesh)record.mesh.visible=false;if(changed)R_BuildWorldOccluder(cl.worldmodel);return;}
	for ( const record of demonSurfaces ) {

		const field = record.surface.texinfo.texture.gl_texture?.userData.newerHeight;
		const prepared=enabled?R_DemonBakeSurface(record.surface):null;
		if(field?.displacement&&(bake?.status==='loading'||prepared?.status==='loading'))continue;
		if ( record.field !== field || record.bakeData !== prepared?.data || record.bakeStatus !== prepared?.status ) {

			record.field = field;record.bakeData=prepared?.data;record.bakeStatus=prepared?.status;
			if ( record.mesh ) {

				record.mesh.geometry.dispose(); record.mesh.material.dispose();
				record.mesh.parent?.remove( record.mesh );
				const at = instanceVisInfo.indexOf( record.visibility );
				if ( at >= 0 ) instanceVisInfo.splice( at, 1 );
				changed = true;

			}
			record.mesh = null; record.data = null;
			// Known shipped data failures keep native backing, with explicit diagnostics;
			// only unprepared/custom source/settings use the runtime generator.
			const data = ['error','native'].includes(prepared?.status)?null:prepared?.data||R_DemonSurfaceData( record.surface );
			if ( data ) {
				const geometry = new THREE.BufferGeometry();
    if(data.interleaved){
     const buffer=new THREE.InterleavedBuffer(data.interleaved,10);
     geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));
     geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(buffer,3,3));
     geometry.setAttribute('uv',new THREE.InterleavedBufferAttribute(buffer,2,6));
     geometry.setAttribute('uv1',new THREE.InterleavedBufferAttribute(buffer,2,8));
     geometry.setIndex(new THREE.BufferAttribute(data.indices,1));
    }else{
     geometry.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
     geometry.setAttribute('normal',new THREE.BufferAttribute(data.normals,3));
     geometry.setAttribute('uv',new THREE.BufferAttribute(data.uvs,2));
     geometry.setAttribute('uv1',new THREE.BufferAttribute(data.lmuvs,2));
    }
				geometry.computeBoundingBox(); geometry.computeBoundingSphere();
				const material = createQuakeLightmapMaterial( record.surface.texinfo.texture.gl_texture, lightmapTextures[ record.surface.lightmaptexturenum ] );
				material.userData.realDisplacement = true;
				material.needsUpdate = true;
				const mesh = new THREE.Mesh( geometry, material );
				mesh.name = 'world_' + record.surface.texinfo.texture.name + '_displaced';
				mesh.userData.newerOnly = true; mesh.castShadow = true; mesh.receiveShadow = true;
				record.mesh = mesh; record.data = data; record.pvsVisible = true;
				record.visibility = { leaves: record.leaves, instanceId: 0, batch: { setVisibleAt( _, visible ) {

					record.pvsVisible = visible; mesh.visible = visible && demonEnabled;

				} } };
				instanceVisInfo.push( record.visibility ); worldState.group.add( mesh );
				_visibilityNeedsUpdate = true; changed = true;

			}

		}
		if ( record.mesh ) record.mesh.visible = enabled && record.pvsVisible;

	}
	if ( changed && cl.worldmodel ) R_BuildWorldOccluder( cl.worldmodel );

}

// Pre-allocated scratch arrays to avoid per-frame allocations
const _cullBoxMaxs = new Float32Array( 3 ); // for R_CullBox in R_RecursiveWorldNode

// Brush entity rendering support
// worldState.renderGroup is the THREE.Group that surface renderers add meshes to.
// Defaults to worldState.group, but temporarily swapped to a brush entity group
// during R_DrawBrushModel (equivalent of glPushMatrix/glPopMatrix).
let brushEntityGroups = []; // per-frame brush entity groups to dispose next frame

// Material cache for brush entities - keyed by "diffuseId_lightmapId"
// Materials are reused across frames to avoid shader recompilation
const _brushMaterialCache = new Map();

// Track all brush entity groups for disposal on map change
const _allBrushEntityGroups = new Set();

// Pre-allocated scratch arrays for R_DrawBrushModel (avoid per-call allocations)
const _brushMins = new Float32Array( 3 );
const _brushMaxs = new Float32Array( 3 );
const _brushTemp = new Float32Array( 3 );
const _brushForward = new Float32Array( 3 );
const _brushRight = new Float32Array( 3 );
const _brushUp = new Float32Array( 3 );
const _brushPlaneNormal = new Float32Array( 3 );

//============================================================================
// R_DrawSequentialPoly
//============================================================================

/**
 * Systems that have fast state and texture changes can just do everything as it passes with no need to sort
 * (WinQuake gl_rsurf.c, the `gl_texsort 0` path). A lightmapped surface (including an underwater one) is queued on
 * its lightmap chain and its lightmap rebuilt if needed (`R_RenderDynamicLightmaps`); a turbulent surface gets its
 * liquid mesh for this frame in the current render group; sky is skipped here. Called from the world walk for each
 * visible surface while `gl_texsort` is 0.
 *
 * @param {msurface_t} s the surface
 */
export function R_DrawSequentialPoly( s ) {

	//
	// normal lightmaped poly
	//
	if ( ! ( s.flags & ( SURF_DRAWSKY | SURF_DRAWTURB | SURF_UNDERWATER ) ) ) {

		R_RenderDynamicLightmaps( s );
		return;

	}

	//
	// subdivided water surface warp
	//
	if ( s.flags & SURF_DRAWTURB ) {

		const renderGroup = worldState.renderGroup || worldState.group;
		if ( s.polys && renderGroup ) {

			const realtime = cl ? cl.time : 0;
			const geometry = EmitWaterPolysQuake( s, realtime );
			if ( geometry ) {

				const t = R_TextureAnimation( s.texinfo.texture );
				const material = _getWaterMaterial( t, r_wateralpha.value );
				_getWaterMesh( s, geometry, material, renderGroup );

			}

		}

		return;

	}

	//
	// subdivided sky warp
	//
	if ( s.flags & SURF_DRAWSKY ) {

		// Sky rendering -- skip for now (needs sky texture setup)
		return;

	}

	//
	// underwater warped with lightmap
	//
	R_RenderDynamicLightmaps( s );

}

//============================================================================
// R_RenderBrushPoly
//============================================================================

/**
 * Draws one surface of a texture chain (WinQuake gl_rsurf.c): counts it in `c_brush_polys`, skips sky (drawn from
 * the sky chain), gives a turbulent surface its liquid mesh for this frame, and otherwise links the surface's polys
 * onto its lightmap's chain and, while `r_dynamic` is on, rebuilds its lightmap into the atlas when a light style
 * changed or a dynamic light touches it (now or last frame), widening the atlas's changed rectangle. Called by
 * `DrawTextureChains` for each chained surface. `R_BlendLightmaps` uploads the changes.
 *
 * @param {msurface_t} fa the surface; mutated (`polys.chain`, `cached_light`, `cached_dlight`)
 */
export function R_RenderBrushPoly( fa ) {

	let t;
	let maps;

	inc_c_brush_polys();

	if ( fa.flags & SURF_DRAWSKY ) {

		// Sky surfaces are rendered via skychain in R_DrawSkyChain, not here
		return;

	}

	t = R_TextureAnimation( fa.texinfo.texture );

	if ( fa.flags & SURF_DRAWTURB ) {

		const renderGroup = worldState.renderGroup || worldState.group;
		if ( fa.polys && renderGroup ) {

			const realtime = cl ? cl.time : 0;
			const geometry = EmitWaterPolysQuake( fa, realtime );
			if ( geometry ) {

				const material = _getWaterMaterial( t, r_wateralpha.value );
				_getWaterMesh( fa, geometry, material, renderGroup );

			}

		}

		return;

	}

	// add the poly to the proper lightmap chain
	if ( fa.polys ) {

		fa.polys.chain = lightmap_polys[ fa.lightmaptexturenum ];
		lightmap_polys[ fa.lightmaptexturenum ] = fa.polys;

	}

	// check for lightmap modification
	for ( maps = 0; maps < MAXLIGHTMAPS && fa.styles[ maps ] !== 255; maps ++ ) {

		if ( d_lightstylevalue[ fa.styles[ maps ] ] !== fa.cached_light[ maps ] ) {

			// dynamic -- need to rebuild lightmap
			if ( r_dynamic.value ) {

				lightmap_modified[ fa.lightmaptexturenum ] = true;
				const theRect = lightmap_rectchange[ fa.lightmaptexturenum ];
				if ( fa.light_t < theRect.t ) {

					if ( theRect.h )
						theRect.h += theRect.t - fa.light_t;
					theRect.t = fa.light_t;

				}

				if ( fa.light_s < theRect.l ) {

					if ( theRect.w )
						theRect.w += theRect.l - fa.light_s;
					theRect.l = fa.light_s;

				}

				const smax = ( fa.extents[ 0 ] >> 4 ) + 1;
				const tmax = ( fa.extents[ 1 ] >> 4 ) + 1;
				if ( ( theRect.w + theRect.l ) < ( fa.light_s + smax ) )
					theRect.w = ( fa.light_s - theRect.l ) + smax;
				if ( ( theRect.h + theRect.t ) < ( fa.light_t + tmax ) )
					theRect.h = ( fa.light_t - theRect.t ) + tmax;

				const baseOffset = fa.lightmaptexturenum * lightmap_bytes * BLOCK_WIDTH * BLOCK_HEIGHT;
				const offset = baseOffset + fa.light_t * BLOCK_WIDTH * lightmap_bytes + fa.light_s * lightmap_bytes;
				R_BuildLightMap( fa, lightmaps, offset, BLOCK_WIDTH * lightmap_bytes );

			}

			break;

		}

	}

	// Also check if dynamic this frame or dynamic previously
	if ( fa.dlightframe === r_framecount || fa.cached_dlight ) {

		if ( r_dynamic.value ) {

			lightmap_modified[ fa.lightmaptexturenum ] = true;
			const theRect = lightmap_rectchange[ fa.lightmaptexturenum ];
			if ( fa.light_t < theRect.t ) {

				if ( theRect.h )
					theRect.h += theRect.t - fa.light_t;
				theRect.t = fa.light_t;

			}

			if ( fa.light_s < theRect.l ) {

				if ( theRect.w )
					theRect.w += theRect.l - fa.light_s;
				theRect.l = fa.light_s;

			}

			const smax = ( fa.extents[ 0 ] >> 4 ) + 1;
			const tmax = ( fa.extents[ 1 ] >> 4 ) + 1;
			if ( ( theRect.w + theRect.l ) < ( fa.light_s + smax ) )
				theRect.w = ( fa.light_s - theRect.l ) + smax;
			if ( ( theRect.h + theRect.t ) < ( fa.light_t + tmax ) )
				theRect.h = ( fa.light_t - theRect.t ) + tmax;

			const baseOffset = fa.lightmaptexturenum * lightmap_bytes * BLOCK_WIDTH * BLOCK_HEIGHT;
			const offset = baseOffset + fa.light_t * BLOCK_WIDTH * lightmap_bytes + fa.light_s * lightmap_bytes;
			R_BuildLightMap( fa, lightmaps, offset, BLOCK_WIDTH * lightmap_bytes );

		}

	}

}

//============================================================================
// R_RenderDynamicLightmaps (multitexture path)
//============================================================================

/**
 * The lightmap half of `R_RenderBrushPoly` (WinQuake gl_rsurf.c, multitexture path): counts the surface, skips sky
 * and turbulent surfaces, links its polys onto its lightmap's chain and, while `r_dynamic` is on, rebuilds its
 * lightmap into the atlas when a light style changed or a dynamic light touches it (now or last frame). Called by
 * `R_DrawSequentialPoly` and, every frame for each of a brush entity's surfaces, by `R_DrawBrushModel`, since the
 * atlases are shared with the world.
 *
 * @param {msurface_t} fa the surface; mutated (`polys.chain`, `cached_light`, `cached_dlight`)
 */
export function R_RenderDynamicLightmaps( fa ) {

	let maps;

	inc_c_brush_polys();

	if ( fa.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) )
		return;

	if ( fa.polys ) {

		fa.polys.chain = lightmap_polys[ fa.lightmaptexturenum ];
		lightmap_polys[ fa.lightmaptexturenum ] = fa.polys;

	}

	// check for lightmap modification
	for ( maps = 0; maps < MAXLIGHTMAPS && fa.styles[ maps ] !== 255; maps ++ ) {

		if ( d_lightstylevalue[ fa.styles[ maps ] ] !== fa.cached_light[ maps ] ) {

			if ( r_dynamic.value ) {

				lightmap_modified[ fa.lightmaptexturenum ] = true;
				const theRect = lightmap_rectchange[ fa.lightmaptexturenum ];
				if ( fa.light_t < theRect.t ) {

					if ( theRect.h )
						theRect.h += theRect.t - fa.light_t;
					theRect.t = fa.light_t;

				}

				if ( fa.light_s < theRect.l ) {

					if ( theRect.w )
						theRect.w += theRect.l - fa.light_s;
					theRect.l = fa.light_s;

				}

				const smax = ( fa.extents[ 0 ] >> 4 ) + 1;
				const tmax = ( fa.extents[ 1 ] >> 4 ) + 1;
				if ( ( theRect.w + theRect.l ) < ( fa.light_s + smax ) )
					theRect.w = ( fa.light_s - theRect.l ) + smax;
				if ( ( theRect.h + theRect.t ) < ( fa.light_t + tmax ) )
					theRect.h = ( fa.light_t - theRect.t ) + tmax;

				const baseOffset = fa.lightmaptexturenum * lightmap_bytes * BLOCK_WIDTH * BLOCK_HEIGHT;
				const offset = baseOffset + fa.light_t * BLOCK_WIDTH * lightmap_bytes + fa.light_s * lightmap_bytes;
				R_BuildLightMap( fa, lightmaps, offset, BLOCK_WIDTH * lightmap_bytes );

			}

			break;

		}

	}

	if ( fa.dlightframe === r_framecount || fa.cached_dlight ) {

		if ( r_dynamic.value ) {

			lightmap_modified[ fa.lightmaptexturenum ] = true;
			const theRect = lightmap_rectchange[ fa.lightmaptexturenum ];
			if ( fa.light_t < theRect.t ) {

				if ( theRect.h )
					theRect.h += theRect.t - fa.light_t;
				theRect.t = fa.light_t;

			}

			if ( fa.light_s < theRect.l ) {

				if ( theRect.w )
					theRect.w += theRect.l - fa.light_s;
				theRect.l = fa.light_s;

			}

			const smax = ( fa.extents[ 0 ] >> 4 ) + 1;
			const tmax = ( fa.extents[ 1 ] >> 4 ) + 1;
			if ( ( theRect.w + theRect.l ) < ( fa.light_s + smax ) )
				theRect.w = ( fa.light_s - theRect.l ) + smax;
			if ( ( theRect.h + theRect.t ) < ( fa.light_t + tmax ) )
				theRect.h = ( fa.light_t - theRect.t ) + tmax;

			const baseOffset = fa.lightmaptexturenum * lightmap_bytes * BLOCK_WIDTH * BLOCK_HEIGHT;
			const offset = baseOffset + fa.light_t * BLOCK_WIDTH * lightmap_bytes + fa.light_s * lightmap_bytes;
			R_BuildLightMap( fa, lightmaps, offset, BLOCK_WIDTH * lightmap_bytes );

		}

	}

}

//============================================================================
// R_DrawBrushModel
//============================================================================

// Euler object reused for brush entity rotation (avoid per-frame allocation)
const _brushEuler = new THREE.Euler( 0, 0, 0, 'ZYX' );

// Real displacement for a demon plaque that belongs to a brush entity (a door, a plat, a secret wall),
// such as the e1m4 door with dem5_3 on both faces. The world's plaques are meshes in the world batch with
// the world's PVS (R_UpdateDemonSurfaces); an entity's surfaces are not part of that, and move, so the
// raised surface is a child of the entity's cached group and follows its transform. It is generated at
// run time from the same sculpted field as the world's (R_DemonSurfaceData: the prepared bakes are keyed to
// the world model) the first time the textures are ready, and the entity's own flat face stays as its
// backing. Only the large faces (a plaque, not the narrow strips on the edge of a door slab) are raised.
const DEMON_BRUSH_MIN_TILES = .5; // (polygon texture coordinates are in tiles of the texture: a 64-unit plaque spans 1, the 8-unit edge of a door slab .125)

function R_BrushDemonCandidates( clmodel ) {

	const list = [];
	if ( ! clmodel.surfaces || ! clmodel.nummodelsurfaces ) return list;
	for ( let i = 0; i < clmodel.nummodelsurfaces; i ++ ) {

		const surface = clmodel.surfaces[ clmodel.firstmodelsurface + i ];
		if ( ! surface || ! surface.polys || ! DEMON_TEXTURES.has( surface.texinfo?.texture?.name ) ) continue;
		let lo = [ Infinity, Infinity ], hi = [ - Infinity, - Infinity ];
		for ( let p = surface.polys; p; p = p.next ) for ( let v = 0; v < p.numverts; v ++ ) for ( let k = 0; k < 2; k ++ ) {

			const x = p.verts instanceof Float32Array ? p.verts[ v * 7 + 3 + k ] : p.verts[ v ][ 3 + k ];
			if ( x < lo[ k ] ) lo[ k ] = x;
			if ( x > hi[ k ] ) hi[ k ] = x;

		}
		if ( hi[ 0 ] - lo[ 0 ] >= DEMON_BRUSH_MIN_TILES && hi[ 1 ] - lo[ 1 ] >= DEMON_BRUSH_MIN_TILES ) list.push( { surface, field: null, mesh: null } );

	}
	return list;

}

function R_UpdateBrushDemon( e, brushGroup, clmodel ) {

	let records = e._demonRelief;
	if ( records === undefined ) records = e._demonRelief = R_BrushDemonCandidates( clmodel );
	if ( records.length === 0 ) return;
	const enabled = R_NewerGame() && r_newer_normals.value !== 0 && r_newer_textures.value !== 0;
	for ( const record of records ) {

		if ( ! enabled ) { if ( record.mesh ) record.mesh.visible = false; continue; }
		const field = record.surface.texinfo.texture.gl_texture?.userData.newerHeight;
		if ( record.field !== field ) {

			record.field = field;
			if ( record.mesh ) { brushGroup.remove( record.mesh ); record.mesh.geometry.dispose(); record.mesh.material.dispose(); record.mesh = null; }
			const data = field?.displacement ? R_DemonSurfaceData( record.surface ) : null;
			if ( data ) {

				const geometry = new THREE.BufferGeometry();
				if ( data.interleaved ) {

					const buffer = new THREE.InterleavedBuffer( data.interleaved, 10 );
					geometry.setAttribute( 'position', new THREE.InterleavedBufferAttribute( buffer, 3, 0 ) );
					geometry.setAttribute( 'normal', new THREE.InterleavedBufferAttribute( buffer, 3, 3 ) );
					geometry.setAttribute( 'uv', new THREE.InterleavedBufferAttribute( buffer, 2, 6 ) );
					geometry.setAttribute( 'uv1', new THREE.InterleavedBufferAttribute( buffer, 2, 8 ) );
					geometry.setIndex( new THREE.BufferAttribute( data.indices, 1 ) );

				} else {

					geometry.setAttribute( 'position', new THREE.BufferAttribute( data.positions, 3 ) );
					geometry.setAttribute( 'normal', new THREE.BufferAttribute( data.normals, 3 ) );
					geometry.setAttribute( 'uv', new THREE.BufferAttribute( data.uvs, 2 ) );
					geometry.setAttribute( 'uv1', new THREE.BufferAttribute( data.lmuvs, 2 ) );

				}
				geometry.computeBoundingBox(); geometry.computeBoundingSphere();
				const material = createQuakeLightmapMaterial( record.surface.texinfo.texture.gl_texture, lightmapTextures[ record.surface.lightmaptexturenum ] );
				material.userData.realDisplacement = true;
				material.needsUpdate = true;
				const mesh = new THREE.Mesh( geometry, material );
				mesh.name = 'brush_' + record.surface.texinfo.texture.name + '_displaced';
				mesh.userData.newerOnly = true; mesh.userData.ownMaterial = true; mesh.receiveShadow = true;
				brushGroup.add( mesh );
				record.mesh = mesh;

			}

		}
		if ( record.mesh ) record.mesh.visible = true;

	}

}

const _brushLeafOf = p => Mod_PointInLeaf( p, cl.worldmodel );

/**
 * Draws a brush entity (a door, a plat, a button, a lift) for this frame (WinQuake gl_rsurf.c). Culls it by its
 * bounds (kept when a visible portal shows it), marks the dynamic lights on its surfaces, rebuilds its changed
 * lightmaps, then shows its cached THREE.Group: built the first time (surfaces sharing a base texture, lightmap and
 * rock chart merged into one mesh, materials shared through a cache) and rebuilt when `e.frame` changes. Animated
 * textures swap materials each frame, a demon plaque gets its raised mesh, and the group takes the entity's origin
 * and angles (degrees, pitch negated: the "stupid quake bug"). The group is added to the scene until the next
 * `R_DrawWorld` and is cached on the entity until a frame change or the next `GL_BuildLightmaps`. Ends by uploading
 * modified lightmaps (`R_BlendLightmaps`), as the C code does. Called per frame for each visible brush entity from
 * `R_DrawEntitiesOnList` (gl_rmain.js).
 *
 * @param {entity_t} e the entity, with a brush `model` (nothing is drawn without one); mutated: caches
 * `_brushGroup`, `_brushGroupFrame`, `_brushAnimSurfaces` and `_demonRelief` on it
 */
export function R_DrawBrushModel( e ) {

	// Use pre-allocated scratch arrays to avoid per-call allocations
	const mins = _brushMins;
	const maxs = _brushMaxs;
	let rotated;

	const clmodel = e.model;
	if ( ! clmodel ) return;

	if ( e.angles[ 0 ] || e.angles[ 1 ] || e.angles[ 2 ] ) {

		rotated = true;
		for ( let i = 0; i < 3; i ++ ) {

			mins[ i ] = e.origin[ i ] - clmodel.radius;
			maxs[ i ] = e.origin[ i ] + clmodel.radius;

		}

	} else {

		rotated = false;
		VectorAdd( e.origin, clmodel.mins, mins );
		VectorAdd( e.origin, clmodel.maxs, maxs );

	}

	// (outside the main view but in what a visible portal shows: drawn, so it hides what is behind it in the preview too)
	if ( R_CullBox( mins, maxs ) && ! ( R_PortalsActive() && R_BoxInPortalReceiver( mins, maxs, _brushLeafOf, r_visframecount ) ) )
		return;

	// Calculate dynamic lighting for non-instanced brush models.
	if ( clmodel.firstmodelsurface !== 0 && gl_flashblend.value === 0 ) {

		const root = clmodel.nodes[ clmodel.hulls[ 0 ].firstclipnode ];
		for ( let k = 0; k < MAX_DLIGHTS; k ++ ) {

			const light = cl_dlights[ k ];
			if ( light.die < cl.time || light.radius === 0 )
				continue;

			R_MarkLights( light, 1 << k, root, clmodel.surfaces );

		}

	}

	// Update dynamic lightmaps for brush entity surfaces (flickering lights, etc.)
	// This must happen every frame, even when using cached geometry, because
	// the lightmap textures are shared with world surfaces and need updating.
	if ( clmodel.surfaces && clmodel.nummodelsurfaces ) {

		const startSurf = clmodel.firstmodelsurface;
		for ( let i = 0; i < clmodel.nummodelsurfaces; i ++ ) {

			const psurf = clmodel.surfaces[ startSurf + i ];
			if ( psurf ) R_RenderDynamicLightmaps( psurf );

		}

	}

	// Check if we have a cached brush group for this entity
	// Invalidate cache if entity.frame changed (for texture animation, e.g. buttons)
	let brushGroup = e._brushGroup;
	if ( brushGroup && e._brushGroupFrame !== e.frame ) {

		// Frame changed - dispose old group and rebuild
		_allBrushEntityGroups.delete( brushGroup );
		brushGroup._quakeOwner = null;
		if ( brushGroup.parent ) brushGroup.parent.remove( brushGroup );
		for ( const child of brushGroup.children ) {

			if ( child.geometry ) child.geometry.dispose();
			// Don't dispose materials - they're cached in _brushMaterialCache (a demon relief owns its own)
			if ( child.userData.ownMaterial ) child.material.dispose();

		}
		brushGroup = null;
		e._brushGroup = null;
		e._brushAnimSurfaces = null;
		e._demonRelief = undefined;

	}

	if ( brushGroup == null ) {

		// First time drawing this entity - build and cache the group.
		// Surfaces sharing the same base texture + lightmap are merged into
		// a single BufferGeometry so a 6-face box becomes 1 draw call.
		brushGroup = new THREE.Group();
		let animSurfaces = null;

		if ( clmodel.surfaces && clmodel.nummodelsurfaces ) {

			// First pass: collect surfaces grouped by (baseTex, lightmap)
			const surfaceGroups = [];
			const startSurf = clmodel.firstmodelsurface;

			for ( let i = 0; i < clmodel.nummodelsurfaces; i ++ ) {

				const psurf = clmodel.surfaces[ startSurf + i ];
				if ( psurf == null ) continue;
				if ( psurf.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) continue;
				if ( psurf.polys == null ) continue;

				// Get plane normal, flip if SURF_PLANEBACK
				let planeNormal = null;
				if ( psurf.plane != null ) {

					const pn = psurf.plane.normal;
					if ( psurf.flags & SURF_PLANEBACK ) {

						planeNormal = new Float32Array( [ - pn[ 0 ], - pn[ 1 ], - pn[ 2 ] ] );

					} else {

						planeNormal = pn;

					}

				}

				const baseTex = psurf.texinfo.texture;
				const lmTex = lightmapTextures[ psurf.lightmaptexturenum ];
				const rockChart = R_RockfieldChart( psurf );

				// Keep disconnected procedural components separate even when texture/lightmap match.
				let group = null;
				for ( let g = 0; g < surfaceGroups.length; g ++ ) {

					if ( surfaceGroups[ g ].baseTex === baseTex && surfaceGroups[ g ].lmTex === lmTex && surfaceGroups[ g ].rockChart === rockChart ) {

						group = surfaceGroups[ g ];
						break;

					}

				}

				if ( group === null ) {

					group = { polys: [], normals: [], baseTex, lmTex, rockChart, surface: psurf };
					surfaceGroups.push( group );

				}

				group.polys.push( psurf.polys );
				group.normals.push( planeNormal );

			}

			// Second pass: create one merged mesh per group
			let childIdx = 0;
			for ( let g = 0; g < surfaceGroups.length; g ++ ) {

				const group = surfaceGroups[ g ];
				const geom = _mergeGLPolys( group.polys, group.normals );
				if ( geom == null ) continue;
				const rockField = R_RockfieldGeometry( geom, group.surface );

				const t = R_TextureAnimation( group.baseTex );
				const diffuse = ( t != null && t.gl_texture != null ) ? t.gl_texture : null;
				const lmTex = group.lmTex;

				// Use cached material to avoid shader recompilation
				const diffuseId = diffuse != null ? diffuse.id : 0;
				const lmId = lmTex != null ? lmTex.id : 0;
				const matKey = `${diffuseId}_${lmId}${rockField ? '_rock' : ''}`;
				let material = _brushMaterialCache.get( matKey );
				if ( material == null ) {

					material = ( diffuse != null && lmTex != null )
						? createQuakeLightmapMaterial( diffuse, lmTex )
						: new THREE.MeshBasicMaterial( { map: diffuse } );
					_brushMaterialCache.set( matKey, material );

				}
				if ( rockField && lmTex ) material.userData.rockField = true;

				const mesh = new THREE.Mesh( geom, material );
				mesh.userData.rockField = rockField;
				brushGroup.add( mesh );

				// Track surfaces with time-based animation for per-frame material updates
				if ( group.baseTex != null && ( group.baseTex.anim_total > 0 || group.baseTex.alternate_anims != null ) ) {

					if ( animSurfaces == null ) animSurfaces = [];
					animSurfaces.push( { childIdx, baseTex: group.baseTex, lmTex } );

				}

				childIdx ++;

			}

		}

		// Cache on entity and track for disposal on map change
		e._brushGroup = brushGroup;
		e._brushGroupFrame = e.frame;
		e._brushAnimSurfaces = animSurfaces;
		brushGroup._quakeOwner = e;
		_allBrushEntityGroups.add( brushGroup );

	}

	// A demon plaque on this entity gets its real relief once its textures are ready (a child of the cached group)
	R_UpdateBrushDemon( e, brushGroup, clmodel );

	// Update materials for surfaces with time-based texture animation
	// Geometry stays cached — only materials are swapped each frame
	if ( e._brushAnimSurfaces != null ) {

		const children = brushGroup.children;
		for ( let a = 0; a < e._brushAnimSurfaces.length; a ++ ) {

			const anim = e._brushAnimSurfaces[ a ];
			const t = R_TextureAnimation( anim.baseTex );
			const diffuse = ( t && t.gl_texture ) ? t.gl_texture : null;
			const child = children[ anim.childIdx ];
			if ( child == null ) continue;

			// Check if texture actually changed
			const currentMap = child.material.map;
			if ( currentMap === diffuse ) continue;

			// Swap to the correct material (reuse from cache)
			const diffuseId = diffuse ? diffuse.id : 0;
			const lmId = anim.lmTex ? anim.lmTex.id : 0;
			const matKey = `${diffuseId}_${lmId}${child.userData.rockField ? '_rock' : ''}`;
			let material = _brushMaterialCache.get( matKey );
			if ( ! material ) {

				material = ( diffuse && anim.lmTex )
					? createQuakeLightmapMaterial( diffuse, anim.lmTex )
					: new THREE.MeshBasicMaterial( { map: diffuse } );
				_brushMaterialCache.set( matKey, material );

			}
			if ( child.userData.rockField && anim.lmTex ) material.userData.rockField = true;

			child.material = material;

		}

	}

	// Update transform (position/rotation may change each frame for doors, etc.)
	brushGroup.position.set( e.origin[ 0 ], e.origin[ 1 ], e.origin[ 2 ] );

	if ( rotated ) {

		// "stupid quake bug" — negate pitch before R_RotateForEntity
		const pitch = - e.angles[ 0 ];
		const yaw = e.angles[ 1 ];
		const roll = e.angles[ 2 ];

		_brushEuler.set(
			roll * ( Math.PI / 180 ),
			- pitch * ( Math.PI / 180 ),
			yaw * ( Math.PI / 180 )
		);
		brushGroup.quaternion.setFromEuler( _brushEuler );

	} else {

		brushGroup.quaternion.identity();

	}

	// Add to scene (will be removed next frame by R_DrawWorld cleanup)
	brushGroup.userData.archHidden = R_ArchModelHidden( clmodel.name, clmodel.surfaces );
	brushGroup.visible = ! ( R_NewerGame() && brushGroup.userData.archHidden );
	if ( scene && ! brushGroup.parent ) scene.add( brushGroup );
	brushEntityGroups.push( brushGroup );
	R_RockfieldBrushSeen( clmodel, brushGroup, r_refdef.vieworg, r_framecount );

	// Upload any modified lightmaps (matches original C: R_BlendLightmaps called
	// at end of R_DrawBrushModel to ensure brush entity lightmap changes are applied)
	R_BlendLightmaps();

}

/**
 * Throws away the previous map's brush entity state (part of `GL_BuildLightmaps`): disposes the cached brush materials,
 * and every brush entity group's geometry (and materials of its own), detaching each from its entity.
 */
function R_BrushClear() {

	// Clear brush entity material cache (dispose old materials first)
	for ( const mat of _brushMaterialCache.values() ) mat.dispose();
	_brushMaterialCache.clear();

	// Dispose all cached brush entity groups (geometry disposal)
	for ( const group of _allBrushEntityGroups ) {

		const owner = group._quakeOwner;
		if ( owner != null && owner._brushGroup === group ) {

			owner._brushGroup = null;
			owner._brushGroupFrame = undefined;
			owner._brushAnimSurfaces = null;

		}
		group._quakeOwner = null;
		if ( group.parent ) group.parent.remove( group );
		for ( const child of group.children ) {

			if ( child.geometry ) child.geometry.dispose();
			if ( child.userData.ownMaterial ) child.material.dispose();

		}
		if ( owner != null ) owner._demonRelief = undefined;

	}

	_allBrushEntityGroups.clear();
	brushEntityGroups.length = 0;

}

/**
 * Takes last frame's brush entity groups out of the scene (`R_DrawWorld`); they stay cached on their entities.
 */
function R_BrushBeginFrame() {

	// Remove brush entity groups from scene (don't dispose - they're cached on entities)
	for ( let i = 0; i < brushEntityGroups.length; i ++ ) {

		const group = brushEntityGroups[ i ];
		if ( group.parent ) group.parent.remove( group );

	}

	brushEntityGroups.length = 0;

}

//============================================================================
// R_RecursiveWorldNode
//============================================================================

// Queue a visible world surface for drawing (by texture chain, or right away)
function _chainSurface( surf, worldmodel ) {
	if ( R_NewerGame() && R_ArchSurfaceHidden( surf ) ) return;

	// if sorting by texture, just store it out
	if ( gl_texsort.value ) {

		if ( ! mirror ||
			surf.texinfo.texture !== worldmodel.textures[ mirrortexturenum ] ) {

			surf.texturechain = surf.texinfo.texture.texturechain;
			surf.texinfo.texture.texturechain = surf;

		}

	} else if ( surf.flags & SURF_DRAWSKY ) {

		surf.texturechain = skychain;
		skychain = surf;

	} else if ( surf.flags & SURF_DRAWTURB ) {

		surf.texturechain = waterchain;
		waterchain = surf;

	} else {

		R_DrawSequentialPoly( surf );

	}

}

// Portal views are rendered from the receiver, which the main view's frustum
// walk never reaches.  Hand over what that walk would have produced there:
// static entities, and the sky / water surfaces (world geometry is drawn from
// the PVS, which already includes the receiver's leaves).
function R_AddPortalReceiverSurfaces( worldmodel ) {

	if ( ! R_PortalsActive() ) return;

	const portals = R_GetPortals();
	for ( let i = 0; i < portals.length; i ++ ) {

		const portal = portals[ i ];
		if ( portal.srcLeaf.visframe !== r_visframecount ) continue;

		for ( let j = 0; j < portal.destLeafs.length; j ++ ) {

			const leaf = portal.destLeafs[ j ];
			if ( leaf.efrags )
				set_cl_numvisedicts( R_StoreEfrags( leaf.efrags, cl_visedicts, cl_numvisedicts, MAX_VISEDICTS, r_framecount ) );

		}

		for ( let j = 0; j < portal.extraSurfaces.length; j ++ ) {

			const surf = portal.extraSurfaces[ j ];
			if ( surf.visframe === r_framecount ) continue; // already queued
			surf.visframe = r_framecount;
			_chainSurface( surf, worldmodel );

		}

	}

}

/**
 * Walks the world BSP tree front to back from `modelorg` (WinQuake gl_rsurf.c). Skips solid nodes, nodes not in the
 * current PVS (`visframe !== r_visframecount`) and nodes outside the view frustum. At a leaf it marks the leaf's
 * surfaces as visible this frame and stores the leaf's static entity fragments in `cl_visedicts`; at a node it
 * queues the node's world surfaces that face the viewer (underwater ones are not backface-culled, because they warp)
 * by texture chain or, with `gl_texsort` 0, draws them right away. Hidden arch surfaces are skipped in Newer Game.
 * Called by `R_DrawWorld` with the root node each frame.
 *
 * @param {?mnode_t} node the node or leaf (mleaf_t) to walk; null is ignored
 */
export function R_RecursiveWorldNode( node ) {

	if ( ! node ) return;

	if ( node.contents === - 2 ) // CONTENTS_SOLID
		return;

	if ( node.visframe !== r_visframecount )
		return;

	// Use pre-allocated scratch array for maxs to avoid per-call allocation
	_cullBoxMaxs[ 0 ] = node.minmaxs[ 3 ];
	_cullBoxMaxs[ 1 ] = node.minmaxs[ 4 ];
	_cullBoxMaxs[ 2 ] = node.minmaxs[ 5 ];
	if ( R_CullBox( node.minmaxs, _cullBoxMaxs ) )
		return;

	// if a leaf node, draw stuff
	if ( node.contents < 0 ) {

		const pleaf = node; // mleaf_t is a subtype of mnode_t

		if ( pleaf.firstmarksurface && pleaf.nummarksurfaces ) {

			for ( let c = 0; c < pleaf.nummarksurfaces; c ++ ) {

				pleaf.firstmarksurface[ c ].visframe = r_framecount;

			}

		}

		// deal with model fragments in this leaf
		if ( pleaf.efrags ) {

			set_cl_numvisedicts( R_StoreEfrags( pleaf.efrags, cl_visedicts, cl_numvisedicts, MAX_VISEDICTS, r_framecount ) );

		}

		return;

	}

	// node is just a decision point, so go down the appropriate sides

	// find which side of the node we are on
	const plane = node.plane;
	let dot;

	switch ( plane.type ) {

		case PLANE_X:
			dot = modelorg[ 0 ] - plane.dist;
			break;
		case PLANE_Y:
			dot = modelorg[ 1 ] - plane.dist;
			break;
		case PLANE_Z:
			dot = modelorg[ 2 ] - plane.dist;
			break;
		default:
			dot = DotProduct( modelorg, plane.normal ) - plane.dist;
			break;

	}

	const side = dot >= 0 ? 0 : 1;

	// recurse down the children, front side first
	R_RecursiveWorldNode( node.children[ side ] );

	// draw stuff
	const c = node.numsurfaces;

	if ( c ) {

		const cl_ref = cl;
		const worldmodel = cl_ref ? cl_ref.worldmodel : null;

		if ( worldmodel && worldmodel.surfaces ) {

			// Only render surfaces within the world model's surface range.
			// Submodel surfaces (triggers, doors, etc.) share the global
			// surfaces array but must not be drawn during world traversal.
			const worldSurfEnd = worldmodel.firstmodelsurface + worldmodel.nummodelsurfaces;

			for ( let ci = 0; ci < c; ci ++ ) {

				const surfIdx = node.firstsurface + ci;
				if ( surfIdx < worldmodel.firstmodelsurface || surfIdx >= worldSurfEnd )
					continue;

				const surf = worldmodel.surfaces[ surfIdx ];
				if ( ! surf ) continue;

				if ( surf.visframe !== r_framecount )
					continue;

				// don't backface underwater surfaces, because they warp
				if ( ! ( surf.flags & SURF_UNDERWATER ) &&
					( ( dot < 0 ) ^ ! ! ( surf.flags & SURF_PLANEBACK ) ) )
					continue; // wrong side

				_chainSurface( surf, worldmodel );

			}

		}

	}

	// recurse down the back side
	R_RecursiveWorldNode( node.children[ side ? 0 : 1 ] );

}

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

//============================================================================
// DrawTextureChains
//============================================================================

/**
 * Draws the world's texture chains built by the BSP walk (WinQuake gl_rsurf.c): the sky texture's chain as sky, the
 * mirror texture's chain marks the mirror when `r_mirroralpha` is below 1, translucent water is left for
 * `R_DrawWaterSurfaces` while `r_wateralpha` is below 1, and every other surface goes through `R_RenderBrushPoly`.
 * Empties each chain it draws (the mirror chain and deferred water chains stay). With `gl_texsort` 0 only the sky
 * chain is drawn. Called by `R_DrawWorld` each frame.
 */
export function DrawTextureChains() {

	const cl_ref = cl;
	if ( ! cl_ref || ! cl_ref.worldmodel ) return;

	if ( ! gl_texsort.value ) {

		if ( skychain ) {

			R_DrawSkyChain( skychain );
			skychain = null;

		}

		return;

	}

	const worldmodel = cl_ref.worldmodel;
	for ( let i = 0; i < worldmodel.numtextures; i ++ ) {

		const t = worldmodel.textures[ i ];
		if ( ! t ) continue;

		let s = t.texturechain;
		if ( ! s ) continue;

		if ( i === skytexturenum ) {

			R_DrawSkyChain( s );

		} else if ( i === mirrortexturenum && r_mirroralpha.value !== 1.0 ) {

			R_MirrorChain( s );
			continue;

		} else {

			if ( ( s.flags & SURF_DRAWTURB ) && r_wateralpha.value !== 1.0 )
				continue; // draw translucent water later

			for ( ; s; s = s.texturechain )
				R_RenderBrushPoly( s );

		}

		t.texturechain = null;

	}

}

//============================================================================
// R_DrawWaterSurfaces
//============================================================================

/**
 * Draws the translucent water left out of the texture chains (WinQuake gl_rsurf.c): each turbulent surface on the
 * water chain (`gl_texsort` 0) or on a turbulent texture's chain gets its liquid mesh in the world group at
 * `r_wateralpha` for this frame, and the chains are emptied. Does nothing when `r_wateralpha` is 1 and `gl_texsort`
 * is on (the water was drawn with the world). Called per frame by `R_RenderView` (gl_rmain.js) after the scene.
 */
export function R_DrawWaterSurfaces() {

	const cl_ref = cl;

	if ( r_wateralpha.value === 1.0 && gl_texsort.value )
		return;

	if ( ! gl_texsort.value ) {

		if ( ! waterchain )
			return;

		for ( let s = waterchain; s; s = s.texturechain ) {

			if ( s.polys && worldState.group ) {

				const realtime = cl ? cl.time : 0;
				const geometry = EmitWaterPolysQuake( s, realtime );
				if ( geometry ) {

					const material = _getWaterMaterial( s.texinfo.texture, r_wateralpha.value );
					_getWaterMesh( s, geometry, material, worldState.group );

				}

			}

		}

		waterchain = null;

	} else {

		if ( ! cl_ref || ! cl_ref.worldmodel ) return;

		for ( let i = 0; i < cl_ref.worldmodel.numtextures; i ++ ) {

			const t = cl_ref.worldmodel.textures[ i ];
			if ( ! t ) continue;

			let s = t.texturechain;
			if ( ! s ) continue;

			if ( ! ( s.flags & SURF_DRAWTURB ) )
				continue;

			for ( ; s; s = s.texturechain ) {

				if ( s.polys && worldState.group ) {

					const realtime = cl ? cl.time : 0;
					const geometry = EmitWaterPolysQuake( s, realtime );
					if ( geometry ) {

						const material = _getWaterMaterial( t, r_wateralpha.value );
						_getWaterMesh( s, geometry, material, worldState.group );

					}

				}

			}

			t.texturechain = null;

		}

	}

}

//============================================================================
// R_MarkLeaves
//============================================================================

// Cached buffer for r_novis solid visibility (matches C's static byte solid[4096])
let _markleaves_solid = new Uint8Array( 4096 );
let _lastMarkedPostActive = false;

/**
 * Marks the leaves and nodes in the view's PVS with a new `r_visframecount` (WinQuake gl_rsurf.c), so the BSP walk
 * and batch visibility only see them. Skips the work (and leaves the batches' visibility alone) when the view leaf,
 * `r_novis` and the lighting mode have not changed, or while drawing a mirror. Marks everything when `r_novis` is on
 * or the view is outside the map. In the HDR water pipeline what is under (or above) visible water is marked too,
 * and with portals active, what each visible portal's receiver can see. Called once per frame by `R_RenderScene`
 * (gl_rmain.js), done there so we know if we're in water. Does nothing without a world model.
 */
export function R_MarkLeaves() {

	const cl_ref = cl;
	if ( ! cl_ref || ! cl_ref.worldmodel ) return;

	// switching lighting mode changes what has to be visible (pool bottoms)
	const postActive = R_PostActive() ? ( R_WaterActive() ? 2 : 1 ) : 0;
	const modeChanged = postActive !== _lastMarkedPostActive;
	_lastMarkedPostActive = postActive;

	if ( r_oldviewleaf === r_viewleaf && ! r_novis.value && ! modeChanged ) {

		_visibilityNeedsUpdate = false;
		return;

	}

	if ( mirror ) {

		// Mirror rendering - keep visibility from main view, don't update
		_visibilityNeedsUpdate = false;
		return;

	}

	_visibilityNeedsUpdate = true;
	inc_r_visframecount();
	set_r_oldviewleaf( r_viewleaf );

	let vis;
	if ( r_novis.value || r_viewleaf == null ) {

		// mark everything visible (also when r_viewleaf is null - player outside map)
		const numBytes = ( cl_ref.worldmodel.numleafs + 7 ) >> 3;
		if ( _markleaves_solid.length < numBytes ) {

			_markleaves_solid = new Uint8Array( numBytes );

		}

		_markleaves_solid.fill( 0xff, 0, numBytes );
		vis = _markleaves_solid;

	} else {

		vis = Mod_LeafPVS( r_viewleaf, cl_ref.worldmodel );

	}

	if ( ! vis ) return;

	_stampVisibleLeaves( cl_ref.worldmodel, vis );

	// Water is opaque to the visibility compiler; in the HDR pipeline the bottom
	// of a pool shows through, so what is under visible water is drawable too.
	if ( ! r_novis.value && R_WaterActive() ) {

		const links = R_GetLiquidLinks();
		for ( let i = 0; i < links.length; i ++ ) {

			const link = links[ i ];
			if ( link.above.visframe === r_visframecount )
				_stampVisibleLeaves( cl_ref.worldmodel, link.belowVis ); // seeing down into it
			if ( link.below.visframe === r_visframecount )
				_stampVisibleLeaves( cl_ref.worldmodel, link.aboveVis ); // seeing out of it

		}

	}

	// A portal shows the receiver's view, so what the receiver can see has to
	// be drawable too.
	if ( ! r_novis.value && R_PortalsActive() ) {

		const portals = R_GetPortals();
		for ( let i = 0; i < portals.length; i ++ ) {

			if ( portals[ i ].srcLeaf.visframe === r_visframecount )
				_stampVisibleLeaves( cl_ref.worldmodel, portals[ i ].destVis );

		}

	}

}

function _stampVisibleLeaves( worldmodel, vis ) {

	for ( let i = 0; i < worldmodel.numleafs; i ++ ) {

		if ( vis[ i >> 3 ] & ( 1 << ( i & 7 ) ) ) {

			let node = worldmodel.leafs[ i + 1 ];
			if ( ! node ) continue;

			while ( node ) {

				if ( node.visframe === r_visframecount )
					break;
				node.visframe = r_visframecount;
				node = node.parent;

			}

		}

	}

}

//============================================================================
// R_MirrorChain
//============================================================================

function R_MirrorChain( s ) {

	if ( mirror )
		return;

	set_mirror( true );
	set_mirror_plane( s.plane );

}

//============================================================================
// concatFloat32Arrays
//
// Concatenate an array of Float32Array into a single Float32Array.
//============================================================================

function concatFloat32Arrays( arrays ) {

	let totalLen = 0;
	for ( const a of arrays ) totalLen += a.length;
	const result = new Float32Array( totalLen );
	let offset = 0;
	for ( const a of arrays ) {

		result.set( a, offset );
		offset += a.length;

	}

	return result;

}


/**
 * Throws away the previous map's world batches (part of `GL_BuildLightmaps`): disposes every batched mesh and its
 * material, empties the animated and demon-relief lists, disposes whatever else the world's group holds (liquid and
 * sky meshes), and marks the meshes unbuilt and the visibility stale.
 */
function R_WorldBatchesClear() {

	// Dispose old BatchedMesh objects
	for ( const batchedMesh of worldBatchedMeshes ) {

		if ( batchedMesh.parent ) batchedMesh.parent.remove( batchedMesh );
		batchedMesh.dispose();
		if ( batchedMesh.material ) batchedMesh.material.dispose();

	}

	worldBatchedMeshes.length = 0;
	worldAnimatedMeshes.length = 0;
	demonSurfaces.length = 0; demonEnabled = false;

	// Dispose any other children in the world's group (water/sky meshes added dynamically)
	if ( worldState.group ) {

		while ( worldState.group.children.length > 0 ) {

			const child = worldState.group.children[ 0 ];
			worldState.group.remove( child );
			if ( child.geometry ) child.geometry.dispose();
			if ( child.material ) child.material.dispose();

		}

	}

	worldMeshesBuilt = false;

	// Clear PVS instance visibility info
	instanceVisInfo.length = 0;

	// Force visibility update on first frame after map load
	_visibilityNeedsUpdate = true;

}

//============================================================================
// R_BuildWorldMeshes
//
// Builds world geometry using BatchedMesh for efficient PVS culling.
// One BatchedMesh per (texture, lightmap) combo, with each leaf's geometry
// added as a separate instance. Visibility is toggled via setVisibleAt().
//============================================================================

function R_BuildWorldMeshes() {

	const cl_ref = cl;
	if ( ! cl_ref || ! cl_ref.worldmodel ) return;

	R_EnsureWorldGroup();

	const worldmodel = cl_ref.worldmodel;
	R_RockfieldBuild( worldmodel );

	// Clear previous batch data
	instanceVisInfo.length = 0;
	worldBatchedMeshes.length = 0;
	worldAnimatedMeshes.length = 0;
	demonSurfaces.length = 0; demonEnabled = false;

	// Build a mapping from surface to ALL leaves that contain it.
	// A surface is visible if ANY of its containing leaves is visible (PVS).
	const surfaceToLeaves = new Map();

	for ( let leafIdx = 1; leafIdx <= worldmodel.numleafs; leafIdx ++ ) {

		const leaf = worldmodel.leafs[ leafIdx ];
		if ( ! leaf ) continue;
		if ( leaf.contents === - 2 ) continue; // CONTENTS_SOLID

		if ( leaf.firstmarksurface && leaf.nummarksurfaces > 0 ) {

			for ( let j = 0; j < leaf.nummarksurfaces; j ++ ) {

				const surf = leaf.firstmarksurface[ j ];
				if ( ! surf ) continue;

				if ( ! surfaceToLeaves.has( surf ) ) {

					surfaceToLeaves.set( surf, [] );

				}

				surfaceToLeaves.get( surf ).push( leaf );

			}

		}

	}

	// First pass: collect geometry data per (texture, lightmap)
	// Each surface stores its geometry and ALL leaves that contain it
	// Structure: batchGroups: Map<texKey, { texture, lmNum, totalVerts, totalGeoms, surfaceData: Array<{geom, leaves}> }>
	const batchGroups = new Map();

	const surfStart = worldmodel.firstmodelsurface || 0;
	const surfEnd = surfStart + ( worldmodel.nummodelsurfaces || worldmodel.numsurfaces );

	for ( let k = surfStart; k < surfEnd; k ++ ) {

		const surf = worldmodel.surfaces[ k ];
		if ( ! surf ) continue;
		if ( surf.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) continue;
		if ( ! surf.polys ) continue;
		if ( ! surf.texinfo || ! surf.texinfo.texture ) continue;

		const t = surf.texinfo.texture;
		if ( ! t.gl_texture ) continue;

		// Get all leaves that contain this surface
		const leaves = surfaceToLeaves.get( surf );
		if ( ! leaves || leaves.length === 0 ) continue;
		if ( DEMON_TEXTURES.has( t.name ) ) demonSurfaces.push( { surface: surf, leaves, field: null, mesh: null } );

		// Get plane normal, flip if SURF_PLANEBACK (surface faces opposite of plane)
		let planeNormal = null;
		if ( surf.plane ) {

			const pn = surf.plane.normal;
			if ( surf.flags & SURF_PLANEBACK ) {

				planeNormal = new Float32Array( [ - pn[ 0 ], - pn[ 1 ], - pn[ 2 ] ] );

			} else {

				planeNormal = pn;

			}

		}

		const geom = DrawGLPoly( surf.polys, planeNormal );
		if ( ! geom ) continue;

		const rockField = R_RockfieldGeometry( geom, surf );
		const lmNum = surf.lightmaptexturenum;
		const texKey = ( t._buildId || ( t._buildId = Math.random() ) ) + '_' + lmNum + ( rockField ? '_rock' : '' );

		if ( ! batchGroups.has( texKey ) ) {

			batchGroups.set( texKey, {
				texture: t,
				lmNum: lmNum,
				rockField,
				totalVerts: 0,
				totalGeoms: 0,
				surfaceData: []
			} );

		}

		const group = batchGroups.get( texKey );
		const vertCount = geom.getAttribute( 'position' ).count;

		group.totalVerts += vertCount;
		group.totalGeoms ++;
		group.surfaceData.push( { geom: geom, leaves: leaves, surface: surf } );

	}

	// Identity matrix for all geometries (already in world space)
	const identityMatrix = new THREE.Matrix4();

	// Second pass: create BatchedMesh for each (texture, lightmap) group
	for ( const [ texKey, group ] of batchGroups ) {

		const t = group.texture;
		const animTex = R_TextureAnimation( t, 0 );
		const diffuse = animTex != null && animTex.gl_texture != null ? animTex.gl_texture : t.gl_texture;
		const lmTex = lightmapTextures[ group.lmNum ];
		const material = lmTex
			? createQuakeLightmapMaterial( diffuse, lmTex )
			: new THREE.MeshBasicMaterial( { map: diffuse } );

		if ( group.rockField && lmTex ) material.userData.rockField = true;

		// Create BatchedMesh with capacity for all geometries in this group
		const batchedMesh = new THREE.BatchedMesh(
			group.totalGeoms,
			group.totalVerts,
			0, // no indices (non-indexed geometry)
			material
		);

		// Name for debugging (texture name + lightmap number)
		const texName = t.name || '';
		batchedMesh.name = `world_${texName}_lm${group.lmNum}`;

		// Add each surface's geometry to the batch
		for ( const surfData of group.surfaceData ) {

			// Add geometry, then create an instance of it
			const geoId = batchedMesh.addGeometry( surfData.geom );
			const instanceId = batchedMesh.addInstance( geoId );
			batchedMesh.setMatrixAt( instanceId, identityMatrix );

			// Store instance with ALL its leaves for visibility updates
			// Surface is visible if ANY of its leaves is visible
			instanceVisInfo.push( {
				batch: batchedMesh,
				instanceId: instanceId,
				surface: surfData.surface,
				leaves: surfData.leaves
			} );

			// Dispose the temporary geometry (data copied to batch)
			surfData.geom.dispose();

		}

		worldState.group.add( batchedMesh );
		worldBatchedMeshes.push( batchedMesh );
		if ( t.anim_total > 0 )
			worldAnimatedMeshes.push( { mesh: batchedMesh, baseTexture: t } );

	}

	worldMeshesBuilt = true;

}

function R_UpdateWorldTextureAnimations() {

	for ( let i = 0; i < worldAnimatedMeshes.length; i ++ ) {

		const animated = worldAnimatedMeshes[ i ];
		R_UpdateAnimatedMaterial( animated.mesh.material, animated.baseTexture, 0 );

	}

}

//============================================================================
// R_UpdateWorldVisibility
//
// Called each frame after R_MarkLeaves. Uses BatchedMesh.setVisibleAt() to
// toggle visibility. A surface is visible if ANY of its containing leaves
// is in the PVS (has visframe === r_visframecount).
//============================================================================

/**
 * For a reflection probe (r_waterprobe.js): the whole level drawable (all = true), or the view's own visibility put
 * back. Showing all still keeps hidden arch surfaces hidden in Newer Game. Passed by `R_RenderView` (gl_rmain.js)
 * to the water probe capture, which calls it before and after rendering the probe.
 *
 * @param {boolean} all true to show every world batch instance; false to restore the PVS visibility
 */
export function R_WorldShowAll( all ) {

	if ( all ) {

		for ( const info of instanceVisInfo ) info.batch.setVisibleAt( info.instanceId, ! ( R_NewerGame() && R_ArchSurfaceHidden( info.surface ) ) );
		return;

	}

	_visibilityNeedsUpdate = true;
	R_UpdateWorldVisibility();

}

let archVisibilityKey = -1;
// The shadow-casting geometry leaves out the hidden arch surfaces, so it is rebuilt whenever they change (the way back shutting
// draws its wall again: that wall must shadow too). occluderRevision is the arch revision it was built for.
let occluderRevision = -1;
function R_BuildWorldOccluder( model ) { occluderRevision = R_ArchHiddenRevision(); return R_BuildSunOccluder( model ); }
const noArchRestore = () => {};
/**
 * Shows the world surfaces that Newer Game's arch hides, for the Classic comparison pass (`R_ClassicOn`,
 * gl_rmain.js). Classic draws the same scene without rebuilding its world. Batched instance visibility is not
 * Object3D.visible, so it needs its own exception-safe scope: each hidden instance is made visible when one of its
 * leaves is in the PVS, and the returned function puts the saved visibility back.
 *
 * @returns {function(): void} restores the visibility it changed (a no-op when nothing is hidden)
 * @throws {*} rethrows an error raised while changing visibility, after restoring what it had changed
 */
export function R_ClassicArchVisibility() {
	if(!R_HasArchHidden())return noArchRestore;
	const saved=[];
	const restore=()=>{for(const [info,visible] of saved)info.batch.setVisibleAt(info.instanceId,visible);};
	try {
		for(const info of instanceVisInfo){
			if(!R_ArchSurfaceHidden(info.surface))continue;
			saved.push([info,info.batch.getVisibleAt(info.instanceId)]);
			info.batch.setVisibleAt(info.instanceId,info.leaves.some(leaf=>leaf.visframe===r_visframecount));
		}
	} catch(error) {restore();throw error;}
	return restore;
}
function R_UpdateWorldVisibility() {
	if ( cl.worldmodel && R_ArchHiddenRevision() !== occluderRevision ) R_BuildWorldOccluder( cl.worldmodel );
	const key = R_ArchHiddenRevision() * 2 + Number( R_NewerGame() );
	if ( key !== archVisibilityKey ) { archVisibilityKey = key; _visibilityNeedsUpdate = true; }

	// Skip update if viewleaf hasn't changed (PVS is the same)
	if ( ! _visibilityNeedsUpdate ) return;

	for ( let i = 0; i < instanceVisInfo.length; i ++ ) {

		const info = instanceVisInfo[ i ];
		const leaves = info.leaves;

		// Surface is visible if ANY of its leaves is visible
		let visible = false;
		for ( let j = 0; j < leaves.length; j ++ ) {

			if ( leaves[ j ].visframe === r_visframecount ) {

				visible = true;
				break;

			}

		}

		info.batch.setVisibleAt( info.instanceId, visible && ! ( R_NewerGame() && R_ArchSurfaceHidden( info.surface ) ) );

	}

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
