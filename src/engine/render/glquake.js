/**
 * @module engine/render/glquake
 *
 * GL definitions and texture state (WinQuake glquake.h): the registry of game textures and their filtering.
 *
 * Types: exported classes `gltexture_t`, `glpoly_t`, `glvert_t`, `particle_t`.
 *
 * State: mutable exports `texture_extension_number`, `texture_mode`, `gldepthmin`, `gldepthmax`, `currenttexture`,
 * `cnttextures`, `particletexture`, `playertextures`, `gltextures`, `numgltextures`, `glv`, `glx` and 33 more;
 * module-level variables `gl_forcelinear`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/glquake.h -- GL definitions and state variables

import * as THREE from 'three';

/*
===============================================================================

GL DEFINITIONS AND STATE

===============================================================================
*/

export const ALIAS_BASE_SIZE_RATIO = ( 1.0 / 11.0 );
export const MAX_LBM_HEIGHT = 480;

export const TILE_SIZE = 128;

export const SKYSHIFT = 7;
export const SKYSIZE = ( 1 << SKYSHIFT );
export const SKYMASK = ( SKYSIZE - 1 );

export const BACKFACE_EPSILON = 0.01;

// Multitexture
export const TEXTURE0_SGIS = 0x835E;
export const TEXTURE1_SGIS = 0x835F;

//
// VERTEXSIZE for glpoly_t verts: x y z s t (lightmap s) (lightmap t)
//
export const VERTEXSIZE = 7;

export const MAXLIGHTMAPS = 4;

/*
===============================================================================

TEXTURE MANAGEMENT

===============================================================================
*/

export const MAX_GLTEXTURES = 1024;

export class gltexture_t {

	/**
	 * Creates an empty texture-registry slot (WinQuake gl_draw.c's `gltexture_t`): the texture's `identifier` name,
	 * GL texture number, size in texels, whether it is mip-mapped, and in this port the backing Three.js texture.
	 * `gl_draw.js` fills `gltextures` with these.
	 */
	constructor() {

		this.identifier = '';
		this.texnum = 0;
		this.width = 0;
		this.height = 0;
		this.mipmap = false;
		// Three.js texture reference
		this.texture = null;

	}

}

export let texture_extension_number = 1;
export let texture_mode = 0; // GL_LINEAR_MIPMAP_NEAREST equivalent

export let gldepthmin = 0;
export let gldepthmax = 0;

export let currenttexture = - 1;
export let cnttextures = [ - 1, - 1 ];
export let particletexture = 0;
export let playertextures = 0;

export let gltextures = [];
export let numgltextures = 0;

/**
 * Sets the next GL texture number to hand out (the setter for the exported `texture_extension_number` binding).
 * Kept for the ported API; nothing imports it at present.
 *
 * @param {number} n next texture number
 */
export function setTextureExtensionNumber( n ) {

	texture_extension_number = n;

}

/**
 * Hands out a texture number, as WinQuake's `texture_extension_number++`, and advances the counter (starts at 1).
 * Imported by `gl_rmisc.js` but not currently called.
 *
 * @returns {number} the number before incrementing
 */
export function getTextureExtensionNumber() {

	return texture_extension_number ++;

}

/*
===============================================================================

POLYGON STRUCTURE

===============================================================================
*/

export class glpoly_t {

	/**
	 * Creates an empty surface polygon (WinQuake glquake.h `glpoly_t`). `next` links the polygons of one surface
	 * (warped water is subdivided into several), `chain` links polygons queued for drawing, `flags` holds surface
	 * flags, and `verts` holds `numverts` vertices of `VERTEXSIZE` values each: x y z in Quake units (world space),
	 * texture s t, lightmap s t. Built by `gl_warp.js` when subdividing warped surfaces.
	 */
	constructor() {

		this.next = null;
		this.chain = null;
		this.numverts = 0;
		this.flags = 0;
		this.verts = []; // array of arrays, each [x,y,z,s,t,ls,lt]

	}

}

/*
===============================================================================

GL VERTEX TYPE

===============================================================================
*/

export class glvert_t {

	/**
	 * Creates a zeroed immediate-mode vertex (WinQuake glquake.h `glvert_t`): position x y z, texture s t and colour
	 * r g b. Only the exported scratch instance `glv` exists; nothing else constructs one.
	 */
	constructor() {

		this.x = 0;
		this.y = 0;
		this.z = 0;
		this.s = 0;
		this.t = 0;
		this.r = 0;
		this.g = 0;
		this.b = 0;

	}

}

export let glv = new glvert_t();

export let glx = 0;
export let gly = 0;
export let glwidth = 640;
export let glheight = 480;

/*
===============================================================================

PARTICLE TYPE

===============================================================================
*/

export const pt_static = 0;
export const pt_grav = 1;
export const pt_slowgrav = 2;
export const pt_fire = 3;
export const pt_explode = 4;
export const pt_explode2 = 5;
export const pt_blob = 6;
export const pt_blob2 = 7;

export class particle_t {

	/**
	 * Creates a free particle (WinQuake glquake.h `particle_t`). `org` (Quake units, world space) and `color`
	 * (palette index) are the driver-usable fields; `next` links the free or active list, `vel` is Quake units per
	 * second, `ramp` is the colour-ramp position, `die` the client time in seconds when it is removed, and `type` one
	 * of the `pt_*` behaviours. Nothing constructs this class at present: `r_part.js` declares and pools its own
	 * `particle_t`.
	 */
	constructor() {

		// driver-usable fields
		this.org = new Float32Array( 3 );
		this.color = 0;
		// drivers never touch the following fields
		this.next = null;
		this.vel = new Float32Array( 3 );
		this.ramp = 0;
		this.die = 0;
		this.type = pt_static;

	}

}

/*
===============================================================================

RENDER STATE VARIABLES

===============================================================================
*/

export let r_worldentity = null; // entity_t
export let r_cache_thrash = false;
export let modelorg = new Float32Array( 3 );
export let r_entorigin = new Float32Array( 3 );
export let currententity = null;
export let r_visframecount = 0;
export let r_framecount = 0;
/**
 * Sets the exported `r_framecount` binding, which other modules cannot assign. `gl_rmain.js`'s `R_NewMap` and
 * `gl_rsurf.js`'s `GL_BuildLightmaps` set it to 1 ("no dlightcache").
 *
 * @param {number} value new frame count
 */
export function set_r_framecount( value ) { r_framecount = value; }
/**
 * Advances `r_framecount`, the renderer's frame number used to tell whether per-frame marks are current. Called
 * once per rendered view by `R_SetupFrame`.
 *
 * @returns {number} the new frame count
 */
export function inc_r_framecount() { return ++ r_framecount; }
export let frustum = []; // mplane_t[4]
export let c_brush_polys = 0;
export let c_alias_polys = 0;

// view origin
export let vup = new Float32Array( 3 );
export let vpn = new Float32Array( 3 );
export let vright = new Float32Array( 3 );
export let r_origin = new Float32Array( 3 );

// screen size info
export let r_refdef = null; // refdef_t
export let r_viewleaf = null;
export let r_oldviewleaf = null;
export let r_notexture_mip = null;
export let d_lightstylevalue = new Int32Array( 256 );

export let envmap = false;

export let skytexturenum = - 1;
export let mirrortexturenum = - 1;
/**
 * Sets the exported `mirrortexturenum` binding: the index in the world model's textures of the mirror surface
 * texture. Set by `gl_rmisc.js`'s `R_NewMap` for each map.
 *
 * @param {number} value texture index, or -1 when the map has no mirror texture
 */
export function set_mirrortexturenum( value ) { mirrortexturenum = value; }
export let mirror = false;
export let mirror_plane = null;

export let r_world_matrix = new Float32Array( 16 );

// GL format constants (mapped to WebGL equivalents conceptually)
export let gl_lightmap_format = 4; // GL_RGBA
export let gl_solid_format = 3; // GL_RGB
export let gl_alpha_format = 4; // GL_RGBA

export let gl_mtexable = false;

/*
===============================================================================

CVARS (placeholder objects matching cvar_t structure)

===============================================================================
*/

export const r_norefresh = { name: 'r_norefresh', string: '0', value: 0 };
export const r_drawentities = { name: 'r_drawentities', string: '1', value: 1 };
export const r_drawworld = { name: 'r_drawworld', string: '1', value: 1 };
export const r_drawviewmodel = { name: 'r_drawviewmodel', string: '1', value: 1 };
export const r_speeds = { name: 'r_speeds', string: '0', value: 0 };
export const r_waterwarp = { name: 'r_waterwarp', string: '1', value: 1 };
export const r_fullbright = { name: 'r_fullbright', string: '0', value: 0 };
export const r_lightmap = { name: 'r_lightmap', string: '0', value: 0 };
export const r_shadows = { name: 'r_shadows', string: '0', value: 0 };
export const r_mirroralpha = { name: 'r_mirroralpha', string: '1', value: 1 };
export const r_wateralpha = { name: 'r_wateralpha', string: '1', value: 1 };
export const r_dynamic = { name: 'r_dynamic', string: '1', value: 1 };
export const r_novis = { name: 'r_novis', string: '0', value: 0 };

export const gl_clear = { name: 'gl_clear', string: '0', value: 0 };
export const gl_cull = { name: 'gl_cull', string: '1', value: 1 };
export const gl_texsort = { name: 'gl_texsort', string: '1', value: 1 };
export const gl_smoothmodels = { name: 'gl_smoothmodels', string: '1', value: 1 };
export const gl_affinemodels = { name: 'gl_affinemodels', string: '0', value: 0 };
export const gl_polyblend = { name: 'gl_polyblend', string: '1', value: 1 };
export const gl_keeptjunctions = { name: 'gl_keeptjunctions', string: '0', value: 0 };
export const gl_reporttjunctions = { name: 'gl_reporttjunctions', string: '0', value: 0 };
export const gl_flashblend = { name: 'gl_flashblend', string: '1', value: 1 };
export const gl_nocolors = { name: 'gl_nocolors', string: '0', value: 0 };
export const gl_doubleeyes = { name: 'gl_doubleeys', string: '1', value: 1 };
export const gl_max_size = { name: 'gl_max_size', string: '1024', value: 1024 };
export const gl_playermip = { name: 'gl_playermip', string: '0', value: 0 };
export const gl_subdivide_size = { name: 'gl_subdivide_size', string: '128', value: 128, archive: true };
// Texture filtering: 0 = nearest (pixelated), 1 = linear (smooth)
export const gl_texturemode = { name: 'gl_texturemode', string: '0', value: 0, archive: true };

// The Newer lighting always filters textures smoothly (linear, mip-mapped and
// anisotropic), whatever gl_texturemode says; the user's own setting is left
// alone and comes back when Newer is switched off.
let gl_forcelinear = false;

/**
 * Says whether game textures should be filtered smoothly: true while the Newer lighting forces it
 * (`GL_SetForceLinear`) or when `gl_texturemode` is non-zero. Used by `gl_model.js` when it creates textures.
 *
 * @returns {boolean} true for linear filtering, false for nearest (pixelated)
 */
export function GL_TextureLinear() {

	return gl_forcelinear || gl_texturemode.value !== 0;

}

/**
 * Turns forced smooth filtering on or off and, when that changes, refilters every registered texture. Called each
 * frame by Newer Game's `R_PostBegin` with whether its post-processing is active; the `gl_texturemode` cvar itself is
 * not changed. The flag lasts until the next change.
 *
 * @param {boolean} force true to force linear, mip-mapped, 16x anisotropic filtering
 */
export function GL_SetForceLinear( force ) {

	if ( force === gl_forcelinear ) return;
	gl_forcelinear = force;
	GL_UpdateTextureFiltering();

}

// Track all game textures for filter updates
export const _allGameTextures = [];

/**
 * Adds a game texture to the list `GL_UpdateTextureFiltering` refilters (`_allGameTextures`). Called when world
 * and model textures and the particle texture are created; a texture already listed is not added twice. It stays
 * listed until `GL_UnregisterTexture`.
 *
 * @param {?THREE.Texture} texture texture to track; null or undefined is ignored
 */
export function GL_RegisterTexture( texture ) {

	if ( texture != null && _allGameTextures.includes( texture ) === false ) {

		_allGameTextures.push( texture );

	}

}

/**
 * Removes a texture from the refilter list, so a disposed texture is no longer touched. Called by `Mod_ClearAll`
 * for the textures of the models it frees.
 *
 * @param {?THREE.Texture} texture texture to stop tracking; null, undefined or an unlisted texture is ignored
 */
export function GL_UnregisterTexture( texture ) {

	if ( texture == null ) return;
	const index = _allGameTextures.indexOf( texture );
	if ( index !== - 1 ) _allGameTextures.splice( index, 1 );

}

/**
 * Applies the current filtering choice (`GL_TextureLinear`) to every registered texture: linear or nearest
 * magnification, the matching mip-mapped minification for textures that generate mipmaps, anisotropy 16 while
 * forced linear (otherwise 1), and a GPU re-upload. Each texture's `userData.normalSamplerUpdates` counter is bumped
 * so code that caches derived normal maps can tell it was a sampler change, not new pixels. Called when the
 * texture-filtering menu option changes and by `GL_SetForceLinear`.
 */
export function GL_UpdateTextureFiltering() {

	const linear = GL_TextureLinear();
	const filter = linear ? THREE.LinearFilter : THREE.NearestFilter;
	const mipFilter = linear ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter;

	for ( const texture of _allGameTextures ) {

		if ( texture ) {

			texture.anisotropy = gl_forcelinear ? 16 : 1;
			texture.magFilter = filter;
			texture.minFilter = texture.generateMipmaps ? mipFilter : filter;
			// Sampler changes require a GPU refresh, not new scalar/normal pixels.
			texture.userData.normalSamplerUpdates=(texture.userData.normalSamplerUpdates||0)+1;
			texture.needsUpdate = true;

		}

	}

}

/*
===============================================================================

THREE.JS HELPER FUNCTIONS
(Replacing raw GL_Bind / GL_BeginRendering / etc.)

===============================================================================
*/

/**
 * Records `texnum` as the bound texture in `currenttexture`; nothing is bound on the GPU (Three.js materials carry
 * their textures). Kept for the ported sky code in `gl_warp.js`.
 *
 * @param {*} texnum texture number or texture object to record
 */
export function GL_Bind( texnum ) {

	currenttexture = texnum;

}

/**
 * No-op in Three.js, kept for the ported call sites in `gl_warp.js` (WinQuake switches back to a single texture
 * unit here).
 */
export function GL_DisableMultitexture() {

	// no-op in Three.js

}

/**
 * No-op in Three.js (WinQuake selects the second texture unit here). Nothing calls it at present.
 */
export function GL_EnableMultitexture() {

	// no-op in Three.js

}

/**
 * No-op placeholder for WinQuake's `GL_BeginRendering`, which reports the drawable area. In Three.js, rendering is
 * handled by the renderer, and these values are set by the video initialization. Nothing imports this one: the
 * screen code uses the version `host.js` injects into `gl_screen.js`.
 *
 * @param {number} x left edge in pixels (unused)
 * @param {number} y top edge in pixels (unused)
 * @param {number} width width in pixels (unused)
 * @param {number} height height in pixels (unused)
 */
export function GL_BeginRendering( x, y, width, height ) {

	// In Three.js, rendering is handled by the renderer
	// These values are set by the video initialization

}

/**
 * No-op in Three.js (WinQuake swaps buffers here). Nothing imports this one: `gl_screen.js` calls the version
 * injected through its externals.
 */
export function GL_EndRendering() {

	// no-op in Three.js

}

// v_blend for dynamic light blend effects
export let v_blend = new Float32Array( 4 );
// Same frame flashes, excluding the legacy contents tint for optical liquids.
export const v_liquid_blend = new Float32Array( 4 );
