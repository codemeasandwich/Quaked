/**
 * @module engine/client/hexen2_bind
 *
 * Binds a client state built from the private signon/live stream to the port's client entity array and view: model
 * precache entries, baseline entities, the live entity table, the view entity and the view height. The renderer's
 * view code (`V_CalcRefdef`) then reads the same `cl_entities` it uses for a Quake session. Player stats/HUD remain
 * separate; this module only wires entity and view state.
 *
 * Types: plain values and functions; no exported classes.
 * State: writes the client state it is given; no module state.
 * Errors: none raised; missing entities are skipped and reported in the result.
 */

import { entity_t } from '../render/render.js';

/**
 * Binds a synced client state to the client.
 *
 * @param {object} state a state from `Hexen2_ClientState` (serverinfo, baselines, entities, viewEntity, viewHeight)
 * @param {{ cl: object, clEntities: Array<object>, modelAt?: function(string): ?object, viewangles?: ArrayLike<number> }} client
 *   the client state, its entity array and an optional model resolver for the precache names
 * @returns {{ ok: true, viewEntity: number, boundEntities: number } | { ok: false, reason: string }} what was bound
 */
export function Hexen2_BindClientState( state, client ) {

	if ( !state || !client?.cl || !Array.isArray( client.clEntities ) ) return { ok: false, reason: 'no client state' };
	const cl = client.cl, entities = client.clEntities;
	const ensure = index => {

		while ( entities.length <= index ) entities.push( new entity_t() );
		const ent = entities[ index ];
		if ( ent.origin === undefined ) ent.origin = [ 0, 0, 0 ];
		if ( ent.angles === undefined ) ent.angles = [ 0, 0, 0 ];
		return ent;

	};
	if ( client.modelAt && state.models?.length ) {

		cl.model_precache = cl.model_precache ?? [];
		for ( let i = 0; i < state.models.length; i ++ ) cl.model_precache[ i + 1 ] = client.modelAt( state.models[ i ] ) ?? null;

	}
	let bound = 0;
	for ( const [ index, baseline ] of state.baselines ?? [] ) {

		const ent = ensure( index );
		ent.origin = [ baseline.origin[ 0 ], baseline.origin[ 1 ], baseline.origin[ 2 ] ];
		ent.angles = [ baseline.angles[ 0 ], baseline.angles[ 1 ], baseline.angles[ 2 ] ];
		ent.frame = baseline.frame;
		ent.model = cl.model_precache?.[ baseline.modelIndex ] ?? null;
		bound ++;

	}
	for ( const [ index, update ] of state.entities ?? [] ) {

		const ent = ensure( index );
		if ( update.origin ) ent.origin = [ update.origin[ 0 ], update.origin[ 1 ], update.origin[ 2 ] ];
		if ( update.angles ) ent.angles = [ update.angles[ 0 ], update.angles[ 1 ], update.angles[ 2 ] ];
		if ( update.modelIndex !== undefined ) ent.model = cl.model_precache?.[ update.modelIndex ] ?? null;
		if ( update.frame !== undefined ) ent.frame = update.frame;
		bound ++;

	}
	cl.viewentity = state.viewEntity | 0;
	if ( Number.isFinite( state.viewHeight ) ) cl.viewheight = state.viewHeight;
	if ( client.viewangles ) cl.viewangles = [ client.viewangles[ 0 ], client.viewangles[ 1 ], client.viewangles[ 2 ] ];
	return { ok: true, viewEntity: cl.viewentity, boundEntities: bound };

}
