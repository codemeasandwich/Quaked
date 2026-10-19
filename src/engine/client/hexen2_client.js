/**
 * @module engine/client/hexen2_client
 *
 * Binds a Hexen II server player to the port's client view state, the step a local (single-process) session performs
 * from the server's player update instead of a network message: `cl_entities[cl.viewentity]` receives the player's
 * origin and angles, `cl.viewheight` receives the gamecode's eye height, and `cl.viewangles` receives the current
 * look direction. The existing client view code (`V_CalcRefdef`) then builds the renderer's refresh view from it.
 *
 * Types: plain values and functions; no exported classes.
 * State: writes the client state it is given; no module state.
 * Errors: a missing client, view entity or player field is reported as `{ ok: false, reason }`.
 */

import { entity_t } from '../render/render.js';

/**
 * Copies a Hexen player's view state into the client.
 *
 * @param {{ cl: object, clEntities: Array<object>, viewangles?: ArrayLike<number> }} client the client state, its
 *   entity array and the desired look direction (defaults to the player's `v_angle`)
 * @param {object} player the server player edict
 * @returns {{ ok: true, viewentity: number, viewheight: number } | { ok: false, reason: string }} the bound view
 */
export function Hexen2_ApplyPlayerView( client, player ) {

	if ( ! client || ! client.cl ) return { ok: false, reason: 'no client state' };
	if ( ! player || ! player.v || ! player.v.origin ) return { ok: false, reason: 'no player edict' };
	const cl = client.cl;
	const index = player.index;
	if ( ! Number.isInteger( index ) || index <= 0 ) return { ok: false, reason: 'the player has no view entity' };
	const entities = client.clEntities;
	while ( entities.length <= index ) entities.push( new entity_t() );
	const ent = entities[ index ];
	ent.origin = [ player.v.origin[ 0 ], player.v.origin[ 1 ], player.v.origin[ 2 ] ];
	ent.angles = [ player.v.angles[ 0 ], player.v.angles[ 1 ], player.v.angles[ 2 ] ];
	const viewOfs = player.v.view_ofs ?? [ 0, 0, 0 ];
	cl.viewentity = index;
	cl.viewheight = viewOfs[ 2 ];
	const angles = client.viewangles ?? ( player.v.v_angle ? player.v.v_angle : player.v.angles );
	cl.viewangles = [ angles[ 0 ], angles[ 1 ], angles[ 2 ] ];
	return { ok: true, viewentity: index, viewheight: cl.viewheight };

}
