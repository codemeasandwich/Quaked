// Portal of Praevus campaign route through the shared host: Tibet's real changelevel triggers carry the Succubus from
// tibet1 to each later map via the native changelevel2/hub path. Content route coverage, not the finale/intermission.
import { existsSync } from 'node:fs';
import { Cbuf_Execute } from '../src/engine/common/cmd.js';
import { G_INT_SET, PR_GetString, PR_SetTempString, pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { callProfileBuiltin } from './helpers/builtin_table.mjs';
import { edictFieldString, hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const PORTAL = '/Users/bri/quaked/Hexen 2/portals';

Deno.test( 'the Portal Tibet campaign mounts its chain with the Succubus on the shared host', () => {

	if ( ! existsSync( PORTAL + '/pak3.pak' ) || ! hexen2DataPresent( 'hexen2-portals' ) ) {
		console.log( 'SKIP: the supplied Portal/base installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2-portals' ), 'the Portal installation mounts over the base data' );
	const session = spawnHexen2Map( 'tibet1', 5 );
	let player = session.player;
	player.v.health = 88;
	for ( const target of [ 'tibet3', 'tibet4', 'tibet5', 'tibet8', 'tibet9', 'tibet10' ] ) {

		const trigger = session.sv.edicts.find( ent => ent && ! ent.free
			&& PR_GetString( ent.v.classname ) === 'trigger_changelevel' && edictFieldString( ent, 'map' ) === target );
		check( trigger, 'the current Tibet map has a trigger to ' + target );
		const spot = edictFieldString( trigger, 'target' );
		pr_global_struct.serverflags = 0;
		G_INT_SET( OFS_PARM0, PR_SetTempString( target ) );
		G_INT_SET( OFS_PARM1, PR_SetTempString( spot ) );
		check( callProfileBuiltin( 70, {} ), 'changelevel is implemented' );
		Cbuf_Execute();
		same( session.sv.name, target, target + ' mounted' );
		player = session.svs.clients[ 0 ].edict;
		same( player.v.playerclass, 5, 'the Succubus survives into ' + target );
		same( player.v.health, 88, 'her health survives into ' + target );
		check( Number.isFinite( player.v.origin[ 0 ] ), target + ' placed her at a finite origin' );
		check( session.sv.num_edicts > 100, target + ' spawned entities: ' + session.sv.num_edicts );
		same( PR_LastRunError(), '', 'no program error in ' + target );

	}

} );
