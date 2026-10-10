/**
 * @module engine/render/gl_mesh
 *
 * Alias model meshes (WinQuake gl_mesh.c): a model frame's triangles turned into a Three.js mesh, with in-between
 * poses in Newer Game.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `aliasmodel`, `paliashdr`, `numcommands`, `numorder`, `allverts`,
 * `alltris`, `stripcount`, `triangles`, `stverts`, `pheader`, `poseverts`, `_poseInterval`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
import { R_AliasMeshLookup, R_AliasMeshRemember } from '../common/hooks.js'; // installed by newer/assets/r_aliasmeshcache.js
// Ported from: WinQuake/gl_mesh.c -- triangle model functions (alias models)

import * as THREE from 'three';
import { R_WeaponAsset, R_WeaponRotorFrame } from '../common/hooks.js'; // installed by newer/render/r_weapons.js
import { R_NewerAliasMaterial, R_EnemyAliasMaterial, R_AssetAliasMaterial } from '../common/hooks.js'; // installed by newer/render/r_newerskins.js
import { R_AnimEnabled, R_AliasPoseBlend, R_BlendArrays } from '../common/hooks.js'; // installed by newer/render/r_anim.js
import { ANIM_STEP } from '../common/quakedef.js';
import { Con_Printf, Con_DPrintf } from '../common/common.js';
import { cl } from '../client/client.js';
import { R_GetPlayerSkinTexture } from './gl_rmisc.js';
import { gl_nocolors } from './glquake.js';
import { r_avertexnormals } from '../common/anorm_dots.js';

/*
=================================================================

ALIAS MODEL DISPLAY LIST GENERATION

=================================================================
*/

let aliasmodel = null; // model_t *
let paliashdr = null; // aliashdr_t *

const used = new Uint8Array( 8192 );

// the command list holds counts and s/t values that are valid for
// every frame
const commands = new Int32Array( 8192 );
let numcommands = 0;

// all frames will have their vertexes rearranged and expanded
// so they are in the order expected by the command list
const vertexorder = new Int32Array( 8192 );
let numorder = 0;

let allverts = 0;
let alltris = 0;

const stripverts = new Int32Array( 128 );
const striptris = new Int32Array( 128 );
let stripcount = 0;

// References to model data set during BuildTris
let triangles = null; // mtriangle_t[]
let stverts = null; // stvert_t[]
let pheader = null; // aliashdr_t (same as paliashdr)
let poseverts = null; // trivertx_t[][]

// r_avertexnormals is imported from anorm_dots.js to avoid circular dependency

/*
================
StripLength
================
*/
function StripLength( starttri, startv ) {

	used[ starttri ] = 2;

	const last = triangles[ starttri ];

	stripverts[ 0 ] = last.vertindex[ ( startv ) % 3 ];
	stripverts[ 1 ] = last.vertindex[ ( startv + 1 ) % 3 ];
	stripverts[ 2 ] = last.vertindex[ ( startv + 2 ) % 3 ];

	striptris[ 0 ] = starttri;
	stripcount = 1;

	let m1 = last.vertindex[ ( startv + 2 ) % 3 ];
	let m2 = last.vertindex[ ( startv + 1 ) % 3 ];

	// look for a matching triangle
	let found = true;
	while ( found ) {

		found = false;
		for ( let j = starttri + 1; j < pheader.numtris; j ++ ) {

			const check = triangles[ j ];

			if ( check.facesfront !== last.facesfront )
				continue;
			for ( let k = 0; k < 3; k ++ ) {

				if ( check.vertindex[ k ] !== m1 )
					continue;
				if ( check.vertindex[ ( k + 1 ) % 3 ] !== m2 )
					continue;

				// this is the next part of the fan

				// if we can't use this triangle, this tristrip is done
				if ( used[ j ] )
					break;

				// the new edge
				if ( stripcount & 1 )
					m2 = check.vertindex[ ( k + 2 ) % 3 ];
				else
					m1 = check.vertindex[ ( k + 2 ) % 3 ];

				stripverts[ stripcount + 2 ] = check.vertindex[ ( k + 2 ) % 3 ];
				striptris[ stripcount ] = j;
				stripcount ++;

				used[ j ] = 2;
				found = true;
				break;

			}

			if ( found ) break;

		}

	}

	// clear the temp used flags
	for ( let j = starttri + 1; j < pheader.numtris; j ++ )
		if ( used[ j ] === 2 )
			used[ j ] = 0;

	return stripcount;

}

/*
===========
FanLength
===========
*/
function FanLength( starttri, startv ) {

	used[ starttri ] = 2;

	const last = triangles[ starttri ];

	stripverts[ 0 ] = last.vertindex[ ( startv ) % 3 ];
	stripverts[ 1 ] = last.vertindex[ ( startv + 1 ) % 3 ];
	stripverts[ 2 ] = last.vertindex[ ( startv + 2 ) % 3 ];

	striptris[ 0 ] = starttri;
	stripcount = 1;

	const m1 = last.vertindex[ ( startv + 0 ) % 3 ];
	let m2 = last.vertindex[ ( startv + 2 ) % 3 ];

	// look for a matching triangle
	let found = true;
	while ( found ) {

		found = false;
		for ( let j = starttri + 1; j < pheader.numtris; j ++ ) {

			const check = triangles[ j ];

			if ( check.facesfront !== last.facesfront )
				continue;
			for ( let k = 0; k < 3; k ++ ) {

				if ( check.vertindex[ k ] !== m1 )
					continue;
				if ( check.vertindex[ ( k + 1 ) % 3 ] !== m2 )
					continue;

				// this is the next part of the fan

				// if we can't use this triangle, this tristrip is done
				if ( used[ j ] )
					break;

				// the new edge
				m2 = check.vertindex[ ( k + 2 ) % 3 ];

				stripverts[ stripcount + 2 ] = m2;
				striptris[ stripcount ] = j;
				stripcount ++;

				used[ j ] = 2;
				found = true;
				break;

			}

			if ( found ) break;

		}

	}

	// clear the temp used flags
	for ( let j = starttri + 1; j < pheader.numtris; j ++ )
		if ( used[ j ] === 2 )
			used[ j ] = 0;

	return stripcount;

}

/*
================
BuildTris
================
*/
/**
 * Generates a list of trifans or strips for the model, which holds for all frames (WinQuake gl_mesh.c). For each
 * unused triangle it tries a fan and a strip from each of its three vertices and keeps the longest. Called by
 * `GL_MakeAliasModelDisplayLists` when the prepared-mesh hook (`R_AliasMeshLookup`) has no stored result; it reads
 * the header, triangles and s/t vertices that function sets in module state, so it must not be called on its own
 * before that.
 *
 * Output is left in module buffers that the next model overwrites: `commands` (per strip/fan a vertex count,
 * positive for a strip and negative for a fan, then each vertex's s and t as float bits in texture space 0..1 with a
 * half-texel offset and back-side seam vertices moved half a skin across; a 0 ends the list) and `vertexorder` (the
 * pose vertex index for each command vertex). Adds to the running `allverts`/`alltris` totals and prints the counts
 * with `Con_DPrintf`.
 */
export function BuildTris() {

	const bestverts = new Int32Array( 1024 );
	const besttris = new Int32Array( 1024 );

	//
	// build tristrips
	//
	numorder = 0;
	numcommands = 0;
	used.fill( 0 );

	for ( let i = 0; i < pheader.numtris; i ++ ) {

		// pick an unused triangle and start the trifan
		if ( used[ i ] )
			continue;

		let bestlen = 0;
		let besttype = 0;

		for ( let type = 0; type < 2; type ++ ) {

			for ( let startv = 0; startv < 3; startv ++ ) {

				let len;
				if ( type === 1 )
					len = StripLength( i, startv );
				else
					len = FanLength( i, startv );
				if ( len > bestlen ) {

					besttype = type;
					bestlen = len;
					for ( let j = 0; j < bestlen + 2; j ++ )
						bestverts[ j ] = stripverts[ j ];
					for ( let j = 0; j < bestlen; j ++ )
						besttris[ j ] = striptris[ j ];

				}

			}

		}

		// mark the tris on the best strip as used
		for ( let j = 0; j < bestlen; j ++ )
			used[ besttris[ j ] ] = 1;

		if ( besttype === 1 )
			commands[ numcommands ++ ] = ( bestlen + 2 );
		else
			commands[ numcommands ++ ] = - ( bestlen + 2 );

		for ( let j = 0; j < bestlen + 2; j ++ ) {

			// emit a vertex into the reorder buffer
			const k = bestverts[ j ];
			vertexorder[ numorder ++ ] = k;

			// emit s/t coords into the commands stream
			let s = stverts[ k ].s;
			let t = stverts[ k ].t;
			if ( ! triangles[ besttris[ 0 ] ].facesfront && stverts[ k ].onseam )
				s += pheader.skinwidth / 2; // on back side
			s = ( s + 0.5 ) / pheader.skinwidth;
			t = ( t + 0.5 ) / pheader.skinheight;

			// Store float as int bits (mimicking *(float *)&commands)
			const floatBuf = new Float32Array( 1 );
			floatBuf[ 0 ] = s;
			const intView = new Int32Array( floatBuf.buffer );
			commands[ numcommands ++ ] = intView[ 0 ];
			floatBuf[ 0 ] = t;
			commands[ numcommands ++ ] = intView[ 0 ];

		}

	}

	commands[ numcommands ++ ] = 0; // end of list marker

	Con_DPrintf( '%d tri %d vert %d cmd\n', pheader.numtris, numorder, numcommands );

	allverts += numorder;
	alltris += pheader.numtris;

}

/*
================
GL_MakeAliasModelDisplayLists
================
*/
/**
 * Prepares an alias model's draw data once, when the model loads (from `Mod_LoadAliasModel` in gl_model.js, through
 * its own `GL_MakeAliasModelDisplayLists` wrapper). As in WinQuake it builds the strip/fan command list
 * (`BuildTris`, or the stored result from the `R_AliasMeshLookup` hook, with a new result kept through
 * `R_AliasMeshRemember`); in Three.js the indexed BufferGeometry is built from it later by `GL_DrawAliasFrame`,
 * instead of GL command lists. Prints `meshing <name>...`.
 *
 * Mutates `hdr`, which keeps the results as long as the model stays cached: `poseverts_count`, `meshVertexOrder`
 * (copy of the vertex order; an immutable offline record, never pose data), `commands` (copy of the command list)
 * and `posedata` (per pose, the trivertx_t vertices rearranged and expanded into command-list order).
 *
 * @param {model_t} m the alias model being loaded (its `name` is printed)
 * @param {aliashdr_t} hdr its header, with `triangles`, `stverts`, `poseverts`, `numtris`, `numposes`, `skinwidth`
 *   and `skinheight` already filled in
 */
export function GL_MakeAliasModelDisplayLists( m, hdr ) {

	aliasmodel = m;
	paliashdr = hdr;
	pheader = hdr;
	triangles = hdr.triangles;
	stverts = hdr.stverts;
	poseverts = hdr.poseverts;

	// Build command lists from scratch
	Con_Printf( 'meshing %s...\n', m.name );
	const prepared=R_AliasMeshLookup(hdr);
	if(prepared){
	 numorder=prepared.order.length;numcommands=prepared.commands.length;
	 vertexorder.set(prepared.order);commands.set(prepared.commands);allverts+=numorder;alltris+=pheader.numtris;
	}else{BuildTris();R_AliasMeshRemember(hdr,commands.subarray(0,numcommands),vertexorder.subarray(0,numorder));}

	// save the data out
	paliashdr.poseverts_count = numorder;
	paliashdr.meshVertexOrder = vertexorder.slice(0,numorder); // immutable offline record, never pose data

	// Copy commands
	paliashdr.commands = new Int32Array( numcommands );
	paliashdr.commands.set( commands.subarray( 0, numcommands ) );

	// Copy reordered pose vertices
	paliashdr.posedata = [];
	for ( let i = 0; i < paliashdr.numposes; i ++ ) {

		const frameVerts = [];
		for ( let j = 0; j < numorder; j ++ ) {

			frameVerts.push( poseverts[ i ][ vertexorder[ j ] ] );

		}

		paliashdr.posedata.push( frameVerts );

	}

}

/*
================
GL_DrawAliasFrame
================
*/

// Shared buffers for int-to-float bit casting
const _castIntBuf = new Int32Array( 1 );
const _castFloatView = new Float32Array( _castIntBuf.buffer );

/**
 * Builds the Three.js geometry of a single pose of an alias model. Uses the command list to reconstruct triangle
 * strips/fans into indexed triangles (winding inverted for correct backface culling), with positions decoded from the
 * compressed vertices (`v * scale + scale_origin`, model space, Quake units) and normals from the MDL normal table.
 *
 * Caches the geometry template (positions, UVs, indices, normals, lightnormalindices) per (paliashdr, posenum) in
 * `paliashdr._geoCache` to avoid recomputation every frame; the template has no colour, since vertex colours are
 * per entity and updated in place from a pre-allocated buffer by `R_DrawAliasModel`. The cache lives as long as the
 * header. Called by `R_DrawAliasModel`, the shadow functions and Newer Game effects that need a pose's vertices.
 *
 * @param {aliashdr_t} paliashdr header prepared by `GL_MakeAliasModelDisplayLists`
 * @param {number} posenum pose index, 0..`numposes`-1
 * @returns {?{ posAttr: THREE.BufferAttribute, normalAttr: THREE.BufferAttribute, uvAttr: THREE.BufferAttribute,
 *   indices: Array<number>, lightnormalindices: Array<number>, vertexCount: number }} the shared template (do not
 *   modify its arrays), or null when the header has no such pose
 */
export function GL_DrawAliasFrame( paliashdr, posenum ) {

	const verts = paliashdr.posedata[ posenum ];
	if ( ! verts ) return null;

	// Check geometry template cache
	if ( ! paliashdr._geoCache ) paliashdr._geoCache = new Map();

	let cached = paliashdr._geoCache.get( posenum );

	if ( cached == null ) {

		// Build geometry template for this pose (done once, cached)
		const cmds = paliashdr.commands;
		const positions = [];
		const normals = [];
		const uvs = [];
		const indices = [];
		const lightnormalindices = [];

		let cmdIndex = 0;
		let vertexCount = 0;

		while ( true ) {

			let count = cmds[ cmdIndex ++ ];
			if ( count === 0 )
				break;

			const isStrip = count > 0;
			if ( count < 0 )
				count = - count;

			const firstVertex = vertexCount;

			// Read all vertices for this strip/fan
			for ( let i = 0; i < count; i ++ ) {

				// Read s/t from command stream (stored as int bits of float)
				_castIntBuf[ 0 ] = cmds[ cmdIndex ++ ];
				const s = _castFloatView[ 0 ];
				_castIntBuf[ 0 ] = cmds[ cmdIndex ++ ];
				const t = _castFloatView[ 0 ];

				const vert = verts[ vertexCount - firstVertex + firstVertex ];
				if ( vert ) {

					const x = vert.v[ 0 ] * paliashdr.scale[ 0 ] + paliashdr.scale_origin[ 0 ];
					const y = vert.v[ 1 ] * paliashdr.scale[ 1 ] + paliashdr.scale_origin[ 1 ];
					const z = vert.v[ 2 ] * paliashdr.scale[ 2 ] + paliashdr.scale_origin[ 2 ];

					positions.push( x, y, z );
					uvs.push( s, t );
					lightnormalindices.push( vert.lightnormalindex );

					// Look up pre-baked normal from MDL file's normal table
					const normalIndex = vert.lightnormalindex;
					const n = r_avertexnormals[ normalIndex ] || r_avertexnormals[ 0 ];
					normals.push( n[ 0 ], n[ 1 ], n[ 2 ] );

				} else {

					positions.push( 0, 0, 0 );
					uvs.push( s, t );
					lightnormalindices.push( 0 );
					normals.push( 0, 0, 1 ); // Default normal

				}

				vertexCount ++;

			}

			// Generate triangle indices from strip or fan (inverted winding for correct backface culling)
			if ( isStrip ) {

				for ( let i = 2; i < count; i ++ ) {

					if ( i & 1 ) {

						indices.push( firstVertex + i - 1, firstVertex + i, firstVertex + i - 2 );

					} else {

						indices.push( firstVertex + i - 2, firstVertex + i, firstVertex + i - 1 );

					}

				}

			} else {

				for ( let i = 2; i < count; i ++ ) {

					indices.push( firstVertex, firstVertex + i, firstVertex + i - 1 );

				}

			}

		}

		// Build shared BufferAttributes for the template (no color — color is per-entity)
		const posAttr = new THREE.BufferAttribute( new Float32Array( positions ), 3 );
		const normalAttr = new THREE.BufferAttribute( new Float32Array( normals ), 3 );
		const uvAttr = new THREE.BufferAttribute( new Float32Array( uvs ), 2 );

		cached = {
			posAttr,
			normalAttr,
			uvAttr,
			indices,
			lightnormalindices,
			vertexCount
		};
		paliashdr._geoCache.set( posenum, cached );

	}

	return cached;

}

/*
================
GL_ClearAliasCache
================
*/
/**
 * Meant to clear all cached alias model geometries on map change; currently does nothing, and nothing calls it. The
 * caches are stored on paliashdr objects, which are replaced on map load, so they are garbage collected
 * automatically; this function exists as a hook if explicit cleanup is ever needed.
 */
export function GL_ClearAliasCache() {

	// Caches are stored on paliashdr objects which are replaced on map load,
	// so they are garbage collected automatically. This function exists
	// as a hook if explicit cleanup is ever needed.

}

/*
=================
R_SetupAliasFrame

Determine which pose to render for the given entity and alias model header.
=================
*/
// how long the pose chosen by R_SetupAliasFrame lasts
let _poseInterval = ANIM_STEP;

function R_SetupAliasFrame( entity, paliashdr ) {

	let posenum = 0;
	if ( entity && entity.frame !== undefined ) {

		let frame = entity.frame;
		if ( frame >= paliashdr.numframes || frame < 0 ) {

			Con_DPrintf( 'R_AliasSetupFrame: no such frame ' + frame + '\n' );
			frame = 0;

		}

		_poseInterval = ANIM_STEP;

		if ( paliashdr.frames && paliashdr.frames[ frame ] ) {

			const frameInfo = paliashdr.frames[ frame ];
			posenum = frameInfo.firstpose;
			const numposes = frameInfo.numposes;

			if ( numposes > 1 ) {

				const interval = frameInfo.interval;
				const time = cl ? cl.time : 0;
				posenum += ( ( time / interval ) | 0 ) % numposes;
				_poseInterval = interval;

			}

		} else {

			posenum = frame;

		}

		if ( posenum >= paliashdr.numposes )
			posenum = 0;

	}

	return posenum;

}

/*
=================
R_GetAliasMaterial

Get or create a cached material for the given alias model skin.
Materials are cached per (paliashdr, skinnum, hasLighting) to avoid
per-frame material creation and shader compilation.
=================
*/
function R_GetAliasMaterial( paliashdr, entity, hasLighting, playerSkinTexture ) {

	// Player skin textures are per-entity, not cached on the model
	if ( playerSkinTexture != null ) {

		// Cache the player material on the entity to avoid per-frame creation
		if ( entity._playerMaterial == null || entity._playerSkinTexture !== playerSkinTexture ) {

			if ( entity._playerMaterial != null ) {

				entity._playerMaterial.dispose();

			}

			entity._playerMaterial = R_AssetAliasMaterial({diffuse:playerSkinTexture},'native-player');
   entity._playerMaterial.vertexColors=hasLighting;
			entity._playerSkinTexture = playerSkinTexture;

		}

		return entity._playerMaterial;

	}

	if ( ! paliashdr._materialCache ) paliashdr._materialCache = new Map();

	const skinnum = entity && entity.skinnum ? entity.skinnum : 0;

	// Newer Game: the custom replacement skin for this monster, once it has loaded
	if ( entity != null && entity.model != null ) {

		const replacement = R_NewerAliasMaterial( entity, entity.model.name, hasLighting, skinnum );
		if ( replacement !== null ) return replacement;

	}

	// Animated skins cycle through frames 0-3 every 0.1 seconds
	// Original: anim = (int)(cl.time*10) & 3
	const anim = cl && cl.time ? ( Math.floor( cl.time * 10 ) & 3 ) : 0;

	// Cache key includes animation frame for animated skins
	const cacheKey = skinnum * 8 + anim * 2 + ( hasLighting ? 1 : 0 );

	let material = paliashdr._materialCache.get( cacheKey );
	let texture = null;
	if ( paliashdr.gl_texturenum ) {

		const skinGroup = paliashdr.gl_texturenum[ skinnum ] || paliashdr.gl_texturenum[ 0 ];
		if ( skinGroup ) {

			// Select animated frame if skin group is an array
			texture = Array.isArray( skinGroup ) ? ( skinGroup[ anim ] || skinGroup[ 0 ] ) : skinGroup;

		}

	}

	if ( texture && entity != null && entity.model != null ) {

		const detailed = R_EnemyAliasMaterial( texture, entity.model.name, hasLighting, skinnum, anim );
		if ( detailed !== null ) return detailed;

	}
	if ( material ) return material;

	if ( texture ) {

		material = R_AssetAliasMaterial({diffuse:texture},'native-alias');
  material.vertexColors=hasLighting;

	} else {

		material = R_AssetAliasMaterial({},'native-alias-colour');
  material.color.setHex(0xcccccc);material.vertexColors=hasLighting;

	}

	paliashdr._materialCache.set( cacheKey, material );
	return material;

}

// Reusable matrix objects for R_DrawAliasModel transform computation
const _aliasMat = new THREE.Matrix4();
const _aliasRZ = new THREE.Matrix4();
const _aliasRY = new THREE.Matrix4();
const _aliasRX = new THREE.Matrix4();
const _DEG2RAD = Math.PI / 180;

function weaponAliasFrame( weapon, header, pose ) {

	return weapon ? weapon.templates[ pose ] || weapon.templates[ 0 ] : GL_DrawAliasFrame( header, pose );

}

/*
=================
R_DrawAliasModel
=================
*/
/**
 * Builds and returns a Three.js Mesh for the given alias model entity, once per frame for each visible alias entity
 * (called by `R_DrawAliasModel` in gl_rmain.js, which adds the mesh to the scene, and by Newer Game views). Caches
 * geometry per (model, pose), materials per (model, skin), and reuses mesh objects per entity to minimize per-frame
 * allocations.
 *
 * Picks the pose from `entity.frame` and `cl.time` (frame groups), lets the Newer Game hooks swap in weapon assets,
 * rotor frames, replacement skins and blended in-between poses, sets per-vertex grey light from
 * `shadedots[lightnormalindex] * shadelight`, uses the player's colour-translated skin for client entities (unless
 * `gl_nocolors`), and positions the mesh at `entity.origin` rotated by `entity.angles` (degrees; pitch negated, as
 * in R_RotateForEntity). Resets `renderOrder` and `depthTest`, which the view model changes.
 *
 * Mutates `entity`: it keeps the mesh, geometry, colour buffer, current pose and blend state in `_alias*` fields
 * (and `_playerMaterial`) across frames, so the same entity_t must be passed each frame.
 *
 * @param {entity_t} entity entity to draw; must not be null (the per-entity caches are written unconditionally)
 * @param {aliashdr_t} paliashdr the model's header (`entity.model.cache.data`)
 * @param {?ArrayLike<number>} shadedots dot products per vertex normal index for the entity's yaw (a row of
 *   `r_avertexnormal_dots`); null for no lighting (colours are left as they are)
 * @param {number} [shadelight] light level already scaled down (gl_rmain.js divides by 200, so about 0..1.3, higher for
 *   glowing flames); with `shadedots`, enables vertex colours
 * @returns {?THREE.Mesh} the entity's mesh (the same object every frame), or null when the header has no pose data or
 *   the pose has no geometry
 */
export function R_DrawAliasModel( entity, paliashdr, shadedots, shadelight ) {

	if ( ! paliashdr || ! paliashdr.posedata )
		return null;

	const posenum = R_SetupAliasFrame( entity, paliashdr );
	const hasLighting = shadedots && shadelight !== undefined;

	// Get cached template (shared positions/normals/uvs/indices per model+pose)
	// (a skin the MDL does not have names another role: skin 1 of the one-skin g_shot.mdl is the basic shotgun's drop, card [12];
	// a mod's real second skin keeps its own art)
	const skin = entity?.skinnum | 0, weapon = R_WeaponAsset( entity?.model?.name, skin >= ( paliashdr.numskins || 1 ) ? skin : 0 );
	let template = weaponAliasFrame( weapon, paliashdr, posenum );
	if ( ! template )
		return null;

	// Extra frames: blend the pose being left with the one being entered
	let blend = null, poseBlend = null;
	if ( entity != null && R_AnimEnabled() ) {

		const state = R_AliasPoseBlend( entity, paliashdr, posenum, cl ? cl.time : 0, _poseInterval );
		poseBlend = state;
		if ( state.blend < 1 && state.from !== state.to ) {

			const from = weaponAliasFrame( weapon, paliashdr, state.from );
			if ( from != null && from.vertexCount === template.vertexCount ) {

				blend = { from, t: state.blend, lead: null };
				// a change that came early: start from the pose that was on screen (card [43]). At the first draw after the
				// change, what this entity last drew (its blended pose) is kept as the lead and the new blend leaves it, so
				// however many changes come early in a row the picture never jumps; not blended last draw, the lead is
				// rebuilt from the two poses R_AliasPoseBlend names
				if ( state.lead !== null && state.lead !== undefined ) {

					const n = template.vertexCount * 3;
					if ( entity._aliasLeadStart !== state.start || entity._aliasLeadPos == null || entity._aliasLeadPos.length !== n ) {

						if ( entity._aliasLeadPos == null || entity._aliasLeadPos.length !== n ) { entity._aliasLeadPos = new Float32Array( n ); entity._aliasLeadNormal = new Float32Array( n ); }
						if ( entity._aliasBlended === true && entity._aliasBlendPos != null && entity._aliasBlendPos.array.length === n ) {

							entity._aliasLeadPos.set( entity._aliasBlendPos.array ); entity._aliasLeadNormal.set( entity._aliasBlendNormal.array );

						} else {

							const a = weaponAliasFrame( weapon, paliashdr, state.lead.from ), b = weaponAliasFrame( weapon, paliashdr, state.lead.to );
							if ( a != null && b != null && a.vertexCount === template.vertexCount && b.vertexCount === template.vertexCount ) {

								R_BlendArrays( entity._aliasLeadPos, a.posAttr.array, b.posAttr.array, state.lead.t );
								R_BlendArrays( entity._aliasLeadNormal, a.normalAttr.array, b.normalAttr.array, state.lead.t );

							} else { entity._aliasLeadPos.set( from.posAttr.array ); entity._aliasLeadNormal.set( from.normalAttr.array ); }

						}
						entity._aliasLeadStart = state.start;

					}
					blend.lead = { pos: entity._aliasLeadPos, normal: entity._aliasLeadNormal };

				}

			}

		}

	}
	const rotorFrame = R_WeaponRotorFrame( weapon, entity, posenum, poseBlend, cl ? cl.time : 0 );
	if ( rotorFrame ) { template = rotorFrame; blend = null; }

	// Build or update per-entity geometry (shares template attributes, owns color buffer)
	let geometry = entity ? entity._aliasGeo : null;
	if ( geometry == null ) {

		geometry = new THREE.BufferGeometry();
		// Allocate per-entity color buffer (will be resized if needed)
		entity._aliasColorArray = new Float32Array( template.vertexCount * 3 );
		geometry.setAttribute( 'color', new THREE.BufferAttribute( entity._aliasColorArray, 3 ) );
		if ( entity != null ) entity._aliasGeo = geometry;

	}
	// An entity that owns a mesh in the scene but was not drawn natively in the Newer pass (a torch whose flame
	// the supplied effect draws, which keeps only its fire-base shadow) has its state put back by the title demo's
	// classic pass without a colour array, while the geometry the classic pass made stays: make the two agree.
	if ( entity._aliasColorArray == null ) {

		const kept = geometry.getAttribute( 'color' );
		if ( kept != null && kept.array.length >= template.vertexCount * 3 ) entity._aliasColorArray = kept.array; // (no new buffer each frame)
		else {

			entity._aliasColorArray = new Float32Array( template.vertexCount * 3 );
			geometry.setAttribute( 'color', new THREE.BufferAttribute( entity._aliasColorArray, 3 ) );

		}
		entity._aliasPosenum = undefined;

	}
	if ( rotorFrame ) geometry.boundingBox = geometry.boundingSphere = null;

	// When pose or model changes, swap to the new template's shared attributes
	// (`_aliasPart`: the caller draws only part of the model, as r_torchfire.js does for a torch's handle)
	if ( entity._aliasPosenum !== posenum || entity._aliasPaliashdr !== paliashdr || entity._aliasTemplate !== template || entity._aliasPartDrawn !== ( entity._aliasPart ?? null ) ) {

		if ( blend === null ) {

			geometry.setAttribute( 'position', template.posAttr );
			geometry.setAttribute( 'normal', template.normalAttr );

		}

		geometry.setAttribute( 'uv', template.uvAttr );
		geometry.setIndex( entity._aliasPart != null ? entity._aliasPart( template ) : template.indices );

		// Resize color buffer if vertex count changed between poses
		if ( entity._aliasColorArray.length < template.vertexCount * 3 ) {

			entity._aliasColorArray = new Float32Array( template.vertexCount * 3 );
			geometry.setAttribute( 'color', new THREE.BufferAttribute( entity._aliasColorArray, 3 ) );

		}

		entity._aliasPosenum = posenum;
		entity._aliasPaliashdr = paliashdr;
		entity._aliasTemplate = template;
		entity._aliasPartDrawn = entity._aliasPart ?? null;
		geometry.boundingBox = geometry.boundingSphere = null;

	}

	// A blended pose owns its positions and normals; leaving it goes back to the shared ones
	if ( blend !== null ) {

		const n = template.vertexCount * 3;
		if ( entity._aliasBlendPos == null || entity._aliasBlendPos.array.length !== n ) {

			entity._aliasBlendPos = new THREE.BufferAttribute( new Float32Array( n ), 3 );
			entity._aliasBlendNormal = new THREE.BufferAttribute( new Float32Array( n ), 3 );

		}

		if ( blend.lead !== null ) {

			R_BlendArrays( entity._aliasBlendPos.array, blend.lead.pos, template.posAttr.array, blend.t );
			R_BlendArrays( entity._aliasBlendNormal.array, blend.lead.normal, template.normalAttr.array, blend.t );

		} else {

			R_BlendArrays( entity._aliasBlendPos.array, blend.from.posAttr.array, template.posAttr.array, blend.t );
			R_BlendArrays( entity._aliasBlendNormal.array, blend.from.normalAttr.array, template.normalAttr.array, blend.t );

		}
		entity._aliasBlendPos.needsUpdate = true;
		entity._aliasBlendNormal.needsUpdate = true;

		geometry.setAttribute( 'position', entity._aliasBlendPos );
		geometry.setAttribute( 'normal', entity._aliasBlendNormal );
		entity._aliasBlended = true;

	} else if ( entity._aliasBlended === true ) {

		geometry.setAttribute( 'position', template.posAttr );
		geometry.setAttribute( 'normal', template.normalAttr );
		entity._aliasBlended = false;
		entity._aliasPosenum = posenum;

	}

	// Update per-entity vertex colors from lighting data
	if ( hasLighting ) {

		const colorArr = entity._aliasColorArray;
		const lni = template.lightnormalindices;
		for ( let i = 0; i < template.vertexCount; i ++ ) {

			const l = shadedots[ lni[ i ] ] * shadelight;
			colorArr[ i * 3 ] = l;
			colorArr[ i * 3 + 1 ] = l;
			colorArr[ i * 3 + 2 ] = l;

		}

		geometry.attributes.color.needsUpdate = true;

	}

	// Check if this is a player entity with custom colors
	let playerSkinTexture = null;
	if ( entity != null && entity.colormap != null && gl_nocolors.value === 0 ) {

		// Use stored entity index (equivalent to C pointer arithmetic: i = currententity - cl_entities)
		const entIdx = entity._entityIndex;
		if ( entIdx !== undefined && entIdx >= 1 && cl != null && entIdx <= cl.maxclients ) {

			playerSkinTexture = R_GetPlayerSkinTexture( entIdx - 1 );

		}

	}

	// Get cached material
	const material = weapon ? weapon.material : R_GetAliasMaterial( paliashdr, entity, hasLighting, playerSkinTexture );
	if ( weapon && material._quakeNativeSkin ) {

		const original = R_GetAliasMaterial( paliashdr, entity, hasLighting, playerSkinTexture ).map;
		material._quakeNativeSkin.texture.value = original;
		material._quakeNativeSkin.ready.value = original ? 1 : 0;

	}

	// Get or create mesh for this entity
	let mesh = entity ? entity._aliasMesh : null;
	if ( mesh == null ) {

		mesh = new THREE.Mesh( geometry, material );
		if ( entity != null ) entity._aliasMesh = mesh;

	} else {

		// Reuse existing mesh, update geometry and material if changed
		if ( mesh.geometry !== geometry ) mesh.geometry = geometry;
		if ( mesh.material !== material ) mesh.material = material;

	}

	// Apply entity transform — R_RotateForEntity equivalent
	if ( entity ) {

		if ( entity.origin ) {

			mesh.position.set(
				entity.origin[ 0 ],
				entity.origin[ 1 ],
				entity.origin[ 2 ]
			);

		}

		if ( entity.angles ) {

			const yaw = entity.angles[ 1 ] * _DEG2RAD;
			const pitch = - entity.angles[ 0 ] * _DEG2RAD;
			const roll = entity.angles[ 2 ] * _DEG2RAD;

			_aliasMat.identity();
			_aliasRZ.makeRotationZ( yaw );
			_aliasRY.makeRotationY( pitch );
			_aliasRX.makeRotationX( roll );
			_aliasMat.multiply( _aliasRZ ).multiply( _aliasRY ).multiply( _aliasRX );
			mesh.setRotationFromMatrix( _aliasMat );

		}

	}

	// Reset render overrides (viewmodel sets these)
	mesh.renderOrder = 0;
	if ( mesh.material.depthTest === false ) {

		// Clone material for weapon so it doesn't affect shared material
		// (Only needed when transitioning away from weapon rendering)
		mesh.material.depthTest = true;

	}

	return mesh;

}

/*
=============
GL_DrawAliasShadow
=============
*/

// Shared shadow material (Golden Rule #4 — one for all entities)
const _shadowMaterial = new THREE.MeshBasicMaterial( {
	color: 0x000000,
	transparent: true,
	opacity: 0.5,
	depthWrite: false,
	side: THREE.DoubleSide
} );

// Cached matrix objects for shadow transform (Golden Rule #4)
const _shadowMat = new THREE.Matrix4();
const _shadowRZ = new THREE.Matrix4();
const _shadowRY = new THREE.Matrix4();
const _shadowRX = new THREE.Matrix4();

/**
 * Projects alias model vertices onto the ground plane to create a shadow (classic `r_shadows`). Ported from
 * WinQuake/gl_rmain.c:347-405. Called by gl_rmain.js once per frame for each shadowed entity, after its model is
 * drawn. Vertices are pushed along `shadevector` down to 1 unit above the floor, in the entity's model space, and the
 * mesh gets the entity's origin and rotation. All shadows share one black, half-transparent material.
 *
 * Mutates `entity`: the shadow geometry, positions and mesh are kept in `_aliasShadowGeo`, `_aliasShadowPosArray`,
 * `_aliasShadowVertCount` and `_aliasShadowMesh` and reused while the vertex count stays the same.
 *
 * @param {entity_t} entity entity casting the shadow; `origin` (Quake units) is required, `angles` (degrees) optional
 * @param {aliashdr_t} paliashdr the model's header
 * @param {number} posenum pose index to project (the pose last drawn)
 * @param {ArrayLike<number>} lightspot world point on the floor below the entity (from `R_LightPoint`); only z is used
 * @param {ArrayLike<number>} shadevector unit direction the shadow is cast along; x and y are used
 * @returns {?THREE.Mesh} the entity's shadow mesh (the same object each frame), or null when the header has no pose
 *   data or the pose has no geometry
 */
export function GL_DrawAliasShadow( entity, paliashdr, posenum, lightspot, shadevector ) {

	if ( paliashdr == null || paliashdr.posedata == null ) return null;

	const template = GL_DrawAliasFrame( paliashdr, posenum );
	if ( template == null ) return null;

	const lheight = entity.origin[ 2 ] - lightspot[ 2 ];
	const height = - lheight + 1.0;

	// Get or create shadow geometry for this entity
	let shadowGeo = entity._aliasShadowGeo;
	let shadowPosArray = entity._aliasShadowPosArray;

	if ( shadowGeo == null || entity._aliasShadowVertCount !== template.vertexCount ) {

		shadowPosArray = new Float32Array( template.vertexCount * 3 );
		shadowGeo = new THREE.BufferGeometry();
		shadowGeo.setAttribute( 'position', new THREE.BufferAttribute( shadowPosArray, 3 ) );
		shadowGeo.setIndex( template.indices );
		entity._aliasShadowGeo = shadowGeo;
		entity._aliasShadowPosArray = shadowPosArray;
		entity._aliasShadowVertCount = template.vertexCount;

	}

	// Project vertices onto ground plane (same as C code)
	const srcPos = template.posAttr.array;
	for ( let i = 0; i < template.vertexCount; i ++ ) {

		const px = srcPos[ i * 3 ];
		const py = srcPos[ i * 3 + 1 ];
		const pz = srcPos[ i * 3 + 2 ];

		shadowPosArray[ i * 3 ] = px - shadevector[ 0 ] * ( pz + lheight );
		shadowPosArray[ i * 3 + 1 ] = py - shadevector[ 1 ] * ( pz + lheight );
		shadowPosArray[ i * 3 + 2 ] = height;

	}

	shadowGeo.attributes.position.needsUpdate = true;

	// Get or create shadow mesh
	let shadowMesh = entity._aliasShadowMesh;
	if ( shadowMesh == null ) {

		shadowMesh = new THREE.Mesh( shadowGeo, _shadowMaterial );
		entity._aliasShadowMesh = shadowMesh;

	} else {

		if ( shadowMesh.geometry !== shadowGeo ) shadowMesh.geometry = shadowGeo;

	}

	// Apply same transform as entity (R_RotateForEntity equivalent)
	if ( entity.origin != null ) {

		shadowMesh.position.set(
			entity.origin[ 0 ],
			entity.origin[ 1 ],
			entity.origin[ 2 ]
		);

	}

	if ( entity.angles != null ) {

		const yaw = entity.angles[ 1 ] * _DEG2RAD;
		const pitch = - entity.angles[ 0 ] * _DEG2RAD;
		const roll = entity.angles[ 2 ] * _DEG2RAD;

		_shadowMat.identity();
		_shadowRZ.makeRotationZ( yaw );
		_shadowRY.makeRotationY( pitch );
		_shadowRX.makeRotationX( roll );
		_shadowMat.multiply( _shadowRZ ).multiply( _shadowRY ).multiply( _shadowRX );
		shadowMesh.setRotationFromMatrix( _shadowMat );

	}

	return shadowMesh;

}

/*
=============
GL_DrawAliasLightShadow
=============
*/
const SHADOW_SIZE = 64;
const SHADOW_INTERVAL = 0.09; // seconds between redrawing a monster's shadow (it is only a soft shape)
const SHADOW_PAD = 6;
const SHADOW_MAX_REACH = 400; // a shadow reaching farther than this is not drawn
const SHADOW_MAX_STRETCH = 2.6; // a shadow is at most this many times as far from the light as the model
const _shadowQuad = new THREE.PlaneGeometry( 1, 1 );
const _swm = new THREE.Matrix4();
const _swz = new THREE.Matrix4();
const _swy = new THREE.Matrix4();
const _swx = new THREE.Matrix4();

/**
 * Newer Game's shadow of a model: cast by the lights that really shine on it. The pose the model is in (the blended
 * pose while animation is smoothed) is projected from each light's position onto the floor under it (the shadow
 * falls away from the light, is long from a low one, and is fainter from a far or dim one), drawn once into a small
 * picture (so where the shadow overlaps itself it is not darker), softened, and laid on the floor as one flat square.
 * Called by gl_rmain.js (`R_LightShadow`) each frame for shadowed alias entities near the view on a flat floor.
 *
 * A projection is stretched at most 2.6 times the model's distance from the light, and points farther than 400
 * units from the origin are dropped. While the entity stays put (same origin and yaw) the last picture is reused for
 * up to 0.09 s of `cl.time`; otherwise it is redrawn.
 *
 * Mutates `entity`: keeps a 64x64 canvas, a scratch canvas, a texture, a material, the mesh and world-space vertices
 * in `_shadow*` fields, reused for the entity's lifetime.
 *
 * @param {entity_t} entity entity casting the shadow; `origin` (Quake units) required, `angles` (degrees) optional
 * @param {aliashdr_t} paliashdr the model's header
 * @param {number} posenum pose index (the pose last drawn)
 * @param {number} floorZ world z of the floor the shadow lies on (Quake units); the square is drawn 0.4 above it
 * @param {Array<{ pos: ArrayLike<number>, opacity: number }>} lights at most a few lights: world position (Quake
 *   units) and shadow opacity 0..1
 * @returns {?THREE.Mesh} the mesh, or null when there is nothing to draw (no lights, no pose data, no DOM, or no vertex
 *   casts onto the floor within reach)
 */
export function GL_DrawAliasLightShadow( entity, paliashdr, posenum, floorZ, lights ) {

	if ( paliashdr == null || paliashdr.posedata == null || lights.length === 0 ) return null;
	if ( typeof document === 'undefined' ) return null;

	const template = GL_DrawAliasFrame( paliashdr, posenum );
	if ( template == null ) return null;

	// a soft shape does not need drawing every frame: keep the last one for a moment
	const now = cl ? cl.time : 0;
	if ( entity._shadowFloorMesh != null && entity._shadowAt !== undefined && Math.abs( now - entity._shadowAt ) < SHADOW_INTERVAL
		&& Math.abs( entity._shadowKey - ( entity.origin[ 0 ] + entity.origin[ 1 ] * 3 + entity.origin[ 2 ] * 7 + ( entity.angles ? entity.angles[ 1 ] : 0 ) ) ) < 0.5 ) return entity._shadowFloorMesh;
	entity._shadowAt = now;
	entity._shadowKey = entity.origin[ 0 ] + entity.origin[ 1 ] * 3 + entity.origin[ 2 ] * 7 + ( entity.angles ? entity.angles[ 1 ] : 0 );

	// the pose that is on screen (a blend between two while the animation is smoothed)
	const src = entity._aliasBlended === true && entity._aliasBlendPos != null ? entity._aliasBlendPos.array : template.posAttr.array;
	const n = template.vertexCount;

	// the model's place in the world
	const yaw = ( entity.angles ? entity.angles[ 1 ] : 0 ) * _DEG2RAD;
	const pitch = - ( entity.angles ? entity.angles[ 0 ] : 0 ) * _DEG2RAD;
	const roll = ( entity.angles ? entity.angles[ 2 ] : 0 ) * _DEG2RAD;
	_swm.identity();
	_swz.makeRotationZ( yaw );
	_swy.makeRotationY( pitch );
	_swx.makeRotationX( roll );
	_swm.multiply( _swz ).multiply( _swy ).multiply( _swx );
	const m = _swm.elements;
	const ox = entity.origin[ 0 ], oy = entity.origin[ 1 ], oz = entity.origin[ 2 ];

	if ( entity._shadowWorld == null || entity._shadowWorld.length !== n * 3 ) entity._shadowWorld = new Float32Array( n * 3 );
	const w = entity._shadowWorld;
	for ( let i = 0; i < n; i ++ ) {

		const x = src[ i * 3 ], y = src[ i * 3 + 1 ], z = src[ i * 3 + 2 ];
		w[ i * 3 ] = m[ 0 ] * x + m[ 4 ] * y + m[ 8 ] * z + ox;
		w[ i * 3 + 1 ] = m[ 1 ] * x + m[ 5 ] * y + m[ 9 ] * z + oy;
		w[ i * 3 + 2 ] = m[ 2 ] * x + m[ 6 ] * y + m[ 10 ] * z + oz;

	}

	// each light's shadow of every vertex, on the floor
	const proj = [];
	let minX = 1e9, minY = 1e9, maxX = - 1e9, maxY = - 1e9;

	for ( const light of lights ) {

		const p = new Float32Array( n * 2 );
		const ok = new Uint8Array( n );
		const L = light.pos;

		for ( let i = 0; i < n; i ++ ) {

			const vz = w[ i * 3 + 2 ];
			const drop = L[ 2 ] - vz;
			if ( drop < 4 ) continue; // at or above the light: it casts no shadow on the floor
			// a light only a little above the model would throw the shadow miles: it is
			// bent short instead (the way it points stays right)
			const t = Math.min( ( L[ 2 ] - floorZ ) / drop, SHADOW_MAX_STRETCH );

			const px = L[ 0 ] + ( w[ i * 3 ] - L[ 0 ] ) * t;
			const py = L[ 1 ] + ( w[ i * 3 + 1 ] - L[ 1 ] ) * t;
			if ( Math.abs( px - ox ) > SHADOW_MAX_REACH || Math.abs( py - oy ) > SHADOW_MAX_REACH ) continue;

			p[ i * 2 ] = px;
			p[ i * 2 + 1 ] = py;
			ok[ i ] = 1;
			if ( px < minX ) minX = px;
			if ( px > maxX ) maxX = px;
			if ( py < minY ) minY = py;
			if ( py > maxY ) maxY = py;

		}

		proj.push( { p, ok, opacity: light.opacity } );

	}

	if ( minX > maxX ) return null;

	const size = Math.max( maxX - minX, maxY - minY, 16 );
	const scale = ( SHADOW_SIZE - 2 * SHADOW_PAD ) / size;
	const x0 = minX - SHADOW_PAD / scale;
	const y1 = maxY + SHADOW_PAD / scale; // the top of the picture

	if ( entity._shadowCanvas == null ) {

		const mk = () => {

			const c = document.createElement( 'canvas' );
			c.width = c.height = SHADOW_SIZE;
			return c;

		};

		entity._shadowCanvas = mk();
		entity._shadowTemp = mk();
		entity._shadowTexture = new THREE.CanvasTexture( entity._shadowCanvas );
		entity._shadowTexture.colorSpace = THREE.SRGBColorSpace;
		entity._shadowMaterial = new THREE.MeshBasicMaterial( {
			map: entity._shadowTexture, color: 0x000000, transparent: true, depthWrite: false,
			polygonOffset: true, polygonOffsetFactor: - 2, polygonOffsetUnits: - 2
		} );

	}

	const out = entity._shadowCanvas.getContext( '2d' );
	const tmp = entity._shadowTemp.getContext( '2d' );
	out.clearRect( 0, 0, SHADOW_SIZE, SHADOW_SIZE );

	const idx = template.indices;

	for ( const pr of proj ) {

		// the whole silhouette once, solid: overlaps do not add up
		tmp.clearRect( 0, 0, SHADOW_SIZE, SHADOW_SIZE );
		tmp.fillStyle = '#000';
		tmp.beginPath();

		for ( let t = 0; t < idx.length; t += 3 ) {

			let a = idx[ t ], b = idx[ t + 1 ], c = idx[ t + 2 ];
			if ( pr.ok[ a ] === 0 || pr.ok[ b ] === 0 || pr.ok[ c ] === 0 ) continue;

			// front and back faces come out wound the opposite ways: make every one the same way,
			// or where they overlap they cancel out and leave a hole
			const ax = pr.p[ a * 2 ], ay = pr.p[ a * 2 + 1 ];
			const cross = ( pr.p[ b * 2 ] - ax ) * ( pr.p[ c * 2 + 1 ] - ay ) - ( pr.p[ b * 2 + 1 ] - ay ) * ( pr.p[ c * 2 ] - ax );
			if ( cross < 0 ) { const x = b; b = c; c = x; }

			tmp.moveTo( ( pr.p[ a * 2 ] - x0 ) * scale, ( y1 - pr.p[ a * 2 + 1 ] ) * scale );
			tmp.lineTo( ( pr.p[ b * 2 ] - x0 ) * scale, ( y1 - pr.p[ b * 2 + 1 ] ) * scale );
			tmp.lineTo( ( pr.p[ c * 2 ] - x0 ) * scale, ( y1 - pr.p[ c * 2 + 1 ] ) * scale );
			tmp.closePath();

		}

		tmp.fill( 'nonzero' );

		// soft edges, and the dimmer or farther the light the fainter
		out.globalAlpha = pr.opacity * Math.max( 0.5, 1.2 - size / 500 );
		out.drawImage( entity._shadowTemp, 0, 0 ); // (drawn small and stretched smooth: that is the softness)

	}

	out.globalAlpha = 1;
	entity._shadowTexture.needsUpdate = true;

	let mesh = entity._shadowFloorMesh;
	if ( mesh == null ) {

		mesh = new THREE.Mesh( _shadowQuad, entity._shadowMaterial );
		mesh.renderOrder = 1;
		entity._shadowFloorMesh = mesh;

	}

	const side = SHADOW_SIZE / scale;
	mesh.position.set( x0 + side / 2, y1 - side / 2, floorZ + 0.4 );
	mesh.scale.set( side, side, 1 );

	return mesh;

}
