// The game's rule cvars are registered by one function that both the page's Host_Init and the room server call
// (card [44m], item 21). The room server (server/game_server.js) runs no Host_Init, so skill, coop and the rest were
// never registered there: SV_SpawnServer's Cvar_SetValue( 'skill' ) printed "variable skill not found" and the room
// ignored its skill. Through the public Host_InitRuleCvars and Cvar_SetValue; the room server's own call is read from
// its source, since importing it starts a server.
import { readFileSync } from 'node:fs';
import { Host_InitRuleCvars } from '../src/engine/server/host.js';
import { Cvar_FindVar, Cvar_SetValue, Cvar_VariableValue } from '../src/engine/common/cvar.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'Host_InitRuleCvars registers the rules, so the server can set its skill; the room server calls it', () => {
	const names = [ 'fraglimit', 'timelimit', 'teamplay', 'samelevel', 'noexit', 'skill', 'deathmatch', 'coop', 'pausable', 'temp1' ];
	Host_InitRuleCvars(); Host_InitRuleCvars(); // twice is harmless
	for ( const n of names ) check( Cvar_FindVar( n ), n + ' registered' );
	Cvar_SetValue( 'skill', 2 );
	check( Cvar_VariableValue( 'skill' ) === 2, 'skill takes the value SV_SpawnServer sets' );
	const room = readFileSync( new URL( '../server/game_server.js', import.meta.url ), 'utf8' );
	check( /\n\tSV_Init\(\);\n\tHost_InitRuleCvars\(\);/.test( room ), 'the room server registers them after SV_Init' );
} );
