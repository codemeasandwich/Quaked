/** @module engine/sound/midi_fm_worker
 * Dedicated offline render entry; only the small MIDI view and finished WAV cross the worker boundary.
 */
import { MIDI_ParseSMF } from './midi_smf.js';
import { MIDI_RenderFM, MIDI_EncodeWAV } from './midi_fm.js';
self.onmessage = ( { data } ) => {

	try {

		const wav = MIDI_EncodeWAV( MIDI_RenderFM( MIDI_ParseSMF( data ) ) ).buffer;
		self.postMessage( { wav }, [ wav ] );

	} catch ( error ) {

		self.postMessage( { error: error.message } );

	}

};
