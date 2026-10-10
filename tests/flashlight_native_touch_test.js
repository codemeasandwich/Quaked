// Bounded native server/QC/collision dispatch. No RAF, network client or browser.
import { readFileSync } from 'node:fs';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/progs/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { sv, svs, client_t } from '../src/engine/server/server.js';
import { SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { SV_RunTriggerTouch, SV_LinkEdict, SV_Move, MOVE_NOMONSTERS } from '../src/engine/server/world.js';
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/gl_post.js';
import { skill } from '../src/engine/server/host.js';
import { sv_gravity } from '../src/engine/server/sv_phys.js';
import { r_flashlight } from '../src/r_flashlight.js';
import * as run from '../src/r_flashlightrun.js';
const check = ( x, label ) => { if ( ! x ) throw new Error( label ); };
const equal = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const pack = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pack.buffer.slice( pack.byteOffset, pack.byteOffset + pack.length ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); Cbuf_Init();
for ( const variable of [ r_hdr, skill, sv_gravity, r_flashlight ] ) if ( ! Cvar_FindVar( variable.name ) ) Cvar_RegisterVariable( variable );
const text = index => progs.PR_GetString( index );
Deno.test( 'real spawned START player and native QC corridor activate flashlight through both public direct touch and actual linked collision dispatch', () => {
	Cvar_SetValue( 'r_hdr', 1 ); Cvar_SetValue( 'skill', 1 ); svs.maxclients = 1; svs.clients = [ new client_t() ]; sv.active = false; SV_SpawnServer( 'start' ); check( sv.active && sv.name === 'start', 'actual native START server spawned' );
	const player = svs.clients[ 0 ].edict; progs.pr_global_struct.self = progs.EDICT_TO_PROG( player ); PR_ExecuteProgram( progs.pr_global_struct.SetNewParms ); PR_ExecuteProgram( progs.pr_global_struct.ClientConnect ); PR_ExecuteProgram( progs.pr_global_struct.PutClientInServer ); equal( text( player.v.classname ), 'player', 'native QC initialized actual player class' );
	const trigger = sv.edicts.find( ed => ! ed.free && text( ed.v.classname ) === 'trigger_setskill' && text( ed.v.message ) === '1' ); check( trigger && trigger.v.touch, 'actual native Normal trigger has native touch function' ); const origin = Array.from( trigger.v.absmin, ( value, k ) => ( value + trigger.v.absmax[ k ] ) / 2 ); player.v.origin = origin; player.v.velocity = [ 0, 0, 0 ];
	const state = () => ( { server: sv.name, playerIndex: player.index, playerClass: text( player.v.classname ), playerFree: player.free, playerSolid: player.v.solid, triggerIndex: trigger.index, triggerClass: text( trigger.v.classname ), message: text( trigger.v.message ), touch: trigger.v.touch, origin: Array.from( player.v.origin ), bounds: [ Array.from( trigger.v.absmin ), Array.from( trigger.v.absmax ) ], linked: !!trigger.area._owner, self: progs.pr_global_struct.self, other: progs.pr_global_struct.other, skill: skill.value, flashlight: r_flashlight.value, run: run.R_FlashlightRunStatus() } );
	run.R_FlashlightNewRun( 'start', 1, true ); console.log( 'NATIVE_CORRIDOR_BEFORE ' + JSON.stringify( state() ) ); SV_RunTriggerTouch( player, trigger ); console.log( 'NATIVE_CORRIDOR_DIRECT ' + JSON.stringify( state() ) ); equal( run.R_FlashlightRunStatus().selectedSkill, 1, 'actual PR_ExecuteProgram touch chooses Normal' ); equal( r_flashlight.value, 1, 'actual native direct touch enables light' );
	run.R_FlashlightNewRun( 'start', 1, true ); const entry = origin.slice(); entry[ 1 ] = trigger.v.absmin[ 1 ] - player.v.maxs[ 1 ] + 2; player.v.origin = entry; const fit = SV_Move( entry, player.v.mins, player.v.maxs, entry, MOVE_NOMONSTERS, player ); check( ! fit.startsolid && ! fit.allsolid, 'corridor-side actual player hull is physically valid' ); SV_LinkEdict( player, true ); console.log( 'NATIVE_CORRIDOR_LINKED ' + JSON.stringify( state() ) ); equal( run.R_FlashlightRunStatus().selectedSkill, 1, 'actual physical linked trigger dispatch chooses Normal' ); equal( r_flashlight.value, 1, 'actual linked native touch enables light' ); check( entry.every( ( value, k ) => Math.abs( value - player.v.origin[ k ] ) < .001 ), 'corridor entry point does not hit neighboring native teleport' );
	for ( const corridor of sv.edicts.filter( ed => ! ed.free && text( ed.v.classname ) === 'trigger_setskill' ) ) { const value = Number( text( corridor.v.message ) ), point = Array.from( corridor.v.absmin, ( v, k ) => ( v + corridor.v.absmax[ k ] ) / 2 ); point[ 1 ] = value === 3 ? corridor.v.absmax[ 1 ] - player.v.mins[ 1 ] - 2 : corridor.v.absmin[ 1 ] - player.v.maxs[ 1 ] + 2; const trace = SV_Move( point, player.v.mins, player.v.maxs, point, MOVE_NOMONSTERS, player ); run.R_FlashlightNewRun( 'start', 1, true ); player.v.origin = point; SV_LinkEdict( player, true ); console.log( 'NATIVE_CORRIDOR_ALL ' + JSON.stringify( { value, point, startsolid: trace.startsolid, allsolid: trace.allsolid, actual: Array.from( player.v.origin ), bounds: [ Array.from( corridor.v.absmin ), Array.from( corridor.v.absmax ) ], run: run.R_FlashlightRunStatus(), flashlight: r_flashlight.value } ) ); check( !trace.startsolid && !trace.allsolid, 'actual candidate hull clear for skill ' + value ); equal( run.R_FlashlightRunStatus().selectedSkill, value, 'actual linked corridor selects skill ' + value ); equal( r_flashlight.value, value < 2 ? 1 : 0, 'actual linked difficulty chooses light ' + value ); }

});
