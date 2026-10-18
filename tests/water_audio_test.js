// Independent end-to-end adapter tests. Client BSP geometry drives the real water
// observation and public audio update; only browser audio endpoints are doubled.
import assert from 'node:assert/strict';
import { cl, cls, cl_entities, ca_connected, SIGNONS } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { sv } from '../src/engine/server/server.js';
import * as vars from '../src/engine/common/cvar.js';
import * as keys from '../src/engine/client/keys.js';
import * as sound from '../src/engine/sound/sound.js';
import * as dma from '../src/engine/sound/snd_dma.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { STAT_HEALTH, IT_SUIT } from '../src/engine/common/quakedef.js';
import { CL_WaterReset } from '../src/newer/gameplay/cl_water.js';
import { S_UpdatePlayerWater, S_GetPlayerWaterStatus, S_PlayerWaterShutdown, WATER_TRACK_URLS, WATER_WALK_FADE_IN, WATER_WALK_FADE_OUT } from '../src/newer/sound/s_playerwater.js';

class Media {
 constructor() { this.paused = true; this.currentTime = 0; this.readyState = 4; this.duration = 20; this.plays = 0; this.events = new Map(); }
 addEventListener( type, fn ) { this.events.set( type, fn ); }
 removeEventListener( type ) { this.events.delete( type ); }
 play() { this.plays++; if ( this.rejection ) return Promise.reject( this.rejection ); this.paused = false; return this.pending || Promise.resolve(); }
 pause() { this.paused = true; }
 removeAttribute() { this.src = ''; }
 load() { this.loaded = true; }
}
class Context {
 constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = {}; this.nodes = []; }
 createGain() { const node = { gain: { value: 0, cancelScheduledValues() {}, setValueAtTime( v ) { this.value = v; }, linearRampToValueAtTime( v ) { this.value = v; }, setTargetAtTime( v ) { this.value = v; } }, connect( target ) { this.target = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( node ); return node; }
 createMediaElementSource( media ) { const node = { media, connect( target ) { this.target = target; media.bus = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( node ); return node; }
 resume() { return Promise.resolve(); }
 close() { this.state = 'closed'; return Promise.resolve(); }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
async function game( run ) {
 const descriptors = new Map( [ 'window', 'document', 'Audio' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) ), media = [];
 try {
  Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
  Object.defineProperty( globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } } );
  Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends Media { constructor() { super(); media.push( this ); } } } );
  if ( ! vars.Cvar_FindVar( 'r_hdr' ) ) vars.Cvar_RegisterVariable( r_hdr );
  vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'nosound', 0 ); sound.volume.value = 1; sound.bgmvolume.value = 1; R_AnimSetClassicPass( false );
  sv.active = false; sv.paused = false; CL_ClearState(); CL_WaterReset(); dma.S_Init();
  cls.demoplayback = true; cls.demofile = {}; cls.state = ca_connected; cls.signon = SIGNONS; cl.viewentity = 1; cl.viewheight = 22; cl.onground = true; cl.time = 10;
  cl.worldmodel = { nodes: [ { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, children: [ { contents: -1 }, { contents: -3 } ] } ] };
  cl.stats[ STAT_HEALTH ] = 100; cl.paused = false; cl.intermission = 0; cl.items = 0; keys.set_key_dest( keys.key_game );
  const origin = cl_entities[ 1 ].origin; origin.set( [ 0, 0, 40 ] ); cl.velocity.fill( 0 );
  const step = async ( seconds = 0 ) => { cl.time += seconds; dma.S_GetAudioContext().currentTime += seconds; S_UpdatePlayerWater(); await flush(); return S_GetPlayerWaterStatus(); };
  const deck = key => media.find( m => m.src === WATER_TRACK_URLS[ key ] );
  await run( { origin, step, deck, media } );
 } finally {
  S_PlayerWaterShutdown(); dma.S_Shutdown(); vars.Cvar_SetValue( 'nosound', 0 ); vars.Cvar_SetValue( 'r_hdr', 1 ); sound.volume.value = 1; sound.bgmvolume.value = 1;
  for ( const [ key, descriptor ] of descriptors ) { if ( descriptor ) Object.defineProperty( globalThis, key, descriptor ); else delete globalThis[ key ]; }
 }
}

Deno.test( 'recorded player submersion starts entry once, loops underwater, and bubbles only during filling', () => game( async ( { origin, step, deck } ) => {
 await step(); origin[ 2 ] = -40; let state = await step();
 assert.equal( state.submerged, true );
 assert.equal( deck( 'enter' ).plays, 1 ); assert.equal( deck( 'enter' ).loop, false );
 assert.equal( deck( 'underwater' ).loop, true ); assert.equal( deck( 'underwater' ).paused, false );
 await step( 3 ); assert.equal( deck( 'bubbles' ).paused, false, 'consuming visual reserve bubbles' );
 for ( let i = 0; i < 12; i++ ) await step( .1 ); assert.equal( deck( 'enter' ).plays, 1, 'holding submerged does not restart entry' );
 await step( 9 ); assert.equal( deck( 'bubbles' ).paused, true, 'full face has finished filling' ); assert.equal( deck( 'underwater' ).paused, false );
 origin[ 2 ] = 40; await step(); assert.equal( deck( 'underwater' ).paused, true ); assert.equal( deck( 'bubbles' ).paused, true );
 origin[ 2 ] = -40; await step(); assert.equal( deck( 'enter' ).plays, 2, 'another genuine dive plays entry again' );
 cl.items |= IT_SUIT; await step( .1 ); assert.equal( deck( 'bubbles' ).paused, true, 'suit indicator is not a filling face' );
 assert.equal( deck( 'underwater' ).paused, false, 'suit does not remove underwater ambience' );
} ) );

Deno.test( 'wading uses quick fade-in and long fade-out when movement stops', () => game( async ( { origin, step, deck } ) => {
 assert.equal( WATER_WALK_FADE_IN, .12 ); assert.equal( WATER_WALK_FADE_OUT, 1.8 );
 origin[ 2 ] = 10; await step(); assert.ok( ! deck( 'walking' ) || deck( 'walking' ).paused, 'stationary shallow water stays silent' );
 cl.velocity[ 0 ] = 120; await step(); const full = await step( .2 );
 assert.ok( full.tracks.walking.gain > .9, 'quickly reaches walking gain' ); assert.equal( deck( 'walking' ).loop, true );
 cl.velocity.fill( 0 ); await step(); const tail = await step( .4 );
 assert.ok( tail.tracks.walking.gain > 0 && tail.tracks.walking.gain < full.tracks.walking.gain, 'stop produces an audible fading tail' );
 await step( 1.5 ); assert.equal( deck( 'walking' ).paused, true, 'long fade eventually stops the loop' );
 cl.velocity[ 0 ] = 120; await step(); await step( .2 ); origin[ 2 ] = -40; await step( 2 );
 assert.equal( deck( 'walking' ).paused, true, 'swimming does not sustain shallow-water walking' );
} ) );

Deno.test( 'water sounds use Sound Volume bus and stop on pause, hide, death, Classic and disconnect', () => game( async ( { origin, step, deck, media } ) => {
 origin[ 2 ] = -40; await step();
 for ( const key of [ 'underwater', 'enter', 'bubbles' ] ) {
  const m = deck( key ); if ( m ) assert.equal( m.bus.target, dma.S_GetMasterGain(), key + ' routes through existing effects gain' );
 }
 sound.bgmvolume.value = 0; await step( .2 ); assert.equal( deck( 'underwater' ).paused, false, 'Music Volume does not mute effects' );
 const cases = [
  [ () => { cl.paused = true; }, () => { cl.paused = false; } ],
  [ () => { document.hidden = true; }, () => { document.hidden = false; } ],
  [ () => { cl.stats[ STAT_HEALTH ] = 0; }, () => { cl.stats[ STAT_HEALTH ] = 100; } ],
  [ () => vars.Cvar_SetValue( 'r_hdr', 0 ), () => vars.Cvar_SetValue( 'r_hdr', 1 ) ],
  [ () => { sound.volume.value = 0; }, () => { sound.volume.value = 1; } ],
  [ () => { cls.signon = 0; }, () => { cls.signon = SIGNONS; } ]
 ];
 for ( const [ stop, resume ] of cases ) {
  stop(); const state = await step(); assert.equal( state.active, false ); assert.ok( media.every( m => m.paused ), 'inactive policy pauses every owned deck immediately' );
  resume(); await step( .2 );
 }
} ) );

Deno.test( 'shutdown releases media and a late play promise cannot restart an exited water sound', () => game( async ( { origin, step, deck, media } ) => {
 origin[ 2 ] = -40; await step(); const underwater = deck( 'underwater' );
 origin[ 2 ] = 40; await step(); let resolve;
 underwater.pending = new Promise( r => { resolve = r; } ); origin[ 2 ] = -40; await step();
 origin[ 2 ] = 40; await step(); resolve(); await flush();
 assert.equal( underwater.paused, true ); assert.equal( S_GetPlayerWaterStatus().tracks.underwater.playing, false );
 S_PlayerWaterShutdown(); assert.ok( media.every( m => m.paused && m.loaded && m.src === '' ), 'shutdown unloads all media' );
 origin[ 2 ] = -40; await step(); assert.notEqual( deck( 'underwater' ), underwater, 'fresh deck after shutdown' );
} ) );
