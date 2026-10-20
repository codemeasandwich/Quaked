// Base-game endgame content through the shared host: the final Eidolon map mounts with the installed gamecode, its
// world and player, its storm/door machinery and the boss's control triggers. This is loadable-finale content, not the
// credits/intermission run (the native intermission table is covered by hexen2_hub_native_test.js).
import { existsSync } from 'node:fs';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the base endgame Eidolon map mounts with its player and level entities on the shared host', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	let session = null, error = null;
	try { session = spawnHexen2Map( 'eidolon', 1 ); } catch ( e ) { error = e; }
	check( error === null, 'Eidolon mounted: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	const { sv, player } = session;
	same( sv.active, true, 'the server is live' );
	same( sv.name, 'eidolon', 'the endgame map is Eidolon' );
	same( PR_GetString( sv.edicts[ 0 ].v.classname ), 'worldspawn', 'the endgame world spawned' );
	same( PR_GetString( player.v.classname ), 'player', 'the endgame player spawned' );
	same( player.v.playerclass, 1, 'the endgame player is the Paladin' );
	check( player.v.health > 0, 'the endgame player is alive' );
	check( sv.num_edicts > 150, 'Eidolon spawned its entities: ' + sv.num_edicts );

	const classes = new Set();
	for ( const ent of sv.edicts ) if ( ent && ! ent.free ) classes.add( PR_GetString( ent.v.classname ) );
	for ( const expected of [ 'door', 'door_rotating', 'trigger_control', 'trigger_quake', 'weather_lightning_start', 'art_HealthBoost', 'info_player_start' ] )
		check( classes.has( expected ), 'the endgame level spawned a ' + expected );
	same( PR_LastRunError(), '', 'no program error during the spawn' );

} );
