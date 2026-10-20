/**
 * A Hexen II client connects through the shared server's real SV_ConnectClient (the path the packaged app takes after
 * `map demo1`): native Hexen II has no SetNewParms, so the connect must not call it and the spawn parms start empty
 * (uhexen2 engine/hexen2/sv_main.c SV_ConnectClient comments the call out).
 */
import '../src/newer/install.js';
import { loadHexen2Data } from './helpers/hexen2_live.mjs';
import { SV_SpawnServer, SV_ConnectClient } from '../src/engine/server/sv_main.js';
import { sv, svs, client_t } from '../src/engine/server/server.js';
import { SZ_Alloc } from '../src/engine/common/common.js';
import { cls, ca_dedicated } from '../src/engine/client/client.js';
import { pr_global_struct } from '../src/engine/progs/progs.js';

function check( condition, message ) { if ( ! condition ) throw new Error( message ); }

Deno.test( 'a Hexen II client connects through SV_ConnectClient without SetNewParms', () => {

	if ( ! loadHexen2Data() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	svs.maxclients = svs.maxclientslimit = 1;
	svs.clients = [ new client_t() ];
	SZ_Alloc( svs.clients[ 0 ].message, 32768 );
	cls.state = ca_dedicated;
	SV_SpawnServer( 'demo1' );
	check( sv.active, 'demo1 spawned on the shared server' );
	check( ! pr_global_struct.SetNewParms, 'Hexen II progs define no SetNewParms (the native engine never calls it)' );
	const client = svs.clients[ 0 ];
	client.netconnection = { address: 'LOCAL', canSend: () => true };
	client.spawn_parms.fill( 7 );
	let error = null;
	try { SV_ConnectClient( 0 ); } catch ( e ) { error = e; }
	check( error === null, 'the connect completed: ' + ( error && error.message ) );
	check( client.spawn_parms.every( value => value === 0 ), 'a new Hexen II client starts with empty spawn parms' );

} );
