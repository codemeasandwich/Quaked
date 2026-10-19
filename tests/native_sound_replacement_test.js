// Independent public replacement kernel: actual sound packet/cache/PCM and stock
// program globals, with only browser media/output endpoints doubled. Cue-specific
// native QC provenance and role selection belong to their existing native tests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from './helpers/resource_fs.mjs';
import * as dma from '../src/engine/sound/snd_dma.js';
import * as sound from '../src/engine/sound/sound.js';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { PR_LoadProgs } from '../src/engine/progs/pr_edict.js';
import * as progs from '../src/engine/progs/progs.js';
import { sv } from '../src/engine/server/server.js';
import * as common from '../src/engine/common/common.js';
import { CL_ParseStartSoundPacket, CL_ParseStaticSound, CL_ParseClientdata } from '../src/engine/client/cl_parse.js';
import { cl, cls, cl_entities, ca_connected } from '../src/engine/client/client.js';
import { PROTOCOL_VERSION, SND_VOLUME, SND_ATTENUATION } from '../src/engine/common/protocol.js';
import * as vars from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { createEffectDeck, startEffect, releaseEffect } from '../src/newer/sound/s_effectdeck.js';
import * as keys from '../src/engine/client/keys.js';
import { IT_LIGHTNING, IT_QUAD, IT_INVISIBILITY, IT_INVULNERABILITY, STAT_WEAPON, STAT_CELLS } from '../src/engine/common/quakedef.js';
import { in_attack } from '../src/engine/client/cl_input.js';
import { S_ElectricEvent, S_ElectricSoundsReset, S_ElectricSoundsShutdown, S_GetElectricSoundsStatus, ELECTRIC_TRACK_URLS } from '../src/newer/sound/s_electricsounds.js';
import { S_EnvironmentSoundsReset, S_EnvironmentSoundsShutdown, S_UpdateEnvironmentSounds, ENVIRONMENT_TRACK_URLS } from '../src/newer/sound/s_environmentsounds.js';
import { R_AmbientPlacesClear } from '../src/newer/render/r_ambientplaces.js';
import { S_UpdatePlayerWater, S_PlayerWaterShutdown, S_GetPlayerWaterStatus, WATER_TRACK_URLS } from '../src/newer/sound/s_playerwater.js';
import { S_PlayerEventsReset, S_PlayerEventsShutdown, S_UpdatePlayerEvents, PLAYER_EVENT_TRACK_URLS } from '../src/newer/sound/s_playerevents.js';
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'replacement-native-fixture.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
const program = COM_FindFile( 'progs.dat' ).data; PR_LoadProgs( program instanceof ArrayBuffer ? program : program.buffer.slice( program.byteOffset, program.byteOffset + program.byteLength ) );
const digest = data => createHash( 'sha256' ).update( data instanceof ArrayBuffer ? new Uint8Array( data ) : data ).digest( 'hex' );
const node = kind => ( { kind, connect( target ) { this.target = target; }, disconnect() {}, start() { this.starts = ( this.starts || 0 ) + 1; }, stop() { this.stops = ( this.stops || 0 ) + 1; } } );
class Context {
 constructor() { this.destination = {}; this.currentTime = 0; this.sampleRate = 44100; this.state = 'running'; this.sources = []; }
 createGain() { return Object.assign( node( 'gain' ), { gain: { value: 1 } } ); }
 createStereoPanner() { return Object.assign( node( 'pan' ), { pan: { value: 0 } } ); }
 createBuffer( channels, length ) { const data = Array.from( { length: channels }, () => new Float32Array( length ) ); return { length, getChannelData: index => data[ index ] }; }
 createBufferSource() { const source = node( 'buffer' ), start = source.start; source.start = () => { if ( this.failNextStart ) { this.failNextStart = false; source.failures = ( source.failures || 0 ) + 1; throw Error( 'independent output start failure' ); } start.call( source ); }; this.sources.push( source ); return source; }
 createMediaElementSource( media ) { const source = node( 'media' ); source.media = media; return source; }
 close() { this.state = 'closed'; return Promise.resolve(); }
}
class Media {
 constructor() { this.paused = true; this.currentTime = 0; this.duration = 30; this.plays = 0; }
 play() { this.plays++; this.paused = false; return Promise.resolve(); }
 pause() { this.paused = true; }
 removeAttribute() { this.src = ''; }
 load() {}
}
async function fixture( run ) {
 const saved = new Map( [ 'window', 'Audio' ].map( name => [ name, Object.getOwnPropertyDescriptor( globalThis, name ) ] ) );
 const disposers = [], decks = [], media = []; R_AmbientPlacesClear(); S_ElectricSoundsReset(); S_EnvironmentSoundsReset(); S_PlayerEventsReset();
 try {
  Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: Context, location: { search: '', pathname: '/' } } } ); Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends Media { constructor() { super(); media.push( this ); } } } );
  if ( ! vars.Cvar_FindVar( r_hdr.name ) ) vars.Cvar_RegisterVariable( r_hdr ); vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );
  dma.S_Init(); dma.S_StopAllSounds( true ); vars.Cvar_SetValue( 'nosound', 0 ); sound.volume.value = 1; cls.state = ca_connected; cls.signon = 4; cls.demoplayback = false; cl.viewentity = 1; cl.stats[ 0 ] = 100; cl.time = 10; cl.paused = false; cl.intermission = 0; cl.items = 0; keys.set_key_dest( keys.key_game ); cl.stats[ STAT_WEAPON ] = IT_LIGHTNING; cl.stats[ STAT_CELLS ] = 100; in_attack.state = 1; cl.protocol = PROTOCOL_VERSION;
  cl.worldmodel = { nodes: [ { contents: -1, ambient_sound_level: new Uint8Array( 4 ) } ] };
  dma.S_SetCallbacks( { getHostFrametime: () => .2 } ); sound.listener_origin.fill( 0 ); sound.listener_right.set( [ 0, 1, 0 ] );
  const sfx = dma.S_PrecacheSound( 'misc/talk.wav' ), context = dma.S_GetAudioContext(); assert.ok( sfx.cache?.data );
  const start = () => dma.S_StartSound( 3, 2, sfx, [ 16, -24, 8 ], 128 / 255, 1 );
  const subscribe = callback => { const off = dma.S_AddSoundReplacement( callback ); assert.equal( typeof off, 'function', 'public replacement subscription is reversible' ); disposers.push( off ); return off; };
  const nativeStarts = () => context.sources.reduce( ( count, source ) => count + ( source.starts || 0 ), 0 );
  const custom = () => { const deck = createEffectDeck( context, new URL( '../assets/audio/sounds/electric/electric-spell-20.mp3', import.meta.url ).href, false, dma.S_GetMasterGain() ); deck.gain.gain.value = .4; decks.push( deck ); return deck; };
  await run( { sfx, context, start, subscribe, nativeStarts, custom, media } );
 } finally { disposers.reverse().forEach( off => off() ); decks.forEach( releaseEffect ); S_ElectricSoundsShutdown(); S_EnvironmentSoundsShutdown(); S_PlayerEventsShutdown(); S_PlayerWaterShutdown(); R_AmbientPlacesClear(); dma.S_SetCallbacks( { getHostFrametime: () => 0 } ); dma.S_Shutdown(); R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 1 ); for ( const [ name, descriptor ] of saved ) { if ( descriptor ) Object.defineProperty( globalThis, name, descriptor ); else delete globalThis[ name ]; } }
}
Deno.test( 'actual native packet admits one custom source before native playback and still notifies existing observers once', () => fixture( async ( { sfx, subscribe, nativeStarts, custom } ) => {
 const deck = custom(), observed = []; let calls = 0;
 dma.S_AddSoundStarted( ( heard, origin, volume, attenuation, entity ) => { if ( heard === sfx ) observed.push( { origin: Array.from( origin ), volume, attenuation, entity } ); } );
 subscribe( ( candidate, origin, volume, attenuation, entity, channel ) => {
  if ( candidate !== sfx ) return false; calls++; assert.deepEqual( Array.from( origin ), [ 16, -24, 8 ] ); assert.equal( volume, 128 / 255 ); assert.equal( attenuation, 1 ); assert.equal( entity, 3 ); assert.equal( channel, 2 );
  startEffect( deck, true ); return deck.playing;
 } );
 cl.sound_precache[ 1 ] = sfx; const data = new Uint8Array( 12 ), view = new DataView( data.buffer ); data[ 0 ] = SND_VOLUME | SND_ATTENUATION; data[ 1 ] = 128; data[ 2 ] = 64; view.setUint16( 3, ( 3 << 3 ) | 2, true ); data[ 5 ] = 1; [ 16, -24, 8 ].forEach( ( value, axis ) => view.setInt16( 6 + axis * 2, value * 8, true ) );
 common.COM_SetNetMessage( { data, cursize: data.length } ); common.MSG_BeginReading(); CL_ParseStartSoundPacket();
 assert.equal( calls, 1 ); assert.equal( deck.media.plays, 1 ); assert.equal( deck.media.currentTime, 0 ); assert.equal( deck.media.loop, false ); assert.equal( nativeStarts(), 0, 'no native buffer ever starts alongside the admitted replacement' );
 assert.equal( observed.length, 1 ); assert.deepEqual( observed[ 0 ], { origin: [ 16, -24, 8 ], volume: 128 / 255, attenuation: 1, entity: 3 } );
} ) );
Deno.test( 'false thrown unmapped and non-boolean replacement results retain one normal native playback', () => fixture( async ( { sfx, subscribe, start, nativeStarts } ) => {
 for ( const callback of [ () => false, () => { throw Error( 'replacement unavailable' ); }, candidate => candidate.name === 'not-this-sound.wav', () => 'pending', () => Promise.resolve( true ) ] ) {
  const off = subscribe( callback ), before = nativeStarts(); start(); assert.equal( nativeStarts(), before + 1, 'only explicit synchronous admission may suppress the native source' ); off();
 }
 assert.equal( sfx.name, 'misc/talk.wav' );
} ) );
Deno.test( 'Classic and the split Classic pass keep native audio even when a registered Newer replacement would admit it', () => fixture( async ( { subscribe, start, nativeStarts } ) => {
 let calls = 0; subscribe( () => { calls++; return true; } );
 vars.Cvar_SetValue( 'r_hdr', 0 ); start(); assert.equal( nativeStarts(), 1 ); assert.equal( calls, 0, 'Classic cannot invoke a Newer replacement side effect' );
 vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( true ); start(); assert.equal( nativeStarts(), 2 ); assert.equal( calls, 0 ); R_AnimSetClassicPass( false );
 start(); assert.equal( calls, 1 ); assert.equal( nativeStarts(), 2 );
} ) );
Deno.test( 'replacement unsubscription restores native playback and one admitted owner prevents duplicate replacement execution', () => fixture( async ( { subscribe, start, nativeStarts } ) => {
 let first = 0, second = 0; const off = subscribe( () => { first++; return true; } ); const offSecond = subscribe( () => { second++; return true; } );
 start(); assert.equal( first, 1 ); assert.equal( second, 0 ); assert.equal( nativeStarts(), 0 ); off(); start(); assert.equal( second, 1 ); assert.equal( nativeStarts(), 0 ); offSecond(); start(); assert.equal( nativeStarts(), 1 );
} ) );
Deno.test( 'admitting a replacement preserves actual native PCM cache file bytes and loaded QC globals', () => fixture( async ( { sfx, subscribe, start, nativeStarts } ) => {
 const cache = sfx.cache, pcm = digest( cache.data ), native = digest( COM_FindFile( 'sound/' + sfx.name ).data ), globals = digest( new Uint8Array( progs.pr_globals_int.buffer ) ), programHash = digest( program );
 subscribe( () => true ); start(); assert.equal( nativeStarts(), 0 ); assert.equal( sfx.cache, cache ); assert.equal( digest( cache.data ), pcm ); assert.equal( digest( COM_FindFile( 'sound/' + sfx.name ).data ), native ); assert.equal( digest( new Uint8Array( progs.pr_globals_int.buffer ) ), globals ); assert.equal( digest( program ), programHash ); assert.equal( dma.S_PrecacheSound( sfx.name ), sfx );
} ) );

Deno.test( 'admitting a ready replacement stops its old fallback but preserves other actors and channels', () => fixture( async ( { sfx, context, start, subscribe, nativeStarts, custom, media } ) => {
 start(); const former = context.sources.at( -1 );
 dma.S_StartSound( 4, 2, sfx, [ 10, 0, 0 ], 1, 1 ); const otherActor = context.sources.at( -1 );
 dma.S_StartSound( 3, 3, sfx, [ 10, 0, 0 ], 1, 1 ); const otherChannel = context.sources.at( -1 );
 const count = nativeStarts(), deck = custom(); subscribe( candidate => { if ( candidate !== sfx ) return false; startEffect( deck ); return deck.playing; } ); start();
 assert.equal( former.stops, 1, 'prior native fallback on this source/channel is retired' ); assert.equal( otherActor.stops || 0, 0 ); assert.equal( otherChannel.stops || 0, 0 ); assert.equal( nativeStarts(), count ); assert.equal( deck.media.plays, 1 );
} ) );
Deno.test( 'static loops pass through the same admission policy before any native buffer starts', () => fixture( async ( { subscribe, nativeStarts, custom } ) => {
 const loop = dma.S_PrecacheSound( 'ambience/fire1.wav' ); assert.ok( loop.cache?.loopstart >= 0, 'actual native static loop' );
 const deck = custom(); subscribe( candidate => { if ( candidate !== loop ) return false; startEffect( deck ); return deck.playing; } );
 dma.S_StaticSound( loop, [ 0, 40, 0 ], 255, 64 ); dma.S_Update( [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] );
 assert.equal( nativeStarts(), 0 ); assert.equal( deck.media.plays, 1 );
 dma.S_Update( [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] ); assert.equal( nativeStarts(), 0 ); assert.equal( deck.media.plays, 1, 'static frames cannot restart a complete replacement clip' );
} ) );
Deno.test( 'ambient fallback can become replaced and resume natively after its replacement unsubscribes', () => fixture( async ( { context, subscribe, nativeStarts, custom } ) => {
 const loop = dma.S_PrecacheSound( 'ambience/water1.wav' ); cl.worldmodel.nodes[ 0 ].ambient_sound_level[ 0 ] = 255;
 const update = () => dma.S_Update( [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] ); update(); assert.equal( nativeStarts(), 1 ); const native = context.sources.at( -1 );
 const deck = custom(), off = subscribe( candidate => { if ( candidate !== loop ) return false; startEffect( deck ); return deck.playing; } ); update();
 assert.equal( native.stops, 1 ); assert.equal( nativeStarts(), 1 ); assert.equal( deck.media.plays, 1 ); off(); update(); assert.equal( nativeStarts(), 2, 'native ambient definition survives replacement admission' );
} ) );

function nativePacket( name, entity = 1, channel = 1, origin = [ 0, 0, 0 ] ) {
 const sfx = dma.S_PrecacheSound( name ); assert.ok( sfx.cache?.data?.length, 'actual native WAV is loaded: ' + name ); return soundPacket( sfx, entity, channel, origin );
}
function soundPacket( sfx, entity = 1, channel = 1, origin = [ 0, 0, 0 ] ) {
 cl.sound_precache[ 1 ] = sfx;
 const data = new Uint8Array( 10 ), view = new DataView( data.buffer ); view.setUint16( 1, ( entity << 3 ) | channel, true ); data[ 3 ] = 1; origin.forEach( ( value, axis ) => view.setInt16( 4 + axis * 2, value * 8, true ) );
 common.COM_SetNetMessage( { data, cursize: data.length } ); common.MSG_BeginReading(); CL_ParseStartSoundPacket(); return sfx;
}
const pulse = ( changes = {} ) => S_ElectricEvent( { kind: 'pulse', actor: 'player', entity: 1, time: cl.time, source: [ 0, 0, 0 ], start: [ 0, 0, 0 ], end: [ 100, 0, 0 ], hits: [], water: [], ...changes } );
Deno.test( 'real electric event subscriber replaces native player lightning packets with full clip20 without duplicate starts', () => fixture( async ( { nativeStarts, media } ) => {
 pulse(); nativePacket( 'weapons/lstart.wav' ); const firing = media.find( m => m.src === ELECTRIC_TRACK_URLS[ 20 ] ); assert.ok( firing && ! firing.paused ); assert.equal( firing.plays, 1 ); assert.equal( firing.currentTime, 0 ); assert.equal( firing.loop, false ); assert.equal( nativeStarts(), 0 );
 nativePacket( 'weapons/lhit.wav' ); assert.equal( firing.plays, 1, 'native repeated impact packet cannot restart the complete firing recording' ); assert.equal( nativeStarts(), 0 );
} ) );
Deno.test( 'real electric mapping keeps original audio without actor receipts, in Classic/demo and after replacement media failure', () => fixture( async ( { nativeStarts, media } ) => {
 nativePacket( 'weapons/lstart.wav' ); assert.equal( nativeStarts(), 1, 'no custom receipt means no suppression' );
 vars.Cvar_SetValue( 'r_hdr', 0 ); pulse(); nativePacket( 'weapons/lstart.wav' ); assert.equal( nativeStarts(), 2 ); vars.Cvar_SetValue( 'r_hdr', 1 ); S_ElectricSoundsReset();
 cls.demoplayback = true; pulse(); nativePacket( 'weapons/lstart.wav' ); assert.equal( nativeStarts(), 3 ); cls.demoplayback = false; S_ElectricSoundsReset();
 pulse(); nativePacket( 'weapons/lstart.wav' ); const firing = media.findLast( m => m.src === ELECTRIC_TRACK_URLS[ 20 ] ); assert.ok( firing ); assert.equal( nativeStarts(), 3 );
 firing.onerror(); nativePacket( 'weapons/lstart.wav' ); assert.equal( nativeStarts(), 4, 'decoder error retains actual native fallback' );
} ) );
Deno.test( 'the real placed-fire parser and owner replace the native loop with the supplied environmental recording', () => fixture( async ( { context, nativeStarts, media } ) => {
 const sfx = dma.S_PrecacheSound( 'ambience/fire1.wav' ); assert.ok( sfx.cache?.loopstart >= 0 ); cl.sound_precache[ 1 ] = sfx;
 const data = new Uint8Array( 9 ), view = new DataView( data.buffer ); view.setInt16( 2, 100 * 8, true ); data[ 6 ] = 1; data[ 7 ] = 255; data[ 8 ] = 64;
 common.COM_SetNetMessage( { data, cursize: data.length } ); common.MSG_BeginReading(); CL_ParseStaticSound();
 const update = () => dma.S_Update( [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] ); update(); context.currentTime += .3; update();
 const fire = media.find( m => m.src === ENVIRONMENT_TRACK_URLS.fire ); assert.ok( fire && ! fire.paused ); assert.equal( fire.plays, 1 ); assert.equal( fire.loop, true ); assert.equal( nativeStarts(), 0 );
 fire.onerror(); update(); assert.equal( nativeStarts(), 1, 'broken environmental recording restores the original static loop' );
} ) );
Deno.test( 'the real underwater owner replaces only the submerged native bed and restores surface ambience', () => fixture( async ( { context, nativeStarts, media } ) => {
 const air = { contents: -1, ambient_sound_level: new Uint8Array( [ 255, 0, 0, 0 ] ) }, water = { contents: -3, ambient_sound_level: new Uint8Array( [ 255, 0, 0, 0 ] ) };
 cl.worldmodel = { nodes: [ { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, children: [ air, water ] } ] }; cls.demoplayback = true; cls.demofile = {}; cl.viewheight = 22; cl_entities[ 1 ].origin.set( [ 0, 0, 40 ] );
 S_UpdatePlayerWater(); const bed = media.find( m => m.src === WATER_TRACK_URLS.underwater ); assert.ok( bed && ! bed.paused ); assert.equal( S_GetPlayerWaterStatus().tracks.underwater.gain, 0 );
 const update = z => dma.S_Update( [ 0, 0, z ], [ 1, 0, 0 ], [ 0, 1, 0 ], [ 0, 0, 1 ] ); update( 40 ); assert.equal( nativeStarts(), 1, 'surface ambience still plays original water bed: ' + JSON.stringify( { water: S_GetPlayerWaterStatus(), channels: sound.channels.slice( 0, 4 ).map( channel => ( { name: channel.sfx?.name, master: channel.master_vol, left: channel.leftvol, right: channel.rightvol, source: !! channel._audioSource } ) ), cache: dma.S_PrecacheSound( 'ambience/water1.wav' ).cache?.length, state: context.state } ) ); const former = context.sources.at( -1 ), plays = bed.plays;
 cl_entities[ 1 ].origin[ 2 ] = -40; update( -18 ); assert.equal( former.stops, 1 ); assert.equal( nativeStarts(), 1 ); assert.equal( bed.plays, plays ); assert.equal( S_GetPlayerWaterStatus().tracks.underwater.gain, 1 );
 cl_entities[ 1 ].origin[ 2 ] = 40; update( 40 ); assert.equal( nativeStarts(), 2 ); assert.equal( S_GetPlayerWaterStatus().tracks.underwater.gain, 0 );
} ) );
function inventoryPacket( mask, health = 100 ) {
 const data = new Uint8Array( 12 ), view = new DataView( data.buffer ); view.setInt32( 0, mask, true ); view.setInt16( 4, health, true ); data[ 11 ] = 1;
 common.COM_SetNetMessage( { data, cursize: data.length } ); common.MSG_BeginReading(); CL_ParseClientdata( 0 ); assert.equal( common.msg_badread, false );
}
Deno.test( 'real clientdata pickup transitions replace quad ring and pentagram native packets with the supplied individual cues', () => fixture( async ( { nativeStarts, media } ) => {
 cls.signon = 3; inventoryPacket( 0 ); cls.signon = 4; S_PlayerEventsReset(); S_UpdatePlayerEvents(); let mask = 0;
 for ( const [ bit, native, role ] of [ [ IT_QUAD, 'items/damage.wav', 'quad' ], [ IT_INVISIBILITY, 'items/inv1.wav', 'ring' ], [ IT_INVULNERABILITY, 'items/protect.wav', 'pentagram' ] ] ) {
  mask |= bit; inventoryPacket( mask ); nativePacket( native ); const clip = media.find( m => m.src === PLAYER_EVENT_TRACK_URLS[ role ] ); assert.ok( clip && ! clip.paused, role + ' replacement admitted' ); assert.equal( clip.plays, 1 ); assert.equal( clip.loop, false ); assert.equal( nativeStarts(), 0, 'native pickup PCM is suppressed for ' + role );
 }
} ) );

Deno.test( 'admitting an auto-channel contact never retires independent earlier contacts from the same actor', () => fixture( async ( { sfx, context, subscribe, nativeStarts, custom } ) => {
 dma.S_StartSound( 3, 0, sfx, [ 10, 10, 0 ], 1, 1 ); const first = context.sources.at( -1 );
 dma.S_StartSound( 3, 0, sfx, [ 20, -10, 0 ], 1, 1 ); const second = context.sources.at( -1 ); assert.notEqual( first, second );
 const deck = custom(); subscribe( candidate => { if ( candidate !== sfx ) return false; startEffect( deck ); return deck.playing; } ); dma.S_StartSound( 3, 0, sfx, [ 25, 10, 0 ], 1, 1 );
 assert.equal( nativeStarts(), 2, 'this newly replaced contact starts no native source' ); assert.equal( first.stops || 0, 0 ); assert.equal( second.stops || 0, 0, 'other full contact tails remain independent' ); assert.equal( deck.media.plays, 1 );
} ) );
Deno.test( 'a replacement PCM output start failure falls through to the original rather than claiming admission', () => fixture( async ( { sfx, context, subscribe, nativeStarts, start } ) => {
 const custom = dma.S_PrecacheSound( 'quaked/hit_stone1.wav' ); assert.ok( custom.cache?.data );
 subscribe( candidate => candidate === sfx && dma.S_StartSoundIfFree( -1, custom, [ 10, 0, 0 ], .4, 1 ) );
 context.failNextStart = true; start();
 assert.equal( context.sources.reduce( ( sum, source ) => sum + ( source.failures || 0 ), 0 ), 1 ); assert.equal( nativeStarts(), 1, 'the original still starts after the failed candidate' );
 assert.ok( sound.channels.some( channel => channel.sfx === sfx && channel._audioSource?.starts === 1 ) );
} ) );
Deno.test( 'missing replacement PCM keeps the real native cache and original source usable', () => fixture( async ( { sfx, subscribe, nativeStarts, start } ) => {
 const unavailable = dma.S_PrecacheSound( 'quaked/independent-unavailable.wav' ); assert.equal( unavailable.cache, null );
 subscribe( candidate => candidate === sfx && dma.S_StartSoundIfFree( -1, unavailable, [ 0, 0, 0 ], 1, 1 ) ); start();
 assert.equal( nativeStarts(), 1 ); assert.ok( sound.channels.some( channel => channel.sfx === sfx && channel._audioSource?.starts === 1 ) );
} ) );


Deno.test( 'actual underwater death is replaced while drowning pain after respawn keeps its native sound through the full death tail', () => fixture( async ( { nativeStarts, media } ) => {
 inventoryPacket( 0, 0 ); nativePacket( 'player/h2odeath.wav' );
 const death = media.find( m => m.src === PLAYER_EVENT_TRACK_URLS.death ); assert.ok( death && ! death.paused ); assert.equal( death.plays, 1 ); assert.equal( death.loop, false ); assert.equal( nativeStarts(), 0, 'admitted death cue suppresses actual underwater-death PCM' );
 inventoryPacket( 0, 100 ); assert.equal( death.paused, false, 'same-world respawn preserves the complete death recording tail' );
 nativePacket( 'player/drown1.wav' ); nativePacket( 'player/drown2.wav' );
 assert.equal( nativeStarts(), 2, 'stock drowning pain cues remain native even while the old death recording is playing' ); assert.equal( death.plays, 1 ); assert.equal( death.paused, false );
} ) );
Deno.test( 'an old electric contact tail cannot replace native audio belonging to a reused same-object edict life', () => fixture( async ( { nativeStarts, media } ) => {
 const saved = Object.fromEntries( [ 'active', 'paused', 'worldmodel', 'edicts', 'time' ].map( key => [ key, sv[ key ] ] ) );
 try {
  const actor = { free: false, freetime: 1, v: { health: 100, origin: [ 0, 0, 0 ] } };
  sv.active = true; sv.paused = false; sv.worldmodel = cl.worldmodel; sv.time = cl.time; sv.edicts = [ null, { v: { health: 100 } }, null, actor ];
  pulse( { actor: 'shambler', entity: 3, hits: [ { target: 1, position: [ 50, 10, 0 ], healthLoss: 10, armorLoss: 0 } ] } );
  nativePacket( 'shambler/sboom.wav', 3 ); assert.equal( nativeStarts(), 0 );
  const hit = S_GetElectricSoundsStatus().voices.find( voice => voice.role === 'hit' ); assert.ok( hit && hit.anchor === 'contact' && hit.playing );
  const clip = media.find( m => m.src === ELECTRIC_TRACK_URLS[ hit.clip ] ); assert.ok( clip && ! clip.paused ); const plays = clip.plays;
  actor.freetime = 2; actor.v.origin = [ 200, 0, 0 ]; // ED_Free + ED_Alloc may reuse this exact object between audio frames.
  nativePacket( 'shambler/sboom.wav', 3 ); assert.equal( nativeStarts(), 1, 'the new actor life has no admitted electric receipt' );
  assert.equal( clip.paused, false, 'the old full contact tail may still finish independently' ); assert.equal( clip.plays, plays, 'the new actor cannot restart the old recording' );
 } finally { Object.assign( sv, saved ); }
} ) );
Deno.test( 'a synchronous MP3 play throw cannot claim electric admission or swallow the native source', () => fixture( async ( { nativeStarts, media } ) => {
 const play = Media.prototype.play;
 try {
  Media.prototype.play = function () { this.plays++; throw Error( 'independent synchronous media failure' ); };
  pulse(); nativePacket( 'weapons/lstart.wav' );
  const clip = media.find( m => m.src === ELECTRIC_TRACK_URLS[ 20 ] ); assert.ok( clip ); assert.equal( clip.plays, 1 ); assert.equal( clip.paused, true ); assert.equal( nativeStarts(), 1 );
  const firing = S_GetElectricSoundsStatus().voices.find( voice => voice.role === 'firing' ); assert.ok( firing ); assert.equal( firing.playing, false, 'failed synchronous start is immediately observable before any promise turn' );
 } finally { Media.prototype.play = play; }
} ) );
function waterGeometry() {
 const air = { contents: -1, ambient_sound_level: new Uint8Array( 4 ) }, water = { contents: -3, ambient_sound_level: new Uint8Array( 4 ) };
 cl.worldmodel = { nodes: [ { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, children: [ air, water ] } ] };
 cls.demoplayback = true; cls.demofile = {}; cl.viewheight = 22; cl.onground = true; cl.velocity.fill( 0 ); cl_entities[ 1 ].origin.set( [ 0, 0, 40 ] );
}
Deno.test( 'native water entry is replaced only for the local submerged player with an actually admitted entry recording', () => fixture( async ( { nativeStarts, media } ) => {
 waterGeometry(); S_UpdatePlayerWater(); nativePacket( 'player/inh2o.wav' ); assert.equal( nativeStarts(), 1, 'no active entry recording above water' );
 cl_entities[ 1 ].origin[ 2 ] = -40; nativePacket( 'player/inh2o.wav' );
 const entry = media.find( m => m.src === WATER_TRACK_URLS.enter ); assert.ok( entry && ! entry.paused ); assert.equal( entry.plays, 1 ); assert.equal( nativeStarts(), 1 );
 nativePacket( 'player/inh2o.wav', 2 ); assert.equal( nativeStarts(), 2, 'another player keeps its own native source' ); assert.equal( entry.plays, 1 );
 entry.onerror(); nativePacket( 'player/inh2o.wav' ); assert.equal( nativeStarts(), 3, 'failed entry recording cannot suppress the original' );
 cl_entities[ 1 ].origin[ 2 ] = 40; nativePacket( 'player/inh2o.wav' ); assert.equal( nativeStarts(), 4, 'surface entry packets never borrow underwater admission' );
} ) );
Deno.test( 'actual native water1 and water2 wading packets are replaced only while the local walking recording is audible and fall back after its fade or failure', () => fixture( async ( { context, nativeStarts, media } ) => {
 const wade = ( entity = 1, variant = 1 ) => nativePacket( 'misc/water' + variant + '.wav', entity );
 waterGeometry(); cl_entities[ 1 ].origin[ 2 ] = 10; S_UpdatePlayerWater(); wade(); assert.equal( nativeStarts(), 1, 'stationary shallow water has no audible custom wading' );
 cl.velocity[ 0 ] = 120; context.currentTime += .2; cl.time += .2; wade();
 const walking = media.find( m => m.src === WATER_TRACK_URLS.walking ); assert.ok( walking && ! walking.paused ); assert.ok( S_GetPlayerWaterStatus().tracks.walking.gain > .9 ); assert.equal( nativeStarts(), 1 );
 wade( 1, 2 ); assert.equal( nativeStarts(), 1, 'both actual native random variants share the admitted local wading cue' );
 wade( 2 ); assert.equal( nativeStarts(), 2, 'another actor does not borrow the local walking cue' );
 cl.velocity.fill( 0 ); context.currentTime += 2; cl.time += 2; wade(); assert.equal( nativeStarts(), 3 ); assert.equal( S_GetPlayerWaterStatus().tracks.walking.gain, 0, 'completed fade has no admitted audible counterpart' );
 cl.velocity[ 0 ] = 120; context.currentTime += .2; cl.time += .2; wade(); assert.equal( nativeStarts(), 3 ); walking.onerror(); wade(); assert.equal( nativeStarts(), 4, 'media failure restores the native wading source' );
} ) );
