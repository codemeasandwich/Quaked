// Base-game content coverage through the shared host: every supplied map in data1's pak0/pak1 mounts through
// SV_SpawnServer with the installed gamecode and a Paladin, and its level entities spawn without a program error.
// This is content coverage, not every trigger/finale path; it replaces the retired parallel host's map loop.
import { existsSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'every supplied base map mounts with its Paladin and level entities on the shared host', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const maps = [ ...new Set( pak.COM_ListFiles( 'maps/' )
		.filter( name => name.endsWith( '.bsp' ) )
		.map( name => name.slice( 5, - 4 ) ) ) ].sort();
	check( maps.length >= 40, 'the supplied packs carry the base campaign maps: ' + maps.length );
	for ( const map of maps ) {

		let session = null, error = null;
		try {

			session = spawnHexen2Map( map, 1 );

		} catch ( e ) { error = e; }
		check( error === null, `${map}: ` + ( error ? error.message + ' [' + PR_LastRunError() + ']' : 'no error' ) );
		const { sv, player } = session;
		same( sv.active, true, map + ' is live' );
		same( sv.name, map, map + ' is the loaded map' );
		same( PR_GetString( player.v.classname ), 'player', map + ' placed a player' );
		same( player.v.playerclass, 1, map + ' kept the Paladin' );
		same( PR_GetString( player.v.model ), 'models/paladin.mdl', map + ' uses the Paladin model' );
		check( player.v.health > 0, map + ' player is alive: ' + player.v.health );
		check( Number.isFinite( player.v.origin[ 0 ] ) && Number.isFinite( player.v.origin[ 2 ] ), map + ' player origin is finite' );
		check( PR_GetString( sv.edicts[ 0 ].v.classname ) === 'worldspawn', map + ' has its world entity' );
		check( sv.num_edicts > 10, map + ' spawned level entities: ' + sv.num_edicts );

	}

} );
