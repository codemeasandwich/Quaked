// Hexen II start spots through the shared host: a triggered changelevel passes a targetname (demo1's starts are
// `demo2`/`demo3`); SV_SpawnServer puts it in the native `startspot` global and PutClientInServer places the player at
// that named info_player_start, not at the map's first start.
import { existsSync } from 'node:fs';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { edictFieldString, hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m ) => check( Math.abs( a - b ) <= 1, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a changelevel start spot places the player at its targetname on the shared host', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const plain = spawnHexen2Map( 'demo1', 1 );
	const defaultOrigin = [ plain.player.v.origin[ 0 ], plain.player.v.origin[ 1 ] ];
	const named = plain.sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start'
		&& edictFieldString( ent, 'targetname' ) === 'demo2' );
	check( named, 'demo1 has the demo2 start spot' );
	check( Math.abs( named.v.origin[ 0 ] - defaultOrigin[ 0 ] ) > 1 || Math.abs( named.v.origin[ 1 ] - defaultOrigin[ 1 ] ) > 1,
		'the demo2 start is a different spot from the default' );

	const spaced = spawnHexen2Map( 'demo1', 1, 'demo2' );
	near( spaced.player.v.origin[ 0 ], - 1944, 'the demo2 start x' );
	near( spaced.player.v.origin[ 1 ], 2448, 'the demo2 start y' );
	check( spaced.player.v.origin[ 2 ] > - 560 && spaced.player.v.origin[ 2 ] <= - 510, 'the player dropped onto the demo2 floor: ' + spaced.player.v.origin[ 2 ] );
	same( spaced.sv.startspot, 'demo2', 'the server kept the native startspot' );
	same( PR_GetString( spaced.player.v.classname ), 'player', 'the start spot placed a player' );
	same( spaced.player.v.playerclass, 1, 'the start spot kept the Paladin' );

} );
