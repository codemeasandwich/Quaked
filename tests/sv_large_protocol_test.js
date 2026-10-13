// The large-map protocol when a map needs it (docs/add-ons-2026-10-13.md, step 4): passing a protocol-15 limit while
// a map loads asks SV_SpawnServer to load it again with the large-map protocol; at any other time, or already on the
// large-map protocol, the caller reports the limit as before.
import { SV_LargeProtocolNeeded } from '../src/engine/server/sv_large_protocol.js';
import { ss_loading, ss_active } from '../src/engine/server/server.js';
import { PROTOCOL_VERSION, PROTOCOL_LARGE } from '../src/engine/common/protocol.js';
const check = ( v, m ) => { if ( ! v ) throw Error( m ); };

Deno.test( 'a protocol-15 limit passed while loading asks for the large-map protocol; otherwise nothing', () => {

	let thrown = null;
	try { SV_LargeProtocolNeeded( { state: ss_loading, protocol: PROTOCOL_VERSION }, 'more than 256 models' ); } catch ( e ) { thrown = e; }
	check( thrown?.largeProtocol === 'more than 256 models' && /large-map protocol/.test( thrown.message ), 'loading on protocol 15: asked' );
	SV_LargeProtocolNeeded( { state: ss_active, protocol: PROTOCOL_VERSION }, 'during play' ); // returns: the caller errors as before
	SV_LargeProtocolNeeded( { state: ss_loading, protocol: PROTOCOL_LARGE }, 'already large' ); // returns: a real limit

} );
