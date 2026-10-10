// The large-map protocol's pairs (card [34f]) on the actual server: at sv_protocol 1015 the server's own writers
// (SV_StartSound, SV_WriteClientdataToMessage, the baselines SV_SpawnServer writes) put model, frame and sound numbers
// above 255 on the wire, and the real client parser reads each message to its exact end. A sentinel svc_updatestat
// follows each message: a field read at the wrong width would misread it, as a protocol-15 client's read of the same
// sound shows. The delta packets and playerinfo, which need a running client's frames, are covered by the browser
// trials (docs/large-maps-2026-10-10.md).
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { sv, svs, client_t, coop, deathmatch, teamplay, skill } from '../src/engine/server/server.js';
import { SV_Init, SV_SpawnServer, SV_StartSound, SV_WriteClientdataToMessage, sv_protocol } from '../src/engine/server/sv_main.js';
import { SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { ED_NewString } from '../src/engine/progs/pr_edict.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cmd_Init } from '../src/engine/common/cmd.js';
import { sizebuf_t, SZ_Alloc, SZ_Clear, SZ_Write, MSG_WriteByte, MSG_WriteLong, COM_SetNetMessage } from '../src/engine/common/common.js';
import { svc_updatestat, PROTOCOL_LARGE } from '../src/engine/common/protocol.js';
import { cls, cl, ca_dedicated, cl_entities } from '../src/engine/client/client.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import * as Q from '../src/engine/common/quakedef.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
Cbuf_Init(); Cmd_Init(); Mod_Init(); PR_InitBuiltins(); Host_InitCommands(); SV_Init();
for ( const c of [ deathmatch, coop, teamplay, skill, sv_protocol ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
svs.maxclientslimit = 4; svs.clients = Array.from( { length: 4 }, () => new client_t() ); svs.maxclients = 1;
cls.state = ca_dedicated;
const SENTINEL = 31; // a stat no game uses

// parse `payload` (a server message) then a sentinel stat, as the client would; the sentinel must read back exactly
function parse( payload, label ) {
	const msg = new sizebuf_t(); SZ_Alloc( msg, payload.cursize + 16 ); SZ_Clear( msg );
	SZ_Write( msg, payload.data, payload.cursize );
	MSG_WriteByte( msg, svc_updatestat ); MSG_WriteByte( msg, SENTINEL ); MSG_WriteLong( msg, 12345678 );
	cl.stats[ SENTINEL ] = 0;
	COM_SetNetMessage( msg ); CL_ParseServerMessage();
	same( cl.stats[ SENTINEL ], 12345678, label + ': read to its end, the next message intact' );
}

Deno.test( 'at protocol 1015 sounds, clientdata and baselines carry numbers above 255, read back at the right width', () => {
	vars.Cvar_Set( 'sv_protocol', '1015' );
	try {
		for ( const c of svs.clients ) c.active = false;
		SV_SpawnServer( 'e1m1' );
		check( sv.active, 'e1m1 runs' );
		same( sv.protocol, PROTOCOL_LARGE, 'the server speaks the large-map protocol' );
		cl.protocol = PROTOCOL_LARGE;
		// precache names up to 300, as a large map's (names only: nothing here loads them)
		for ( let i = 1; i <= 300; i ++ ) { if ( ! sv.model_precache[ i ] ) sv.model_precache[ i ] = 'progs/player.mdl#' + i; if ( ! sv.sound_precache[ i ] ) sv.sound_precache[ i ] = 'misc/fake' + i + '.wav'; }
		const p = sv.edicts[ 1 ]; SV_SetPlayer( p );

		// svc_sound with sound 300, through the server's own writer
		SZ_Clear( sv.datagram );
		SV_StartSound( p, 0, 'misc/fake300.wav', 255, 1 );
		const sound = new sizebuf_t(); SZ_Alloc( sound, sv.datagram.cursize ); SZ_Write( sound, sv.datagram.data, sv.datagram.cursize );
		check( sv.datagram.cursize > 0, 'the sound was written' );
		parse( sv.datagram, 'svc_sound with sound 300' );

		// clientdata with weapon model 290 and weapon frame 270
		p.v.weaponmodel = ED_NewString( 'progs/player.mdl#290' ); p.v.weaponframe = 270;
		const cd = new sizebuf_t(); SZ_Alloc( cd, 256 ); SZ_Clear( cd );
		SV_WriteClientdataToMessage( p, cd );
		parse( cd, 'clientdata' );
		same( cl.stats[ Q.STAT_WEAPON ], 290, 'the weapon model, past 255' );
		same( cl.stats[ Q.STAT_WEAPONFRAME ], 270, 'the weapon frame, past 255' );

		// the baselines SV_SpawnServer wrote into the signon, at their own widths
		parse( sv.signon, 'the signon\'s baselines' );
		check( cl_entities[ 1 ].baseline !== undefined, 'baselines parsed' );

		// the control, last (a misread ends the game): a protocol-15 client reads that sound a byte short, and the
		// sentinel shows it
		cl.protocol = 15;
		let misread = false; try { parse( sound, 'control' ); } catch ( e ) { misread = true; }
		check( misread, 'read at the wrong width, the sentinel is not intact' );
	} finally { vars.Cvar_Set( 'sv_protocol', '15' ); sv.active = false; cl.protocol = 15; }
} );
