// Portal of Praevus selection and the Keep route through the shared host: the Succubus is Portal-only (native class 5),
// Keep spawns its entities with the Portal program and RAPO art, and each real changelevel trigger carries her class and
// state through the native changelevel2/hub path. The class table itself is covered by hexen2_profile_test.js.
import { existsSync } from 'node:fs';
import { Hexen2_ClassesFor, Hexen2_SelectClass } from '../src/engine/common/hexen2_profile.js';
import { Cbuf_Execute } from '../src/engine/common/cmd.js';
import { PR_SetTempString, pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { G_INT_SET, PR_GetString } from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { callProfileBuiltin } from './helpers/builtin_table.mjs';
import { edictFieldString, hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const PORTAL = '/Users/bri/quaked/Hexen 2/portals';

Deno.test( 'Portal offers the Succubus and the Keep route carries her through changelevel2', () => {

	same( Hexen2_ClassesFor( 'hexen2' ).length, 4, 'base classes' );
	same( Hexen2_ClassesFor( 'hexen2-demo' ).length, 4, 'demo classes' );
	check( Hexen2_ClassesFor( 'hexen2-portals' ).some( entry => entry.id === 'succubus' ), 'Portal offers the Succubus' );
	same( Hexen2_SelectClass( 'hexen2-portals', 'succubus' ).number, 5, 'the native Succubus number' );
	same( Hexen2_SelectClass( 'hexen2', 'succubus' ).ok, false, 'the base game refuses the Succubus' );
	same( Hexen2_SelectClass( 'hexen2-demo', 'succubus' ).ok, false, 'the demo refuses the Succubus' );

	if ( ! existsSync( PORTAL + '/pak3.pak' ) || ! hexen2DataPresent( 'hexen2-portals' ) ) {
		console.log( 'SKIP: the supplied Portal/base installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2-portals' ), 'the Portal installation mounts over the base data' );
	const session = spawnHexen2Map( 'keep1', 5 );
	let player = session.player;
	same( session.sv.name, 'keep1', 'the mounted map is Keep' );
	same( player.v.playerclass, 5, 'the native playerclass is the Succubus' );
	same( PR_GetString( player.v.model ), 'models/succubus.mdl', 'the Succubus model' );
	check( session.sv.num_edicts > 200, 'Keep spawned its entities: ' + session.sv.num_edicts );
	player.v.health = 88;

	for ( const target of [ 'keep2', 'keep3', 'keep4', 'keep5' ] ) {

		const trigger = session.sv.edicts.find( ent => ent && ! ent.free
			&& PR_GetString( ent.v.classname ) === 'trigger_changelevel' && edictFieldString( ent, 'map' ) === target );
		check( trigger, 'the current Portal map has a trigger to ' + target );
		const spot = edictFieldString( trigger, 'target' );
		pr_global_struct.serverflags = 0; // a hub transition
		G_INT_SET( OFS_PARM0, PR_SetTempString( target ) );
		G_INT_SET( OFS_PARM1, PR_SetTempString( spot ) );
		check( callProfileBuiltin( 70, {} ), 'changelevel is implemented' );
		Cbuf_Execute();
		same( session.sv.name, target, target + ' mounted' );
		same( session.sv.nextmap?.level, 'maps/' + target + '.bsp', 'the hand-off names ' + target );
		player = session.svs.clients[ 0 ].edict;
		same( player.v.playerclass, 5, 'the Succubus survives into ' + target );
		same( PR_GetString( player.v.model ), 'models/succubus.mdl', 'her model survives into ' + target );
		same( player.v.health, 88, 'her health survives into ' + target );
		check( Number.isFinite( player.v.origin[ 0 ] ) && Number.isFinite( player.v.origin[ 2 ] ), target + ' placed her at a finite origin' );
		check( session.sv.num_edicts > 100, target + ' spawned entities: ' + session.sv.num_edicts );
		same( PR_LastRunError(), '', 'no program error in ' + target );

	}

} );
