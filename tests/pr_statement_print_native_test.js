// A QuakeC statement printed for an error or a trace names its operands, as WinQuake's does (card [44m], item 10):
// PR_PrintStatement uses pr_edict.js's PR_GlobalString and PR_GlobalStringNoContents, not pr_exec.js's own
// placeholders, which printed bare offsets. On the shareware progs, loaded by a real map spawn, a store statement
// from the game's own code prints its operand as offset(name).
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { svs, client_t, coop, deathmatch, teamplay, skill } from '../src/engine/server/server.js';
import { SV_Init, SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { PR_PrintStatement } from '../src/engine/progs/pr_exec.js';
import { pr_statements } from '../src/engine/progs/progs.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cmd_Init } from '../src/engine/common/cmd.js';
import { cls, ca_dedicated } from '../src/engine/client/client.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
Cbuf_Init(); Cmd_Init(); Mod_Init(); PR_InitBuiltins(); Host_InitCommands(); SV_Init();
for ( const c of [ deathmatch, coop, teamplay, skill ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
svs.maxclientslimit = 4; svs.clients = Array.from( { length: 4 }, () => new client_t() ); svs.maxclients = 1;
cls.state = ca_dedicated;

Deno.test( 'PR_PrintStatement prints a store\'s operands with their global names', () => {
	SV_SpawnServer( 'e1m1' );
	const OP_STORE_F = 31; // pr_comp.h
	const store = [ ...pr_statements ].find( s => s && s.op === OP_STORE_F && s.a > 28 );
	check( store, 'the progs have a float store' );
	const seen = [], log = console.log;
	console.log = ( ...a ) => { seen.push( a.join( ' ' ) ); };
	try { PR_PrintStatement( store ); } finally { console.log = log; }
	const line = seen.join( '' );
	check( line.includes( 'STORE_F' ), 'the opcode: ' + line );
	check( new RegExp( '\\b' + store.a + '\\([^)]+\\)' ).test( line ), 'the first operand as offset(name): ' + line );
	check( new RegExp( '\\b' + store.b + '\\(' ).test( line ), 'the result as offset(name): ' + line );
} );
