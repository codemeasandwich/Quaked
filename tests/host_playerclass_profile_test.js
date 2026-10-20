/**
 * The Hexen II class choice (`_cl_playerclass`, `playerclass`) exists only in a Hexen II session: a Quake game must
 * not archive the Hexen cvar into its config, and a Quake server must not answer `playerclass` with a Hexen message.
 */
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { Cbuf_Init, Cmd_Init, Cmd_Exists } from '../src/engine/common/cmd.js';
import { Cvar_FindVar } from '../src/engine/common/cvar.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';

function check( condition, message ) { if ( ! condition ) throw new Error( message ); }

Deno.test( 'a Quake session has no Hexen II player class cvar or command', () => {

	GameProfile_Set( 'quake' );
	Cbuf_Init(); Cmd_Init(); Host_InitCommands();
	check( Cvar_FindVar( '_cl_playerclass' ) === null, 'no _cl_playerclass in a Quake session' );
	check( ! Cmd_Exists( 'playerclass' ), 'no playerclass command in a Quake session' );

} );
