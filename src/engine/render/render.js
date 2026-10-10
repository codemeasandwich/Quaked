/**
 * @module engine/render/render
 *
 * The renderer's interface (WinQuake render.h): `entity_t`, `refdef`, the view rectangle.
 *
 * Types: exported classes `efrag_t`, `entity_t`, `refdef_t`.
 *
 * State: mutable exports `r_notexture_mip`, `reinit_surfcache`, `r_cache_thrash`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/render.h -- public interface to refresh functions

import { entity_state_t } from '../common/quakedef.js';
import { vrect_t } from './vid.js';
import { MSG_ReadCoord, MSG_ReadChar, MSG_ReadByte } from '../common/common.js';
import {
	R_RunParticleEffect as _R_RunParticleEffect,
	R_RocketTrail as _R_RocketTrail,
	R_EntityParticles as _R_EntityParticles,
	R_BlobExplosion as _R_BlobExplosion,
	R_ParticleExplosion as _R_ParticleExplosion,
	R_ParticleExplosion2 as _R_ParticleExplosion2,
	R_LavaSplash as _R_LavaSplash,
	R_TeleportSplash as _R_TeleportSplash
} from './r_part.js';
import { R_FireballSpawn, R_SmokeTrail } from '../common/hooks.js'; // installed by newer/render/r_fireball.js
import { R_DemoSplitActive } from '../common/hooks.js'; // installed by newer/render/r_demosplit.js

//============================================================================
// Constants
//============================================================================

export const MAXCLIPPLANES = 11;

export const TOP_RANGE = 16; // soldier uniform colors
export const BOTTOM_RANGE = 96;

//============================================================================
// efrag_t -- entity fragment for BSP leaf association
//============================================================================

export class efrag_t {

	/**
	 * Creates an empty entity fragment (WinQuake render.h efrag_t): one link between a static entity and a BSP leaf it
	 * touches, threaded on two lists (the leaf's `leafnext` chain and the entity's `entnext` chain). client.js allocates
	 * the `MAX_EFRAGS` pool (`cl_efrags`) once; gl_refrag.js R_AddEfrags / R_RemoveEfrags link and unlink entries.
	 */
	constructor() {

		this.leaf = null; // mleaf_t
		this.leafnext = null; // efrag_t -- next efrag in same leaf
		this.entity = null; // entity_t -- owning entity
		this.entnext = null; // efrag_t -- next efrag for same entity

	}

}

//============================================================================
// entity_t -- client-side entity state
//============================================================================

export class entity_t {

	/**
	 * Creates a cleared client-side entity (WinQuake render.h entity_t): what the renderer draws for one edict, static
	 * entity, temp entity, the view weapon or the world. client.js allocates the `cl_entities`, `cl_static_entities` and
	 * `cl_temp_entities` pools once and cl_main.js replaces `cl_entities` entries on a level change (CL_ClearState).
	 * Positions are Quake units in world space and angles degrees; `msg_origins` / `msg_angles` keep the last two
	 * server updates (index 0 newest) for interpolation, and `msgtime` is the `cl.mtime` of the last update.
	 */
	constructor() {

		this.forcelink = false; // model changed

		this.update_type = 0;

		this.baseline = new entity_state_t(); // to fill in defaults in updates

		this.msgtime = 0; // time of last update
		this.msg_origins = [
			new Float32Array( 3 ), // last two updates (0 is newest)
			new Float32Array( 3 )
		];
		this.origin = new Float32Array( 3 );
		this.msg_angles = [
			new Float32Array( 3 ), // last two updates (0 is newest)
			new Float32Array( 3 )
		];
		this.angles = new Float32Array( 3 );
		this.model = null; // model_t -- NULL = no model
		this.efrag = null; // efrag_t -- linked list of efrags
		this.frame = 0;
		this.syncbase = 0; // for client-side animations
		this.colormap = null; // byte pointer
		this.effects = 0; // light, particles, etc
		this.skinnum = 0; // for Alias models
		this.visframe = 0; // last frame this entity was found in an active leaf

		this.dlightframe = 0; // dynamic lighting
		this.dlightbits = 0;

		// FIXME: could turn these into a union
		this.trivial_accept = 0;
		this.topnode = null; // mnode_t -- for bmodels, first world node
		                     // that splits bmodel, or NULL if not split

	}

}

//============================================================================
// refdef_t -- refresh definition
//
// !!! if this is changed, it must be changed in asm_draw.h too !!!
//============================================================================

export class refdef_t {

	/**
	 * Creates a zeroed refresh definition (WinQuake render.h refdef_t): the view rectangle in screen pixels, its
	 * derived edges, the field of view (`fov_x`, `fov_y` in degrees), the eye position `vieworg` (Quake units, world
	 * space) and `viewangles` (degrees). A single instance, `r_refdef`, lives for the whole session; view.js and
	 * chase.js write it each frame and the renderer reads it.
	 */
	constructor() {

		this.vrect = new vrect_t(); // subwindow in video for refresh
		this.vrectScale = 1; // backing pixels per virtual 2D coordinate
		this.aliasvrect = new vrect_t(); // scaled Alias version
		this.vrectright = 0;
		this.vrectbottom = 0; // right & bottom screen coords
		this.aliasvrectright = 0;
		this.aliasvrectbottom = 0; // scaled Alias versions
		this.vrectrightedge = 0; // rightmost right edge we care about
		this.fvrectx = 0;
		this.fvrecty = 0; // for floating-point compares
		this.fvrectx_adj = 0;
		this.fvrecty_adj = 0; // left and top edges, for clamping
		this.vrect_x_adj_shift20 = 0; // (vrect.x + 0.5 - epsilon) << 20
		this.vrectright_adj_shift20 = 0; // (vrectright + 0.5 - epsilon) << 20
		this.fvrectright_adj = 0;
		this.fvrectbottom_adj = 0; // right and bottom edges, for clamping
		this.fvrectright = 0; // rightmost edge, for Alias clamping
		this.fvrectbottom = 0; // bottommost edge, for Alias clamping
		this.horizontalFieldOfView = 0; // at Z = 1.0, this many X is visible
		                                // 2.0 = 90 degrees
		this.xOrigin = 0; // should probably always be 0.5
		this.yOrigin = 0; // between be around 0.3 to 0.5

		this.vieworg = new Float32Array( 3 );
		this.viewangles = new Float32Array( 3 );

		this.fov_x = 0;
		this.fov_y = 0;

		this.ambientlight = 0;

	}

}

//============================================================================
// Globals
//============================================================================

export const r_refdef = new refdef_t();

// view origin
export const r_origin = new Float32Array( 3 );
export const vpn = new Float32Array( 3 ); // view plane normal (forward)
export const vright = new Float32Array( 3 ); // view right vector
export const vup = new Float32Array( 3 ); // view up vector

export let r_notexture_mip = null; // texture_t -- fallback texture

export let reinit_surfcache = 0; // if 1, surface cache is currently empty
export let r_cache_thrash = false; // set if thrashing the surface cache

//============================================================================
// Refresh function declarations (stubs -- implemented in gl_rmain.js)
//============================================================================

/**
 * Empty stub of render.h's R_Init. The renderer's real initialisation is implemented in gl_rmain.js (and gl_rmisc.js
 * has its own); nothing imports this one.
 */
export function R_Init() {

	// Implemented in gl_rmain.js

}

/**
 * Empty stub of render.h's R_InitTextures. The comment says it is implemented in gl_rmisc.js; the working
 * `R_InitTextures` (the checkerboard `r_notexture_mip`) is in gl_model.js. Nothing imports this one.
 */
export function R_InitTextures() {

	// Implemented in gl_rmisc.js

}

/**
 * Empty stub of render.h's R_InitEfrags; the efrag pool is allocated in client.js instead. Nothing imports it.
 */
export function R_InitEfrags() {

	// Stub

}

/**
 * Empty stub of render.h's R_RenderView. The real one is implemented in gl_rmain.js and must have `r_refdef` set
 * first. Nothing imports this one.
 */
export function R_RenderView() {

	// Implemented in gl_rmain.js -- must set r_refdef first

}

/**
 * Empty stub of render.h's R_ViewChanged, which the software renderer called whenever `r_refdef` or vid change. The
 * GL port recomputes the view each frame instead; nothing imports it.
 *
 * @param {vrect_t} pvrect new view rectangle, screen pixels (unused)
 * @param {number} lineadj status-bar line adjustment, pixels (unused)
 * @param {number} aspect pixel aspect ratio (unused)
 */
export function R_ViewChanged( pvrect, lineadj, aspect ) {

	// Called whenever r_refdef or vid change

}

/**
 * Empty stub of render.h's R_InitSky, called at level load in WinQuake. The real one is in gl_warp.js; nothing
 * imports this one.
 *
 * @param {object} mt the sky miptex (unused)
 */
export function R_InitSky( mt ) {

	// Called at level load

}

// R_AddEfrags and R_RemoveEfrags implemented in gl_refrag.js
export { R_AddEfrags, R_RemoveEfrags, R_StoreEfrags } from './gl_refrag.js';

/**
 * Empty stub of render.h's R_NewMap. The real one is implemented in gl_rmain.js (gl_rmisc.js has another); nothing
 * imports this one.
 */
export function R_NewMap() {

	// Implemented in gl_rmain.js

}

//============================================================================
// Particle effect stubs
//============================================================================

// a stock explosive box's origin is its corner on the floor (the box is 32 x 32 and 64 or 32 tall); its blast is centred about here
const BOX_CENTRE = [ 16, 16, 20 ];

/**
 * Reads an svc_particle message from `net_message` and spawns its effect (WinQuake R_ParseParticleEffect); called by
 * CL_ParseServerMessage. The message is an origin (3 coords, Quake units), a direction (3 signed bytes / 16), a
 * count and a colour (palette index). A count of 255 means 1024 particles and is QuakeC's particle(origin, dir,
 * color, 255): the blast of an exploding box (misc_explobox's barrel_explode), which the game pairs with the s_explod
 * sprite. In Newer Game that blast is the Fireball too, like every other explosion, centred on the box rather than
 * on its corner on the floor (the sprite is then hidden: R_FireballReplacesSprite); otherwise the native particles
 * are used. Anything else is an ordinary particle effect.
 *
 * @throws {Error} for a count of 255 when the Newer hooks (`R_FireballSpawn`, `R_DemoSplitActive`) are not installed
 */
export function R_ParseParticleEffect() {

	const org = new Float32Array( 3 );
	const dir = new Float32Array( 3 );

	for ( let i = 0; i < 3; i ++ )
		org[ i ] = MSG_ReadCoord();
	for ( let i = 0; i < 3; i ++ )
		dir[ i ] = MSG_ReadChar() * ( 1.0 / 16 );

	const msgcount = MSG_ReadByte();
	const color = MSG_ReadByte();

	let count;
	if ( msgcount === 255 )
		count = 1024;
	else
		count = msgcount;

	// A message count of 255 is QuakeC's particle(origin, dir, color, 255): the blast of an exploding box (misc_explobox's
	// barrel_explode), which the game pairs with the s_explod sprite. In Newer Game it is the Fireball too, like every
	// other explosion (the sprite is then hidden: R_FireballReplacesSprite). Anything else is an ordinary particle effect.
	if ( msgcount === 255 ) {

		// (the Fireball is centred on the box, not on its corner on the floor: the particle message gives the box's origin)
		const centre = [ org[ 0 ] + BOX_CENTRE[ 0 ], org[ 1 ] + BOX_CENTRE[ 1 ], org[ 2 ] + BOX_CENTRE[ 2 ] ];
		explosion( centre, {}, classicOnly => _R_RunParticleEffect( org, dir, color, count, classicOnly ) );
		return;

	}

	_R_RunParticleEffect( org, dir, color, count );

}

/**
 * Spawns a native particle spray; a thin forwarder to r_part.js R_RunParticleEffect for cl_tent.js temp entities
 * (spikes, gunshots, wizard and knight spikes).
 *
 * @param {Float32Array} org centre, Quake units, world space
 * @param {Float32Array} dir drift direction; particle velocity is `dir * 15` Quake units per second
 * @param {number} color palette index; each particle takes a random shade of its 8-colour row
 * @param {number} count number of particles (1024 makes a rocket-explosion burst)
 */
export function R_RunParticleEffect( org, dir, color, count ) {

	_R_RunParticleEffect( org, dir, color, count );

}

/**
 * Spawns a missile's trail for one frame's movement; cl_main.js calls it per entity per frame from the model's trail
 * flags. Rocket (type 0) and grenade (type 1) trails use the supplied smoke in Newer Game, placed by distance along
 * each frame's segment; `key` is the entity number, so every missile carries its own spacing (a call without one
 * keeps the native trail). Everything else, and Classic, keeps the native trail. In the title demo's split view the
 * Classic half hides everything Newer, so the native trail is also spawned there, flagged to draw in that half only.
 *
 * @param {Float32Array} start the entity's previous origin, Quake units, world space
 * @param {Float32Array} end its origin now
 * @param {number} type 0 rocket, 1 grenade smoke, 2 blood, 3 and 5 tracers, 4 slight blood, 6 vore trail;
 *     adding 128 makes the native trail three times as dense
 * @param {number} [key] entity number, needed for the supplied smoke on types 0 and 1
 * @throws {Error} for types 0 and 1 with a key when the Newer hooks (`R_SmokeTrail`, `R_DemoSplitActive`) are not
 *     installed
 */
export function R_RocketTrail( start, end, type, key ) {

	// (no entity number, no supplied smoke: its spacing is carried per missile, and two missiles must
	// never share a carry)
	if ( ( type === 0 || type === 1 ) && key !== undefined && R_SmokeTrail( start, end, type === 0, key ) ) {

		if ( R_DemoSplitActive() ) _R_RocketTrail( start, end, type, true );
		return;

	}

	_R_RocketTrail( start, end, type );

}

/**
 * Spawns the ring of particles around an entity with EF_BRIGHTFIELD; a forwarder to r_part.js R_EntityParticles,
 * called by cl_main.js while relinking entities each frame.
 *
 * @param {entity_t} ent the glowing entity; its `origin` (Quake units) is the centre
 */
export function R_EntityParticles( ent ) {

	_R_EntityParticles( ent );

}

/**
 * Tar baby (blob) explosion, for cl_tent.js TE_TAREXPLOSION: the Fireball too (it never had a dynamic light, so none
 * is added). Every explosion wrapper returns true when the Fireball took the event, so its caller knows whether the
 * native particles (and the native light it pairs with) were used.
 *
 * @param {Float32Array} org detonation point, Quake units, world space
 * @returns {boolean} true when the Fireball took the event, false when the native blob particles were spawned
 * @throws {Error} when the Newer hooks (`R_FireballSpawn`, `R_DemoSplitActive`) are not installed
 */
export function R_BlobExplosion( org ) {

	return explosion( org, { light: false }, classicOnly => _R_BlobExplosion( org, classicOnly ) );

}

// One explosion: the Fireball when it takes the event, otherwise the native particles. In the title
// demo's split view the Classic half hides everything Newer, so the original explosion is spawned
// too, flagged to draw in that half only (the Newer half would otherwise show both).
function explosion( org, options, native ) {

	if ( ! R_FireballSpawn( org, options ) ) { native( false ); return false; }
	if ( R_DemoSplitActive() ) native( true );
	return true;

}

/**
 * An ordinary explosion (rocket, grenade; cl_tent.js TE_EXPLOSION): the supplied Fireball in Newer Game, otherwise
 * (Classic, textures still loading) the native particles.
 *
 * @param {Float32Array} org detonation point, Quake units, world space
 * @returns {boolean} true when the Fireball took the event (the caller then skips the native dynamic light), false
 *     when the native particles were spawned
 * @throws {Error} when the Newer hooks (`R_FireballSpawn`, `R_DemoSplitActive`) are not installed
 */
export function R_ParticleExplosion( org ) {

	return explosion( org, {}, classicOnly => _R_ParticleExplosion( org, classicOnly ) );

}

/**
 * Colour-mapped explosion (cl_tent.js TE_EXPLOSION2): the Fireball too (the colour range is not used by it).
 *
 * @param {Float32Array} org detonation point, Quake units, world space
 * @param {number} colorStart first palette index of the native particles' colour range
 * @param {number} colorLength number of palette entries in that range
 * @returns {boolean} true when the Fireball took the event, false when the native particles were spawned
 * @throws {Error} when the Newer hooks (`R_FireballSpawn`, `R_DemoSplitActive`) are not installed
 */
export function R_ParticleExplosion2( org, colorStart, colorLength ) {

	return explosion( org, {}, classicOnly => _R_ParticleExplosion2( org, colorStart, colorLength, classicOnly ) );

}

/**
 * Spawns the lava splash burst (cl_tent.js TE_LAVASPLASH); a forwarder to r_part.js R_LavaSplash.
 *
 * @param {Float32Array} org centre, Quake units, world space
 */
export function R_LavaSplash( org ) {

	_R_LavaSplash( org );

}

/**
 * Forwarder to r_part.js R_TeleportSplash (the teleport sparkle cube). No engine code imports this wrapper.
 *
 * @param {Float32Array} org centre, Quake units, world space
 */
export function R_TeleportSplash( org ) {

	_R_TeleportSplash( org );

}

/**
 * Empty stub of render.h's R_PushDlights; the real one is in gl_rlight.js. Nothing imports this one.
 */
export function R_PushDlights() {

	// Stub

}

//============================================================================
// Surface cache related
//============================================================================

/**
 * Stub of the software renderer's surface-cache sizing (WinQuake d_iface.h); the GL renderer has no surface cache.
 * Nothing imports it.
 *
 * @param {number} width screen width, pixels (unused)
 * @param {number} height screen height, pixels (unused)
 * @returns {number} always 0 bytes
 */
export function D_SurfaceCacheForRes( width, height ) {

	return 0;

}

/**
 * Empty stub of the software surface-cache flush; the GL port's D_FlushCaches is in gl_rmisc.js. Nothing imports
 * this one.
 */
export function D_FlushCaches() {

	// Stub

}

/**
 * Empty stub of the software surface-cache release; the GL renderer has no surface cache. Nothing imports it.
 */
export function D_DeleteSurfaceCache() {

	// Stub

}

/**
 * Empty stub of the software surface-cache setup; the GL renderer has no surface cache. Nothing imports it.
 *
 * @param {*} buffer cache memory (unused)
 * @param {number} size cache size, bytes (unused)
 */
export function D_InitCaches( buffer, size ) {

	// Stub

}

/**
 * Empty stub of the software renderer's R_SetVrect (which sized the 3D view inside the screen for `viewsize`).
 * Nothing imports it.
 *
 * @param {vrect_t} pvrect full view rectangle, screen pixels (unused)
 * @param {vrect_t} pvrectin rectangle that would be written (unused; left unchanged)
 * @param {number} lineadj status-bar line adjustment, pixels (unused)
 */
export function R_SetVrect( pvrect, pvrectin, lineadj ) {

	// Stub

}
