/** @module engine/sound/midi_render
 * Worker lifetime/transfer boundary. Browsers always render off-thread; Node tests use the same pure renderer.
 */
import { MIDI_ParseSMF } from './midi_smf.js';
import { MIDI_RenderFM, MIDI_EncodeWAV } from './midi_fm.js';

/**
 * Returns a WAV ArrayBuffer; rejects on a worker failure, cancellation or a bounded 60-second timeout.
 * @param {Uint8Array|ArrayBuffer} input the mounted SMF file (never detached)
 * @param {{ signal?: AbortSignal, workerFactory?: function(): Worker }} [options] cancellation/worker test seam
 * @returns {Promise<ArrayBuffer>} stereo 16-bit PCM WAV
 */
export async function MIDI_RenderFile( input, { signal, workerFactory } = {} ) {

	if ( signal?.aborted ) throw new Error( 'MIDI render cancelled' );
	if ( ! workerFactory && typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node )
		return MIDI_EncodeWAV( MIDI_RenderFM( MIDI_ParseSMF( input ) ) ).buffer;
	return new Promise( ( resolve, reject ) => {

		let worker, timer, settled = false;
		const finish = ( error, wav ) => {

			if ( settled ) return;
			settled = true;
			clearTimeout( timer ); signal?.removeEventListener( 'abort', abort ); worker?.terminate();
			if ( error ) reject( error ); else resolve( wav );

		};
		const abort = () => finish( new Error( 'MIDI render cancelled' ) );
		try {

			worker = workerFactory ? workerFactory() : new Worker( new URL( './midi_fm_worker.js', import.meta.url ), { type: 'module' } );
			worker.onmessage = ( { data } ) => finish( data?.error ? new Error( data.error ) : data?.wav instanceof ArrayBuffer ? null : new Error( 'Invalid MIDI worker result' ), data?.wav );
			worker.onerror = error => finish( new Error( error.message || 'MIDI worker failed' ) );
			worker.onmessageerror = () => finish( new Error( 'Invalid MIDI worker message' ) );
			signal?.addEventListener( 'abort', abort, { once: true } );
			timer = setTimeout( () => finish( new Error( 'MIDI render timed out' ) ), 60000 );
			// COM_FindFile returns a view into a mounted pak: never detach its backing buffer.
			const bytes = input instanceof ArrayBuffer ? input.slice( 0 ) : new Uint8Array( input.buffer, input.byteOffset, input.byteLength ).slice().buffer;
			worker.postMessage( bytes, [ bytes ] );

		} catch ( error ) { finish( error ); }

	} );

}
