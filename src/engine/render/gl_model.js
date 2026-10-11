/**
 * @module engine/render/gl_model
 *
 * Model loading (WinQuake gl_model.c): BSP worlds (including BSP2), alias models and sprites, their textures and
 * caches.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `loadname`, `mod_novis`, `decompressed`.
 *
 * Errors: calls `Sys_Error` (fatal) at 8 places.
 */
// Ported from: WinQuake/gl_model.c + gl_model.h + modelgen.h + spritegn.h
// models.c -- model loading and caching
//
// models are the only shared resource between a client and server running
// on the same machine.

import * as THREE from 'three';
import { Sys_Error } from '../common/sys.js';
import { Con_Printf, COM_FileBase } from '../common/common.js';
import { COM_LoadFile } from '../common/pak.js';
import { DotProduct } from '../common/mathlib.js';
import { Cvar_RegisterVariable } from '../common/cvar.js';
import { MAX_MAP_LEAFS, MIPLEVELS } from '../common/bspfile.js';
import { gl_subdivide_size, GL_UnregisterTexture } from './glquake.js';
import { IDPOLYHEADER, SPRITE_VERSION, SPR_SINGLE, IDSPRITEHEADER, mod_brush, mod_sprite, mod_alias, texture_t, mspriteframe_t, mspritegroup_t, mspriteframedesc_t, msprite_t } from './gl_model_types.js';
import { set_solidskytexture, set_alphaskytexture, loadmodel, set_loadmodel, mod_known, mod_numknown, r_notexture_mip, set_r_notexture_mip, GL_LoadTexture, set_previewLoad, Mod_FindName } from './gl_model_common.js';
import { Mod_LoadBrushModel } from './gl_model_bsp.js';
import { Mod_LoadAliasModel } from './gl_model_alias.js';
export { pheader, stverts, triangles, poseverts } from './gl_model_alias.js';
export { solidskytexture, alphaskytexture, set_solidskytexture, set_alphaskytexture, Mod_FindName, RadiusFromBounds } from './gl_model_common.js';
export { ALIAS_VERSION, ALIAS_ONSEAM, ST_SYNC, ST_RAND, ALIAS_SINGLE, ALIAS_GROUP, ALIAS_SKIN_SINGLE, ALIAS_SKIN_GROUP, DT_FACES_FRONT, IDPOLYHEADER, ALIAS_BASE_SIZE_RATIO, MAX_LBM_HEIGHT, SPRITE_VERSION, SPR_VP_PARALLEL_UPRIGHT, SPR_FACING_UPRIGHT, SPR_VP_PARALLEL, SPR_ORIENTED, SPR_VP_PARALLEL_ORIENTED, SPR_SINGLE, SPR_GROUP, IDSPRITEHEADER, EF_BRIGHTFIELD, EF_MUZZLEFLASH, EF_BRIGHTLIGHT, EF_DIMLIGHT, SURF_PLANEBACK, SURF_DRAWSKY, SURF_DRAWSPRITE, SURF_DRAWTURB, SURF_DRAWTILED, SURF_DRAWBACKGROUND, SURF_UNDERWATER, SIDE_FRONT, SIDE_BACK, SIDE_ON, VERTEXSIZE, mod_brush, mod_sprite, mod_alias, EF_ROCKET, EF_GRENADE, EF_GIB, EF_ROTATE, EF_TRACER, EF_ZOMGIB, EF_TRACER2, EF_TRACER3, MAX_SKINS, MAXALIASVERTS, MAXALIASFRAMES, MAXALIASTRIS, mvertex_t, mplane_t, texture_t, medge_t, mtexinfo_t, msurface_t, mnode_t, mleaf_t, dclipnode_t, hull_t, mspriteframe_t, mspritegroup_t, mspriteframedesc_t, msprite_t, trivertx_t, stvert_t, mtriangle_t, maliasframedesc_t, aliashdr_t, dmodel_t, model_t } from './gl_model_types.js'; // installed by newer/render/r_cratevariants.js
let loadname = '';

let mod_novis = new Uint8Array( MAX_MAP_LEAFS / 8 );

// Decompressed visibility buffer (reused)
let decompressed = new Uint8Array( MAX_MAP_LEAFS / 8 );

/*
================
Mod_LoadForPreview
================
*/
/**
 * Loads a level's model so it can be drawn from a distance (the next level seen through an exit), without touching
 * the current level's sky. The model is flushed with the rest at the next level change. Only the world is loaded:
 * the `*1`, `*2`... submodel entries stay those of the level being played. Used by seamless travel, the level view
 * and the prewarm code; an already loaded model is returned as is.
 *
 * @param {string} name model path, e.g. 'maps/e1m2.bsp' or a submodel name
 * @returns {?model_t} the cached model, or null when the file does not exist
 * @throws {Error} through `Sys_Error` for a corrupt file (see `Mod_LoadModel`)
 */
export function Mod_LoadForPreview( name ) {

	set_previewLoad( true );

	try {

		return Mod_ForName( name, false );

	} finally {

		set_previewLoad( false );

	}

}

// ============================================================================
// Mod_Init
// ============================================================================

/**
 * One-time model setup at start-up, called from Host_Init (WinQuake gl_model.c): registers `gl_subdivide_size` and
 * fills the all-visible PVS row returned for the solid leaf.
 */
export function Mod_Init() {

	Cvar_RegisterVariable( gl_subdivide_size );
	mod_novis.fill( 0xff );

}

// ============================================================================
// R_InitTextures
// ============================================================================

/**
 * Makes the 16×16 checkerboard texture used for surfaces whose texture is missing (WinQuake
 * `R_InitTextures`): its four 8-bit mip levels and a nearest-filtered magenta and black `THREE.DataTexture` in
 * `gl_texture`. Called from Host_Init (needed even for dedicated servers) and kept for the life of the page; later
 * calls return the same texture.
 *
 * @returns {texture_t} the shared 'notexture' texture
 */
export function R_InitTextures() {

	if ( r_notexture_mip != null && r_notexture_mip.gl_texture != null )
		return r_notexture_mip;

	const fallback = new texture_t();
	fallback.name = 'notexture';
	fallback.width = 16;
	fallback.height = 16;

	const totalSize = 16 * 16 + 8 * 8 + 4 * 4 + 2 * 2;
	fallback.pixels = new Uint8Array( totalSize );
	fallback.offsets[ 0 ] = 0;
	fallback.offsets[ 1 ] = 16 * 16;
	fallback.offsets[ 2 ] = fallback.offsets[ 1 ] + 8 * 8;
	fallback.offsets[ 3 ] = fallback.offsets[ 2 ] + 4 * 4;

	for ( let m = 0; m < MIPLEVELS; m ++ ) {

		const size = 16 >> m;
		const half = 8 >> m;
		let offset = fallback.offsets[ m ];
		for ( let y = 0; y < size; y ++ ) {

			for ( let x = 0; x < size; x ++ ) {

				const alternate = ( y < half ) !== ( x < half );
				fallback.pixels[ offset ++ ] = alternate === true ? 0 : 0xff;

			}

		}

	}

	const rgba = new Uint8Array( 16 * 16 * 4 );
	for ( let y = 0; y < 16; y ++ ) {

		for ( let x = 0; x < 16; x ++ ) {

			const index = ( y * 16 + x ) * 4;
			const alternate = ( y < 8 ) !== ( x < 8 );
			rgba[ index ] = alternate === true ? 255 : 0;
			rgba[ index + 1 ] = 0;
			rgba[ index + 2 ] = alternate === true ? 255 : 0;
			rgba[ index + 3 ] = 255;

		}

	}

	const texture = new THREE.DataTexture( rgba, 16, 16, THREE.RGBAFormat );
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.needsUpdate = true;
	fallback.gl_texture = texture;

	set_r_notexture_mip( fallback );
	return r_notexture_mip;

}

// ============================================================================
// Mod_Extradata
// ============================================================================

/**
 * Caches the data if needed (WinQuake gl_model.c): returns the model's loaded alias header or sprite, loading the
 * file again when it is not in memory.
 *
 * @param {model_t} mod an alias or sprite model
 * @returns {aliashdr_t|msprite_t} the model's `cache.data`
 * @throws {Error} through `Sys_Error` when the file is missing or caching failed (a brush model has no cache data)
 */
export function Mod_Extradata( mod ) {

	const r = mod.cache.data;
	if ( r )
		return r;

	Mod_LoadModel( mod, true );

	if ( ! mod.cache.data )
		Sys_Error( 'Mod_Extradata: caching failed' );
	return mod.cache.data;

}

// ============================================================================
// Mod_PointInLeaf
// ============================================================================

/**
 * Finds the BSP leaf that contains a point by walking the model's drawing nodes from the root (WinQuake
 * gl_model.c). Used every frame for the view leaf, and by the server's PVS, the sound system and many Newer effects.
 * A point exactly on a plane goes to the back side.
 *
 * @param {Float32Array|Array<number>} p the point, in the model's space (world space for the world)
 * @param {model_t} model a brush model
 * @returns {mleaf_t} the leaf (`contents` is a negative CONTENTS_* value)
 * @throws {Error} through `Sys_Error` when the model is missing or has no nodes
 */
export function Mod_PointInLeaf( p, model ) {

	if ( ! model || ! model.nodes )
		Sys_Error( 'Mod_PointInLeaf: bad model' );

	let node = model.nodes[ 0 ];
	let nodeIndex = 0;

	while ( true ) {

		if ( node.contents < 0 ) {

			// This is actually a leaf
			// In C: return (mleaf_t *)node
			// In JS: nodes and leafs are separate arrays, so leafs
			// are pointed to via children as negative indices
			return node;

		}

		const plane = node.plane;
		const d = DotProduct( p, plane.normal ) - plane.dist;
		if ( d > 0 )
			node = node.children[ 0 ];
		else
			node = node.children[ 1 ];

	}

}

// ============================================================================
// Mod_DecompressVis
// ============================================================================

/**
 * Expands one run-length-encoded PVS row, one bit per leaf, where a zero byte is followed by a count of zero bytes
 * (WinQuake gl_model.c). Called by `Mod_LeafPVS`.
 *
 * @param {?Uint8Array} _in the model's visdata, or null when the map has no vis info (then every leaf is visible)
 * @param {number} inOffset byte offset of the leaf's row in `_in`
 * @param {model_t} model the brush model; `numleafs` sets the row length, (numleafs + 7) >> 3 bytes
 * @returns {Uint8Array} a shared buffer, reused by the next call (copy it to keep it); only the first row-length bytes
 *   are meaningful, and it may be longer
 * @throws {Error} through `Sys_Error` when the data is truncated or a zero run overflows the row
 */
export function Mod_DecompressVis( _in, inOffset, model ) {

	const row = ( model.numleafs + 7 ) >> 3;
	if(row>decompressed.length)decompressed=new Uint8Array(row);
	let outIdx = 0;

	if ( _in === null ) {

		// no vis info, so make all visible
		for ( let i = 0; i < row; i ++ )
			decompressed[ i ] = 0xff;
		return decompressed;

	}

	let pos = inOffset;

	while ( outIdx < row ) {

		if(pos<0||pos>=_in.length)Sys_Error('Truncated BSP visibility');
		if ( _in[ pos ] ) {

			decompressed[ outIdx ] = _in[ pos ];
			outIdx ++;
			pos ++;
			continue;

		}

		const c = _in[ pos + 1 ];
		if(!c||outIdx+c>row)Sys_Error('Invalid BSP visibility run');
		pos += 2;
		for ( let j = 0; j < c; j ++ ) {

			decompressed[ outIdx ] = 0;
			outIdx ++;

		}

	}

	return decompressed;

}

// ============================================================================
// Mod_LeafPVS
// ============================================================================

/**
 * Returns the potentially visible set of a leaf: one bit per leaf, bit n for `model.leafs[n + 1]` (WinQuake
 * gl_model.c). Used for the view's visible leaves, by the server to cull the entities sent to each client, and by QC's
 * `checkclient`.
 *
 * @param {mleaf_t} leaf the leaf the viewer is in
 * @param {model_t} model the brush model it belongs to
 * @returns {Uint8Array} a shared, reused buffer (copy it to keep it): all visible for the solid leaf `leafs[0]`,
 *   otherwise the decompressed row (see `Mod_DecompressVis`)
 * @throws {Error} through `Sys_Error` for corrupt visibility data
 */
export function Mod_LeafPVS( leaf, model ) {

	if ( leaf === model.leafs[ 0 ] ){const row=(model.numleafs+7)>>3;if(row>mod_novis.length){mod_novis=new Uint8Array(row);mod_novis.fill(255);}return mod_novis;}
	return Mod_DecompressVis( leaf.compressed_vis, leaf.compressed_vis_offset, model );

}

// ============================================================================
// Mod_ClearAll
// ============================================================================

/**
 * Marks every brush and sprite model as needing a reload and frees their GPU textures (WinQuake gl_model.c), called
 * by Host_ClearMemory at every level change. Each texture in a model's `_threeTextures` is unregistered and
 * disposed once; brush textures lose their `gl_texture`, sprites their cache data, and the sky textures are
 * forgotten. Alias models are left cached. The `model_t` objects are kept, so references to them stay valid.
 */
export function Mod_ClearAll() {

	const disposedTextures = new Set();
	for ( let i = 0; i < mod_numknown; i ++ ) {

		const mod = mod_known[ i ];
		if ( mod.type === mod_alias ) continue;

		for ( const texture of mod._threeTextures ) {

			GL_UnregisterTexture( texture );
			if ( disposedTextures.has( texture ) === false ) {

				disposedTextures.add( texture );
				texture.dispose();

			}

		}
		mod._threeTextures.clear();

		if ( mod.type === mod_brush && mod.textures != null ) {

			for ( let j = 0; j < mod.textures.length; j ++ ) {

				const modelTexture = mod.textures[ j ];
				if ( modelTexture == null || modelTexture.gl_texture == null ) continue;
				modelTexture.gl_texture._fullbright = null;
				modelTexture.gl_texture = null;

			}

		} else if ( mod.type === mod_sprite ) {

			mod.cache.data = null;

		}

		mod.needload = true;

	}

	set_solidskytexture( null );
	set_alphaskytexture( null );

}

// ============================================================================
// Mod_TouchModel
// ============================================================================

/**
 * Makes sure a model has a cache entry (WinQuake gl_model.c). The C version also refreshed an alias model's cache
 * slot; with garbage collection there is nothing more to do here.
 *
 * @param {string} name model path
 * @throws {Error} through `Sys_Error` for an empty name or a full model table (see `Mod_FindName`)
 */
export function Mod_TouchModel( name ) {

	const mod = Mod_FindName( name );

	if ( ! mod.needload ) {

		if ( mod.type === mod_alias ) {

			// Cache_Check equivalent - just check if data exists
			// (JS has GC, so we just check the reference)

		}

	}

}

// ============================================================================
// Mod_LoadModel
// ============================================================================

/**
 * Loads a model into the cache (WinQuake gl_model.c): reads the file and calls the alias ('IDPO'), sprite ('IDSP')
 * or brush loader, unless the model is already loaded (a brush or sprite model not marked `needload`, or an alias
 * model with its cache data). Sets the module's `loadmodel` for the loaders.
 *
 * @param {model_t} mod the cache entry (from `Mod_FindName`); filled in place
 * @param {boolean} crash true to treat a missing file as fatal
 * @returns {?model_t} `mod`, or null when the file is missing and `crash` is false
 * @throws {Error} through `Sys_Error` when the file is missing and `crash` is true, or for a corrupt or unsupported
 *   file
 */
export function Mod_LoadModel( mod, crash ) {

	if ( ! mod.needload ) {

		if ( mod.type === mod_alias ) {

			const d = mod.cache.data;
			if ( d )
				return mod;

		} else {

			return mod;		// not cached at all

		}

	}

	// load the file
	const buf = COM_LoadFile( mod.name );
	if ( ! buf ) {

		if ( crash )
			Sys_Error( 'Mod_NumForName: ' + mod.name + ' not found' );
		return null;

	}

	// allocate a new model
	loadname = COM_FileBase( mod.name );

	set_loadmodel( mod );

	// fill it in

	// call the appropriate loader
	mod.needload = false;

	const view = new DataView( buf );
	const magic = view.getInt32( 0, true );

	if ( magic === IDPOLYHEADER ) {

		Mod_LoadAliasModel( mod, buf );

	} else if ( magic === IDSPRITEHEADER ) {

		Mod_LoadSpriteModel( mod, buf );

	} else {

		Mod_LoadBrushModel( mod, buf );

	}

	return mod;

}

// ============================================================================
// Mod_ForName
// ============================================================================

/**
 * Loads in a model for the given name (WinQuake gl_model.c): `Mod_FindName` then `Mod_LoadModel`. Used for the
 * server's world and submodels at spawn, QC's `precache_model`, and the client's models and beams.
 *
 * @param {string} name model path, e.g. 'maps/e1m1.bsp', 'progs/player.mdl' or '*1'
 * @param {boolean} crash true to treat a missing file as fatal
 * @returns {?model_t} the loaded model, or null when the file is missing and `crash` is false
 * @throws {Error} through `Sys_Error` for an empty name, a missing file when `crash` is true, or a corrupt file
 */
export function Mod_ForName( name, crash ) {

	const mod = Mod_FindName( name );

	return Mod_LoadModel( mod, crash );

}

// ============================================================================
//
//                        SPRITE MODELS
//
// ============================================================================

// ============================================================================
// Mod_LoadSpriteFrame
// ============================================================================

function Mod_LoadSpriteFrame( buf, offset, framenum ) {

	const view = new DataView( buf, offset );

	// dspriteframe_t: int origin[2], int width, int height = 16 bytes
	const width = view.getInt32( 8, true );
	const height = view.getInt32( 12, true );
	const size = width * height;

	const pspriteframe = new mspriteframe_t();

	pspriteframe.width = width;
	pspriteframe.height = height;

	const origin0 = view.getInt32( 0, true );
	const origin1 = view.getInt32( 4, true );

	pspriteframe.up = origin1;
	pspriteframe.down = origin1 - height;
	pspriteframe.left = origin0;
	pspriteframe.right = width + origin0;

	const SIZEOF_DSPRITEFRAME = 16;
	const name = loadmodel.name + '_' + framenum;
	const pixelData = new Uint8Array( buf, offset + SIZEOF_DSPRITEFRAME, size );
	pspriteframe.gl_texturenum = GL_LoadTexture( name, width, height, pixelData, true, true );

	return {
		frame: pspriteframe,
		nextOffset: offset + SIZEOF_DSPRITEFRAME + size
	};

}

// ============================================================================
// Mod_LoadSpriteGroup
// ============================================================================

function Mod_LoadSpriteGroup( buf, offset, framenum ) {

	const view = new DataView( buf, offset );

	// dspritegroup_t: int numframes = 4 bytes
	const numframes = view.getInt32( 0, true );

	const pspritegroup = new mspritegroup_t();
	pspritegroup.numframes = numframes;

	const SIZEOF_DSPRITEGROUP = 4;
	const SIZEOF_DSPRITEINTERVAL = 4;

	// Read intervals
	pspritegroup.intervals = new Float32Array( numframes );
	let intervalOfs = offset + SIZEOF_DSPRITEGROUP;

	for ( let i = 0; i < numframes; i ++ ) {

		const iv = new DataView( buf, intervalOfs );
		pspritegroup.intervals[ i ] = iv.getFloat32( 0, true );
		if ( pspritegroup.intervals[ i ] <= 0.0 )
			Sys_Error( 'Mod_LoadSpriteGroup: interval<=0' );
		intervalOfs += SIZEOF_DSPRITEINTERVAL;

	}

	// Load frames
	pspritegroup.frames = new Array( numframes );
	let ptemp = intervalOfs;

	for ( let i = 0; i < numframes; i ++ ) {

		const result = Mod_LoadSpriteFrame( buf, ptemp, framenum * 100 + i );
		pspritegroup.frames[ i ] = result.frame;
		ptemp = result.nextOffset;

	}

	return {
		frame: pspritegroup,
		nextOffset: ptemp
	};

}

// ============================================================================
// Mod_LoadSpriteModel
// ============================================================================

function Mod_LoadSpriteModel( mod, buffer ) {

	const view = new DataView( buffer );

	// dsprite_t: int ident, int version, int type, float boundingradius,
	//            int width, int height, int numframes, float beamlength, synctype_t synctype
	//            = 36 bytes
	const version = view.getInt32( 4, true );
	if ( version !== SPRITE_VERSION )
		Sys_Error( mod.name + ' has wrong version number (' + version + ' should be ' + SPRITE_VERSION + ')' );

	const numframes = view.getInt32( 24, true );

	const psprite = new msprite_t();
	mod.cache.data = psprite;

	psprite.type = view.getInt32( 8, true );
	psprite.maxwidth = view.getInt32( 16, true );
	psprite.maxheight = view.getInt32( 20, true );
	psprite.beamlength = view.getFloat32( 28, true );
	mod.synctype = view.getInt32( 32, true );
	psprite.numframes = numframes;

	mod.mins[ 0 ] = mod.mins[ 1 ] = - psprite.maxwidth / 2;
	mod.maxs[ 0 ] = mod.maxs[ 1 ] = psprite.maxwidth / 2;
	mod.mins[ 2 ] = - psprite.maxheight / 2;
	mod.maxs[ 2 ] = psprite.maxheight / 2;

	//
	// load the frames
	//
	if ( numframes < 1 )
		Sys_Error( 'Mod_LoadSpriteModel: Invalid # of frames: ' + numframes );

	mod.numframes = numframes;

	psprite.frames = new Array( numframes );

	const SIZEOF_DSPRITE = 36;
	const SIZEOF_DSPRITEFRAMETYPE = 4;
	let pos = SIZEOF_DSPRITE;

	for ( let i = 0; i < numframes; i ++ ) {

		const ftView = new DataView( buffer, pos );
		const frametype = ftView.getInt32( 0, true );

		const fdesc = new mspriteframedesc_t();
		fdesc.type = frametype;

		if ( frametype === SPR_SINGLE ) {

			const result = Mod_LoadSpriteFrame( buffer, pos + SIZEOF_DSPRITEFRAMETYPE, i );
			fdesc.frameptr = result.frame;
			pos = result.nextOffset;

		} else {

			const result = Mod_LoadSpriteGroup( buffer, pos + SIZEOF_DSPRITEFRAMETYPE, i );
			fdesc.frameptr = result.frame;
			pos = result.nextOffset;

		}

		psprite.frames[ i ] = fdesc;

	}

	mod.type = mod_sprite;

}

// ============================================================================
// Mod_Print
// ============================================================================

/**
 * Prints every known model to the console as `[cached]` (alias or sprite data in memory) or `[empty]`, with its name
 * (WinQuake gl_model.c, the `mcache` command; no command is registered for it here).
 */
export function Mod_Print() {

	Con_Printf( 'Cached models:\n' );
	for ( let i = 0; i < mod_numknown; i ++ ) {

		const mod = mod_known[ i ];
		Con_Printf( '  ' + ( mod.cache.data ? '[cached]' : '[empty]' ) + ' : ' + mod.name + '\n' );

	}

}
