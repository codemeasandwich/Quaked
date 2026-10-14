/**
 * @module newer/render/r_itemturn
 *
 * Ammunition and health boxes turned a little each, for every game (card T-3faa98e3 item 13, from Arcane
 * Dimensions; docs/small-touches-2026-10-14.md): in stock maps every box faces the same way, squared to the map's
 * grid. In Newer Game each box the map placed unturned is drawn turned by its own amount, up to 30 degrees either
 * way, about its own middle, so a row of boxes looks set down rather than stamped out. Only the drawn picture turns:
 * where the box is, what touches it and what the server knows are unchanged. A turn that would put a corner of the
 * box into a wall is made smaller, or not made.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; each turned entity keeps its turn (`_itemTurn`) while its model and map stay the same; each
 * model remembers whether it is a pickup box (`_itemBox`).
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl, cls } from '../../engine/client/client.js';
import { R_NewerGame } from '../mode.js';
import { FX_Contents, FX_SOLID } from './fx_world.js';

/** Turned item boxes: 0 off, 1 on (saved; Options, Newer features). */
export const r_itemturn = new cvar_t( 'r_itemturn', '1', true );

/** Quake's pickup boxes (health, shells, nails, rockets, cells), by model; the exploding box is not one. */
export const ITEM_BOXES = /^maps\/b_(bh\d+|shell\d|nail\d|rock\d|batt\d)\.bsp$/i;
const MOST = 30; // degrees either way

// the same turn for the same box every time and on every machine: from where the map put it
function hashed( o ) {

	let h = Math.imul( Math.round( o[ 0 ] ) | 0, 73856093 ) ^ Math.imul( Math.round( o[ 1 ] ) | 0, 19349663 ) ^ Math.imul( Math.round( o[ 2 ] ) | 0, 83492791 );
	h = Math.imul( h ^ ( h >>> 15 ), 0x2c1b3c6d ); h ^= h >>> 12;
	return ( ( h >>> 0 ) % 10000 ) / 10000;

}

// the turn (degrees) for a box at `o` with bounds `mins`/`maxs`: as large as its own amount allows, halved until every
// corner stays out of the world's solid (a box against a wall keeps its corners in the room)
function turnFor( o, mins, maxs ) {

	const want = ( hashed( o ) * 2 - 1 ) * MOST;
	const cx = ( mins[ 0 ] + maxs[ 0 ] ) / 2, cy = ( mins[ 1 ] + maxs[ 1 ] ) / 2, hx = ( maxs[ 0 ] - mins[ 0 ] ) / 2, hy = ( maxs[ 1 ] - mins[ 1 ] ) / 2;
	const heights = [ mins[ 2 ] + 1, ( mins[ 2 ] + maxs[ 2 ] ) / 2, maxs[ 2 ] - 1 ], p = [ 0, 0, 0 ];
	for ( let a = want, tries = 0; tries < 4; a /= 2, tries ++ ) {

		const r = a * Math.PI / 180, c = Math.cos( r ), s = Math.sin( r );
		let clear = true;
		for ( const [ sx, sy ] of [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] ) for ( const z of heights ) {

			const x = sx * hx, y = sy * hy;
			p[ 0 ] = o[ 0 ] + cx + x * c - y * s; p[ 1 ] = o[ 1 ] + cy + x * s + y * c; p[ 2 ] = o[ 2 ] + z;
			if ( FX_Contents( cl.worldmodel, p ) === FX_SOLID ) clear = false;

		}
		if ( clear ) return a;

	}
	return 0;

}

/**
 * Turns a pickup box's drawn picture, if it is one the map placed unturned. Called by the client for each entity as
 * it sets the entity's place and angles for this frame (CL_RelinkEntities, CL_LinkPacketEntities), after them; the
 * next frame starts again from the server's place and angles, so in New Game, in demos (the title demo's two halves
 * among them), with `r_itemturn 0` or for anything else nothing is ever changed. The turn is worked out where the box
 * is first seen and kept, so a box on a lift keeps it as it rides.
 *
 * @param {object} ent the client entity (its `origin` and `angles` are this frame's drawn ones)
 */
export function R_ItemTurn( ent ) {

	if ( ! R_NewerGame() || ! ( r_itemturn.value > 0 ) || cls.demoplayback || ! cl.worldmodel ) return;
	const model = ent?.model;
	if ( ! model ) return;
	if ( model._itemBox === undefined ) model._itemBox = ITEM_BOXES.test( model.name ?? '' ); // (asked once per model)
	if ( ! model._itemBox ) return;
	if ( ent.angles[ 0 ] !== 0 || ent.angles[ 1 ] !== 0 || ent.angles[ 2 ] !== 0 ) return; // (the mapper turned it: theirs)
	const o = ent.origin;
	let t = ent._itemTurn;
	// worked out where the box is first seen, and kept: a box riding a lift keeps its turn as it goes
	if ( ! t || t.model !== model || t.world !== cl.worldmodel ) {

		const yaw = turnFor( o, model.mins, model.maxs );
		const r = yaw * Math.PI / 180, cx = ( model.mins[ 0 ] + model.maxs[ 0 ] ) / 2, cy = ( model.mins[ 1 ] + model.maxs[ 1 ] ) / 2;
		// turned about its middle: the corner origin moves so the middle stays where it was
		t = ent._itemTurn = { model, world: cl.worldmodel, yaw,
			dx: cx - ( cx * Math.cos( r ) - cy * Math.sin( r ) ), dy: cy - ( cx * Math.sin( r ) + cy * Math.cos( r ) ) };

	}
	if ( t.yaw === 0 ) return;
	ent.angles[ 1 ] = t.yaw;
	ent.origin[ 0 ] += t.dx; ent.origin[ 1 ] += t.dy;

}
