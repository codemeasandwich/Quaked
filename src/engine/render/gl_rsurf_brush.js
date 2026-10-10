/**
 * @module engine/render/gl_rsurf_brush
 *
 * Brush entities (card [44i], split from gl_rsurf.js): doors, lifts, buttons and the other inline models, each drawn
 * as a group of meshes kept on its entity, its surfaces merged by material, its lightmaps updated as they change,
 * with Newer Game's demon relief on its demon surfaces.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `brushEntityGroups`; 2 module-level collections (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `R_DrawBrushModel` draws one entity (gl_rmain.js's entity list); `R_BrushBeginFrame` takes last frame's groups out
 * of the scene (`R_DrawWorld`) and `R_BrushClear` throws them away at a map load (`GL_BuildLightmaps`).
 */
import * as THREE from 'three';
import { R_RockfieldChart, R_RockfieldGeometry, R_RockfieldBrushSeen } from '../common/hooks.js'; // installed by newer/render/r_rockfield.js
import { R_NewerGame, r_newer_normals, r_newer_textures } from '../common/hooks.js'; // installed by newer/mode.js
import { R_ArchModelHidden } from '../common/hooks.js'; // installed by newer/render/r_archframe.js
import { DEMON_TEXTURES, R_DemonSurfaceData } from '../common/hooks.js'; // installed by newer/render/r_demonrelief.js
import { cl, cl_dlights, MAX_DLIGHTS } from '../client/client.js';
import { R_PortalsActive, R_BoxInPortalReceiver } from '../common/hooks.js'; // installed by newer/render/gl_portal.js
import { R_MarkLights } from './gl_rlight.js';
import { r_refdef } from './render.js';
import { SURF_PLANEBACK, SURF_DRAWSKY, SURF_DRAWTURB, r_visframecount, r_framecount, gl_flashblend, R_CullBox, scene } from './gl_rmain.js';
import { VectorAdd } from '../common/mathlib.js';
import { Mod_PointInLeaf } from './gl_model.js';
import { R_BlendLightmaps, lightmapTextures } from './gl_rsurf_lightmaps.js';
import { createQuakeLightmapMaterial, R_TextureAnimation, _mergeGLPolys } from './gl_rsurf_materials.js';
import { R_RenderDynamicLightmaps } from './gl_rsurf_world.js';

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
export function R_BrushClear() {

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
export function R_BrushBeginFrame() {

	// Remove brush entity groups from scene (don't dispose - they're cached on entities)
	for ( let i = 0; i < brushEntityGroups.length; i ++ ) {

		const group = brushEntityGroups[ i ];
		if ( group.parent ) group.parent.remove( group );

	}

	brushEntityGroups.length = 0;

}
