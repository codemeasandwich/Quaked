/**
 * @module engine/server/sv_large_protocol
 *
 * Choosing the large-map protocol when a map needs it (docs/add-ons-2026-10-13.md, step 4). Protocol 15 names at most
 * 256 models and sounds, 600 entities and an 8192-byte signon; this port's large-map protocol (PROTOCOL_LARGE, card
 * [34f]) has room for far more. A map that passes a protocol-15 limit while it loads (Arcane Dimensions' maps do) is
 * loaded again from the start with the large-map protocol (SV_SpawnServer), instead of ending the game: nothing has
 * gone to a client yet, and the spawn parameters a level change carries are untouched. The choice then stays for the
 * session (sv_protocol), so later maps start with it.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 */
import { PROTOCOL_LARGE } from '../common/protocol.js';
import { ss_loading } from './server.js';

/**
 * Called where a protocol-15 limit is passed: while a map loads on protocol 15, throws the error SV_SpawnServer answers
 * by loading the map again with the large-map protocol; otherwise returns, and the caller reports the limit as before.
 *
 * @param {{ state: number, protocol: number }} server the server (`sv`)
 * @param {string} reason which limit, for the console
 * @throws {Error} with `largeProtocol` set to the reason
 */
export function SV_LargeProtocolNeeded( server, reason ) {

	if ( server.state !== ss_loading || server.protocol === PROTOCOL_LARGE ) return;
	const error = new Error( 'needs the large-map protocol: ' + reason );
	error.largeProtocol = reason;
	throw error;

}
