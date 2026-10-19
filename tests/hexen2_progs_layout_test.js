// The supplied Hexen II programs must load through the one existing interpreter with their own layouts (base header
// CRC 38488, Portal 26905) and definitions validated, not through Quake's 5927-only check. plan section 4 and T03.
// Written before the work as the RED gate: it failed with "progdefs.h is out of date" for both programs and is kept
// unchanged as the GREEN gate; it must not be weakened or deleted.
import { existsSync, readFileSync } from './helpers/resource_fs.mjs';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2';

async function load( path ) {

	const bytes = readFileSync( path );
	const { PR_LoadProgs } = await import( '../src/engine/progs/pr_edict.js' );
	// the catalogue id is chosen before the program loads: Portal's gamecode runs under the Portal profile
	GameProfile_Set( path.includes( '/portals/' ) ? 'hexen2-portals' : 'hexen2' );
	PR_LoadProgs( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	return ( await import( '../src/engine/progs/progs.js' ) ).progs;

}

Deno.test( 'RED: the supplied Hexen II base progs.dat loads with its own layout and definitions', async () => {

	if ( ! existsSync( BASE + '/data1/progs.dat' ) ) {

		console.log( 'SKIP: the supplied Hexen II installation is not present at ' + BASE );
		return;

	}
	const progs = await load( BASE + '/data1/progs.dat' );
	same( progs.version, 6, 'program version' );
	same( progs.crc, 38488, 'the base program header CRC' );
	same( progs.entityfields, 392, 'the base entity field count' );
	check( progs.numfunctions === 1629, 'the base function count is read from the supplied program' );

} );

Deno.test( 'RED: the supplied Hexen II Portal progs.dat loads with its own layout and definitions', async () => {

	if ( ! existsSync( BASE + '/portals/progs.dat' ) ) {

		console.log( 'SKIP: the supplied Hexen II Portal installation is not present at ' + BASE );
		return;

	}
	const progs = await load( BASE + '/portals/progs.dat' );
	same( progs.crc, 26905, 'the Portal program header CRC' );
	same( progs.entityfields, 392, 'the Portal entity field count' );
	check( progs.numfunctions === 2041, 'the Portal function count is read from the supplied program' );

} );
