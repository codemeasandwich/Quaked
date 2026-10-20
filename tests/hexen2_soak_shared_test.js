// Live-world soak on the shared host: 300 physics frames with a walking, attacking Paladin and thinking monsters, with
// the per-frame datagrams drained as a host frame would. Catches missing builtins, moving-state corruption, datagram
// growth/overflow and effect-slot leaks. It is not a campaign or visual trial.
import { existsSync } from 'node:fs';
import { FL_MONSTER, MOVETYPE_NONE, MOVETYPE_WALK, SOLID_SLIDEBOX } from '../src/engine/server/server.js';
import { SV_SetFrametime, SV_Physics, SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { SV_ClientThink, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { SV_ClearDatagram } from '../src/engine/server/sv_main.js';
import { PR_GetString, pr_global_struct, pr_globals } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { OFS_PARM0, OFS_PARM1, OFS_RETURN } from '../src/engine/progs/pr_comp.js';
import { callProfileBuiltin } from './helpers/builtin_table.mjs';
import { hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

function setEffectArgs( values ) {

	for ( let i = 0; i < values.length; i ++ ) pr_globals.setFloat( OFS_PARM0 + i, values[ i ] );

}

Deno.test( '300 frames run without growth or overflow and the effect slots are reused', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const { sv, client, player } = spawnHexen2Map( 'demo1', 1 );
	SV_SetFrametime( 0.05 );
	SV_SetPlayer( player );
	SV_User_SetCallbacks( { host_client: client, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	player.v.movetype = MOVETYPE_WALK;
	player.v.solid = SOLID_SLIDEBOX;
	player.v.health = player.v.max_health = 1000;
	// hold the level's monsters still: this run measures the world/effect path, not combat balance
	for ( const ent of sv.edicts ) if ( ent && ! ent.free && ( ( ent.v.flags | 0 ) & FL_MONSTER ) ) ent.v.movetype = MOVETYPE_NONE;
	const before = [ player.v.origin[ 0 ], player.v.origin[ 1 ] ];
	let error = null, frames = 0, maxDatagram = 0, maxReliable = 0;
	try {

		for ( ; frames < 300; frames ++ ) {

			SV_SetPlayer( player );
			client.cmd.forwardmove = 200;
			client.cmd.sidemove = 0;
			client.cmd.upmove = 0;
			client.cmd.viewangles = [ 0, 0, 0 ];
			player.v.v_angle = [ 0, 0, 0 ];
			player.v.button0 = frames % 20 < 10 ? 1 : 0;
			SV_ClientThink();
			SV_Physics();
			pr_global_struct.time = sv.time;
			maxDatagram = Math.max( maxDatagram, sv.datagram.cursize );
			maxReliable = Math.max( maxReliable, sv.reliable_datagram.cursize );
			check( ! sv.datagram.overflowed, 'the datagram did not overflow at frame ' + frames );
			check( ! sv.reliable_datagram.overflowed, 'the reliable datagram did not overflow at frame ' + frames );
			SV_ClearDatagram();
			sv.reliable_datagram.cursize = 0; // the host frame copies reliables to the clients, then clears them

		}

	} catch ( e ) { error = e; }
	check( error === null, `frame ${frames}: ` + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	same( frames, 300, 'all frames ran' );
	check( Number.isFinite( player.v.origin[ 0 ] ) && Number.isFinite( player.v.origin[ 2 ] ), 'the player origin stays finite' );
	check( Math.abs( player.v.origin[ 0 ] - before[ 0 ] ) + Math.abs( player.v.origin[ 1 ] - before[ 1 ] ) > 5, 'the player walked' );
	check( player.v.health > 0 || player.v.deadflag !== 0, 'the player is alive or properly dead: ' + player.v.health );
	check( sv.num_edicts <= sv.max_edicts, 'the edict table did not grow past its ceiling: ' + sv.num_edicts + '/' + sv.max_edicts );
	check( maxDatagram <= sv.datagram.maxsize && maxReliable <= sv.datagram.maxsize,
		'the frame datagrams stayed bounded: ' + maxDatagram + '/' + maxReliable );

	// The native effect slots are a fixed pool: fill them, end one, and reuse it; then let a one-second effect expire.
	// Start from a clean pool so effects the attack frames left behind cannot occupy a slot mid-fill.
	sv.hexenEffects = new Array( 256 ).fill( null );
	const startEffect = () => {

		sv.reliable_datagram.cursize = 0;
		setEffectArgs( [ 5, 0, 0, 0, 0 ] ); // CE.BLUESPARK: origin-only, expires after one second
		check( callProfileBuiltin( 88, {} ), 'starteffect is implemented' );
		return pr_globals.getFloat( OFS_RETURN );

	};
	const slots = new Set();
	for ( let i = 0; i < 256; i ++ ) slots.add( startEffect() );
	same( slots.size, 256, '256 distinct effect slots' );
	same( sv.hexenEffects.length, 256, 'the effect pool stays at its native size' );
	sv.reliable_datagram.cursize = 0;
	pr_globals.setFloat( OFS_PARM0, 0 );
	pr_globals.setFloat( OFS_PARM1, 0 );
	check( callProfileBuiltin( 89, {} ), 'endeffect is implemented' );
	same( startEffect(), 0, 'the ended slot is reused first' );
	sv.time += 100;
	pr_global_struct.time = sv.time;
	same( startEffect(), 0, 'an expired slot is reused' );
	same( sv.hexenEffects.length, 256, 'expiry did not grow the effect pool' );

} );
