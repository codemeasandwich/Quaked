/**
 * @module engine/render/gl_rsurf_batches
 *
 * The world's cached meshes and what is visible of them (card [44i], split from gl_rsurf.js): one batched mesh per
 * texture and lightmap atlas built at a map load, each leaf's surfaces an instance shown when the leaf is in the
 * potentially visible set; the leaf marking that sets it, the animated textures within the batches, Newer Game's
 * demon relief surfaces and the sun's occluder.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `_visibilityNeedsUpdate`, `worldMeshesBuilt`, `demonEnabled`,
 * `_markleaves_solid`, `_lastMarkedPostActive`, `_lastPortalRevision`, `archVisibilityKey`, `occluderRevision`.
 *
 * Errors: throws at 1 place; catches at 1 place.
 *
 * `R_BuildWorldMeshes` builds the batches (`GL_BuildLightmaps`, after the lightmaps are uploaded), `R_MarkLeaves`
 * marks the visible leaves each frame and `R_UpdateWorldVisibility` shows their instances (`R_DrawWorld`);
 * `R_WorldBatchesClear` throws the batches away at the next map load.
 */
import * as THREE from 'three';
import { R_RockfieldBuild, R_RockfieldGeometry } from '../common/hooks.js'; // installed by newer/render/r_rockfield.js
import { R_NewerGame, r_newer_normals, r_newer_textures } from '../common/hooks.js'; // installed by newer/mode.js
import { R_ArchSurfaceHidden, R_ArchHiddenRevision, R_HasArchHidden } from '../common/hooks.js'; // installed by newer/render/r_archframe.js
import { DEMON_TEXTURES, R_DemonSurfaceData } from '../common/hooks.js'; // installed by newer/render/r_demonrelief.js
import { R_DemonBakePrepare, R_DemonBakeSurface, R_DemonBakeStatus } from '../common/hooks.js'; // installed by newer/assets/r_demonbakes.js
import { cl } from '../client/client.js';
import { R_BuildSunOccluder, R_PostActive, R_WaterActive, R_GetLiquidLinks } from '../common/hooks.js'; // installed by newer/render/gl_post.js
import { R_GetPortals, R_PortalsActive, R_PortalsVisRevision } from '../common/hooks.js'; // installed by newer/render/gl_portal.js
import { SURF_PLANEBACK, SURF_DRAWSKY, SURF_DRAWTURB, r_visframecount, mirror, r_novis, r_viewleaf, r_oldviewleaf, inc_r_visframecount, set_r_oldviewleaf } from './gl_rmain.js';
import { Mod_LeafPVS } from './gl_model.js';
import { worldState, R_EnsureWorldGroup } from './gl_rsurf_state.js';
import { lightmapTextures } from './gl_rsurf_lightmaps.js';
import { createQuakeLightmapMaterial, R_TextureAnimation, R_UpdateAnimatedMaterial, DrawGLPoly } from './gl_rsurf_materials.js';

// Flag to track if PVS changed and visibility needs update
let _visibilityNeedsUpdate = true;

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
/**
 * Keeps Newer Game's raised demon-relief surfaces in step (`R_DrawWorld`, each frame): with Newer Game, normals and
 * textures on, each demon surface gets a displaced mesh, from its prepared bake or made at run time, shown where its
 * leaves are visible; otherwise the meshes are hidden and the flat native surfaces show. A surface whose height
 * field or bake changed has its mesh rebuilt; one whose bake is still loading waits. Rebuilds the sun's occluder
 * whenever the set of meshes changes.
 */
export function R_UpdateDemonSurfaces() {

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

//============================================================================
// R_MarkLeaves
//============================================================================

// Cached buffer for r_novis solid visibility (matches C's static byte solid[4096])
let _markleaves_solid = new Uint8Array( 4096 );
let _lastMarkedPostActive = false;
let _lastPortalRevision = 0;

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
	// a window following a teleport train sees from another leaf: what it sees has to be marked (card [END1])
	const portalRevision = R_PortalsVisRevision();
	const portalsMoved = portalRevision !== _lastPortalRevision;
	_lastPortalRevision = portalRevision;

	if ( r_oldviewleaf === r_viewleaf && ! r_novis.value && ! modeChanged && ! portalsMoved ) {

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
export function R_WorldBatchesClear() {

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

/**
 * Builds the world's cached meshes at a map load (`GL_BuildLightmaps`, after the lightmaps are uploaded): each
 * lit world surface (not sky or liquid) goes into a batched mesh for its texture and lightmap atlas (rock-field
 * surfaces apart), one instance per surface with every leaf that holds it, so `R_UpdateWorldVisibility` can show it
 * when any of those leaves is visible. Records the demon-relief surfaces and the batches whose texture animates, and
 * prepares the rock field. Does nothing without a world model.
 */
export function R_BuildWorldMeshes() {

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

/**
 * Moves each world batch whose texture animates to its current frame (`R_DrawWorld`, each frame; the world entity's
 * frame is 0).
 */
export function R_UpdateWorldTextureAnimations() {

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
/**
 * Rebuilds the sun's shadow-casting geometry for `model` (the post pipeline's `R_BuildSunOccluder`), noting the arch
 * revision it was built for. Called at a map load and whenever the demon relief or the hidden arch surfaces change.
 *
 * @param {model_t} model the world model
 * @returns {*} what `R_BuildSunOccluder` returns
 */
export function R_BuildWorldOccluder( model ) { occluderRevision = R_ArchHiddenRevision(); return R_BuildSunOccluder( model ); }
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
/**
 * Shows the world's batch instances whose leaves are visible this frame (`R_DrawWorld`, after `R_MarkLeaves`) and
 * hides the rest, and those Newer Game's arch hides. Works only when the visible set, the arch or the mode changed;
 * rebuilds the sun's occluder first when the hidden arch surfaces changed.
 */
export function R_UpdateWorldVisibility() {
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
