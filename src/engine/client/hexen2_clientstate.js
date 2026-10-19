/**
 * @module engine/client/hexen2_clientstate
 *
 * The joining client's state built from the private signon and datagrams: serverinfo (protocol, level, precache
 * lists), entity baselines, the view entity, the player's stats and the live entity table. It applies messages by
 * opcode and refuses an unknown or malformed one instead of continuing desynchronised. Rendering, prediction and game
 * rules are outside this module.
 *
 * Types: no exported classes; `Hexen2_ClientState()` returns a plain state object.
 * State: per-client state object; no module state.
 * Errors: none raised; application failures are `{ ok: false, reason }`.
 */

import { HEXEN2_SERVER_MESSAGES } from '../common/hexen2_protocol.js';
import { Hexen2_ReadServerinfo, Hexen2_ReadSignonNum, Hexen2_ReadSetView, Hexen2_ReadUpdateClass } from '../common/hexen2_signon.js';
import { Hexen2_ReadBaseline, Hexen2_ReadEntityUpdate, U } from '../common/hexen2_entitywire.js';
import { Hexen2_DecodeClientdata, Hexen2_DecodeUpdateInv } from '../common/hexen2_clientdata.js';
import { Hexen2_ReadStartEffect, Hexen2_ReadEndEffect } from '../common/hexen2_effectwire.js';

/**
 * A fresh client state.
 *
 * @returns {object} the state: `protocol`, `levelName`, `models`, `sounds`, `baselines` (Map), `entities` (Map),
 *   `viewEntity`, `signonStage`, `stats`, `clientdata`
 */
export function Hexen2_ClientState() {

	return { protocol: 0, maxClients: 0, gameType: 0, levelName: '', models: [], sounds: [], baselines: new Map(),
		entities: new Map(), effects: new Map(), viewEntity: 0, signonStage: 0, playerClass: 0, stats: {}, clientdata: null };

}

function applyEntityUpdate( state, bytes ) {

	const read = Hexen2_ReadEntityUpdate( bytes, { allowTrailing: true } );
	if ( ! read.ok ) return read;
	const update = read.update;
	const entity = state.entities.get( update.entity ) ?? { entity: update.entity, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] };
	Object.assign( entity, update );
	state.entities.set( update.entity, entity );
	return { ok: true, kind: 'entity_update', update, consumed: read.consumed };

}

/**
 * Applies one signon/live message to a client state.
 *
 * @param {object} state a state from `Hexen2_ClientState`
 * @param {ArrayLike<number>} bytes the message, opcode first (or a fast update command byte)
 * @param {{ protocols?: ReadonlyArray<number> }} [options] accepted protocol numbers for serverinfo
 * @returns {{ ok: true, kind: string } | { ok: false, reason: string }} what was applied, or why it was refused
 */
export function Hexen2_ApplyClientMessage( state, bytes, options = {} ) {

	if ( !bytes || bytes.length === 0 ) return { ok: false, reason: 'an empty client message' };
	const opcode = bytes[ 0 ];
	if ( ( opcode & 0x80 ) !== 0 ) return applyEntityUpdate( state, bytes );
	if ( opcode === HEXEN2_SERVER_MESSAGES.serverinfo ) {

		const read = Hexen2_ReadServerinfo( bytes, { allowTrailing: true, protocols: options.protocols } );
		if ( ! read.ok ) return read;
		Object.assign( state, read.info, { serverinfoConsumed: read.consumed } );

	}
	else if ( opcode === HEXEN2_SERVER_MESSAGES.spawnbaseline || opcode === HEXEN2_SERVER_MESSAGES.spawnstatic ) {

		const read = Hexen2_ReadBaseline( bytes, { allowTrailing: true } );
		if ( ! read.ok ) return read;
		if ( read.kind === 'spawnbaseline' ) state.baselines.set( read.baseline.entity, read.baseline );

	}
	else if ( opcode === HEXEN2_SERVER_MESSAGES.signonnum ) {

		const read = Hexen2_ReadSignonNum( bytes );
		if ( ! read.ok ) return read;
		state.signonStage = read.number;

	}
	else if ( opcode === HEXEN2_SERVER_MESSAGES.setview ) {

		const read = Hexen2_ReadSetView( bytes );
		if ( ! read.ok ) return read;
		state.viewEntity = read.entity;

	}
	else if ( opcode === HEXEN2_SERVER_MESSAGES.updateclass ) {

		const read = Hexen2_ReadUpdateClass( bytes );
		if ( ! read.ok ) return read;
		state.playerClass = read.update.playerClass;

	}
	else if ( opcode === HEXEN2_SERVER_MESSAGES.clientdata ) {

		const read = Hexen2_DecodeClientdata( bytes.subarray( 1 ), { allowTrailing: true } );
		if ( ! read.ok ) return read;
		state.clientdata = read.clientdata;
		if ( read.clientdata.viewheight !== undefined ) state.viewHeight = read.clientdata.viewheight;
		if ( read.clientdata.onGround !== undefined ) state.onGround = read.clientdata.onGround;

	}
	else if ( opcode === HEXEN2_SERVER_MESSAGES.update_inv ) {

		const read = Hexen2_DecodeUpdateInv( bytes.subarray( 1 ), { allowTrailing: true } );
		if ( ! read.ok ) return read;
		Object.assign( state.stats, read.stats );

	}
	else if ( opcode === HEXEN2_SERVER_MESSAGES.start_effect ) {

		const read = Hexen2_ReadStartEffect( bytes, { allowTrailing: true } );
		if ( ! read.ok ) return read;
		state.effects.set( read.index, { type: read.type, params: read.params } );

	}
	else if ( opcode === HEXEN2_SERVER_MESSAGES.end_effect ) {

		const read = Hexen2_ReadEndEffect( bytes );
		if ( ! read.ok ) return read;
		state.effects.delete( read.index );

	}
	else return { ok: false, reason: `unknown client message opcode ${opcode}` };
	return { ok: true, kind: 'applied' };

}

export { U };
