// Native hub level snapshots on the shared host: the existing Quake save text (globals, light styles and every
// non-temporary edict) captures a live Hexen level and restores player/world state into a freshly spawned server. This
// is the low-level Hexen2Hub_CaptureLevel/RestoreLevel contract; the whole-hub save slot and host path are covered by
// hexen2_hub_native_test.js, so only the uncovered capture/restore assertions live here.
import { existsSync } from 'node:fs';
import { EDICT_NUM, PR_GetString } from '../src/engine/progs/progs.js';
import { ED_NewString, GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { Hexen2_ED_Alloc_Temp } from '../src/engine/progs/hexen2_temp_edicts.js';
import { Hexen2_SaveEffects } from '../src/engine/progs/hexen2_server_cmds.js';
import { Hexen2Hub_CaptureLevel, Hexen2Hub_RestoreLevel, Hexen2Hub_ValidateLevel } from '../src/engine/server/hexen2_hub.js';
import { findEntity, hexen2DataPresent, loadHexen2Data, spawnHexen2Map } from './helpers/hexen2_live.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

function field( ent, name ) {

	const found = GetEdictFieldValue( ent, name );
	check( found !== null, name + ' exists' );
	return found;

}

Deno.test( 'a captured hub level restores its entities, light styles and player state on a fresh server', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! hexen2DataPresent( 'hexen2' ) ) {
		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;
	}
	check( loadHexen2Data( 'hexen2' ), 'the base installation mounts' );
	const session = spawnHexen2Map( 'demo1', 1 );
	const door = findEntity( session.sv, 'door' );
	check( door !== undefined, 'the level has a door' );
	const state = field( door, 'state' );
	state.accessor.setFloat( state.ofs, 7 );
	door.v.health = 333;
	session.player.v.health = 42;
	session.sv.lightstyles[ 3 ] = 'm';

	// A reserved temporary edict is deliberately not archived.
	const temp = Hexen2_ED_Alloc_Temp();
	temp.v.classname = ED_NewString( 'temp_marker' );
	temp.v.health = 123;
	const tempIndex = temp.index;

	const record = Hexen2Hub_CaptureLevel( session.sv, session.svs, Hexen2_SaveEffects() );
	const validation = Hexen2Hub_ValidateLevel( record );
	check( validation.ok, 'the snapshot validates: ' + validation.reason );
	same( record.level, 'demo1', 'the snapshot names its level' );
	same( record.num_edicts, session.sv.num_edicts, 'the snapshot records the edict table width' );
	same( record.lightstyles.length, 64, 'every light style was captured' );
	check( record.edicts.length > 100, 'the snapshot captured the level edicts: ' + record.edicts.length );
	check( record.edicts.every( entry => entry.num !== tempIndex ), 'the reserved temporary edict is not archived' );
	same( record.effects?.count, 0, 'no effects were live at capture' );

	// Mutate the live world, then restore the snapshot into a freshly spawned level.
	state.accessor.setFloat( state.ofs, 0 );
	door.v.health = 1;
	session.player.v.health = 3;
	session.sv.lightstyles[ 3 ] = 'a';
	const fresh = spawnHexen2Map( 'demo1', 1 );
	const restored = Hexen2Hub_RestoreLevel( fresh.sv, fresh.svs, record );
	check( restored.ok, restored.reason );
	const restoredDoor = findEntity( fresh.sv, 'door' );
	check( restoredDoor !== undefined, 'the restored level has its door' );
	const restoredState = field( restoredDoor, 'state' );
	same( restoredState.accessor.getFloat( restoredState.ofs ), 7, 'the door state was restored' );
	same( restoredDoor.v.health, 333, 'the door health was restored' );
	same( fresh.sv.lightstyles[ 3 ], 'm', 'the light style was restored' );
	same( EDICT_NUM( 1 ).v.health, 42, 'the captured player edict was restored' );
	same( EDICT_NUM( 1 ).v.playerclass, 1, 'the player class was restored' );
	same( PR_GetString( EDICT_NUM( 1 ).v.classname ), 'player', 'the player edict stays a player' );
	check( PR_GetString( EDICT_NUM( tempIndex ).v.classname ) !== 'temp_marker' && EDICT_NUM( tempIndex ).v.health !== 123,
		'the temporary edict is not restored' );

	// A damaged save naming an edict past this server's table is refused before anything changes.
	const edictsBefore = fresh.sv.num_edicts;
	const damaged = { ...record, edicts: [ ...record.edicts, { num: fresh.sv.max_edicts + 100, text: '{ "classname" "info_null" }' } ] };
	const refused = Hexen2Hub_RestoreLevel( fresh.sv, fresh.svs, damaged );
	check( ! refused.ok, 'a save naming edict ' + ( fresh.sv.max_edicts + 100 ) + ' is refused' );
	same( fresh.sv.num_edicts, edictsBefore, 'the refused save left the edict count alone' );
	check( ! Hexen2Hub_RestoreLevel( fresh.sv, fresh.svs, { ...record, num_edicts: fresh.sv.max_edicts + 1 } ).ok, 'an edict count past the table is refused' );

} );
