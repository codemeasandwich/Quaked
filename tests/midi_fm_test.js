import { MIDI_RenderFM, MIDI_EncodeWAV } from '../src/engine/sound/midi_fm.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const ev = ( time, type, rest = {} ) => ( { time, type, channel: 0, ...rest } );
const on = ev( 0, 'noteOn', { note: 60, velocity: 100 } );
const off = ev( .1, 'noteOff', { note: 60 } );
const render = events => MIDI_RenderFM( { events, duration: 1.5 } );
const energy = ( pcm, start, end ) => pcm.left.subarray( Math.floor( start * pcm.sampleRate ), Math.floor( end * pcm.sampleRate ) ).reduce( ( sum, x ) => sum + x * x, 0 );
const difference = ( a, b ) => a.left.some( ( x, i ) => x !== b.left[ i ] );

Deno.test( 'FM stereo is non-silent, bounded and deterministic, with correct PCM WAV headers', () => {

	const events = [ on,ev( .2, 'noteOn', { channel: 9, note: 38, velocity: 127 } ),ev( 1, 'noteOff', { note: 60 } ) ];
	const a = render( events ), b = render( events );
	check( a.sampleRate === 22050 && energy( a, 0, 1 ) > 1, 'audible PCM at 22050 Hz' );
	check( ! difference( a, b ) && a.right.every( ( x, i ) => x === b.right[ i ] ), 'seeded deterministic output' );
	check( a.left.every( x => Number.isFinite( x ) && Math.abs( x ) <= 1 ) && a.right.every( x => Number.isFinite( x ) && Math.abs( x ) <= 1 ), 'bounded finite stereo' );
	const wav = MIDI_EncodeWAV( a ), view = new DataView( wav.buffer );
	check( new TextDecoder().decode( wav.subarray( 0, 4 ) ) === 'RIFF' && new TextDecoder().decode( wav.subarray( 8, 12 ) ) === 'WAVE', 'RIFF WAVE' );
	check( view.getUint16( 22, true ) === 2 && view.getUint32( 24, true ) === 22050 && view.getUint16( 34, true ) === 16, '16-bit stereo PCM' );
	check( wav.length === 44 + a.left.length * 4 && view.getUint32( 40, true ) === a.left.length * 4, 'exact data size' );
	let fingerprint = 2166136261;
	for ( const byte of wav ) fingerprint = Math.imul( fingerprint ^ byte, 16777619 ) >>> 0;
	check( fingerprint === 0x6e5a13cb, 'fixed PCM/noise fingerprint: ' + fingerprint.toString( 16 ) );

} );

Deno.test( 'FM pitch-bend endpoints transpose exactly two semitones and overlapping keys release FIFO', () => {

	const organ = ev( 0, 'program', { program: 16 } );
	for ( const [ value, note ] of [ [ 0,58 ],[ 16383,62 ] ] ) {

		const bent = render( [ organ,ev( 0, 'pitchBend', { value } ),on ] );
		const transposed = render( [ organ,{ ...on,note } ] );
		const error = bent.left.subarray( 0, 2205 ).reduce( ( sum, sample, i ) => sum + ( sample - transposed.left[ i ] ) ** 2, 0 );
		check( error < .00001, 'two-semitone bend endpoint ' + value );

	}
	const overlapping = render( [ organ,on,{ ...on,time: .05 },off,ev( .8, 'noteOff', { note: 60 } ) ] );
	check( energy( overlapping, .5, .7 ) > 1 && energy( overlapping, 1.3, 1.5 ) === 0, 'second same-key voice survives first note-off' );
	const pedalAll = render( [ organ,on,ev( .05, 'control', { controller: 64, value: 127 } ),
		ev( .1, 'control', { controller: 123, value: 0 } ),ev( .8, 'control', { controller: 64, value: 0 } ) ] );
	check( energy( pedalAll, .5, .7 ) > 1 && energy( pedalAll, 1.3, 1.5 ) === 0, 'all-notes-off honours sustain until pedal up' );

} );

Deno.test( 'FM note-off releases, pedal holds until up, all-notes-off releases and all-sound-off silences', () => {

	const organ = ev( 0, 'program', { program: 16 } );
	const released = render( [ organ,on,off ] );
	const held = render( [ organ,on,ev( .05, 'control', { controller: 64, value: 127 } ),off,ev( .8, 'control', { controller: 64, value: 0 } ) ] );
	check( energy( released, .5, .7 ) === 0 && energy( held, .5, .7 ) > 1 && energy( held, 1.3, 1.5 ) === 0, 'pedal gates release' );
	const all = render( [ organ,on,ev( .1, 'control', { controller: 123, value: 0 } ) ] );
	check( energy( all, .5, 1 ) === 0, 'all-notes-off releases' );
	const hard = render( [ organ,on,ev( .1, 'control', { controller: 120, value: 0 } ) ] );
	check( energy( hard, .1, 1 ) === 0, 'all-sound-off immediate' );

} );

Deno.test( 'FM honours live volume, expression, pan, pitch bend, velocity and program families', () => {

	for ( const controller of [ 7,11 ] ) {

		const pcm = render( [ on,ev( .1, 'control', { controller, value: 0 } ) ] );
		check( energy( pcm, .2, 1 ) === 0 && energy( pcm, 0, .1 ) > 0, 'live controller ' + controller );

	}
	const pan = render( [ ev( 0, 'control', { controller: 10, value: 0 } ),on ] );
	check( pan.right.every( x => x === 0 ) && energy( pan, 0, 1 ) > 0, 'hard left pan' );
	const straight = render( [ on ] );
	check( difference( straight, render( [ on,ev( .1, 'pitchBend', { value: 16383 } ) ] ) ), 'live pitch bend' );
	check( energy( render( [ { ...on,velocity: 30 } ] ), 0, .1 ) < energy( straight, 0, .1 ), 'velocity' );
	const fingerprints = new Set();
	for ( let family = 0; family < 16; family ++ ) {

		const pcm = render( [ ev( 0, 'program', { program: family * 8 } ),on ] );
		fingerprints.add( Array.from( pcm.left.subarray( 100, 150 ) ).join( ',' ) );

	}
	check( fingerprints.size === 16, '16 distinct procedural families' );
	for ( const note of [ 36,38,42,45,49,51,81 ] ) check( energy( render( [ { ...on,channel: 9,note } ] ), 0, .1 ) > 0, 'percussion ' + note );

} );

Deno.test( 'FM bounds allocation and steals voices deterministically', () => {

	const events = Array.from( { length: 100 }, ( _, i ) => ( { ...on,note: 20 + i } ) );
	const a = MIDI_RenderFM( { events, duration: .1 }, { polyphony: 8 } );
	check( a.peakVoices === 8 && a.left.every( x => Math.abs( x ) <= 1 ), 'bounded polyphony' );
	for ( const song of [ { duration: Infinity,events: [] },{ duration: 1000000,events: [] },{ duration: -1,events: [] } ] ) {

		let failed = false; try { MIDI_RenderFM( song ); } catch { failed = true; }
		check( failed, 'refuse invalid duration before allocation' );

	}

} );
