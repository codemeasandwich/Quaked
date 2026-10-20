// Leaving and rejoining one co-op client on the shared server: SV_DropClient runs the gamecode ClientDisconnect, the
// other player keeps playing, and a fresh connect/signon reuses the slot as a new native player of the same class.
// Network signalling and the packaged UI are covered elsewhere.
import { existsSync } from 'node:fs';
import { MOVETYPE_WALK, SOLID_SLIDEBOX, set_host_client } from '../src/engine/server/server.js';
import { SV_DropToFloor, SV_LinkEdict } from '../src/engine/server/world.js';
import { SV_DropClient } from '../src/engine/server/sv_main.js';
import { SV_SetFrametime, SV_Physics_Client, SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { SV_ClientThink, SV_User_SetCallbacks } from '../src/engine/server/sv_user.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import { connectHexen2Client, findEntity, hexen2DataPresent, loadHexen2Data, spawnHexen2Clients } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a co-op client leaves and rejoins without disturbing the other on the shared server', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const session = spawnHexen2Clients( 'demo1', [ 1, 2 ], { coop: true } );
	const clientA = session.svs.clients[ 0 ], clientB = session.svs.clients[ 1 ];
	const playerA = clientA.edict, playerB = clientB.edict;
	const bIndex = playerB.index;
	const aHealth = playerA.v.health;
	const bHealth = playerB.v.health, bStartZ = playerB.v.origin[ 2 ];
	check( bHealth >= 65 && bHealth <= 95, 'the Crusader spawned with native health: ' + bHealth );

	// A stands in the open start room so the one-frame walk measures the movement path, not a co-op start against a wall.
	const start = findEntity( session.sv, 'info_player_start' );
	check( start !== undefined, 'the level has a player start' );
	playerA.v.origin = [ start.v.origin[ 0 ], start.v.origin[ 1 ], start.v.origin[ 2 ] ];
	SV_LinkEdict( playerA, false );
	SV_DropToFloor( playerA );

	set_host_client( clientB );
	SV_DropClient( false );
	same( clientB.active, false, 'the dropped client is inactive' );
	same( clientB.spawned, false, 'the dropped client is not spawned' );
	same( clientB.name, '', 'the dropped client name is cleared' );
	check( ! clientB.edict || clientB.edict.index === bIndex, 'the dropped slot still names its old edict number' );
	check( clientA.active && clientA.spawned, 'the other client stays connected' );
	same( playerA.v.health, aHealth, 'the other player was not hurt by the leave' );

	// A still walks while B is gone.
	SV_SetFrametime( 0.1 );
	set_host_client( clientA );
	SV_User_SetCallbacks( { host_client: clientA, get_key_dest: () => 0, V_CalcRoll: () => 0 } );
	SV_SetPlayer( playerA );
	playerA.v.angles = [ 0, 0, 0 ];
	playerA.v.v_angle = [ 0, 0, 0 ];
	playerA.v.velocity = [ 0, 0, 0 ];
	playerA.v.movetype = MOVETYPE_WALK;
	playerA.v.solid = SOLID_SLIDEBOX;
	clientA.cmd.forwardmove = 320;
	clientA.cmd.sidemove = 0;
	clientA.cmd.upmove = 0;
	clientA.cmd.viewangles = [ 0, 0, 0 ];
	const beforeA = playerA.v.origin[ 0 ];
	let error = null;
	try { SV_ClientThink(); SV_Physics_Client( playerA, 1 ); } catch ( e ) { error = e; }
	check( error === null, 'A moved after B left: ' + ( error ? error.message + ' [' + PR_LastRunError() + ']' : '' ) );
	check( playerA.v.origin[ 0 ] - beforeA > 20, 'A kept its movement: ' + ( playerA.v.origin[ 0 ] - beforeA ) );
	same( playerA.v.health, aHealth, 'A was not hurt by B leaving' );

	// B rejoins through the same connect/signon path with a fresh player of the same class.
	const newB = connectHexen2Client( session, 1, 2 );
	check( newB && ! newB.free, 'the rejoined player is live' );
	same( PR_GetString( newB.v.classname ), 'player', 'the rejoined player entity' );
	same( newB.v.playerclass, 2, 'the rejoined class' );
	same( PR_GetString( newB.v.model ), 'models/crusader.mdl', 'the rejoined model' );
	check( newB.v.health >= 65 && newB.v.health <= 95, 'the rejoined native health: ' + newB.v.health );
	same( clientB.active, true, 'the rejoined client is connected' );
	same( clientB.spawned, true, 'the rejoined client finished signon' );
	same( clientB.playerclass, 2, 'the rejoined slot keeps the Crusader class' );
	check( Math.abs( newB.v.origin[ 2 ] - bStartZ ) < 1, 'the rejoined feet are on the same floor as its first spawn: ' + newB.v.origin[ 2 ] + ' vs ' + bStartZ );
	check( newB.index === bIndex, 'the rejoin uses the same reserved client edict slot: ' + newB.index );
	check( clientA.active && clientA.spawned && playerA.v.health === aHealth, 'A is still playing after the rejoin' );

} );
