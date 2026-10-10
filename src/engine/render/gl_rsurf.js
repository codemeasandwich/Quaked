/**
 * @module engine/render/gl_rsurf
 *
 * World surfaces (WinQuake gl_rsurf.c): the BSP walk, lightmaps, brush models, and Newer Game's materials and relief
 * on them.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `MAX_LIGHTMAPS`, `skytexturenum`, `gl_lightmap_format`, `gl_solid_format`,
 * `gl_alpha_format`, `gl_mtexable`; module-level variables `lightmap_bytes`, `lightmap_textures`,
 * `_visibilityNeedsUpdate`, `active_lightmaps`, `lightmaps`, `skychain`, `waterchain`, `mtexenabled`,
 * `r_pcurrentvertbase`, `currentmodel`, `nColinElim`, `worldGroup` and 16 more; 7 module-level collections (Map/Set).
 *
 * Errors: calls `Sys_Error` (fatal) at 3 places; throws at 1 place; catches at 1 place.
 */
// Ported from: WinQuake/gl_rsurf.c -- surface-related refresh code

import * as THREE from 'three';
import { R_RockfieldBuild, R_RockfieldChart, R_RockfieldGeometry, R_RockfieldUpdate, R_RockfieldBrushSeen } from '../common/hooks.js'; // installed by newer/render/r_rockfield.js
import { Sys_Error } from '../common/sys.js';
import { R_NewerGame, R_NewerLightingActive, r_newer_normals, r_newer_textures } from '../common/hooks.js'; // installed by newer/mode.js
import { R_ArchSurfaceHidden, R_ArchModelHidden, R_ArchHiddenRevision, R_HasArchHidden } from '../common/hooks.js'; // installed by newer/render/r_archframe.js
import { DEMON_TEXTURES, R_DemonSurfaceData } from '../common/hooks.js'; // installed by newer/render/r_demonrelief.js
import { R_DemonBakePrepare, R_DemonBakeSurface, R_DemonBakeStatus } from '../common/hooks.js'; // installed by newer/assets/r_demonbakes.js

/**
 * Builds the lit material for a world or brush-model surface: a THREE.MeshLambertMaterial (so surfaces respond to
 * Three.js PointLights for dynamic lighting effects such as explosions and muzzle flashes) with the diffuse texture
 * and the lightmap atlas on uv1 at `lightMapIntensity` 2. A fullbright texture, when the diffuse texture has one, is
 * applied as a white `emissiveMap`, which bypasses all lighting (see the comment in the body). The material is also
 * registered for the HDR glow (`R_RegisterGlow`) and Newer Game's normal maps and parallax (`R_RegisterDetail`).
 * Called at map load for the world batches, when a brush entity's group is built, for demon relief meshes, by the
 * renderer's shader warm-up (gl_rmain.js) and by the level views (r_levelview.js).
 *
 * @param {THREE.Texture} diffuseMap the surface's diffuse texture (`texture_t.gl_texture`); its `_fullbright`
 * texture, when set, holds only the fullbright texels (palette indices 224-255)
 * @param {THREE.Texture} lightmapTex a lightmap atlas from `lightmapTextures`; mutated: its `channel` is set to 1
 * (uv1)
 * @returns {THREE.MeshLambertMaterial} a new material; the caller owns it (the world and brush caches dispose theirs
 * at the next `GL_BuildLightmaps`)
 */
export function createQuakeLightmapMaterial( diffuseMap, lightmapTex ) {

	lightmapTex.channel = 1; // Use uv1 for lightmap coordinates

	// Use MeshLambertMaterial so surfaces respond to Three.js PointLights
	// for dynamic lighting effects (explosions, muzzle flashes, etc.)
	const matOptions = {
		map: diffuseMap,
		lightMap: lightmapTex,
		lightMapIntensity: 2
	};

	// Fullbright pixel support: palette indices 224-255 should render at full
	// intensity regardless of lighting (glowing buttons, lava, etc.).
	// The base diffuse texture has these pixels set to BLACK so the lightmap
	// darkens them to nothing. The fullbright texture contains only those pixels
	// and is applied as an emissiveMap which bypasses all lighting.
	if ( diffuseMap._fullbright != null ) {

		matOptions.emissiveMap = diffuseMap._fullbright;
		matOptions.emissive = new THREE.Color( 1, 1, 1 );

	}

	const material = new THREE.MeshLambertMaterial( matOptions );

	// fullbright texels exceed white when the HDR pipeline is on
	R_RegisterGlow( material );

	// independently switched normal maps + parallax in Newer Game
	R_RegisterDetail( material, diffuseMap );

	return material;

}
import { cl, cl_dlights, MAX_DLIGHTS, MAX_VISEDICTS, cl_visedicts, cl_numvisedicts, set_cl_numvisedicts } from '../client/client.js';
import { R_StoreEfrags } from './gl_refrag.js';
import { R_BuildWorldLights, R_BuildSunOccluder, R_RegisterGlow, R_RegisterDetail, R_RefreshDetail, R_GlowBoostForTexture, R_PostActive, R_WaterActive, R_PostNoteSky, R_LiquidOpacity, R_IsWaterTextureName, R_GetLiquidLinks, r_newdark } from '../common/hooks.js'; // installed by newer/render/gl_post.js
import { R_BuildPortals, R_GetPortals, R_PortalsActive, R_PortalNoteVisible, R_PortalMaterial, R_BoxInPortalReceiver } from '../common/hooks.js'; // installed by newer/render/gl_portal.js
import { R_MarkLights, R_LightPointValue } from './gl_rlight.js';
import {
	r_refdef, r_origin, vpn, vright, vup
} from './render.js';
import {
	BACKFACE_EPSILON, VERTEXSIZE, PLANE_X, PLANE_Y, PLANE_Z,
	SURF_PLANEBACK, SURF_DRAWSKY, SURF_DRAWTURB, SURF_UNDERWATER,
	SURF_DRAWTILED, MAXLIGHTMAPS,
	modelorg, r_entorigin, currententity, r_worldentity,
	r_visframecount, r_framecount, frustum,
	c_brush_polys, c_alias_polys,
	currenttexture, mirror, mirrortexturenum, mirror_plane,
	d_lightstylevalue, r_world_matrix,
	r_norefresh, r_drawentities, r_drawworld, r_fullbright,
	r_lightmap, r_dynamic, r_wateralpha, r_mirroralpha, r_novis,
	gl_texsort, gl_flashblend, gl_keeptjunctions,
	R_CullBox, scene, gldepthmin, gldepthmax,
	r_viewleaf, r_oldviewleaf,
	inc_r_visframecount, set_r_framecount, set_currententity,
	inc_c_brush_polys, set_currenttexture,
	set_r_oldviewleaf, set_mirror, set_mirror_plane
} from './gl_rmain.js';
import {
	DotProduct, VectorCopy, VectorSubtract, VectorAdd, VectorNormalize,
	AngleVectors, Length
} from '../common/mathlib.js';
import { Mod_LeafPVS, Mod_PointInLeaf, solidskytexture, alphaskytexture } from './gl_model.js';
import { realtime } from '../common/host_state.js';

//============================================================================
// Constants
//============================================================================

export const BLOCK_WIDTH = 128;
export const BLOCK_HEIGHT = 128;
export let MAX_LIGHTMAPS = 64;
const BASE_LIGHTMAPS=64,LIGHTMAP_LIMIT=512;

const GL_LUMINANCE = 0x1909;
const GL_ALPHA = 0x1906;
const GL_INTENSITY = 0x8049;
const GL_RGBA = 0x1908;
const GL_RGBA4 = 0;

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

let lightmap_bytes = 1; // 1, 2, or 4
let lightmap_textures = 0;

const blocklights = new Uint32Array( 18 * 18 );
// the green and blue of the light of a surface when the map has coloured lightmaps (a LIT file), and the dynamic light alone
const blocklightsG = new Uint32Array( 18 * 18 );
const blocklightsB = new Uint32Array( 18 * 18 );
const blocklightsDyn = new Uint32Array( 18 * 18 );

// Cached buffers for R_AddDynamicLights (Golden Rule #4)
const _dlight_impact = new Float32Array( 3 );
const _dlight_local = new Float32Array( 2 );

// Cached buffers for BuildSurfaceDisplayList colinear elimination (Golden Rule #4)
const _colinear_v1 = new Float32Array( 3 );
const _colinear_v2 = new Float32Array( 3 );

// Flag to track if PVS changed and visibility needs update
let _visibilityNeedsUpdate = true;

let active_lightmaps = 0;

// glRect_t equivalent
class glRect_t {

	constructor() {

		this.l = 0;
		this.t = 0;
		this.w = 0;
		this.h = 0;

	}

}

const lightmap_polys = new Array( MAX_LIGHTMAPS ).fill( null );
const lightmap_modified = new Array( MAX_LIGHTMAPS ).fill( false );
const lightmap_rectchange = [];
for ( let i = 0; i < MAX_LIGHTMAPS; i ++ ) {

	lightmap_rectchange.push( new glRect_t() );

}

// allocated[texnum][column] = height used so far
const allocated = [];
for ( let i = 0; i < MAX_LIGHTMAPS; i ++ ) {

	allocated.push( new Int32Array( BLOCK_WIDTH ) );

}

// the lightmap texture data needs to be kept in main memory
// so texsubimage can update properly
let lightmaps = new Uint8Array( 4 * MAX_LIGHTMAPS * BLOCK_WIDTH * BLOCK_HEIGHT );

// For gl_texsort 0
let skychain = null; // msurface_t
let waterchain = null; // msurface_t

// Turbulent surface sin table for water/sky warping
const TURBSCALE = ( 256.0 / ( 2 * Math.PI ) );
const turbsin = new Float32Array( [
	0, 0.19633, 0.392541, 0.588517, 0.784137, 0.979285, 1.17384, 1.3677,
	1.56072, 1.75281, 1.94384, 2.1337, 2.32228, 2.50945, 2.69512, 2.87916,
	3.06147, 3.24193, 3.42044, 3.59689, 3.77117, 3.94319, 4.11282, 4.27998,
	4.44456, 4.60647, 4.76559, 4.92185, 5.07515, 5.22538, 5.37247, 5.51632,
	5.65685, 5.79398, 5.92761, 6.05767, 6.18408, 6.30677, 6.42566, 6.54068,
	6.65176, 6.75883, 6.86183, 6.9607, 7.05537, 7.14579, 7.23191, 7.31368,
	7.39104, 7.46394, 7.53235, 7.59623, 7.65552, 7.71021, 7.76025, 7.80562,
	7.84628, 7.88222, 7.91341, 7.93984, 7.96148, 7.97832, 7.99036, 7.99759,
	8, 7.99759, 7.99036, 7.97832, 7.96148, 7.93984, 7.91341, 7.88222,
	7.84628, 7.80562, 7.76025, 7.71021, 7.65552, 7.59623, 7.53235, 7.46394,
	7.39104, 7.31368, 7.23191, 7.14579, 7.05537, 6.9607, 6.86183, 6.75883,
	6.65176, 6.54068, 6.42566, 6.30677, 6.18408, 6.05767, 5.92761, 5.79398,
	5.65685, 5.51632, 5.37247, 5.22538, 5.07515, 4.92185, 4.76559, 4.60647,
	4.44456, 4.27998, 4.11282, 3.94319, 3.77117, 3.59689, 3.42044, 3.24193,
	3.06147, 2.87916, 2.69512, 2.50945, 2.32228, 2.1337, 1.94384, 1.75281,
	1.56072, 1.3677, 1.17384, 0.979285, 0.784137, 0.588517, 0.392541, 0.19633,
	0, -0.19633, -0.392541, -0.588517, -0.784137, -0.979285, -1.17384, -1.3677,
	-1.56072, -1.75281, -1.94384, -2.1337, -2.32228, -2.50945, -2.69512, -2.87916,
	-3.06147, -3.24193, -3.42044, -3.59689, -3.77117, -3.94319, -4.11282, -4.27998,
	-4.44456, -4.60647, -4.76559, -4.92185, -5.07515, -5.22538, -5.37247, -5.51632,
	-5.65685, -5.79398, -5.92761, -6.05767, -6.18408, -6.30677, -6.42566, -6.54068,
	-6.65176, -6.75883, -6.86183, -6.9607, -7.05537, -7.14579, -7.23191, -7.31368,
	-7.39104, -7.46394, -7.53235, -7.59623, -7.65552, -7.71021, -7.76025, -7.80562,
	-7.84628, -7.88222, -7.91341, -7.93984, -7.96148, -7.97832, -7.99036, -7.99759,
	-8, -7.99759, -7.99036, -7.97832, -7.96148, -7.93984, -7.91341, -7.88222,
	-7.84628, -7.80562, -7.76025, -7.71021, -7.65552, -7.59623, -7.53235, -7.46394,
	-7.39104, -7.31368, -7.23191, -7.14579, -7.05537, -6.9607, -6.86183, -6.75883,
	-6.65176, -6.54068, -6.42566, -6.30677, -6.18408, -6.05767, -5.92761, -5.79398,
	-5.65685, -5.51632, -5.37247, -5.22538, -5.07515, -4.92185, -4.76559, -4.60647,
	-4.44456, -4.27998, -4.11282, -3.94319, -3.77117, -3.59689, -3.42044, -3.24193,
	-3.06147, -2.87916, -2.69512, -2.50945, -2.32228, -2.1337, -1.94384, -1.75281,
	-1.56072, -1.3677, -1.17384, -0.979285, -0.784137, -0.588517, -0.392541, -0.19633,
] );

export let gl_lightmap_format = GL_LUMINANCE;
export let gl_solid_format = 3;
export let gl_alpha_format = 4;

// multitexture state (not used in Three.js path, kept for algorithm fidelity)
let mtexenabled = false;
export let gl_mtexable = false;

// external references
let r_pcurrentvertbase = null;
let currentmodel = null;
let nColinElim = 0;

// Three.js geometry cache for BSP surfaces
let worldGroup = null; // THREE.Group for world BSP
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
				instanceVisInfo.push( record.visibility ); worldGroup.add( mesh );
				_visibilityNeedsUpdate = true; changed = true;

			}

		}
		if ( record.mesh ) record.mesh.visible = enabled && record.pvsVisible;

	}
	if ( changed && cl.worldmodel ) R_BuildWorldOccluder( cl.worldmodel );

}

// Pre-allocated scratch arrays to avoid per-frame allocations
const _cullBoxMaxs = new Float32Array( 3 ); // for R_CullBox in R_RecursiveWorldNode

// Water/sky mesh tracking: Set-based approach to add/remove from scene
// without creating/disposing meshes every frame
let _waterMeshesInScene = new Set();
let _waterMeshesThisFrame = new Set();

// Water/sky material caches: texture -> material (avoid per-frame material creation)
const _waterMaterialCache = new Map();

// Brush entity rendering support
// currentRenderGroup is the THREE.Group that surface renderers add meshes to.
// Defaults to worldGroup, but temporarily swapped to a brush entity group
// during R_DrawBrushModel (equivalent of glPushMatrix/glPopMatrix).
let currentRenderGroup = null;
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

/*
================
_getWaterMaterial

Returns a cached material for water/turb surfaces. Keyed by texture object.
================
*/
function _getWaterMaterial( t, opacity ) {

	// HDR pipeline: liquids are see-through and leave the depth buffer to what is
	// behind them, so the post pass can tint and light the floor correctly.
	const hdr = R_WaterActive();
	if ( hdr && t != null && t.name != null ) {

		opacity = R_LiquidOpacity( t.name, opacity );

		// Retain a subtle underside texture cue; the compositor supplies the
		// Snell window and internal reflections rather than making it disappear.
		if ( opacity < 1 && r_viewleaf != null && ( r_viewleaf.contents === - 3 || r_viewleaf.contents === - 4 ) )
			opacity *= 0.8;

	}

	// Use texture + opacity bucket as key
	const opKey = opacity < 1.0 ? 0 : 1;
	const key = ( t && t.gl_texture ) ? t.gl_texture : null;
	const cacheKey = `${key ? key.id : 0}:${opKey}:${hdr ? 1 : 0}`;

	let material = _waterMaterialCache.get( cacheKey );
	if ( ! material ) {

		// Keep the original texture and its turbulent UVs. Only clear Newer water
		// takes contextual baked brightness from its geometry instead of glowing
		// fullbright; reflections and refraction remain in the compositor.
		const clearWater = hdr && t != null && R_IsWaterTextureName( t.name );

		material = new THREE.MeshBasicMaterial( {
			map: ( t && t.gl_texture ) ? t.gl_texture : null,
			color: ( t && t.gl_texture ) || clearWater ? 0xffffff : 0x406080,
			transparent: true,
			opacity: opacity,
			vertexColors: clearWater,
			side: THREE.DoubleSide
		} );
		_waterMaterialCache.set( cacheKey, material );

		const glow = t != null && t.name != null ? R_GlowBoostForTexture( t.name ) : 1;
		if ( glow !== 1 ) R_RegisterGlow( material, glow );

	}
	if ( material.opacity !== opacity ) material.opacity = opacity;

	const depthWrite = ! ( hdr && opacity < 1 );
	if ( material.depthWrite !== depthWrite ) material.depthWrite = depthWrite;

	return material;

}

export { _getWaterMaterial as R_LiquidSurfaceMaterial };

let waterLightWorld = null, waterLightFrame = - 1, waterLightStyle = '', waterLightRevision = 0;
const waterPointValues = new Map();

function clearWaterTextureLight() {

	waterLightWorld = null; waterLightFrame = - 1; waterLightStyle = ''; waterPointValues.clear(); waterLightRevision ++;

}

/**
 * Gives a clear-water liquid geometry per-vertex brightness from the world's light, so Newer Game's clear water takes
 * contextual baked brightness instead of glowing fullbright. Called for every liquid mesh drawn with a
 * vertex-coloured material (`_getWaterMesh`), so once per surface per frame.
 *
 * Reuses raw vertex samples (`R_LightPointValue`) at shared positions, refreshed when light styles change; static
 * lighting does not need repeated BSP traces. Derived colours refresh independently for the lighting switch/light
 * curve (`r_newdark` while the Newer lighting is on). Native materials ignore this attribute, so their
 * texture/brightness path is unaffected. The sample cache is per world and is cleared by `GL_BuildLightmaps`.
 *
 * @param {THREE.BufferGeometry} geometry the liquid geometry (Quake units, world space); mutated: gains a `color`
 * attribute (brightness 0..2 per channel) and a `userData.waterTextureLight` cache
 * @param {model_t} [world=cl.worldmodel] the world model to sample light from
 */
export function R_UpdateWaterTextureLight( geometry, world = cl.worldmodel ) {

	if ( world !== waterLightWorld ) {

		clearWaterTextureLight(); waterLightWorld = world;

	}
	if ( waterLightFrame !== r_framecount ) {

		waterLightFrame = r_framecount;
		const style = Array.from( d_lightstylevalue ).join( ',' );
		if ( style !== waterLightStyle ) {

			waterLightStyle = style; waterPointValues.clear(); waterLightRevision ++;

		}

	}
	let cache = geometry.userData.waterTextureLight;
	if ( ! cache ) {

		const positions = geometry.getAttribute( 'position' ), keys = [];
		for ( let i = 0; i < positions.count; i ++ ) keys.push( `${positions.getX( i )},${positions.getY( i )},${positions.getZ( i )}` );
		const raw = new Float32Array( positions.count ), colours = new Float32Array( positions.count * 3 );
		geometry.setAttribute( 'color', new THREE.BufferAttribute( colours, 3 ) );
		cache = geometry.userData.waterTextureLight = { keys, raw, revision: - 1, gamma: - 1 };

	}
	const refresh = cache.revision !== waterLightRevision;
	if ( refresh ) {

		const positions = geometry.getAttribute( 'position' ), sample = [ 0, 0, 0 ];
		for ( let i = 0; i < positions.count; i ++ ) {

			const key = cache.keys[ i ];
			if ( ! waterPointValues.has( key ) ) {

				sample[ 0 ] = positions.getX( i ); sample[ 1 ] = positions.getY( i ); sample[ 2 ] = positions.getZ( i );
				waterPointValues.set( key, R_LightPointValue( sample, { worldmodel: world } ) );

			}
			cache.raw[ i ] = waterPointValues.get( key );

		}
		cache.revision = waterLightRevision;

	}
	const gamma = R_NewerLightingActive() ? Math.max( 1, r_newdark.value ) : 1;
	if ( refresh || cache.gamma !== gamma ) {

		const colours = geometry.getAttribute( 'color' );
		for ( let i = 0; i < cache.raw.length; i ++ ) {

			// R_LightPoint returns sample*style/256; the world atlas stores
			// sample*style/128, then applies its curve and lightMapIntensity2.
			const brightness = Math.pow( Math.min( 1, Math.max( 0, cache.raw[ i ] / 128 ) ), gamma ) * 2;
			colours.setXYZ( i, brightness, brightness, brightness );

		}
		colours.needsUpdate = true; cache.gamma = gamma;

	}

}

/*
================
_getWaterMesh

Returns a cached Mesh for a water/turb surface. Cached on the surface object.
================
*/
function _getWaterMesh( s, geometry, material, renderGroup ) {

	if ( material.vertexColors ) R_UpdateWaterTextureLight( geometry );

	// teleporter surfaces become live windows onto their receiver
	if ( s._portal != null && R_PortalsActive() ) {

		material = R_PortalMaterial( s._portal, material.map );
		R_PortalNoteVisible( s._portal );

	}

	let mesh = s._waterMesh;
	if ( ! mesh ) {

		mesh = new THREE.Mesh( geometry, material );
		mesh.userData.quakeLiquid = s.texinfo.texture;
		s._waterMesh = mesh;

	} else {

		if ( mesh.geometry !== geometry ) mesh.geometry = geometry;
		if ( mesh.material !== material ) mesh.material = material;

	}

	// Ensure mesh is in the correct parent group
	if ( mesh.parent !== renderGroup ) {

		if ( mesh.parent ) mesh.parent.remove( mesh );
		renderGroup.add( mesh );

	}

	_waterMeshesThisFrame.add( mesh );
	_waterMeshesInScene.add( mesh );

	return mesh;

}

/**
 * The material the Classic comparison pass (gl_rmain.js) starts from for a scene object. Chains were consumed by the
 * enhanced draw, so the pass prepares the already visible surfaces directly instead of trying to draw those empty
 * chains a second time: a liquid mesh gets its liquid material again at `r_wateralpha`, anything else keeps its own.
 *
 * @param {THREE.Object3D} mesh a scene object; a liquid carries its texture_t in `userData.quakeLiquid`
 * @returns {THREE.Material|Array<THREE.Material>|undefined} the source material (cached for liquids), or the
 * object's own `material`, which is undefined for objects without one
 */
export function R_ClassicSurfaceMaterial( mesh ) {

	if ( mesh.userData.quakeLiquid )
		return _getWaterMaterial( mesh.userData.quakeLiquid, r_wateralpha.value );
	return mesh.material;

}

//============================================================================
// R_TextureAnimation
//============================================================================

/**
 * Returns the proper texture for a given time and base texture (WinQuake gl_rsurf.c): the alternate animation
 * (`+a...` textures) when the entity frame is non-zero, then the frame of the `+0...` cycle for `cl.time` at 10
 * frames a second. Called whenever a surface's material is chosen (each frame for animated world and brush
 * textures).
 *
 * @param {texture_t} base the surface's texture
 * @param {number} [entityFrame] the entity's frame (non-zero selects the alternate animation); defaults to
 * `currententity.frame`, or 0 without a current entity
 * @returns {texture_t} the texture to draw (`base` itself when it is not animated)
 * @throws {Error} via `Sys_Error` when the animation chain ends (`R_TextureAnimation: broken cycle`) or runs past 100
 * steps (`R_TextureAnimation: infinite cycle`)
 */
export function R_TextureAnimation( base, entityFrame = currententity != null ? currententity.frame : 0 ) {

	let reletive;
	let count;

	if ( entityFrame != null && entityFrame !== 0 ) {

		if ( base.alternate_anims != null )
			base = base.alternate_anims;

	}

	if ( base.anim_total === 0 )
		return base;

	// cl.time needs to be connected
	const time = cl != null ? cl.time : 0;
	reletive = ( ( time * 10 ) | 0 ) % base.anim_total;

	count = 0;
	while ( base.anim_min > reletive || base.anim_max <= reletive ) {

		base = base.anim_next;
		if ( base == null )
			Sys_Error( 'R_TextureAnimation: broken cycle' );
		if ( ++ count > 100 )
			Sys_Error( 'R_TextureAnimation: infinite cycle' );

	}

	return base;

}

/**
 * Points a cached material at the current frame of its animated texture: swaps `map` and, for lit materials, the
 * fullbright `emissiveMap` (emissive white when there is one, black otherwise), and refreshes Newer Game's detail maps
 * (`R_RefreshDetail`). Called for each animated world batch on every world draw (`R_UpdateWorldTextureAnimations`).
 *
 * @param {THREE.Material} material the material to update; mutated (`needsUpdate` is set only when a map appears or
 * disappears, which changes the shader)
 * @param {texture_t} baseTexture the surface's base texture
 * @param {number} [entityFrame=0] passed to `R_TextureAnimation`
 * @returns {boolean} true when the material changed; false when it already showed the right frame
 */
export function R_UpdateAnimatedMaterial( material, baseTexture, entityFrame = 0 ) {

	const animatedTexture = R_TextureAnimation( baseTexture, entityFrame );
	const diffuse = animatedTexture != null && animatedTexture.gl_texture != null
		? animatedTexture.gl_texture
		: baseTexture.gl_texture;
	const hadMap = material.map != null;
	const hasMap = diffuse != null;
	const supportsEmissive = material.emissive != null;
	const fullbright = supportsEmissive && diffuse != null && diffuse._fullbright != null
		? diffuse._fullbright
		: null;
	const oldFullbright = supportsEmissive && material.emissiveMap != null
		? material.emissiveMap
		: null;

	if ( material.map === diffuse && oldFullbright === fullbright )
		return false;

	material.map = diffuse;
	if ( hadMap !== hasMap )
		material.needsUpdate = true;
	R_RefreshDetail( material, diffuse );

	if ( supportsEmissive ) {

		const hadFullbright = oldFullbright != null;
		const hasFullbright = fullbright != null;
		material.emissiveMap = fullbright;
		if ( hasFullbright )
			material.emissive.setRGB( 1, 1, 1 );
		else
			material.emissive.setRGB( 0, 0, 0 );

		if ( hadFullbright !== hasFullbright )
			material.needsUpdate = true;

	}

	return true;

}

//============================================================================
// DrawGLPoly
//============================================================================

/**
 * Draws a polygon (WinQuake gl_rsurf.c). In Three.js, we build BufferGeometry from the glpoly_t vertex data: the fan
 * is split into triangles with the winding reversed for Three.js's counter-clockwise front faces, and every vertex
 * gets the same flat normal. It does not add the geometry to the scene. Called at map load by `R_BuildWorldMeshes`
 * for each world surface and by the level views (r_levelview.js).
 *
 * @param {?glpoly_t} p the polygon: `verts` holds VERTEXSIZE (7) floats per vertex, x, y, z (Quake units), s, t
 * (texture, in tiles of the texture) and the lightmap s, t (0..1 across the atlas)
 * @param {?Float32Array} planeNormal the face's outward normal (already flipped for SURF_PLANEBACK); null gives
 * (0, 0, 1)
 * @returns {THREE.BufferGeometry|undefined} a new non-indexed geometry with `position`, `normal`, `uv` and `uv1`
 * (owned by the caller), or undefined when `p` is null or has fewer than 3 vertices
 */
export function DrawGLPoly( p, planeNormal ) {

	if ( ! p || p.numverts < 3 ) return;

	// Build triangle fan from polygon vertices
	// glpoly_t stores verts as flat array: [x,y,z,s,t,ls,lt] per vertex
	const numverts = p.numverts;
	const verts = p.verts;
	const numTriangles = numverts - 2;

	const positions = new Float32Array( numTriangles * 3 * 3 );
	const normals = new Float32Array( numTriangles * 3 * 3 );
	const uvs = new Float32Array( numTriangles * 3 * 2 );
	const lmUvs = new Float32Array( numTriangles * 3 * 2 );

	// Use plane normal for flat shading (BSP surfaces are planar)
	const nx = planeNormal ? planeNormal[ 0 ] : 0;
	const ny = planeNormal ? planeNormal[ 1 ] : 0;
	const nz = planeNormal ? planeNormal[ 2 ] : 1;

	for ( let i = 0; i < numTriangles; i ++ ) {

		// triangle fan: vertex 0, i+2, i+1 (reversed winding for Three.js CCW front faces)
		const i0 = 0;
		const i1 = i + 2;
		const i2 = i + 1;

		// position (x, y, z)
		positions[ i * 9 + 0 ] = verts[ i0 * VERTEXSIZE + 0 ];
		positions[ i * 9 + 1 ] = verts[ i0 * VERTEXSIZE + 1 ];
		positions[ i * 9 + 2 ] = verts[ i0 * VERTEXSIZE + 2 ];

		positions[ i * 9 + 3 ] = verts[ i1 * VERTEXSIZE + 0 ];
		positions[ i * 9 + 4 ] = verts[ i1 * VERTEXSIZE + 1 ];
		positions[ i * 9 + 5 ] = verts[ i1 * VERTEXSIZE + 2 ];

		positions[ i * 9 + 6 ] = verts[ i2 * VERTEXSIZE + 0 ];
		positions[ i * 9 + 7 ] = verts[ i2 * VERTEXSIZE + 1 ];
		positions[ i * 9 + 8 ] = verts[ i2 * VERTEXSIZE + 2 ];

		// normals (same for all vertices - flat shading)
		normals[ i * 9 + 0 ] = nx;
		normals[ i * 9 + 1 ] = ny;
		normals[ i * 9 + 2 ] = nz;

		normals[ i * 9 + 3 ] = nx;
		normals[ i * 9 + 4 ] = ny;
		normals[ i * 9 + 5 ] = nz;

		normals[ i * 9 + 6 ] = nx;
		normals[ i * 9 + 7 ] = ny;
		normals[ i * 9 + 8 ] = nz;

		// texture UVs (s, t) at offsets 3, 4
		uvs[ i * 6 + 0 ] = verts[ i0 * VERTEXSIZE + 3 ];
		uvs[ i * 6 + 1 ] = verts[ i0 * VERTEXSIZE + 4 ];

		uvs[ i * 6 + 2 ] = verts[ i1 * VERTEXSIZE + 3 ];
		uvs[ i * 6 + 3 ] = verts[ i1 * VERTEXSIZE + 4 ];

		uvs[ i * 6 + 4 ] = verts[ i2 * VERTEXSIZE + 3 ];
		uvs[ i * 6 + 5 ] = verts[ i2 * VERTEXSIZE + 4 ];

		// lightmap UVs (ls, lt) at offsets 5, 6
		lmUvs[ i * 6 + 0 ] = verts[ i0 * VERTEXSIZE + 5 ];
		lmUvs[ i * 6 + 1 ] = verts[ i0 * VERTEXSIZE + 6 ];

		lmUvs[ i * 6 + 2 ] = verts[ i1 * VERTEXSIZE + 5 ];
		lmUvs[ i * 6 + 3 ] = verts[ i1 * VERTEXSIZE + 6 ];

		lmUvs[ i * 6 + 4 ] = verts[ i2 * VERTEXSIZE + 5 ];
		lmUvs[ i * 6 + 5 ] = verts[ i2 * VERTEXSIZE + 6 ];

	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) );
	geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
	geometry.setAttribute( 'uv1', new THREE.BufferAttribute( lmUvs, 2 ) );

	return geometry;

}

//============================================================================
// _mergeGLPolys
//
// Merges multiple glpoly_t into a single BufferGeometry. Used to batch
// brush entity surfaces that share the same material into one draw call.
//============================================================================

function _mergeGLPolys( polys, planeNormals ) {

	// Count total triangles across all polys
	let totalTriangles = 0;
	for ( let p = 0; p < polys.length; p ++ ) {

		const poly = polys[ p ];
		if ( poly != null && poly.numverts >= 3 ) {

			totalTriangles += poly.numverts - 2;

		}

	}

	if ( totalTriangles === 0 ) return null;

	const positions = new Float32Array( totalTriangles * 9 );
	const normals = new Float32Array( totalTriangles * 9 );
	const uvs = new Float32Array( totalTriangles * 6 );
	const lmUvs = new Float32Array( totalTriangles * 6 );

	let triOffset = 0;

	for ( let p = 0; p < polys.length; p ++ ) {

		const poly = polys[ p ];
		if ( poly == null || poly.numverts < 3 ) continue;

		const planeNormal = planeNormals[ p ];
		const nx = planeNormal != null ? planeNormal[ 0 ] : 0;
		const ny = planeNormal != null ? planeNormal[ 1 ] : 0;
		const nz = planeNormal != null ? planeNormal[ 2 ] : 1;

		const numverts = poly.numverts;
		const verts = poly.verts;
		const numTriangles = numverts - 2;

		for ( let i = 0; i < numTriangles; i ++ ) {

			const i0 = 0;
			const i1 = i + 2;
			const i2 = i + 1;

			const posBase = ( triOffset + i ) * 9;
			const uvBase = ( triOffset + i ) * 6;

			positions[ posBase + 0 ] = verts[ i0 * VERTEXSIZE + 0 ];
			positions[ posBase + 1 ] = verts[ i0 * VERTEXSIZE + 1 ];
			positions[ posBase + 2 ] = verts[ i0 * VERTEXSIZE + 2 ];

			positions[ posBase + 3 ] = verts[ i1 * VERTEXSIZE + 0 ];
			positions[ posBase + 4 ] = verts[ i1 * VERTEXSIZE + 1 ];
			positions[ posBase + 5 ] = verts[ i1 * VERTEXSIZE + 2 ];

			positions[ posBase + 6 ] = verts[ i2 * VERTEXSIZE + 0 ];
			positions[ posBase + 7 ] = verts[ i2 * VERTEXSIZE + 1 ];
			positions[ posBase + 8 ] = verts[ i2 * VERTEXSIZE + 2 ];

			normals[ posBase + 0 ] = nx;
			normals[ posBase + 1 ] = ny;
			normals[ posBase + 2 ] = nz;

			normals[ posBase + 3 ] = nx;
			normals[ posBase + 4 ] = ny;
			normals[ posBase + 5 ] = nz;

			normals[ posBase + 6 ] = nx;
			normals[ posBase + 7 ] = ny;
			normals[ posBase + 8 ] = nz;

			uvs[ uvBase + 0 ] = verts[ i0 * VERTEXSIZE + 3 ];
			uvs[ uvBase + 1 ] = verts[ i0 * VERTEXSIZE + 4 ];

			uvs[ uvBase + 2 ] = verts[ i1 * VERTEXSIZE + 3 ];
			uvs[ uvBase + 3 ] = verts[ i1 * VERTEXSIZE + 4 ];

			uvs[ uvBase + 4 ] = verts[ i2 * VERTEXSIZE + 3 ];
			uvs[ uvBase + 5 ] = verts[ i2 * VERTEXSIZE + 4 ];

			lmUvs[ uvBase + 0 ] = verts[ i0 * VERTEXSIZE + 5 ];
			lmUvs[ uvBase + 1 ] = verts[ i0 * VERTEXSIZE + 6 ];

			lmUvs[ uvBase + 2 ] = verts[ i1 * VERTEXSIZE + 5 ];
			lmUvs[ uvBase + 3 ] = verts[ i1 * VERTEXSIZE + 6 ];

			lmUvs[ uvBase + 4 ] = verts[ i2 * VERTEXSIZE + 5 ];
			lmUvs[ uvBase + 5 ] = verts[ i2 * VERTEXSIZE + 6 ];

		}

		triOffset += numTriangles;

	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) );
	geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
	geometry.setAttribute( 'uv1', new THREE.BufferAttribute( lmUvs, 2 ) );

	return geometry;

}

//============================================================================
// DrawGLWaterPoly
//============================================================================

/**
 * Warp the vertex coordinates for water surfaces (WinQuake gl_rsurf.c): x and y move by up to 8 Quake units along
 * sine waves of the position and `cl.time`; z is kept. The renderer's own liquids use the turbulent UVs of
 * `EmitWaterPolysQuake` instead, so nothing in the engine calls this.
 *
 * @param {?glpoly_t} p the polygon (VERTEXSIZE floats per vertex: x, y, z, then s, t)
 * @returns {?THREE.BufferGeometry} a new non-indexed geometry with warped `position`, the poly's `uv` and computed
 * normals, or null when `p` is null or has fewer than 3 vertices
 */
export function DrawGLWaterPoly( p ) {

	if ( ! p || p.numverts < 3 ) return null;

	const numverts = p.numverts;
	const verts = p.verts;
	const numTriangles = numverts - 2;
	const realtime = cl ? cl.time : 0;

	const positions = new Float32Array( numTriangles * 3 * 3 );
	const uvs = new Float32Array( numTriangles * 3 * 2 );

	// precompute warped positions
	const warped = new Float32Array( numverts * 3 );
	for ( let i = 0; i < numverts; i ++ ) {

		const vi = i * VERTEXSIZE;
		const x = verts[ vi + 0 ];
		const y = verts[ vi + 1 ];
		const z = verts[ vi + 2 ];

		warped[ i * 3 + 0 ] = x + 8 * Math.sin( y * 0.05 + realtime ) * Math.sin( z * 0.05 + realtime );
		warped[ i * 3 + 1 ] = y + 8 * Math.sin( x * 0.05 + realtime ) * Math.sin( z * 0.05 + realtime );
		warped[ i * 3 + 2 ] = z;

	}

	for ( let i = 0; i < numTriangles; i ++ ) {

		const i0 = 0;
		const i1 = i + 1;
		const i2 = i + 2;

		positions[ i * 9 + 0 ] = warped[ i0 * 3 + 0 ];
		positions[ i * 9 + 1 ] = warped[ i0 * 3 + 1 ];
		positions[ i * 9 + 2 ] = warped[ i0 * 3 + 2 ];

		positions[ i * 9 + 3 ] = warped[ i1 * 3 + 0 ];
		positions[ i * 9 + 4 ] = warped[ i1 * 3 + 1 ];
		positions[ i * 9 + 5 ] = warped[ i1 * 3 + 2 ];

		positions[ i * 9 + 6 ] = warped[ i2 * 3 + 0 ];
		positions[ i * 9 + 7 ] = warped[ i2 * 3 + 1 ];
		positions[ i * 9 + 8 ] = warped[ i2 * 3 + 2 ];

		uvs[ i * 6 + 0 ] = verts[ i0 * VERTEXSIZE + 3 ];
		uvs[ i * 6 + 1 ] = verts[ i0 * VERTEXSIZE + 4 ];

		uvs[ i * 6 + 2 ] = verts[ i1 * VERTEXSIZE + 3 ];
		uvs[ i * 6 + 3 ] = verts[ i1 * VERTEXSIZE + 4 ];

		uvs[ i * 6 + 4 ] = verts[ i2 * VERTEXSIZE + 3 ];
		uvs[ i * 6 + 5 ] = verts[ i2 * VERTEXSIZE + 4 ];

	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
	geometry.computeVertexNormals();

	return geometry;

}

//============================================================================
// EmitWaterPolysQuake
//
// Builds water geometry with warped UVs in Quake coordinate space.
// Unlike gl_warp.js version, keeps coordinates in Quake space to match
// the world geometry and camera setup.
//============================================================================

function EmitWaterPolysQuake( fa, realtime ) {

	// Use cached geometry on the surface to avoid per-frame allocation.
	// Positions are static; only UVs change each frame due to turbulence.
	let cached = fa._waterGeoCache;

	if ( ! cached ) {

		// First time: build positions, UVs, indices and cache them
		const posArr = [];
		const uvArr = [];
		const idxArr = [];
		let vertexCount = 0;

		for ( let p = fa.polys; p; p = p.next ) {

			const startVert = vertexCount;
			const numverts = p.numverts;

			for ( let i = 0; i < numverts; i ++ ) {

				let vx, vy, vz, os, ot;

				if ( p.verts instanceof Float32Array ) {

					const vi = i * VERTEXSIZE;
					vx = p.verts[ vi + 0 ];
					vy = p.verts[ vi + 1 ];
					vz = p.verts[ vi + 2 ];
					os = p.verts[ vi + 3 ];
					ot = p.verts[ vi + 4 ];

				} else {

					const v = p.verts[ i ];
					vx = v[ 0 ];
					vy = v[ 1 ];
					vz = v[ 2 ];
					os = v[ 3 ];
					ot = v[ 4 ];

				}

				posArr.push( vx, vy, vz );
				uvArr.push( os, ot ); // store original s/t for turbulence calc
				vertexCount ++;

			}

			for ( let i = 2; i < numverts; i ++ ) {

				idxArr.push( startVert, startVert + i - 1, startVert + i );

			}

		}

		if ( posArr.length === 0 )
			return null;

		const positions = new Float32Array( posArr );
		const uvs = new Float32Array( uvArr );
		const turbUvs = new Float32Array( uvArr.length );

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
		geometry.setAttribute( 'uv', new THREE.BufferAttribute( turbUvs, 2 ) );
		geometry.setIndex( idxArr );
		geometry.computeVertexNormals();

		cached = { geometry, origUvs: uvs, turbUvs, vertexCount };
		fa._waterGeoCache = cached;

	}

	// Update turbulent UVs each frame
	const origUvs = cached.origUvs;
	const turbUvs = cached.turbUvs;
	const count = cached.vertexCount;

	for ( let i = 0; i < count; i ++ ) {

		const os = origUvs[ i * 2 ];
		const ot = origUvs[ i * 2 + 1 ];

		let s = os + turbsin[ ( ( ot * 0.125 + realtime ) * TURBSCALE | 0 ) & 255 ];
		s *= ( 1.0 / 64 );

		let t = ot + turbsin[ ( ( os * 0.125 + realtime ) * TURBSCALE | 0 ) & 255 ];
		t *= ( 1.0 / 64 );

		turbUvs[ i * 2 ] = s;
		turbUvs[ i * 2 + 1 ] = t;

	}

	cached.geometry.attributes.uv.needsUpdate = true;

	return cached.geometry;

}

//============================================================================
// EmitSkyPolysQuake
//
// Builds sky geometry in Quake coordinate space.
// layer: 0 = solid layer, 1 = alpha layer
//============================================================================

function EmitSkyPolysQuake( fa, speedscale, layer ) {

	// Sky positions are static per surface; UVs depend on camera origin and speedscale.
	// Cache the geometry and positions; update UVs in place each frame.

	// We use two caches per surface: _skyGeoCache (solid layer) and _skyGeoCache2 (alpha layer)
	const cacheKey = layer === 1 ? '_skyGeoCache2' : '_skyGeoCache';
	let cached = fa[ cacheKey ];

	if ( ! cached ) {

		// First time: build positions and indices
		const posArr = [];
		const idxArr = [];
		let vertexCount = 0;

		for ( let p = fa.polys; p; p = p.next ) {

			const startVert = vertexCount;
			const numverts = p.numverts;

			for ( let i = 0; i < numverts; i ++ ) {

				let vx, vy, vz;

				if ( p.verts instanceof Float32Array ) {

					const vi = i * VERTEXSIZE;
					vx = p.verts[ vi + 0 ];
					vy = p.verts[ vi + 1 ];
					vz = p.verts[ vi + 2 ];

				} else {

					const v = p.verts[ i ];
					vx = v[ 0 ];
					vy = v[ 1 ];
					vz = v[ 2 ];

				}

				posArr.push( vx, vy, vz );
				vertexCount ++;

			}

			for ( let i = 2; i < numverts; i ++ ) {

				idxArr.push( startVert, startVert + i - 1, startVert + i );

			}

		}

		if ( posArr.length === 0 )
			return null;

		const positions = new Float32Array( posArr );
		const uvs = new Float32Array( vertexCount * 2 );

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
		geometry.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
		geometry.setIndex( idxArr );

		cached = { geometry, positions, uvs, vertexCount };
		fa[ cacheKey ] = cached;

	}

	// Update UVs based on current camera origin and speedscale
	const pos = cached.positions;
	const uvs = cached.uvs;
	const count = cached.vertexCount;

	for ( let i = 0; i < count; i ++ ) {

		const vx = pos[ i * 3 ];
		const vy = pos[ i * 3 + 1 ];
		const vz = pos[ i * 3 + 2 ];

		let dx = vx - r_origin[ 0 ];
		let dy = vy - r_origin[ 1 ];
		let dz = ( vz - r_origin[ 2 ] ) * 3; // flatten the sphere

		let length = Math.sqrt( dx * dx + dy * dy + dz * dz );
		length = 6 * 63 / length;

		uvs[ i * 2 ] = ( speedscale + dx * length ) * ( 1.0 / 128 );
		uvs[ i * 2 + 1 ] = ( speedscale + dy * length ) * ( 1.0 / 128 );

	}

	cached.geometry.attributes.uv.needsUpdate = true;

	return cached.geometry;

}

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

		const renderGroup = currentRenderGroup || worldGroup;
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

		const renderGroup = currentRenderGroup || worldGroup;
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
// R_AddDynamicLights
//============================================================================

export // With the Newer lighting a dynamic light is drawn by the pipeline (gl_post.js), so
// what it adds to the baked light is only a share of the classic amount: both at
// full strength would light everything twice.
const DYNAMIC_SHARE = 0.3;

function R_AddDynamicLights( surf ) {

	if ( ! cl_dlights ) return;
	const dynScale = R_NewerLightingActive() ? DYNAMIC_SHARE : 1;

	const smax = ( surf.extents[ 0 ] >> 4 ) + 1;
	const tmax = ( surf.extents[ 1 ] >> 4 ) + 1;
	const tex = surf.texinfo;

	for ( let lnum = 0; lnum < 32 /* MAX_DLIGHTS */; lnum ++ ) {

		if ( ! ( surf.dlightbits & ( 1 << lnum ) ) )
			continue; // not lit by this light

		const dl = cl_dlights[ lnum ];
		let rad = dl.radius;
		let dist = DotProduct( dl.origin, surf.plane.normal ) - surf.plane.dist;
		rad -= Math.abs( dist );
		let minlight = dl.minlight;
		if ( rad < minlight )
			continue;
		minlight = rad - minlight;

		// Use cached buffers to avoid per-call allocations (Golden Rule #4)
		const impact = _dlight_impact;
		for ( let i = 0; i < 3; i ++ ) {

			impact[ i ] = dl.origin[ i ] - surf.plane.normal[ i ] * dist;

		}

		const local = _dlight_local;
		local[ 0 ] = DotProduct( impact, tex.vecs[ 0 ] ) + tex.vecs[ 0 ][ 3 ];
		local[ 1 ] = DotProduct( impact, tex.vecs[ 1 ] ) + tex.vecs[ 1 ][ 3 ];

		local[ 0 ] -= surf.texturemins[ 0 ];
		local[ 1 ] -= surf.texturemins[ 1 ];

		for ( let t = 0; t < tmax; t ++ ) {

			let td = local[ 1 ] - t * 16;
			if ( td < 0 ) td = - td;

			for ( let s = 0; s < smax; s ++ ) {

				let sd = local[ 0 ] - s * 16;
				if ( sd < 0 ) sd = - sd;

				if ( sd > td )
					dist = sd + ( td >> 1 );
				else
					dist = td + ( sd >> 1 );

				if ( dist < minlight )
					blocklights[ t * smax + s ] += ( ( rad - dist ) * 256 * dynScale ) | 0;

			}

		}

	}

}

//============================================================================
// R_BuildLightMap
//============================================================================

/**
 * Combine and scale multiple lightmaps into the 8.8 format in blocklights (WinQuake gl_rsurf.c), then bound, invert
 * and shift them into `dest`. Each light style's samples are scaled by `d_lightstylevalue` (cached in
 * `surf.cached_light`) and the dynamic lights touching the surface this frame are added (white; only a 0.3 share
 * while the Newer lighting is on, since the pipeline draws them too). Everything is full bright when `r_fullbright`
 * is on or the world has no light data at all. Called at map load for every surface, when a surface's light changes,
 * by the Classic pass and by the level views.
 *
 * @param {msurface_t} surf the surface: its lightmap is `(extents >> 4) + 1` texels each way (at most 18 x 18);
 * mutated (`cached_light`, `cached_dlight`)
 * @param {Uint8Array} dest written: one value per channel per texel, stored inverted (255 - brightness, 0..255)
 * @param {number} destOffset byte index in `dest` of the surface's first texel
 * @param {number} stride bytes from one row of the surface's texels to the next in `dest`
 * @param {number} [bytes=lightmap_bytes] how many bytes each texel takes in dest: 1 (the light's brightness) or 3
 * (red, green and blue, for a map with coloured lightmaps; the .lit samples are used when the surface has them)
 */
export function R_BuildLightMap( surf, dest, destOffset, stride, bytes = lightmap_bytes ) {

	const smax = ( surf.extents[ 0 ] >> 4 ) + 1;
	const tmax = ( surf.extents[ 1 ] >> 4 ) + 1;
	const size = smax * tmax;
	const colour = bytes === 3;
	let lightmap = surf.samples;
	let lightmapOffset = surf.sampleOffset || 0;
	const lit = colour ? surf.litsamples : null;
	let litOffset = surf.litOffset || 0;

	surf.cached_dlight = ( surf.dlightframe === r_framecount );

	// set to full bright if no light data
	// C code: r_fullbright.value || !cl.worldmodel->lightdata
	// This checks the WORLD's lightdata, not the individual surface's samples.
	// Surfaces with no samples but in a lit world should be dark, not fullbright.
	if ( r_fullbright.value || ( cl.worldmodel != null && cl.worldmodel.lightdata == null ) ) {

		for ( let i = 0; i < size; i ++ )
			blocklights[ i ] = 255 * 256;

		if ( colour ) {

			blocklightsG.fill( 255 * 256, 0, size );
			blocklightsB.fill( 255 * 256, 0, size );

		}

	} else {

		// clear to no light
		for ( let i = 0; i < size; i ++ )
			blocklights[ i ] = 0;

		if ( colour ) {

			blocklightsG.fill( 0, 0, size );
			blocklightsB.fill( 0, 0, size );

		}

		// add all the lightmaps
		if ( lightmap != null ) {

			for ( let maps = 0; maps < MAXLIGHTMAPS && surf.styles[ maps ] !== 255; maps ++ ) {

				const scale = d_lightstylevalue[ surf.styles[ maps ] ];
				surf.cached_light[ maps ] = scale; // 8.8 fraction

				if ( lit !== null ) {

					for ( let i = 0; i < size; i ++ ) {

						blocklights[ i ] += lit[ litOffset + i * 3 ] * scale;
						blocklightsG[ i ] += lit[ litOffset + i * 3 + 1 ] * scale;
						blocklightsB[ i ] += lit[ litOffset + i * 3 + 2 ] * scale;

					}

					litOffset += size * 3;

				} else {

					for ( let i = 0; i < size; i ++ ) {

						const v = lightmap[ lightmapOffset + i ] * scale;
						blocklights[ i ] += v;
						if ( colour ) {

							blocklightsG[ i ] += v;
							blocklightsB[ i ] += v;

						}

					}

				}

				lightmapOffset += size; // skip to next lightmap

			}

		}

		// add all the dynamic lights (white: they add the same to red, green and blue)
		if ( surf.dlightframe === r_framecount ) {

			if ( colour ) {

				for ( let i = 0; i < size; i ++ ) {

					blocklightsDyn[ i ] = blocklights[ i ];
					blocklights[ i ] = 0;

				}

				R_AddDynamicLights( surf );

				for ( let i = 0; i < size; i ++ ) {

					const d = blocklights[ i ];
					blocklights[ i ] = blocklightsDyn[ i ] + d;
					blocklightsG[ i ] += d;
					blocklightsB[ i ] += d;

				}

			} else {

				R_AddDynamicLights( surf );

			}

		}

	}

	// bound, invert, and shift
	// store as luminance (single byte per texel), or as red, green and blue
	stride -= smax * bytes;
	let bl = 0; // index into blocklights
	let di = destOffset;

	for ( let i = 0; i < tmax; i ++, di += stride ) {

		for ( let j = 0; j < smax; j ++ ) {

			let t = blocklights[ bl ] >> 7;
			if ( t > 255 ) t = 255;
			dest[ di ] = 255 - t;

			if ( colour ) {

				let g = blocklightsG[ bl ] >> 7;
				if ( g > 255 ) g = 255;
				let b = blocklightsB[ bl ] >> 7;
				if ( b > 255 ) b = 255;
				dest[ di + 1 ] = 255 - g;
				dest[ di + 2 ] = 255 - b;

			}

			bl ++;
			di += bytes;

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
	if ( ! worldGroup ) {

		worldGroup = new THREE.Group();
		worldGroup.name = 'quake_world';
		if ( scene ) scene.add( worldGroup );

	}

	// Begin new water/sky frame: clear "this frame" set
	_waterMeshesThisFrame = new Set();

	// Remove brush entity groups from scene (don't dispose - they're cached on entities)
	for ( let i = 0; i < brushEntityGroups.length; i ++ ) {

		const group = brushEntityGroups[ i ];
		if ( group.parent ) group.parent.remove( group );

	}

	brushEntityGroups.length = 0;

	// Set currentRenderGroup to worldGroup for world surface rendering
	currentRenderGroup = worldGroup;

	R_RecursiveWorldNode( cl_ref.worldmodel.nodes[ 0 ] );

	R_AddPortalReceiverSurfaces( cl_ref.worldmodel );

	// Update mesh visibility based on PVS (leaf visframe set by R_MarkLeaves)
	R_UpdateDemonSurfaces();
	R_UpdateWorldVisibility();
	R_RockfieldUpdate( r_refdef.vieworg, r_framecount );

	DrawTextureChains();

	R_BlendLightmaps();

}

/*
================
R_CleanupWaterMeshes
================
*/
/**
 * Remove water/sky meshes that were in the scene last frame but not rendered this frame. Called from R_RenderView
 * (gl_rmain.js) after all water rendering is done. The meshes stay cached on their surfaces for reuse.
 */
export function R_CleanupWaterMeshes() {

	for ( const mesh of _waterMeshesInScene ) {

		if ( ! _waterMeshesThisFrame.has( mesh ) ) {

			if ( mesh.parent ) mesh.parent.remove( mesh );
			_waterMeshesInScene.delete( mesh );

		}

	}

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
// R_BlendLightmaps
//============================================================================

/**
 * Uploads the lightmap atlases changed this frame (WinQuake gl_rsurf.c). In Three.js, lightmaps are applied as
 * texture maps on materials rather than blended separately, so this copies each modified atlas from the inverted
 * module buffer into its THREE.DataTexture as RGBA brightness (alpha 255), sets `needsUpdate` and resets the changed
 * rectangle. Does nothing while `r_fullbright` is on or `gl_texsort` is 0. Called at the end of `R_DrawWorld` and
 * `R_DrawBrushModel`.
 */
export function R_BlendLightmaps() {

	if ( r_fullbright.value )
		return;
	if ( ! gl_texsort.value )
		return;

	// In Three.js, lightmaps are applied as texture maps on materials
	// rather than blended separately. This function handles the
	// lightmap texture updates.

	for ( let i = 0; i < MAX_LIGHTMAPS; i ++ ) {

		// Check if this lightmap was modified (by world or brush entity surfaces)
		// Don't require lightmap_polys[i] to be set - brush entities may use
		// lightmap atlases that have no visible world surfaces this frame.
		if ( lightmap_modified[ i ] ) {

			lightmap_modified[ i ] = false;
			const theRect = lightmap_rectchange[ i ];

			// Upload changed lightmap data to the THREE.DataTexture
			const tex = lightmapTextures[ i ];
			if ( tex && tex.image && tex.image.data ) {

				const srcOffset = i * BLOCK_WIDTH * BLOCK_HEIGHT * lightmap_bytes;
				const dstData = tex.image.data;
				const pixelCount = BLOCK_WIDTH * BLOCK_HEIGHT;

				for ( let p = 0; p < pixelCount; p ++ ) {

					if ( lightmap_bytes === 3 ) {

						dstData[ p * 4 ] = 255 - lightmaps[ srcOffset + p * 3 ];
						dstData[ p * 4 + 1 ] = 255 - lightmaps[ srcOffset + p * 3 + 1 ];
						dstData[ p * 4 + 2 ] = 255 - lightmaps[ srcOffset + p * 3 + 2 ];

					} else {

						const val = 255 - lightmaps[ srcOffset + p ];
						dstData[ p * 4 ] = val;
						dstData[ p * 4 + 1 ] = val;
						dstData[ p * 4 + 2 ] = val;

					}

					dstData[ p * 4 + 3 ] = 255;

				}

				tex.needsUpdate = true;

			}

			theRect.l = BLOCK_WIDTH;
			theRect.t = BLOCK_HEIGHT;
			theRect.h = 0;
			theRect.w = 0;

		}

		// Lightmap polys are blended via material in Three.js path
		// No need for explicit GL blend state

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

			if ( s.polys && worldGroup ) {

				const realtime = cl ? cl.time : 0;
				const geometry = EmitWaterPolysQuake( s, realtime );
				if ( geometry ) {

					const material = _getWaterMaterial( s.texinfo.texture, r_wateralpha.value );
					_getWaterMesh( s, geometry, material, worldGroup );

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

				if ( s.polys && worldGroup ) {

					const realtime = cl ? cl.time : 0;
					const geometry = EmitWaterPolysQuake( s, realtime );
					if ( geometry ) {

						const material = _getWaterMaterial( t, r_wateralpha.value );
						_getWaterMesh( s, geometry, material, worldGroup );

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
// R_DrawSkyChain
//============================================================================

let solidSkyMaterial = null;
let alphaSkyMaterial = null;

function R_DrawSkyChain( s ) {

	if ( ! worldGroup ) return;

	R_PostNoteSky();

	// Create or update sky materials from the sky textures
	if ( solidskytexture && ! solidSkyMaterial ) {

		solidSkyMaterial = new THREE.MeshBasicMaterial( {
			map: solidskytexture,
			side: THREE.DoubleSide
		} );

	}

	if ( alphaskytexture && ! alphaSkyMaterial ) {

		alphaSkyMaterial = new THREE.MeshBasicMaterial( {
			map: alphaskytexture,
			side: THREE.DoubleSide,
			transparent: true,
			alphaTest: 0.05
		} );

	}

	// Fallback if sky textures not loaded
	if ( ! solidSkyMaterial ) {

		solidSkyMaterial = new THREE.MeshBasicMaterial( {
			color: 0x3366aa,
			side: THREE.DoubleSide
		} );

	}

	// With the HDR pipeline the sky must not write depth: pixels that show sky
	// keep the far-plane depth, which is how the volumetric pass finds openings.
	const skyDepthWrite = ! R_PostActive();
	if ( solidSkyMaterial && solidSkyMaterial.depthWrite !== skyDepthWrite ) solidSkyMaterial.depthWrite = skyDepthWrite;
	if ( alphaSkyMaterial && alphaSkyMaterial.depthWrite !== skyDepthWrite ) alphaSkyMaterial.depthWrite = skyDepthWrite;

	// the sky is a light source too: brighter than white lets it bloom around openings
	if ( solidSkyMaterial && solidSkyMaterial.userData.glowBoost === undefined ) R_RegisterGlow( solidSkyMaterial, 1.9 );
	if ( alphaSkyMaterial && alphaSkyMaterial.userData.glowBoost === undefined ) R_RegisterGlow( alphaSkyMaterial, 1.9 );

	// Solid sky layer (background, speed = realtime*8)
	let solidSpeed = realtime * 8;
	solidSpeed -= ( solidSpeed | 0 ) & ~127;

	for ( let fa = s; fa; fa = fa.texturechain ) {

		if ( ! fa.polys ) continue;

		const geometry = EmitSkyPolysQuake( fa, solidSpeed, 0 );
		if ( geometry ) {

			// Cache sky mesh on surface, keyed by layer
			let mesh = fa._skyMesh;
			if ( ! mesh ) {

				mesh = new THREE.Mesh( geometry, solidSkyMaterial );
				mesh.userData.quakeSky = true;
				fa._skyMesh = mesh;

			} else {

				if ( mesh.geometry !== geometry ) mesh.geometry = geometry;
				mesh.material = solidSkyMaterial;

			}

			if ( mesh.parent !== worldGroup ) {

				if ( mesh.parent ) mesh.parent.remove( mesh );
				worldGroup.add( mesh );

			}

			_waterMeshesThisFrame.add( mesh );
			_waterMeshesInScene.add( mesh );

		}

	}

	// Alpha sky layer (overlay, speed = realtime*16)
	if ( alphaSkyMaterial ) {

		let alphaSpeed = realtime * 16;
		alphaSpeed -= ( alphaSpeed | 0 ) & ~127;

		for ( let fa = s; fa; fa = fa.texturechain ) {

			if ( ! fa.polys ) continue;

			const geometry = EmitSkyPolysQuake( fa, alphaSpeed, 1 );
			if ( geometry ) {

				let mesh = fa._skyMesh2;
				if ( ! mesh ) {

					mesh = new THREE.Mesh( geometry, alphaSkyMaterial );
					mesh.userData.quakeSky = true;
					fa._skyMesh2 = mesh;

				} else {

					if ( mesh.geometry !== geometry ) mesh.geometry = geometry;
					mesh.material = alphaSkyMaterial;

				}

				if ( mesh.parent !== worldGroup ) {

					if ( mesh.parent ) mesh.parent.remove( mesh );
					worldGroup.add( mesh );

				}

				_waterMeshesThisFrame.add( mesh );
				_waterMeshesInScene.add( mesh );

			}

		}

	}

}

//============================================================================
// AllocBlock
//
// Returns a texture number and the position inside it
//============================================================================

function resizeLightmapCapacity(count){
 const previous=lightmaps,next=new Uint8Array(4*count*BLOCK_WIDTH*BLOCK_HEIGHT);next.set(previous.subarray(0,next.length));lightmaps=next;
 for(let i=MAX_LIGHTMAPS;i<count;i++){allocated.push(new Int32Array(BLOCK_WIDTH));lightmap_polys.push(null);lightmap_modified.push(false);lightmap_rectchange.push(new glRect_t());}
 allocated.length=count;lightmap_polys.length=count;lightmap_modified.length=count;lightmap_rectchange.length=count;MAX_LIGHTMAPS=count;
}

/**
 * Returns a texture number and the position inside it (WinQuake gl_rsurf.c): finds room for a surface's lightmap in
 * the first atlas with space (BLOCK_WIDTH x BLOCK_HEIGHT, 128 x 128 texels), lowest position first, and reserves it.
 * When every atlas is full the atlas count doubles (from 64, at most 512), keeping what is already allocated.
 * Called at map load by `GL_CreateSurfaceLightmap`; the allocation lasts until the next `GL_BuildLightmaps`.
 *
 * @param {number} w width in lightmap texels (1..127)
 * @param {number} h height in lightmap texels (1..128)
 * @param {{ value: number }} outX written: the column of the block's left edge, in texels
 * @param {{ value: number }} outY written: the row of the block's top edge, in texels
 * @returns {number} the atlas index (into `lightmapTextures`)
 * @throws {Error} via `Sys_Error` (`AllocBlock: full`) when no atlas has room and no more can be added (512 atlases,
 * or a size the atlases cannot hold)
 */
export function AllocBlock( w, h, outX, outY ) {

	for ( let texnum = 0; texnum < MAX_LIGHTMAPS; texnum ++ ) {

		let best = BLOCK_HEIGHT;

		for ( let i = 0; i < BLOCK_WIDTH - w; i ++ ) {

			let best2 = 0;
			let j;

			for ( j = 0; j < w; j ++ ) {

				if ( allocated[ texnum ][ i + j ] >= best )
					break;
				if ( allocated[ texnum ][ i + j ] > best2 )
					best2 = allocated[ texnum ][ i + j ];

			}

			if ( j === w ) {

				// this is a valid spot
				outX.value = i;
				outY.value = best = best2;

			}

		}

		if ( best + h > BLOCK_HEIGHT )
			continue;

		for ( let i = 0; i < w; i ++ )
			allocated[ texnum ][ outX.value + i ] = best + h;

		return texnum;

	}

	if(MAX_LIGHTMAPS<LIGHTMAP_LIMIT&&w>0&&h>0&&w<BLOCK_WIDTH&&h<=BLOCK_HEIGHT){resizeLightmapCapacity(Math.min(LIGHTMAP_LIMIT,MAX_LIGHTMAPS*2));return AllocBlock(w,h,outX,outY);}
	Sys_Error( 'AllocBlock: full' );

}

//============================================================================
// BuildSurfaceDisplayList
//============================================================================

/**
 * Reconstructs polygon from BSP edges and computes texture coordinates (WinQuake gl_rsurf.c). In Three.js, we build
 * BufferGeometry instead of glpoly_t display lists, from the polygon this makes. Each vertex gets its position
 * (Quake units), texture s, t (in tiles of the texture) and lightmap s, t (0..1 across the atlas, at the surface's
 * `light_s`/`light_t`, so `GL_CreateSurfaceLightmap` must run first). Unless `gl_keeptjunctions` is on or the
 * surface is underwater, co-linear points are removed. Called at map load by `GL_BuildLightmaps` for each opaque
 * surface of `currentmodel`; does nothing when no model is current.
 *
 * @param {msurface_t} fa the surface; mutated: `polys` is replaced by one new glpoly_t (sky and turbulent
 * subdivisions are owned by the loader and are not rebuilt here)
 */
export function BuildSurfaceDisplayList( fa ) {

	if ( ! currentmodel ) return;

	const pedges = currentmodel.edges;
	const lnumverts = fa.numedges;

	// create glpoly_t equivalent
	const poly = {
		// One opaque BSP face is rebuilt, not appended. Sky/turb subdivisions
		// are owned by the loader and are skipped by GL_BuildLightmaps.
		next: null,
		flags: fa.flags,
		numverts: lnumverts,
		verts: new Float32Array( lnumverts * VERTEXSIZE ),
		chain: null
	};

	fa.polys = poly;

	for ( let i = 0; i < lnumverts; i ++ ) {

		const lindex = currentmodel.surfedges[ fa.firstedge + i ];
		let vec;

		if ( lindex > 0 ) {

			const r_pedge = pedges[ lindex ];
			vec = r_pcurrentvertbase[ r_pedge.v[ 0 ] ].position;

		} else {

			const r_pedge = pedges[ - lindex ];
			vec = r_pcurrentvertbase[ r_pedge.v[ 1 ] ].position;

		}

		// texture coordinates
		let s = DotProduct( vec, fa.texinfo.vecs[ 0 ] ) + fa.texinfo.vecs[ 0 ][ 3 ];
		s /= fa.texinfo.texture.width;

		let t = DotProduct( vec, fa.texinfo.vecs[ 1 ] ) + fa.texinfo.vecs[ 1 ][ 3 ];
		t /= fa.texinfo.texture.height;

		const vi = i * VERTEXSIZE;
		poly.verts[ vi + 0 ] = vec[ 0 ];
		poly.verts[ vi + 1 ] = vec[ 1 ];
		poly.verts[ vi + 2 ] = vec[ 2 ];
		poly.verts[ vi + 3 ] = s;
		poly.verts[ vi + 4 ] = t;

		// lightmap texture coordinates
		s = DotProduct( vec, fa.texinfo.vecs[ 0 ] ) + fa.texinfo.vecs[ 0 ][ 3 ];
		s -= fa.texturemins[ 0 ];
		s += fa.light_s * 16;
		s += 8;
		s /= BLOCK_WIDTH * 16;

		t = DotProduct( vec, fa.texinfo.vecs[ 1 ] ) + fa.texinfo.vecs[ 1 ][ 3 ];
		t -= fa.texturemins[ 1 ];
		t += fa.light_t * 16;
		t += 8;
		t /= BLOCK_HEIGHT * 16;

		poly.verts[ vi + 5 ] = s;
		poly.verts[ vi + 6 ] = t;

	}

	// remove co-linear points
	if ( ! gl_keeptjunctions.value && ! ( fa.flags & SURF_UNDERWATER ) ) {

		let numverts = poly.numverts;
		for ( let i = 0; i < numverts; i ++ ) {

			const prevIdx = ( ( i + numverts - 1 ) % numverts ) * VERTEXSIZE;
			const thisIdx = i * VERTEXSIZE;
			const nextIdx = ( ( i + 1 ) % numverts ) * VERTEXSIZE;

			// Use cached buffers to avoid per-iteration allocations (Golden Rule #4)
			const v1 = _colinear_v1;
			const v2 = _colinear_v2;

			v1[ 0 ] = poly.verts[ thisIdx + 0 ] - poly.verts[ prevIdx + 0 ];
			v1[ 1 ] = poly.verts[ thisIdx + 1 ] - poly.verts[ prevIdx + 1 ];
			v1[ 2 ] = poly.verts[ thisIdx + 2 ] - poly.verts[ prevIdx + 2 ];
			VectorNormalize( v1 );

			v2[ 0 ] = poly.verts[ nextIdx + 0 ] - poly.verts[ prevIdx + 0 ];
			v2[ 1 ] = poly.verts[ nextIdx + 1 ] - poly.verts[ prevIdx + 1 ];
			v2[ 2 ] = poly.verts[ nextIdx + 2 ] - poly.verts[ prevIdx + 2 ];
			VectorNormalize( v2 );

			const COLINEAR_EPSILON = 0.001;
			if ( ( Math.abs( v1[ 0 ] - v2[ 0 ] ) <= COLINEAR_EPSILON ) &&
				( Math.abs( v1[ 1 ] - v2[ 1 ] ) <= COLINEAR_EPSILON ) &&
				( Math.abs( v1[ 2 ] - v2[ 2 ] ) <= COLINEAR_EPSILON ) ) {

				// remove this vertex by shifting subsequent vertices
				for ( let j = i + 1; j < numverts; j ++ ) {

					for ( let k = 0; k < VERTEXSIZE; k ++ )
						poly.verts[ ( j - 1 ) * VERTEXSIZE + k ] = poly.verts[ j * VERTEXSIZE + k ];

				}

				numverts --;
				nColinElim ++;
				i --;

			}

		}

		poly.numverts = numverts;

	}

}

//============================================================================
// GL_CreateSurfaceLightmap
//============================================================================

/**
 * Places a surface's lightmap in an atlas and builds it (WinQuake gl_rsurf.c): allocates its block with
 * `AllocBlock`, records the atlas and position on the surface and fills the block with `R_BuildLightMap`. Sky and
 * turbulent surfaces have no lightmap and are skipped. Called at map load by `GL_BuildLightmaps` for every surface.
 *
 * @param {msurface_t} surf the surface; mutated: `lightmaptexturenum`, `light_s`, `light_t` (texels) and the
 * cached light values
 * @throws {Error} via `Sys_Error` from `AllocBlock` when the atlases are full
 */
export function GL_CreateSurfaceLightmap( surf ) {

	if ( surf.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) )
		return;

	const smax = ( surf.extents[ 0 ] >> 4 ) + 1;
	const tmax = ( surf.extents[ 1 ] >> 4 ) + 1;

	const outX = { value: 0 };
	const outY = { value: 0 };
	surf.lightmaptexturenum = AllocBlock( smax, tmax, outX, outY );
	surf.light_s = outX.value;
	surf.light_t = outY.value;

	const baseOffset = surf.lightmaptexturenum * lightmap_bytes * BLOCK_WIDTH * BLOCK_HEIGHT;
	const offset = baseOffset + ( surf.light_t * BLOCK_WIDTH + surf.light_s ) * lightmap_bytes;
	R_BuildLightMap( surf, lightmaps, offset, BLOCK_WIDTH * lightmap_bytes );

}

//============================================================================
// GL_BuildLightmaps
//
// Builds the lightmap texture with all the surfaces from all brush models.
// In Three.js, we create THREE.DataTexture objects for each lightmap atlas.
//============================================================================

export const lightmapTextures = []; // THREE.DataTexture array

// Original grayscale samples and the full native dynamic-light contribution.
// Keep a separate atlas: the enhanced draw can use coloured .lit samples and
// reduced baked dynamic light without contaminating the classic comparison.
const classicAtlases = new WeakMap();
const classicLightScratch = new Uint8Array( 18 * 18 );

/**
 * The Classic comparison pass's stand-in for a lightmap atlas: the grayscale copy kept by `R_ClassicLightmapsFrame`,
 * when there is one. Passed by `R_ClassicOn` (gl_rmain.js) to the Classic material conversion.
 *
 * @param {?THREE.Texture} texture an atlas from `lightmapTextures`, or any other texture
 * @returns {?THREE.Texture} its classic atlas, or `texture` itself when it has none
 */
export function R_ClassicLightmap( texture ) {

	return texture != null && classicAtlases.has( texture ) ? classicAtlases.get( texture ).texture : texture;

}

/**
 * Refreshes the classic atlases for this frame: original grayscale samples and the full native dynamic-light
 * contribution, kept in a separate atlas per lightmap so the enhanced draw can use coloured .lit samples and reduced
 * baked dynamic light without contaminating the classic comparison. A surface is rebuilt only when its light styles,
 * dynamic light or full-bright state changed; its `cached_light` and `cached_dlight` are restored afterwards so the
 * enhanced lightmaps still see the change. Called each frame by `R_ClassicOn` (gl_rmain.js) while the Classic pass
 * runs. A classic atlas is created on first use and disposed with its original atlas.
 *
 * @param {Array<?model_t>} [models] the models whose surfaces to refresh; defaults to `cl.model_precache` (or the
 * world model alone); null entries are skipped
 */
export function R_ClassicLightmapsFrame( models = cl.model_precache || [ cl.worldmodel ] ) {

	const touched = new Set(), seen = new Set();
	for ( const model of models ) {

		if ( ! model || ! model.surfaces ) continue;
		for ( const surf of model.surfaces ) {

			if ( ! surf || seen.has( surf ) || ( surf.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) ) continue;
			seen.add( surf );
			const original = lightmapTextures[ surf.lightmaptexturenum ];
			if ( ! original ) continue;
			let atlas = classicAtlases.get( original );
			if ( ! atlas ) {

				const data = new Uint8Array( BLOCK_WIDTH * BLOCK_HEIGHT * 4 );
				const texture = new THREE.DataTexture( data, BLOCK_WIDTH, BLOCK_HEIGHT );
				texture.minFilter = texture.magFilter = THREE.LinearFilter;
				texture.channel = 1; texture.flipY = false;
				atlas = { texture, surfaces: new WeakMap() };
				classicAtlases.set( original, atlas );
				original.addEventListener( 'dispose', () => { texture.dispose(); classicAtlases.delete( original ); } );

			}
			const dynamic = surf.dlightframe === r_framecount;
			const scales = Array.from( surf.styles, style => style === 255 ? 0 : d_lightstylevalue[ style ] );
			const old = atlas.surfaces.get( surf );
			const fullbright = r_fullbright.value !== 0 || ( cl.worldmodel != null && cl.worldmodel.lightdata == null );
			if ( old && old.fullbright === fullbright && ! dynamic && ! old.dynamic && scales.every( ( v, i ) => v === old.scales[ i ] ) ) continue;
			const cached = Array.from( surf.cached_light ), cachedDynamic = surf.cached_dlight;
			try {

				R_BuildLightMap( surf, classicLightScratch, 0, 18, 1 );

			} finally {

				surf.cached_light.set ? surf.cached_light.set( cached ) : cached.forEach( ( v, i ) => { surf.cached_light[ i ] = v; } );
				surf.cached_dlight = cachedDynamic;

			}
			const width = ( surf.extents[ 0 ] >> 4 ) + 1, height = ( surf.extents[ 1 ] >> 4 ) + 1;
			const data = atlas.texture.image.data;
			for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

				const p = ( ( surf.light_t + y ) * BLOCK_WIDTH + surf.light_s + x ) * 4;
				data[ p ] = data[ p + 1 ] = data[ p + 2 ] = 255 - classicLightScratch[ y * 18 + x ];
				data[ p + 3 ] = 255;

			}
			atlas.surfaces.set( surf, { scales, dynamic, fullbright } );
			touched.add( atlas.texture );

		}

	}
	for ( const texture of touched ) texture.needsUpdate = true;

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

	if ( ! worldGroup ) {

		worldGroup = new THREE.Group();
		worldGroup.name = 'quake_world';
		if ( scene ) scene.add( worldGroup );

	}

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

		worldGroup.add( batchedMesh );
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

	// Dispose old BatchedMesh objects
	for ( const batchedMesh of worldBatchedMeshes ) {

		if ( batchedMesh.parent ) batchedMesh.parent.remove( batchedMesh );
		batchedMesh.dispose();
		if ( batchedMesh.material ) batchedMesh.material.dispose();

	}

	worldBatchedMeshes.length = 0;
	worldAnimatedMeshes.length = 0;
	demonSurfaces.length = 0; demonEnabled = false;

	// Dispose any other children in worldGroup (water/sky meshes added dynamically)
	if ( worldGroup ) {

		while ( worldGroup.children.length > 0 ) {

			const child = worldGroup.children[ 0 ];
			worldGroup.remove( child );
			if ( child.geometry ) child.geometry.dispose();
			if ( child.material ) child.material.dispose();

		}

	}

	worldMeshesBuilt = false;

	// Clear PVS instance visibility info
	instanceVisInfo.length = 0;

	// Force visibility update on first frame after map load
	_visibilityNeedsUpdate = true;

	// Clear water/sky mesh caches
	for ( const mesh of _waterMeshesInScene ) {

		if ( mesh.parent ) mesh.parent.remove( mesh );

	}

	_waterMeshesInScene = new Set();
	_waterMeshesThisFrame = new Set();
	_waterMaterialCache.clear();

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

	// Reset sky materials so they pick up new sky textures
	if ( solidSkyMaterial ) { solidSkyMaterial.dispose(); solidSkyMaterial = null; }
	if ( alphaSkyMaterial ) { alphaSkyMaterial.dispose(); alphaSkyMaterial = null; }

	// Three.js materials do not own or dispose the textures they reference.
	for ( let i = 0; i < lightmapTextures.length; i ++ ) {

		const texture = lightmapTextures[ i ];
		if ( texture != null ) texture.dispose();

	}

	lightmapTextures.length = 0;

	// Each world starts with the original64-atlas policy; grow only when full.
	if(MAX_LIGHTMAPS!==BASE_LIGHTMAPS)resizeLightmapCapacity(BASE_LIGHTMAPS);
	// clear allocation
	for ( let i = 0; i < MAX_LIGHTMAPS; i ++ )
		allocated[ i ].fill( 0 );

	set_r_framecount( 1 ); // no dlightcache

	// set lightmap format -- use luminance (1 byte per texel)
	// (3 bytes, red green blue, when the level has coloured lightmaps and Newer Game is on)
	gl_lightmap_format = GL_LUMINANCE;
	lightmap_bytes = ( cl_ref.worldmodel != null && cl_ref.worldmodel.litdata != null && R_NewerGame() ) ? 3 : 1;

	// build lightmaps for all brush models
	const MAX_MODELS = 256;
	for ( let j = 1; j < MAX_MODELS; j ++ ) {

		const m = cl_ref.model_precache ? cl_ref.model_precache[ j ] : null;
		if ( ! m ) break;
		if ( m.name && m.name.charAt( 0 ) === '*' )
			continue;

		r_pcurrentvertbase = m.vertexes;
		currentmodel = m;

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

	// upload all lightmaps that were filled as Three.js DataTextures
	for ( let i = 0; i < MAX_LIGHTMAPS; i ++ ) {

		if ( ! allocated[ i ][ 0 ] )
			break; // no more used

		lightmap_modified[ i ] = false;
		lightmap_rectchange[ i ].l = BLOCK_WIDTH;
		lightmap_rectchange[ i ].t = BLOCK_HEIGHT;
		lightmap_rectchange[ i ].w = 0;
		lightmap_rectchange[ i ].h = 0;

		// Create Three.js DataTexture from lightmap data
		// R_BuildLightMap stores 255-brightness (Quake subtractive format).
		// Three.js lightMap is multiplicative, so invert to get brightness.
		// Use RGBA format — LuminanceFormat is not supported in WebGL 2.
		const offset = i * BLOCK_WIDTH * BLOCK_HEIGHT * lightmap_bytes;
		const pixelCount = BLOCK_WIDTH * BLOCK_HEIGHT;
		const data = new Uint8Array( pixelCount * 4 );
		for ( let p = 0; p < pixelCount; p ++ ) {

			if ( lightmap_bytes === 3 ) {

				data[ p * 4 ] = 255 - lightmaps[ offset + p * 3 ];
				data[ p * 4 + 1 ] = 255 - lightmaps[ offset + p * 3 + 1 ];
				data[ p * 4 + 2 ] = 255 - lightmaps[ offset + p * 3 + 2 ];

			} else {

				const val = 255 - lightmaps[ offset + p ];
				data[ p * 4 ] = val;
				data[ p * 4 + 1 ] = val;
				data[ p * 4 + 2 ] = val;

			}

			data[ p * 4 + 3 ] = 255;

		}

		const texture = new THREE.DataTexture(
			data,
			BLOCK_WIDTH,
			BLOCK_HEIGHT,
			THREE.RGBAFormat,
			THREE.UnsignedByteType
		);
		texture.minFilter = THREE.LinearFilter;
		texture.magFilter = THREE.LinearFilter;
		texture.flipY = false;
		texture.needsUpdate = true;

		lightmapTextures[ i ] = texture;

	}

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
