/**
 * @module engine/sound/midi_smf
 *
 * Bounded Standard MIDI File reader. Format 1 tracks share one tempo map; simultaneous events retain file order.
 * Pure leaf module: no game state, I/O or synthesis. Malformed/unsupported files throw before rendering.
 */

/**
 * Parses format 0/1 SMF bytes into channel events with absolute times in seconds.
 * Meta/sysex payloads are skipped; tempo and end-of-track still contribute to timing. SMPTE -29 means 30000/1001 fps.
 * @param {Uint8Array|ArrayBuffer} input a file, including an offset view into a mounted pack
 * @returns {{ format: number, division: number, duration: number, events: Array<object> }} timed channel events
 */
export function MIDI_ParseSMF( input ) {

	const bytes = input instanceof Uint8Array ? input : new Uint8Array( input );
	if ( bytes.length < 14 || bytes.length > 4 * 1024 * 1024 ) throw new Error( 'MIDI: invalid file size' );
	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	let pos = 0, limit = bytes.length;
	const need = n => { if ( n < 0 || pos + n > limit ) throw new Error( 'MIDI: truncated chunk' ); };
	const byte = () => { need( 1 ); return bytes[ pos ++ ]; };
	const word = () => { need( 2 ); const n = view.getUint16( pos ); pos += 2; return n; };
	const long = () => { need( 4 ); const n = view.getUint32( pos ); pos += 4; return n; };
	const vlq = () => {

		let n = 0;
		for ( let i = 0; i < 4; i ++ ) {

			const b = byte(); n = n * 128 + ( b & 127 );
			if ( ( b & 128 ) === 0 ) return n;

		}
		throw new Error( 'MIDI: oversized VLQ' );

	};
	if ( long() !== 0x4d546864 ) throw new Error( 'MIDI: missing MThd' );
	const headerSize = long();
	if ( headerSize < 6 ) throw new Error( 'MIDI: short header' );
	need( headerSize );
	const format = word(), tracks = word(), division = word();
	if ( format > 1 || tracks === 0 || tracks > 256 || ( format === 0 && tracks !== 1 ) ) throw new Error( 'MIDI: unsupported format/tracks' );
	let secondsPerTick = 0;
	if ( division & 0x8000 ) {

		const fps = 256 - ( division >> 8 ), ticks = division & 255;
		if ( ! [ 24,25,29,30 ].includes( fps ) || ticks === 0 ) throw new Error( 'MIDI: invalid SMPTE division' );
		secondsPerTick = 1 / ( ( fps === 29 ? 30000 / 1001 : fps ) * ticks );

	} else if ( division === 0 ) throw new Error( 'MIDI: zero division' );
	pos = 8 + headerSize;
	const raw = [];
	let endTick = 0, count = 0;
	for ( let track = 0; track < tracks; track ++ ) {

		limit = bytes.length;
		if ( long() !== 0x4d54726b ) throw new Error( 'MIDI: missing MTrk' );
		const size = long(); need( size );
		limit = pos + size;
		let tick = 0, running = 0;
		while ( pos < limit ) {

			if ( ++ count > 250000 ) throw new Error( 'MIDI: too many events' );
			tick += vlq();
			let status = byte();
			if ( status < 128 ) {

				if ( running === 0 ) throw new Error( 'MIDI: missing running status' );
				pos --; status = running;

			}
			if ( status === 0xff ) {

				const type = byte(), length = vlq(); need( length );
				if ( type === 0x51 ) {

					if ( length !== 3 ) throw new Error( 'MIDI: invalid tempo' );
					const tempo = bytes[ pos ] * 65536 + bytes[ pos + 1 ] * 256 + bytes[ pos + 2 ];
					if ( tempo === 0 ) throw new Error( 'MIDI: zero tempo' );
					raw.push( { tick, type: 'tempo', tempo } );

				}
				pos += length;
				if ( type === 0x2f ) {

					if ( length !== 0 ) throw new Error( 'MIDI: invalid end-of-track' );
					break;

				}
				continue;

			}
			if ( status === 0xf0 || status === 0xf7 ) {

				const length = vlq(); need( length ); pos += length; running = 0;
				continue;

			}
			if ( status >= 0xf0 ) throw new Error( 'MIDI: unsupported system status' );
			running = status;
			const kind = status >> 4, channel = status & 15, a = byte(), b = kind === 12 || kind === 13 ? 0 : byte();
			if ( a > 127 || b > 127 ) throw new Error( 'MIDI: invalid channel data' );
			let event;
			if ( kind === 8 || kind === 9 ) event = { type: kind === 8 || b === 0 ? 'noteOff' : 'noteOn', note: a, velocity: b };
			else if ( kind === 11 ) event = { type: 'control', controller: a, value: b };
			else if ( kind === 12 ) event = { type: 'program', program: a };
			else if ( kind === 14 ) event = { type: 'pitchBend', value: a + b * 128 };
			// Pressure is parsed, but this small synthesiser has no pressure-sensitive patches.
			if ( event ) raw.push( { tick, channel, ...event } );

		}
		endTick = Math.max( endTick, tick );
		pos = limit;

	}
	// Array.sort is stable: track index then in-track order breaks equal-tick ties.
	raw.sort( ( a, b ) => a.tick - b.tick );
	let tick = 0, time = 0, tempo = 500000;
	const events = [];
	for ( const event of raw ) {

		time += ( event.tick - tick ) * ( secondsPerTick || tempo / ( division * 1000000 ) );
		tick = event.tick;
		if ( event.type === 'tempo' ) tempo = event.tempo;
		else {

			const { tick: ignored, ...channelEvent } = event;
			events.push( { ...channelEvent, time } );

		}

	}
	const duration = time + ( endTick - tick ) * ( secondsPerTick || tempo / ( division * 1000000 ) );
	if ( duration > 600 ) throw new Error( 'MIDI: track exceeds ten minutes' );
	return { format, division, events, duration };

}
