// The gamecode ending hand-off on the shared host: with the native nextmap/nextstartspot globals set (the values
// rider_eol writes), GotoNextMap calls the changelevel builtin, records the next map and the host command loads it.
// The intermission picture/text selection and the hub save format are covered by hexen2_hub_native_test.js.
import { existsSync } from 'node:fs';
import { Cbuf_Execute } from '../src/engine/common/cmd.js';
import { EDICT_TO_PROG, PR_SetTempString, pr_functions, pr_global_struct, pr_globals } from '../src/engine/progs/progs.js';
import { ED_FindFunction, ED_FindGlobal } from '../src/engine/progs/pr_edict.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const PORTAL = '/Users/bri/quaked/Hexen 2/portals';

Deno.test( 'GotoNextMap records and runs the ending hand-off on the shared host', () => {

	if ( ! existsSync( PORTAL + '/pak3.pak' ) || ! hexen2DataPresent( 'hexen2-portals' ) ) {
		console.log( 'SKIP: the supplied Portal/base installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2-portals' ), 'the Portal installation mounts over the base data' );
	const session = spawnHexen2Map( 'keep1', 5 );
	const nextMap = ED_FindGlobal( 'nextmap' ), nextSpot = ED_FindGlobal( 'nextstartspot' );
	check( nextMap && nextSpot, 'the ending globals exist' );
	pr_globals.setInt32( nextMap.ofs, PR_SetTempString( 'tibet10' ) );
	pr_globals.setInt32( nextSpot.ofs, PR_SetTempString( 'keep1' ) );
	const goto = ED_FindFunction( 'GotoNextMap' );
	check( goto, 'GotoNextMap exists' );
	pr_global_struct.self = EDICT_TO_PROG( session.player );
	PR_ExecuteProgram( pr_functions.indexOf( goto ) );
	same( session.sv.nextmap?.level, 'maps/tibet10.bsp', 'the hand-off map' );
	same( session.sv.nextmap?.spot, 'keep1', 'the hand-off start spot' );

	Cbuf_Execute();
	same( session.sv.name, 'tibet10', 'the native changelevel2 command loaded tibet10' );
	same( session.svs.clients[ 0 ].edict.v.playerclass, 5, 'the Succubus carried into the next map' );

} );
