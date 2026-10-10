/**
 * @module engine/render/gl_rsurf_materials
 *
 * The world's surface materials and polygons (card [44i], split from gl_rsurf.js): the lightmapped material, texture
 * animation (the `+0`..`+9` and `+a`..`+j` frames), and a surface polygon's triangles, alone or merged by texture.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: calls `Sys_Error` (fatal) at 2 places.
 */
import * as THREE from 'three';
import { Sys_Error } from '../common/sys.js';
import { cl } from '../client/client.js';
import { R_RegisterGlow, R_RegisterDetail, R_RefreshDetail } from '../common/hooks.js'; // installed by newer/render/gl_post.js
import { VERTEXSIZE, currententity } from './gl_rmain.js';

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

/**
 * Merges surface polygons into one triangle geometry (a fan per polygon), for the surfaces of a brush entity that
 * share a material (`R_DrawBrushModel`). Polygons that are missing or have fewer than 3 vertices are skipped.
 *
 * @param {Array<?glpoly_t>} polys the polygons, their vertices `VERTEXSIZE` floats each (x, y, z, s, t, lightmap s, t)
 * @param {Array<?Float32Array>} planeNormals each polygon's plane normal, given to all its vertices (missing: 0, 0, 1)
 * @returns {?THREE.BufferGeometry} position, normal, uv (the texture's) and uv1 (the lightmap's) attributes, or null
 *   when no polygon has a triangle
 */
export function _mergeGLPolys( polys, planeNormals ) {

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
