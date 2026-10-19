// Native Hexen II player message bodies: svc_clientdata and svc_update_inv encode/decode with the pinned Raven field
// order and masks, including view/punch/velocity quantisation, stat deltas, puzzle strings and truncation refusal.
// These are the message bodies a private Hexen stream carries after the session preamble. G1 codec foundation.
import { Hexen2_EncodeClientdata, Hexen2_DecodeClientdata, Hexen2_EncodeUpdateInv, Hexen2_DecodeUpdateInv, SU, Hexen2_SC2 } from '../src/engine/common/hexen2_clientdata.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m ) => check( Math.abs( a - b ) < 0.001, `${m}: ${a} != ${b}` );

Deno.test( 'native clientdata round-trips its view, punch, velocity and weapon fields', () => {

	const player = { v: { view_ofs: [ 0, 0, 50 ], idealpitch: - 5, idealroll: 3, punchangle: [ 1, - 2, 3 ],
		velocity: [ 160, - 32, 16 ], weaponframe: 7, armorvalue: 9 } };
	const body = Hexen2_EncodeClientdata( player, { weaponModelIndex: 3 } );
	const decoded = Hexen2_DecodeClientdata( body );
	check( decoded.ok, decoded.reason );
	const cd = decoded.clientdata;
	same( cd.viewheight, 50, 'view height' );
	same( cd.idealpitch, - 5, 'ideal pitch (signed byte)' );
	same( cd.idealroll, 3, 'ideal roll' );
	same( cd.punch.join( ',' ), '1,-2,3', 'punch angles' );
	same( cd.velocity.join( ',' ), '160,-32,16', 'velocity is sent /16 and restored' );
	same( cd.weaponframe, 7, 'weapon frame' );
	same( cd.armorvalue, 9, 'armour value' );
	same( cd.weaponModelIndex, 3, 'weapon model index' );
	same( cd.onGround, true, 'the on-ground bit' );

	// a bits subset writes only those fields; truncation and trailing bytes are refused
	const small = Hexen2_EncodeClientdata( player, { bits: SU.ONGROUND | SU.IDEALROLL } );
	const smallDecoded = Hexen2_DecodeClientdata( small );
	check( smallDecoded.ok, smallDecoded.reason );
	same( smallDecoded.clientdata.idealroll, 3, 'the subset roll' );
	same( smallDecoded.clientdata.viewheight, undefined, 'the omitted view height is absent' );
	check( Hexen2_DecodeClientdata( body.subarray( 0, body.length - 1 ) ).ok === false, 'truncated clientdata' );
	check( Hexen2_DecodeClientdata( Uint8Array.from( [ ...body, 0 ] ) ).ok === false, 'trailing clientdata' );

} );

Deno.test( 'native update_inv round-trips stat deltas, masks and puzzle strings', () => {

	const player = { v: { health: 85, level: 2, bluemana: 40, greenmana: 5, experience: 12345,
		armor_amulet: 4, max_health: 85, max_mana: 90, flags: 520, rings_active: 1,
		puzzle_inv1: 111, puzzle_inv2: 0 } };
	const mask = ( 1n << 0n ) | ( 1n << 1n ) | ( 1n << 7n ) | ( 1n << 9n ) | ( 1n << 31n ) |
		Hexen2_SC2( 1 ) | Hexen2_SC2( 11 ) | Hexen2_SC2( 19 ) | Hexen2_SC2( 20 ) | Hexen2_SC2( 21 );
	const body = Hexen2_EncodeUpdateInv( player, mask, offset => offset === 111 ? 'key1' : '' );
	const decoded = Hexen2_DecodeUpdateInv( body );
	check( decoded.ok, decoded.reason );
	same( decoded.mask, mask, 'the delta mask' );
	same( decoded.stats.health, 85, 'health (short)' );
	same( decoded.stats.level, 2, 'level' );
	same( decoded.stats.bluemana, 40, 'blue mana' );
	same( decoded.stats.experience, 12345, 'experience (long)' );
	same( decoded.stats.armor_amulet, 4, 'amulet (SC2)' );
	same( decoded.stats.max_health, 85, 'max health (short)' );
	same( decoded.stats.max_mana, 90, 'max mana' );
	near( decoded.stats.flags, 520, 'flags (float)' );
	near( decoded.stats.rings_active, 1, 'rings active (float)' );
	same( decoded.stats.puzzle_inv1, 'key1', 'puzzle key string' );

	// the mask byte is only sent when one of its eight bits is present: health+level share the first byte
	const tiny = Hexen2_DecodeUpdateInv( Hexen2_EncodeUpdateInv( player, ( 1n << 0n ) | ( 1n << 1n ) ) );
	check( tiny.ok, tiny.reason );
	same( tiny.mask, 3n, 'the first SC1 byte mask' );
	check( Hexen2_DecodeUpdateInv( Hexen2_EncodeUpdateInv( player, 1n << 31n ) ).mask === ( 1n << 31n ), 'a high SC1 bit sets its own mask byte' );
	check( Hexen2_DecodeUpdateInv( body.subarray( 0, 2 ) ).ok === false, 'truncated update_inv' );
	check( Hexen2_DecodeUpdateInv( Uint8Array.from( [ ...body, 0 ] ) ).ok === false, 'trailing update_inv' );

} );
