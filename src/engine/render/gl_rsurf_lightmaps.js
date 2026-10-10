/**
 * @module engine/render/gl_rsurf_lightmaps
 *
 * The world's lightmaps (card [44i], split from gl_rsurf.js): the atlases (allocation, building each surface's
 * lightmap from its light styles and the dynamic lights, the uploads), the surface polygons with their lightmap
 * coordinates, and the Classic comparison pass's grayscale copies.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `MAX_LIGHTMAPS`, `lightmap_bytes`, `lightmaps`, `gl_lightmap_format`, `gl_solid_format`,
 * `gl_alpha_format`, `gl_mtexable`; module-level variables `lightmap_textures`, `active_lightmaps`, `mtexenabled`,
 * `r_pcurrentvertbase`, `currentmodel`, `nColinElim`; 1 module-level collection (Map/Set).
 *
 * Errors: calls `Sys_Error` (fatal) at 1 place.
 *
 * The atlas format and the model whose surfaces are built are set by the map load (`GL_BuildLightmaps`) through
 * `R_LightmapsSetFormat` and `R_LightmapsSetModel`, and fixed until the next.
 */
import * as THREE from 'three';
import { Sys_Error } from '../common/sys.js';
import { R_NewerLightingActive } from '../common/hooks.js';
import { cl, cl_dlights } from '../client/client.js';
import { VERTEXSIZE, SURF_DRAWSKY, SURF_DRAWTURB, SURF_UNDERWATER, MAXLIGHTMAPS, r_framecount, d_lightstylevalue, r_fullbright, gl_texsort, gl_keeptjunctions } from './gl_rmain.js';
import { DotProduct, VectorNormalize } from '../common/mathlib.js';

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

export let lightmap_bytes = 1; // 1, 2, or 4
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

export const lightmap_polys = new Array( MAX_LIGHTMAPS ).fill( null );
export const lightmap_modified = new Array( MAX_LIGHTMAPS ).fill( false );
export const lightmap_rectchange = [];
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
export let lightmaps = new Uint8Array( 4 * MAX_LIGHTMAPS * BLOCK_WIDTH * BLOCK_HEIGHT );

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

/**
 * Throws away the previous map's lightmaps (part of `GL_BuildLightmaps`): disposes the atlas textures, returns to the
 * base atlas count and clears every atlas's allocation.
 */
export function R_LightmapsClear() {

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

}

/**
 * Sets the atlas format for the map being loaded (`GL_BuildLightmaps`): luminance, `bytes` bytes per texel.
 *
 * @param {number} bytes 1, or 3 for a coloured (.lit) lightmap under Newer Game
 */
export function R_LightmapsSetFormat( bytes ) {

	gl_lightmap_format = GL_LUMINANCE;
	lightmap_bytes = bytes;

}

/**
 * Names the brush model whose surfaces `BuildSurfaceDisplayList` builds next (`GL_BuildLightmaps`), and its vertices.
 *
 * @param {model_t} m a loaded brush model
 */
export function R_LightmapsSetModel( m ) {

	r_pcurrentvertbase = m.vertexes;
	currentmodel = m;

}

/**
 * Uploads every filled atlas as a Three.js RGBA DataTexture of brightness (part of `GL_BuildLightmaps`), clearing
 * its changed state.
 */
export function R_LightmapsUpload() {

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

}
