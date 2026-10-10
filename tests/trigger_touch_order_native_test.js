// A trigger whose touch removes the next trigger in its area list no longer hangs the page (card [44m] review). Since
// ED_Free unlinks a freed edict, its link points at itself; SV_TouchLinks walked the list while running touches, so a
// killtarget of its next neighbour looped forever. The triggers are now gathered first and touched after, each checked
// again, as QuakeSpasm does. On the actual native server with the game's own QuakeC: trigger A's multi_touch
// killtargets B (SUB_UseTargets, no delay), B linked right after A; a player stepping into both.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { sv, svs, client_t, coop, deathmatch, teamplay, skill, SOLID_TRIGGER } from '../src/engine/server/server.js';
import { SV_Init, SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { SV_LinkEdict } from '../src/engine/server/world.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { ED_Alloc, ED_NewString, ED_FindFunction, GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { pr_functions } from '../src/engine/progs/progs.js';
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
const fn = name => { const f = ED_FindFunction( name ); check( f, name + ' in the progs' ); return pr_functions.indexOf( f ); };

Deno.test( 'a trigger killtargeting the next trigger in its list: both handled, the walk ends', () => {
	for ( const c of svs.clients ) c.active = false;
	SV_SpawnServer( 'e1m1' );
	const at = [ 4000, 4000, 4000 ]; // empty space, away from the map's own triggers
	const trigger = ( targetname, killtarget ) => {
		const e = ED_Alloc();
		e.v.classname = ED_NewString( 'trigger_multiple' ); e.v.solid = SOLID_TRIGGER; e.v.touch = fn( 'multi_touch' );
		for ( let i = 0; i < 3; i ++ ) { e.v.origin[ i ] = at[ i ]; e.v.mins[ i ] = - 32; e.v.maxs[ i ] = 32; }
		if ( targetname ) e.v.targetname = ED_NewString( targetname );
		if ( killtarget ) { const k = GetEdictFieldValue( e, 'killtarget' ); k.accessor.setInt32( k.ofs, ED_NewString( killtarget ) ); }
		SV_LinkEdict( e, false ); return e;
	};
	const a = trigger( null, 'victim' ), b = trigger( 'victim', null ); // linked in that order: b is a's next
	check( a.area.next === b.area, 'b follows a in the area list' );
	const p = sv.edicts[ 1 ]; p.v.classname = ED_NewString( 'player' ); p.v.solid = 3; // SOLID_SLIDEBOX
	for ( let i = 0; i < 3; i ++ ) { p.v.origin[ i ] = at[ i ]; p.v.mins[ i ] = - 16; p.v.maxs[ i ] = 16; }
	SV_LinkEdict( p, true ); // touches both
	check( b.free, 'a\'s touch removed b' );
	check( a.v.touch !== fn( 'multi_touch' ), 'a fired (multi_trigger set its touch to SUB_Null)' );
} );
