/**
 * @module engine/progs/hexen2_join
 *
 * The late-join snapshot for a private session: serverinfo, the current world baselines, the joining client's class,
 * the signon stage, its view entity, and its player's clientdata/stat snapshot. A joining client consumes these into
 * the same client state as the initial signon; later movement arrives as entity updates. Spawn placement and class
 * validation belong to the normal join path.
 *
 * Types: plain values and functions; no exported classes.
 * State: reads the server state it is given.
 * Errors: invalid indices are `{ ok: false, reason }`.
 */

import { PR_GetString } from './progs.js';
import { Hexen2_BuildServerinfo, Hexen2_BuildBaselines } from './hexen2_signon_build.js';
import { Hexen2_WriteSignonNum, Hexen2_WriteUpdateClass, Hexen2_WriteSetView } from '../common/hexen2_signon.js';
import { Hexen2_EncodeClientdata, Hexen2_EncodeUpdateInv, Hexen2_AllStatMask } from '../common/hexen2_clientdata.js';
import { HEXEN2_SERVER_MESSAGES } from '../common/hexen2_protocol.js';

/**
 * Builds the messages a late-joining client receives.
 *
 * @param {object} sv the server state with the joining player already placed
 * @param {{ playerIndex: number, classNumber: number, clientSlot?: number, maxClients?: number }} options
 * @returns {{ ok: true, messages: ReadonlyArray<Uint8Array>, player: object } | { ok: false, reason: string }} the
 *   snapshot messages in signon order
 */
export function Hexen2_BuildJoinSnapshot( sv, options ) {

	const player = sv?.edicts?.[ options.playerIndex ];
	if ( !player || player.free ) return { ok: false, reason: 'the joining player is missing' };
	if ( PR_GetString( player.v.classname ) !== 'player' ) return { ok: false, reason: 'the joining edict is not a player' };
	if ( !Number.isInteger( options.classNumber ) || options.classNumber < 1 || options.classNumber > 5 )
		return { ok: false, reason: 'invalid player class' };
	const info = Hexen2_BuildServerinfo( sv, { maxClients: options.maxClients ?? ( options.clientSlot ?? 0 ) + 1 } );
	if ( !info.ok ) return info;
	const baselines = Hexen2_BuildBaselines( sv );
	if ( !baselines.ok ) return baselines;
	const klass = Hexen2_WriteUpdateClass( { client: options.clientSlot ?? 0, playerClass: options.classNumber } );
	if ( !klass.ok ) return klass;
	const setview = Hexen2_WriteSetView( options.playerIndex );
	if ( !setview.ok ) return setview;
	const signon = Hexen2_WriteSignonNum( 3 );
	if ( !signon.ok ) return signon;
	const clientdata = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.clientdata, ...Hexen2_EncodeClientdata( player ) ] );
	const stats = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.update_inv,
		...Hexen2_EncodeUpdateInv( player, Hexen2_AllStatMask(), offset => PR_GetString( offset ) ) ] );
	return { ok: true, player, messages: Object.freeze( [ info.bytes, ...baselines.messages, klass.bytes, signon.bytes,
		setview.bytes, clientdata, stats ] ) };

}
