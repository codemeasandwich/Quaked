/**
 * @module engine/progs/hexen2_session
 *
 * One call to start a local Hexen II session: plan the selected catalogue entry and class, mount the level through
 * the engine loaders, then build the same signon messages a private server would send, feed them to a client state
 * (loopback), and return the client state, HUD and native status-bar operations for the host. This is the single
 * entry point a local shell/shelf can call; it does not draw or play audio.
 *
 * Types: plain values and functions; no exported classes.
 * State: writes the engine server/client state it is given.
 * Errors: load/session failures are `{ ok: false, reason }`.
 */

import { PR_GetString } from './progs.js';
import { sv as serverSv } from '../server/server.js';
import { Hexen2_MountLevel } from './hexen2_mount.js';
import { Hexen2_BuildServerinfo, Hexen2_BuildBaselines, Hexen2_BuildSetView } from './hexen2_signon_build.js';
import { Hexen2_WriteSignonNum, Hexen2_WriteUpdateClass } from '../common/hexen2_signon.js';
import { Hexen2_ClientState, Hexen2_ApplyClientMessage } from '../client/hexen2_clientstate.js';
import { Hexen2_EncodeClientdata, Hexen2_EncodeUpdateInv, Hexen2_AllStatMask } from '../common/hexen2_clientdata.js';
import { Hexen2_WriteEntityUpdate } from '../common/hexen2_entitywire.js';
import { HEXEN2_SERVER_MESSAGES } from '../common/hexen2_protocol.js';
import { Hexen2_HudFromClientState } from '../client/hexen2_clienthud.js';
import { Hexen2_StatusBarOps } from '../client/hexen2_statusbar.js';

/**
 * Opens a local session for a playable catalogue entry.
 *
 * @param {object} options the `Hexen2_MountLevel` options (`entry`, `classId`, `client`, `loadMap`, `readFile`, `sv`,
 *   `svs`, optional `gamecodeMode`, `rules`, `level`, `installCallbacks`)
 * @returns {{ ok: true, plan: object, map: object, player: object, state: object, hud: object,
 *   statusBarOps: ReadonlyArray<object> } | { ok: false, reason: string }} the session bundle
 */
export function Hexen2_OpenLocalSession( options ) {

	const mounted = Hexen2_MountLevel( options );
	if ( !mounted.ok ) return mounted;
	const sv = options.sv ?? serverSv;
	const clientSlot = options.svs?.clients?.indexOf( options.client ) ?? 0;
	const state = Hexen2_ClientState();

	const info = Hexen2_BuildServerinfo( sv, { maxClients: options.svs?.maxclients ?? 1 } );
	if ( !info.ok ) return info;
	if ( !Hexen2_ApplyClientMessage( state, info.bytes ).ok ) return { ok: false, reason: 'the local client rejected serverinfo' };
	const baselines = Hexen2_BuildBaselines( sv );
	if ( !baselines.ok ) return baselines;
	for ( const message of baselines.messages )
		if ( !Hexen2_ApplyClientMessage( state, message ).ok ) return { ok: false, reason: 'the local client rejected a baseline' };
	const klass = Hexen2_WriteUpdateClass( { client: Math.max( 0, clientSlot ), playerClass: mounted.plan.classNumber } );
	if ( !klass.ok ) return klass;
	if ( !Hexen2_ApplyClientMessage( state, klass.bytes ).ok ) return { ok: false, reason: 'the local client rejected the class' };
	const signon = Hexen2_WriteSignonNum( 3 );
	if ( !Hexen2_ApplyClientMessage( state, signon.bytes ).ok ) return { ok: false, reason: 'the local client rejected signonnum' };
	const setview = Hexen2_BuildSetView( mounted.player.index );
	if ( !setview.ok ) return setview;
	if ( !Hexen2_ApplyClientMessage( state, setview.bytes ).ok ) return { ok: false, reason: 'the local client rejected setview' };
	const clientdata = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.clientdata, ...Hexen2_EncodeClientdata( mounted.player ) ] );
	if ( !Hexen2_ApplyClientMessage( state, clientdata ).ok ) return { ok: false, reason: 'the local client rejected clientdata' };
	const stats = Uint8Array.from( [ HEXEN2_SERVER_MESSAGES.update_inv,
		...Hexen2_EncodeUpdateInv( mounted.player, Hexen2_AllStatMask(), offset => PR_GetString( offset ) ) ] );
	if ( !Hexen2_ApplyClientMessage( state, stats ).ok ) return { ok: false, reason: 'the local client rejected the stats' };
	const origin = mounted.player.v.origin, angles = mounted.player.v.angles;
	const update = Hexen2_WriteEntityUpdate( { entity: mounted.player.index, origin, angles } );
	if ( !update.ok ) return update;
	if ( !Hexen2_ApplyClientMessage( state, update.bytes ).ok ) return { ok: false, reason: 'the local client rejected the player entity' };

	const hud = Hexen2_HudFromClientState( state );
	return { ok: true, plan: mounted.plan, map: mounted.map, player: mounted.player, state, hud,
		statusBarOps: Hexen2_StatusBarOps( hud ) };

}
