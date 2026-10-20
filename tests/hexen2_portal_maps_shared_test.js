// Portal content coverage through the shared host: every supplied Portal map mounts with the installed Portal program
// and the Succubus. Complements the Keep/Tibet route tests; it does not claim the finale/credits sequence.
import { existsSync } from 'node:fs';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const PORTAL = '/Users/bri/quaked/Hexen 2/portals';
const MAPS = [ 'keep1', 'keep2', 'keep3', 'keep4', 'keep5', 'tibet1', 'tibet2', 'tibet3', 'tibet4', 'tibet5',
	'tibet6', 'tibet7', 'tibet8', 'tibet9', 'tibet10', 'thomas', 'monsters' ];

Deno.test( 'every supplied Portal map mounts with the Succubus on the shared host', () => {

	if ( ! existsSync( PORTAL + '/pak3.pak' ) || ! hexen2DataPresent( 'hexen2-portals' ) ) {
		console.log( 'SKIP: the supplied Portal/base installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2-portals' ), 'the Portal installation mounts over the base data' );
	for ( const map of MAPS ) {

		let session = null, error = null;
		try {

			session = spawnHexen2Map( map, 5 );

		} catch ( e ) { error = e; }
		check( error === null, `${map}: ` + ( error ? error.message + ' [' + PR_LastRunError() + ']' : 'no error' ) );
		const { sv, player } = session;
		same( sv.active, true, map + ' is live' );
		same( sv.name, map, map + ' is the loaded map' );
		same( player.v.playerclass, 5, map + ' keeps the Succubus' );
		same( PR_GetString( player.v.model ), 'models/succubus.mdl', map + ' uses the Succubus model' );
		same( PR_GetString( player.v.classname ), 'player', map + ' placed a player' );
		check( player.v.health > 0, map + ' player is alive: ' + player.v.health );
		check( sv.num_edicts > 50, map + ' spawned level entities: ' + sv.num_edicts );

	}

} );
