// Execute actual bundled QC gates through the native VM/builtin cvar boundary.
// No browser, renderer, mocked Host_Map, or alternate program is used.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { COM_CheckRegistered } from '../src/engine/common/common.js';
import { Cvar_FindVar, Cvar_VariableValue } from '../src/engine/common/cvar.js';
import { Cmd_Init, Cbuf_Init } from '../src/engine/common/cmd.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { PR_LoadProgs, ED_FindFunction, ED_FindGlobal, ED_NewString, GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { sv, svs } from '../src/engine/server/server.js';
const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const load = path => { const b = readFileSync( path ); return pak.COM_LoadPackFile( String( path ), b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) ); };
const global = ( name, value ) => { const d = ED_FindGlobal( name ); check( d, 'native global ' + name ); if ( value !== undefined ) progs.pr_globals_int[ d.ofs ] = value; return progs.pr_globals_int[ d.ofs ]; };
const call = name => { const f = ED_FindFunction( name ); check( f, 'bundled function ' + name ); PR_ExecuteProgram( progs.pr_functions.indexOf( f ) ); };

Deno.test( 'native registration marker retains shareware on missing/corrupt content and enables actual bundled campaign gates when valid', () => {
	Cbuf_Init(); Cmd_Init(); PR_InitBuiltins();
	check( COM_CheckRegistered() === false && Cvar_VariableValue( 'registered' ) === 0, 'missing content defaults to shareware' );
	check( Cvar_FindVar( 'registered' ).archive === false, 'content state is not a saved preference' );
	pak.COM_AddPack( load( new URL( '../games/shareware/pak0.pak', import.meta.url ) ) );
	PR_LoadProgs( pak.COM_LoadFile( 'progs.dat' ) );
	progs.PR_SetSV( sv ); progs.PR_SetSVS( svs );
	svs.maxclients = 1; sv.max_edicts = 600;
	sv.edicts = Array.from( { length: 600 }, ( _, i ) => new progs.edict_t( i, progs.progs.entityfields ) );
	for ( const e of sv.edicts ) e.free = e.index > 2;
	sv.num_edicts = 3; sv.time = 1;
	const player = sv.edicts[ 1 ], gate = sv.edicts[ 2 ];
	player.v.classname = ED_NewString( 'player' );
	const exercise = registered => {
		gate.free = false;
		for ( const name of [ 'attack_finished', 'message' ] ) {
			const field = GetEdictFieldValue( gate, name );
			field.accessor.setInt32( field.ofs, 0 );
		}
		progs.pr_global_struct.self = progs.EDICT_TO_PROG( gate );
		progs.pr_global_struct.other = progs.EDICT_TO_PROG( player );
		progs.pr_global_struct.time = 1;
		call( 'trigger_onlyregistered_touch' );
		check( gate.free === registered, 'actual native trigger only removes gate with validated registered content' );
		global( 'mapname', ED_NewString( 'start' ) );
		progs.pr_global_struct.serverflags = 1; // completed Episode 1; go to Episode 2
		call( 'NextLevel' );
		const next = progs.PR_GetString( global( 'nextmap' ) );
		check( next === ( registered ? 'e2m1' : 'e1m1' ), 'actual NextLevel uses native registered campaign branch: ' + next );
	};
	check( COM_CheckRegistered() === false, 'bundled archive alone stays shareware' ); exercise( false );
	check( process.env.QUAKED_OWNED_PAK, 'Set QUAKED_OWNED_PAK to read-only owned installation' );
	const owned = load( process.env.QUAKED_OWNED_PAK );
	pak.COM_AddPack( owned );
	// Restore bundled priority exactly as normal bootstrap does.
	pak.COM_AddPack( load( new URL( '../games/shareware/pak0.pak', import.meta.url ) ) );
	const marker = pak.COM_FindFile( 'gfx/pop.lmp' ).data, saved = marker[ 0 ];
	try { marker[ 0 ] ^= 1; check( COM_CheckRegistered() === false, 'corrupt native marker stays shareware' ); exercise( false ); }
	finally { marker[ 0 ] = saved; } // only the in-memory buffer, never the archive
	check( COM_CheckRegistered() === true, 'exact native marker enables standard registered cvar' ); exercise( true );
	console.log( 'FULLGAME_REGISTERED_NATIVE_PROOF shareware/corrupt gate retained and NextLevel=e1m1; valid gate removed and NextLevel=e2m1' );
} );
