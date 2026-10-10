// ED_Free unlinks the freed edict from the world, as WinQuake's does (card [44m], item 4). Before, it unlinked only
// through `sv.SV_UnlinkEdict`, which nothing set, so a removed item or trigger stayed in the area node lists until its
// slot was reused. On the actual native server: e1m1's trigger_ entities are linked at spawn; after ED_Free (what the
// QuakeC remove() builtin calls), each is out of its area node's list.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { sv, svs, client_t, coop, deathmatch, teamplay, skill, SOLID_TRIGGER } from '../src/engine/server/server.js';
import { SV_Init, SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { ED_Free } from '../src/engine/progs/pr_edict.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
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
const linked = e => !! e.area.prev && e.area.prev !== e.area; // as SV_UnlinkEdict reads it: unlinked points at itself
Deno.test( 'a freed trigger leaves the world\'s area lists at once', () => {
	for ( const c of svs.clients ) c.active = false;
	SV_SpawnServer( 'e1m1' );
	const triggers = sv.edicts.filter( e => e && ! e.free && e.v.solid === SOLID_TRIGGER && PR_GetString( e.v.classname ).startsWith( 'trigger_' ) );
	check( triggers.length > 3, 'e1m1 has linked triggers (' + triggers.length + ')' );
	for ( const e of triggers ) check( linked( e ), PR_GetString( e.v.classname ) + ' is linked' );
	for ( const e of triggers ) ED_Free( e );
	for ( const e of triggers ) check( ! linked( e ), 'a freed trigger is unlinked (edict ' + e.index + ')' );
} );
