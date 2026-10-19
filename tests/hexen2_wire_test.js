// The private Quaked-Hexen session preamble (protocol 1019, quaked-hexen2-v1): the session, class, gamecode and rules
// round-trip, and truncation, foreign protocol/version, unknown fields and identity mismatches are refused. Entity
// messages are not part of this preamble yet (plan section 5). G1 codec foundation.
import { Hexen2_CreateSession } from '../src/engine/common/hexen2_profile.js';
import { Hexen2_EncodeSessionHello, Hexen2_DecodeSessionHello, Hexen2_CompareSessionHello } from '../src/engine/common/hexen2_wire.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'the private session preamble round-trips and refuses mismatches', () => {

	const session = Hexen2_CreateSession( { gameId: 'hexen2', contentRoot: 'owned-hexen2-base', gamecodeMode: 'installed', rules: 'classic' } );
	check( session.ok, session.reason );
	const encoded = Hexen2_EncodeSessionHello( { session: session.session, classId: 'paladin', progsCrc: 38488 } );
	check( encoded.ok, encoded.reason );
	check( encoded.bytes.length > 0 && encoded.bytes.length <= 160, 'the hello is bounded: ' + encoded.bytes.length );
	const decoded = Hexen2_DecodeSessionHello( encoded.bytes );
	check( decoded.ok, decoded.reason );
	const hello = decoded.hello;
	same( hello.gameId, 'hexen2', 'game id' );
	same( hello.gamecodeMode, 'installed', 'gamecode mode' );
	same( hello.rules, 'classic', 'rules preset' );
	same( hello.classNumber, 1, 'class number' );
	same( hello.progsCrc, 38488, 'gamecode CRC' );
	same( hello.fingerprint, session.session.digest, 'the simulation fingerprint' );

	// a Portal Succubus peer is a different session
	const portals = Hexen2_CreateSession( { gameId: 'hexen2-portals', contentRoot: 'owned-hexen2-portals', gamecodeMode: 'installed', rules: 'classic' } );
	const portalHello = Hexen2_DecodeSessionHello( Hexen2_EncodeSessionHello( { session: portals.session, classId: 'succubus', progsCrc: 26905 } ).bytes );
	check( portalHello.ok, portalHello.reason );
	same( portalHello.hello.gameId, 'hexen2-portals', 'the Portal game id' );
	same( portalHello.hello.classNumber, 5, 'the Succubus class number' );
	check( Hexen2_CompareSessionHello( hello, portalHello.hello ).ok === false, 'a Portal peer cannot join a base session' );
	check( Hexen2_CompareSessionHello( hello, hello ).ok, 'identical sessions match' );

	// truncation, foreign protocol/version, unknown field values, bad fingerprint and bad CRC are all refused
	check( Hexen2_DecodeSessionHello( encoded.bytes.subarray( 0, 3 ) ).ok === false, 'truncated' );
	check( Hexen2_DecodeSessionHello( new Uint8Array( 200 ) ).ok === false, 'oversized' );
	const foreign = encoded.bytes.slice(); foreign[ 0 ] = 20; check( Hexen2_DecodeSessionHello( foreign ).ok === false, 'foreign protocol' );
	const badVersion = encoded.bytes.slice(); badVersion[ 3 ] = 'X'.charCodeAt( 0 ); check( Hexen2_DecodeSessionHello( badVersion ).ok === false, 'foreign version' );
	const badField = encoded.bytes.slice(); badField[ 3 + 17 ] = 99; check( Hexen2_DecodeSessionHello( badField ).ok === false, 'unknown mode' );
	const badClass = encoded.bytes.slice(); badClass[ 3 + 17 + 2 ] = 0; check( Hexen2_DecodeSessionHello( badClass ).ok === false, 'invalid class' );
	const badFingerprint = encoded.bytes.slice(); badFingerprint[ badFingerprint.length - 1 ] = 0; check( Hexen2_DecodeSessionHello( badFingerprint ).ok === false, 'malformed fingerprint' );
	check( Hexen2_EncodeSessionHello( { session: session.session, classId: 'paladin', progsCrc: -1 } ).ok === false, 'invalid CRC' );
	check( Hexen2_EncodeSessionHello( { session: session.session, classId: 'succubus', progsCrc: 38488 } ).ok === false, 'the base edition refuses the Succubus' );

} );
