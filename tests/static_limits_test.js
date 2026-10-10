// The client's static-entity and efrag limits (card [34c]), raised from WinQuake's 128 and 640 for the episodes'
// large maps (Dimension of the Machine's hub makes 485 static entities): through the real parser, 485 svc_spawnstatic
// messages are taken, and the limit still ends the game with its Host_Error; CL_ClearState chains the whole efrag pool.
import '../src/newer/install.js';
const { sizebuf_t, SZ_Alloc, MSG_WriteByte, MSG_WriteCoord, MSG_WriteAngle, COM_SetNetMessage } = await import( '../src/engine/common/common.js' );
const { svc_spawnstatic } = await import( '../src/engine/common/protocol.js' );
const { cl, MAX_STATIC_ENTITIES, MAX_EFRAGS } = await import( '../src/engine/client/client.js' );
const { CL_ParseServerMessage } = await import( '../src/engine/client/cl_parse.js' );
const { CL_ClearState } = await import( '../src/engine/client/cl_main.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

// a message of `count` svc_spawnstatic, each with no model (the parser's own path, without drawing)
function statics( count ) {
	const packet = new sizebuf_t(); SZ_Alloc( packet, 16 * count + 16 );
	for ( let n = 0; n < count; n ++ ) {
		MSG_WriteByte( packet, svc_spawnstatic ); for ( let b = 0; b < 4; b ++ ) MSG_WriteByte( packet, 0 );
		for ( let i = 0; i < 3; i ++ ) { MSG_WriteCoord( packet, n ); MSG_WriteAngle( packet, 0 ); }
	}
	return packet;
}

Deno.test( 'a map\'s 485 static entities are taken (WinQuake stopped at 128); the limit still ends the game', () => {
	CL_ClearState();
	cl.num_statics = 0;
	COM_SetNetMessage( statics( 485 ) ); CL_ParseServerMessage();
	same( cl.num_statics, 485, 'Dimension of the Machine\'s hub\'s count, all taken' );
	cl.num_statics = MAX_STATIC_ENTITIES;
	let error = null;
	try { COM_SetNetMessage( statics( 1 ) ); CL_ParseServerMessage(); } catch ( e ) { error = e.message; }
	check( error && /Too many static entities/.test( error ), 'at the limit, the game ends with its Host_Error: ' + error );
	cl.num_statics = 0;
} );

Deno.test( 'the efrag pool, chained whole at each level start, has room for those statics in several leaves each', () => {
	CL_ClearState();
	let n = 0;
	for ( let ef = cl.free_efrags; ef; ef = ef.entnext ) n ++;
	same( n, MAX_EFRAGS, 'every efrag is on the free list' );
	check( n >= 485 * 8, 'room for 485 statics in 8 leaves each (WinQuake had 640 in all): ' + n );
} );
