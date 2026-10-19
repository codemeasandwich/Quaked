// Native start/end effect messages: the CE_* types and their pinned SV_SendEffect bodies round-trip; the smoke frame
// field follows the protocol; unknown types, truncation and trailing bytes are refused. G1 effect codec.
import { Hexen2_WriteStartEffect, Hexen2_ReadStartEffect, Hexen2_WriteEndEffect, Hexen2_ReadEndEffect, CE } from '../src/engine/common/hexen2_effectwire.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'native start/end effect messages round-trip across their groups', () => {

	const cases = [
		{ type: CE.QUAKE, params: { origin: [ 10, 20, 30 ], radius: 400 } },
		{ type: CE.FOUNTAIN, params: { pos: [ 1, 2, 3 ], angle: [ 0, 90, 180 ], movedir: [ 4, 5, 6 ], color: 7, cnt: 8 } },
		{ type: CE.RAIN, params: { minOrg: [ 1, 2, 3 ], maxOrg: [ 4, 5, 6 ], eSize: [ 7, 8, 9 ], dir: [ 10, 11, 12 ], color: 13, count: 14, wait: 0.5 } },
		{ type: CE.SNOW, params: { minOrg: [ 1, 2, 3 ], maxOrg: [ 4, 5, 6 ], flags: 2, dir: [ 7, 8, 9 ], count: 40 } },
		{ type: CE.WHITE_SMOKE, params: { origin: [ 1, 2, 3 ], velocity: [ 4, 5, 6 ], framelength: 0.1, frame: 2 } },
		{ type: CE.FLAMESTREAM, params: { origin: [ 1, 2, 3 ], velocity: [ 4, 5, 6 ], framelength: 0.05, frame: 1 } },
		{ type: CE.WHITE_FLASH, params: { origin: [ 1, 2, 3 ] } },
		{ type: CE.GRAVITYWELL, params: { origin: [ 1, 2, 3 ], color: 300, lifetime: 2 } },
		{ type: CE.TELEPORTERBODY, params: { origin: [ 1, 2, 3 ], velocity: [ 4, 5, 6 ], skinnum: 9 } },
		{ type: CE.BONESHARD, params: { origin: [ 1, 2, 3 ], velocity: [ 4, 5, 6 ], angle: [ 7, 8, 9 ], avelocity: [ 10, 11, 12 ] } },
		{ type: CE.CHUNK, params: { origin: [ 1, 2, 3 ], type: 18, srcVel: [ 4, 5, 6 ], numChunks: 3 } },
		{ type: CE.SM_EXPLOSION, params: { origin: [ 1, 2, 3 ] } }
	];
	for ( const [ index, test ] of cases.entries() ) {

		const written = Hexen2_WriteStartEffect( { index, type: test.type, params: test.params } );
		check( written.ok, `type ${test.type}: ` + written.reason );
		const read = Hexen2_ReadStartEffect( written.bytes );
		check( read.ok, `type ${test.type}: ` + read.reason );
		same( read.index, index, `type ${test.type} slot` );
		same( read.type, test.type, 'the type' );
		if ( test.params.origin ) check( Math.abs( read.params.origin[ 0 ] - test.params.origin[ 0 ] ) < 0.2, `type ${test.type} origin` );

	}
	// smoke frame is omitted for protocol 18
	const smoke18 = Hexen2_WriteStartEffect( { index: 3, type: CE.WHITE_SMOKE, protocol: 18,
		params: { origin: [ 1, 2, 3 ], velocity: [ 4, 5, 6 ], framelength: 0.1, frame: 2 } } );
	const read18 = Hexen2_ReadStartEffect( smoke18.bytes, { protocol: 18 } );
	check( read18.ok, read18.reason );
	same( read18.params.frame, undefined, 'no frame field on protocol 18' );

	const end = Hexen2_ReadEndEffect( Hexen2_WriteEndEffect( 9 ).bytes );
	check( end.ok, end.reason );
	same( end.index, 9, 'the ended effect slot' );
	check( Hexen2_WriteStartEffect( { index: 0, type: 99, params: {} } ).ok === false, 'unknown type refused' );
	const full = Hexen2_WriteStartEffect( { index: 1, type: CE.QUAKE, params: { origin: [ 1, 2, 3 ], radius: 1 } } ).bytes;
	check( Hexen2_ReadStartEffect( full.subarray( 0, full.length - 1 ) ).ok === false, 'truncated effect' );
	check( Hexen2_ReadStartEffect( Uint8Array.from( [ ...full, 0 ] ) ).ok === false, 'trailing effect bytes' );

} );
