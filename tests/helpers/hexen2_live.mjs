// A real Hexen II session for tests that need live gamecode: mount the owned paks through the engine's own loaders and
// start the shared server with SV_SpawnServer, then place one client exactly as SV_SpawnServer + the gamecode do.
// This replaces the retired parallel host's _boot/_mount fixtures; skip cleanly when the owned data is absent.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../../src/engine/common/pak.js';
import { VID_SetPalette } from '../../src/engine/render/vid.js';
import { Mod_Init } from '../../src/engine/render/gl_model.js';
import { SZ_Alloc } from '../../src/engine/common/common.js';
import { Cbuf_Init, Cmd_Init } from '../../src/engine/common/cmd.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue } from '../../src/engine/common/cvar.js';
import { GameProfile_Set } from '../../src/engine/common/game_profile.js';
import { PR_InitBuiltins } from '../../src/engine/server/pr_cmds.js';
import { SV_SpawnServer } from '../../src/engine/server/sv_main.js';
import { sv, svs, client_t } from '../../src/engine/server/server.js';
import { cls, ca_dedicated } from '../../src/engine/client/client.js';
import { Host_InitCommands } from '../../src/engine/server/host_cmd.js';
import { skill } from '../../src/engine/server/host.js';
import { sv_gravity, SV_SetFrametime } from '../../src/engine/server/sv_phys.js';
import { r_hdr } from '../../src/newer/render/gl_post.js';
import { PR_ExecuteProgram } from '../../src/engine/progs/pr_exec.js';
import { EDICT_TO_PROG, PR_GetString, pr_global_struct } from '../../src/engine/progs/progs.js';
import { GetEdictFieldValue } from '../../src/engine/progs/pr_edict.js';

export const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

/** Mount the supplied base installation and initialise the shared host pieces a map spawn needs. */
export function loadHexen2Data() {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! existsSync( HEXEN + '/progs.dat' ) ) return false;
	GameProfile_Set( 'hexen2' );
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

		const raw = readFileSync( HEXEN + '/' + name );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'live-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

	}
	// The base data1 keeps progs.dat, strings.txt and hexen.rc loose beside the paks.
	const loose = [];
	for ( const name of [ 'progs.dat', 'strings.txt', 'hexen.rc' ] )
		if ( existsSync( HEXEN + '/' + name ) ) loose.push( { name, data: new Uint8Array( readFileSync( HEXEN + '/' + name ) ) } );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'live-loose', pak.COM_BuildPack( loose ) ) );
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' );
	if ( palette === null ) return false;
	VID_SetPalette( palette.data.buffer.slice( palette.data.byteOffset, palette.data.byteOffset + palette.data.byteLength ) );
	Mod_Init();
	PR_InitBuiltins();
	Cbuf_Init();
	Cmd_Init();
	Host_InitCommands();
	for ( const value of [ r_hdr, skill, sv_gravity ] ) if ( ! Cvar_FindVar( value.name ) ) Cvar_RegisterVariable( value );
	Cvar_SetValue( 'r_hdr', 0 );
	Cvar_SetValue( 'skill', 1 );
	Cvar_SetValue( '_cl_playerclass', 1 );
	return true;

}

/**
 * Starts a map on the shared server and spawns one client through the gamecode.
 *
 * @param {string} [map] the map name without `maps/` or `.bsp`
 * @param {number} [classNumber] the native playerclass to hand the gamecode
 * @returns {{ sv: object, svs: object, client: object, player: object }} the live session
 */
export function spawnHexen2Map( map = 'demo1', classNumber = 1 ) {

	svs.maxclients = svs.maxclientslimit = 1;
	svs.clients = [ new client_t() ];
	SZ_Alloc( svs.clients[ 0 ].message, 32768 );
	sv.active = false;
	cls.state = ca_dedicated;
	SV_SpawnServer( map );
	if ( ! sv.active ) throw new Error( 'the shared server did not start ' + map );

	const client = svs.clients[ 0 ], player = client.edict;
	client.active = true;
	client.spawned = true;
	client.name = 'fixture';
	client.colors = 0;
	client.playerclass = classNumber;
	client.cmd = { viewangles: [ 0, 0, 0 ], forwardmove: 0, sidemove: 0, upmove: 0 };
	pr_global_struct.self = EDICT_TO_PROG( player );
	PR_ExecuteProgram( pr_global_struct.ClientConnect );
	// PutClientInServer otherwise picks the native random class for an unset playerclass.
	player.v.playerclass = classNumber;
	const newclass = GetEdictFieldValue( player, 'newclass' );
	if ( newclass !== null ) newclass.accessor.setFloat( newclass.ofs, classNumber );
	PR_ExecuteProgram( pr_global_struct.PutClientInServer );
	SV_SetFrametime( 0.1 );
	return { sv, svs, client, player };

}

/** The first live entity with a classname, or undefined. */
export function findEntity( server, classname ) {

	for ( let i = 1; i < server.num_edicts; i ++ ) {

		const ent = server.edicts[ i ];
		if ( ent && ! ent.free && PR_GetString( ent.v.classname ) === classname ) return ent;

	}

}
