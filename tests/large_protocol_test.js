// This port's large-map protocol (card [34f]): with sv_protocol 1015 a server writes model, frame and sound numbers as
// shorts, and the client, told by the serverinfo, reads them so; protocol 15 is byte for byte as before. Through the
// server's own writer (SV_WriteIndex) and the real client parser (an svc_spawnbaseline with model 300, frame 260).
// The precache limits follow the protocol: 256 each in protocol 15, 2048 in the large one; the model cache holds more
// than WinQuake's 512 names.
import '../src/newer/install.js';
const { sizebuf_t, SZ_Alloc, MSG_WriteByte, MSG_WriteShort, MSG_WriteCoord, MSG_WriteAngle, COM_SetNetMessage } = await import( '../src/engine/common/common.js' );
const { svc_spawnbaseline, PROTOCOL_VERSION, PROTOCOL_LARGE } = await import( '../src/engine/common/protocol.js' );
const { sv } = await import( '../src/engine/server/server.js' );
const { SV_WriteIndex, SV_ModelLimit, SV_SoundLimit } = await import( '../src/engine/server/sv_main.js' );
const { cl, cl_entities } = await import( '../src/engine/client/client.js' );
const { CL_ParseServerMessage } = await import( '../src/engine/client/cl_parse.js' );
const { CL_ClearState } = await import( '../src/engine/client/cl_main.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

// a baseline for entity 7, written as the server writes one
function baseline( model, frame ) {
	const msg = new sizebuf_t(); SZ_Alloc( msg, 64 );
	MSG_WriteByte( msg, svc_spawnbaseline ); MSG_WriteShort( msg, 7 );
	SV_WriteIndex( msg, model ); SV_WriteIndex( msg, frame ); MSG_WriteByte( msg, 0 ); MSG_WriteByte( msg, 0 );
	for ( let i = 0; i < 3; i ++ ) { MSG_WriteCoord( msg, 0 ); MSG_WriteAngle( msg, 0 ); }
	return msg;
}

Deno.test( 'the large-map protocol carries model 300 and frame 260; protocol 15 is a byte each, as before', () => {
	CL_ClearState();
	sv.protocol = PROTOCOL_LARGE; cl.protocol = PROTOCOL_LARGE;
	let msg = baseline( 300, 260 );
	same( msg.cursize, 1 + 2 + 2 + 2 + 1 + 1 + 3 * 3, 'shorts for the model and the frame' );
	COM_SetNetMessage( msg ); CL_ParseServerMessage();
	same( cl_entities[ 7 ].baseline.modelindex, 300, 'the client reads model 300' );
	same( cl_entities[ 7 ].baseline.frame, 260, 'and frame 260' );

	sv.protocol = PROTOCOL_VERSION; cl.protocol = PROTOCOL_VERSION;
	msg = baseline( 200, 5 );
	same( msg.cursize, 1 + 2 + 1 + 1 + 1 + 1 + 3 * 3, 'protocol 15: a byte each, the encoding unchanged' );
	COM_SetNetMessage( msg ); CL_ParseServerMessage();
	same( cl_entities[ 7 ].baseline.modelindex, 200, 'protocol 15 reads as before' );
	same( cl_entities[ 7 ].baseline.frame, 5, 'frame too' );
} );

Deno.test( 'the precache limits follow the protocol: 256 in protocol 15, 2048 in the large-map protocol', () => {
	sv.protocol = PROTOCOL_VERSION;
	same( SV_ModelLimit(), 256, 'models in protocol 15' ); same( SV_SoundLimit(), 256, 'sounds in protocol 15' );
	sv.protocol = PROTOCOL_LARGE;
	same( SV_ModelLimit(), 2048, 'models in the large-map protocol' ); same( SV_SoundLimit(), 2048, 'sounds likewise' );
	sv.protocol = PROTOCOL_VERSION;
} );

Deno.test( 'the model cache knows more than WinQuake\'s 512 names: a large map\'s submodels on top of other maps\'', async () => {
	const { Mod_FindName } = await import( '../src/engine/render/gl_model.js' );
	const names = Array.from( { length: 900 }, ( _, i ) => 'maps/large' + ( i >> 8 ) + '.bsp*' + i );
	const models = names.map( n => Mod_FindName( n ) );
	same( new Set( models ).size, 900, 'each name its own entry, past 512' );
	same( Mod_FindName( names[ 700 ] ), models[ 700 ], 'and found again by name' );
} );
