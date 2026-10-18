// Independent public electrical-event adapter -> real Quake spatializer -> SFX
// master proof. Browser media/output nodes are endpoint doubles. Native QC event
// provenance is checked separately in electric_native_test.js; these tests keep
// placement, full-clip lifecycle and overload/error cases deterministic.
import assert from 'node:assert/strict';
import { cl, cls, cl_entities, ca_connected } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { sv } from '../src/engine/server/server.js';
import { in_attack } from '../src/engine/client/cl_input.js';
import { IT_LIGHTNING, STAT_WEAPON, STAT_CELLS } from '../src/engine/common/quakedef.js';
import * as vars from '../src/engine/common/cvar.js';
import * as keys from '../src/engine/client/keys.js';
import * as sound from '../src/engine/sound/sound.js';
import * as dma from '../src/engine/sound/snd_dma.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { ELECTRIC_ROLES, ELECTRIC_TRACK_URLS, closestPointOnElectricStream,
 S_ElectricEvent, S_UpdateElectricSounds, S_ElectricSoundsReset,
 S_ElectricSoundsShutdown, S_GetElectricSoundsStatus } from '../src/newer/sound/s_electricsounds.js';

class Media {
 constructor() { this.paused = true; this.currentTime = 0; this.duration = 31; this.readyState = 4; this.plays = 0; this.pauses = 0; this.seeks = []; this._time = 0; this.history = []; }
 set currentTime( value ) { this._time = value; this.seeks?.push( value ); }
 get currentTime() { return this._time; }
 play() { this.plays++; this.history.push( { src: this.src, time: this.currentTime } ); this.paused = false; if ( this.rejection ) return Promise.reject( this.rejection ); return this.pending || Promise.resolve(); }
 pause() { this.pauses++; this.paused = true; }
 removeAttribute() { this.src = ''; }
 load() { this.loaded = true; }
 addEventListener() {} removeEventListener() {}
 end() { this.paused = true; this.onended?.(); }
}
class Context {
 constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = {}; this.nodes = []; }
 node( kind ) { const n = { kind, connect( target ) { this.target = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( n ); return n; }
 createGain() { return Object.assign( this.node( 'gain' ), { gain: { value: 0 } } ); }
 createStereoPanner() { return Object.assign( this.node( 'pan' ), { pan: { value: 0 } } ); }
 createMediaElementSource( media ) { const n = this.node( 'source' ); media.node = n; return n; }
 close() { this.state = 'closed'; return Promise.resolve(); }
}
const near = ( actual, expected, message, tolerance = 1e-6 ) => assert.ok( Math.abs( actual - expected ) <= tolerance, `${message}: ${actual} vs ${expected}` );
const vec = ( actual, expected, message ) => { assert.equal( actual.length, 3 ); actual.forEach( ( n, i ) => near( n, expected[ i ], `${message}[${i}]` ) ); };
const role = ( state, name ) => state.voices.filter( v => v.role === name && v.playing );
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
async function game( run ) {
 const saved = new Map( [ 'window', 'document', 'Audio' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) ), media = [];
 let nextMedia = null;
 try {
  Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context, location: { search: '', pathname: '/' } } } );
  Object.defineProperty( globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } } );
  Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends Media { constructor() { super(); if ( nextMedia ) { Object.assign( this, nextMedia ); nextMedia = null; } media.push( this ); } } } );
  if ( ! vars.Cvar_FindVar( 'r_hdr' ) ) vars.Cvar_RegisterVariable( r_hdr ); vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );
  sv.active = false; sv.paused = false; CL_ClearState(); S_ElectricSoundsReset(); dma.S_Init();
  vars.Cvar_SetValue( 'nosound', 0 ); sound.volume.value = 1; sound.bgmvolume.value = 1;
  cls.demoplayback = false; cls.state = ca_connected; cls.signon = 4; cl.time = 10; cl.worldmodel = { name: 'maps/electric-spatial-fixture.bsp' }; cl.stats[ 0 ] = 100; cl.paused = false; cl.intermission = 0; cl.viewentity = 1; cl.stats[ STAT_WEAPON ] = IT_LIGHTNING; cl.stats[ STAT_CELLS ] = 100; in_attack.state = 1;
  cl_entities[ 1 ].origin.set( [ 0, 0, 0 ] ); cl_entities[ 2 ].origin.set( [ 0, 100, 0 ] );
  sound.listener_origin.fill( 0 ); sound.listener_right.set( [ 0, 1, 0 ] ); keys.set_key_dest( keys.key_game );
  const step = async ( dt = .01 ) => { cl.time += dt; dma.S_GetAudioContext().currentTime += dt; S_UpdateElectricSounds(); await tick(); return S_GetElectricSoundsStatus(); };
  const event = ( changes = {} ) => S_ElectricEvent( { kind: 'pulse', actor: 'player', entity: 1, time: cl.time, source: [ 0, 0, 0 ], start: [ 0, 0, 0 ], end: [ 1000, 0, 0 ], hits: [], water: [], traces: [], liquidDischarge: false, waterDischarge: false, ...changes } );
  await step(); await run( { step, event, media, next: options => { nextMedia = options; } } );
 } finally {
  S_ElectricSoundsShutdown(); dma.S_Shutdown(); sound.volume.value = 1; sound.bgmvolume.value = 1; cls.demoplayback = false;
  for ( const [ key, descriptor ] of saved ) { if ( descriptor ) Object.defineProperty( globalThis, key, descriptor ); else delete globalThis[ key ]; }
 }
}

Deno.test( 'electrical role contract keeps every owner-selected full clip and alternate', () => {
 assert.deepEqual( ELECTRIC_ROLES.charge, [ 3, 9 ] ); assert.deepEqual( ELECTRIC_ROLES.shamblerStop, [ 8 ] );
 assert.deepEqual( ELECTRIC_ROLES.firing, [ 20 ] ); assert.deepEqual( ELECTRIC_ROLES.playerStop, [ 10, 5 ] );
 assert.deepEqual( ELECTRIC_ROLES.hit, [ 6, 14 ] ); assert.deepEqual( ELECTRIC_ROLES.miss, [ 2, 12 ] );
 assert.deepEqual( ELECTRIC_ROLES.water, [ 4, 10 ] ); assert.deepEqual( ELECTRIC_ROLES.eel, [ 28 ] );
 for ( const index of new Set( Object.values( ELECTRIC_ROLES ).flat() ) ) assert.ok( ELECTRIC_TRACK_URLS[ index ]?.endsWith( '.mp3' ), `clip ${index} is a bundled full MP3` );
} );
Deno.test( 'electric stream anchor is the clamped nearest point, including degenerate beams', () => {
 const start = [ 0, 0, 0 ], end = [ 1000, 0, 0 ];
 vec( closestPointOnElectricStream( start, end, [ 10, 50, 0 ] ), [ 10, 0, 0 ], 'near stream source, not midpoint' );
 vec( closestPointOnElectricStream( start, end, [ -20, 10, 0 ] ), start, 'before source' );
 vec( closestPointOnElectricStream( start, end, [ 1020, 10, 0 ] ), end, 'past contact' );
 vec( closestPointOnElectricStream( start, start, [ 10, 50, 0 ] ), start, 'zero-length stream' );
 assert.deepEqual( start, [ 0, 0, 0 ] ); assert.deepEqual( end, [ 1000, 0, 0 ] );
} );
Deno.test( 'charge originates at its moving source and real stereo reverses with listener orientation', () => game( async ( { event, step, media } ) => {
 event( { kind: 'charge', actor: 'shambler', entity: 2, source: [ 0, 100, 0 ] } );
 let voice = role( await step(), 'charge' )[ 0 ]; assert.ok( voice && voice.pan > 0 && voice.gain > 0 );
 const id = voice.id, firstPan = voice.pan, firstGain = voice.gain;
 sound.listener_right.set( [ 0, -1, 0 ] ); voice = role( await step(), 'charge' )[ 0 ]; near( voice.pan, -firstPan, 'listener reversal swaps ears' );
 sound.listener_right.set( [ 0, 1, 0 ] ); cl_entities[ 2 ].origin.set( [ 0, -100, 0 ] );
 voice = role( await step(), 'charge' )[ 0 ]; assert.equal( voice.id, id ); vec( voice.position, [ 0, -100, 0 ], 'moving source' ); assert.ok( voice.pan < 0 );
 cl_entities[ 2 ].origin.set( [ 0, -500, 0 ] ); voice = role( await step(), 'charge' )[ 0 ]; assert.ok( voice.gain < firstGain && voice.gain >= 0, 'actual spatializer attenuates with distance' );
 cl_entities[ 2 ].origin.set( [ 0, -100000, 0 ] ); voice = role( await step(), 'charge' )[ 0 ]; assert.equal( voice.gain, 0, 'distance floor is silent without killing full clip' ); assert.equal( media[ 0 ].paused, false );
 let node = media[ 0 ].node; const path = []; while ( node && path.length < 6 ) { path.push( node ); node = node.target; }
 const gainNode = path.find( n => n.kind === 'gain' ); assert.equal( gainNode.channelCount, 1, 'recorded stereo is downmixed before positional stereo' ); assert.equal( gainNode.channelCountMode, 'explicit' );
 assert.ok( path.some( n => n.kind === 'pan' ), 'voice has a real StereoPanner node' ); assert.ok( path.includes( dma.S_GetMasterGain() ), 'routes through existing SFX master' );
 const gain = voice.gain; sound.bgmvolume.value = 0; voice = role( await step(), 'charge' )[ 0 ]; assert.equal( voice.gain, gain, 'music slider cannot change effects gain' );
} ) );
Deno.test( 'player stream follows nearest beam point while damage and water remain at actual contacts', () => game( async ( { event, step } ) => {
 sound.listener_origin.set( [ 10, 50, 0 ] );
 event( { hits: [ { target: 2, position: [ 900, 30, 8 ], healthLoss: 30, armorLoss: 0 } ], water: [ [ 350, -50, 4 ] ] } );
 let state = await step(), beam = role( state, 'firing' )[ 0 ], hit = role( state, 'hit' )[ 0 ], water = role( state, 'water' )[ 0 ];
 assert.ok( beam && hit && water, 'independent stream and both contact layers are audible' );
 vec( beam.position, [ 10, 0, 0 ], 'stream' ); vec( hit.position, [ 900, 30, 8 ], 'target contact' ); vec( water.position, [ 350, -50, 4 ], 'water contact' ); assert.ok( beam.pan < 0 );
 sound.listener_origin.set( [ 800, 50, 0 ] ); cl_entities[ 2 ].origin.set( [ -300, -300, 0 ] ); state = await step();
 vec( role( state, 'firing' )[ 0 ].position, [ 800, 0, 0 ], 'listener walks along stream' );
 vec( role( state, 'hit' )[ 0 ].position, [ 900, 30, 8 ], 'impact does not follow moving victim' ); vec( role( state, 'water' )[ 0 ].position, [ 350, -50, 4 ], 'water remains fixed' );
} ) );
Deno.test( 'ordinary charge, firing and release transitions preserve all full-file tails and never seek past the start', () => game( async ( { event, step, media } ) => {
 event( { kind: 'charge', actor: 'shambler', entity: 2, source: [ 0, 100, 0 ] } ); let state = await step(); const charge = role( state, 'charge' )[ 0 ];
 const chargeMedia = media.find( m => m.src === ELECTRIC_TRACK_URLS[ charge.clip ] ); chargeMedia.currentTime = 3;
 event( { actor: 'shambler', entity: 2, source: [ 0, 100, 0 ] } ); await step();
 event( { kind: 'stop', actor: 'shambler', entity: 2, source: [ 0, 100, 0 ] } ); state = await step();
 assert.equal( chargeMedia.paused, false ); assert.equal( chargeMedia.currentTime, 3, 'phase change does not rewind or cut charge' ); assert.equal( role( state, 'shamblerStop' ).length, 1 );
 const chargeGain = role( state, 'charge' )[ 0 ].gain; state = await step( 8 ); assert.equal( role( state, 'charge' )[ 0 ].gain, chargeGain, 'no artificial charge tail fade or deadline' ); assert.equal( chargeMedia.paused, false );
 const beforePlayer = media.length; event(); state = await step(); const firing = role( state, 'firing' ).find( v => v.entity === 1 ), firingMedia = media.slice( beforePlayer ).find( m => m.src === ELECTRIC_TRACK_URLS[ firing.clip ] ); firingMedia.currentTime = 4;
 for ( let i = 0; i < 8; i++ ) { event(); await step( .05 ); }
 assert.equal( firingMedia.plays, 1, 'confirmed pulses do not restart full firing file' );
 in_attack.state = 0; state = await step( .26 ); assert.equal( role( state, 'playerStop' ).length, 1 ); assert.equal( firingMedia.paused, false ); assert.equal( firingMedia.currentTime, 4 );
 const stopCount = media.filter( m => [ ELECTRIC_TRACK_URLS[ 10 ], ELECTRIC_TRACK_URLS[ 5 ] ].includes( m.src ) ).length;
 await step( .3 ); assert.equal( media.filter( m => [ ELECTRIC_TRACK_URLS[ 10 ], ELECTRIC_TRACK_URLS[ 5 ] ].includes( m.src ) ).length, stopCount, 'release emitted once' );
 for ( const m of media ) { assert.equal( m.loop, false, 'no artificial media looping/truncation' ); assert.ok( m.seeks.every( value => value === 0 || value === 3 || value === 4 ), 'only playback from complete file start' ); }
} ) );
Deno.test( 'firing repeats a whole file only after natural ending while new native pulses still confirm activity', () => game( async ( { event, step, media } ) => {
 event(); let state = await step(); const firing = role( state, 'firing' )[ 0 ], first = media.find( m => m.src === ELECTRIC_TRACK_URLS[ firing.clip ] );
 event(); await step( .05 ); assert.equal( first.plays, 1 ); first.end(); event(); state = await step( .05 );
 assert.equal( role( state, 'firing' ).length, 1 ); assert.equal( media.reduce( ( sum, m ) => sum + m.history.filter( entry => entry.src === ELECTRIC_TRACK_URLS[ 20 ] ).length, 0 ), 2 );
 for ( const m of media.filter( m => m.src === ELECTRIC_TRACK_URLS[ 20 ] ) ) m.end(); in_attack.state = 0; await step( .26 );
 assert.equal( media.reduce( ( sum, m ) => sum + m.history.filter( entry => entry.src === ELECTRIC_TRACK_URLS[ 20 ] ).length, 0 ), 2, 'release and natural end in one frame cannot start another firing file' );
 state = await step( 2 ); assert.equal( role( state, 'firing' ).length, 0, 'natural end after release does not restart' );
} ) );
Deno.test( 'voice overload drops new cues rather than cutting existing full clips and completed slots recover', () => game( async ( { event, step, media } ) => {
 for ( let i = 0; i < 40; i++ ) { const index = 20 + i; if ( cl_entities[ index ] ) cl_entities[ index ].origin.set( [ 0, i, 0 ] ); event( { kind: 'charge', actor: 'shambler', entity: index, source: [ 0, i, 0 ] } ); }
 let state = await step(); assert.ok( state.voices.length <= 24 ); assert.ok( state.dropped > 0 ); assert.equal( media.length, 24 );
 assert.ok( media.every( m => ! m.paused && m.plays === 1 ), 'pool saturation never steals playing media' );
 media[ 0 ].end(); await step(); event( { kind: 'charge', actor: 'shambler', entity: 100, source: [ 0, 20, 0 ] } ); state = await step();
 assert.equal( state.voices.filter( v => v.playing ).length, 24, 'natural completion makes capacity available' ); assert.ok( media.slice( 1, 24 ).every( m => ! m.paused && m.plays === 1 ) );
} ) );
Deno.test( 'eel zap is spatial at its emitter; malformed events cannot create voices', () => game( async ( { event, step, media } ) => {
 event( { actor: 'eel', entity: 2, source: [ 0, 100, 0 ] } ); const state = await step(), eel = role( state, 'eel' )[ 0 ];
 assert.equal( eel.clip, 28 ); assert.ok( eel.pan > 0 ); vec( eel.position, [ 0, 100, 0 ], 'eel source' );
 const count = media.length; event( { source: [ NaN, 0, 0 ], start: [ NaN, 0, 0 ] } ); event( { kind: 'invalid' } ); await step(); assert.equal( media.length, count );
} ) );
Deno.test( 'pause, death, disconnect, menu and world reset stop safely without fabricating release cues', () => game( async ( { event, step, media } ) => {
 const cases = [
  [ () => { cl.paused = true; }, () => { cl.paused = false; } ],
  [ () => { cl.stats[ 0 ] = 0; }, () => { cl.stats[ 0 ] = 100; } ],
  [ () => { cls.signon = 0; }, () => { cls.signon = 4; } ],
  [ () => keys.set_key_dest( keys.key_menu ), () => keys.set_key_dest( keys.key_game ) ],
  [ () => { cl.worldmodel = { name: 'maps/electric-next.bsp' }; }, () => {} ]
 ];
 for ( const [ stop, resume ] of cases ) {
  in_attack.state = 1; event(); await step(); const count = media.length; stop(); await step(); assert.ok( media.every( m => m.paused ) ); assert.equal( media.length, count, 'lifecycle stop has no release sound' ); resume(); await step();
 }
} ) );
Deno.test( 'closed audio, rejected playback and late play resolution remain bounded and cannot revive old voices', () => game( async ( { event, step, media, next } ) => {
 dma.S_GetAudioContext().state = 'closed'; event( { kind: 'charge', actor: 'shambler', entity: 2 } ); await step(); assert.equal( media.length, 0 ); dma.S_GetAudioContext().state = 'running';
 next( { rejection: new Error( 'decoder refused' ) } ); event( { kind: 'charge', actor: 'shambler', entity: 2 } ); await step(); const rejected = media[ 0 ]; assert.ok( rejected );
 for ( let i = 0; i < 10; i++ ) await step(); assert.equal( rejected.plays, 1, 'failed decoder is not retried every frame' );
 let resolve; next( { pending: new Promise( r => { resolve = r; } ) } ); event( { kind: 'charge', actor: 'shambler', entity: 3, source: [ 0, 20, 0 ] } ); await step(); const pending = media.at( -1 );
 S_ElectricSoundsShutdown(); resolve(); await tick(); assert.equal( pending.paused, true ); assert.ok( media.every( m => m.loaded && m.src === '' ), 'all media is unloaded on shutdown' );
} ) );
Deno.test( 'distinct hit targets keep their own contacts, and repeated pulses cannot restart an existing impact tail', () => game( async ( { event, step, media } ) => {
 const hits = [ { target: 2, position: [ 0, 200, 0 ], healthLoss: 10, armorLoss: 0 }, { target: 3, position: [ 0, -200, 0 ], healthLoss: 10, armorLoss: 0 } ];
 event( { hits } ); let state = await step(); const impacts = role( state, 'hit' ); assert.equal( impacts.length, 2, 'two victims have distinct contact voices' );
 assert.ok( impacts.some( v => v.pan > 0 ) && impacts.some( v => v.pan < 0 ), 'victims on opposite sides are separately panned' );
 const ids = impacts.map( v => v.id ).sort(), before = media.map( m => [ m, m.plays, m.pauses ] );
 event( { hits } ); state = await step( .05 ); assert.deepEqual( role( state, 'hit' ).map( v => v.id ).sort(), ids, 'rapid repeated pulses coalesce while impact files are playing' );
 for ( const [ m, plays, pauses ] of before ) { assert.equal( m.plays, plays ); assert.equal( m.pauses, pauses ); }
} ) );
Deno.test( 'approved charge and player release alternates advance between complete natural one-shots', () => game( async ( { event, step, media } ) => {
 event( { kind: 'charge', actor: 'shambler', entity: 2, source: [ 0, 100, 0 ] } ); let state = await step(); assert.equal( role( state, 'charge' )[ 0 ].clip, 3 );
 for ( const m of media ) m.end(); await step(); event( { kind: 'charge', actor: 'shambler', entity: 2, source: [ 0, 100, 0 ] } ); state = await step(); assert.equal( role( state, 'charge' )[ 0 ].clip, 9 );
 for ( const expected of [ 10, 5 ] ) {
  for ( const m of media ) m.end(); in_attack.state = 1; event(); await step(); in_attack.state = 0; state = await step( .26 ); assert.equal( role( state, 'playerStop' )[ 0 ].clip, expected );
 }
} ) );
Deno.test( 'a full source tail freezes when its emitter disappears and cannot follow a recycled entity slot', () => game( async ( { event, step, media } ) => {
 event( { kind: 'charge', actor: 'shambler', entity: 2, source: [ 0, 100, 0 ] } ); await step();
 cl_entities[ 2 ].origin.set( [ 0, 80, 0 ] ); let state = await step(); vec( role( state, 'charge' )[ 0 ].position, [ 0, 80, 0 ], 'last living source position' );
 cl_entities[ 2 ].free = true; cl_entities[ 2 ].origin.set( [ 0, -200, 0 ] ); state = await step(); vec( role( state, 'charge' )[ 0 ].position, [ 0, 80, 0 ], 'freed source leaves natural tail at last location' );
 cl_entities[ 2 ].free = false; cl_entities[ 2 ].origin.set( [ 0, -400, 0 ] ); state = await step(); vec( role( state, 'charge' )[ 0 ].position, [ 0, 80, 0 ], 'recycled slot cannot drag old voice' );
 assert.equal( media[ 0 ].paused, false, 'source retirement preserves the complete admitted clip' );
} ) );
Deno.test( 'player release waits for both the pulse hold and actual cessation, and cannot restart an ended file while ceased', () => game( async ( { event, step, media } ) => {
 event(); await step(); const firingMedia = media.find( m => m.src === ELECTRIC_TRACK_URLS[ 20 ] ); assert.ok( firingMedia );
 in_attack.state = 0; let state = await step( .1 ); assert.equal( role( state, 'playerStop' ).length, 0, 'release within the confirmed pulse hold is not yet a stop' );
 firingMedia.end(); state = await step( .05 ); assert.equal( role( state, 'playerStop' ).length, 0 );
 const firingPlays = () => media.reduce( ( sum, m ) => sum + m.history.filter( entry => entry.src === ELECTRIC_TRACK_URLS[ 20 ] ).length, 0 );
 assert.equal( firingPlays(), 1, 'a natural end while input has ceased cannot restart a firing file inside the hold' );
 in_attack.state = 1; state = await step( .2 ); assert.equal( role( state, 'playerStop' ).length, 0, 'an old pulse timeout alone cannot invent a release while firing remains held' );
 assert.equal( firingPlays(), 1, 'expired pulse authority cannot start another full firing file merely because input remains held' );
 in_attack.state = 0; state = await step(); assert.equal( role( state, 'playerStop' ).length, 1, 'cessation after the hold produces one stop cue' );
 const stopPlays = () => media.reduce( ( sum, m ) => sum + m.history.filter( entry => [ ELECTRIC_TRACK_URLS[ 10 ], ELECTRIC_TRACK_URLS[ 5 ] ].includes( entry.src ) ).length, 0 );
 assert.equal( stopPlays(), 1 ); await step( .5 ); assert.equal( stopPlays(), 1, 'idle frames cannot produce a second release' );
} ) );
Deno.test( 'weapon changes and cell exhaustion respect the same confirmed-pulse hold before the single player stop', async () => {
 for ( const cease of [ () => { cl.stats[ STAT_WEAPON ] = 2; }, () => { cl.stats[ STAT_CELLS ] = 0; } ] ) await game( async ( { event, step, media } ) => {
  event(); await step(); cease(); let state = await step( .1 ); assert.equal( role( state, 'playerStop' ).length, 0 );
  state = await step( .16 ); assert.equal( role( state, 'playerStop' ).length, 1 );
  const stops = media.reduce( ( sum, m ) => sum + m.history.filter( entry => [ ELECTRIC_TRACK_URLS[ 10 ], ELECTRIC_TRACK_URLS[ 5 ] ].includes( entry.src ) ).length, 0 );
  await step( .5 ); assert.equal( media.reduce( ( sum, m ) => sum + m.history.filter( entry => [ ELECTRIC_TRACK_URLS[ 10 ], ELECTRIC_TRACK_URLS[ 5 ] ].includes( entry.src ) ).length, 0 ), stops );
 } );
} );
Deno.test( 'an emitter freed and recycled entirely between frames cannot move its former full-clip tail', () => game( async ( { event, step, media } ) => {
 const emitter = cl_entities[ 2 ]; emitter.freetime = 0;
 event( { kind: 'charge', actor: 'shambler', entity: 2, source: [ 0, 100, 0 ] } ); await step();
 // ED_Free and ED_Alloc reuse the same native object. Its lifetime stamp changes
 // even when both transitions happen before the next sound frame sees .free.
 emitter.freetime = 1; emitter.free = false; emitter.origin.set( [ 0, -400, 0 ] ); let state = await step();
 vec( role( state, 'charge' )[ 0 ].position, [ 0, 100, 0 ], 'recycled lifetime leaves old tail at its former source' ); assert.equal( media[ 0 ].paused, false );
 emitter.origin.set( [ 0, -800, 0 ] ); state = await step(); vec( role( state, 'charge' )[ 0 ].position, [ 0, 100, 0 ], 'retired lifetime stays frozen' );
} ) );
Deno.test( 'rejected contact playback coalesces repeated native pulses instead of filling the voice pool with failures', () => game( async ( { event, step, media, next } ) => {
 const hits = [ { target: 2, position: [ 0, 100, 0 ], healthLoss: 1, armorLoss: 0 } ];
 next( { rejection: new Error( 'contact decoder refused' ) } ); event( { hits } ); await step();
 for ( let i = 0; i < 40; i++ ) { event( { hits } ); await step( .05 ); }
 const state = S_GetElectricSoundsStatus(), impacts = state.voices.filter( voice => voice.role === 'hit' );
 assert.equal( impacts.length, 1, 'one failed contact key remains one observable failed voice' ); assert.equal( impacts[ 0 ].blocked, true ); assert.equal( impacts[ 0 ].playing, false );
 assert.equal( media.reduce( ( sum, m ) => sum + m.history.filter( entry => [ ELECTRIC_TRACK_URLS[ 6 ], ELECTRIC_TRACK_URLS[ 14 ] ].includes( entry.src ) ).length, 0 ), 1, 'failed contact is never retried per pulse' );
 assert.equal( state.dropped, 0, 'decoder failure cannot consume every available slot' ); assert.equal( media.length, 2, 'only one contact and one complete firing file allocated' );
} ) );
