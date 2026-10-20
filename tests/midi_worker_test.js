/** Public worker boundary, including a real browser module Worker and decoded WAV. No game data or network. */
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { Worker as NodeWorker } from 'node:worker_threads';
import { MIDI_RenderFile } from '../src/engine/sound/midi_render.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const midi = new Uint8Array( [ 77,84,104,100,0,0,0,6,0,0,0,1,0,96,
	77,84,114,107,0,0,0,12,0,144,60,100,96,128,60,0,0,255,47,0 ] );

Deno.test( 'worker client copies only MIDI view bytes, terminates after success and handles failure/cancellation', async () => {

	const pack = new Uint8Array( midi.length + 20 ); pack.set( midi, 7 );
	let terminated = 0, sent;
	const workerFactory = () => ( {
		terminate() { terminated ++; },
		postMessage( bytes, transfer ) {

			check( bytes !== pack.buffer && bytes.byteLength === midi.length && transfer[ 0 ] === bytes, 'only private view copy transferred' );
			sent = new Uint8Array( bytes );
			queueMicrotask( () => this.onmessage( { data: { wav: new ArrayBuffer( 44 ) } } ) );

		},
	} );
	await MIDI_RenderFile( pack.subarray( 7, 7 + midi.length ), { workerFactory } );
	check( terminated === 1 && sent.every( ( x, i ) => x === midi[ i ] ) && pack.length === midi.length + 20, 'source remains mounted; worker terminated' );
	for ( const kind of [ 'error','messageerror','invalid','cancel' ] ) {

		const controller = new AbortController();
		let ended = 0;
		const job = MIDI_RenderFile( midi, { signal: controller.signal, workerFactory: () => ( {
			terminate() { ended ++; },
			postMessage() {

				queueMicrotask( () => {

					if ( kind === 'cancel' ) controller.abort();
					else if ( kind === 'error' ) this.onerror( { message: 'broken worker' } );
					else if ( kind === 'messageerror' ) this.onmessageerror();
					else this.onmessage( { data: { error: 'invalid MIDI' } } );

				} );

			},
		} ) } );
		let rejected = false; try { await job; } catch { rejected = true; }
		check( rejected && ended === 1, 'rejects and terminates: ' + kind );

	}

} );

Deno.test( 'real module worker entry produces the same WAV as the direct Node renderer', async () => {

	const entry = new URL( '../src/engine/sound/midi_fm_worker.js', import.meta.url ).href;
	const bootstrap = `import { parentPort } from 'node:worker_threads';
		globalThis.self = { postMessage: (data, transfer) => parentPort.postMessage(data, transfer) };
		await import(${JSON.stringify( entry )});
		parentPort.on('message', data => self.onmessage({data}));`;
	const workerFactory = () => {

		const node = new NodeWorker( new URL( 'data:text/javascript,' + encodeURIComponent( bootstrap ) ) );
		const worker = { postMessage: ( data, transfer ) => node.postMessage( data, transfer ), terminate: () => node.terminate() };
		node.on( 'message', data => worker.onmessage( { data } ) );
		node.on( 'error', error => worker.onerror( error ) );
		return worker;

	};
	const fromWorker = new Uint8Array( await MIDI_RenderFile( midi, { workerFactory } ) );
	const direct = new Uint8Array( await MIDI_RenderFile( midi ) );
	check( fromWorker.length === direct.length && fromWorker.every( ( byte, i ) => byte === direct[ i ] ), 'same bytes across thread/transfer boundary' );
	check( midi.length === 34 && midi[ 0 ] === 77, 'source not detached' );

} );

Deno.test( 'malformed worker replies reject immediately without throwing from the event callback', async () => {

	const controller = new AbortController();
	let callbackError = null, terminated = 0, rejected = false;
	try {

		await MIDI_RenderFile( midi, { signal: controller.signal, workerFactory: () => ( {
			terminate() { terminated ++; },
			postMessage() {

				queueMicrotask( () => {

					try { this.onmessage( { data: null } ); }
					catch ( error ) { callbackError = error; controller.abort(); }

				} );

			},
		} ) } );

	} catch { rejected = true; }
	check( rejected && callbackError === null && terminated === 1, 'controlled rejection; no uncaught callback exception: ' + callbackError );

} );

Deno.test( 'real browser module Worker renders a WAV that Web Audio decodes without blocking the frame thread', async () => {

	const browser = await chromium.launch( { channel: 'chrome', headless: true, args: [ '--mute-audio' ] } );
	try {

		const page = await browser.newPage();
		// Fulfil every request from local source. No HTTP server, internet access or installed data is needed.
		await page.route( '**/*', async route => {

			const path = new URL( route.request().url() ).pathname;
			if ( path === '/' ) return route.fulfill( { contentType: 'text/html', body: '<!doctype html><title>MIDI worker test</title>' } );
			if ( ! /^\/src\/engine\/sound\/midi_[a-z_]+\.js$/.test( path ) ) return route.abort();
			await route.fulfill( { contentType: 'text/javascript', body: await readFile( new URL( '..' + path, import.meta.url ), 'utf8' ) } );

		} );
		await page.goto( 'http://127.0.0.1:19999/' );
		const result = await page.evaluate( async bytes => {

			const { MIDI_RenderFile } = await import( '/src/engine/sound/midi_render.js' );
			const source = new Uint8Array( bytes );
			let workerCount = 0;
			const NativeWorker = window.Worker;
			window.Worker = class extends NativeWorker { constructor( ...args ) { super( ...args ); workerCount ++; } };
			const wav = await MIDI_RenderFile( source );
			const context = new AudioContext();
			try {

				const pcm = await context.decodeAudioData( wav.slice( 0 ) );
				return { workerCount, sourceLength: source.length, channels: pcm.numberOfChannels, duration: pcm.duration,
					audible: pcm.getChannelData( 0 ).some( n => Math.abs( n ) > .01 ) };

			} finally { await context.close(); }

		}, Array.from( midi ) );
		check( result.workerCount === 1 && result.sourceLength === midi.length && result.channels === 2 && result.duration > .5 && result.audible,
			JSON.stringify( result ) );
		await page.close();

	} finally { await browser.close(); }

} );
