// The water and wind ambient sounds (card [44m], item 1): S_Init precaches ambience/water1.wav and ambience/wind2.wav
// for the two ambient channels, as WinQuake's does. Before, only S_Startup did, and nothing called it, so neither sound
// ever played. Through the public S_Init and S_Update, with e1m1's real leaves (their ambient levels are the map's
// own) and the shareware pack's real sounds; only the browser's AudioContext is a double.
import { readFileSync } from 'node:fs';
import * as dma from '../src/engine/sound/snd_dma.js';
import * as sound from '../src/engine/sound/sound.js';
import { COM_LoadPackFile, COM_AddPack } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { cl } from '../src/engine/client/client.js';
import { Cvar_VariableValue } from '../src/engine/common/cvar.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
Mod_Init();
const node = kind => ( { kind, gain: { value: 1 }, pan: { value: 0 }, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } } );
class Context {
	constructor() { this.destination = {}; this.sampleRate = 44100; this.state = 'running'; this.sources = []; }
	createGain() { return node( 'gain' ); }
	createStereoPanner() { return node( 'pan' ); }
	createBuffer( channels, length, rate ) { return { channels, length, rate, data: new Float32Array( length ), getChannelData() { return this.data; } }; }
	createBufferSource() { const s = node( 'source' ); this.sources.push( s ); return s; }
	resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
}

Deno.test( 'in a leaf by water and sky, the two ambient channels play the map\'s water and wind sounds; elsewhere they fade', () => {
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' ), world = cl.worldmodel;
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
	try {
		dma.S_Init(); dma.S_SetCallbacks( { getHostFrametime: () => .1 } );
		cl.worldmodel = Mod_ForName( 'maps/e1m1.bsp', true );
		const leaves = cl.worldmodel.leafs.filter( l => l.contents === - 1 );
		const loud = leaves.find( l => l.ambient_sound_level[ sound.AMBIENT_WATER ] === 255 && l.ambient_sound_level[ sound.AMBIENT_SKY ] === 255 );
		const quiet = leaves.find( l => l.ambient_sound_level.every( v => v === 0 ) );
		check( loud && quiet, 'e1m1 has a leaf by water and sky, and a silent one' );
		const centre = l => [ 0, 1, 2 ].map( i => ( l.minmaxs[ i ] + l.minmaxs[ i + 3 ] ) / 2 ), at = p => dma.S_Update( p, [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] );
		for ( let i = 0; i < 20; i ++ ) at( centre( loud ) );
		const water = sound.channels[ sound.AMBIENT_WATER ], sky = sound.channels[ sound.AMBIENT_SKY ];
		same( water.sfx?.name, 'ambience/water1.wav', 'the water channel\'s sound' );
		same( sky.sfx?.name, 'ambience/wind2.wav', 'the sky channel\'s sound' );
		const level = Math.round( Cvar_VariableValue( 'ambient_level' ) * 255 );
		same( Math.round( water.master_vol ), level, 'faded in to ambient_level of the leaf\'s 255' );
		same( Math.round( sky.master_vol ), level, 'the wind likewise' );
		const context = dma.S_GetAudioContext(), sources = context.sources.filter( s => s.started );
		check( sources.length >= 2 && sources.every( s => s.loop && s.buffer.data.some( v => v !== 0 ) ), 'two looping sources with the sounds\' real samples' );
		for ( let i = 0; i < 40; i ++ ) at( centre( quiet ) );
		same( water.master_vol, 0, 'away from water it fades out' ); same( sky.master_vol, 0, 'and from the sky' );
	} finally {
		dma.S_Shutdown(); cl.worldmodel = world;
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;
	}
} );
