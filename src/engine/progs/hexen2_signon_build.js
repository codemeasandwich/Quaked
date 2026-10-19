/**
 * @module engine/progs/hexen2_signon_build
 *
 * The server-side signon builder for a mounted Hexen level: `svc_serverinfo` from the server's model/sound precache
 * lists, one `svc_spawnbaseline` per entity that has a precached model, and the client's `svc_setview`. It turns the
 * live server state into the private signon stream a joining client consumes; no gameplay rule is evaluated here.
 *
 * Types: plain values and functions; no exported classes.
 * State: reads the server state it is given; no module state.
 * Errors: none raised; missing content is reported as `{ ok: false, reason }`.
 */

import { PR_GetString } from './progs.js';
import { Hexen2_WriteServerinfo, Hexen2_WriteSetView } from '../common/hexen2_signon.js';
import { Hexen2_WriteBaseline } from '../common/hexen2_entitywire.js';
import { HEXEN2_LIVE_PROTOCOL } from '../common/hexen2_protocol.js';

const MAX_SIGNON_BASELINES = 600;

function precacheNames( list, limit ) {

	const names = [];
	for ( let i = 0; i < limit; i ++ ) {

		const name = list?.[ i ];
		names.push( typeof name === 'string' ? name : '' );

	}
	while ( names.length > 0 && names[ 0 ] === '' ) names.shift(); // slot 0 is the native dummy
	while ( names.length > 0 && names[ names.length - 1 ] === '' ) names.pop();
	return names;

}

/**
 * Builds serverinfo for a mounted server.
 *
 * @param {object} sv the server state (its `model_precache`, `sound_precache` and `worldmodel`)
 * @param {{ protocol?: number, maxClients?: number, gameType?: number }} [options]
 * @returns {{ ok: true, info: object, bytes: Uint8Array } | { ok: false, reason: string }} the serverinfo message
 */
export function Hexen2_BuildServerinfo( sv, options = {} ) {

	if ( !sv?.worldmodel ) return { ok: false, reason: 'no mounted level' };
	const models = precacheNames( sv.model_precache, 512 );
	const sounds = precacheNames( sv.sound_precache, 512 );
	const name = String( sv.worldmodel.name ?? '' );
	const levelName = name.replace( /^maps\//, '' ).replace( /\.bsp$/i, '' );
	const written = Hexen2_WriteServerinfo( { protocol: options.protocol ?? HEXEN2_LIVE_PROTOCOL,
		maxClients: options.maxClients ?? 1, gameType: options.gameType ?? 0, levelName, models, sounds } );
	if ( !written.ok ) return written;
	return { ok: true, info: { levelName, models, sounds }, bytes: written.bytes };

}

/**
 * Builds one baseline per entity with a precached model.
 *
 * @param {object} sv the server state (its `edicts`, `num_edicts` and `model_precache`)
 * @returns {{ ok: true, messages: ReadonlyArray<Uint8Array>, count: number } | { ok: false, reason: string }} the
 *   baseline messages in entity order
 */
export function Hexen2_BuildBaselines( sv ) {

	if ( !sv?.edicts || !sv.model_precache ) return { ok: false, reason: 'no mounted level' };
	const indexOf = new Map();
	for ( let i = 1; i < sv.model_precache.length; i ++ ) {

		const name = sv.model_precache[ i ];
		if ( typeof name === 'string' && name !== '' && !indexOf.has( name ) ) indexOf.set( name, i );

	}
	const messages = [];
	for ( let i = 1; i < sv.num_edicts && messages.length < MAX_SIGNON_BASELINES; i ++ ) {

		const ent = sv.edicts[ i ];
		if ( ! ent || ent.free || ! ent.v.model ) continue;
		const modelName = PR_GetString( ent.v.model );
		const modelIndex = indexOf.get( modelName );
		if ( modelIndex === undefined ) continue;
		const written = Hexen2_WriteBaseline( { entity: i, modelIndex, frame: ent.v.frame | 0, colormap: ent.v.colormap | 0,
			skin: ent.v.skin | 0, scale: ent.v.scale | 0, drawflags: ent.v.drawflags | 0, abslight: ent.v.abslight | 0,
			origin: ent.v.origin, angles: ent.v.angles } );
		if ( !written.ok ) return written;
		messages.push( written.bytes );

	}
	return { ok: true, messages, count: messages.length };

}

/**
 * Builds the client's setview message.
 *
 * @param {number} playerIndex the client's player edict number
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the message
 */
export function Hexen2_BuildSetView( playerIndex ) { return Hexen2_WriteSetView( playerIndex ); }
