// A base-game campaign route through the shared host: demo1's real trigger names demo2, then village1 and village2, each
// transition issued by the native changelevel builtin and run by the host's changelevel2/hub path. Returning to the
// visited demo1 restores the saved level and player. This replaces the parallel host's mount/save-bundle route.
import { existsSync } from 'node:fs';
import { Cbuf_Execute } from '../src/engine/common/cmd.js';
import { G_INT_SET, PR_GetString, PR_SetTempString, pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { Hexen2Hub_LastClientRestore } from '../src/engine/server/hexen2_hub.js';
import { Host_Hexen2ChangeLevel2 } from '../src/engine/server/host_cmd.js';
import { callProfileBuiltin } from './helpers/builtin_table.mjs';
import { edictFieldString, hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'demo1 -> demo2 -> village1 -> village2 -> demo1 works through changelevel2 and the hub restore', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const session = spawnHexen2Map( 'demo1', 1 );
	let player = session.player;
	player.v.health = 77;
	const firstTrigger = session.sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'trigger_changelevel' );
	check( firstTrigger, 'demo1 has a changelevel trigger' );
	same( edictFieldString( firstTrigger, 'map' ), 'demo2', 'the demo1 trigger names demo2' );
	same( edictFieldString( firstTrigger, 'target' ), 'demo1', 'the demo2 start spot is demo1' );

	for ( const target of [ 'demo2', 'village1', 'village2' ] ) {

		const trigger = session.sv.edicts.find( ent => ent && ! ent.free
			&& PR_GetString( ent.v.classname ) === 'trigger_changelevel' && edictFieldString( ent, 'map' ) === target );
		check( trigger, 'the current map has a trigger to ' + target );
		const spot = edictFieldString( trigger, 'target' );
		pr_global_struct.serverflags = 0; // a hub transition (changelevel2)
		G_INT_SET( OFS_PARM0, PR_SetTempString( target ) );
		G_INT_SET( OFS_PARM1, PR_SetTempString( spot ) );
		check( callProfileBuiltin( 70, {} ), 'changelevel is implemented' );
		Cbuf_Execute();
		same( session.sv.name, target, target + ' mounted' );
		same( session.sv.nextmap?.spot, spot, 'the hand-off keeps ' + target + '\'s start spot' );
		player = session.svs.clients[ 0 ].edict;
		same( PR_GetString( player.v.classname ), 'player', target + ' has a player' );
		same( player.v.playerclass, 1, 'the Paladin class carries into ' + target );
		same( player.v.health, 77, 'the player health carries into ' + target );
		check( Number.isFinite( player.v.origin[ 0 ] ) && Number.isFinite( player.v.origin[ 2 ] ), target + ' placed the player at a finite origin' );
		check( session.sv.num_edicts > 100, target + ' spawned its level entities: ' + session.sv.num_edicts );
		same( PR_LastRunError(), '', 'no program error in ' + target );

	}

	const back = Host_Hexen2ChangeLevel2( 'demo1' );
	check( back.ok, back.reason );
	same( back.restored, true, 'the visited demo1 level is restored' );
	same( Hexen2Hub_LastClientRestore()?.restored, 1, 'ClientReEnter re-entered the player' );
	same( session.sv.name, 'demo1', 'the campaign returned to demo1' );
	player = session.svs.clients[ 0 ].edict;
	same( player.v.playerclass, 1, 'the Paladin is still the player class' );
	same( player.v.health, 77, 'the demo1 player state was restored' );
	same( PR_GetString( player.v.model ), 'models/paladin.mdl', 'the restored player keeps the Paladin model' );

} );
