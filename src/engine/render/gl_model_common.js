/**
 * @module engine/render/gl_model_common
 *
 * What the model loaders share (card [44k], split from gl_model.js): the model being loaded and the page's table of
 * known models (`Mod_FindName`), the texture upload (`GL_LoadTexture`), the placeholder and sky textures, and two
 * small readers.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `solidskytexture`, `alphaskytexture`, `loadmodel`, `mod_numknown`, `r_notexture_mip`,
 * `previewLoad`.
 *
 * Errors: calls `Sys_Error` (fatal) at 2 places.
 *
 * Each shared variable has one writer, its setter.
 */
import * as THREE from 'three';
import { Sys_Error } from '../common/sys.js';
import { d_8to24table, vid } from './vid.js';
import { Length } from '../common/mathlib.js';
import { gl_texturemode, GL_TextureLinear, GL_RegisterTexture } from './glquake.js';
import { model_t } from './gl_model_types.js';

// Sky textures (set by R_InitSky during level load)
export let solidskytexture = null;
export let alphaskytexture = null;
/**
 * Sets the solid sky layer's texture (`solidskytexture`; null at `Mod_ClearAll`, made by `R_InitSky` at a map load).
 *
 * @param {?THREE.Texture} value the texture
 */
export function set_solidskytexture( value ) { solidskytexture = value; }
/**
 * Sets the alpha sky layer's texture (`alphaskytexture`; null at `Mod_ClearAll`, made by `R_InitSky` at a map load).
 *
 * @param {?THREE.Texture} value the texture
 */
export function set_alphaskytexture( value ) { alphaskytexture = value; }

// ============================================================================
// Module-level state (mirrors C globals)
// ============================================================================

export let loadmodel = null;
/**
 * Names the model being loaded (`loadmodel`): set by `Mod_LoadModel` and, for each inline model, by the BSP loader.
 *
 * @param {?model_t} value the model
 */
export function set_loadmodel( value ) { loadmodel = value; }

// the most model names a page can know (WinQuake's 512): a large map names its brush submodels *1 up to *285 and more,
// and the cache keeps every map's for the page's life; the entries are made as they are needed (card [34f])
const MAX_MOD_KNOWN = 4096;
export const mod_known = [];
export let mod_numknown = 0;

// Initialize mod_known array (WinQuake's 512 up front; more as needed, up to MAX_MOD_KNOWN)
for ( let i = 0; i < 512; i ++ )
	mod_known[ i ] = new model_t();

// GL texture placeholder
export let r_notexture_mip = null;
/**
 * Sets the checkerboard texture missing textures use (`r_notexture_mip`, made by `R_InitTextures`).
 *
 * @param {?texture_t} value the texture
 */
export function set_r_notexture_mip( value ) { r_notexture_mip = value; }

// ============================================================================
// Stub functions for GL operations not yet ported
// ============================================================================

/**
 * Makes a model's texture from palette-indexed pixels: an sRGB RGBA THREE.DataTexture through the palette
 * (`d_8to24table`), index 255 clear when `alpha`, repeating, filtered by the texture-filter setting (anisotropic 16 under
 * the HDR lighting), registered for later filter changes and kept on the model being loaded for disposal. With
 * `splitFullbright`, the fullbright palette entries (224 and up) move to a second texture on `_fullbright` and are black
 * in this one.
 *
 * @param {string} name the texture's name (not used for caching here)
 * @param {number} width texels across
 * @param {number} height texels down
 * @param {Uint8Array} data width * height palette indices
 * @param {boolean} mipmap whether to make mipmaps
 * @param {boolean} alpha whether index 255 is transparent
 * @param {boolean} splitFullbright whether to split the fullbright texels out
 * @returns {THREE.DataTexture} the texture
 */
export function GL_LoadTexture( name, width, height, data, mipmap, alpha, splitFullbright ) {

	// Convert 8-bit palette-indexed pixels to RGBA and create a THREE.DataTexture
	const rgba = new Uint8Array( width * height * 4 );
	const fullbrightStart = vid.fullbright; // palette index 224+
	let hasFullbright = false;
	let fullbrightTexture = null;

	for ( let i = 0; i < width * height; i ++ ) {

		const palIdx = data[ i ];

		if ( alpha && palIdx === 255 ) {

			// Transparent pixel (used for '{' textures)
			rgba[ i * 4 ] = 0;
			rgba[ i * 4 + 1 ] = 0;
			rgba[ i * 4 + 2 ] = 0;
			rgba[ i * 4 + 3 ] = 0;

		} else {

			const color = d_8to24table[ palIdx ];
			rgba[ i * 4 ] = color & 0xff;
			rgba[ i * 4 + 1 ] = ( color >> 8 ) & 0xff;
			rgba[ i * 4 + 2 ] = ( color >> 16 ) & 0xff;
			rgba[ i * 4 + 3 ] = 255;

			if ( palIdx >= fullbrightStart ) hasFullbright = true;

		}

	}

	// If texture has fullbright pixels (palette 224-255), create a separate
	// fullbright texture for use as emissiveMap. Fullbright pixels should render
	// at full intensity regardless of lighting (e.g. glowing buttons, lava).
	// Set fullbright pixels to BLACK in the base texture so they don't get
	// darkened by the lightmap, and put them in the fullbright texture instead.
	if ( hasFullbright === true && splitFullbright === true ) {

		const fbRgba = new Uint8Array( width * height * 4 );

		for ( let i = 0; i < width * height; i ++ ) {

			const palIdx = data[ i ];

			if ( palIdx >= fullbrightStart && ! ( alpha && palIdx === 255 ) ) {

				// Copy to fullbright texture
				fbRgba[ i * 4 ] = rgba[ i * 4 ];
				fbRgba[ i * 4 + 1 ] = rgba[ i * 4 + 1 ];
				fbRgba[ i * 4 + 2 ] = rgba[ i * 4 + 2 ];
				fbRgba[ i * 4 + 3 ] = 255;

				// Black out in base texture
				rgba[ i * 4 ] = 0;
				rgba[ i * 4 + 1 ] = 0;
				rgba[ i * 4 + 2 ] = 0;

			}

		}

		fullbrightTexture = new THREE.DataTexture( fbRgba, width, height, THREE.RGBAFormat );
		const fbFilter = GL_TextureLinear() ? THREE.LinearFilter : THREE.NearestFilter;
		const fbMipFilter = GL_TextureLinear() ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter;
		fullbrightTexture.magFilter = fbFilter;
		fullbrightTexture.minFilter = mipmap ? fbMipFilter : fbFilter;
		fullbrightTexture.wrapS = THREE.RepeatWrapping;
		fullbrightTexture.wrapT = THREE.RepeatWrapping;
		fullbrightTexture.generateMipmaps = mipmap;
		fullbrightTexture.colorSpace = THREE.SRGBColorSpace;
		fullbrightTexture.needsUpdate = true;
		GL_RegisterTexture( fullbrightTexture );
		if ( loadmodel != null ) loadmodel._threeTextures.add( fullbrightTexture );

	}

	const texture = new THREE.DataTexture( rgba, width, height, THREE.RGBAFormat );
	// Use cvar to determine filter mode: 0 = nearest (pixelated), 1 = linear (smooth)
	const filter = GL_TextureLinear() ? THREE.LinearFilter : THREE.NearestFilter;
	const mipFilter = GL_TextureLinear() ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter;
	texture.magFilter = filter;
	texture.minFilter = mipmap ? mipFilter : filter;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.generateMipmaps = mipmap;
	texture.colorSpace = THREE.SRGBColorSpace;
	// the HDR ("Newer") lighting also filters textures anisotropically; classic stays as it was
	if ( GL_TextureLinear() && gl_texturemode.value === 0 ) texture.anisotropy = 16;
	// Note: flipY defaults to false for DataTexture, which is correct for Quake
	// Quake's UV T=0 at top + texture row 0 at V=0 means no flip is needed
	texture.needsUpdate = true;

	// Attach fullbright texture if one was created
	if ( fullbrightTexture != null ) {

		texture._fullbright = fullbrightTexture;

	}

	// Register for filter updates when setting changes
	GL_RegisterTexture( texture );
	if ( loadmodel != null ) loadmodel._threeTextures.add( texture );

	return texture;

}

export let previewLoad = false;
/**
 * Marks a load made only to look at a level (`Mod_LoadForPreview`): its inline models are not registered.
 *
 * @param {boolean} value true while such a load runs
 */
export function set_previewLoad( value ) { previewLoad = value; }

// ============================================================================
// Mod_FindName
// ============================================================================

/**
 * Returns the cache entry for a model name, claiming a new one (marked `needload`) the first time the name is seen
 * (WinQuake gl_model.c). Does not load anything.
 *
 * @param {string} name model path, e.g. 'progs/player.mdl', or a submodel name such as '*1'
 * @returns {model_t} the entry; the same object for the same name for the life of the page
 * @throws {Error} through `Sys_Error` for an empty name or when all 512 entries are in use
 */
export function Mod_FindName( name ) {

	if ( ! name || name.length === 0 )
		Sys_Error( 'Mod_ForName: NULL name' );

	// search the currently loaded models
	let i;
	for ( i = 0; i < mod_numknown; i ++ ) {

		if ( mod_known[ i ].name === name )
			break;

	}

	if ( i === mod_numknown ) {

		if ( mod_numknown === MAX_MOD_KNOWN )
			Sys_Error( 'mod_numknown == MAX_MOD_KNOWN' );
		if ( i === mod_known.length ) mod_known.push( new model_t() );
		mod_known[ i ].name = name;
		mod_known[ i ].needload = true;
		mod_numknown ++;

	}

	return mod_known[ i ];

}

// ============================================================================
// Helper: read a null-terminated string from Uint8Array
// ============================================================================

/**
 * Reads a NUL-terminated string of at most `maxLen` bytes, one character a byte.
 *
 * @param {Uint8Array} bytes the file
 * @param {number} offset where the string starts
 * @param {number} maxLen the field's size in bytes
 * @returns {string} the text before the first NUL (all `maxLen` bytes when there is none)
 */
export function readString( bytes, offset, maxLen ) {

	let s = '';
	for ( let i = 0; i < maxLen; i ++ ) {

		const c = bytes[ offset + i ];
		if ( c === 0 ) break;
		s += String.fromCharCode( c );

	}

	return s;

}

// ============================================================================
// RadiusFromBounds
// ============================================================================

/**
 * Returns the distance from the origin to the farthest corner of a box, using each axis's larger absolute bound
 * (WinQuake gl_model.c). Sets each brush submodel's `radius` at load.
 *
 * @param {Float32Array|Array<number>} mins box minimum (Quake units)
 * @param {Float32Array|Array<number>} maxs box maximum (Quake units)
 * @returns {number} the radius (Quake units)
 */
export function RadiusFromBounds( mins, maxs ) {

	const corner = new Float32Array( 3 );

	for ( let i = 0; i < 3; i ++ )
		corner[ i ] = Math.abs( mins[ i ] ) > Math.abs( maxs[ i ] ) ? Math.abs( mins[ i ] ) : Math.abs( maxs[ i ] );

	return Length( corner );

}
