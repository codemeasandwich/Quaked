/**
 * @module engine/progs/hexen2_temp_edicts
 *
 * Hexen II's temporary edict pool (`ED_Alloc_Temp`, pr_edict.c). The native server reserves the slots directly after
 * the client edicts at spawn (`sv.num_edicts = maxclients + 1 + max_temp_edicts`) and never lets the ordinary
 * allocator have them. The unified server keeps that contract through the `sv.max_temp_edicts` field: package U1
 * reserves `[maxclients + 1, maxclients + 1 + sv.max_temp_edicts)` and makes `ED_Alloc` start above it, while this
 * module allocates and recycles only inside the range.
 *
 * Types: plain values and functions; no exported classes.
 * State: none here; the server state holds `sv.max_temp_edicts`.
 * Errors: none raised here.
 */

import { sv, svs, EDICT_NUM } from './progs.js';
import { ED_ClearEdict, ED_Free } from './pr_edict.js';

/** The native `max_temp_edicts` default (30). */
export const HEXEN2_MAX_TEMP_EDICTS = 30;

/**
 * How many temporary slots this server reserves.
 *
 * @param {object} [state=sv] the server state
 * @returns {number} `sv.max_temp_edicts`, or the native default when the field is absent
 */
export function Hexen2_TempEdictCount( state = sv ) {

	const value = Math.trunc( state?.max_temp_edicts ?? HEXEN2_MAX_TEMP_EDICTS );
	return value > 0 ? value : 0;

}

/**
 * The first reserved temporary edict number (`maxclients + 1`, the world and client slots come first).
 *
 * @param {object} [state=sv] the server state
 * @param {object} [clients=svs] the server's client table
 * @returns {number} the first temporary slot
 */
export function Hexen2_TempEdictStart( state = sv, clients = svs ) { return ( clients?.maxclients ?? 0 ) + 1; }

/**
 * Makes sure the reserved temporary slots exist and are marked free. The native spawn clears each one with
 * `freetime = -999`; the same marker keeps `ED_Alloc_Temp`'s reuse-recently-freed policy from delaying the first
 * allocation. Package U1 calls this after setting `sv.max_temp_edicts` and before the first map entity is spawned.
 *
 * @param {object} [state=sv] the server state
 * @param {object} [clients=svs] the server's client table
 * @returns {{ start: number, count: number }} the reserved range
 */
export function Hexen2_ReserveTempEdicts( state = sv, clients = svs ) {

	const start = Hexen2_TempEdictStart( state, clients ), count = Hexen2_TempEdictCount( state );
	const end = Math.min( start + count, state.max_edicts || start + count );
	for ( let index = start; index < end; index ++ ) {

		const ed = EDICT_NUM( index );
		ED_ClearEdict( ed );
		ed.free = true;
		ed.freetime = - 999;
		ed.alloctime = 0;

	}
	if ( state.num_edicts < end ) state.num_edicts = end;
	return { start, count: end - start };

}

/**
 * Whether an edict number is inside the reserved temporary range. Package U1's `ED_Alloc` uses this to start at
 * `Hexen2_TempEdictStart() + Hexen2_TempEdictCount()` so ordinary spawns never take a temporary slot.
 *
 * @param {number} index an edict number
 * @param {object} [state=sv] the server state
 * @param {object} [clients=svs] the server's client table
 * @returns {boolean} true for a reserved temporary slot
 */
export function Hexen2_IsTempEdict( index, state = sv, clients = svs ) {

	const start = Hexen2_TempEdictStart( state, clients );
	return index >= start && index < start + Hexen2_TempEdictCount( state );

}

/**
 * A temporary edict for an effect (`ED_Alloc_Temp`): the first free slot outside the reuse delay, otherwise the
 * longest-unused slot, which is freed and handed out again.
 *
 * @returns {object} a cleared edict inside the reserved range
 */
export function Hexen2_ED_Alloc_Temp() {

	const start = Hexen2_TempEdictStart();
	const count = Math.min( Hexen2_TempEdictCount(), ( sv.max_edicts || start + Hexen2_TempEdictCount() ) - start );
	if ( count <= 0 ) throw new Error( 'ED_Alloc_Temp: no temporary edicts reserved' );
	if ( sv.num_edicts < start + count )
		throw new Error( 'ED_Alloc_Temp: temporary edict slots are not reserved' );

	let least = null;
	for ( let index = start; index < start + count; index ++ ) {

		const ed = EDICT_NUM( index );
		if ( ed.free && ( ed.freetime < 2 || sv.time - ed.freetime > 0.5 ) ) {

			ED_ClearEdict( ed );
			ed.alloctime = sv.time;
			return ed;

		}
		if ( least === null || ( ed.alloctime ?? 0 ) < ( least.alloctime ?? 0 ) ) least = ed;

	}

	ED_Free( least );
	ED_ClearEdict( least );
	least.alloctime = sv.time;
	return least;

}
