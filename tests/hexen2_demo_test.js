// Hexen II native demo framing (src/engine/common/hexen2_demo.js): the forcing-track line, length + view angles +
// payload records, the payload bound, and the supplied demos read end to end. plan section 5 (separate native demo
// readers); T05 prerequisite.
import { existsSync, readFileSync } from './helpers/resource_fs.mjs';
import {
	Hexen2_ReadDemoForceTrack, Hexen2_ReadDemoMessage, Hexen2_ReadDemoMessages, HEXEN2_DEMO_MAX_MESSAGE
} from '../src/engine/common/hexen2_demo.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2/data1';

function demo( forceTrack, records ) {

	const parts = [ Buffer.from( String( forceTrack ) + '\n', 'latin1' ) ];
	for ( const { length, angles = [ 0, 0, 0 ], payload } of records ) {

		const head = Buffer.alloc( 16 );
		head.writeUInt32LE( length, 0 );
		angles.forEach( ( value, i ) => head.writeFloatLE( value, 4 + i * 4 ) );
		parts.push( head, payload ?? Buffer.alloc( length, 0x5a ) );

	}
	return Buffer.concat( parts );

}

Deno.test( 'the forcing-track line and one framed message are read exactly', () => {

	const bytes = demo( - 1, [ { length: 4, angles: [ 10, 20, 30 ], payload: Buffer.from( [ 8, 9, 10, 11 ] ) } ] );
	const track = Hexen2_ReadDemoForceTrack( bytes );
	check( track.ok, track.reason );
	same( track.forceTrack, - 1, 'the forcing track' );
	same( track.offset, 3, 'the first record follows "-1\\n"' );
	const message = Hexen2_ReadDemoMessage( bytes, track.offset );
	check( message.ok, message.reason );
	same( message.message.length, 4, 'payload length' );
	same( message.message.angles.join( ',' ), '10,20,30', 'view angles' );
	same( message.message.payloadOffset, 19, 'the payload follows the 16-byte header' );
	same( message.message.endsAt, 23, 'the record ends after its payload' );
	same( Array.from( bytes.subarray( 19, 23 ) ).join( ',' ), '8,9,10,11', 'the payload bytes are untouched' );

} );

Deno.test( 'malformed and truncated framing is refused with a reason', () => {

	check( ! Hexen2_ReadDemoForceTrack( Buffer.from( 'not-a-number\n' ) ).ok, 'a non-integer track line' );
	check( ! Hexen2_ReadDemoForceTrack( Buffer.from( '3' ) ).ok, 'a line without its newline' );
	check( ! Hexen2_ReadDemoForceTrack( Buffer.from( '120\n' ) ).ok, 'a track outside -1..99' );
	const over = demo( - 1, [ { length: HEXEN2_DEMO_MAX_MESSAGE + 1, payload: Buffer.alloc( 0 ) } ] );
	check( /exceeds 20000/.test( Hexen2_ReadDemoMessage( over, 3 ).reason ), 'a record over MAX_MSGLEN is refused' );
	const truncated = demo( - 1, [ { length: 100, payload: Buffer.alloc( 10 ) } ] );
	check( /runs past the file/.test( Hexen2_ReadDemoMessage( truncated, 3 ).reason ), 'a short payload is refused' );
	check( ! Hexen2_ReadDemoMessages( Buffer.from( '-1\nshort' ) ).ok, 'a truncated record header is refused' );
	const notFinite = demo( - 1, [ { length: 1, angles: [ Number.NaN, 0, 0 ], payload: Buffer.from( [ 0 ] ) } ] );
	check( /not finite/.test( Hexen2_ReadDemoMessage( notFinite, 3 ).reason ), 'a non-finite view angle is refused' );

} );

Deno.test( 'the supplied native demos read end to end and start with a server message', () => {

	const files = [ 'demo1.dem', 'demo2.dem', 'demo3.dem' ].map( name => BASE + '/' + name );
	if ( ! files.every( existsSync ) ) { console.log( 'SKIP: the supplied Hexen II demos are not present at ' + BASE ); return; }
	for ( const file of files ) {

		const bytes = readFileSync( file );
		const read = Hexen2_ReadDemoMessages( bytes );
		check( read.ok, `${file}: ${read.reason}` );
		same( read.forceTrack, - 1, file + ' forcing track' );
		check( read.messages.length > 100, file + ' has many messages: ' + read.messages.length );
		// every message is a server message stream: the first byte of the first payload is a known svc_* (svc_print, 8)
		same( bytes[ read.messages[ 0 ].payloadOffset ], 8, file + ' first message starts with svc_print' );
		check( read.messages.every( message => message.length <= HEXEN2_DEMO_MAX_MESSAGE ), file + ' every message is within the bound' );
		// the frames account for the whole file, with nothing silently dropped
		same( read.messages[ read.messages.length - 1 ].endsAt, bytes.length, file + ' framing covers the file exactly' );

	}

} );
