// When every dynamic channel is busy, a new sound takes the one nearest its end (WinQuake snd_dma.c SND_PickChannel;
// card [44m], item 10). paintedtime, the clock a channel's end is counted in, now follows the audio context's clock.
// Before, it stayed 0, so the channel with the shortest sound was taken even if it had only just begun; and an empty
// channel after the first was weighed as a sound to steal, so a playing sound could be taken while one was free. Through the
// public S_Init, S_PrecacheSound and S_StartSound with the shareware pack's real sounds; only the browser's
// AudioContext is a double, with a clock the test moves.
import { readFileSync } from 'node:fs';
import * as dma from '../src/engine/sound/snd_dma.js';
import * as sound from '../src/engine/sound/sound.js';
import { S_LoadSound } from '../src/engine/sound/snd_mem.js';
import { COM_LoadPackFile, COM_AddPack } from '../src/engine/common/pak.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
const node = kind => ( { kind, gain: { value: 1 }, pan: { value: 0 }, connect() {}, disconnect() {}, start() {}, stop() {} } );
let clock = 0;
class Context {
	constructor() { this.destination = {}; this.sampleRate = 44100; this.state = 'running'; }
	get currentTime() { return clock; }
	createGain() { return node( 'gain' ); }
	createStereoPanner() { return node( 'pan' ); }
	createBuffer( channels, length ) { return { length, data: new Float32Array( length ), getChannelData() { return this.data; } }; }
	createBufferSource() { return node( 'source' ); } // never ends: every channel stays busy
	resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
}

Deno.test( 'with every channel busy, the long sound about to finish is taken, not a short one just begun', () => {
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
	try {
		clock = 0; dma.S_Init();
		const long = dma.S_PrecacheSound( 'weapons/r_exp3.wav' ), short = dma.S_PrecacheSound( 'weapons/lock4.wav' );
		const seconds = sfx => S_LoadSound( sfx ).length / sound.shm.speed, at = [ 0, 0, 0 ];
		check( seconds( long ) > seconds( short ) + .2, 'two sounds of different lengths (' + seconds( long ) + ', ' + seconds( short ) + ')' );
		const first = sound.NUM_AMBIENTS, count = sound.MAX_DYNAMIC_CHANNELS;
		dma.S_StartSound( 100, 1, long, at, 1, 0 ); // the long one, at 0
		clock = seconds( long ) - .1; // it has a tenth of a second left
		for ( let i = 1; i < count; i ++ ) dma.S_StartSound( 100 + i, 1, short, at, 1, 0 ); // short ones, just begun
		for ( let i = first; i < first + count; i ++ ) check( sound.channels[ i ].sfx, 'channel ' + i + ' busy' );
		const longChannel = sound.channels.findIndex( ( c, i ) => i >= first && c.entnum === 100 );
		dma.S_StartSound( 200, 1, short, at, 1, 0 );
		same( sound.channels[ longChannel ].entnum, 200, 'the new sound took the long sound\'s channel, nearest its end' );
		// with a channel free, nothing playing is taken
		const freed = first + 7, before = sound.channels.map( c => c.entnum );
		sound.channels[ freed ].sfx = null; sound.channels[ freed ]._audioSource = null;
		dma.S_StartSound( 300, 1, short, at, 1, 0 );
		same( sound.channels[ freed ].entnum, 300, 'the free channel is used' );
		check( sound.channels.every( ( c, i ) => i === freed || c.entnum === before[ i ] ), 'no playing sound was taken' );
	} finally {
		dma.S_Shutdown();
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;
	}
} );
