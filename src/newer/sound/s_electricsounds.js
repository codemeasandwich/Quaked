/** Native electrical cues at their source, nearest beam point and actual
 * contacts. Uses the existing sound listener/spatializer, SFX bus and streamed
 * decks; admitted clips finish naturally, never stolen by another cue.
 */
import { cl, cls, cl_entities, ca_connected, SIGNONS } from '../../engine/client/client.js';
import { sv } from '../../engine/server/server.js';
import { GetEdictFieldValue } from '../../engine/progs/pr_edict.js';
import { pr_crc } from '../../engine/progs/progs.js';
import { in_attack } from '../../engine/client/cl_input.js';
import { key_dest, key_game } from '../../engine/client/keys.js';
import { IT_LIGHTNING, STAT_HEALTH, STAT_WEAPON, STAT_CELLS } from '../../engine/common/quakedef.js';
import { Cvar_VariableValue } from '../../engine/common/cvar.js';
import { volume, listener_origin } from '../../engine/sound/sound.js';
import { S_GetAudioContext, S_GetMasterGain, SND_Spatialize } from '../../engine/sound/snd_dma.js';
import { R_NewerGame } from '../mode.js';
import { SV_AddElectricObserver, SV_ElectricSnapshot, ELECTRIC_ROGUE_CRC } from '../gameplay/sv_electricsounds.js';
import { createEffectDeck, startEffect, stopEffect, releaseEffect } from './s_effectdeck.js';

export const ELECTRIC_ROLES = Object.freeze( Object.fromEntries( Object.entries( {
 charge: [ 3, 9 ], shamblerStop: [ 8 ], firing: [ 20 ], playerStop: [ 10, 5 ],
 hit: [ 6, 14 ], miss: [ 2, 12 ], water: [ 4, 10 ], eel: [ 28 ]
} ).map( ( [ role, clips ] ) => [ role, Object.freeze( clips ) ] ) ) );
export const ELECTRIC_TRACK_URLS = Object.freeze( {
 2: new URL( '../../../assets/sounds/electric/electric-spell-02.mp3', import.meta.url ).href,
 3: new URL( '../../../assets/sounds/electric/electric-spell-03.mp3', import.meta.url ).href,
 4: new URL( '../../../assets/sounds/electric/electric-spell-04.mp3', import.meta.url ).href,
 5: new URL( '../../../assets/sounds/electric/electric-spell-05.mp3', import.meta.url ).href,
 6: new URL( '../../../assets/sounds/electric/electric-spell-06.mp3', import.meta.url ).href,
 8: new URL( '../../../assets/sounds/electric/electric-spell-08.mp3', import.meta.url ).href,
 9: new URL( '../../../assets/sounds/electric/electric-spell-09.mp3', import.meta.url ).href,
 10: new URL( '../../../assets/sounds/electric/electric-spell-10.mp3', import.meta.url ).href,
 12: new URL( '../../../assets/sounds/electric/electric-spell-12.mp3', import.meta.url ).href,
 14: new URL( '../../../assets/sounds/electric/electric-spell-14.mp3', import.meta.url ).href,
 20: new URL( '../../../assets/sounds/electric/electric-spell-20.mp3', import.meta.url ).href,
 28: new URL( '../../../assets/sounds/electric/electric-spell-28.mp3', import.meta.url ).href,
} );
export const ELECTRIC_VOICE_LIMIT = 24, ELECTRIC_PULSE_HOLD = .25;
const QUEUE_LIMIT = 128, ACTOR_LIMIT = 128, REACH = 1600, BASE_GAIN = .32;
let pending = [], pool = [], states = new Map(), alternates = {}, world, edicts, lastTime = -Infinity, serial = 0, dropped = 0;
let status = { active: false, reason: 'not started' };
const valid = p => Array.isArray( p ) && p.length === 3 && p.every( Number.isFinite );
const copy = p => [ p[ 0 ], p[ 1 ], p[ 2 ] ];
const now = () => sv.active && sv.worldmodel === cl.worldmodel ? sv.time : cl.time;
const proxy = { origin: new Float32Array( 3 ), master_vol: 255, dist_mult: 1 / REACH,
 entnum: -1, sfx: { name: 'quaked/electric' }, leftvol: 0, rightvol: 0 };

/** Clamped closest point on the actual stream, not an invented midpoint. */
export function closestPointOnElectricStream( start, end, listener ) {
 const d = end.map( ( v, i ) => v - start[ i ] ), length2 = d.reduce( ( n, v ) => n + v * v, 0 );
 const t = length2 > 0 ? Math.max( 0, Math.min( 1, d.reduce( ( n, v, i ) => n + v * ( listener[ i ] - start[ i ] ), 0 ) / length2 ) ) : 0;
 return start.map( ( v, i ) => v + d[ i ] * t );
}
function syncWorld() { if ( world !== cl.worldmodel || edicts !== sv.edicts || now() < lastTime ) S_ElectricSoundsReset(); }
/** Client clear/world rewind: explicit lifecycle cancellation, not a firing stop. */
export function S_ElectricSoundsReset() {
 for ( const voice of pool ) { stopEffect( voice.deck ); voice.active = false; }
 pending = []; states = new Map(); alternates = {}; dropped = 0;
 world = cl.worldmodel; edicts = sv.edicts; lastTime = -Infinity;
}

/** The real native observer subscriber. Public adapter tests may supply the same
 * typed event without an epoch; native receipts carry epochs for stale rejection.
 * Positions are copied so gameplay vectors are never retained or written. */
export function S_ElectricEvent( event ) {
 syncWorld();
 if ( ! [ 'charge', 'pulse', 'stop' ].includes( event?.kind ) || ! [ 'player', 'shambler', 'eel' ].includes( event.actor ) ||
  ! Number.isInteger( event.entity ) || event.entity < 1 || ! Number.isFinite( event.time ) || ! valid( event.source ) ) return;
 if ( event.epoch !== undefined && event.epoch !== SV_ElectricSnapshot().epoch ) return;
 if ( event.kind === 'pulse' && ( ! valid( event.start ) || ! valid( event.end ) ) ) return;
 if ( pending.length >= QUEUE_LIMIT ) { dropped ++; return; }
 pending.push( { ...event, source: copy( event.source ), start: valid( event.start ) ? copy( event.start ) : copy( event.source ),
  end: valid( event.end ) ? copy( event.end ) : copy( event.source ),
  hits: ( event.hits ?? [] ).filter( hit => Number.isInteger( hit.target ) && valid( hit.position ) ).slice( 0, 16 )
   .map( hit => ( { ...hit, position: copy( hit.position ) } ) ),
  water: ( event.water ?? [] ).filter( valid ).slice( 0, 4 ).map( copy ) } );
}
SV_AddElectricObserver( S_ElectricEvent );

function why( context ) {
 if ( ! R_NewerGame() ) return 'classic game';
 if ( cls.demoplayback ) return 'demo';
 if ( cls.state !== ca_connected || cls.signon !== SIGNONS || ! cl.worldmodel ) return 'no game';
 if ( cl.stats[ STAT_HEALTH ] <= 0 || ( sv.active && sv.worldmodel === cl.worldmodel && sv.edicts?.[ 1 ]?.v.health <= 0 ) ) return 'dead';
 if ( cl.intermission ) return 'intermission';
 if ( cl.paused || ( sv.active && sv.paused ) ) return 'paused';
 if ( key_dest !== key_game ) return 'menu or console';
 if ( typeof document !== 'undefined' && document.hidden ) return 'hidden';
 if ( volume.value <= 0 || Cvar_VariableValue( 'nosound' ) !== 0 ) return 'muted';
 if ( ! context || context.state !== 'running' || ! S_GetMasterGain() ) return 'audio unavailable';
 if ( typeof context.createStereoPanner !== 'function' ) return 'spatial audio unavailable';
 return '';
}
function actorRef( entity ) {
 return sv.active && sv.worldmodel === cl.worldmodel ? sv.edicts?.[ entity ] : cl_entities[ entity ];
}
const originOf = ref => ref?.v?.origin ?? ref?.origin;
function stateFor( event ) {
 const key = event.actor + ':' + event.entity;
 let state = states.get( key );
 const ref = actorRef( event.entity );
 if ( state && ( state.retired || state.ref !== ref || state.life !== ref?.freetime ) ) state = null;
 if ( ! state ) {
  if ( ! states.has( key ) && states.size >= ACTOR_LIMIT ) { dropped ++; return null; }
  state = { key, actor: event.actor, entity: event.entity, firing: false, lastPulse: -Infinity, lastEvent: event.time, firingVoice: 0 };
  states.set( key, state );
 }
 const origin = originOf( ref );
 state.ref = ref; state.life = ref?.freetime; state.source = event.source; state.offset = origin ? event.source.map( ( v, i ) => v - origin[ i ] ) : [ 0, 0, 0 ];
 state.start = event.start; state.end = event.end; state.lastEvent = event.time;
 return state;
}
function liveSource( state ) {
 const origin = originOf( state.ref );
 return origin && ! state.ref.free && ( ! state.ref.v || state.ref.v.health > 0 ) ?
  Array.from( origin, ( v, i ) => v + state.offset[ i ] ) : state.source;
}
function request( role, state, anchor, position, key, context ) {
 // A repeated pulse must not restart, move, or steal a still-playing contact tail.
 const existing = pool.find( voice => voice.active && voice.state === state && voice.key === key && ( voice.deck.playing || voice.deck.blocked ) );
 if ( existing ) return existing;
 const options = ELECTRIC_ROLES[ role ], turn = alternates[ role ] ?? 0, clip = options[ turn % options.length ];
 let voice = pool.find( item => ! item.deck.playing && ! item.deck.blocked );
 if ( ! voice ) {
  if ( pool.length >= ELECTRIC_VOICE_LIMIT ) { dropped ++; return null; }
  const panner = context.createStereoPanner(); panner.connect( S_GetMasterGain() );
  voice = { panner, deck: createEffectDeck( context, ELECTRIC_TRACK_URLS[ clip ], false, panner ), active: false }; pool.push( voice );
  // A point source must downmix the recorded stereo BEFORE its spatial stereo
  // placement, otherwise a wide source recording keeps the wrong ear energy.
  voice.deck.gain.channelCount = 1; voice.deck.gain.channelCountMode = 'explicit'; voice.deck.gain.channelInterpretation = 'speakers';
 }
 alternates[ role ] = turn + 1;
 // Only an idle/naturally completed slot is reused. No admitted full recording
 // is stopped by a new event, phase change, or pool overload.
 voice.id = ++serial; voice.role = role; voice.clip = clip; voice.key = key; voice.entity = state.entity;
 voice.anchor = anchor; voice.position = copy( position ); voice.state = state;
 voice.ref = state.ref; voice.life = state.life; voice.offset = state.offset.slice(); voice.active = true; voice.pan = voice.gain = 0;
 if ( voice.deck.media.src !== ELECTRIC_TRACK_URLS[ clip ] ) voice.deck.media.src = ELECTRIC_TRACK_URLS[ clip ];
 voice.deck.media.loop = false;
 spatialize( voice ); startEffect( voice.deck, true );
 return voice;
}
function spatialize( voice ) {
 if ( voice.anchor === 'source' ) {
  const origin = originOf( voice.ref );
  if ( ! voice.ref || actorRef( voice.entity ) !== voice.ref || voice.ref.free || voice.ref.freetime !== voice.life || ( voice.ref.v && voice.ref.v.health <= 0 ) ) {
   // Freeze once retired: a recycled native/client slot must never drag an
   // admitted full-file tail to a different creature later in this world.
   voice.ref = null; voice.state.retired = true;
  } else if ( origin ) voice.position = Array.from( origin, ( v, i ) => v + voice.offset[ i ] );
 } else if ( voice.anchor === 'stream' ) voice.position = closestPointOnElectricStream( voice.state.start, voice.state.end, listener_origin );
 proxy.origin.set( voice.position ); SND_Spatialize( proxy );
 const sum = proxy.leftvol + proxy.rightvol;
 voice.pan = sum ? Math.max( -1, Math.min( 1, ( proxy.rightvol - proxy.leftvol ) / sum ) ) : 0;
 // StereoPanner owns ear balance. Mean native ear amplitude isolates distance
 // attenuation, avoiding a clipped near-field plateau for off-axis sources.
 voice.gain = BASE_GAIN * Math.min( 1, sum / ( 2 * 255 ) );
 voice.panner.pan.value = voice.pan; voice.deck.gain.gain.value = voice.gain;
}
function nativeCells( player ) {
 const field = pr_crc === ELECTRIC_ROGUE_CRC ? GetEdictFieldValue( player, 'ammo_cells1' ) : null;
 return field ? field.accessor.getFloat( field.ofs ) : player.v.ammo_cells;
}
function playerCeased( state ) {
 const self = sv.active && sv.worldmodel === cl.worldmodel ? state.ref : null;
 if ( self?.v ) return self.v.button0 === 0 || self.v.weapon !== IT_LIGHTNING || nativeCells( self ) <= 0;
 return ! ( in_attack.state & 1 ) || cl.stats[ STAT_WEAPON ] !== IT_LIGHTNING || cl.stats[ STAT_CELLS ] <= 0;
}
function consume( event, context ) {
 const state = stateFor( event ); if ( ! state ) return;
 if ( event.kind === 'charge' && event.actor === 'shambler' ) {
  request( 'charge', state, 'source', event.source, state.key + ':charge', context ); return;
 }
 if ( event.kind === 'stop' ) {
  if ( event.actor === 'shambler' ) request( 'shamblerStop', state, 'source', event.source, state.key + ':stop', context );
  return;
 }
 if ( event.actor === 'player' ) { if ( ! state.firing ) state.firingVoice = 0; state.firing = true; state.lastPulse = event.time; }
 if ( event.actor === 'eel' ) request( 'eel', state, 'source', event.source, state.key + ':eel', context );
 for ( const hit of event.hits ) request( 'hit', state, 'contact', hit.position, state.key + ':hit:' + hit.target, context );
 if ( event.water.length ) request( 'water', state, 'contact', event.water[ 0 ], state.key + ':water', context );
 else if ( ! event.hits.length && event.actor !== 'eel' ) request( 'miss', state, 'contact', event.end, state.key + ':miss', context );
}

/** Host-frame placement uses current listener orientation and actual native
 * positions. All one-shots start at time0 and run to onended, even across ordinary
 * charge/cast/release transitions. Lifecycle cancellation is the explicit exception. */
export function S_UpdateElectricSounds() {
 syncWorld(); const time = now(); lastTime = time;
 const context = S_GetAudioContext(), reason = why( context ); status = { active: ! reason, reason };
 if ( reason ) {
  pending = []; states.clear();
  for ( const voice of pool ) { if ( voice.deck.playing ) stopEffect( voice.deck ); voice.active = false; }
  return;
 }
 for ( const voice of pool ) if ( ! voice.deck.playing && ! voice.deck.blocked ) voice.active = false;
 const events = pending; pending = [];
 for ( const event of events ) if ( event.epoch === undefined || event.epoch === SV_ElectricSnapshot().epoch ) consume( event, context );
 for ( const [ key, state ] of states ) {
  if ( state.actor === 'player' && state.firing ) {
   // Begin/continue a whole firing file, never restart it on every native pulse.
   const ceased = playerCeased( state );
   const released = ceased && time - state.lastPulse >= ELECTRIC_PULSE_HOLD;
   const previous = pool.find( v => v.id === state.firingVoice );
   if ( ( ! ceased || ! state.firingVoice ) && time - state.lastPulse < ELECTRIC_PULSE_HOLD && ! previous?.deck.blocked && ( ! previous || ! previous.deck.playing ) ) {
    const voice = request( 'firing', state, 'stream', closestPointOnElectricStream( state.start, state.end, listener_origin ), key + ':firing', context );
    if ( voice ) state.firingVoice = voice.id;
   }
   if ( released ) {
    state.firing = false;
    request( 'playerStop', state, 'source', liveSource( state ), key + ':stop', context );
   }
  }
  if ( ! state.firing && time - state.lastEvent > 8 && ! pool.some( voice => voice.deck.playing && voice.state === state ) ) states.delete( key );
 }
 for ( const voice of pool ) if ( voice.deck.playing ) spatialize( voice );
}
/** Sound restart disposes every context-bound node and cancels pending play. */
export function S_ElectricSoundsShutdown() {
 for ( const voice of pool ) { releaseEffect( voice.deck ); voice.panner.disconnect(); }
 pool = []; S_ElectricSoundsReset(); status = { active: false, reason: 'not started' };
}
export function S_GetElectricSoundsStatus() {
 return { ...status, firing: Array.from( states.values() ).some( state => state.firing ), dropped,
  pending: pending.length, limit: ELECTRIC_VOICE_LIMIT,
  voices: pool.filter( voice => voice.id ).map( voice => ( { id: voice.id, role: voice.role, clip: voice.clip, entity: voice.entity,
   anchor: voice.anchor, position: voice.position.slice(), pan: voice.pan, gain: voice.gain,
   playing: voice.deck.playing, blocked: voice.deck.blocked, error: voice.deck.error } ) ) };
}
