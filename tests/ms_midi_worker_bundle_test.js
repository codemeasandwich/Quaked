// Public render transport exercised with the production worker bundled as the app bundles it.
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { MIDI_RenderFile } from '../src/engine/sound/midi_render.js';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
Deno.test( 'bundled MIDI worker preserves the source and returns the direct renderer WAV', async () => {
	const entry = new URL( '../src/engine/sound/midi_fm_worker.js', import.meta.url );
	const bundled = await build( { entryPoints: [ entry.pathname ], bundle: true, write: false, format: 'iife', minify: true, target: [ 'safari17', 'chrome120', 'firefox120' ], logLevel: 'warning' } );
	const midi = new Uint8Array( [ 77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,0,12,0,144,60,100,96,128,60,0,0,255,47,0 ] );
	let created = 0, terminated = 0;
	const workerFactory = () => {
		created ++;
		// Only adapt the platform transport: parser, synth and worker entry remain production code.
		const worker = new Worker( `const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(data,list)=>parentPort.postMessage(data,list)};${bundled.outputFiles[ 0 ].text};parentPort.on('message',data=>self.onmessage({data}));`, { eval: true, execArgv: [] } );
		const adapter = { postMessage: ( data, list ) => worker.postMessage( data, list ), terminate: () => { terminated ++; void worker.terminate(); } };
		worker.on( 'message', data => adapter.onmessage?.( { data } ) );
		worker.on( 'error', error => adapter.onerror?.( error ) );
		return adapter;
	};
	const pak = new Uint8Array( midi.length + 7 ); pak.set( midi, 7 );
	const wav = new Uint8Array( await MIDI_RenderFile( pak.subarray( 7 ), { workerFactory } ) );
	const direct = new Uint8Array( await MIDI_RenderFile( midi ) );
	check( wav.length === direct.length && wav.every( ( b, i ) => b === direct[ i ] ), 'same WAV across bundled worker boundary' );
	check( pak.length === midi.length + 7 && pak[ 7 ] === 77, 'mounted pak storage stays attached' );
	let bad = false;
	try { await MIDI_RenderFile( new Uint8Array( 2 ), { workerFactory } ); } catch { bad = true; }
	check( bad, 'actual worker parse error rejected' );
	const controller = new AbortController();
	const pending = MIDI_RenderFile( midi, { workerFactory, signal: controller.signal } ); controller.abort();
	let cancelled = false; try { await pending; } catch ( error ) { cancelled = /cancelled/.test( error.message ); }
	check( cancelled && created === 3 && terminated === 3, 'real threads terminate on success, failure and cancellation' );
} );
