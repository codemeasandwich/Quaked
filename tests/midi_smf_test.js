import { MIDI_ParseSMF } from '../src/engine/sound/midi_smf.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const near = ( a, b ) => check( Math.abs( a - b ) < 1e-8, `${a} != ${b}` );
const throws = fn => { try { fn(); } catch { return; } throw new Error( 'expected rejection' ); };
const u32 = n => [ n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255 ];
const end = [ 0,255,47,0 ];
function smf( tracks, division = 96, format = tracks.length === 1 ? 0 : 1 ) {

	return new Uint8Array( [ 77,84,104,100,0,0,0,6,0,format,0,tracks.length,division >>> 8,division & 255,
		...tracks.flatMap( t => [ 77,84,114,107,...u32( t.length ),...t ] ) ] );

}

Deno.test( 'SMF tempo map, running status, one-byte messages and velocity-zero note-off', () => {

	const song = MIDI_ParseSMF( smf( [ [ 0,192,40,0,144,60,100,96,62,80,0,255,81,3,15,66,64,96,62,0,...end ] ] ) );
	check( song.format === 0 && song.events.length === 4, 'channel events only' );
	check( song.events[ 0 ].type === 'program' && song.events[ 0 ].program === 40, 'one byte program' );
	near( song.events[ 2 ].time, .5 ); near( song.events[ 3 ].time, 1.5 );
	check( song.events[ 3 ].type === 'noteOff', 'velocity-zero becomes off' );
	near( song.duration, 1.5 );

} );

Deno.test( 'SMF format 1 merges tracks with the global tempo map and stable equal-tick ordering', () => {

	const song = MIDI_ParseSMF( smf( [ [ 96,255,81,3,15,66,64,...end ], [ 0,144,60,100,96,128,60,0,96,144,64,100,...end ] ] ) );
	near( song.events[ 1 ].time, .5 ); near( song.events[ 2 ].time, 1.5 );
	const tied = MIDI_ParseSMF( smf( [ [ 0,192,10,...end ], [ 0,144,60,100,...end ] ] ) );
	check( tied.events[ 0 ].type === 'program' && tied.events[ 1 ].type === 'noteOn', 'stable track order' );

} );

Deno.test( 'SMF skips sysex and metadata, accepts offset views, honours EOT and SMPTE divisions', () => {

	for ( const fps of [ 24,25,29,30 ] ) {

		const bytes = smf( [ [ 0,240,3,1,2,247,0,255,1,2,65,66,0,144,60,100,100,128,60,0,...end,0,144,70,100 ] ], ( ( 256 - fps ) << 8 ) | 10 );
		const offset = new Uint8Array( bytes.length + 7 ); offset.set( bytes, 7 );
		const song = MIDI_ParseSMF( offset.subarray( 7 ) );
		check( song.events.length === 2, 'skips meta/sysex and stops at EOT' );
		near( song.duration, 100 / ( ( fps === 29 ? 30000 / 1001 : fps ) * 10 ) );

	}

} );

Deno.test( 'SMF rejects truncated chunks, invalid division/format/status/data and oversized VLQ', () => {

	throws( () => MIDI_ParseSMF( new Uint8Array( 5 ) ) );
	throws( () => MIDI_ParseSMF( smf( [ end ], 0 ) ) );
	throws( () => MIDI_ParseSMF( smf( [ end ], 96, 2 ) ) );
	throws( () => MIDI_ParseSMF( smf( [ end ], 0xe601 ) ) );
	throws( () => MIDI_ParseSMF( smf( [ [ 0,60,100,...end ] ] ) ) );
	throws( () => MIDI_ParseSMF( smf( [ [ 0,144,60,255,...end ] ] ) ) );
	throws( () => MIDI_ParseSMF( smf( [ [ 128,128,128,128,0,...end ] ] ) ) );
	throws( () => MIDI_ParseSMF( smf( [ [ 0,240,127,1 ] ] ) ) );
	throws( () => MIDI_ParseSMF( smf( [ end ] ).subarray( 0, 23 ) ) );

} );
