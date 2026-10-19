/**
 * @module engine/render/gl_model_types
 *
 * The model formats' constants and in-memory structures (card [44k], split from gl_model.js; WinQuake gl_model.h,
 * modelgen.h, spritegn.h): the alias and sprite file constants, entity effects, surface flags, and the classes the
 * loaders fill (`model_t`, the BSP's planes, surfaces, nodes, leafs and hulls, the alias header and frames, the
 * sprite frames).
 *
 * Types: exported classes `mvertex_t`, `mplane_t`, `texture_t`, `medge_t`, `mtexinfo_t`, `msurface_t`, `mnode_t`,
 * `mleaf_t`, `dclipnode_t`, `hull_t`, `mspriteframe_t`, `mspritegroup_t`, `mspriteframedesc_t`, `msprite_t`,
 * `trivertx_t`, `stvert_t`, `mtriangle_t`, `maliasframedesc_t`, `aliashdr_t`, `dmodel_t`, `model_t`.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
import { MAX_MAP_HULLS, MIPLEVELS, MAXLIGHTMAPS, NUM_AMBIENTS } from '../common/bspfile.js';

// ============================================================================
// modelgen.h constants
// ============================================================================

export const ALIAS_VERSION = 6;
export const ALIAS_ONSEAM = 0x0020;

// synctype_t
export const ST_SYNC = 0;
export const ST_RAND = 1;

// aliasframetype_t
export const ALIAS_SINGLE = 0;
export const ALIAS_GROUP = 1;

// aliasskintype_t
export const ALIAS_SKIN_SINGLE = 0;
export const ALIAS_SKIN_GROUP = 1;

export const DT_FACES_FRONT = 0x0010;

// little-endian "IDPO"
export const IDPOLYHEADER = ( 'O'.charCodeAt( 0 ) << 24 ) + ( 'P'.charCodeAt( 0 ) << 16 ) + ( 'D'.charCodeAt( 0 ) << 8 ) + 'I'.charCodeAt( 0 );

export const ALIAS_BASE_SIZE_RATIO = ( 1.0 / 11.0 );
export const MAX_LBM_HEIGHT = 480;

// ============================================================================
// spritegn.h constants
// ============================================================================

export const SPRITE_VERSION = 1;

export const SPR_VP_PARALLEL_UPRIGHT = 0;
export const SPR_FACING_UPRIGHT = 1;
export const SPR_VP_PARALLEL = 2;
export const SPR_ORIENTED = 3;
export const SPR_VP_PARALLEL_ORIENTED = 4;

// spriteframetype_t
export const SPR_SINGLE = 0;
export const SPR_GROUP = 1;

// little-endian "IDSP"
export const IDSPRITEHEADER = ( 'P'.charCodeAt( 0 ) << 24 ) + ( 'S'.charCodeAt( 0 ) << 16 ) + ( 'D'.charCodeAt( 0 ) << 8 ) + 'I'.charCodeAt( 0 );

// ============================================================================
// gl_model.h -- entity effects
// ============================================================================

export const EF_BRIGHTFIELD = 1;
export const EF_MUZZLEFLASH = 2;
export const EF_BRIGHTLIGHT = 4;
export const EF_DIMLIGHT = 8;

// ============================================================================
// Surface flags
// ============================================================================

export const SURF_PLANEBACK = 2;
export const SURF_DRAWSKY = 4;
export const SURF_DRAWSPRITE = 8;
export const SURF_DRAWTURB = 0x10;
export const SURF_DRAWTILED = 0x20;
export const SURF_DRAWBACKGROUND = 0x40;
export const SURF_UNDERWATER = 0x80;

// ============================================================================
// Plane sides
// ============================================================================

export const SIDE_FRONT = 0;
export const SIDE_BACK = 1;
export const SIDE_ON = 2;

// ============================================================================
// GL poly vertex size
// ============================================================================

export const VERTEXSIZE = 7;

// ============================================================================
// Model types
// ============================================================================

export const mod_brush = 0;
export const mod_sprite = 1;
export const mod_alias = 2;

// ============================================================================
// Entity effect flags (model flags from MDL header)
// ============================================================================

export const EF_ROCKET = 1;		// leave a trail
export const EF_GRENADE = 2;		// leave a trail
export const EF_GIB = 4;			// leave a trail
export const EF_ROTATE = 8;		// rotate (bonus items)
export const EF_TRACER = 16;		// green split trail
export const EF_ZOMGIB = 32;		// small blood trail
export const EF_TRACER2 = 64;		// orange split trail + rotate
export const EF_TRACER3 = 128;		// purple trail

// ============================================================================
// Alias model limits
// ============================================================================

export const MAX_SKINS = 32;
export const MAXALIASVERTS = 2000; // Quakespasm's (FitzQuake raised WinQuake's 1024): Arcane Dimensions' monsters need more (docs/add-ons-2026-10-13.md)
export const MAXALIASFRAMES = 256;
export const MAXALIASTRIS = 4096; // Quakespasm's (WinQuake's 2048)

// ============================================================================
// In-memory model structures (m*_t)
// ============================================================================

export class mvertex_t {

	/**
	 * A BSP vertex (gl_model.h): `position` in model space (Quake units). Filled by `Mod_LoadVertexes` at load; kept
	 * in `model_t.vertexes` until the model is reloaded.
	 */
	constructor() {

		this.position = new Float32Array( 3 );

	}

}

export class mplane_t {

	/**
	 * A BSP plane (gl_model.h): points p with `DotProduct(p, normal) = dist`. `normal` is a unit vector, `dist` in
	 * Quake units, `type` 0..2 for a plane facing along x, y or z (fast side tests) or 3..5 otherwise, `signbits` the
	 * signs of the normal (signx + signy<<1 + signz<<2) for `BoxOnPlaneSide`. Filled by `Mod_LoadPlanes`; gl_rmain.js
	 * also uses four for the view frustum.
	 */
	constructor() {

		this.normal = new Float32Array( 3 );
		this.dist = 0;
		this.type = 0;		// for texture axis selection and fast side tests
		this.signbits = 0;	// signx + signy<<1 + signz<<2

	}

}

export class texture_t {

	/**
	 * A world texture (gl_model.h): name, size in texels, the four mip levels' 8-bit palette pixels (`pixels` with
	 * `offsets`), the animation chain (`anim_*`, `anim_next`, `alternate_anims`; `anim_total` in tenths of a second, 0
	 * for none) and the texture chain built while drawing. `gl_texture` (a `THREE.DataTexture`) is set when the texture
	 * is uploaded. Made by `Mod_LoadTextures`, the crate variants and `R_InitTextures`; its GPU texture is released by
	 * `Mod_ClearAll` at the next level change.
	 */
	constructor() {

		this.name = '';
		this.width = 0;
		this.height = 0;
		this.gl_texturenum = 0;
		this.texturechain = null;	// for gl_texsort drawing
		this.anim_total = 0;		// total tenths in sequence ( 0 = no)
		this.anim_min = 0;
		this.anim_max = 0;
		this.anim_next = null;		// in the animation sequence
		this.alternate_anims = null;	// bmodels in frame 1 use these
		this.offsets = new Uint32Array( MIPLEVELS );	// four mip maps stored
		this.pixels = null;			// Uint8Array of raw pixel data

	}

}

export class medge_t {

	/**
	 * A BSP edge (gl_model.h): `v` the indices of its two vertices in `model_t.vertexes`; `cachededgeoffset` is
	 * unused by the GL renderer; `bad` (set by `Mod_LoadEdges`) when a vertex index is past the map's, which is refused
	 * only if a face uses the edge (`Mod_LoadFaces`). Filled by `Mod_LoadEdges`.
	 */
	constructor() {

		this.v = new Uint32Array( 2 );
		this.cachededgeoffset = 0;

	}

}

export class mtexinfo_t {

	/**
	 * A surface's texture mapping (gl_model.h): `vecs[0]` and `vecs[1]` give s and t in texels as
	 * `DotProduct(point, vecs[i]) + vecs[i][3]`; `texture` the `texture_t` (the checkerboard when missing); `flags`
	 * TEX_SPECIAL for sky and liquid. Filled by `Mod_LoadTexinfo` and the crate variants.
	 */
	constructor() {

		this.vecs = [
			new Float32Array( 4 ),
			new Float32Array( 4 )
		];
		this.mipadjust = 0;
		this.texture = null;
		this.flags = 0;

	}

}

export class msurface_t {

	/**
	 * A BSP face (gl_model.h): its plane, SURF_* `flags`, edge range (`firstedge`/`numedges` into
	 * `model_t.surfedges`, negative numbers are backwards edges), texture extents in texels, lightmap placement and
	 * styles, and the per-frame drawing state (`visframe`, `dlightframe`/`dlightbits` set by `R_MarkLights`,
	 * `texturechain`). `samples`/`sampleOffset` and `litsamples`/`litOffset` locate its lightmap in the model's
	 * lightdata and LIT data. `polys` is set for sky and liquid surfaces by `GL_SubdivideSurface`. Filled by
	 * `Mod_LoadFaces`.
	 */
	constructor() {

		this.visframe = 0;		// should be drawn when node is crossed

		this.plane = null;
		this.flags = 0;

		this.firstedge = 0;		// look up in model->surfedges[], negative numbers
		this.numedges = 0;		// are backwards edges

		this.texturemins = new Int16Array( 2 );
		this.extents = new Int16Array( 2 );

		this.light_s = 0;
		this.light_t = 0;		// gl lightmap coordinates

		this.polys = null;				// multiple if warped
		this.texturechain = null;

		this.texinfo = null;

		// lighting info
		this.dlightframe = 0;
		this.dlightbits = 0;

		this.lightmaptexturenum = 0;
		this.styles = new Uint8Array( MAXLIGHTMAPS );
		this.cached_light = new Int32Array( MAXLIGHTMAPS );	// values currently used in lightmap
		this.cached_dlight = false;							// true if dynamic light in cache
		this.samples = null;		// Uint8Array -- [numstyles*surfsize]
		this.sampleOffset = 0;		// offset into lightdata
		this.litsamples = null;		// Uint8Array -- the coloured version of samples (litdata), or null
		this.litOffset = 0;			// offset into litdata

	}

}

export class mnode_t {

	/**
	 * A BSP decision node (gl_model.h): `contents` 0 (to tell it from a leaf), the splitting `plane`, `children`
	 * (front, back: an `mnode_t` or `mleaf_t`), its surfaces (`firstsurface`/`numsurfaces`), bounds in `minmaxs`
	 * (mins then maxs, Quake units) and the `visframe` marked by the PVS walk. Filled by `Mod_LoadNodes`.
	 */
	constructor() {

		// common with leaf
		this.contents = 0;		// 0, to differentiate from leafs
		this.visframe = 0;		// node needs to be traversed if current

		this.minmaxs = new Float32Array( 6 );	// for bounding box culling

		this.parent = null;

		// node specific
		this.plane = null;
		this.children = [ null, null ];

		this.firstsurface = 0;
		this.numsurfaces = 0;

	}

}

export class mleaf_t {

	/**
	 * A BSP leaf (gl_model.h): `contents` a negative CONTENTS_* value, bounds in `minmaxs`, its compressed PVS row
	 * (`compressed_vis` from `compressed_vis_offset`, read by `Mod_LeafPVS`), the surfaces it marks
	 * (`firstmarksurface`/`nummarksurfaces` into `model_t.marksurfaces`), static entity fragments (`efrags`) and the four
	 * ambient sound levels (0..255). `Mod_LoadLeafs` also stores its index in `_leafIndex` for PVS checks.
	 */
	constructor() {

		// common with node
		this.contents = 0;		// will be a negative contents number
		this.visframe = 0;		// node needs to be traversed if current

		this.minmaxs = new Float32Array( 6 );	// for bounding box culling

		this.parent = null;

		// leaf specific
		this.compressed_vis = null;		// Uint8Array slice
		this.compressed_vis_offset = 0;
		this.efrags = null;

		this.firstmarksurface = 0;		// index into marksurfaces array
		this.nummarksurfaces = 0;
		this.key = 0;					// BSP sequence number for leaf's contents
		this.ambient_sound_level = new Uint8Array( NUM_AMBIENTS );

	}

}

export class dclipnode_t {

	/**
	 * A clipping-hull node (bspfile.h): `planenum` into the hull's planes, `children` front and back, each a clipnode
	 * index or a negative CONTENTS_* value. Filled by `Mod_LoadClipnodes`, and by `Mod_MakeHull0` from the drawing
	 * nodes.
	 */
	constructor() {

		this.planenum = 0;
		this.children = new Int32Array( 2 );

	}

}

export class hull_t {

	/**
	 * A clipping hull for one box size (gl_model.h): the `clipnodes` and `planes` it walks, its clipnode range
	 * (`firstclipnode`..`lastclipnode`), and the box it was built for (`clip_mins`/`clip_maxs`, Quake units: 0 for
	 * hull 0, the player's -16,-16,-24..16,16,32 for hull 1, the large -32,-32,-24..32,32,64 for hull 2). Each
	 * `model_t` has MAX_MAP_HULLS of them; traced by world.js.
	 */
	constructor() {

		this.clipnodes = null;	// array of dclipnode_t
		this.planes = null;		// array of mplane_t
		this.firstclipnode = 0;
		this.lastclipnode = 0;
		this.clip_mins = new Float32Array( 3 );
		this.clip_maxs = new Float32Array( 3 );

	}

}

// ============================================================================
// Sprite model structures
// ============================================================================

export class mspriteframe_t {

	/**
	 * One sprite image (gl_model.h): `width`/`height` in pixels, its extent around the sprite origin (`up`, `down`,
	 * `left`, `right`, pixels = Quake units), and `gl_texturenum`, which here holds the frame's `THREE.DataTexture`.
	 * Made by `Mod_LoadSpriteFrame`.
	 */
	constructor() {

		this.width = 0;
		this.height = 0;
		this.up = 0;
		this.down = 0;
		this.left = 0;
		this.right = 0;
		this.gl_texturenum = 0;

	}

}

export class mspritegroup_t {

	/**
	 * An animated group of sprite frames (gl_model.h): `numframes`, the `frames` and `intervals`, each frame's
	 * cumulative end time in seconds within the loop. Made by `Mod_LoadSpriteGroup`.
	 */
	constructor() {

		this.numframes = 0;
		this.intervals = null;	// Float32Array
		this.frames = [];		// array of mspriteframe_t

	}

}

export class mspriteframedesc_t {

	/**
	 * One entry of a sprite's frame list (gl_model.h): `type` SPR_SINGLE or SPR_GROUP, and `frameptr` the
	 * `mspriteframe_t` or `mspritegroup_t`.
	 */
	constructor() {

		this.type = 0;			// spriteframetype_t
		this.frameptr = null;	// mspriteframe_t or mspritegroup_t

	}

}

export class msprite_t {

	/**
	 * A loaded sprite (gl_model.h): its orientation `type` (SPR_VP_PARALLEL_UPRIGHT etc.), the largest frame size in
	 * pixels, `beamlength`, and `frames` (`mspriteframedesc_t`). Made by `Mod_LoadSpriteModel` and kept in the model's
	 * `cache.data` until `Mod_ClearAll`.
	 */
	constructor() {

		this.type = 0;
		this.maxwidth = 0;
		this.maxheight = 0;
		this.numframes = 0;
		this.beamlength = 0;
		this.cachespot = null;
		this.frames = [];		// array of mspriteframedesc_t

	}

}

// ============================================================================
// Alias model structures
// ============================================================================

export class trivertx_t {

	/**
	 * A packed alias-model vertex (modelgen.h): `v` x, y, z as 0..255, scaled by the header's `scale` and offset by
	 * `scale_origin` to model space; `lightnormalindex` into the 162 precomputed normals. Used for the frame bounding
	 * boxes.
	 */
	constructor() {

		this.v = new Uint8Array( 3 );
		this.lightnormalindex = 0;

	}

}

export class stvert_t {

	/**
	 * An alias-model skin coordinate (modelgen.h): `s`, `t` in skin texels and `onseam` (ALIAS_ONSEAM when a back-facing
	 * triangle's vertex must be shifted by half the skin width). gl_model.js keeps one shared pool of MAXALIASVERTS,
	 * overwritten by each alias model loaded.
	 */
	constructor() {

		this.onseam = 0;
		this.s = 0;
		this.t = 0;

	}

}

export class mtriangle_t {

	/**
	 * An alias-model triangle in memory (gl_model.h): `facesfront` and the three vertex indices into the model's
	 * vertices. gl_model.js keeps one shared pool of MAXALIASTRIS, overwritten by each alias model loaded.
	 */
	constructor() {

		this.facesfront = 0;
		this.vertindex = new Int32Array( 3 );
		// RAPO's per-corner texture index; MDL triangles use the same index as vertindex.
		this.stindex = new Int32Array( 3 );

	}

}

export class maliasframedesc_t {

	/**
	 * One alias-model frame (gl_model.h): its poses (`firstpose`, `numposes`; several for an animated group, which
	 * advance every `interval` seconds), the packed bounding box (`bboxmin`, `bboxmax`), and the frame's `name`. Filled
	 * by the alias frame loaders.
	 */
	constructor() {

		this.firstpose = 0;
		this.numposes = 0;
		this.interval = 0;
		this.bboxmin = new trivertx_t();
		this.bboxmax = new trivertx_t();
		this.frame = 0;
		this.name = '';

	}

}

export class aliashdr_t {

	/**
	 * A loaded alias model's header (gl_model.h): the MDL header fields (`scale`/`scale_origin` to unpack vertices,
	 * `boundingradius`, `eyeposition`, skin size in texels, counts, `synctype`, `flags` EF_ROCKET etc., `size` the
	 * file's size × ALIAS_BASE_SIZE_RATIO), the decoded poses (`posedata`/`poseverts`), the GL command list, each
	 * skin's four animation textures in `gl_texturenum[skin][0..3]` (THREE textures), the skins' 8-bit `texels` kept
	 * for player colour remapping, and the `frames`. Made by `Mod_LoadAliasModel` and kept in the model's
	 * `cache.data`; alias models stay cached across level changes.
	 */
	constructor() {

		this.ident = 0;
		this.version = 0;
		this.scale = new Float32Array( 3 );
		this.scale_origin = new Float32Array( 3 );
		this.boundingradius = 0;
		this.eyeposition = new Float32Array( 3 );
		this.numskins = 0;
		this.skinwidth = 0;
		this.skinheight = 0;
		this.numverts = 0;
		this.numtris = 0;
		this.numframes = 0;
		this.synctype = 0;
		this.flags = 0;
		this.size = 0;

		this.numposes = 0;
		this.poseverts = 0;
		this.posedata = null;		// array of trivertx_t arrays
		this.commands = null;		// gl command list with embedded s/t
		this.gl_texturenum = [];	// [MAX_SKINS][4]
		this.texels = [];			// [MAX_SKINS] - only for player skins
		this.frames = [];			// array of maliasframedesc_t
		this.lightZCentre = null;	// Hexen II lighting samples here instead of the entity origin (whole model)

		// Initialize gl_texturenum as 2D array
		for ( let i = 0; i < MAX_SKINS; i ++ ) {

			this.gl_texturenum[ i ] = [ 0, 0, 0, 0 ];
			this.texels[ i ] = 0;

		}

	}

}

// ============================================================================
// dmodel_t -- on-disk submodel structure
// ============================================================================

export class dmodel_t {

	/**
	 * A brush submodel as stored in the BSP (bspfile.h): bounds and origin (Quake units), the root node of each hull
	 * (`headnode`), the number of visible leaves (`visleafs`) and its face range. Filled by `Mod_LoadSubmodels`; the
	 * world is entry 0 and the doors, platforms and other brush entities are `*1`, `*2`...
	 */
	constructor() {

		this.mins = new Float32Array( 3 );
		this.maxs = new Float32Array( 3 );
		this.origin = new Float32Array( 3 );
		this.headnode = new Int32Array( MAX_MAP_HULLS );
		this.visleafs = 0;
		this.firstface = 0;
		this.numfaces = 0;

	}

}

// ============================================================================
// Whole model
// ============================================================================

export class model_t {

	/**
	 * One entry of the model cache (gl_model.h): a brush model (world or submodel), alias model or sprite, by `type`
	 * (mod_brush, mod_sprite, mod_alias). Holds the graphic bounds and radius (Quake units), the brush model's lumps
	 * (planes, leafs, vertexes, edges, nodes, texinfo, surfaces, surfedges, clipnodes, marksurfaces, hulls, textures,
	 * visdata, lightdata, litdata, entities), and `cache.data` (the `aliashdr_t` or `msprite_t`). `_threeTextures`
	 * collects the GPU textures made for it, released by `Mod_ClearAll`. The module allocates 512 of these once
	 * (`Mod_FindName` reuses them by name); `needload` marks one whose data must be loaded again.
	 */
	constructor() {

		this.name = '';
		this.needload = false;		// bmodels and sprites don't cache normally

		this.type = 0;				// modtype_t
		this.numframes = 0;
		this.synctype = 0;

		this.flags = 0;

		// volume occupied by the model graphics
		this.mins = new Float32Array( 3 );
		this.maxs = new Float32Array( 3 );
		this.radius = 0;

		// solid volume for clipping
		this.clipbox = false;
		this.clipmins = new Float32Array( 3 );
		this.clipmaxs = new Float32Array( 3 );

		// brush model
		this.firstmodelsurface = 0;
		this.nummodelsurfaces = 0;

		this.numsubmodels = 0;
		this.hullCount = 4;		// hulls this level defines: 4 for Quake, 8 for Hexen II
		this.submodels = null;		// array of dmodel_t

		this.numplanes = 0;
		this.planes = null;			// array of mplane_t

		this.numleafs = 0;			// number of visible leafs, not counting 0
		this.leafs = null;			// array of mleaf_t

		this.numvertexes = 0;
		this.vertexes = null;		// array of mvertex_t

		this.numedges = 0;
		this.edges = null;			// array of medge_t

		this.numnodes = 0;
		this.nodes = null;			// array of mnode_t

		this.numtexinfo = 0;
		this.texinfo = null;		// array of mtexinfo_t

		this.numsurfaces = 0;
		this.surfaces = null;		// array of msurface_t

		this.numsurfedges = 0;
		this.surfedges = null;		// Int32Array

		this.numclipnodes = 0;
		this.clipnodes = null;		// array of dclipnode_t

		this.nummarksurfaces = 0;
		this.marksurfaces = null;	// array of indices into surfaces

		this.hulls = [];
		for ( let i = 0; i < MAX_MAP_HULLS; i ++ )
			this.hulls[ i ] = new hull_t();

		this.numtextures = 0;
		this.textures = null;		// array of texture_t

		this.visdata = null;		// Uint8Array
		this.lightdata = null;		// Uint8Array
		this.litdata = null;		// Uint8Array, RGB: three bytes per byte of lightdata (a LIT file), or null
		this.entities = null;		// string

		// additional model data
		this.cache = { data: null };	// cache_user_t equivalent
		this._threeTextures = new Set();

	}

}
