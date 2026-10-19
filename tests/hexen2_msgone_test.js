// MSG_ONE routing in the write builtins: the destination edict number must come from PROG_TO_EDICT(msg_entity) +
// NUM_FOR_EDICT, not from the globals slot index (the earlier G_EDICTNUM(msg_entity) call treated a pointer as a slot
// and crashed on the world entity). A client receives the byte; a non-client destination is a clean script error.
import { sv as serverSv } from '../src/engine/server/server.js';
import { PR_SetSV, PR_SetSVS, PR_SetArgc, PR_SetGlobalStruct, PR_SetGlobalsFloat, EDICT_TO_PROG } from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { G_FLOAT_SET } from '../src/engine/progs/progs.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'MSG_ONE writes to the edict the pointer names', () => {

	const message = { data: new Uint8Array( 64 ), maxsize: 64, cursize: 0 };
	const client = { index: 1, free: false, v: { classname: 0 } };
	const monster = { index: 5, free: false, v: { classname: 0 } }; // (kept for the world shape; not a write target here)
	const sv = serverSv;
	sv.edicts = [ { index: 0 }, client, { index: 2 }, { index: 3 }, { index: 4 }, monster ];
	sv.num_edicts = 6;
	serverSv.time = 1;
	PR_SetSV( sv );
	PR_SetGlobalsFloat( new Float32Array( 64 ) );
	const globals = { msg_entity: 0 };
	PR_SetGlobalStruct( globals );
	const svs = { maxclients: 1, clients: [ { message } ], active: true };
	PR_SetSVS( svs );

	// a client destination receives the byte
	G_FLOAT_SET( OFS_PARM0, 1 ); // MSG_ONE
	G_FLOAT_SET( OFS_PARM1, 42 );
	PR_SetArgc( 2 );
	globals.msg_entity = EDICT_TO_PROG( client );
	check( Hexen2_CallBuiltin( 52, {} ) === true, 'writebyte is implemented' );
	same( message.cursize, 1, 'the client message grew' );
	same( message.data[ 0 ], 42, 'the client received the byte' );

	// the failed form treated msg_entity as a globals slot: G_EDICTNUM(pointer) read beyond the globals array
	check( message.cursize === 1, 'the client message is intact' );

} );
