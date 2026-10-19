// Native Hexen II signon messages: svc_serverinfo (protocol, clients, game type, level name, model/sound precache
// lists), svc_signonnum and svc_setview round-trip; unsupported protocols, bad counts, truncation and trailing bytes
// are refused. G1 signon codec foundation for the private client.
import { Hexen2_WriteServerinfo, Hexen2_ReadServerinfo, Hexen2_WriteSignonNum, Hexen2_ReadSignonNum, Hexen2_WriteSetView, Hexen2_ReadSetView } from '../src/engine/common/hexen2_signon.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'the native signon messages round-trip and refuse malformed data', () => {

	const info = { protocol: 1019, maxClients: 1, gameType: 0, levelName: 'demo1',
		models: [ 'maps/demo1.bsp', 'models/paladin.mdl', '*1' ], sounds: [ 'misc/bellring.wav' ] };
	const written = Hexen2_WriteServerinfo( info );
	check( written.ok, written.reason );
	const read = Hexen2_ReadServerinfo( written.bytes );
	check( read.ok, read.reason );
	same( read.info.protocol, 1019, 'the private protocol' );
	same( read.info.maxClients, 1, 'max clients' );
	same( read.info.gameType, 0, 'game type' );
	same( read.info.levelName, 'demo1', 'the level name' );
	same( read.info.models.join( ',' ), 'maps/demo1.bsp,models/paladin.mdl,*1', 'the model precache list' );
	same( read.info.sounds.join( ',' ), 'misc/bellring.wav', 'the sound precache list' );

	// native demo protocols are recognised only when asked for
	same( Hexen2_ReadServerinfo( written.bytes ).ok, true, 'the private protocol by default' );
	const demo = Hexen2_WriteServerinfo( { ...info, protocol: 18 } );
	check( demo.ok, demo.reason );
	check( Hexen2_ReadServerinfo( demo.bytes ).ok === false, '18 refused by default' );
	check( Hexen2_ReadServerinfo( demo.bytes, { protocols: [ 18, 19 ] } ).ok, '18 accepted for demo parsing' );

	const signon = Hexen2_WriteSignonNum( 2 );
	check( signon.ok, signon.reason );
	same( Hexen2_ReadSignonNum( signon.bytes ).number, 2, 'the signon stage' );
	const setview = Hexen2_WriteSetView( 1 );
	check( setview.ok, setview.reason );
	same( Hexen2_ReadSetView( setview.bytes ).entity, 1, 'the view entity' );

	// refusals
	check( Hexen2_ReadServerinfo( written.bytes.subarray( 0, written.bytes.length - 2 ) ).ok === false, 'a truncated precache list' );
	check( Hexen2_ReadServerinfo( Uint8Array.from( [ ...written.bytes, 0 ] ) ).ok === false, 'trailing serverinfo bytes' );
	check( Hexen2_WriteServerinfo( { ...info, maxClients: 0 } ).ok === false, 'zero clients' );
	check( Hexen2_WriteServerinfo( { ...info, gameType: 2 } ).ok === false, 'an invalid game type' );
	check( Hexen2_WriteSignonNum( 5 ).ok === false, 'signon stage 5' );
	check( Hexen2_ReadSignonNum( Uint8Array.from( [ 25, 0 ] ) ).ok === false, 'signon stage 0' );
	check( Hexen2_WriteSetView( - 1 ).ok === false, 'a negative view entity' );

} );
