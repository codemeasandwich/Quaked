// Gibs that sound when they come to rest (src/newer/sound/s_gibs.js; card T-3faa98e3 item 10, docs/gib-sounds-2026-10-14.md):
// the game's own zombie/z_fall.wav, quietly, once per gib, when the same rest the blood mark waits for is seen; only
// on a spare channel, so no game sound is ever cut off; at most four in a frame; Newer Game only. Through the public
// S_GibRestObserve and the real sound system (S_Init, S_StartSound) with the shareware pack's real sound; only the
// browser's AudioContext is a double.
import { readFileSync } from 'node:fs';
import * as dma from '../src/engine/sound/snd_dma.js';
import * as sound from '../src/engine/sound/sound.js';
import { COM_LoadPackFile, COM_AddPack } from '../src/engine/common/pak.js';
import { cl } from '../src/engine/client/client.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_Set } from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { S_GibRestObserve, s_gibs } from '../src/newer/sound/s_gibs.js';
import { GibRestObserved } from '../src/newer/render/gib_rest.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
for ( const v of [ r_hdr, s_gibs ] ) if ( ! Cvar_FindVar( v.name ) ) Cvar_RegisterVariable( v );
const node = kind => ( { kind, gain: { value: 1 }, pan: { value: 0 }, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } } );
class Context {
	constructor() { this.destination = {}; this.sampleRate = 44100; this.state = 'running'; this.sources = []; }
	createGain() { return node( 'gain' ); }
	createStereoPanner() { return node( 'pan' ); }
	createBuffer( channels, length, rate ) { return { channels, length, rate, data: new Float32Array( length ), getChannelData() { return this.data; } }; }
	createBufferSource() { const s = node( 'source' ); this.sources.push( s ); return s; }
	resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
}
const GIB = { name: 'progs/gib1.mdl', flags: 4 }; // EF_GIB: a gib's model trails blood
const falls = () => sound.channels.filter( c => c.sfx?.name === 'zombie/z_fall.wav' ).length;

// runs `body` with sound started, a world, Newer Game on and the gib sounds on
function withSound( body ) {

	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' ), world = cl.worldmodel;
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
	try {

		dma.S_Init(); dma.S_SetCallbacks( { getHostFrametime: () => .1 } ); dma.S_StopAllSounds( true );
		for ( const c of sound.channels ) c.sfx = null; // (nothing left from an earlier test)
		cl.worldmodel = { name: 'maps/gibs.bsp' }; cl.paused = false; cl.intermission = 0;
		Cvar_Set( 'r_hdr', '1' ); Cvar_Set( 's_gibs', '1' ); R_AnimSetClassicPass( false );
		body();

	} finally {

		dma.S_Shutdown(); cl.worldmodel = world;
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;

	}

}
let clock = 100;
// a gib that falls for `fall` seconds and then lies still for `lie`, seen every 0.05 s
function gibLands( entity, { fall = 0.4, lie = 0.6, origin = [ 0, 0, 100 ], model = GIB } = {} ) {

	for ( let t = 0; t < fall + lie; t += 0.05 ) {

		clock = Math.round( ( clock + 0.05 ) * 1000 ) / 1000;
		if ( t < fall ) origin[ 2 ] -= 6;
		S_GibRestObserve( entity, model, origin, clock, 7 );

	}

}

Deno.test( 'a gib coming to rest sounds once, quietly, at the place it lies, with the game\'s own sound', () => withSound( () => {

	const gib = {}, origin = [ 10, 20, 100 ];
	gibLands( gib, { origin } );
	same( falls(), 1, 'one z_fall' );
	const ch = sound.channels.find( c => c.sfx?.name === 'zombie/z_fall.wav' );
	check( Math.abs( ch.master_vol - 0.3 * 255 ) < 1, 'at 0.3 of full volume: ' + ch.master_vol );
	same( ch.origin.join(), origin.join(), 'where the gib lies' );
	gibLands( gib, { fall: 0, lie: 2, origin } );
	same( falls(), 1, 'lying there longer: no second sound' );
	check( gib._gibState === undefined, 'the blood mark\'s own watch of the gib is left alone' );

} ) );

Deno.test( 'a gib still moving, a body that is not a gib, New Game, the setting off, a pause: no sound', () => withSound( () => {

	const moving = {}, origin = [ 0, 0, 100 ];
	gibLands( moving, { fall: 1.5, lie: 0, origin } ); same( falls(), 0, 'still falling' );
	gibLands( {}, { model: { name: 'progs/ogre.mdl', flags: 0 } } ); same( falls(), 0, 'not a gib' );
	Cvar_Set( 'r_hdr', '0' ); gibLands( {} ); same( falls(), 0, 'New Game' ); Cvar_Set( 'r_hdr', '1' );
	R_AnimSetClassicPass( true ); gibLands( {} ); same( falls(), 0, 'the classic half of the title demo' ); R_AnimSetClassicPass( false );
	Cvar_Set( 's_gibs', '0' ); gibLands( {} ); same( falls(), 0, 's_gibs 0' ); Cvar_Set( 's_gibs', '1' );
	cl.paused = true; gibLands( {} ); same( falls(), 0, 'paused' ); cl.paused = false;
	cl.intermission = 1; gibLands( {} ); same( falls(), 0, 'intermission' ); cl.intermission = 0;
	gibLands( {} ); same( falls(), 1, 'and with all of that back, it sounds' );

} ) );

Deno.test( 'at most four gibs sound in one frame, and never on a channel a game sound is using', () => withSound( () => {

	const gibs = Array.from( { length: 7 }, () => ( {} ) ), origins = gibs.map( ( _, i ) => [ i * 40, 0, 100 ] );
	for ( let t = 0; t < 1; t += 0.05 ) {

		clock = Math.round( ( clock + 0.05 ) * 1000 ) / 1000;
		gibs.forEach( ( g, i ) => { if ( t < 0.4 ) origins[ i ][ 2 ] -= 6; S_GibRestObserve( g, GIB, origins[ i ], clock, i ); } );

	}
	same( falls(), 4, 'seven gibs landing together: four sounds' );
	// every dynamic channel busy with a game sound
	dma.S_StopAllSounds( true );
	const other = dma.S_PrecacheSound( 'weapons/r_exp3.wav' );
	for ( let i = 0; i < sound.MAX_DYNAMIC_CHANNELS; i ++ ) dma.S_StartSound( 100 + i, 1, other, [ i * 10, 0, 0 ], 1, 1 );
	const busy = sound.channels.filter( c => c.sfx?.name === 'weapons/r_exp3.wav' ).length;
	gibLands( {} );
	same( falls(), 0, 'no gib sound when every channel is taken' );
	same( sound.channels.filter( c => c.sfx?.name === 'weapons/r_exp3.wav' ).length, busy, 'and no game sound was cut off for one' );

} ) );

Deno.test( 'the rest is the blood mark\'s own rule, unchanged: still for 0.3 s, moving under 0.6 units', () => {

	const e = {}, p = [ 0, 0, 0 ];
	let fired = 0;
	for ( let t = 0; t <= 1; t += 0.1 ) fired += GibRestObserved( e, 'k', p, 50 + t ) ? 1 : 0;
	same( fired, 1, 'once' );
	const drifting = {};
	fired = 0;
	for ( let t = 0; t <= 1; t += 0.1 ) { p[ 0 ] += 0.7; fired += GibRestObserved( drifting, 'k', p, 60 + t ) ? 1 : 0; }
	same( fired, 0, 'drifting 0.7 units a tenth: never at rest' );

} );
