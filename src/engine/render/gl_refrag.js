/**
 * @module engine/render/gl_refrag
 *
 * Entity fragments (WinQuake gl_refrag.c): which BSP leaves a static entity touches.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `r_pefragtopnode`, `lastlink`, `r_addent`, `_cl`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Engine callbacks are injected with `R_Efrag_SetExternals`.
 */
// Ported from: WinQuake/gl_refrag.c -- entity fragment functions

import { Con_Printf } from '../common/console.js';
import { CONTENTS_SOLID } from '../common/bspfile.js';

/*
===============================================================================

					ENTITY FRAGMENT FUNCTIONS

===============================================================================
*/

let r_pefragtopnode = null;
let lastlink = null;
const r_emins = new Float32Array( 3 );
const r_emaxs = new Float32Array( 3 );
let r_addent = null;

// External references (set via setters)
let _cl = null;

/**
 * Gives this module the client state whose efrag free list (`cl.free_efrags`) and world model it uses. Called once
 * from host.js during `Host_Init`; until then `R_AddEfrags` and `R_RemoveEfrags` do nothing. The reference is kept for
 * the life of the page (the client state object is reused across maps).
 *
 * @param {{ cl?: client_state_t }} externals `cl` is the client state; absent keeps the previous one
 */
export function R_Efrag_SetExternals( externals ) {

	if ( externals.cl ) _cl = externals.cl;

}

/*
================
BOX_ON_PLANE_SIDE

Returns 1 if box is entirely on front side of plane,
2 if entirely on back side, or 3 if crossing the plane
================
*/
function BOX_ON_PLANE_SIDE( emins, emaxs, p ) {

	const normal = p.normal;
	const dist = p.dist;

	// Fast axial cases
	if ( p.type < 3 ) {

		if ( dist <= emins[ p.type ] )
			return 1;
		if ( dist >= emaxs[ p.type ] )
			return 2;
		return 3;

	}

	// General case
	let dist1, dist2;

	switch ( p.signbits ) {

		case 0:
			dist1 = normal[ 0 ] * emaxs[ 0 ] + normal[ 1 ] * emaxs[ 1 ] + normal[ 2 ] * emaxs[ 2 ];
			dist2 = normal[ 0 ] * emins[ 0 ] + normal[ 1 ] * emins[ 1 ] + normal[ 2 ] * emins[ 2 ];
			break;
		case 1:
			dist1 = normal[ 0 ] * emins[ 0 ] + normal[ 1 ] * emaxs[ 1 ] + normal[ 2 ] * emaxs[ 2 ];
			dist2 = normal[ 0 ] * emaxs[ 0 ] + normal[ 1 ] * emins[ 1 ] + normal[ 2 ] * emins[ 2 ];
			break;
		case 2:
			dist1 = normal[ 0 ] * emaxs[ 0 ] + normal[ 1 ] * emins[ 1 ] + normal[ 2 ] * emaxs[ 2 ];
			dist2 = normal[ 0 ] * emins[ 0 ] + normal[ 1 ] * emaxs[ 1 ] + normal[ 2 ] * emins[ 2 ];
			break;
		case 3:
			dist1 = normal[ 0 ] * emins[ 0 ] + normal[ 1 ] * emins[ 1 ] + normal[ 2 ] * emaxs[ 2 ];
			dist2 = normal[ 0 ] * emaxs[ 0 ] + normal[ 1 ] * emaxs[ 1 ] + normal[ 2 ] * emins[ 2 ];
			break;
		case 4:
			dist1 = normal[ 0 ] * emaxs[ 0 ] + normal[ 1 ] * emaxs[ 1 ] + normal[ 2 ] * emins[ 2 ];
			dist2 = normal[ 0 ] * emins[ 0 ] + normal[ 1 ] * emins[ 1 ] + normal[ 2 ] * emaxs[ 2 ];
			break;
		case 5:
			dist1 = normal[ 0 ] * emins[ 0 ] + normal[ 1 ] * emaxs[ 1 ] + normal[ 2 ] * emins[ 2 ];
			dist2 = normal[ 0 ] * emaxs[ 0 ] + normal[ 1 ] * emins[ 1 ] + normal[ 2 ] * emaxs[ 2 ];
			break;
		case 6:
			dist1 = normal[ 0 ] * emaxs[ 0 ] + normal[ 1 ] * emins[ 1 ] + normal[ 2 ] * emins[ 2 ];
			dist2 = normal[ 0 ] * emins[ 0 ] + normal[ 1 ] * emaxs[ 1 ] + normal[ 2 ] * emaxs[ 2 ];
			break;
		case 7:
			dist1 = normal[ 0 ] * emins[ 0 ] + normal[ 1 ] * emins[ 1 ] + normal[ 2 ] * emins[ 2 ];
			dist2 = normal[ 0 ] * emaxs[ 0 ] + normal[ 1 ] * emaxs[ 1 ] + normal[ 2 ] * emaxs[ 2 ];
			break;
		default:
			dist1 = dist2 = 0; // shut up compiler
			break;

	}

	let sides = 0;
	if ( dist1 >= dist ) sides = 1;
	if ( dist2 < dist ) sides |= 2;

	return sides;

}

/*
================
R_RemoveEfrags
================
*/
/**
 * Call when removing an object from the world or moving it to another position (WinQuake gl_refrag.c): unlinks each
 * of the entity's efrags from its leaf's list and returns them to `cl.free_efrags`, then clears `ent.efrag`. Called by
 * cl_main.js's `CL_RelinkEntities` when an entity slot has just become empty. Does nothing before
 * `R_Efrag_SetExternals`.
 *
 * @param {entity_t} ent the entity; mutated (`efrag` set to null) along with the leaves it was in
 */
export function R_RemoveEfrags( ent ) {

	if ( _cl == null ) return;

	let ef = ent.efrag;

	while ( ef != null ) {

		// Remove from leaf's efrag list
		const leaf = ef.leaf;
		if ( leaf != null && leaf.efrags != null ) {

			if ( leaf.efrags === ef ) {

				leaf.efrags = ef.leafnext;

			} else {

				let prev = leaf.efrags;
				while ( prev != null && prev.leafnext !== ef ) {

					prev = prev.leafnext;

				}

				if ( prev != null ) {

					prev.leafnext = ef.leafnext;

				}

			}

		}

		const old = ef;
		ef = ef.entnext;

		// Put it on the free list
		old.entnext = _cl.free_efrags;
		_cl.free_efrags = old;

	}

	ent.efrag = null;

}

/*
===================
R_SplitEntityOnNode
===================
*/
function R_SplitEntityOnNode( node ) {

	if ( node == null ) return;
	if ( node.contents === CONTENTS_SOLID ) return;

	// Add an efrag if the node is a leaf
	if ( node.contents < 0 ) {

		if ( r_pefragtopnode == null )
			r_pefragtopnode = node;

		const leaf = node;

		// Grab an efrag off the free list
		const ef = _cl.free_efrags;
		if ( ef == null ) {

			Con_Printf( 'Too many efrags!\n' );
			return;

		}

		_cl.free_efrags = _cl.free_efrags.entnext;

		ef.entity = r_addent;

		// Add the entity link
		if ( lastlink != null ) {

			lastlink.entnext = ef;

		} else {

			r_addent.efrag = ef;

		}

		lastlink = ef;
		ef.entnext = null;

		// Set the leaf links
		ef.leaf = leaf;
		ef.leafnext = leaf.efrags;
		leaf.efrags = ef;

		return;

	}

	// NODE_MIXED - recurse down the contacted sides
	const splitplane = node.plane;
	const sides = BOX_ON_PLANE_SIDE( r_emins, r_emaxs, splitplane );

	if ( sides === 3 ) {

		// Split on this plane
		if ( r_pefragtopnode == null )
			r_pefragtopnode = node;

	}

	// Recurse down the contacted sides
	if ( sides & 1 )
		R_SplitEntityOnNode( node.children[ 0 ] );

	if ( sides & 2 )
		R_SplitEntityOnNode( node.children[ 1 ] );

}

/*
===========
R_AddEfrags
===========
*/
/**
 * Links an entity into every BSP leaf its bounding box (origin + model mins/maxs, Quake units, world space) touches
 * by walking the world's node tree from `nodes[0]`, taking one efrag per non-solid leaf from `cl.free_efrags`, so
 * `R_StoreEfrags` can draw it when one of those leaves is visible (WinQuake gl_refrag.c). Prints "Too many efrags!"
 * and stops adding when the free list (MAX_EFRAGS, rebuilt by `CL_ClearState`) runs out. Called by cl_parse.js's
 * `CL_ParseStatic` for each static entity at map load. Does nothing before `R_Efrag_SetExternals`, or when the entity
 * has no model; without a world model the chain stays empty.
 *
 * @param {entity_t} ent the entity; mutated: `efrag` becomes the head of its efrag chain and `topnode` the first node
 *   whose plane splits its box (or the first leaf reached), null when nothing was linked
 */
export function R_AddEfrags( ent ) {

	if ( _cl == null ) return;
	if ( ent.model == null ) return;

	r_addent = ent;

	// Initialize the entity's efrag chain
	lastlink = null;
	r_pefragtopnode = null;

	const entmodel = ent.model;

	for ( let i = 0; i < 3; i ++ ) {

		r_emins[ i ] = ent.origin[ i ] + entmodel.mins[ i ];
		r_emaxs[ i ] = ent.origin[ i ] + entmodel.maxs[ i ];

	}

	if ( _cl.worldmodel != null && _cl.worldmodel.nodes != null ) {

		R_SplitEntityOnNode( _cl.worldmodel.nodes[ 0 ] );

	}

	ent.topnode = r_pefragtopnode;

}

/*
================
R_StoreEfrags
================
*/
/**
 * Add efrags to the visible entity list (WinQuake gl_refrag.c): walks one leaf's efrag chain and appends each entity
 * with a model to `cl_visedicts`, once per frame (it is skipped when its `visframe` already equals `r_framecount`, and
 * marked otherwise), until the list holds `MAX_VISEDICTS`. Called by gl_rsurf.js for every visible leaf (and portal
 * destination leaf) with efrags while the world is marked each frame.
 *
 * @param {?efrag_t} ppefrag the first efrag of the leaf (`leaf.efrags`), followed through `leafnext`; null adds nothing
 * @param {Array<entity_t>} cl_visedicts the frame's visible-entity list; written from index `cl_numvisedicts` on
 * @param {number} cl_numvisedicts how many entries the list already holds
 * @param {number} MAX_VISEDICTS capacity of the list; entities beyond it are dropped
 * @param {number} r_framecount the renderer's current frame number, stored in each added entity's `visframe`
 * @returns {number} the new count of visible entities; the caller stores it (`set_cl_numvisedicts`)
 */
export function R_StoreEfrags( ppefrag, cl_visedicts, cl_numvisedicts, MAX_VISEDICTS, r_framecount ) {

	let pefrag = ppefrag;

	while ( pefrag != null ) {

		const pent = pefrag.entity;
		const clmodel = pent.model;

		if ( clmodel != null && pent.visframe !== r_framecount && cl_numvisedicts < MAX_VISEDICTS ) {

			cl_visedicts[ cl_numvisedicts ] = pent;
			cl_numvisedicts ++;

			// Mark that we've recorded this entity for this frame
			pent.visframe = r_framecount;

		}

		pefrag = pefrag.leafnext;

	}

	return cl_numvisedicts;

}
