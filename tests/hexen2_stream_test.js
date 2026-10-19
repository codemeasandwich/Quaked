// The private player-channel datagram: svc_time + svc_clientdata (+ svc_update_inv when stats changed), written with
// the native bodies and parsed by opcode with refusal of unknown/truncated/trailing data. Peer transport and the
// entity/effect stream are still out of scope. G1 codec foundation.
import { Hexen2_WritePrivateDatagram, Hexen2_ParsePrivateDatagram } from '../src/engine/common/hexen2_stream.js';
import { SU, Hexen2_SC2 } from '../src/engine/common/hexen2_clientdata.js';
import { Hexen2_WriteParticle, Hexen2_WriteParticle4 } from '../src/engine/common/hexen2_effects.js';
import { Hexen2_WriteSound, Hexen2_WriteStopSound } from '../src/engine/common/hexen2_soundwire.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'a private player datagram round-trips and refuses malformed streams', () => {

	const player = { v: { view_ofs: [ 0, 0, 50 ], idealpitch: 0, idealroll: 0, punchangle: [ 0, 0, 0 ],
		velocity: [ 0, 0, 0 ], weaponframe: 3, armorvalue: 5, health: 85, bluemana: 42, max_mana: 90,
		puzzle_inv1: 0 } };
	const mask = ( 1n << 0n ) | ( 1n << 7n ) | Hexen2_SC2( 20 );
	const written = Hexen2_WritePrivateDatagram( player, { time: 12.5, weaponModelIndex: 2, statsMask: mask } );
	check( written.ok, written.reason );
	const parsed = Hexen2_ParsePrivateDatagram( written.bytes );
	check( parsed.ok, parsed.reason );
	same( parsed.time, 12.5, 'server time' );
	same( parsed.clientdata.viewheight, 50, 'the view height' );
	same( parsed.clientdata.weaponframe, 3, 'weapon frame' );
	same( parsed.clientdata.armorvalue, 5, 'armour' );
	same( parsed.clientdata.weaponModelIndex, 2, 'weapon model' );
	same( parsed.stats.health, 85, 'health from the stat delta' );
	same( parsed.stats.bluemana, 42, 'blue mana' );
	same( parsed.stats.max_mana, 90, 'max mana (SC2)' );
	same( parsed.statsMask, mask, 'the stat mask' );

	// a datagram with no stat delta parses the clientdata only
	const plain = Hexen2_WritePrivateDatagram( player, { time: 1, bits: SU.VIEWHEIGHT } );
	check( plain.ok, plain.reason );
	const plainParsed = Hexen2_ParsePrivateDatagram( plain.bytes );
	check( plainParsed.ok, plainParsed.reason );
	same( plainParsed.clientdata.viewheight, 50, 'the minimal datagram view height' );
	check( plainParsed.stats === undefined, 'no stats in the minimal datagram' );

	// effects and sounds are appended as their native messages and parsed in order
	const messages = [
		Hexen2_WriteParticle( { origin: [ 1, 2, 3 ], direction: [ 1, 0, 0 ], color: 7, count: 4 } ),
		Hexen2_WriteSound( { entity: 1, channel: 0, soundNum: 12, origin: [ 4, 5, 6 ], volume: 200, attenuation: 2 } ).bytes,
		Hexen2_WriteParticle4( { origin: [ 7, 8, 9 ], radius: 16, color: 300, effect: 3, count: 6 } ),
		Hexen2_WriteStopSound( { entity: 2, channel: 1 } ).bytes
	];
	const withEffects = Hexen2_WritePrivateDatagram( player, { time: 2, bits: SU.VIEWHEIGHT, messages } );
	check( withEffects.ok, withEffects.reason );
	const effectParsed = Hexen2_ParsePrivateDatagram( withEffects.bytes );
	check( effectParsed.ok, effectParsed.reason );
	same( effectParsed.effects.length, 4, 'four effect messages' );
	same( effectParsed.effects.map( e => e.kind ).join( ',' ), 'particle,sound,particle4,stopsound', 'the native order' );
	same( effectParsed.effects[ 1 ].data.soundNum, 12, 'the sound number' );
	same( effectParsed.effects[ 2 ].data.radius, 16, 'the particle4 radius' );
	same( effectParsed.effects[ 3 ].data.entity, 2, 'the stopped entity' );
	check( Hexen2_WritePrivateDatagram( player, { time: 1, messages: [ Uint8Array.from( [ 200 ] ) ] } ).ok, 'an unknown message is appended and refused on parse' );
	check( Hexen2_ParsePrivateDatagram( Hexen2_WritePrivateDatagram( player, { time: 1, messages: [ Uint8Array.from( [ 200 ] ) ] } ).bytes ).ok === false, 'unknown effect opcode refused' );
	check( Hexen2_ParsePrivateDatagram( Uint8Array.from( [ ...withEffects.bytes, 200 ] ) ).ok === false, 'trailing unknown effect refused' );

	// refusals: wrong first opcode, truncated clientdata/time, unknown opcode after the body, trailing garbage
	const wrong = written.bytes.slice(); wrong[ 0 ] = 99;
	check( Hexen2_ParsePrivateDatagram( wrong ).ok === false, 'wrong first opcode' );
	check( Hexen2_ParsePrivateDatagram( written.bytes.subarray( 0, 3 ) ).ok === false, 'truncated time' );
	check( Hexen2_ParsePrivateDatagram( written.bytes.subarray( 0, 7 ) ).ok === false, 'truncated clientdata' );
	const unknown = written.bytes.slice(); 
	// find the svc_update_inv opcode (49) that follows the clientdata body and corrupt it
	for ( let i = 6; i < unknown.length; i ++ ) if ( unknown[ i ] === 49 ) { unknown[ i ] = 200; break; }
	check( Hexen2_ParsePrivateDatagram( unknown ).ok === false, 'unknown opcode after clientdata' );
	check( Hexen2_ParsePrivateDatagram( Uint8Array.from( [ ...plain.bytes, 7 ] ) ).ok === false, 'trailing bytes' );

} );
