// Real shipped START + native QuakeC + collision/movement dispatch. The entry
// trigger is the corridor's floor message brush, hundreds of units before the
// stock skill-setting and teleport brushes. No browser/game loop is started.
import { readFileSync } from 'node:fs';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/vid.js';
import { Mod_Init } from '../src/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/progs/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { ED_NewString } from '../src/engine/progs/pr_edict.js';
import { sv, svs, client_t } from '../src/engine/server/server.js';
import { SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { SV_RunTriggerTouch, SV_LinkEdict, SV_Move, MOVE_NOMONSTERS } from '../src/engine/server/world.js';
import { SV_PushEntity, sv_gravity } from '../src/engine/server/sv_phys.js';
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/gl_post.js';
import { skill } from '../src/engine/server/host.js';
import { r_flashlight } from '../src/r_flashlight.js';
import * as run from '../src/r_flashlightrun.js';
import { SZ_Alloc } from '../src/engine/common/common.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} !== ${b}` );
const text = index => progs.PR_GetString( index );
const pack = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pack.buffer.slice( pack.byteOffset, pack.byteOffset + pack.byteLength ) ) );
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); Cbuf_Init();
for ( const variable of [ r_hdr, skill, sv_gravity, r_flashlight ] ) if ( ! Cvar_FindVar( variable.name ) ) Cvar_RegisterVariable( variable );

function spawn() {

	Cvar_SetValue( 'r_hdr', 1 ); Cvar_SetValue( 'skill', 1 ); svs.maxclients = 1; svs.clients = [ new client_t() ]; SZ_Alloc( svs.clients[ 0 ].message, 8192 ); sv.active = false; SV_SpawnServer( 'start' );
	const player = svs.clients[ 0 ].edict; progs.pr_global_struct.self = progs.EDICT_TO_PROG( player );
	PR_ExecuteProgram( progs.pr_global_struct.SetNewParms ); PR_ExecuteProgram( progs.pr_global_struct.ClientConnect ); PR_ExecuteProgram( progs.pr_global_struct.PutClientInServer );
	check( player.index === 1 && text( player.v.classname ) === 'player' && player.v.health > 0, 'real local living player initialized by shipped QC' );
	return player;

}
function entrance( difficulty ) { return sv.edicts.find( edict => ! edict.free && text( edict.v.classname ) === 'trigger_multiple' && text( edict.v.message ) === `This hall selects ${difficulty} skill` ); }
function place( player, point ) {

	const trace = SV_Move( point, player.v.mins, player.v.maxs, point, MOVE_NOMONSTERS, player ); check( ! trace.startsolid && ! trace.allsolid, 'fixture player hull fits native BSP at ' + point );
	player.v.origin = point; player.v.velocity = [ 0, 0, 0 ]; player.v.angles = [ 0, 90, 0 ]; player.v.v_angle = [ 0, 90, 0 ]; SV_LinkEdict( player, false );

}
function overlaps( player, trigger ) { return [ 0, 1, 2 ].every( i => player.v.absmax[ i ] >= trigger.v.absmin[ i ] && player.v.absmin[ i ] <= trigger.v.absmax[ i ] ); }

Deno.test( 'actual Easy and Normal floor-corridor entry activates light by native movement before skill selection or teleport', () => {

	const player = spawn(), rows = [];
	for ( const [ label, value, x ] of [ [ 'EASY', 0, 232 ], [ 'NORMAL', 1, 544 ] ] ) {

		const hall = entrance( label ), late = sv.edicts.find( e => ! e.free && text( e.v.classname ) === 'trigger_setskill' && text( e.v.message ) === String( value ) );
		check( hall?.v.touch && late?.v.touch, 'actual entrance message and late skill brushes are present for ' + label );
		check( late.v.absmin[ 1 ] - hall.v.absmin[ 1 ] > 500, 'entrance is materially earlier than previous skill hook' );
		run.R_FlashlightNewRun( 'start', 1, true ); Cvar_SetValue( 'skill', 1 ); place( player, [ x, 792, 8 ] );
		same( r_flashlight.value, 0, 'hub approach begins dark' ); check( ! overlaps( player, hall ), 'starting hull outside entry brush' );
		let entered = false;
		for ( let step = 0; step < 12; step ++ ) {

			const previous = Array.from( player.v.origin ); sv.time += .1; const trace = SV_PushEntity( player, [ 0, 4, 0 ] );
			check( ! trace.startsolid && ! trace.allsolid && trace.fraction === 1, 'real movement has a clear collision trace' );
			check( Math.abs( player.v.origin[ 0 ] - previous[ 0 ] ) < .001 && Math.abs( player.v.origin[ 1 ] - previous[ 1 ] - 4 ) < .001, 'no teleport or position rewrite during entry' );
			check( ! overlaps( player, late ), 'late skill trigger not touched' );
			for ( const teleport of sv.edicts.filter( e => ! e.free && text( e.v.classname ) === 'trigger_teleport' ) ) check( ! overlaps( player, teleport ), 'no teleport trigger overlap' );
			if ( r_flashlight.value !== 0 ) { entered = true; check( overlaps( player, hall ), 'activation occurs at actual native corridor contact' ); break; }
		}
		check( entered, label + ' must illuminate at floor-corridor entry, not at the distant teleporter' ); same( skill.value, 1, 'visual default does not prematurely change native game difficulty' ); same( run.R_FlashlightRunStatus().selectedSkill, value, 'entry choice tracked for one-time default' );
		rows.push( { label, actualEntryPosition: Array.from( player.v.origin ), entryBounds: [ Array.from( hall.v.absmin ), Array.from( hall.v.absmax ) ], lateSkillBounds: [ Array.from( late.v.absmin ), Array.from( late.v.absmax ) ], flashlight: r_flashlight.value, nativeSkillStill: skill.value } );
	}
	console.log( 'FLASHLIGHT_REAL_CORRIDOR_ENTRY ' + JSON.stringify( rows ) );

} );

Deno.test( 'manual off at corridor entry survives repeated native floor touches and the later native skill brush', () => {

	const player = spawn();
	for ( const [ label, value, x ] of [ [ 'EASY', 0, 232 ], [ 'NORMAL', 1, 544 ] ] ) {

		run.R_FlashlightNewRun( 'start', 1, true ); place( player, [ x, 812, 8 ] ); SV_PushEntity( player, [ 0, 8, 0 ] ); same( r_flashlight.value, 1, label + ' real entrance enabled light' );
		Cvar_SetValue( 'r_flashlight', 0 ); run.R_FlashlightRunManualChange( true, false, true );
		for ( let i = 0; i < 5; i ++ ) { sv.time += .1; SV_PushEntity( player, [ 0, 4, 0 ] ); same( r_flashlight.value, 0, 'repeated native floor trigger cannot override manual off' ); }
		// A second, independently collision-checked movement segment reaches the
		// real end-of-corridor skill brush, still short of its teleport neighbor.
		const late = sv.edicts.find( e => ! e.free && text( e.v.classname ) === 'trigger_setskill' && text( e.v.message ) === String( value ) );
		place( player, [ x, late.v.absmin[ 1 ] - player.v.maxs[ 1 ] - 4, 48 ] ); const before = Array.from( player.v.origin ); SV_PushEntity( player, [ 0, 6, 0 ] );
		check( overlaps( player, late ), 'real late brush touched through movement' ); same( skill.value, value, 'native QC still selects actual game skill at its original brush' ); same( r_flashlight.value, 0, 'late skill hook cannot undo the earlier manual off' );
		check( Math.abs( player.v.origin[ 1 ] - before[ 1 ] - 6 ) < .001, 'late test stops before teleport' );
	}

} );

Deno.test( 'corridor hook rejects nonlocal/dead players, multiplayer, wrong maps/classes/messages and Classic without suppressing QC execution', () => {

	const player = spawn(), hall = entrance( 'NORMAL' ); check( hall, 'native Normal entrance exists' );
	const saved = { classname: hall.v.classname, message: hall.v.message, health: player.v.health, map: sv.name };
	const remote = new progs.edict_t( 2, player._fieldBuffer.byteLength / 4 ); remote.v.classname = player.v.classname; remote.v.health = 100;
	const cases = [
		{ label: 'nonlocal entity', setup() {}, entity: remote },
		{ label: 'dead local player', setup() { player.v.health = 0; } },
		{ label: 'multiplayer', setup() { svs.maxclients = 2; } },
		{ label: 'non-START map', setup() { sv.name = 'e1m1'; } },
		{ label: 'other trigger class', setup() { hall.v.classname = ED_NewString( 'trigger_once' ); } },
		{ label: 'unrelated text', setup() { hall.v.message = ED_NewString( 'Walk into the Slipgate to start playing Quake!' ); } },
		{ label: 'Classic', setup() { Cvar_SetValue( 'r_hdr', 0 ); } }
	];
	try {

		for ( const trial of cases ) {

			hall.v.classname = saved.classname; hall.v.message = saved.message; player.v.health = saved.health; sv.name = saved.map; svs.maxclients = 1; Cvar_SetValue( 'r_hdr', 1 ); run.R_FlashlightNewRun( 'start', 1, true ); trial.setup();
			let executed = 0; const previousSelf = progs.pr_global_struct.self, previousOther = progs.pr_global_struct.other;
			SV_RunTriggerTouch( trial.entity || player, hall, fn => { same( fn, hall.v.touch, 'native touch function preserved for ' + trial.label ); executed ++; } );
			same( executed, 1, 'hook never replaces native QC touch dispatch' ); same( r_flashlight.value, 0, trial.label + ' cannot choose local light' ); same( run.R_FlashlightRunStatus().selectedSkill, null, trial.label + ' does not consume choice' ); same( progs.pr_global_struct.self, previousSelf, 'QC self restored' ); same( progs.pr_global_struct.other, previousOther, 'QC other restored' );

		}

	} finally { hall.v.classname = saved.classname; hall.v.message = saved.message; player.v.health = saved.health; sv.name = saved.map; svs.maxclients = 1; Cvar_SetValue( 'r_hdr', 1 ); run.R_FlashlightRunEnd(); }

} );
