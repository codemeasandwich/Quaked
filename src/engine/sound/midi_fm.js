/**
 * @module engine/sound/midi_fm
 *
 * Original two-operator FM voices and procedural GM percussion, rendered offline. No samples or patch bank.
 * 22050 Hz stereo, at most 48 voices by default, linear ADSR, equal-power pan and a smooth saturating limiter.
 * State is local to each render, including noise seeds. Pure leaf module; invalid input throws before allocation.
 */

const TABLE_SIZE = 16384, MASK = TABLE_SIZE - 1, CYCLE = TABLE_SIZE / ( Math.PI * 2 );
const sine = new Float32Array( TABLE_SIZE );
for ( let i = 0; i < TABLE_SIZE; i ++ ) sine[ i ] = Math.sin( i / CYCLE );

// ratio, modulation index, attack, decay, sustain, release, gain. One original patch per GM family (eight programs).
const PATCHES = [
	[ 1,2.8,.004,.65,.12,.24,.30 ], // piano: bright strike and short tail
	[ 3.5,4.5,.002,.8,.04,.35,.26 ], // chromatic percussion
	[ 2,1.2,.008,.12,.85,.16,.22 ], // organ
	[ 1,3,.003,.32,.18,.2,.30 ], // guitar
	[ 1,2,.004,.22,.35,.15,.36 ], // bass
	[ 2,1.1,.14,.4,.7,.55,.22 ], // strings
	[ 1,1.7,.1,.5,.65,.65,.22 ], // ensemble
	[ 1,3.8,.04,.2,.7,.25,.25 ], // brass
	[ 2,2.2,.025,.18,.65,.2,.25 ], // reed
	[ 1,.35,.055,.15,.8,.22,.28 ], // pipe
	[ 2,4.2,.008,.2,.6,.2,.24 ], // synth lead
	[ 1,.8,.3,.6,.75,1.2,.22 ], // pad
	[ 3.01,5,.06,.8,.45,.85,.22 ], // synth effects
	[ 2.5,3.2,.004,.45,.2,.3,.27 ], // ethnic
	[ 4.1,6,.002,.3,.01,.18,.26 ], // percussive
	[ 5.7,7,.02,.35,.15,.4,.22 ], // sound effects
];

function release( voice ) {

	if ( voice.stage === 3 ) return;
	voice.stage = 3;
	voice.releaseStep = voice.level / voice.releaseSamples;

}

function makeVoice( event, channel, rate, serial ) {

	const patch = PATCHES[ channel.program >> 3 ], note = event.note;
	const drum = event.channel === 9;
	let frequency = 440 * 2 ** ( ( note - 69 ) / 12 ), noise = 0, lifetime = 0, sweep = 1;
	let ratio = patch[ 0 ], index = patch[ 1 ];
	if ( drum ) {

		// Pitch groups give the GM kit its recognisable roles without recorded material.
		if ( note === 35 || note === 36 ) { frequency = 140; lifetime = .32; sweep = .99965; ratio = 1; index = 1.5; }
		else if ( [ 38,40,37,39 ].includes( note ) ) { frequency = 185; lifetime = .22; noise = .8; ratio = 1.7; index = 2.5; }
		else if ( [ 42,44,46 ].includes( note ) ) { frequency = 6500; lifetime = note === 46 ? .35 : .09; noise = 1; ratio = 1.47; index = 4; }
		else if ( [ 41,43,45,47,48,50 ].includes( note ) ) { frequency = 75 * 2 ** ( ( note - 41 ) / 12 ); lifetime = .4; sweep = .99995; ratio = 1.5; index = 1.5; }
		else if ( [ 49,51,52,53,55,57,59 ].includes( note ) ) { frequency = 3700; lifetime = 1.4; noise = .75; ratio = 1.413; index = 7; }
		else { frequency = 250 + note * 17; lifetime = .18; noise = .45; ratio = 2.71; index = 4; }

	}
	return {
		channel: event.channel, note, serial, keyDown: true, drum, noise, sweep,
		phase: 0, modPhase: 0, frequency, ratio, index, level: 0, stage: 0,
		attackStep: 1 / Math.max( 1, patch[ 2 ] * rate ), decayStep: ( 1 - patch[ 4 ] ) / ( patch[ 3 ] * rate ),
		sustain: patch[ 4 ], releaseSamples: Math.max( 1, patch[ 5 ] * rate ), releaseStep: 0,
		gain: ( event.velocity / 127 ) ** 1.5 * ( drum ? .3 : patch[ 6 ] ),
		remaining: Math.ceil( lifetime * rate ), drumLevel: 1, drumDecay: drum ? Math.exp( - 7 / ( lifetime * rate ) ) : 1,
		seed: ( 0x12345678 ^ Math.imul( serial + 1, 2654435761 ) ^ note ) >>> 0, previousNoise: 0,
	};

}

/**
 * Renders a parsed MIDI event list to deterministic stereo PCM. Missing final note-offs are released at track end.
 * @param {{ events: Array<object>, duration: number }} song output of MIDI_ParseSMF
 * @param {{ polyphony?: number }} [options] voice limit (1..128, default 48), oldest released voice stolen first
 * @returns {{ sampleRate: number, left: Float32Array, right: Float32Array, duration: number, peakVoices: number }} PCM
 */
export function MIDI_RenderFM( song, options = {} ) {

	const rate = 22050, tail = 1.25, polyphony = options.polyphony ?? 48;
	if ( ! Number.isFinite( song.duration ) || song.duration < 0 || song.duration > 600 ||
		! Array.isArray( song.events ) || song.events.length > 250000 || ! Number.isInteger( polyphony ) || polyphony < 1 || polyphony > 128 )
		throw new Error( 'MIDI: invalid render bounds' );
	let previous = 0;
	for ( const event of song.events ) {

		if ( ! Number.isFinite( event.time ) || event.time < previous || event.time > song.duration ||
			! Number.isInteger( event.channel ) || event.channel < 0 || event.channel > 15 ) throw new Error( 'MIDI: invalid event time/channel' );
		const inRange = ( n, max ) => Number.isInteger( n ) && n >= 0 && n <= max;
		if ( ( event.type === 'noteOn' || event.type === 'noteOff' ) && ( ! inRange( event.note, 127 ) || ( event.type === 'noteOn' && ! inRange( event.velocity, 127 ) ) ) ||
			event.type === 'program' && ! inRange( event.program, 127 ) ||
			event.type === 'pitchBend' && ! inRange( event.value, 16383 ) ||
			event.type === 'control' && ( ! inRange( event.controller, 127 ) || ! inRange( event.value, 127 ) ) ) throw new Error( 'MIDI: invalid event data' );
		previous = event.time;

	}
	const frames = Math.ceil( ( song.duration + tail ) * rate );
	const left = new Float32Array( frames ), right = new Float32Array( frames );
	const channels = Array.from( { length: 16 }, () => ( { program: 0, volume: 100 / 127, expression: 1, pan: 64, bend: 1, sustain: false } ) );
	const voices = [];
	let position = 0, serial = 0, peakVoices = 0;
	function renderUntil( end ) {

		for ( let n = voices.length - 1; n >= 0; n -- ) {

			const v = voices[ n ], c = channels[ v.channel ];
			const angle = c.pan / 127 * Math.PI / 2, gain = v.gain * c.volume * c.expression;
			const lg = Math.cos( angle ) * gain, rg = ( c.pan === 0 ? 0 : Math.sin( angle ) ) * gain;
			let step = v.frequency * c.bend * TABLE_SIZE / rate;
			let phase = v.phase, modPhase = v.modPhase, level = v.level, stage = v.stage;
			let seed = v.seed, oldNoise = v.previousNoise, drumLevel = v.drumLevel, remaining = v.remaining;
			for ( let i = position; i < end; i ++ ) {

				if ( v.drum ) {

					if ( remaining -- <= 0 ) break;
					level = drumLevel; drumLevel *= v.drumDecay; step *= v.sweep;

				} else if ( stage === 0 ) {

					level += v.attackStep;
					if ( level >= 1 ) { level = 1; stage = 1; }

				} else if ( stage === 1 ) {

					level -= v.decayStep;
					if ( level <= v.sustain ) { level = v.sustain; stage = 2; }

				} else if ( stage === 3 ) {

					level -= v.releaseStep;
					if ( level <= 0 ) { level = 0; break; }

				}
				const mod = sine[ modPhase & MASK ] * v.index * level * CYCLE;
				let sample = sine[ ( phase + mod ) & MASK ];
				if ( v.noise > 0 ) {

					seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
					const noise = ( seed >>> 0 ) / 2147483648 - 1;
					// Difference noise keeps hats/cymbals airy and avoids a low-frequency thump.
					sample = sample * ( 1 - v.noise ) + ( noise - oldNoise ) * .5 * v.noise;
					oldNoise = noise;

				}
				sample *= level;
				left[ i ] += sample * lg; right[ i ] += sample * rg;
				phase += step; modPhase += step * v.ratio;
				if ( phase >= TABLE_SIZE ) phase %= TABLE_SIZE;
				if ( modPhase >= TABLE_SIZE ) modPhase %= TABLE_SIZE;

			}
			v.phase = phase; v.modPhase = modPhase; v.level = level; v.stage = stage;
			v.seed = seed; v.previousNoise = oldNoise; v.drumLevel = drumLevel; v.remaining = remaining;
			if ( v.drum ) v.frequency = step * rate / TABLE_SIZE / c.bend;
			if ( ( v.drum && remaining <= 0 ) || ( ! v.drum && stage === 3 && level <= 0 ) ) voices.splice( n, 1 );

		}
		position = end;

	}
	for ( const e of song.events ) {

		renderUntil( Math.round( e.time * rate ) );
		const c = channels[ e.channel ];
		if ( e.type === 'noteOn' && e.velocity > 0 ) {

			if ( voices.length >= polyphony ) {

				let oldest = 0;
				for ( let i = 1; i < voices.length; i ++ )
					if ( ( voices[ i ].stage === 3 && voices[ oldest ].stage !== 3 ) ||
						( voices[ i ].stage === voices[ oldest ].stage && voices[ i ].serial < voices[ oldest ].serial ) ) oldest = i;
				voices.splice( oldest, 1 );

			}
			voices.push( makeVoice( e, c, rate, serial ++ ) );
			peakVoices = Math.max( peakVoices, voices.length );

		} else if ( e.type === 'noteOff' || e.type === 'noteOn' ) {

			// Pair overlapping equal-pitch note-ons FIFO, rather than cutting every copy at the first note-off.
			const v = voices.find( v => v.channel === e.channel && v.note === e.note && v.keyDown );
			if ( v ) { v.keyDown = false; if ( ! c.sustain && ! v.drum ) release( v ); }

		} else if ( e.type === 'program' ) c.program = e.program;
		else if ( e.type === 'pitchBend' ) c.bend = 2 ** ( ( e.value - 8192 ) / ( e.value >= 8192 ? 8191 : 8192 ) * 2 / 12 );
		else if ( e.type === 'control' ) {

			if ( e.controller === 7 ) c.volume = e.value / 127;
			else if ( e.controller === 10 ) c.pan = e.value;
			else if ( e.controller === 11 ) c.expression = e.value / 127;
			else if ( e.controller === 64 ) {

				c.sustain = e.value >= 64;
				if ( ! c.sustain ) for ( const v of voices ) if ( v.channel === e.channel && ! v.keyDown && ! v.drum ) release( v );

			} else if ( e.controller === 120 || e.controller === 123 ) {

				for ( let i = voices.length - 1; i >= 0; i -- ) if ( voices[ i ].channel === e.channel ) {

					const v = voices[ i ]; v.keyDown = false;
					if ( e.controller === 120 ) voices.splice( i, 1 );
					else if ( ! c.sustain && ! v.drum ) release( v );

				}

			}

		}

	}
	renderUntil( Math.round( song.duration * rate ) );
	for ( const v of voices ) if ( ! v.drum ) release( v );
	renderUntil( frames );
	for ( let i = 0; i < frames; i ++ ) {

		// Smooth unity-slope limiter, bounded without a hard-clipped plateau.
		left[ i ] /= 1 + Math.abs( left[ i ] ); right[ i ] /= 1 + Math.abs( right[ i ] );

	}
	return { sampleRate: rate, left, right, duration: frames / rate, peakVoices };

}

/** Encodes rendered stereo PCM as a little-endian 16-bit WAV, suitable for the shared HTMLAudio music bus.
 * @param {{ sampleRate: number, left: Float32Array, right: Float32Array }} pcm rendered audio
 * @returns {Uint8Array} complete RIFF/WAVE file
 */
export function MIDI_EncodeWAV( pcm ) {

	const frames = pcm.left.length;
	if ( frames !== pcm.right.length || frames > 14000000 || pcm.sampleRate !== 22050 ) throw new Error( 'MIDI: invalid PCM' );
	const bytes = new Uint8Array( 44 + frames * 4 ), view = new DataView( bytes.buffer );
	const text = ( offset, value ) => { for ( let i = 0; i < value.length; i ++ ) bytes[ offset + i ] = value.charCodeAt( i ); };
	text( 0, 'RIFF' ); view.setUint32( 4, bytes.length - 8, true ); text( 8, 'WAVE' ); text( 12, 'fmt ' );
	view.setUint32( 16, 16, true ); view.setUint16( 20, 1, true ); view.setUint16( 22, 2, true );
	view.setUint32( 24, pcm.sampleRate, true ); view.setUint32( 28, pcm.sampleRate * 4, true );
	view.setUint16( 32, 4, true ); view.setUint16( 34, 16, true ); text( 36, 'data' ); view.setUint32( 40, frames * 4, true );
	for ( let i = 0; i < frames; i ++ ) {

		view.setInt16( 44 + i * 4, Math.round( Math.max( -1, Math.min( 1, pcm.left[ i ] ) ) * 32767 ), true );
		view.setInt16( 46 + i * 4, Math.round( Math.max( -1, Math.min( 1, pcm.right[ i ] ) ) * 32767 ), true );

	}
	return bytes;

}
