// The gamecode intermission hand-off: the page reads running/nextmap/nextstartspot through one pure helper and only
// advances when a non-empty next map exists.
import { Hexen2_IntermissionStatus } from '../src/engine/client/hexen2_intermission.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const strings = new Map( [ [ 101, 'village2' ], [ 202, 'village2' ], [ 303, '' ] ] );
const getString = offset => strings.get( offset ) ?? '';

Deno.test( 'intermission reads the gamecode next map and start spot', () => {

	let status = Hexen2_IntermissionStatus( {}, getString );
	same( status.active, false, 'inactive without a run' );
	same( status.nextMap, '', 'no next map' );
	status = Hexen2_IntermissionStatus( { intermission_running: 1, nextmap: 101, nextstartspot: 202 }, getString );
	same( status.active, true, 'running' );
	same( status.nextMap, 'village2', 'next map' );
	same( status.nextSpot, 'village2', 'next start spot' );
	status = Hexen2_IntermissionStatus( { intermission_running: 2, nextmap: 303, nextstartspot: 0 }, getString );
	same( status.active, true, 'second intermission frame' );
	same( status.nextMap, '', 'an empty next map is not advanced' );
	same( Hexen2_IntermissionStatus( null, getString ).active, false, 'missing globals are inactive' );

} );
