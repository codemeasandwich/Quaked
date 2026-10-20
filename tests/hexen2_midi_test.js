import { MIDI_ParseSMF } from '../src/engine/sound/midi_smf.js';
import { MIDI_RenderFM, MIDI_EncodeWAV } from '../src/engine/sound/midi_fm.js';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const chunk = ( tag, bytes ) => [ ...Array.from( tag, c => c.charCodeAt( 0 ) ), ...[ 24, 16, 8, 0 ].map( n => bytes.length >>> n & 255 ), ...bytes ];
export const smf = ( tracks, division = 96 ) => new Uint8Array( [ ...chunk( 'MThd', [ 0, tracks.length > 1 ? 1 : 0, 0, tracks.length, division >> 8, division & 255 ] ), ...tracks.flatMap( t => chunk( 'MTrk', t ) ) ] );
const track = [ 0, 0x90, 60, 100, 96, 0x80, 60, 0, 0, 0xff, 0x2f, 0 ];
Deno.test( 'SMF tempo map, running status and format 1 merge use seconds', () => {
	const song = MIDI_ParseSMF( smf( [ [ 0, 0xff, 0x51, 3, 7, 161, 32, 96, 0xff, 0x51, 3, 15, 66, 64, 96, 0xff, 0x2f, 0 ],
		[ 0, 0x90, 60, 100, 96, 64, 80, 96, 0x80, 60, 0, 0, 64, 0, 0, 0xff, 0x2f, 0 ] ] ) );
	const notes = song.events.filter( e => e.type === 'noteOn' );
	check( notes.length === 2 && notes[ 1 ].note === 64 && notes[ 1 ].time === 0.5, 'running status survives delta, merged tempo track' );
	check( song.duration === 1.5 && song.events.at( - 1 ).time === 1.5, 'second tempo applies after its tick' );
} );
Deno.test( 'SMF SMPTE, sysex, meta and malformed bounds', () => {
	const song = MIDI_ParseSMF( smf( [ [ 0, 0xf0, 2, 1, 0xf7, 0, 0xff, 1, 1, 65, ...track ] ], 0xe728 ) );
	check( song.duration === 96 / 1000, '25 fps, 40 ticks per frame' );
	for ( const bytes of [ new Uint8Array(), smf( [ [ 0, 60, 80 ] ] ), smf( [ [ 0, 0x90, 60 ] ] ), smf( [ track ], 0 ) ] ) {
		let failed = false; try { MIDI_ParseSMF( bytes ); } catch { failed = true; }
		check( failed, 'malformed input rejected' );
	}
} );
Deno.test( 'FM PCM is stereo, audible, bounded, deterministic and WAV encoded', () => {
	const song = MIDI_ParseSMF( smf( [ track ] ) );
	const a = MIDI_RenderFM( song ), b = MIDI_RenderFM( song );
	check( a.sampleRate === 22050 && a.left.length === a.right.length, 'stereo 22050 Hz' );
	check( a.left.some( n => Math.abs( n ) > 0.01 ), 'audible' );
	check( a.left.every( ( n, i ) => Number.isFinite( n ) && Math.abs( n ) <= 1 && n === b.left[ i ] ), 'bounded and deterministic' );
	const wav = MIDI_EncodeWAV( a ), view = new DataView( wav.buffer );
	check( view.getUint32( 0 ) === 0x52494646 && view.getUint16( 22, true ) === 2 && view.getUint32( 24, true ) === 22050, 'PCM WAV header' );
	check( wav.byteLength === 44 + a.left.length * 4, '16 bit payload' );
} );
Deno.test( 'FM note-off releases and sustain holds until pedal up', () => {
	const render = sustain => MIDI_RenderFM( { duration: 2, events: [
		{ time: 0, type: 'program', channel: 0, program: 16 },
		{ time: 0, type: 'control', channel: 0, controller: 64, value: sustain ? 127 : 0 },
		{ time: 0, type: 'noteOn', channel: 0, note: 60, velocity: 100 },
		{ time: 0.2, type: 'noteOff', channel: 0, note: 60 },
		{ time: 1, type: 'control', channel: 0, controller: 64, value: 0 } ] } );
	const a = render( false ), b = render( true );
	const energy = ( pcm, t ) => pcm.left.slice( t * 22050, ( t + 0.1 ) * 22050 ).reduce( ( s, n ) => s + n * n, 0 );
	check( energy( a, 0.8 ) === 0 && energy( b, 0.8 ) > 1, 'released note dies; pedal holds it' );
	check( energy( b, 1.8 ) === 0, 'pedal up releases the held note' );
} );
