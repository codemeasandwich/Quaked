// Independent static-sound parser -> environment audio proof. Browser audio
// endpoints are doubled; actual source placement and Quake spatialization run.
import assert from 'node:assert/strict';
import { cl, cls, cl_static_entities, ca_connected } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { sv } from '../src/engine/server/server.js';
import * as common from '../src/engine/common/common.js';
import { net_message } from '../src/engine/net/net.js';
import { svc_spawnstaticsound } from '../src/engine/common/protocol.js';
import * as vars from '../src/engine/common/cvar.js';
import * as keys from '../src/engine/client/keys.js';
import * as sound from '../src/engine/sound/sound.js';
import * as dma from '../src/engine/sound/snd_dma.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { r_torchfire } from '../src/newer/render/r_torchfire.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { R_AmbientPlaces, R_AmbientPlacesClear } from '../src/newer/render/r_ambientplaces.js';
import { S_UpdateEnvironmentSounds, S_EnvironmentSoundsReset, S_EnvironmentSoundsShutdown, S_GetEnvironmentSoundsStatus, ENVIRONMENT_TRACK_URLS } from '../src/newer/sound/s_environmentsounds.js';

class Media {
 constructor() { this.paused = true; this.currentTime = 0; this.duration = 30; this.readyState = 4; this.plays = 0; }
 play() { this.plays++; if ( this.rejection ) return Promise.reject( this.rejection ); this.paused = false; return this.pending || Promise.resolve(); }
 pause() { this.paused = true; }
 removeAttribute() { this.src = ''; }
 load() { this.loaded = true; }
 addEventListener() {} removeEventListener() {}
}
class Context {
 constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = {}; this.nodes = []; }
 createGain() { const n = { gain: { value: 0 }, connect( target ) { this.target = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( n ); return n; }
 createStereoPanner() { const n = { pan: { value: 0 }, connect( target ) { this.target = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( n ); return n; }
 createMediaElementSource( media ) { const n = { connect( target ) { this.target = target; media.bus = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( n ); return n; }
 close() { this.state = 'closed'; return Promise.resolve(); }
}
async function game( run ) {
 const saved = new Map( [ 'window', 'document', 'Audio' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) ), media = [];
 try {
  Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context, location: { search: '', pathname: '/' } } } );
  Object.defineProperty( globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } } );
  Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends Media { constructor() { super(); media.push( this ); } } } );
  if ( ! vars.Cvar_FindVar( 'r_hdr' ) ) vars.Cvar_RegisterVariable( r_hdr ); vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );
  sv.active = false; sv.paused = false; CL_ClearState(); R_AmbientPlacesClear(); S_EnvironmentSoundsReset(); dma.S_Init();
  vars.Cvar_SetValue( 'nosound', 0 ); sound.volume.value = 1; sound.bgmvolume.value = 1;
  cls.demoplayback = false; cls.state = ca_connected; cls.signon = 4; cl.time = 10; cl.worldmodel = { name: 'maps/environment-fixture.bsp' }; cl.stats[ 0 ] = 100; cl.paused = false; cl.intermission = 0; cl.viewentity = 1;
  sound.listener_origin.fill( 0 ); sound.listener_right.set( [ 0, 1, 0 ] ); keys.set_key_dest( keys.key_game ); common.SZ_Alloc( net_message, 4096 ); common.COM_SetNetMessage( net_message );
  const step = async ( dt = .11 ) => { cl.time += dt; dma.S_GetAudioContext().currentTime += dt; S_UpdateEnvironmentSounds(); await Promise.resolve(); await Promise.resolve(); return S_GetEnvironmentSoundsStatus(); };
  await step(); await run( { step, media, deck: () => media.find( m => m.src === ENVIRONMENT_TRACK_URLS.fire ) } );
 } finally {
  S_EnvironmentSoundsShutdown(); dma.S_Shutdown(); R_AmbientPlacesClear(); r_torchfire.value = 1; sound.volume.value = 1; sound.bgmvolume.value = 1;
  for ( const [ key, descriptor ] of saved ) { if ( descriptor ) Object.defineProperty( globalThis, key, descriptor ); else delete globalThis[ key ]; }
 }
}
function place( origin, name = 'ambience/fire1.wav' ) {
 cl.sound_precache[ 1 ] = { name };
 common.SZ_Clear( net_message ); common.MSG_WriteByte( net_message, svc_spawnstaticsound );
 for ( const value of origin ) common.MSG_WriteCoord( net_message, value );
 common.MSG_WriteByte( net_message, 1 ); common.MSG_WriteByte( net_message, 255 ); common.MSG_WriteByte( net_message, 64 ); CL_ParseServerMessage();
}
Deno.test( 'actual static-sound placement drives one spatialized fire loop independent of torch rendering', () => game( async ( { step, media, deck } ) => {
 assert.equal( media.length, 0, 'level entry alone has no universal fire ambience' );
 place( [ 100, 0, 0 ] ); assert.deepEqual( R_AmbientPlaces( 'ambience/fire1.wav' ), [ [ 100, 0, 0 ] ] );
 r_torchfire.value = 0; await step(); let near = await step( .3 ); assert.equal( near.fireSources, 1 ); assert.ok( near.fireGain > 0 && near.fireGain <= .3 );
 assert.equal( deck().loop, true ); assert.equal( deck().paused, false, 'renderer fire toggle cannot remove placed source audio' );
 const plays = deck().plays; place( [ 120, 0, 0 ] ); await step( .3 ); assert.equal( media.length, 1, 'many flames share one media deck' ); assert.equal( deck().plays, plays );
 sound.listener_origin.set( [ -300, 0, 0 ] ); const middle = await step( .3 ); assert.ok( middle.fireGain < near.fireGain, 'existing distance attenuation quietens farther fire' );
 sound.listener_origin.set( [ -1000, 0, 0 ] ); await step(); const far = await step( 1 ); assert.equal( far.fireGain, 0 ); assert.equal( deck().paused, true, 'outside 800-unit radius becomes silent' );
} ) );
Deno.test( 'fire uses bounded nearest source, existing stereo direction and static-flame fallback only when needed', () => game( async ( { step, media } ) => {
 const flame = cl_static_entities[ 0 ]; flame.model = { name: 'progs/flame.mdl' }; flame.origin.set( [ 0, 100, 0 ] ); cl.num_statics = 1;
 await step(); let state = await step( .3 ); assert.equal( state.fireSources, 1 ); assert.ok( state.firePan > 0, 'a source to the listener right pans right' );
 place( [ 0, -100, 0 ] ); state = await step( .3 ); assert.equal( state.fireSources, 1, 'placed sound registry takes priority over model fallback' ); assert.ok( state.firePan < 0 );
 for ( let i = 0; i < 300; i++ ) place( [ 20 + i, -10, 0 ] ); state = await step( .3 ); assert.ok( state.fireSources <= 256 ); assert.equal( media.length, 1 ); assert.ok( state.fireGain <= .3, 'emitter density cannot add gain beyond ceiling' );
} ) );
Deno.test( 'pause, hide, mute, death, menu, Classic and demo silence fire immediately on the effects bus', () => game( async ( { step, media, deck } ) => {
 place( [ 100, 0, 0 ] ); await step(); await step( .3 );
 let node = deck().bus; for ( let i = 0; i < 4 && node !== dma.S_GetMasterGain(); i++ ) node = node?.target;
 assert.equal( node, dma.S_GetMasterGain(), 'fire routes through existing Sound Volume master' );
 sound.bgmvolume.value = 0; await step(); assert.equal( deck().paused, false );
 const cases = [
  [ () => { cl.paused = true; }, () => { cl.paused = false; } ],
  [ () => { document.hidden = true; }, () => { document.hidden = false; } ],
  [ () => { sound.volume.value = 0; }, () => { sound.volume.value = 1; } ],
  [ () => { cl.stats[ 0 ] = 0; }, () => { cl.stats[ 0 ] = 100; } ],
  [ () => keys.set_key_dest( keys.key_menu ), () => keys.set_key_dest( keys.key_game ) ],
  [ () => vars.Cvar_SetValue( 'r_hdr', 0 ), () => vars.Cvar_SetValue( 'r_hdr', 1 ) ],
  [ () => { cls.demoplayback = true; }, () => { cls.demoplayback = false; } ]
 ];
 for ( const [ stop, resume ] of cases ) { stop(); await step(); assert.ok( media.every( m => m.paused ) ); resume(); await step(); await step( .3 ); }
} ) );
Deno.test( 'fire resets source history, rejects play-spam and invalidates pending media on shutdown', () => game( async ( { step, deck, media } ) => {
 place( [ 100, 0, 0 ] ); await step(); await step( .3 ); const fire = deck();
 cl.paused = true; await step(); fire.rejection = new Error( 'decoder refused' ); cl.paused = false; await step(); const plays = fire.plays;
 for ( let i = 0; i < 10; i++ ) await step(); assert.equal( fire.plays, plays ); assert.equal( S_GetEnvironmentSoundsStatus().tracks.fire.blocked, true );
 fire.rejection = null; cl.paused = true; await step(); let resolve; fire.pending = new Promise( r => { resolve = r; } ); cl.paused = false; await step();
 S_EnvironmentSoundsShutdown(); resolve(); await Promise.resolve(); await Promise.resolve(); assert.equal( fire.paused, true ); assert.ok( media.every( m => m.loaded && m.src === '' ) );
 R_AmbientPlacesClear(); cl.num_statics = 0; cl.worldmodel = { name: 'maps/second-environment-fixture.bsp' }; S_EnvironmentSoundsReset(); const next = await step( .3 ); assert.equal( next.fireSources, 0 ); assert.equal( next.fireGain, 0 );
} ) );
