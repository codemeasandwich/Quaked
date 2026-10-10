/**
 * @module engine/server/world
 *
 * World queries (WinQuake world.c): linking entities into the area grid, hull tracing (`SV_Move`,
 * `SV_RecursiveHullCheck`), contents and touching.
 *
 * Types: exported classes `plane_t`, `trace_t`.
 *
 * State: no mutable exports; module-level variables `sv_numareanodes`.
 *
 * Errors: calls `Sys_Error` (fatal) at 5 places.
 */
import { SV_RespawnDropTouch } from '../common/hooks.js'; // installed by newer/gameplay/sv_respawn.js
import { SV_RendVeilTouchBegin, SV_RendVeilTouchEnd } from '../common/hooks.js'; // installed by newer/gameplay/sv_rendveil.js
// Ported from: WinQuake/world.c + world.h -- world query functions

/*

entities never clip against themselves, or their owner

line of sight checks trace->crosscontent, but bullets don't

*/

import { Sys_Error } from '../common/sys.js';
import { Con_DPrintf, link_t, ClearLink, RemoveLink, InsertLinkBefore } from '../common/common.js';
import { VectorCopy, VectorAdd, VectorSubtract, DotProduct, vec3_origin, BoxOnPlaneSide } from '../common/mathlib.js';
import {
	sv, svs,
	SOLID_NOT, SOLID_TRIGGER, SOLID_BBOX, SOLID_SLIDEBOX, SOLID_BSP,
	MOVETYPE_PUSH,
	FL_ITEM, FL_MONSTER, FL_ONGROUND
} from './server.js';
import {
	CONTENTS_EMPTY, CONTENTS_SOLID, CONTENTS_WATER,
	CONTENTS_CURRENT_0, CONTENTS_CURRENT_DOWN
} from '../common/bspfile.js';
import { PR_ExecuteProgram } from '../progs/pr_exec.js';
import { EDICT_TO_PROG, PROG_TO_EDICT, pr_global_struct, PR_GetString } from '../progs/progs.js';
import { SV_PortalMoveRead } from '../common/hooks.js'; // installed by newer/gameplay/sv_portalmotion.js
import { SV_BeginPortalTouch, SV_PreparePortalTouch, SV_FinishPortalTouch, SV_RestorePortalReceiver } from '../common/hooks.js'; // installed by newer/gameplay/sv_portal.js
import { R_FlashlightSkillSelected } from '../common/hooks.js'; // installed by newer/render/r_flashlightrun.js

// Pre-allocated scratch vectors for SV_RecursiveHullCheck (indexed by recursion depth).
// Grow this pool on demand because valid BSP hulls can be deeper than the common case.
const _hullMidPool = [];
for ( let i = 0; i < 32; i ++ ) _hullMidPool[ i ] = new Float32Array( 3 );

//============================================================================
// world.h types
//============================================================================

export class plane_t {

	/**
	 * Creates the impact plane of a trace (world.h): `normal` a unit vector (all 0 until a hit) facing back toward
	 * the moving object, `dist` its distance from the origin along that normal (Quake units).
	 */
	constructor() {

		this.normal = new Float32Array( 3 );
		this.dist = 0;

	}

}

export class trace_t {

	/**
	 * Creates an empty trace result (world.h): no hit, fraction 1. `SV_ClipMoveToEntity` makes a new one per entity
	 * clipped and resets it to allsolid true with endpos = the move's end before tracing. Fields: `allsolid` (if true,
	 * plane is not valid), `startsolid` (if true, the initial point was in a solid area), `inopen`/`inwater` (the
	 * trace passed through empty or liquid leaves), `fraction` (time completed 0..1, 1.0 = didn't hit anything),
	 * `endpos` (final position, world space), `plane` (surface normal at impact), `ent` (entity the surface is on:
	 * the world edict for map geometry, null when nothing was hit).
	 */
	constructor() {

		this.allsolid = false; // if true, plane is not valid
		this.startsolid = false; // if true, the initial point was in a solid area
		this.inopen = false;
		this.inwater = false;
		this.fraction = 1.0; // time completed, 1.0 = didn't hit anything
		this.endpos = new Float32Array( 3 ); // final position
		this.plane = new plane_t(); // surface normal at impact
		this.ent = null; // entity the surface is on

	}

}

// Move types for SV_Move
export const MOVE_NORMAL = 0;
export const MOVE_NOMONSTERS = 1;
export const MOVE_MISSILE = 2;

//============================================================================
// moveclip_t - internal structure for SV_Move
//============================================================================

class moveclip_t {

	constructor() {

		this.boxmins = new Float32Array( 3 ); // enclose the test object along entire move
		this.boxmaxs = new Float32Array( 3 );
		this.mins = null; // size of the moving object
		this.maxs = null;
		this.mins2 = new Float32Array( 3 ); // size when clipping against monsters
		this.maxs2 = new Float32Array( 3 );
		this.start = null;
		this.end = null;
		this.trace = new trace_t();
		this.type = 0;
		this.passedict = null;

	}

}

/*
===============================================================================

HULL BOXES

===============================================================================
*/

// box_hull and supporting structures for SV_HullForBox
const box_hull = {
	clipnodes: null,
	planes: null,
	firstclipnode: 0,
	lastclipnode: 5,
	clip_mins: new Float32Array( 3 ),
	clip_maxs: new Float32Array( 3 )
};

const box_clipnodes = new Array( 6 );
for ( let i = 0; i < 6; i ++ ) {

	box_clipnodes[ i ] = {
		planenum: 0,
		children: [ 0, 0 ]
	};

}

const box_planes = new Array( 6 );
for ( let i = 0; i < 6; i ++ ) {

	box_planes[ i ] = {
		normal: new Float32Array( 3 ),
		dist: 0,
		type: 0
	};

}

/*
===================
SV_InitBoxHull
===================
*/
/**
 * Set up the planes and clipnodes so that the six floats of a bounding box can just be stored out and get a proper
 * hull_t structure (WinQuake world.c). Builds the module's single six-node box hull: node i tests axis i >> 1, empty
 * on one side, the next node (or solid after the last) on the other. Called by `SV_ClearWorld` at every map spawn.
 */
export function SV_InitBoxHull() {

	box_hull.clipnodes = box_clipnodes;
	box_hull.planes = box_planes;
	box_hull.firstclipnode = 0;
	box_hull.lastclipnode = 5;

	for ( let i = 0; i < 6; i ++ ) {

		box_clipnodes[ i ].planenum = i;

		const side = i & 1;

		box_clipnodes[ i ].children[ side ] = CONTENTS_EMPTY;
		if ( i !== 5 )
			box_clipnodes[ i ].children[ side ^ 1 ] = i + 1;
		else
			box_clipnodes[ i ].children[ side ^ 1 ] = CONTENTS_SOLID;

		box_planes[ i ].type = i >> 1;
		box_planes[ i ].normal[ 0 ] = 0;
		box_planes[ i ].normal[ 1 ] = 0;
		box_planes[ i ].normal[ 2 ] = 0;
		box_planes[ i ].normal[ i >> 1 ] = 1;

	}

}

/*
===================
SV_HullForBox
===================
*/
/**
 * To keep everything totally uniform, bounding boxes are turned into small BSP trees instead of being compared
 * directly (WinQuake world.c). Writes the box's six plane distances into the shared box hull built by
 * `SV_InitBoxHull`.
 *
 * @param {Float32Array|Array<number>} mins box minimum corner, in the space the trace will use (Quake units)
 * @param {Float32Array|Array<number>} maxs box maximum corner (Quake units)
 * @returns {hull_t} the module's one box hull, shared: the next call overwrites it, so trace it before asking for
 *   another
 */
export function SV_HullForBox( mins, maxs ) {

	box_planes[ 0 ].dist = maxs[ 0 ];
	box_planes[ 1 ].dist = mins[ 0 ];
	box_planes[ 2 ].dist = maxs[ 1 ];
	box_planes[ 3 ].dist = mins[ 1 ];
	box_planes[ 4 ].dist = maxs[ 2 ];
	box_planes[ 5 ].dist = mins[ 2 ];

	return box_hull;

}

/*
================
SV_HullForEntity
================
*/
/**
 * Returns a hull that can be used for testing or clipping an object of mins/maxs size (WinQuake world.c). For a
 * SOLID_BSP entity it picks the brush model's precomputed hull by the object's width: hull 0 (point) under 3 units,
 * hull 1 (player size) up to 32, else hull 2 (large). Any other entity gets a temporary box hull of its own box
 * expanded by the object's size (`SV_HullForBox`).
 *
 * @param {edict_t} ent the entity being clipped against; `solid`, `movetype`, `modelindex`, `origin`, `mins` and
 *   `maxs` are read
 * @param {Float32Array|Array<number>} mins the moving object's mins (Quake units, relative to its origin)
 * @param {Float32Array|Array<number>} maxs the moving object's maxs (Quake units, relative to its origin)
 * @param {Float32Array} offset written: offset is filled in to contain the adjustment that must be added to the
 *   testing object's origin to get a point to use with the returned hull (the source's wording; `SV_ClipMoveToEntity`
 *   subtracts it from the move's points): the entity's origin, plus the hull's centring for brush models
 * @returns {hull_t} a hull of the entity's brush model, or the shared box hull (valid until the next box request)
 * @throws {Error} through `Sys_Error` for SOLID_BSP without MOVETYPE_PUSH, or MOVETYPE_PUSH with a non bsp model
 */
export function SV_HullForEntity( ent, mins, maxs, offset ) {

	let hull;

	// decide which clipping hull to use, based on the size
	if ( ent.v.solid === SOLID_BSP ) {

		// explicit hulls in the BSP model
		if ( ent.v.movetype !== MOVETYPE_PUSH )
			Sys_Error( 'SOLID_BSP without MOVETYPE_PUSH' );

		const model = sv.models[ ent.v.modelindex | 0 ];

		if ( ! model || model.type !== 0 ) // mod_brush = 0
			Sys_Error( 'MOVETYPE_PUSH with a non bsp model' );

		const size = new Float32Array( 3 );
		VectorSubtract( maxs, mins, size );
		if ( size[ 0 ] < 3 )
			hull = model.hulls[ 0 ];
		else if ( size[ 0 ] <= 32 )
			hull = model.hulls[ 1 ];
		else
			hull = model.hulls[ 2 ];

		// calculate an offset value to center the origin
		VectorSubtract( hull.clip_mins, mins, offset );
		VectorAdd( offset, ent.v.origin, offset );

	} else {

		// create a temp hull from bounding box sizes
		const hullmins = new Float32Array( 3 );
		const hullmaxs = new Float32Array( 3 );
		VectorSubtract( ent.v.mins, maxs, hullmins );
		VectorSubtract( ent.v.maxs, mins, hullmaxs );
		hull = SV_HullForBox( hullmins, hullmaxs );

		VectorCopy( ent.v.origin, offset );

	}

	return hull;

}

/*
===============================================================================

ENTITY AREA CHECKING

===============================================================================
*/

const AREA_DEPTH = 4;
const AREA_NODES = 32;

class areanode_t {

	constructor() {

		this.axis = - 1; // -1 = leaf node
		this.dist = 0;
		this.children = [ null, null ];
		this.trigger_edicts = new link_t();
		this.solid_edicts = new link_t();

	}

}

const sv_areanodes = new Array( AREA_NODES );
for ( let i = 0; i < AREA_NODES; i ++ )
	sv_areanodes[ i ] = new areanode_t();

let sv_numareanodes = 0;

/*
===============
SV_CreateAreaNode
===============
*/
function SV_CreateAreaNode( depth, mins, maxs ) {

	const anode = sv_areanodes[ sv_numareanodes ];
	sv_numareanodes ++;

	ClearLink( anode.trigger_edicts );
	ClearLink( anode.solid_edicts );

	if ( depth === AREA_DEPTH ) {

		anode.axis = - 1;
		anode.children[ 0 ] = null;
		anode.children[ 1 ] = null;
		return anode;

	}

	const size = new Float32Array( 3 );
	VectorSubtract( maxs, mins, size );
	if ( size[ 0 ] > size[ 1 ] )
		anode.axis = 0;
	else
		anode.axis = 1;

	anode.dist = 0.5 * ( maxs[ anode.axis ] + mins[ anode.axis ] );

	const mins1 = new Float32Array( 3 );
	const mins2 = new Float32Array( 3 );
	const maxs1 = new Float32Array( 3 );
	const maxs2 = new Float32Array( 3 );
	VectorCopy( mins, mins1 );
	VectorCopy( mins, mins2 );
	VectorCopy( maxs, maxs1 );
	VectorCopy( maxs, maxs2 );

	maxs1[ anode.axis ] = anode.dist;
	mins2[ anode.axis ] = anode.dist;

	anode.children[ 0 ] = SV_CreateAreaNode( depth + 1, mins2, maxs2 );
	anode.children[ 1 ] = SV_CreateAreaNode( depth + 1, mins1, maxs1 );

	return anode;

}

/*
===============
SV_ClearWorld
===============
*/
/**
 * Resets the world's collision structures for a new map (WinQuake world.c): rebuilds the box hull and a fresh tree
 * of 32 area nodes, 4 levels deep, splitting the world model's bounds in half along its longer horizontal axis
 * (±4096 units when no world is loaded). Every entity is dropped from the old links and must be linked again.
 * Called by `SV_SpawnServer` after the world model is loaded.
 */
export function SV_ClearWorld() {

	SV_InitBoxHull();

	for ( let i = 0; i < AREA_NODES; i ++ ) {

		sv_areanodes[ i ] = new areanode_t();

	}

	sv_numareanodes = 0;

	if ( sv.worldmodel && sv.worldmodel.mins && sv.worldmodel.maxs ) {

		SV_CreateAreaNode( 0, sv.worldmodel.mins, sv.worldmodel.maxs );

	} else {

		// fallback: create with large bounds
		const mins = new Float32Array( [ - 4096, - 4096, - 4096 ] );
		const maxs = new Float32Array( [ 4096, 4096, 4096 ] );
		SV_CreateAreaNode( 0, mins, maxs );

	}

}

/*
===============
SV_UnlinkEdict
===============
*/
/**
 * Removes an entity from its area-node list, so traces and touches no longer see it (WinQuake world.c). Called
 * before an entity is moved or freed; safe to call on an entity that is not linked anywhere.
 *
 * @param {edict_t} ent the entity; its `area` link is cleared to point at itself
 */
export function SV_UnlinkEdict( ent ) {

	if ( ! ent.area.prev || ent.area.prev === ent.area )
		return; // not linked in anywhere
	RemoveLink( ent.area );
	ent.area.prev = ent.area;
	ent.area.next = ent.area;

}

/*
====================
SV_TouchLinks
====================
*/
/**
 * Runs the touch function of every SOLID_TRIGGER entity with a touch function whose absolute box overlaps `ent`,
 * found in the area tree from `node` down every side the entity's box reaches (WinQuake world.c). They are collected
 * first and touched after, each checked again (not freed, still a trigger, still overlapping), as QuakeSpasm does. Called by
 * `SV_LinkEdict` when `touch_triggers` is set. When a touch carries the entity through a camera portal it is
 * relinked at once (without touching triggers again).
 *
 * @param {edict_t} ent the entity that moved
 * @param {Object} node the area node to start from (the module's root node, `sv_areanodes[0]`)
 * @throws {Error} whatever a QuakeC touch function throws (see `SV_RunTriggerTouch`)
 */
export function SV_TouchLinks( ent, node ) {

	// the triggers first, then their touches (QuakeSpasm's order; card [44m]): a touch may free another trigger, and a
	// freed edict's area link points at itself, so walking the list while touching could loop on it forever
	const touched = [];
	SV_AreaTriggers( ent, node, touched );
	for ( const touch of touched ) {

		if ( touch.free || ! touch.v.touch || touch.v.solid !== SOLID_TRIGGER || ! SV_TriggerOverlaps( ent, touch ) )
			continue; // an earlier touch removed it, or moved one of the two

		if ( SV_RunTriggerTouch( ent, touch ) ) SV_LinkEdict( ent, false );

	}

}

// does `ent`'s absolute box overlap the trigger's?
function SV_TriggerOverlaps( ent, touch ) {

	return ! ( ent.v.absmin[ 0 ] > touch.v.absmax[ 0 ]
		|| ent.v.absmin[ 1 ] > touch.v.absmax[ 1 ]
		|| ent.v.absmin[ 2 ] > touch.v.absmax[ 2 ]
		|| ent.v.absmax[ 0 ] < touch.v.absmin[ 0 ]
		|| ent.v.absmax[ 1 ] < touch.v.absmin[ 1 ]
		|| ent.v.absmax[ 2 ] < touch.v.absmin[ 2 ] );

}

// the SOLID_TRIGGER edicts with a touch function that overlap `ent`, from `node` down every side its box reaches
function SV_AreaTriggers( ent, node, out ) {

	for ( let l = node.trigger_edicts.next; l !== node.trigger_edicts; l = l.next ) {

		const touch = l._owner; // EDICT_FROM_AREA(l)
		if ( touch && touch !== ent && touch.v.touch && touch.v.solid === SOLID_TRIGGER && SV_TriggerOverlaps( ent, touch ) )
			out.push( touch );

	}

	// recurse down both sides
	if ( node.axis === - 1 )
		return;

	if ( ent.v.absmax[ node.axis ] > node.dist )
		SV_AreaTriggers( ent, node.children[ 0 ], out );
	if ( ent.v.absmin[ node.axis ] < node.dist )
		SV_AreaTriggers( ent, node.children[ 1 ], out );

}

/**
 * Shared stock droptofloor operation: trace the native collision hull, then link without firing another touch. QC
 * (the `droptofloor` builtin in pr_cmds.js) and grounded arrivals (sv_rendveil.js) use the same path. Traces the
 * entity's box up to 256 units straight down; on a floor it moves the entity there, links it, sets FL_ONGROUND and
 * `groundentity`. Mutates `ent.v`.
 *
 * @param {edict_t} ent the entity to drop
 * @returns {boolean} true when it landed; false when there is no floor within 256 units or it starts all in solid
 *   (the entity is then left where it was)
 */
export function SV_DropToFloor( ent ) {
 const end=new Float32Array(ent.v.origin);end[2]-=256;
 const trace=SV_Move(ent.v.origin,ent.v.mins,ent.v.maxs,end,MOVE_NORMAL,ent);
 if(trace.fraction===1||trace.allsolid)return false;
 VectorCopy(trace.endpos,ent.v.origin);SV_LinkEdict(ent,false);
 ent.v.flags=(ent.v.flags|0)|FL_ONGROUND;ent.v.groundentity=EDICT_TO_PROG(trace.ent);
 return true;
}

/**
 * The public trigger dispatch keeps QC's self/other context and touch behavior together. Optional executors let
 * focused tests use the same entry point. Called by `SV_TouchLinks` for each overlapping trigger. First gives the
 * Newer hooks their turn: a respawn drop's own pickup (never runs the QC touch), the rend-veil arrival guard, and the
 * camera-portal crossing (which may move the teleport receiver to the portal's lateral exit for the touch). Then sets
 * `self` = the trigger, `other` = `ent` and `time` = `sv.time` in the QC globals and runs the touch function. On the
 * start map it also tells the flashlight run which skill hall the player entered. `self`, `other` and any moved
 * portal receiver are restored afterwards, even when the touch throws.
 *
 * @param {edict_t} ent the entity doing the touching
 * @param {edict_t} touch the trigger being touched; its `touch` function is run
 * @param {function(number): void} [execute=PR_ExecuteProgram] runs a QC function by number
 * @param {?function(Array<number>): boolean} [clearAt=null] true when `ent`'s hull is clear at that world-space
 *   origin; the default traces MOVE_NOMONSTERS (stock QC owns telefrags at the actual exit)
 * @returns {boolean} true when the touch carried `ent` through a camera portal (the caller relinks it); false for an
 *   ordinary touch, a skipped touch, or a respawn drop
 * @throws {Error} whatever the QC touch function throws (`PR_RunError`, `Host_Error`)
 */
export function SV_RunTriggerTouch( ent, touch, execute = PR_ExecuteProgram, clearAt = null ) {
	const recovered = SV_RespawnDropTouch( ent, touch );
	if ( recovered !== null ) return false; // custom payload touch never teleports the player
	const rite = SV_RendVeilTouchBegin( ent, touch );
	if ( rite === false ) return false; // a held arrival cannot restart its own rite

	const crossing = SV_BeginPortalTouch( ent, touch, SV_PortalBackingContact, SV_PortalObstructed );
	if ( crossing === false ) return false;
	const incoming = SV_PreparePortalTouch( crossing, clearAt || ( origin => {

		// Ignore monsters here: stock QC owns telefrags at the actual exit.
		const trace = SV_Move( origin, ent.v.mins, ent.v.maxs, origin, MOVE_NOMONSTERS, ent );
		return ! trace.startsolid && ! trace.allsolid;

	} ) );
	const old_self = pr_global_struct.self;
	const old_other = pr_global_struct.other;
	pr_global_struct.self = EDICT_TO_PROG( touch );
	pr_global_struct.other = EDICT_TO_PROG( ent );
	pr_global_struct.time = sv.time;
	try {

		// START's existing floor messages cover the corridor entrances. The
		// skill brushes are at the far end, beside the teleporters: too late
		// for a light intended to help the player walk down the corridor.
		// Keep QC's actual difficulty selection and message timing untouched.
		if ( sv.name === 'start' && svs.maxclients === 1 && ent.index === 1 &&
			ent.v.health > 0 && PR_GetString( ent.v.classname ) === 'player' &&
			PR_GetString( touch.v.classname ) === 'trigger_multiple' ) {
			const hall = /^This hall selects (EASY|NORMAL|HARD) skill$/.exec( PR_GetString( touch.v.message ) );
			if ( hall ) R_FlashlightSkillSelected( sv.name, [ 'EASY', 'NORMAL', 'HARD' ].indexOf( hall[ 1 ] ) );
		}
		execute( touch.v.touch );
		const crossed = SV_FinishPortalTouch( ent, incoming );
		SV_RendVeilTouchEnd( rite );
		return crossed;

	} finally {

		SV_RestorePortalReceiver( incoming );
		pr_global_struct.self = old_self;
		pr_global_struct.other = old_other;

	}

}

/**
 * Some stock windows have backing geometry that stops the player's full hull just before its origin can reach the
 * visible plane. Keep that collision; authorize a mapped portal touch at actual hull contact instead of requiring an
 * unreachable centre. A wall elsewhere, or merely being near a portal, is never sufficient. QC and receiver
 * clearance still decide the teleport. Passed to `SV_BeginPortalTouch` (sv_portal.js) by `SV_RunTriggerTouch`.
 *
 * Contact means `distance` is within the hull's extent along the normal (plus 1/16, two BSP clipping epsilons), and
 * a sweep of the hull toward the portal stops within 1/16 unit of where it stands, against a surface facing within
 * about 25° of the portal normal.
 *
 * @param {edict_t} ent the touching entity (its hull `mins`/`maxs` and `origin` are used)
 * @param {{ normal: Array<number> }} portal the camera portal; `normal` is its unit plane normal, pointing out of the
 *   visible surface toward the entity
 * @param {number} distance the entity origin's distance in front of the visible plane (Quake units)
 * @returns {boolean} true when the hull is touching the portal's backing wall; false otherwise or with no world
 */
export function SV_PortalBackingContact( ent, portal, distance ) {

	if ( ! sv.worldmodel?.hulls ) return false;
	const n = portal.normal;
	let radius = 0;
	for ( let i = 0; i < 3; i ++ ) radius -= n[ i ] * ( n[ i ] >= 0 ? ent.v.mins[ i ] : ent.v.maxs[ i ] );
	const epsilon = 1 / 16; // two BSP clipping epsilons, not a gameplay distance.
	if ( distance > radius + epsilon || distance <= 0 ) return false;
	const end = ent.v.origin.map( ( v, i ) => v - n[ i ] * ( distance + 0.5 ) );
	const trace = SV_Move( ent.v.origin, ent.v.mins, ent.v.maxs, end, MOVE_NOMONSTERS, ent );
	if ( trace.startsolid || trace.allsolid || trace.fraction >= 1 || DotProduct( trace.plane.normal, n ) < 0.9 ) return false;
	let remaining = 0;
	for ( let i = 0; i < 3; i ++ ) remaining += ( ent.v.origin[ i ] - trace.endpos[ i ] ) * n[ i ];
	return remaining >= - epsilon && remaining <= epsilon;

}

const STEPSIZE = 18; // sv_phys.js's step height (QC walkmove), not imported: sv_phys imports this file

/**
 * The hull overlaps a mapped camera portal's trigger but is held short of the visible threshold by a sill or frame
 * that a step cannot climb (the start hub's skill arches: a lip higher than a step, and a 48-unit opening for a
 * 32-unit hull). Its origin can never reach the threshold from there, and the lip is not the surface's own backing
 * wall, so without this the player stood still until they slid into line (card [14]). Not obstructed: a step the
 * next walk move climbs, a frame the hull slides past, or a hull still approaching. Passed to `SV_BeginPortalTouch`
 * (sv_portal.js) by `SV_RunTriggerTouch`, which consults it only when `SV_PortalBackingContact` said no.
 *
 * Held means a sweep toward the portal advances no more than 1/16 unit, and so does the same sweep from
 * STEPSIZE + 1/8 units higher and from 2.5 units to either side. Also false while sv_portalmotion reports the
 * entity is part-way through a step attempt this frame.
 *
 * @param {edict_t} ent the touching entity (its hull `mins`/`maxs` and `origin` are used)
 * @param {{ normal: Array<number> }} portal the camera portal; `normal` is its unit plane normal, pointing out of the
 *   visible surface toward the entity
 * @param {number} distance the entity origin's distance in front of the visible plane (Quake units)
 * @returns {boolean} true when the hull is held short of the threshold; false otherwise or with no world
 */
export function SV_PortalObstructed( ent, portal, distance ) {

	if ( ! sv.worldmodel?.hulls || ! ( distance > 0 ) ) return false;
	if ( SV_PortalMoveRead( ent, sv.time )?.stepping ) return false; // a step attempt that may be undone: the frame's final link decides
	const n = portal.normal, epsilon = 1 / 16; // two BSP clipping epsilons
	const toward = ( origin, reach ) => {

		const end = origin.map( ( v, i ) => v - n[ i ] * reach );
		return SV_Move( origin, ent.v.mins, ent.v.maxs, end, MOVE_NOMONSTERS, ent );

	};
	const advance = ( origin, trace ) => {

		let advanced = 0;
		for ( let i = 0; i < 3; i ++ ) advanced += ( origin[ i ] - trace.endpos[ i ] ) * n[ i ];
		return advanced;

	};
	const trace = toward( ent.v.origin, distance + 0.5 );
	if ( trace.startsolid || trace.allsolid || trace.fraction >= 1 ) return false;
	// Held means the sweep, and every sweep below, advances no further than the clipping epsilon: a hull with room
	// to advance is still approaching, a hull a step or a slide from getting through is not held.
	if ( advance( ent.v.origin, trace ) > epsilon ) return false;
	// Could the walk move step over it? Same sweep from one step higher (a start inside a ceiling cannot step).
	// (a margin of an eighth of a unit: a step of exactly STEPSIZE leaves the raised hull flush with its top)
	const up = Array.from( ent.v.origin ); up[ 2 ] += STEPSIZE + 0.125;
	const raised = toward( up, distance + 0.5 );
	if ( ! raised.startsolid && ! raised.allsolid && ( raised.fraction >= 1 || advance( up, raised ) > epsilon ) ) return false;
	// Or slide past it? The walk move slips a hull a couple of units sideways along a chamfered or angled frame; a
	// barrier across the whole opening (a sill) stops every nudge too.
	const side = Math.abs( n[ 2 ] ) < 0.7 ? [ n[ 1 ], - n[ 0 ], 0 ] : [ 1, 0, 0 ], sl = Math.hypot( side[ 0 ], side[ 1 ] ) || 1;
	for ( const nudge of [ - 2.5, 2.5 ] ) {

		const shifted = ent.v.origin.map( ( v, i ) => v + side[ i ] / sl * nudge );
		const slid = toward( shifted, distance + 0.5 );
		if ( ! slid.startsolid && ! slid.allsolid && ( slid.fraction >= 1 || advance( shifted, slid ) > epsilon ) ) return false;

	}
	return true;

}

/*
===============
SV_FindTouchedLeafs
===============
*/
/**
 * Records which world leaves an entity's absolute box touches, for the PVS check when entities are sent to clients
 * (WinQuake world.c). Called by `SV_LinkEdict`. Stops adding after 16 leaves (MAX_ENT_LEAFS) and skips solid leaves.
 * Each entry is the leaf's index minus 1, because leafs[0] is the solid leaf and PVS bit 0 = leafs[1].
 *
 * @param {edict_t} ent the entity; appended to `ent.leafnums`, counted in `ent.num_leafs` (the caller zeroes it)
 * @param {?(mnode_t|mleaf_t)} node the world BSP subtree to search
 */
export function SV_FindTouchedLeafs( ent, node ) {

	if ( ! node )
		return;

	if ( node.contents === CONTENTS_SOLID )
		return;

	// add an efrag if the node is a leaf
	if ( node.contents < 0 ) {

		if ( ent.num_leafs === 16 ) // MAX_ENT_LEAFS
			return;

		// leaf = (mleaf_t *)node
		// C: leafnum = leaf - sv.worldmodel->leafs - 1
		// The -1 is because leafs[0] is the solid leaf and PVS bit 0 = leafs[1]
		const leafnum = ( node._leafIndex !== undefined ? node._leafIndex : 0 ) - 1;

		ent.leafnums[ ent.num_leafs ] = leafnum;
		ent.num_leafs ++;
		return;

	}

	// NODE_MIXED
	const splitplane = node.plane;
	const sides = BoxOnPlaneSide( ent.v.absmin, ent.v.absmax, splitplane );

	// recurse down the contacted sides
	if ( sides & 1 )
		SV_FindTouchedLeafs( ent, node.children[ 0 ] );

	if ( sides & 2 )
		SV_FindTouchedLeafs( ent, node.children[ 1 ] );

}

/*
===============
SV_LinkEdict
===============
*/
/**
 * Links an entity into the world at its current origin (WinQuake world.c). Must be called whenever an entity's
 * origin, size or solidity changes. Unlinks it from the old position, sets `absmin`/`absmax` (expanded by 15 units
 * horizontally for FL_ITEM entities, to make items easier to pick up and allow them to be grabbed off of shelves,
 * or by 1 unit everywhere because movement is clipped an epsilon away from an actual edge), records its PVS leaves,
 * and, unless SOLID_NOT, inserts it in the trigger or solid list of the smallest area node that holds its box. The
 * world entity and free entities are not linked.
 *
 * @param {edict_t} ent the entity; `v.absmin`, `v.absmax`, `leafnums`, `num_leafs` and `area` are mutated
 * @param {boolean} touch_triggers true to run the touch function of every trigger it now overlaps (after a move);
 *   false for placement that must not fire triggers
 * @throws {Error} whatever a QuakeC touch function throws, when `touch_triggers` is true
 */
export function SV_LinkEdict( ent, touch_triggers ) {

	if ( ent.area.prev && ent.area.prev !== ent.area )
		SV_UnlinkEdict( ent ); // unlink from old position

	if ( ent === sv.edicts[ 0 ] )
		return; // don't add the world

	if ( ent.free )
		return;

	// set the abs box
	VectorAdd( ent.v.origin, ent.v.mins, ent.v.absmin );
	VectorAdd( ent.v.origin, ent.v.maxs, ent.v.absmax );

	//
	// to make items easier to pick up and allow them to be grabbed off
	// of shelves, the abs sizes are expanded
	//
	if ( ( ent.v.flags | 0 ) & FL_ITEM ) {

		ent.v.absmin[ 0 ] -= 15;
		ent.v.absmin[ 1 ] -= 15;
		ent.v.absmax[ 0 ] += 15;
		ent.v.absmax[ 1 ] += 15;

	} else {

		// because movement is clipped an epsilon away from an actual edge,
		// we must fully check even when bounding boxes don't quite touch
		ent.v.absmin[ 0 ] -= 1;
		ent.v.absmin[ 1 ] -= 1;
		ent.v.absmin[ 2 ] -= 1;
		ent.v.absmax[ 0 ] += 1;
		ent.v.absmax[ 1 ] += 1;
		ent.v.absmax[ 2 ] += 1;

	}

	// link to PVS leafs
	ent.num_leafs = 0;
	if ( ent.v.modelindex && sv.worldmodel && sv.worldmodel.nodes )
		SV_FindTouchedLeafs( ent, sv.worldmodel.nodes[ 0 ] );

	if ( ent.v.solid === SOLID_NOT )
		return;

	// find the first node that the ent's box crosses
	let node = sv_areanodes[ 0 ];
	while ( true ) {

		if ( node.axis === - 1 )
			break;
		if ( ent.v.absmin[ node.axis ] > node.dist )
			node = node.children[ 0 ];
		else if ( ent.v.absmax[ node.axis ] < node.dist )
			node = node.children[ 1 ];
		else
			break; // crosses the node

	}

	// link it in
	// We use _owner on the link to reference back to the edict (EDICT_FROM_AREA)
	ent.area._owner = ent;
	if ( ent.v.solid === SOLID_TRIGGER )
		InsertLinkBefore( ent.area, node.trigger_edicts );
	else
		InsertLinkBefore( ent.area, node.solid_edicts );

	// if touch_triggers, touch all entities at this node and descend for more
	if ( touch_triggers )
		SV_TouchLinks( ent, sv_areanodes[ 0 ] );

}

/*
===============================================================================

POINT TESTING IN HULLS

===============================================================================
*/

/*
==================
SV_HullPointContents
==================
*/
/**
 * Finds the contents of a point in a clipping hull by walking its clipnodes (WinQuake world.c).
 *
 * @param {hull_t} hull the hull to search
 * @param {number} num clipnode to start from (normally `hull.firstclipnode`); a negative value is returned as is
 * @param {Float32Array|Array<number>} p the point, in the hull's space (Quake units)
 * @returns {number} the leaf's CONTENTS_* value (negative: -1 empty, -2 solid, -3 water, -4 slime, -5 lava, -6 sky,
 *   -9..-14 currents)
 * @throws {Error} through `Sys_Error` when a node number falls outside the hull's clipnode range
 */
export function SV_HullPointContents( hull, num, p ) {

	while ( num >= 0 ) {

		if ( num < hull.firstclipnode || num > hull.lastclipnode )
			Sys_Error( 'SV_HullPointContents: bad node number' );

		const node = hull.clipnodes[ num ];
		const plane = hull.planes[ node.planenum ];

		let d;
		if ( plane.type < 3 )
			d = p[ plane.type ] - plane.dist;
		else
			d = DotProduct( plane.normal, p ) - plane.dist;
		if ( d < 0 )
			num = node.children[ 1 ];
		else
			num = node.children[ 0 ];

	}

	return num;

}

/*
==================
SV_PointContents
==================
*/
/**
 * Returns the world contents at a point in the point-size hull, with water currents reported as plain water
 * (WinQuake world.c). Used by the physics code (water level, liquid checks) and QC's `pointcontents`.
 *
 * @param {Float32Array|Array<number>} p the point, world space (Quake units)
 * @returns {number} a CONTENTS_* value; CONTENTS_CURRENT_0..CONTENTS_CURRENT_DOWN become CONTENTS_WATER;
 *   CONTENTS_EMPTY when no world is loaded
 * @throws {Error} through `Sys_Error` on a corrupt hull (see `SV_HullPointContents`)
 */
export function SV_PointContents( p ) {

	if ( ! sv.worldmodel || ! sv.worldmodel.hulls )
		return CONTENTS_EMPTY;

	let cont = SV_HullPointContents( sv.worldmodel.hulls[ 0 ], 0, p );
	if ( cont <= CONTENTS_CURRENT_0 && cont >= CONTENTS_CURRENT_DOWN )
		cont = CONTENTS_WATER;
	return cont;

}

/*
==================
SV_TruePointContents
==================
*/
/**
 * Returns the world contents at a point in the point-size hull, keeping water currents as they are (WinQuake
 * world.c).
 *
 * @param {Float32Array|Array<number>} p the point, world space (Quake units)
 * @returns {number} the CONTENTS_* value; CONTENTS_EMPTY when no world is loaded
 * @throws {Error} through `Sys_Error` on a corrupt hull (see `SV_HullPointContents`)
 */
export function SV_TruePointContents( p ) {

	if ( ! sv.worldmodel || ! sv.worldmodel.hulls )
		return CONTENTS_EMPTY;

	return SV_HullPointContents( sv.worldmodel.hulls[ 0 ], 0, p );

}

/*
============
SV_TestEntityPosition
============
*/
/**
 * Tests whether an entity's box at its current origin is inside anything solid, by a zero-length `SV_Move`. This
 * could be a lot more efficient... (WinQuake world.c). Used by the push and unstick physics and by the seamless
 * level-change placement.
 *
 * @param {edict_t} ent the entity to test (it does not clip against itself or its owner)
 * @returns {?edict_t} the world edict (`sv.edicts[0]`) when the position is blocked by the world or another entity;
 *   null when it is clear
 */
export function SV_TestEntityPosition( ent ) {

	const trace = SV_Move( ent.v.origin, ent.v.mins, ent.v.maxs, ent.v.origin, 0, ent );

	if ( trace.startsolid )
		return sv.edicts[ 0 ];

	return null;

}

/*
===============================================================================

LINE TESTING IN HULLS

===============================================================================
*/

// 1/32 epsilon to keep floating point happy
const DIST_EPSILON = 0.03125;

/*
==================
SV_RecursiveHullCheck
==================
*/
/**
 * Traces the segment p1..p2 through a clipping hull and records the first impact in `trace` (WinQuake world.c). The
 * impact point is put DIST_EPSILON (1/32 unit) on the near side of the plane and backed up further if it would still
 * be in solid. Called by `SV_ClipMoveToEntity` with the whole move (fractions 0 and 1), then by itself per node.
 *
 * @param {hull_t} hull the hull to trace
 * @param {number} num the clipnode (or negative contents) to test
 * @param {number} p1f fraction of the whole move at `p1`, 0..1
 * @param {number} p2f fraction of the whole move at `p2`, 0..1
 * @param {Float32Array|Array<number>} p1 segment start, hull space (Quake units)
 * @param {Float32Array|Array<number>} p2 segment end, hull space (Quake units)
 * @param {trace_t} trace accumulates the result: start it with `allsolid` true and `fraction` 1; `allsolid`,
 *   `startsolid`, `inopen`, `inwater`, and at an impact `fraction`, `endpos` and `plane`, are written
 * @param {number} [depth=0] recursion depth, indexing a pool of scratch midpoints that grows on demand
 * @returns {boolean} true when the segment ended without an impact; false when it hit (or never got out of solid)
 * @throws {Error} through `Sys_Error` when a node number falls outside the hull's clipnode range
 */
export function SV_RecursiveHullCheck( hull, num, p1f, p2f, p1, p2, trace, depth = 0 ) {

	// check for empty
	if ( num < 0 ) {

		if ( num !== CONTENTS_SOLID ) {

			trace.allsolid = false;
			if ( num === CONTENTS_EMPTY )
				trace.inopen = true;
			else
				trace.inwater = true;

		} else {

			trace.startsolid = true;

		}

		return true; // empty

	}

	if ( num < hull.firstclipnode || num > hull.lastclipnode )
		Sys_Error( 'SV_RecursiveHullCheck: bad node number' );

	//
	// find the point distances
	//
	const node = hull.clipnodes[ num ];
	const plane = hull.planes[ node.planenum ];

	let t1, t2;
	if ( plane.type < 3 ) {

		t1 = p1[ plane.type ] - plane.dist;
		t2 = p2[ plane.type ] - plane.dist;

	} else {

		t1 = DotProduct( plane.normal, p1 ) - plane.dist;
		t2 = DotProduct( plane.normal, p2 ) - plane.dist;

	}

	if ( t1 >= 0 && t2 >= 0 )
		return SV_RecursiveHullCheck( hull, node.children[ 0 ], p1f, p2f, p1, p2, trace, depth );
	if ( t1 < 0 && t2 < 0 )
		return SV_RecursiveHullCheck( hull, node.children[ 1 ], p1f, p2f, p1, p2, trace, depth );

	// put the crosspoint DIST_EPSILON pixels on the near side
	let frac;
	if ( t1 < 0 )
		frac = ( t1 + DIST_EPSILON ) / ( t1 - t2 );
	else
		frac = ( t1 - DIST_EPSILON ) / ( t1 - t2 );
	if ( frac < 0 )
		frac = 0;
	if ( frac > 1 )
		frac = 1;

	let midf = p1f + ( p2f - p1f ) * frac;
	// Use pre-allocated scratch vector from pool (indexed by recursion depth)
	let mid = _hullMidPool[ depth ];
	if ( mid == null ) {

		mid = new Float32Array( 3 );
		_hullMidPool[ depth ] = mid;

	}
	mid[ 0 ] = p1[ 0 ] + frac * ( p2[ 0 ] - p1[ 0 ] );
	mid[ 1 ] = p1[ 1 ] + frac * ( p2[ 1 ] - p1[ 1 ] );
	mid[ 2 ] = p1[ 2 ] + frac * ( p2[ 2 ] - p1[ 2 ] );

	const side = ( t1 < 0 ) ? 1 : 0;

	// move up to the node
	if ( ! SV_RecursiveHullCheck( hull, node.children[ side ], p1f, midf, p1, mid, trace, depth + 1 ) )
		return false;

	if ( SV_HullPointContents( hull, node.children[ side ^ 1 ], mid ) !== CONTENTS_SOLID )
		// go past the node
		return SV_RecursiveHullCheck( hull, node.children[ side ^ 1 ], midf, p2f, mid, p2, trace, depth + 1 );

	if ( trace.allsolid )
		return false; // never got out of the solid area

	//==================
	// the other side of the node is solid, this is the impact point
	//==================
	if ( ! side ) {

		VectorCopy( plane.normal, trace.plane.normal );
		trace.plane.dist = plane.dist;

	} else {

		VectorSubtract( vec3_origin, plane.normal, trace.plane.normal );
		trace.plane.dist = - plane.dist;

	}

	while ( SV_HullPointContents( hull, hull.firstclipnode, mid ) === CONTENTS_SOLID ) {

		// shouldn't really happen, but does occasionally
		frac -= 0.1;
		if ( frac < 0 ) {

			trace.fraction = midf;
			VectorCopy( mid, trace.endpos );
			Con_DPrintf( 'backup past 0\n' );
			return false;

		}

		midf = p1f + ( p2f - p1f ) * frac;
		for ( let i = 0; i < 3; i ++ )
			mid[ i ] = p1[ i ] + frac * ( p2[ i ] - p1[ i ] );

	}

	trace.fraction = midf;
	VectorCopy( mid, trace.endpos );

	return false;

}

/*
==================
SV_ClipMoveToEntity
==================
*/
/**
 * Handles selection or creation of a clipping hull, and offseting (and eventually rotation) of the end points
 * (WinQuake world.c). Traces a box from `start` to `end` against one entity only (the world when given
 * `sv.edicts[0]`). Called by `SV_Move` for the world and for each entity the move's box reaches.
 *
 * @param {edict_t} ent the entity to clip against
 * @param {Float32Array|Array<number>} start move start, world space (Quake units)
 * @param {Float32Array|Array<number>} mins moving box mins (Quake units, relative to its origin)
 * @param {Float32Array|Array<number>} maxs moving box maxs (Quake units, relative to its origin)
 * @param {Float32Array|Array<number>} end move end, world space (Quake units)
 * @returns {trace_t} a new trace with `endpos` in world space; `ent` is set to `ent` when the move was clipped or
 *   started in solid, otherwise null
 * @throws {Error} through `Sys_Error` for a bad SOLID_BSP entity or a corrupt hull
 */
export function SV_ClipMoveToEntity( ent, start, mins, maxs, end ) {

	const trace = new trace_t();

	// fill in a default trace
	trace.fraction = 1;
	trace.allsolid = true;
	VectorCopy( end, trace.endpos );

	// get the clipping hull
	const offset = new Float32Array( 3 );
	const hull = SV_HullForEntity( ent, mins, maxs, offset );

	const start_l = new Float32Array( 3 );
	const end_l = new Float32Array( 3 );
	VectorSubtract( start, offset, start_l );
	VectorSubtract( end, offset, end_l );

	// trace a line through the apropriate clipping hull
	SV_RecursiveHullCheck( hull, hull.firstclipnode, 0, 1, start_l, end_l, trace );

	// fix trace up by the offset
	if ( trace.fraction !== 1 )
		VectorAdd( trace.endpos, offset, trace.endpos );

	// did we clip the move?
	if ( trace.fraction < 1 || trace.startsolid )
		trace.ent = ent;

	return trace;

}

/*
====================
SV_ClipToLinks

Mins and maxs enclose the entire area swept by the move
====================
*/
function SV_ClipToLinks( node, clip ) {

	// touch linked edicts
	let l = node.solid_edicts.next;
	while ( l !== node.solid_edicts ) {

		const next = l.next;
		const touch = l._owner; // EDICT_FROM_AREA(l)
		if ( ! touch ) {

			l = next;
			continue;

		}

		if ( touch.v.solid === SOLID_NOT ) {

			l = next;
			continue;

		}

		if ( touch === clip.passedict ) {

			l = next;
			continue;

		}

		if ( touch.v.solid === SOLID_TRIGGER )
			Sys_Error( 'Trigger in clipping list' );

		if ( clip.type === MOVE_NOMONSTERS && touch.v.solid !== SOLID_BSP ) {

			l = next;
			continue;

		}

		if ( clip.boxmins[ 0 ] > touch.v.absmax[ 0 ]
			|| clip.boxmins[ 1 ] > touch.v.absmax[ 1 ]
			|| clip.boxmins[ 2 ] > touch.v.absmax[ 2 ]
			|| clip.boxmaxs[ 0 ] < touch.v.absmin[ 0 ]
			|| clip.boxmaxs[ 1 ] < touch.v.absmin[ 1 ]
			|| clip.boxmaxs[ 2 ] < touch.v.absmin[ 2 ] ) {

			l = next;
			continue;

		}

		if ( clip.passedict && clip.passedict.v.size && clip.passedict.v.size[ 0 ] && ! touch.v.size[ 0 ] ) {

			l = next;
			continue; // points never interact

		}

		// might intersect, so do an exact clip
		if ( clip.trace.allsolid ) {

			return;

		}

		if ( clip.passedict ) {

			// don't clip against own missiles
			// owner field is an entity index, need PROG_TO_EDICT to get entity reference
			if ( touch.v.owner !== 0 && PROG_TO_EDICT( touch.v.owner ) === clip.passedict ) {

				l = next;
				continue;

			}

			// don't clip against owner
			if ( clip.passedict.v.owner !== 0 && PROG_TO_EDICT( clip.passedict.v.owner ) === touch ) {

				l = next;
				continue;

			}

		}

		let trace;
		if ( ( touch.v.flags | 0 ) & FL_MONSTER )
			trace = SV_ClipMoveToEntity( touch, clip.start, clip.mins2, clip.maxs2, clip.end );
		else
			trace = SV_ClipMoveToEntity( touch, clip.start, clip.mins, clip.maxs, clip.end );

		if ( trace.allsolid || trace.startsolid || trace.fraction < clip.trace.fraction ) {

			trace.ent = touch;
			if ( clip.trace.startsolid ) {

				clip.trace = trace;
				clip.trace.startsolid = true;

			} else {

				clip.trace = trace;

			}

		} else if ( trace.startsolid ) {

			clip.trace.startsolid = true;

		}

		l = next;

	}

	// recurse down both sides
	if ( node.axis === - 1 )
		return;

	if ( clip.boxmaxs[ node.axis ] > node.dist )
		SV_ClipToLinks( node.children[ 0 ], clip );
	if ( clip.boxmins[ node.axis ] < node.dist )
		SV_ClipToLinks( node.children[ 1 ], clip );

}

/*
==================
SV_MoveBounds
==================
*/
function SV_MoveBounds( start, mins, maxs, end, boxmins, boxmaxs ) {

	for ( let i = 0; i < 3; i ++ ) {

		if ( end[ i ] > start[ i ] ) {

			boxmins[ i ] = start[ i ] + mins[ i ] - 1;
			boxmaxs[ i ] = end[ i ] + maxs[ i ] + 1;

		} else {

			boxmins[ i ] = end[ i ] + mins[ i ] - 1;
			boxmaxs[ i ] = start[ i ] + maxs[ i ] + 1;

		}

	}

}

/*
==================
SV_Move
==================
*/
/**
 * Traces a box from `start` to `end` against the world and every solid entity (WinQuake world.c), the main collision
 * query of the server physics, QC's `traceline`/`walkmove` and the Newer gameplay. Entities never clip against
 * themselves or their owner, nor against their own missiles. MOVE_NOMONSTERS clips only against the world and
 * SOLID_BSP entities; MOVE_MISSILE uses a ±15-unit box against monsters so missiles hit them more easily. A mover
 * with a size passes through point-size entities (points never interact).
 *
 * @param {Float32Array|Array<number>} start move start, world space (Quake units)
 * @param {Float32Array|Array<number>} mins moving box mins (Quake units, relative to its origin; all 0 for a line)
 * @param {Float32Array|Array<number>} maxs moving box maxs (Quake units, relative to its origin)
 * @param {Float32Array|Array<number>} end move end, world space (Quake units)
 * @param {number} type MOVE_NORMAL (0), MOVE_NOMONSTERS (1) or MOVE_MISSILE (2)
 * @param {?edict_t} passedict the entity doing the move (skipped, with its owner and its missiles), or null
 * @returns {trace_t} a new trace of the nearest impact (the caller may keep it): `ent` is the entity hit (the world
 *   edict for map geometry), or null when nothing was hit
 * @throws {Error} through `Sys_Error` when a trigger is found in a solid list, for a bad SOLID_BSP entity or a
 *   corrupt hull
 */
export function SV_Move( start, mins, maxs, end, type, passedict ) {

	const clip = new moveclip_t();

	// clip to world
	clip.trace = SV_ClipMoveToEntity( sv.edicts[ 0 ], start, mins, maxs, end );

	clip.start = start;
	clip.end = end;
	clip.mins = mins;
	clip.maxs = maxs;
	clip.type = type;
	clip.passedict = passedict;

	if ( type === MOVE_MISSILE ) {

		for ( let i = 0; i < 3; i ++ ) {

			clip.mins2[ i ] = - 15;
			clip.maxs2[ i ] = 15;

		}

	} else {

		VectorCopy( mins, clip.mins2 );
		VectorCopy( maxs, clip.maxs2 );

	}

	// create the bounding box of the entire move
	SV_MoveBounds( start, clip.mins2, clip.maxs2, end, clip.boxmins, clip.boxmaxs );

	// clip to entities
	SV_ClipToLinks( sv_areanodes[ 0 ], clip );

	return clip.trace;

}
