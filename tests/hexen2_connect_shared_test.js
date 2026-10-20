// Regression for the shared connection path on Hexen II: the installed Hexen programs have no SetNewParms global
// (uhexen2 sv_main.c leaves the call commented out), so SV_ConnectClient must accept a Hexen client without running it.
// Before the shared-host fix it called an undefined global and threw during the first real client connection.
import { existsSync } from 'node:fs';
import { SV_ConnectClient } from '../src/engine/server/sv_main.js';
import { hexen2DataPresent, loadHexen2Data, createHexen2Session } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'SV_ConnectClient accepts a Hexen client without a SetNewParms global', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	const session = createHexen2Session( 'demo1', 1, { connect: false } );
	const client = session.svs.clients[ 0 ];
	client.netconnection = { address: 'regression-client', connecttime: 0, disconnected: false, driver: 0, driverdata: null };
	let error = null;
	try { SV_ConnectClient( 0 ); } catch ( e ) { error = e; }
	check( error === null, 'the connection completed: ' + ( error ? error.message : '' ) );
	same( client.active, true, 'the client slot is active' );
	same( client.spawned, false, 'the client is not spawned until the signon commands run' );
	same( client.edict.index, 1, 'the slot owns the reserved client edict' );
	same( Array.from( client.spawn_parms ).join( ',' ), new Array( 16 ).fill( 0 ).join( ',' ), 'the fresh Hexen spawn parms stay zeroed' );
	check( client.message.cursize > 0, 'the serverinfo was written to the client' );

} );
