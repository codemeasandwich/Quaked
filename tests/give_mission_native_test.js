// The give command under the mission packs (card [34c]; WinQuake host_cmd.c Host_Give_f) on the actual native server:
// under -hipnotic, give 9, 0 and 6a give the Laser Cannon, Mjolnir and the Proximity Gun; under -rogue, the owner's own
// Dissolution of Eternity QuakeC (resources/rogue/pak0.pak, a named skip where it is absent) keeps each ammunition kind
// in a field of its own, and give sets that field and the current one by the weapon held.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { sv, svs, client_t, coop, deathmatch, teamplay, skill, set_host_client } from '../src/engine/server/server.js';
import { SV_Init, SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cmd_Init, Cmd_ExecuteString, src_client } from '../src/engine/common/cmd.js';
import { COM_InitArgv } from '../src/engine/common/common.js';
import { cls, ca_dedicated } from '../src/engine/client/client.js';
import * as Q from '../src/engine/common/quakedef.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const mount = path => { const raw = readFileSync( new URL( '../' + path, import.meta.url ) ); pak.COM_AddPack( pak.COM_LoadPackFile( path, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); };
mount( 'games/shareware/pak0.pak' );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
Cbuf_Init(); Cmd_Init(); Mod_Init(); PR_InitBuiltins(); Host_InitCommands(); SV_Init();
for ( const c of [ deathmatch, coop, teamplay, skill ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
svs.maxclientslimit = 4; svs.clients = Array.from( { length: 4 }, () => new client_t() ); svs.maxclients = 1;
cls.state = ca_dedicated;

// a server on `map` with its player in it, the give command run as that player's own
function player( map ) {
	for ( const c of svs.clients ) c.active = false; // a client left over from another case would be sent the server info
	SV_SpawnServer( map );
	check( sv.active, map + ' runs' );
	const client = svs.clients[ 0 ];
	client.active = client.spawned = true; client.privileged = false; client.edict = sv.edicts[ 1 ];
	set_host_client( client ); SV_SetPlayer( client.edict );
	return { p: client.edict, give: args => Cmd_ExecuteString( 'give ' + args, src_client ), field: name => { const f = GetEdictFieldValue( client.edict, name ); return f ? f.accessor.getFloat( f.ofs ) : null; } };
}

Deno.test( 'Scourge of Armagon: give 9, 0 and 6a give its three weapons; 6 is still the grenade launcher', () => {
	COM_InitArgv( [ 'quaked', '-hipnotic' ] );
	try {
		const { p, give } = player( 'e1m1' );
		check( sv.signon.allowoverflow && ! sv.signon.overflowed, 'a spawned map\'s signon notes an overflow rather than a Sys_Error (static_limits_test checks the Host_Error)' );
		p.v.items = 0;
		give( '9' ); check( p.v.items & Q.HIT_LASER_CANNON, 'give 9: the Laser Cannon' );
		give( '0' ); check( p.v.items & Q.HIT_MJOLNIR, 'give 0: Mjolnir' );
		give( '6a' ); check( p.v.items & Q.HIT_PROXIMITY_GUN, 'give 6a: the Proximity Gun' );
		give( '6' ); check( p.v.items & Q.IT_GRENADE_LAUNCHER, 'give 6: the grenade launcher' );
		give( '3' ); check( p.v.items & Q.IT_SUPER_SHOTGUN, 'the others as before' );
		COM_InitArgv( [ 'quaked' ] );
		p.v.items = 0; give( '9' );
		same( p.v.items, Q.IT_SHOTGUN << 7, 'standard Quake: 9 is a bit like the others (no Laser Cannon)' );
	} finally { COM_InitArgv( [] ); sv.active = false; }
} );

Deno.test( 'Dissolution of Eternity: give sets its own ammunition fields, and the current kind by the weapon held', () => {
	mount( 'resources/rogue/pak0.pak' ); // the owner's copy (its QuakeC has ammo_lava_nails and the rest)
	COM_InitArgv( [ 'quaked', '-rogue' ] );
	try {
		const { p, give, field } = player( 'start' );
		check( field( 'ammo_lava_nails' ) !== null, 'its QuakeC has its own ammunition fields' );
		p.v.weapon = Q.IT_NAILGUN;
		give( 'n 77' ); same( field( 'ammo_nails1' ), 77, 'nails into its own field' ); same( p.v.ammo_nails, 77, 'and the current count, a nailgun being held' );
		give( 'l 33' ); same( field( 'ammo_lava_nails' ), 33, 'lava nails into theirs' ); same( p.v.ammo_nails, 77, 'not the current count while an ordinary weapon is held' );
		p.v.weapon = Q.RIT_LAVA_NAILGUN;
		give( 'l 44' ); same( p.v.ammo_nails, 44, 'with the Lava Nailgun held, lava nails are the current count' );
		give( 'm 12' ); same( field( 'ammo_multi_rockets' ), 12, 'multi-rockets' ); same( p.v.ammo_rockets, 12, 'current, a powered-up weapon being held' );
		give( 'p 9' ); same( field( 'ammo_plasma' ), 9, 'plasma' ); same( p.v.ammo_cells, 9, 'current, likewise' );
		give( 's 5' ); same( field( 'ammo_shells1' ), 5, 'shells into their own field' ); same( p.v.ammo_shells, 5, 'and always the current count' );
	} finally { COM_InitArgv( [] ); sv.active = false; }
} );

Deno.test( 'a signon that overflowed during play is never sent: prespawn ends the game instead', async () => {
	const { SZ_Alloc } = await import( '../src/engine/common/common.js' );
	COM_InitArgv( [] );
	try {
		player( 'e1m1' );
		const client = svs.clients[ 0 ];
		client.spawned = false; SZ_Alloc( client.message, 16384 ); client.message.cursize = 0;
		sv.signon.overflowed = true; // as a late makestatic or MSG_INIT write past 8192 bytes leaves it
		let error = null;
		try { Cmd_ExecuteString( 'prespawn', src_client ); } catch ( e ) { error = e.message; }
		check( error && /prespawn/.test( error ) && /8192-byte signon/.test( error ), 'prespawn ends the game, naming the map: ' + error );
		same( client.message.cursize, 0, 'and nothing of the cleared signon was written for the client' );
	} finally { sv.signon.overflowed = false; sv.active = false; }
} );
