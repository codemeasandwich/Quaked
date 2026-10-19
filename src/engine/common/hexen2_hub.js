/**
 * @module engine/common/hexen2_hub
 *
 * Whole-hub world snapshots for the local Hexen II page: the save-file edict/global text that Quake already uses
 * (`ED_Write`/`ED_WriteGlobals`, `ED_ParseEdict`/`ED_ParseGlobals`), captured per visited level. This is the same
 * serialization surface as the Quake save path, not a second world format; the page stores the text with the level's
 * player snapshot so a revisited hub level restores its doors, monsters, items and trigger state.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: capture/restore return `{ ok, reason }` for malformed records; parsing errors propagate from the existing
 *   ED parser (a corrupt save is refused by the caller).
 */

import { COM_Parse } from './common.js';
import { ED_Write, ED_WriteGlobals, ED_ParseGlobals, ED_ParseEdict, ED_Alloc } from '../progs/pr_edict.js';
import { EDICT_NUM } from '../progs/progs.js';
import { SV_LinkEdict } from '../server/world.js';

/** The snapshot schema version. */
export const HEXEN2_WORLD_SCHEMA = 1;

/**
 * Captures the live server's world: light styles, save globals and every edict in the existing ED text form.
 *
 * @param {object} sv the live server state
 * @returns {{ schema: number, level: string, time: number, lightstyles: Array<?string>, lines: string[] }} the snapshot
 */
export function Hexen2_CaptureWorld( sv ) {

	const lines = [];
	ED_WriteGlobals( lines );
	for ( let i = 0; i < sv.num_edicts; i ++ ) ED_Write( lines, EDICT_NUM( i ) );
	return Object.freeze( {
		schema: HEXEN2_WORLD_SCHEMA,
		level: String( sv.name ?? sv.worldmodel?.name ?? '' ),
		time: Number( sv.time ) || 0,
		lightstyles: ( sv.lightstyles ?? [] ).map( value => value ?? null ),
		lines: Object.freeze( lines )
	} );

}

/**
 * Checks a world snapshot's shape.
 *
 * @param {?object} snapshot the candidate
 * @returns {{ ok: true } | { ok: false, reason: string }} the check
 */
export function Hexen2_ValidateWorld( snapshot ) {

	if ( snapshot === null || typeof snapshot !== 'object' ) return { ok: false, reason: 'no world snapshot' };
	if ( snapshot.schema !== HEXEN2_WORLD_SCHEMA ) return { ok: false, reason: `unsupported world schema ${String( snapshot.schema )}` };
	if ( typeof snapshot.level !== 'string' || snapshot.level === '' ) return { ok: false, reason: 'the world has no level' };
	if ( !Array.isArray( snapshot.lines ) || snapshot.lines.length < 2 ) return { ok: false, reason: 'the world has no globals/edicts' };
	if ( !Array.isArray( snapshot.lightstyles ) ) return { ok: false, reason: 'the world has no light styles' };
	if ( !Number.isFinite( snapshot.time ) ) return { ok: false, reason: 'the world time is not finite' };
	return { ok: true };

}

/**
 * Restores a snapshot into a freshly spawned server. Blocks are the save-file brace form: the first is globals, then
 * one per edict. The server's edict array is extended when needed and reduced to the snapshot's count; edicts are
 * relinked into the BSP tree.
 *
 * @param {object} sv the live server state
 * @param {object} snapshot a validated world snapshot
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }} the result
 */
export function Hexen2_RestoreWorld( sv, snapshot ) {

	const valid = Hexen2_ValidateWorld( snapshot );
	if ( !valid.ok ) return valid;
	let remaining = snapshot.lines.join( '\n' ), entnum = - 1;
	while ( remaining.length > 0 ) {

		const start = remaining.indexOf( '{' );
		if ( start < 0 ) break;
		const end = remaining.indexOf( '}', start );
		if ( end < 0 ) return { ok: false, reason: 'a world block has no close' };
		const block = remaining.slice( start, end + 1 );
		remaining = remaining.slice( end + 1 );
		const afterBrace = COM_Parse( block );
		if ( entnum === - 1 ) {

			ED_ParseGlobals( afterBrace );

		} else {

			while ( sv.num_edicts <= entnum ) ED_Alloc();
			const ent = EDICT_NUM( entnum );
			ent.free = false;
			if ( block.replace( /[{}\s]/g, '' ) === '' ) ent.free = true;
			else {

				ED_ParseEdict( afterBrace, ent );
				if ( !ent.free && entnum !== 0 ) SV_LinkEdict( ent, false );

			}

		}
		entnum ++;

	}
	if ( entnum < 1 ) return { ok: false, reason: 'the world has no entities' };
	sv.num_edicts = entnum;
	sv.name = snapshot.level;
	sv.time = snapshot.time;
	sv.lightstyles = snapshot.lightstyles.slice();
	return { ok: true, count: entnum };

}
