// Fatal and game-ending errors, and the server's prints to clients, format their arguments (card [44m], items 12
// and 13). Callers write them printf-style, as in WinQuake ("svc_updatestat: %i is invalid", i); before, Sys_Error
// and Host_Error took one argument, so the message showed a literal %i, and SV_ClientPrintf replaced only %s, printing
// 0 as nothing. Through the real client parser, CL_EntityNum and SV_ClientPrintf.
import { sizebuf_t, SZ_Alloc, SZ_Clear, MSG_WriteByte, COM_SetNetMessage, MSG_BeginReading, MSG_ReadByte, MSG_ReadString } from '../src/engine/common/common.js';
import { svc_updatestat, svc_print } from '../src/engine/common/protocol.js';
import { CL_ParseServerMessage, CL_EntityNum } from '../src/engine/client/cl_parse.js';
import { client_t, set_host_client } from '../src/engine/server/server.js';
import { SV_ClientPrintf } from '../src/engine/server/host.js';
import * as Q from '../src/engine/common/quakedef.js';
import { Sys_Error } from '../src/engine/common/sys.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const thrown = fn => { try { fn(); } catch ( e ) { return e.message; } return null; };

Deno.test( 'Sys_Error and Host_Error put the values in their messages', () => {
	const msg = new sizebuf_t(); SZ_Alloc( msg, 16 ); SZ_Clear( msg );
	MSG_WriteByte( msg, svc_updatestat ); MSG_WriteByte( msg, 40 ); // stat 40, past MAX_CL_STATS
	COM_SetNetMessage( msg );
	same( thrown( () => CL_ParseServerMessage() ), 'svc_updatestat: 40 is invalid', 'the Sys_Error' );
	same( thrown( () => CL_EntityNum( Q.MAX_EDICTS + 5 ) ), 'Host_Error: CL_EntityNum: ' + ( Q.MAX_EDICTS + 5 ) + ' is an invalid number', 'the Host_Error' );
} );

Deno.test( 'SV_ClientPrintf prints every code, and 0 as 0', () => {
	const client = new client_t(); client.message = new sizebuf_t(); SZ_Alloc( client.message, 128 ); SZ_Clear( client.message );
	set_host_client( client );
	try { SV_ClientPrintf( '%s has %d frags (%i)\n', 'Ranger', 0, 3 ); } finally { set_host_client( null ); }
	COM_SetNetMessage( client.message ); MSG_BeginReading();
	same( MSG_ReadByte(), svc_print, 'an svc_print' );
	same( MSG_ReadString(), 'Ranger has 0 frags (3)\n', 'the text' );
} );

Deno.test( 'a message with no values is used as given, a % in it kept', () => {
	same( thrown( () => Sys_Error( 'loaded 100% of %s' ) ), 'loaded 100% of %s', 'Sys_Error with no values' );
	const msg = new sizebuf_t(); SZ_Alloc( msg, 8 ); SZ_Clear( msg );
	MSG_WriteByte( msg, 100 ); COM_SetNetMessage( msg ); // not a message the client knows: a Host_Error with no values
	same( thrown( () => CL_ParseServerMessage() ), 'Host_Error: CL_ParseServerMessage: Illegible server message\n', 'Host_Error with no values' );
} );
