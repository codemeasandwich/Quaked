// Hexen II changelevel(level, spot) (#70): the native two-string builtin writes `changelevel <level> <spot>` when the
// server flags start a new unit/episode and `changelevel2` (the hub transition) otherwise. The command buffer owns the
// reload; a second call before the command runs is ignored, as PF_changelevel.
import { existsSync, readFileSync } from 'node:fs';
import { G_INT_SET, PR_SetTempString, PR_SetSV, PR_SetSVS, pr_global_struct } from '../src/engine/progs/progs.js';
import { PR_LoadProgs } from '../src/engine/progs/pr_edict.js';
import { sv as serverSv } from '../src/engine/server/server.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { callProfileBuiltin } from './helpers/builtin_table.mjs';
import { Cbuf_Init, Cmd_AddCommand, Cmd_Args, Cbuf_Execute } from '../src/engine/common/cmd.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
GameProfile_Set( 'hexen2' ); // the selected game before its gamecode loads

Deno.test( 'changelevel writes the native hub command with the start spot, once per level', () => {

	const HEXEN = '/Users/bri/quaked/Hexen 2/data1/progs.dat';
	if ( ! existsSync( HEXEN ) ) { console.log( 'SKIP: the supplied Hexen II program is not present' ); return; }
	const bytes = readFileSync( HEXEN );
	PR_LoadProgs( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	const sv = serverSv, state = { clients: [], active: true, changelevel_issued: false };
	PR_SetSV( sv ); PR_SetSVS( state );
	Cbuf_Init();
	const commands = [];
	Cmd_AddCommand( 'changelevel', () => commands.push( 'changelevel ' + Cmd_Args() ) );
	Cmd_AddCommand( 'changelevel2', () => commands.push( 'changelevel2 ' + Cmd_Args() ) );

	state.changelevel_issued = false;
	pr_global_struct.serverflags = 0; // a hub transition
	G_INT_SET( OFS_PARM0, PR_SetTempString( 'demo2' ) );
	G_INT_SET( OFS_PARM1, PR_SetTempString( 'start2' ) );
	check( callProfileBuiltin( 70, {} ), 'the builtin is implemented' );
	same( state.changelevel_issued, true, 'the one-shot guard is set' );
	Cbuf_Execute();
	same( commands[ 0 ], 'changelevel2 demo2 start2', 'the native hub command and start spot' );

	G_INT_SET( OFS_PARM0, PR_SetTempString( 'demo3' ) );
	G_INT_SET( OFS_PARM1, PR_SetTempString( 'start3' ) );
	callProfileBuiltin( 70, {} );
	Cbuf_Execute();
	same( commands.length, 1, 'a second call before the command runs is ignored' );

	state.changelevel_issued = false;
	pr_global_struct.serverflags = 16; // SFL_NEW_UNIT
	G_INT_SET( OFS_PARM0, PR_SetTempString( 'ruins' ) );
	G_INT_SET( OFS_PARM1, PR_SetTempString( 'exit1' ) );
	callProfileBuiltin( 70, {} );
	Cbuf_Execute();
	same( commands[ 1 ], 'changelevel ruins exit1', 'a new unit uses changelevel' );

	state.changelevel_issued = false;
	pr_global_struct.serverflags = 32; // SFL_NEW_EPISODE
	G_INT_SET( OFS_PARM0, PR_SetTempString( 'e1m1' ) );
	G_INT_SET( OFS_PARM1, PR_SetTempString( 'start' ) );
	callProfileBuiltin( 70, {} );
	Cbuf_Execute();
	same( commands[ 2 ], 'changelevel e1m1 start', 'a new episode uses changelevel' );

} );
