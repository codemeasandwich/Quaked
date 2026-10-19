// Native Hexen II sound messages: svc_sound (field mask, packed entity/channel, sound number with overflow, 1/8-unit
// origin), svc_stopsound and svc_sound_update_pos round-trip, with defaults omitted as native does; bad masks,
// channels, values, truncation and trailing bytes are refused. G1 sound/effect codec foundation.
import { Hexen2_WriteSound, Hexen2_WriteStopSound, Hexen2_WriteSoundUpdatePos, Hexen2_ReadSound } from '../src/engine/common/hexen2_soundwire.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m ) => check( Math.abs( a - b ) < 0.001, `${m}: ${a} != ${b}` );

Deno.test( 'native sound, stop and moving-position messages round-trip', () => {

	const full = Hexen2_WriteSound( { entity: 3, channel: 2, soundNum: 17, origin: [ 10.25, - 4.5, 32 ], volume: 200, attenuation: 2 } );
	check( full.ok, full.reason );
	const decoded = Hexen2_ReadSound( full.bytes );
	check( decoded.ok, decoded.reason );
	same( decoded.kind, 'sound', 'the sound kind' );
	same( decoded.sound.entity, 3, 'entity' );
	same( decoded.sound.channel, 2, 'channel' );
	same( decoded.sound.soundNum, 17, 'sound number' );
	same( decoded.sound.volume, 200, 'volume' );
	near( decoded.sound.attenuation, 2, 'attenuation restored from /64' );
	near( decoded.sound.origin[ 0 ], 10.25, 'origin x at 1/8 unit' );
	near( decoded.sound.origin[ 1 ], - 4.5, 'negative origin y' );

	// defaults are omitted: full volume and normal attenuation need no bytes
	const plain = Hexen2_WriteSound( { entity: 1, channel: 0, soundNum: 5, origin: [ 0, 0, 0 ] } );
	check( plain.ok, plain.reason );
	same( plain.bytes.length, 1 + 1 + 2 + 1 + 6, 'the default mask adds no volume/attenuation bytes' );
	const plainDecoded = Hexen2_ReadSound( plain.bytes );
	same( plainDecoded.sound.volume, 255, 'the default volume' );
	same( plainDecoded.sound.attenuation, 1, 'the default attenuation' );

	// a high sound number uses the overflow bit and is restored
	const overflow = Hexen2_WriteSound( { entity: 2, channel: 7, soundNum: 300, origin: [ 0, 0, 0 ] } );
	check( overflow.ok, overflow.reason );
	same( Hexen2_ReadSound( overflow.bytes ).sound.soundNum, 300, 'the overflowed sound number' );

	const stop = Hexen2_ReadSound( Hexen2_WriteStopSound( { entity: 9, channel: 4 } ).bytes );
	check( stop.ok, stop.reason );
	same( stop.kind, 'stopsound', 'the stop kind' );
	same( stop.sound.entity, 9, 'the stopped entity' );
	same( stop.sound.channel, 4, 'the stopped channel' );

	const moving = Hexen2_ReadSound( Hexen2_WriteSoundUpdatePos( { entity: 5, channel: 1, origin: [ 1, 2, 3 ] } ).bytes );
	check( moving.ok, moving.reason );
	same( moving.kind, 'sound_update_pos', 'the moving-position kind' );
	same( moving.sound.origin.join( ',' ), '1,2,3', 'the moving position' );

	// refusals
	check( Hexen2_WriteSound( { entity: 1, channel: 8, soundNum: 1, origin: [ 0, 0, 0 ] } ).ok === false, 'channel 8 refused' );
	check( Hexen2_WriteSound( { entity: 1, channel: 0, soundNum: 1, origin: [ 0, 0, 0 ], attenuation: 5 } ).ok === false, 'attenuation 5 refused' );
	check( Hexen2_ReadSound( full.bytes.subarray( 0, full.bytes.length - 1 ) ).ok === false, 'truncated sound' );
	check( Hexen2_ReadSound( Uint8Array.from( [ ...full.bytes, 0 ] ) ).ok === false, 'trailing sound bytes' );
	check( Hexen2_ReadSound( Uint8Array.from( [ 6, 0xff, 0, 1, 1, 0, 0, 0 ] ) ).ok === false, 'an unknown sound mask' );
	check( Hexen2_ReadSound( Uint8Array.from( [ 200 ] ) ).ok === false, 'an unknown opcode' );

} );
