/**
 * @module engine/client/client
 *
 * Client structures (WinQuake client.h): `cl`, `cls`, the entity, light and beam arrays the renderer reads.
 *
 * Types: exported classes `usercmd_t`, `lightstyle_t`, `scoreboard_t`, `cshift_t`, `dlight_t`, `beam_t`, `kbutton_t`,
 * `packet_entities_t`, `entity_t`, `efrag_t`, `client_static_t`, `client_state_t`.
 *
 * State: mutable exports `cl_numvisedicts`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/client.h -- client structures and definitions

import { MAX_STYLESTRING, MAX_CL_STATS, MAX_SCOREBOARD, MAX_SCOREBOARDNAME,
	MAX_MODELS, MAX_SOUNDS, MAX_EDICTS, MAX_LIGHTSTYLES, entity_state_t } from '../common/quakedef.js';
import { sizebuf_t } from '../common/common.js';
import { MAX_PACKET_ENTITIES_LOCAL } from '../common/protocol.js';

//=============================================================================

export const SIGNONS = 4; // signon messages to receive before connected

export const MAX_DLIGHTS = 32;
export const MAX_BEAMS = 24;
// raised from WinQuake's 640 and 128, as later engines (QuakeSpasm) raised them: Dimension of the Machine's hub has some
// 470 static entities, each in several leaves (card [34c])
export const MAX_EFRAGS = 16384;
export const MAX_TEMP_ENTITIES = 64; // lightning bolts, etc
export const MAX_STATIC_ENTITIES = 4096; // torches, etc (QuakeSpasm's limit)
export const MAX_VISEDICTS = 256;

export const MAX_MAPSTRING = 2048;
export const MAX_DEMOS = 8;
export const MAX_DEMONAME = 16;

export const NAME_LENGTH = 64;

//
// color shifts
//
export const CSHIFT_CONTENTS = 0;
export const CSHIFT_DAMAGE = 1;
export const CSHIFT_BONUS = 2;
export const CSHIFT_POWERUP = 3;
export const NUM_CSHIFTS = 4;

//
// cactive_t -- connection state
//
export const ca_dedicated = 0; // a dedicated server with no ability to start a client
export const ca_disconnected = 1; // full screen console with no connection
export const ca_connected = 2; // valid netcon, talking to a server

//=============================================================================

export class usercmd_t {

	/**
	 * One frame's movement command (WinQuake client.h `usercmd_t`): view angles in degrees and the intended
	 * forward/side/up velocities in Quake units per second, all zero. `cl.cmd` holds the last one sent; CL_ClearState
	 * replaces it at each signon and CL_SendCmd builds a fresh one each frame it sends.
	 */
	constructor() {

		this.viewangles = new Float32Array( 3 );

		// intended velocities
		this.forwardmove = 0;
		this.sidemove = 0;
		this.upmove = 0;

	}

}

export class lightstyle_t {

	/**
	 * One light style (WinQuake client.h `lightstyle_t`): `map` the brightness string of letters 'a'..'z' set by
	 * svc_lightstyle, `length` its character count. Empty until the server sends it. The MAX_LIGHTSTYLES entries of
	 * `cl_lightstyle` are made once at load and replaced by CL_ClearState at each signon.
	 */
	constructor() {

		this.length = 0;
		this.map = '';

	}

}

export class scoreboard_t {

	/**
	 * One player's scoreboard slot (WinQuake client.h `scoreboard_t`): name, entertime, frags, `colors` (two 4-bit
	 * fields, top and bottom shirt colour) and a 256-entry palette `translations` table used as the player entity's
	 * colormap. CL_ParseServerInfo allocates `cl.maxclients` of them into `cl.scores` at each server signon.
	 */
	constructor() {

		this.name = '';
		this.entertime = 0;
		this.frags = 0;
		this.colors = 0; // two 4 bit fields
		this.translations = new Uint8Array( 256 ); // VID_GRADES * 256 simplified

	}

}

export class cshift_t {

	/**
	 * One screen colour shift (WinQuake client.h `cshift_t`): `destcolor` RGB 0..255 and `percent` its strength 0..256.
	 * `cl.cshifts` and `cl.prev_cshifts` hold NUM_CSHIFTS of them (contents, damage, bonus, powerup), made with each
	 * client_state_t.
	 */
	constructor() {

		this.destcolor = new Int32Array( 3 );
		this.percent = 0; // 0-256

	}

}

export class dlight_t {

	/**
	 * One dynamic light (WinQuake client.h `dlight_t`): world-space `origin` and `radius` in Quake units, `die` the
	 * cl.time in seconds after which it stops lighting, `decay` the radius dropped each second, `minlight` below which it
	 * is not added, `key` its owner's entity number (0 for none). The MAX_DLIGHTS slots of `cl_dlights` are made at load,
	 * replaced by CL_ClearState at each signon, and reused through CL_AllocDlight.
	 */
	constructor() {

		this.origin = new Float32Array( 3 );
		this.radius = 0;
		this.die = 0; // stop lighting after this time
		this.decay = 0; // drop this each second
		this.minlight = 0; // don't add when contributing less
		this.key = 0;

	}

}

export class beam_t {

	/**
	 * One lightning-style beam (WinQuake client.h `beam_t`): the owning `entity` number, its `model` (model_t, null when
	 * the slot is free), `endtime` the server time in seconds it lasts until, and world-space `start`/`end` points in
	 * Quake units. The MAX_BEAMS slots of `cl_beams` are made at load and replaced by CL_ClearState at each signon.
	 */
	constructor() {

		this.entity = 0;
		this.model = null;
		this.endtime = 0;
		this.start = new Float32Array( 3 );
		this.end = new Float32Array( 3 );

	}

}

export class kbutton_t {

	/**
	 * One input button such as +forward (WinQuake client.h `kbutton_t`): `down` the up-to-two key numbers holding it,
	 * `state` bit flags (1 down now, 2 went down this frame, 4 went up this frame) kept by cl_input.js's KeyDown/KeyUp.
	 * cl_input.js makes one per button at load; they live for the session.
	 */
	constructor() {

		this.down = new Int32Array( 2 ); // key nums holding it down
		this.state = 0; // low bit is down state

	}

}

//
// packet_entities_t - QW-style delta compressed entity snapshot
// Ported from: QW/client/protocol.h
//
export class packet_entities_t {

	/**
	 * A delta-compressed entity snapshot: `num_entities` used entries of `entities`, a preallocated array of
	 * MAX_PACKET_ENTITIES_LOCAL entity_state_t reused in place. cl_pred.js keeps one per entity frame of its ring buffer.
	 */
	constructor() {

		this.num_entities = 0;
		this.entities = [];
		for ( let i = 0; i < MAX_PACKET_ENTITIES_LOCAL; i ++ ) {

			this.entities.push( new entity_state_t() );

		}

	}

}

//
// entity_t - client side entity
//
export class entity_t {

	/**
	 * A client-side entity the renderer draws (WinQuake client.h `entity_t`): baseline, the last two network origins and
	 * angles (index 0 newest) that CL_RelinkEntities lerps into `origin`/`angles` (world space, Quake units and degrees),
	 * model, frame, skin, effects and the renderer's efrag/visframe bookkeeping. The MAX_EDICTS `cl_entities`, the
	 * static and temporary entity pools and `cl.viewent` (the gun) are made at module load; CL_ClearState replaces the
	 * `cl_entities` and `cl_temp_entities` entries and `cl.viewent` with fresh ones at each signon (the static pool is
	 * reused in place, counted by `cl.num_statics`).
	 */
	constructor() {

		this.forcelink = false; // model changed

		this.update_type = 0;

		this.baseline = new entity_state_t();

		this.msgtime = 0; // time of last update
		this.msg_origins = [ new Float32Array( 3 ), new Float32Array( 3 ) ]; // last two updates (0 is newest)
		this.origin = new Float32Array( 3 );
		this.msg_angles = [ new Float32Array( 3 ), new Float32Array( 3 ) ]; // last two updates (0 is newest)
		this.angles = new Float32Array( 3 );

		this.model = null; // NULL = no model
		this.efrag = null; // linked list of efrags
		this.frame = 0;
		this.syncbase = 0; // for client-side animations
		this.colormap = null;
		this.effects = 0; // light, particles, etc
		this.skinnum = 0; // for Alias models
		this.visframe = 0; // last frame this entity was found in an active leaf

		this.dlightframe = 0; // dynamic lighting
		this.dlightbits = 0;

		// FIXME: could turn these into a union
		this.trivial_accept = 0;
		this.topnode = null; // for bmodels, first world node that splits bmodel, or NULL if not split

		this._lastPESeq = 0; // last server sequence this entity was updated from packet entities (for interpolation)

	}

}

//
// efrag_t
//
export class efrag_t {

	/**
	 * One link between a static entity and a BSP leaf it touches (WinQuake client.h `efrag_t`), threaded on both the
	 * leaf's and the entity's lists. The MAX_EFRAGS pool `cl_efrags` is made once at load; CL_ClearState clears every
	 * link and re-chains the pool through `entnext` as the `cl.free_efrags` free list at each signon.
	 */
	constructor() {

		this.leaf = null;
		this.leafnext = null;
		this.entity = null;
		this.entnext = null;

	}

}

//
// the client_static_t structure is persistant through an arbitrary number
// of server connections
//
export class client_static_t {

	/**
	 * The client state that persists through any number of server connections (WinQuake client.h `client_static_t`):
	 * connection state (`ca_disconnected` at start), demo loop and recording/playback state, timedemo counters, signon
	 * progress and the outgoing `message` buffer. The single instance `cls` is made at module load and never replaced.
	 */
	constructor() {

		this.state = ca_disconnected;

		// personalization data sent to server
		this.mapstring = '';
		this.spawnparms = ''; // to restart a level

		// demo loop control
		this.demonum = 0; // C global is zero-initialized; -1 means don't play demos
		this.demos = new Array( MAX_DEMOS ).fill( '' ); // when not playing

		// demo recording info must be here, because record is started before
		// entering a map (and clearing client_state_t)
		this.demorecording = false;
		this.demoplayback = false;
		this.timedemo = false;
		this.forcetrack = - 1; // -1 = use normal cd track
		this.demofile = null; // ArrayBuffer or file handle
		this.demodata = null; // Uint8Array for demo file data
		this.demopos = 0; // current read position in demo data
		this.td_lastframe = 0; // to meter out one message a frame
		this.td_startframe = 0; // host_framecount at start
		this.td_starttime = 0; // realtime at second frame of timedemo

		// connection information
		this.signon = 0; // 0 to SIGNONS
		this.netcon = null;
		this.message = new sizebuf_t(); // writing buffer to send to server

	}

}

//
// the client_state_t structure is wiped completely at every
// server signon
//
export class client_state_t {

	/**
	 * The per-server client state (WinQuake client.h `client_state_t`): stats, items, colour shifts, view angles and
	 * velocity, message timestamps (`mtime`, seconds), cl.time, precache lists, level name and the gun entity. The single
	 * instance `cl` is made at module load; CL_ClearState wipes its fields back to these values at every server signon.
	 */
	constructor() {

		this.movemessages = 0; // since connecting to this server
		this.cmd = new usercmd_t(); // last command sent to the server

		// information for local display
		this.stats = new Int32Array( MAX_CL_STATS ); // health, etc
		this.items = 0; // inventory bit flags
		this.item_gettime = new Float32Array( 32 ); // cl.time of acquiring item, for blinking
		this.faceanimtime = 0; // use anim frame if cl.time < this

		this.cshifts = [];
		this.prev_cshifts = [];
		for ( let i = 0; i < NUM_CSHIFTS; i ++ ) {

			this.cshifts.push( new cshift_t() );
			this.prev_cshifts.push( new cshift_t() );

		}

		// the client maintains its own idea of view angles, which are
		// sent to the server each frame. The server sets punchangle when
		// the view is temporarliy offset, and an angle reset commands at the start
		// of each level and after teleporting.
		this.mviewangles = [ new Float32Array( 3 ), new Float32Array( 3 ) ]; // during demo playback viewangles is lerped between these
		this.viewangles = new Float32Array( 3 );

		this.mvelocity = [ new Float32Array( 3 ), new Float32Array( 3 ) ]; // update by server, used for lean+bob (0 is newest)
		this.velocity = new Float32Array( 3 ); // lerped between mvelocity[0] and [1]

		this.punchangle = new Float32Array( 3 ); // temporary offset

		// pitch drifting vars
		this.idealpitch = 0;
		this.pitchvel = 0;
		this.nodrift = false;
		this.driftmove = 0;
		this.laststop = 0;

		this.viewheight = 0;
		this.crouch = 0; // local amount for smoothing stepups

		this.paused = false; // send over by server
		this.onground = false;
		this.inwater = false;

		this.intermission = 0; // don't change view angle, full screen, etc
		this.completed_time = 0; // latched at intermission start

		this.mtime = new Float64Array( 2 ); // the timestamp of last two messages
		this.time = 0; // clients view of time, should be between
						// servertime and oldservertime to generate
						// a lerp point for other data
		this.oldtime = 0; // previous cl.time, time-oldtime is used
						// to decay light values and smooth step ups

		this.last_received_message = 0; // (realtime) for net trouble icon

		//
		// information that is static for the entire time connected to a server
		//
		this.protocol = 15; // the server's: 15, or the large-map protocol (cl_parse.js reads indexes by it)
		this.model_precache = new Array( MAX_MODELS ).fill( null );
		this.sound_precache = new Array( MAX_SOUNDS ).fill( null );

		this.levelname = ''; // for display on solo scoreboard
		this.viewentity = 0; // cl_entities[cl.viewentity] = player
		this.maxclients = 0;
		this.gametype = 0;

		// refresh related state
		this.worldmodel = null; // cl_entities[0].model
		this.free_efrags = null;
		this.num_entities = 0; // held in cl_entities array
		this.num_statics = 0; // held in cl_staticentities array
		this.viewent = new entity_t(); // the gun model

		this.cdtrack = 0;
		this.looptrack = 0; // cd audio

		// frag scoreboard
		this.scores = null; // [cl.maxclients]

	}

}

//=============================================================================
// Global instances
//=============================================================================

export const cls = new client_static_t();
export const cl = new client_state_t();

// FIXME: put these on hunk?
export const cl_efrags = [];
for ( let i = 0; i < MAX_EFRAGS; i ++ ) cl_efrags.push( new efrag_t() );

export const cl_entities = [];
for ( let i = 0; i < MAX_EDICTS; i ++ ) cl_entities.push( new entity_t() );

export const cl_static_entities = [];
// WinQuake's 128 made at load; more are made as a map needs them, up to MAX_STATIC_ENTITIES (CL_ParseStatic), as 4096 made
// at once would cost some 9 MB for every game (card [34c])
for ( let i = 0; i < 128; i ++ ) cl_static_entities.push( new entity_t() );

export const cl_lightstyle = [];
for ( let i = 0; i < MAX_LIGHTSTYLES; i ++ ) cl_lightstyle.push( new lightstyle_t() );

export const cl_dlights = [];
for ( let i = 0; i < MAX_DLIGHTS; i ++ ) cl_dlights.push( new dlight_t() );

export const cl_temp_entities = [];
for ( let i = 0; i < MAX_TEMP_ENTITIES; i ++ ) cl_temp_entities.push( new entity_t() );

export const cl_beams = [];
for ( let i = 0; i < MAX_BEAMS; i ++ ) cl_beams.push( new beam_t() );

export let cl_numvisedicts = 0;
export const cl_visedicts = new Array( MAX_VISEDICTS ).fill( null );

/**
 * Sets the count of entities in `cl_visedicts` to draw this frame (an ES module importer cannot assign the live
 * `cl_numvisedicts` binding itself). CL_RelinkEntities resets it to 0 each frame; it, CL_UpdateTEnts and the renderer's
 * leaf walk (gl_rsurf.js, storing efrag entities) then add to it.
 *
 * @param {number} val the new count, 0..MAX_VISEDICTS
 */
export function set_cl_numvisedicts( val ) {

	cl_numvisedicts = val;

}

// The two client functions the renderer calls, here with the state they read (cl, cl_dlights, cl_beams), so the
// renderer need not import cl_main.js or cl_tent.js (card [44g], baseline debt D1a); both re-export them.

/*
===============
CL_AllocDlight

===============
*/
/**
 * Hands out a dynamic light slot (WinQuake cl_main.c): the slot already owned by `key` if there is one, else the first
 * slot whose `die` time has passed, else slot 0. The slot is cleared (origin, radius, die, decay, minlight all 0) and
 * given `key`; the caller then sets origin, radius and die. Called while relinking entities each frame (muzzle flashes,
 * bright/dim lights, rockets), by temporary-entity effects and by the Newer Game fireball and lightning renderers.
 *
 * @param {number} key owning entity number, so the owner's light is reused frame to frame instead of piling up; 0 for
 *   an unowned light, which never matches an existing slot
 * @returns {dlight_t} the slot in `cl_dlights`; it lives until CL_ClearState replaces the array at the next signon, and
 *   another caller may take it once its `die` time passes
 */
export function CL_AllocDlight( key ) {

	// first look for an exact key match
	if ( key ) {

		for ( let i = 0; i < MAX_DLIGHTS; i ++ ) {

			if ( cl_dlights[ i ].key === key ) {

				const dl = cl_dlights[ i ];
				dl.origin.fill( 0 );
				dl.radius = 0;
				dl.die = 0;
				dl.decay = 0;
				dl.minlight = 0;
				dl.key = key;
				return dl;

			}

		}

	}

	// then look for anything else
	for ( let i = 0; i < MAX_DLIGHTS; i ++ ) {

		if ( cl_dlights[ i ].die < cl.time ) {

			const dl = cl_dlights[ i ];
			dl.origin.fill( 0 );
			dl.radius = 0;
			dl.die = 0;
			dl.decay = 0;
			dl.minlight = 0;
			dl.key = key;
			return dl;

		}

	}

	const dl = cl_dlights[ 0 ];
	dl.origin.fill( 0 );
	dl.radius = 0;
	dl.die = 0;
	dl.decay = 0;
	dl.minlight = 0;
	dl.key = key;
	return dl;

}

/*
=================
CL_PlayerLightning
=================
*/
/**
 * The player's own lightning gun beam (TE_LIGHTNING2 from the view entity) while it lives, for the Newer Game beam
 * (r_lightning.js, card [30a]) and its burn on the walls (r_wallburn.js, card [30c]). Other beams (the Shambler's,
 * Chthon's, the grapple's) are not it. Polled by those renderers each frame they draw. A beam counts while its slot in
 * `cl_beams` holds `progs/bolt2.mdl` for `cl.viewentity` and its `endtime` is not before the newest server message
 * time `cl.mtime[0]`.
 *
 * @returns {?{ start: Array<number>, end: Array<number> }} fresh copies of the beam's world-space endpoints (Quake
 *   units, safe to keep), or null when the player's beam is not live
 */
export function CL_PlayerLightning() {

	const serverTime = cl.mtime[ 0 ];
	for ( let i = 0; i < MAX_BEAMS; i ++ ) {

		const b = cl_beams[ i ];
		if ( b.model != null && b.endtime >= serverTime && b.entity === cl.viewentity && b.model.name === 'progs/bolt2.mdl' ) return { start: Array.from( b.start ), end: Array.from( b.end ) };

	}
	return null;

}
