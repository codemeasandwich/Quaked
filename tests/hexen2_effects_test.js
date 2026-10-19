// Native Hexen II particle messages: svc_particle/particle2/3/4 encode and decode with the pinned Raven wire format —
// 1/8-unit origin shorts, 1/16-unit clamped direction bytes, particle2 float boxes, color/count/effect — and refuse
// truncation, trailing bytes and an unknown opcode. G1 effect codec foundation.
import { Hexen2_WriteParticle, Hexen2_WriteParticle2, Hexen2_WriteParticle3, Hexen2_WriteParticle4, Hexen2_ReadParticle } from '../src/engine/common/hexen2_effects.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m ) => check( Math.abs( a - b ) < 0.001, `${m}: ${a} != ${b}` );

Deno.test( 'all four native particle messages round-trip and refuse malformed bodies', () => {

	const origin = [ 10.125, - 3.5, 64 ];
	const one = Hexen2_ReadParticle( Hexen2_WriteParticle( { origin, direction: [ 1, - 1, 0.5 ], color: 7, count: 9 } ) );
	check( one.ok, one.reason );
	same( one.kind, 'particle', 'particle opcode' );
	near( one.effect.origin[ 0 ], 10.125, 'origin x at 1/8 unit' );
	near( one.effect.origin[ 1 ], - 3.5, 'origin y' );
	same( one.effect.direction.join( ',' ), '1,-1,0.5', 'directions at 1/16 unit' );
	same( one.effect.count, 9, 'count' );
	same( one.effect.color, 7, 'colour' );

	const two = Hexen2_ReadParticle( Hexen2_WriteParticle2( { origin, directionMin: [ - 1, - 2, - 3 ], directionMax: [ 1, 2, 3 ], color: 300, effect: 4, count: 5 } ) );
	check( two.ok, two.reason );
	same( two.kind, 'particle2', 'particle2 opcode' );
	same( two.effect.directionMin.join( ',' ), '-1,-2,-3', 'the float direction box minimum' );
	same( two.effect.directionMax.join( ',' ), '1,2,3', 'the float direction box maximum' );
	same( two.effect.color, 300, 'a 16-bit colour' );
	same( two.effect.effect, 4, 'the effect id' );

	const three = Hexen2_ReadParticle( Hexen2_WriteParticle3( { origin, box: [ 8, 16, 24 ], color: 12, effect: 2, count: 3 } ) );
	check( three.ok, three.reason );
	same( three.kind, 'particle3', 'particle3 opcode' );
	same( three.effect.box.join( ',' ), '8,16,24', 'the box bytes' );

	const four = Hexen2_ReadParticle( Hexen2_WriteParticle4( { origin, radius: 32, color: 14, effect: 6, count: 20 } ) );
	check( four.ok, four.reason );
	same( four.kind, 'particle4', 'particle4 opcode' );
	same( four.effect.radius, 32, 'the radius byte' );
	same( four.effect.count, 20, 'count' );

	// direction clamping at ±127/128 and truncation/trailing/unknown refusal
	const clamped = Hexen2_ReadParticle( Hexen2_WriteParticle( { origin, direction: [ 100, - 100, 0 ], color: 1, count: 1 } ) );
	check( clamped.ok, clamped.reason );
	same( clamped.effect.direction[ 0 ], 127 / 16, 'the positive direction clamp' );
	same( clamped.effect.direction[ 1 ], - 128 / 16, 'the negative direction clamp' );
	const bytes = Hexen2_WriteParticle3( { origin, box: [ 1, 2, 3 ], color: 1, effect: 2, count: 3 } );
	check( Hexen2_ReadParticle( bytes.subarray( 0, bytes.length - 1 ) ).ok === false, 'truncated particle3' );
	check( Hexen2_ReadParticle( Uint8Array.from( [ ...bytes, 0 ] ) ).ok === false, 'trailing particle3 bytes' );
	check( Hexen2_ReadParticle( Uint8Array.from( [ 200, 0, 0 ] ) ).ok === false, 'unknown opcode' );

} );
