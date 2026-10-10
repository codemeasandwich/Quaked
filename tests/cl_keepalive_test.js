// While a remote map loads, the client sends the server a keepalive (WinQuake cl_parse.c CL_KeepaliveMessage; card
// [44m], item 14). The send had been commented out, so the nop was written into cls.message and cleared again, which
// also threw away anything already queued there. Through the public CL_KeepaliveMessage with the real NET_SendMessage
// and a recording network driver: the queued command and the nop are sent together; a local server and a demo send
// nothing.
import * as net from '../src/engine/net/net.js';
import { cls } from '../src/engine/client/client.js';
import { sv } from '../src/engine/server/server.js';
import { CL_KeepaliveMessage } from '../src/engine/client/cl_parse.js';
import { MSG_WriteByte, MSG_WriteString, SZ_Alloc, SZ_Clear } from '../src/engine/common/common.js';
import { clc_nop, clc_stringcmd } from '../src/engine/common/protocol.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'a keepalive sends the queued message with a nop; never for a local server or a demo', async () => {
	// the keepalive goes at most once every 5 seconds of the process clock, counted from 0
	while ( performance.now() < 5200 ) await new Promise( r => setTimeout( r, 100 ) );
	const driver = net.net_drivers[ 7 ], saved = driver.QSendMessage, sent = [];
	const state = { netcon: cls.netcon, demo: cls.demoplayback, active: sv.active };
	driver.QSendMessage = ( sock, data ) => { sent.push( Array.from( data.data.subarray( 0, data.cursize ) ) ); return 1; };
	try {
		if ( ! cls.message.maxsize ) SZ_Alloc( cls.message, 1024 ); // CL_Init's buffer
		SZ_Clear( cls.message ); cls.netcon = { driver: 7, disconnected: false }; cls.demoplayback = false;
		sv.active = true; CL_KeepaliveMessage(); same( sent.length, 0, 'a local server needs none' );
		sv.active = false; cls.demoplayback = true; CL_KeepaliveMessage(); same( sent.length, 0, 'nor a demo' );
		cls.demoplayback = false;
		MSG_WriteByte( cls.message, clc_stringcmd ); MSG_WriteString( cls.message, 'prespawn' );
		const queued = Array.from( cls.message.data.subarray( 0, cls.message.cursize ) );
		CL_KeepaliveMessage();
		same( sent.length, 1, 'one message sent' );
		same( JSON.stringify( sent[ 0 ] ), JSON.stringify( [ ...queued, clc_nop ] ), 'the queued command, then the nop' );
		same( cls.message.cursize, 0, 'and the buffer is empty' );
		CL_KeepaliveMessage(); same( sent.length, 1, 'not again within 5 seconds' );
	} finally {
		driver.QSendMessage = saved; cls.netcon = state.netcon; cls.demoplayback = state.demo; sv.active = state.active;
	}
} );
