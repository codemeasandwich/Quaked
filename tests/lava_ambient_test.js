// Lava you can hear (src/newer/sound/s_lava.js, s_synth.js; card T-3faa98e3 item 4, docs/lava-ambient-2026-10-14.md):
// the lava ambient channel Quake always had plays the lava's sound in Newer Game, faded by each leaf's lava level;
// the 1996 e1m7, compiled without lava levels, gets them worked out as vis does; a game's own lava1.wav wins over
// the engine's made one. Through the public sound system (S_Init, S_Update) with the shareware pack's real e1m7; only
// the browser's AudioContext is a double.
import { readFileSync } from './helpers/resource_fs.mjs';
import { createHash } from 'node:crypto';
import * as dma from '../src/engine/sound/snd_dma.js';
import * as sound from '../src/engine/sound/sound.js';
import { GetWavinfo, S_LoadSound } from '../src/engine/sound/snd_mem.js';
import * as pak from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName, Mod_ClearAll } from '../src/engine/render/gl_model.js';
import { cl } from '../src/engine/client/client.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_Set, Cvar_VariableValue } from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { s_lava, LAVA_SOUND, R_LavaLevelsFill, S_LavaSnapshot } from '../src/newer/sound/s_lava.js';
import { SYNTH_Sound, SYNTH_RATE } from '../src/newer/sound/s_synth.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
Mod_Init();
for ( const v of [ r_hdr, s_lava ] ) if ( ! Cvar_FindVar( v.name ) ) Cvar_RegisterVariable( v );
const node = kind => ( { kind, gain: { value: 1 }, pan: { value: 0 }, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } } );
class Context {
	constructor() { this.destination = {}; this.sampleRate = 44100; this.state = 'running'; this.sources = []; }
	createGain() { return node( 'gain' ); }
	createStereoPanner() { return node( 'pan' ); }
	createBuffer( channels, length, rate ) { return { channels, length, rate, data: new Float32Array( length ), getChannelData() { return this.data; } }; }
	createBufferSource() { const s = node( 'source' ); this.sources.push( s ); return s; }
	resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
}
const e1m7 = Mod_ForName( 'maps/e1m7.bsp', true );
const LAVA = sound.AMBIENT_LAVA;
const centre = l => [ 0, 1, 2 ].map( i => ( l.minmaxs[ i ] + l.minmaxs[ i + 3 ] ) / 2 );

Deno.test( 'the 1996 e1m7 has lava but no lava levels; they are worked out as vis does, and a map with its own is left alone', () => {

	const open = e1m7.leafs.filter( l => l.contents === - 1 );
	same( open.filter( l => l.ambient_sound_level[ LAVA ] > 0 ).length, 0, 'e1m7 as compiled: no lava levels' );
	const water = e1m7.leafs.map( l => l.ambient_sound_level[ sound.AMBIENT_WATER ] ), sky = e1m7.leafs.map( l => l.ambient_sound_level[ sound.AMBIENT_SKY ] );
	const filled = R_LavaLevelsFill( e1m7 );
	check( filled > 50, 'leaves given a lava level: ' + filled );
	const levels = open.map( l => l.ambient_sound_level[ LAVA ] );
	check( levels.some( v => v === 255 ) && levels.some( v => v > 0 && v < 255 ) && levels.some( v => v === 0 ), 'full beside the lava, fading, and silent far away' );
	check( e1m7.leafs.every( ( l, i ) => l.ambient_sound_level[ sound.AMBIENT_WATER ] === water[ i ] && l.ambient_sound_level[ sound.AMBIENT_SKY ] === sky[ i ] ), 'water and sky levels untouched' );
	same( R_LavaLevelsFill( e1m7 ), 0, 'a map with lava levels (now its own) is not filled again' );
	same( R_LavaLevelsFill( Mod_ForName( 'maps/e1m1.bsp', true ) ), 0, 'a map without lava: nothing' );

} );

Deno.test( 'the engine\'s lava sound is a 4-second loop that runs into its start, quietly, the same every time', () => {

	const wav = SYNTH_Sound( LAVA_SOUND ), info = GetWavinfo( LAVA_SOUND, wav, wav.length );
	same( info.channels, 1, 'mono' ); same( info.rate, SYNTH_RATE, 'Quake\'s rate' ); same( info.width, 2, '16-bit' );
	same( info.loopstart, 0, 'loops from its start' ); same( info.samples, SYNTH_RATE * 4, 'four seconds' );
	const pcm = new Int16Array( wav.buffer.slice( info.dataofs, info.dataofs + info.samples * 2 ) );
	const peak = Math.max( ...Array.from( pcm, Math.abs ) ) / 32767;
	check( peak > 0.15 && peak < 0.85, 'audible and never clipped: ' + peak );
	check( Math.abs( pcm[ pcm.length - 1 ] - pcm[ 0 ] ) / 32767 < 0.05, 'no click where it loops' );
	same( createHash( 'sha256' ).update( SYNTH_Sound( LAVA_SOUND ) ).digest( 'hex' ), createHash( 'sha256' ).update( wav ).digest( 'hex' ), 'made once, the same bytes' );
	same( SYNTH_Sound( 'ambience/nonesuch.wav' ), null, 'no other sound is made up' );

} );

// with sound started, e1m7, Newer Game and s_lava on, standing at `where` for `frames` updates
function listen( where, frames = 40, setup = () => {} ) {

	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' ), world = cl.worldmodel;
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
	try {

		dma.S_Init(); dma.S_SetCallbacks( { getHostFrametime: () => .1 } );
		cl.worldmodel = e1m7; Cvar_Set( 'r_hdr', '1' ); Cvar_Set( 's_lava', '1' ); R_AnimSetClassicPass( false );
		setup();
		for ( let i = 0; i < frames; i ++ ) dma.S_Update( where, [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] );
		const ch = sound.channels[ LAVA ];
		return { name: ch.sfx?.name ?? null, vol: ch.master_vol, water: sound.channels[ sound.AMBIENT_WATER ].master_vol, sky: sound.channels[ sound.AMBIENT_SKY ].master_vol, cache: ch.sfx ? S_LoadSound( ch.sfx ) : null };

	} finally {

		dma.S_Shutdown(); cl.worldmodel = world; Cvar_Set( 's_lava', '1' ); Cvar_Set( 'r_hdr', '1' );
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;

	}

}

Deno.test( 'standing by the lava, the lava channel plays the lava\'s sound, faded in to the leaf\'s level; away from it, silence', () => {

	R_LavaLevelsFill( e1m7 );
	const leaves = e1m7.leafs.filter( l => l.contents === - 1 );
	const hot = leaves.find( l => l.ambient_sound_level[ LAVA ] === 255 ), cold = leaves.find( l => l.ambient_sound_level.every( v => v === 0 ) );
	const near = listen( centre( hot ) );
	same( near.name, LAVA_SOUND, 'the lava channel\'s sound' );
	same( Math.round( near.vol ), Math.round( Cvar_VariableValue( 'ambient_level' ) * 255 ), 'faded in to ambient_level of the leaf\'s 255' );
	check( near.cache && near.cache.loopstart === 0, 'loaded through the sound cache, looping' );
	same( listen( centre( cold ) ).vol, 0, 'away from lava it is silent' );
	const was = cl.worldmodel; cl.worldmodel = e1m7; try { check( S_LavaSnapshot().hasLava, 'the map is known to have lava' ); } finally { cl.worldmodel = was; }

} );

Deno.test( 'New Game and s_lava 0 keep the channel as it always was: silent; water and sky are unchanged', () => {

	R_LavaLevelsFill( e1m7 );
	const hot = e1m7.leafs.find( l => l.contents === - 1 && l.ambient_sound_level[ LAVA ] === 255 ), at = centre( hot );
	const on = listen( at );
	for ( const [ name, setup ] of [ [ 'New Game', () => Cvar_Set( 'r_hdr', '0' ) ], [ 's_lava 0', () => Cvar_Set( 's_lava', '0' ) ] ] ) {

		const off = listen( at, 40, setup ); R_AnimSetClassicPass( false );
		same( off.vol, 0, name + ': the lava channel silent' );
		same( off.water, on.water, name + ': water as before' ); same( off.sky, on.sky, name + ': sky as before' );

	}

} );

Deno.test( 'a restart of the same map (its leaves loaded again, without the filled levels) fills them again', () => {

	R_LavaLevelsFill( e1m7 ); const was = cl.worldmodel; cl.worldmodel = e1m7;
	try {

		check( S_LavaSnapshot().hasLava, 'before' );
		Mod_ClearAll(); const again = Mod_ForName( 'maps/e1m7.bsp', true );
		same( again, e1m7, 'the same model, as a restart keeps it' );
		const snap = S_LavaSnapshot();
		check( snap.filled > 50 && again.leafs.some( l => l.ambient_sound_level[ LAVA ] > 0 ), 'filled again: ' + snap.filled );

	} finally { cl.worldmodel = was; }

} );

Deno.test( 'in New Game the made sound is not offered: a sound the game lacks stays missing, as always', () => {

	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
	try {

		dma.S_Init(); Cvar_Set( 'r_hdr', '0' );
		same( S_LoadSound( dma.S_PrecacheSound( LAVA_SOUND ) ), null, 'New Game: the shareware has no lava1.wav, so none' );
		dma.S_Shutdown(); dma.S_Init(); Cvar_Set( 'r_hdr', '1' );
		check( S_LoadSound( dma.S_PrecacheSound( LAVA_SOUND ) )?.loopstart === 0, 'Newer Game: the made one' );

	} finally {

		dma.S_Shutdown(); Cvar_Set( 'r_hdr', '1' );
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;

	}

} );

Deno.test( 'a game\'s own ambience/lava1.wav wins over the engine\'s made one', () => {

	const own = new Uint8Array( 44 + 200 ), v = new DataView( own.buffer );
	const tag = ( at, s ) => { for ( let i = 0; i < 4; i ++ ) own[ at + i ] = s.charCodeAt( i ); };
	tag( 0, 'RIFF' ); v.setUint32( 4, own.length - 8, true ); tag( 8, 'WAVE' ); tag( 12, 'fmt ' ); v.setUint32( 16, 16, true );
	v.setUint16( 20, 1, true ); v.setUint16( 22, 1, true ); v.setUint32( 24, 11025, true ); v.setUint32( 28, 11025, true ); v.setUint16( 32, 1, true ); v.setUint16( 34, 8, true );
	tag( 36, 'data' ); v.setUint32( 40, 200, true ); own.fill( 200, 44 );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'own.pak', pak.COM_BuildPack( [ { name: 'sound/' + LAVA_SOUND, data: own } ] ) ) );
	const heard = listen( centre( e1m7.leafs.find( l => l.contents === - 1 && l.ambient_sound_level[ LAVA ] === 255 ) ) );
	same( heard.name, LAVA_SOUND, 'the same name' );
	same( heard.cache.length, 200 * sound.shm.speed / 11025, 'the game\'s own 200 samples (at the mixer\'s rate), not the made four seconds' );

} );
