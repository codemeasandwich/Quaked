/**
 * @module newer/sound/s_synth
 *
 * Short sounds made by the engine, for the add-on effects that need a sound stock Quake does not have (card
 * T-3faa98e3; the owner's ruling of 13 Oct 2026: generated fallback sounds through the existing sound cache and
 * mixer, a game's own file always winning). Each is made once, as the bytes of an ordinary WAV file, and handed to the
 * sound cache only when the game has no file of that name (`S_RegisterSoundFallback`, snd_mem.js), so it is resampled,
 * mixed, spatialised, looped and shut down exactly as a file would be.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `made` (the bytes made so far, by name) and `makers`.
 *
 * Errors: none raised here.
 */

/** The rate the sounds are made at (Quake's own 11025 Hz). */
export const SYNTH_RATE = 11025;

const made = new Map(), makers = new Map();

/**
 * The bytes of a mono 16-bit WAV file of `samples` (-1..1), with a cue point at `loopStart` when it loops (Quake's
 * looping sounds carry one: GetWavinfo, snd_mem.js).
 *
 * @param {Float32Array} samples the sound, -1..1
 * @param {number} [loopStart=-1] the sample the loop restarts at, or -1 for a sound that plays once
 * @param {number} [rate=SYNTH_RATE] samples a second
 * @returns {Uint8Array} the file
 */
export function SYNTH_Wav( samples, loopStart = - 1, rate = SYNTH_RATE ) {

	const cue = loopStart >= 0 ? 12 + 24 : 0, data = samples.length * 2;
	const out = new Uint8Array( 44 + cue + data ), v = new DataView( out.buffer );
	const tag = ( at, s ) => { for ( let i = 0; i < 4; i ++ ) out[ at + i ] = s.charCodeAt( i ); };
	tag( 0, 'RIFF' ); v.setUint32( 4, out.length - 8, true ); tag( 8, 'WAVE' );
	tag( 12, 'fmt ' ); v.setUint32( 16, 16, true ); v.setUint16( 20, 1, true ); v.setUint16( 22, 1, true );
	v.setUint32( 24, rate, true ); v.setUint32( 28, rate * 2, true ); v.setUint16( 32, 2, true ); v.setUint16( 34, 16, true );
	let at = 36;
	if ( cue ) {

		// one cue point: id 1 at sample `loopStart`
		tag( at, 'cue ' ); v.setUint32( at + 4, 4 + 24, true ); v.setUint32( at + 8, 1, true );
		v.setUint32( at + 12, 1, true ); v.setUint32( at + 16, loopStart, true ); tag( at + 20, 'data' );
		v.setUint32( at + 24, 0, true ); v.setUint32( at + 28, 0, true ); v.setUint32( at + 32, loopStart, true );
		at += cue;

	}
	tag( at, 'data' ); v.setUint32( at + 4, data, true );
	for ( let i = 0; i < samples.length; i ++ ) v.setInt16( at + 8 + i * 2, Math.round( Math.max( - 1, Math.min( 1, samples[ i ] ) ) * 32767 ), true );
	return out;

}

/** A random number generator that gives the same run from the same seed (mulberry32), so each sound is the same every time. */
export function SYNTH_Random( seed ) {

	let s = seed | 0;
	return () => { s = ( s + 0x6d2b79f5 ) | 0; let t = Math.imul( s ^ ( s >>> 15 ), 1 | s ); t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t; return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296; };

}

/**
 * Says how to make a sound: its name as the game asks for it (`ambience/lava1.wav`) and a function giving its WAV
 * bytes. Made on first use only.
 *
 * @param {string} name the sound's name, without `sound/`
 * @param {function(): Uint8Array} make
 */
export function SYNTH_Define( name, make ) { makers.set( name.toLowerCase(), make ); }

/**
 * The bytes of a made sound, for the sound cache when the game has no file of that name.
 *
 * @param {string} name the sound's name, without `sound/`
 * @returns {?Uint8Array} the WAV file, or null when the engine makes no sound of that name
 */
export function SYNTH_Sound( name ) {

	const key = String( name ).toLowerCase();
	if ( ! made.has( key ) ) { const make = makers.get( key ); if ( ! make ) return null; made.set( key, make() ); }
	return made.get( key );

}

/**
 * The lava's sound, `ambience/lava1.wav` (Dimension of the Machine and Soul of Evil ship their own; this is for the
 * games that do not): a 4-second loop of a low, slow roil with thick bubbles breaking at its surface, now and then a
 * deeper one. Made so its end runs into its start without a click.
 *
 * @returns {Float32Array} the samples, -1..1
 */
export function SYNTH_Lava() {

	const n = SYNTH_RATE * 4, out = new Float32Array( n ), random = SYNTH_Random( 0x1a7a );
	// the roil: lowpassed brown noise, made a little longer than the loop (after a second to settle the filters); its
	// start is cross-faded with what follows its end, so the loop's last sample runs straight into its first
	const fade = Math.floor( SYNTH_RATE * 0.3 ), long = new Float32Array( n + fade ), roil = new Float32Array( n );
	let b = 0, lp = 0, lp2 = 0;
	for ( let i = - SYNTH_RATE; i < n + fade; i ++ ) {

		b = ( b + ( random() * 2 - 1 ) * 0.05 ) * 0.995;
		lp += ( b - lp ) * 0.06; lp2 += ( lp - lp2 ) * 0.06;
		if ( i >= 0 ) long[ i ] = lp2;

	}
	for ( let i = 0; i < n; i ++ ) roil[ i ] = i < fade ? long[ i ] * ( i / fade ) + long[ n + i ] * ( 1 - i / fade ) : long[ i ];
	let peak = 0;
	for ( let i = 0; i < n; i ++ ) peak = Math.max( peak, Math.abs( roil[ i ] ) );
	for ( let i = 0; i < n; i ++ ) out[ i ] = roil[ i ] / ( peak || 1 ) * 0.3;
	// the bubbles: a short rising tone that swells and breaks, placed round the loop (one crossing the end wraps to the start)
	for ( let k = 0; k < 14; k ++ ) {

		const at = Math.floor( random() * n ), deep = random() < 0.25, len = Math.floor( SYNTH_RATE * ( deep ? 0.22 : 0.09 + random() * 0.06 ) );
		const f0 = deep ? 70 + random() * 30 : 120 + random() * 110, rise = deep ? 1.6 : 2.4, gain = ( deep ? 0.5 : 0.28 ) * ( 0.6 + random() * 0.4 );
		let phase = 0;
		for ( let j = 0; j < len; j ++ ) {

			const t = j / len, f = f0 * ( 1 + ( rise - 1 ) * t * t );
			phase += 2 * Math.PI * f / SYNTH_RATE;
			const env = Math.sin( Math.PI * Math.min( 1, t * 1.4 ) ) ** 2 * ( 1 - t * 0.5 );
			out[ ( at + j ) % n ] += Math.sin( phase ) * env * gain;

		}

	}
	for ( let i = 0; i < n; i ++ ) out[ i ] = Math.tanh( out[ i ] * 1.2 ) * 0.8; // (held well under full scale)
	return out;

}

SYNTH_Define( 'ambience/lava1.wav', () => SYNTH_Wav( SYNTH_Lava(), 0 ) );
