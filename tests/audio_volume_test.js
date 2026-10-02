// Public CD audio and SFX gain controls. Only browser audio endpoints are
// doubles; the real init/play/update/pause/resume/shutdown paths execute.
import * as cd from '../src/cd_audio.js';
import * as dma from '../src/snd_dma.js';
import * as sound from '../src/sound.js';
import * as cvar from '../src/cvar.js';
import { cl } from '../src/client.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
class Media {

	constructor() { this.volume = 1; this.paused = true; this.currentTime = 0; }
	play() { this.paused = false; return Promise.resolve(); }
	pause() { this.paused = true; }

}
class Context {

	constructor() { this.destination = {}; this.sampleRate = 44100; this.state = 'running'; this.nodes = []; }
	createGain() { const node = { kind: 'gain', gain: { value: 1 }, connect( target ) { this.target = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( node ); return node; }
	createMediaElementSource( media ) { const node = { kind: 'source', media, connect( target ) { this.target = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( node ); return node; }
	close() { this.state = 'closed'; return Promise.resolve(); }

}
async function fixture( mode, fn ) {

	const descriptors = new Map( [ 'window', 'Audio' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) );
	const media = [], saved = { volume: sound.volume.string, music: sound.bgmvolume.string, world: cl.worldmodel };
	try {

		const contextType = mode === 'unavailable' ? class { constructor() { throw new Error( 'Web Audio unavailable' ); } }
			: mode === 'routing-fails' ? class extends Context { createMediaElementSource() { throw new Error( 'media routing unavailable' ); } } : Context;
		Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: contextType } } );
		Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends Media { constructor() { super(); media.push( this ); } } } );
		dma.S_Init(); cvar.Cvar_SetValue( 'nosound', 0 ); cvar.Cvar_SetValue( 'volume', .4 ); cvar.Cvar_SetValue( 'bgmvolume', .5 );
		cl.worldmodel = null; cd.CDAudio_Init(); cd.CDAudio_SetTrackURLProvider( track => 'test/music-' + track + '.ogg' );
		await fn( media );

	} finally {

		cd.CDAudio_Shutdown(); cd.CDAudio_SetTrackURLProvider( null ); dma.S_Shutdown(); cl.worldmodel = saved.world;
		cvar.Cvar_Set( 'volume', saved.volume ); cvar.Cvar_Set( 'bgmvolume', saved.music );
		for ( const [ key, descriptor ] of descriptors ) { if ( descriptor ) Object.defineProperty( globalThis, key, descriptor ); else delete globalThis[ key ]; }

	}

}
function updateSound() { dma.S_Update( [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] ); }

Deno.test( 'classic CD music gain is applied once and all0/.5/1 sound/music combinations stay independent', () => fixture( 'routed', async media => {

	cd.CDAudio_Play( 2, true ); await Promise.resolve();
	const context = dma.S_GetAudioContext(), master = dma.S_GetMasterGain(), source = context.nodes.find( n => n.kind === 'source' ), musicGain = source.target;
	same( media.length, 1, 'one CD element' ); same( source.media, media[ 0 ], 'CD source owns actual playing element' );
	same( musicGain.target, context.destination, 'music bypasses sound gain' ); check( musicGain !== master, 'separate music/SFX gain nodes' );
	for ( const effectVolume of [ 0, .5, 1 ] ) for ( const musicVolume of [ 0, .5, 1 ] ) {

		cvar.Cvar_SetValue( 'volume', effectVolume ); cvar.Cvar_SetValue( 'bgmvolume', musicVolume ); updateSound(); cd.CDAudio_Update();
		same( master.gain.value, effectVolume, 'public SFX update applies sound volume' );
		same( musicGain.gain.value, musicVolume, 'CD update applies music volume' ); same( media[ 0 ].volume, 1, 'routed media has unity gain' );
		same( musicGain.gain.value * media[ 0 ].volume, musicVolume, 'effective music amplitude is linear, not squared or multiplied by SFX' );
		same( media[ 0 ].paused, false, 'sound mute does not pause CD music' );

	}
	cd.CDAudio_Pause(); same( media[ 0 ].paused, true, 'CD pause' ); cd.CDAudio_Resume(); same( media[ 0 ].paused, false, 'CD resume' );
	cd.CDAudio_Shutdown(); same( media[ 0 ].paused, true, 'shutdown stops media' ); same( source.disconnected, true, 'source released' ); same( musicGain.disconnected, true, 'music gain released' );
	cd.CDAudio_Play( 3, true ); same( media.length, 1, 'shutdown cannot allocate/play another CD source' );

} ) );

for ( const mode of [ 'unavailable', 'routing-fails' ] ) Deno.test( 'CD direct fallback keeps music independent when WebAudio ' + mode, () => fixture( mode, async media => {

	cd.CDAudio_Play( 2, true ); await Promise.resolve(); same( media.length, 1, 'fallback creates one media element' ); same( media[ 0 ].volume, .5, 'fallback starts at music volume' );
	for ( const effectVolume of [ 0, .5, 1 ] ) for ( const musicVolume of [ 0, .5, 1 ] ) {

		cvar.Cvar_SetValue( 'volume', effectVolume ); cvar.Cvar_SetValue( 'bgmvolume', musicVolume ); updateSound(); cd.CDAudio_Update();
		same( media[ 0 ].volume, musicVolume, 'fallback applies music gain once' ); same( media[ 0 ].paused, false, 'sound volume does not pause direct music' );

	}
	cd.CDAudio_Pause(); same( media[ 0 ].paused, true, 'fallback pause' ); cd.CDAudio_Resume(); same( media[ 0 ].paused, false, 'fallback resume' );
	cd.CDAudio_Shutdown(); same( media[ 0 ].paused, true, 'fallback shutdown' );

} ) );
