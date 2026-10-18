// Independent public parser/audio adapter checks. Native QC pickups are covered
// separately; these tests exercise actual clientdata/finale notifications.
import assert from 'node:assert/strict';
import { cl, cls, ca_connected, SIGNONS } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { CL_ParseClientdata, CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { sv } from '../src/engine/server/server.js';
import * as common from '../src/engine/common/common.js';
import { net_message } from '../src/engine/net/net.js';
import { GameSelection_SetRunning } from '../src/engine/common/game_selection.js';
import * as vars from '../src/engine/common/cvar.js';
import * as keys from '../src/engine/client/keys.js';
import * as sound from '../src/engine/sound/sound.js';
import * as dma from '../src/engine/sound/snd_dma.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { IT_QUAD, IT_INVISIBILITY, IT_INVULNERABILITY, IT_SUIT, STAT_HEALTH } from '../src/engine/common/quakedef.js';
import { svc_finale, svc_intermission, svc_cutscene } from '../src/engine/common/protocol.js';
import { S_PlayerEventsReset, S_UpdatePlayerEvents, S_PlayerEventsShutdown, S_GetPlayerEventsStatus, PLAYER_EVENT_TRACK_URLS, PLAYER_PAIR_FADE_OUT } from '../src/newer/sound/s_playerevents.js';

class Media {
 constructor() { this.paused = true; this.currentTime = 0; this.duration = 30; this.readyState = 4; this.plays = 0; this.events = new Map(); }
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
function inventory( items, health = 100 ) {
 common.SZ_Clear( net_message ); common.MSG_WriteLong( net_message, items ); common.MSG_WriteShort( net_message, health );
 for ( let i = 0; i < 5; i++ ) common.MSG_WriteByte( net_message, 0 );
 common.MSG_WriteByte( net_message, 1 ); common.MSG_BeginReading(); CL_ParseClientdata( 0 ); assert.equal( common.msg_badread, false );
}
function serverMessage( code ) {
 common.SZ_Clear( net_message ); common.MSG_WriteByte( net_message, code );
 if ( code === svc_finale || code === svc_cutscene ) common.MSG_WriteString( net_message, 'Independent parser event fixture' );
 CL_ParseServerMessage(); // The parser probes past the final byte to detect packet end.
}
async function game( run ) {
 const descriptors = new Map( [ 'window', 'document', 'Audio' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) ), media = [];
 try {
  Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context } } );
  Object.defineProperty( globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } } );
  Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends Media { constructor() { super(); media.push( this ); } } } );
  if ( ! vars.Cvar_FindVar( 'r_hdr' ) ) vars.Cvar_RegisterVariable( r_hdr );
  vars.Cvar_SetValue( 'r_hdr', 1 ); common.COM_InitArgv( [ 'quaked' ] ); GameSelection_SetRunning( 'quake' ); R_AnimSetClassicPass( false );
  sv.active = false; sv.paused = false; CL_ClearState(); S_PlayerEventsReset(); dma.S_Init();
  vars.Cvar_SetValue( 'nosound', 0 ); sound.volume.value = 1; sound.bgmvolume.value = 1;
  cls.demoplayback = false; cls.state = ca_connected; cls.signon = 3; cl.time = 10; cl.worldmodel = { name: 'maps/e1m1.bsp' }; cl.paused = false; cl.intermission = 0;
  keys.set_key_dest( keys.key_game ); common.SZ_Alloc( net_message, 4096 ); common.COM_SetNetMessage( net_message );
  inventory( 0 ); cls.signon = SIGNONS;
  const deck = key => media.find( m => m.src === PLAYER_EVENT_TRACK_URLS[ key ] );
  const step = async ( dt = 0 ) => { cl.time += dt; dma.S_GetAudioContext().currentTime += dt; S_UpdatePlayerEvents(); await flush(); return S_GetPlayerEventsStatus(); };
  await step(); await run( { deck, media, step } );
 } finally {
  S_PlayerEventsShutdown(); dma.S_Shutdown(); common.COM_InitArgv( [ 'quaked' ] ); GameSelection_SetRunning( null );
  vars.Cvar_SetValue( 'r_hdr', 1 ); sound.volume.value = 1; sound.bgmvolume.value = 1;
  for ( const [ key, descriptor ] of descriptors ) { if ( descriptor ) Object.defineProperty( globalThis, key, descriptor ); else delete globalThis[ key ]; }
 }
}
const mask = IT_QUAD | IT_INVISIBILITY | IT_INVULNERABILITY;
Deno.test( 'real clientdata transitions play individual cues, exact-two bed and third acquisition once', () => game( async ( { deck, step } ) => {
 inventory( IT_QUAD ); await step(); assert.equal( deck( 'quad' ).plays, 1 ); assert.equal( deck( 'quad' ).loop, false );
 inventory( IT_QUAD ); await step(); assert.equal( deck( 'quad' ).plays, 1, 'unchanged clientdata cannot invent a renewal' );
 inventory( IT_QUAD | IT_INVISIBILITY ); let status = await step(); assert.equal( status.powerCount, 2 ); assert.equal( deck( 'ring' ).plays, 1 ); assert.equal( deck( 'pair' ).loop, true ); assert.equal( deck( 'pair' ).paused, false );
 inventory( mask ); status = await step(); assert.equal( status.powerCount, 3 ); assert.equal( deck( 'pentagram' ).plays, 1 ); assert.equal( deck( 'triple' ).plays, 1 ); assert.equal( deck( 'triple' ).loop, false );
 inventory( mask ); await step( .2 ); assert.equal( deck( 'triple' ).plays, 1 );
 await step( 2 ); assert.equal( deck( 'pair' ).paused, true, 'pair bed cannot remain audible with three active powers' );
 inventory( IT_INVISIBILITY | IT_INVULNERABILITY ); status = await step(); assert.equal( status.powerCount, 2 ); assert.equal( deck( 'pair' ).paused, false, 'armed bed resumes when only two remain' );
} ) );
Deno.test( 'pair fades after count leaves two and initial baseline or suit cannot fabricate a combo', () => game( async ( { deck, step, media } ) => {
 assert.equal( PLAYER_PAIR_FADE_OUT, 1.8 );
 inventory( IT_SUIT ); await step(); assert.equal( media.length, 0, 'suit has no individual or combo sound' );
 inventory( IT_SUIT | IT_QUAD ); await step(); assert.ok( ! deck( 'pair' ), 'suit does not count as a second power' );
 inventory( IT_QUAD | IT_INVISIBILITY ); await step(); const before = S_GetPlayerEventsStatus().tracks.pair.gain;
 inventory( IT_QUAD ); await step(); const tail = await step( .4 ); assert.ok( tail.tracks.pair.gain > 0 && tail.tracks.pair.gain < before );
 await step( 1.5 ); assert.equal( deck( 'pair' ).paused, true );
 S_PlayerEventsReset(); cls.signon = 3; inventory( mask ); cls.signon = SIGNONS; await step();
 assert.ok( ! S_GetPlayerEventsStatus().tracks.pair?.playing && ! S_GetPlayerEventsStatus().tracks.triple?.playing, 'restored initial power inventory is a silent baseline' );
} ) );
Deno.test( 'actual clientdata death edge plays once and can finish through same-world respawn', () => game( async ( { deck, step } ) => {
 inventory( 0, 0 ); await step(); const death = deck( 'death' ); assert.equal( death.plays, 1 ); assert.equal( death.loop, false ); assert.equal( death.paused, false );
 inventory( 0, -5 ); await step( .1 ); assert.equal( death.plays, 1, 'later dead health is not another death' );
 inventory( 0, 100 ); await step( .1 ); assert.equal( death.plays, 1 ); assert.equal( death.paused, false, 'respawn may finish the death/reset cue' );
 inventory( 0, 0 ); await step(); assert.equal( death.plays, 2, 'a new life has a new death edge' );
} ) );
Deno.test( 'only base Quake end-map finale message plays the ending cue', () => game( async ( { deck, step, media } ) => {
 serverMessage( svc_intermission ); await step(); assert.equal( media.length, 0 );
 cl.intermission = 0; serverMessage( svc_finale ); await step(); assert.equal( media.length, 0, 'an ordinary episode finale is not game completion' );
 cl.worldmodel = { name: 'maps/end.bsp' }; S_PlayerEventsReset(); cl.intermission = 0;
 serverMessage( svc_cutscene ); await step(); assert.ok( ! deck( 'end' ), 'cutscene is not completion' );
 cl.intermission = 0; common.COM_InitArgv( [ 'quaked', '-hipnotic' ] ); serverMessage( svc_finale ); await step(); assert.ok( ! deck( 'end' ), 'mission pack does not claim base-game completion' );
 common.COM_InitArgv( [ 'quaked' ] ); GameSelection_SetRunning( 'rogue' ); cl.intermission = 0; serverMessage( svc_finale ); await step(); assert.ok( ! deck( 'end' ), 'running game identity is checked' );
 GameSelection_SetRunning( 'quake' ); cls.demoplayback = true; cl.intermission = 0; serverMessage( svc_finale ); await step(); assert.ok( ! deck( 'end' ), 'recorded finale remains silent' );
 cls.demoplayback = false; cl.intermission = 0; serverMessage( svc_finale ); await step(); assert.equal( deck( 'end' ).plays, 1 ); assert.equal( deck( 'end' ).loop, false );
 serverMessage( svc_finale ); await step(); assert.equal( deck( 'end' ).plays, 1, 'repeated finale message does not restart completion' );
} ) );
Deno.test( 'new cues use the effects bus and lifecycle gates silence them without stale replay', () => game( async ( { deck, step, media } ) => {
 inventory( IT_QUAD ); await step(); inventory( IT_QUAD | IT_INVISIBILITY ); await step(); sound.bgmvolume.value = 0; await step();
 for ( const m of media ) assert.equal( m.bus.target, dma.S_GetMasterGain(), 'existing Sound Volume bus applies once' );
 assert.equal( deck( 'pair' ).paused, false, 'Music Volume does not silence player effects' );
 cl.paused = true; await step(); assert.ok( media.every( m => m.paused ) ); cl.paused = false; await step();
 document.hidden = true; await step(); assert.ok( media.every( m => m.paused ) ); document.hidden = false; await step();
 sound.volume.value = 0; await step(); assert.ok( media.every( m => m.paused ) ); sound.volume.value = 1;
 cls.demoplayback = true; await step(); assert.ok( media.every( m => m.paused ) ); cls.demoplayback = false;
 vars.Cvar_SetValue( 'r_hdr', 0 ); await step(); assert.ok( media.every( m => m.paused ) ); vars.Cvar_SetValue( 'r_hdr', 1 );
 cls.signon = 0; await step(); assert.ok( media.every( m => m.paused ) );
} ) );
Deno.test( 'late play success after reset cannot resurrect an old context-bound cue', () => game( async ( { deck, step, media } ) => {
 inventory( IT_QUAD ); await step(); const quad = deck( 'quad' ); inventory( 0 ); await step(); let resolve;
 quad.pending = new Promise( r => { resolve = r; } ); inventory( IT_QUAD ); await step(); S_PlayerEventsReset(); resolve(); await flush();
 assert.equal( quad.paused, true ); assert.ok( ! S_GetPlayerEventsStatus().tracks.quad?.playing );
 S_PlayerEventsShutdown(); assert.ok( media.every( m => m.paused && m.loaded && m.src === '' ), 'shutdown unloads every owned media source' );
} ) );

Deno.test( 'a clientdata packet replaces expired powers before counting its newly gained powers', () => game( async ( { deck, step } ) => {
 inventory( IT_QUAD ); await step(); inventory( IT_INVISIBILITY ); let status = await step();
 assert.equal( status.powerCount, 1 ); assert.ok( ! deck( 'pair' ) && ! deck( 'triple' ), 'Quad replaced by Ring is one power' );
 inventory( IT_QUAD | IT_INVISIBILITY ); await step();
 inventory( IT_INVISIBILITY | IT_INVULNERABILITY ); status = await step();
 assert.equal( status.powerCount, 2 ); assert.ok( ! deck( 'triple' ), 'one of two powers replaced in the same packet is never a third acquisition' );
} ) );
