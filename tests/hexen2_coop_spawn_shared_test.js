// Two clients on one shared Hexen II server: both slots become native players through SV_ConnectClient and the
// `prespawn`/`spawn`/`begin` commands (the network signon path), keep distinct classes/models, settle on the floor and
// occupy different co-op start spots. This is the server-side co-op foundation; peer transport is covered elsewhere.
import { existsSync } from 'node:fs';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { hexen2DataPresent, loadHexen2Data, spawnHexen2Clients } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'two client slots become distinct native players on one shared server', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const session = spawnHexen2Clients( 'demo1', [ 1, 2 ], { coop: true } );
	same( session.svs.clients.length, 2, 'two client slots' );
	const [ playerA, playerB ] = session.players;
	check( playerA && playerB, 'both slots have players' );
	same( PR_GetString( playerA.v.classname ), 'player', 'the first slot is a player' );
	same( PR_GetString( playerB.v.classname ), 'player', 'the second slot is a player' );
	same( playerA.index, 1, 'the first player edict' );
	same( playerB.index, 2, 'the second player edict' );
	same( playerA.v.playerclass, 1, 'the Paladin class' );
	same( playerB.v.playerclass, 2, 'the Crusader class' );
	same( PR_GetString( playerA.v.model ), 'models/paladin.mdl', 'the Paladin model' );
	same( PR_GetString( playerB.v.model ), 'models/crusader.mdl', 'the Crusader model' );
	check( playerA.v.health >= 70 && playerA.v.health <= 95, 'the Paladin has native health: ' + playerA.v.health );
	check( playerB.v.health >= 65 && playerB.v.health <= 95, 'the Crusader has native health: ' + playerB.v.health );
	check( playerA.v.max_mana > 0 && playerB.v.max_mana > 0, 'both classes have a native maximum mana' );
	same( session.svs.clients[ 0 ].playerclass, 1, 'slot 0 keeps the Paladin class' );
	same( session.svs.clients[ 1 ].playerclass, 2, 'slot 1 keeps the Crusader class' );
	same( session.svs.clients[ 0 ].active, true, 'slot 0 is connected' );
	same( session.svs.clients[ 1 ].active, true, 'slot 1 is connected' );
	same( session.svs.clients[ 0 ].spawned, true, 'slot 0 finished signon' );
	same( session.svs.clients[ 1 ].spawned, true, 'slot 1 finished signon' );
	check( Math.abs( playerA.v.origin[ 2 ] - playerB.v.origin[ 2 ] ) < 1, 'both feet are on the same floor' );
	check( Math.abs( playerA.v.origin[ 0 ] - playerB.v.origin[ 0 ] ) >= 1 || Math.abs( playerA.v.origin[ 1 ] - playerB.v.origin[ 1 ] ) >= 1,
		'the players are at different spawn points: ' + playerA.v.origin + ' vs ' + playerB.v.origin );
	check( Math.abs( playerA.v.origin[ 0 ] ) > 1 || Math.abs( playerA.v.origin[ 1 ] ) > 1, 'the players stand at the map spawn' );
	same( PR_LastRunError(), '', 'no program error during either spawn' );

} );
