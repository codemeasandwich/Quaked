// Hexen II changelevel(level, spot) (#70): the gamecode's two-string builtin records the transition target in the
// server state; the page (not the physics step) performs the map reload. A second call before the page consumes the
// target is ignored, as the native PF_changelevel.
import { existsSync, readFileSync } from 'node:fs';
import { G_INT_SET, PR_SetTempString, PR_SetSV, PR_SetSVS } from '../src/engine/progs/progs.js';
import { PR_LoadProgs } from '../src/engine/progs/pr_edict.js';
import { sv as serverSv } from '../src/engine/server/server.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
GameProfile_Set( 'hexen2' ); // the selected game before its gamecode loads

Deno.test( 'changelevel records a normalised map and start spot once per level', () => {

	const HEXEN = '/Users/bri/quaked/Hexen 2/data1/progs.dat';
	if ( ! existsSync( HEXEN ) ) { console.log( 'SKIP: the supplied Hexen II program is not present' ); return; }
	const bytes = readFileSync( HEXEN );
	PR_LoadProgs( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	const sv = serverSv, state = { clients: [], active: true, changelevel_issued: false };
	PR_SetSV( sv ); PR_SetSVS( state );
	sv.nextmap = null; state.changelevel_issued = false;
	G_INT_SET( OFS_PARM0, PR_SetTempString( 'demo2' ) );
	G_INT_SET( OFS_PARM1, PR_SetTempString( 'start2' ) );
	check( Hexen2_CallBuiltin( 70, {} ), 'the builtin is implemented' );
	same( sv.nextmap.level, 'maps/demo2.bsp', 'the map is normalised to the mount path' );
	same( sv.nextmap.spot, 'start2', 'the start spot is retained' );
	same( state.changelevel_issued, true, 'the one-shot guard is set' );

	sv.nextmap = null;
	G_INT_SET( OFS_PARM0, PR_SetTempString( 'demo3' ) );
	G_INT_SET( OFS_PARM1, PR_SetTempString( '' ) );
	Hexen2_CallBuiltin( 70, {} );
	same( sv.nextmap, null, 'a second call before consumption is ignored' );

	state.changelevel_issued = false;
	G_INT_SET( OFS_PARM0, PR_SetTempString( 'maps/ruins.bsp' ) );
	G_INT_SET( OFS_PARM1, PR_SetTempString( '' ) );
	Hexen2_CallBuiltin( 70, {} );
	same( sv.nextmap.level, 'maps/ruins.bsp', 'an already-normalised map is accepted' );

} );
