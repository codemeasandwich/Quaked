// Console messages end in a real newline, not the two characters backslash and n (card [44m], item 8). Through the
// public Memory_Init and COM_LoadPackFile, whose messages were written with an escaped "\\n"; the console's own text and
// the developer log are read back.
import * as zone from '../src/engine/common/zone.js';
import * as pak from '../src/engine/common/pak.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

Deno.test( 'Memory_Init and COM_LoadPackFile print their messages without a literal backslash-n', () => {
	const seen = [], log = console.log;
	console.log = ( ...a ) => { seen.push( a.join( ' ' ) ); };
	try {
		zone.Memory_Init();
		const empty = new ArrayBuffer( 12 ), v = new DataView( empty ); // a PACK header with an empty directory
		[ 80, 65, 67, 75 ].forEach( ( c, i ) => v.setUint8( i, c ) ); v.setInt32( 4, 12, true ); v.setInt32( 8, 0, true );
		pak.COM_LoadPackFile( 'fixture.pak', empty );
	} finally { console.log = log; }
	const text = seen.join( '\n' );
	check( /Memory initialized/.test( text ) && /Added packfile fixture\.pak/.test( text ), 'both messages printed: ' + text );
	check( ! text.includes( '\\n' ), 'no literal backslash-n: ' + JSON.stringify( text ) );
} );
