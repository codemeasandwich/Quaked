/** Ending, death/reset and power-up cues. Confirmed native pickups fan out from
 * the existing QC observer; remote/custom games use post-signon client inventory
 * edges. Audio never owns item bits, timers, damage, respawn or level completion.
 */
import { cl, cls, ca_connected, SIGNONS } from '../../engine/client/client.js';
import { sv, svs } from '../../engine/server/server.js';
import { key_dest, key_game } from '../../engine/client/keys.js';
import { IT_QUAD, IT_INVISIBILITY, IT_INVULNERABILITY, STAT_HEALTH } from '../../engine/common/quakedef.js';
import { standard_quake } from '../../engine/common/common.js';
import { GameSelection_Running } from '../../engine/common/game_selection.js';
import { Cvar_VariableValue } from '../../engine/common/cvar.js';
import { volume } from '../../engine/sound/sound.js';
import { S_GetAudioContext, S_GetMasterGain } from '../../engine/sound/snd_dma.js';
import { R_NewerGame } from '../mode.js';
import { SV_CheatPowerOn } from '../gameplay/sv_cheats.js';
import { SV_AddPowerupObserver, SV_FaceLocalActive, SV_PlayerPowerMask } from '../gameplay/sv_faceevents.js';
import { createEffectDeck, startEffect, stopEffect, releaseEffect } from './s_effectdeck.js';

export const PLAYER_EVENT_TRACK_URLS = Object.freeze( {
	end: new URL( '../../../assets/audio/sounds/end_of_quake1.mp3', import.meta.url ).href,
	death: new URL( '../../../assets/audio/sounds/newerGame_die_reset.mp3', import.meta.url ).href,
	quad: new URL( '../../../assets/audio/sounds/on-quad-pickup.mp3', import.meta.url ).href,
	ring: new URL( '../../../assets/audio/sounds/on-ring-pickup.mp3', import.meta.url ).href,
	pentagram: new URL( '../../../assets/audio/sounds/on-pentagram-pickup.mp3', import.meta.url ).href,
	pair: new URL( '../../../assets/audio/sounds/two-active-powerups.mp3', import.meta.url ).href,
	triple: new URL( '../../../assets/audio/sounds/third-powerup-pickup.mp3', import.meta.url ).href
} );
export const PLAYER_PAIR_FADE_OUT = 1.8;
const MASK = IT_QUAD | IT_INVISIBILITY | IT_INVULNERABILITY;
const count = mask => Number( !! ( mask & IT_QUAD ) ) + Number( !! ( mask & IT_INVISIBILITY ) ) + Number( !! ( mask & IT_INVULNERABILITY ) );
const bitFor = { quad: IT_QUAD, ring: IT_INVISIBILITY, pentagram: IT_INVULNERABILITY };
const cueFor = { quad: 'quad', invisibility: 'ring', invulnerability: 'pentagram' };
const LIMIT = 32;
let pending = [], decks = {}, world, lastTime = null, pairArmed = false, finalePlayed = false;
let status = { active: false, reason: 'not started', powerMask: 0, powerCount: 0 };

/** New client/world epoch: no loaded inventory can replay an old pickup/death. */
export function S_PlayerEventsReset() {
	pending = []; pairArmed = false; finalePlayed = false; lastTime = null;
	for ( const deck of Object.values( decks ) ) stopEffect( deck );
	world = cl.worldmodel;
}
function syncWorld() { if ( world !== cl.worldmodel ) S_PlayerEventsReset(); }
const eligible = () => R_NewerGame() && ! cls.demoplayback && cls.state === ca_connected && cls.signon === SIGNONS;
function enqueue( event ) {
	syncWorld();
	if ( ! eligible() ) return;
	if ( pending.length >= LIMIT ) pending.shift();
	pending.push( event );
}
SV_AddPowerupObserver( event => {
	const cue = cueFor[ event.power ];
	if ( cue ) enqueue( { kind: 'power', cue, before: event.beforePowers, after: event.afterPowers } );
} );

// Custom local progs use the protocol fallback, but Options cheat switches
// still must not masquerade as pickups or distinct earned combination powers.
function protocolPowers( items ) {
 let mask = items & MASK;
 const player = svs.clients?.[ 0 ]?.edict;
 const local = sv.active && sv.worldmodel === cl.worldmodel && cls.netcon?.driver === 0 &&
  !!cls.netcon?.driverdata && cls.netcon.driverdata === svs.clients?.[ 0 ]?.netconnection;
 if ( local && player ) for ( const [ name, bit ] of Object.entries( bitFor ) )
  if ( SV_CheatPowerOn( name, player ) ) mask &= ~bit;
 return mask;
}

/** Fallback only: native confirmed touches also catch renewals without new bits. */
export function S_PlayerInventory( before, after ) {
	if ( SV_FaceLocalActive() ) return;
	const previous = protocolPowers( before ), next = protocolPowers( after );
	const gained = next & ~previous;
	// Remove powers lost in this same packet before classifying new pickups.
	let mask = previous & next;
	for ( const [ cue, bit ] of Object.entries( bitFor ) ) if ( gained & bit ) {
		enqueue( { kind: 'power', cue, before: mask, after: mask | bit } ); mask |= bit;
	}
}

/** Called before clientdata writes health; repeated dead packets are silent.
 * The one-shot may finish through death/same-world respawn; it is not an alive loop. */
export function S_PlayerHealthChanged( health ) {
	syncWorld();
	if ( health <= 0 && cl.stats[ STAT_HEALTH ] > 0 ) {
		pending = []; pairArmed = false;
		for ( const [ key, deck ] of Object.entries( decks ) ) if ( key !== 'death' ) stopEffect( deck );
		enqueue( { kind: 'death' } );
	}
}

/** Only an actual finale message on base Quake's final map arms the ending.
 * Episode endings, mission packs, title demos and ordinary intermissions do not. */
export function S_PlayerFinale() {
	syncWorld();
	const game = GameSelection_Running();
	if ( ! eligible() || finalePlayed || ! standard_quake || ( game !== null && game !== 'quake' ) ||
		! /(?:^|\/)end\.bsp$/i.test( cl.worldmodel?.name ?? '' ) ) return;
	finalePlayed = true; enqueue( { kind: 'end' } );
}
function deckFor( key, context ) {
	return decks[ key ] ??= createEffectDeck( context, PLAYER_EVENT_TRACK_URLS[ key ], key === 'pair', S_GetMasterGain() );
}
function trigger( key, context ) {
	const deck = deckFor( key, context ); stopEffect( deck ); deck.level = deck.gain.gain.value = 1; startEffect( deck, true );
}

/** Host-frame playback: consume each notification once, then apply live power
 * state. Pair is a loop armed by a real second/third acquisition, resumes on
 * 3->2 expiry, and fades for 1.8s when the count leaves two. */
export function S_UpdatePlayerEvents() {
	syncWorld();
	const context = S_GetAudioContext();
	const powerMask = cl.stats[ STAT_HEALTH ] > 0 ? ( SV_FaceLocalActive() ? SV_PlayerPowerMask() : protocolPowers( cl.items ) ) : 0;
	const powerCount = count( powerMask );
	let reason = '';
	if ( ! R_NewerGame() ) reason = 'classic game';
	else if ( cls.demoplayback ) reason = 'demo';
	else if ( ! eligible() || ! cl.worldmodel ) reason = 'no game';
	else if ( cl.paused || ( sv.active && sv.paused ) ) reason = 'paused';
	else if ( key_dest !== key_game ) reason = 'menu or console';
	else if ( typeof document !== 'undefined' && document.hidden ) reason = 'hidden';
	else if ( volume.value <= 0 || Cvar_VariableValue( 'nosound' ) !== 0 ) reason = 'muted';
	else if ( ! context || context.state !== 'running' || ! S_GetMasterGain() ) reason = 'audio unavailable';
	const now = context?.currentTime ?? 0, dt = lastTime === null ? 0 : Math.max( 0, now - lastTime );
	lastTime = now; status = { active: reason === '', reason, powerMask, powerCount };
	const events = pending; pending = [];
	if ( reason ) {
		lastTime = null;
		for ( const deck of Object.values( decks ) ) stopEffect( deck );
		if ( [ 'classic game', 'demo', 'no game' ].includes( reason ) ) pairArmed = false;
		return; // suppressed one-shots are never replayed when the menu/mute ends
	}
	for ( const event of events ) {
		if ( event.kind === 'power' && cl.stats[ STAT_HEALTH ] > 0 && ! cl.intermission ) {
			trigger( event.cue, context );
			const before = count( event.before ), after = count( event.after );
			if ( after > before && ( after === 2 || after === 3 ) ) pairArmed = true;
			if ( before === 2 && after === 3 ) trigger( 'triple', context );
		} else if ( event.kind === 'death' ) trigger( 'death', context );
		else if ( event.kind === 'end' ) {
			for ( const [ key, deck ] of Object.entries( decks ) ) if ( key !== 'end' ) stopEffect( deck );
			trigger( 'end', context );
		}
	}
	if ( cl.stats[ STAT_HEALTH ] <= 0 || cl.intermission ) {
		pairArmed = false;
		for ( const [ key, deck ] of Object.entries( decks ) ) if ( key !== 'death' && key !== 'end' ) stopEffect( deck );
	} else if ( ! powerCount ) pairArmed = false;
	const wanted = pairArmed && powerCount === 2 && ! cl.intermission;
	const pair = wanted ? deckFor( 'pair', context ) : decks.pair;
	if ( pair ) {
		if ( wanted ) {
			if ( pair.level === 0 ) { stopEffect( pair ); pair.media.currentTime = 0; }
			pair.level = 1; startEffect( pair );
		} else {
			pair.level = Math.max( 0, pair.level - dt / PLAYER_PAIR_FADE_OUT );
			if ( pair.level === 0 ) stopEffect( pair );
		}
		pair.gain.gain.value = pair.level;
	}
}

/** Release all media on stop-all/shutdown before their context closes. */
export function S_PlayerEventsShutdown() {
	for ( const deck of Object.values( decks ) ) releaseEffect( deck );
	decks = {}; S_PlayerEventsReset();
	status = { active: false, reason: 'not started', powerMask: 0, powerCount: 0 };
}
export function S_GetPlayerEventsStatus() {
	return { ...status, pending: pending.length, tracks: Object.fromEntries( Object.entries( decks ).map( ( [ key, deck ] ) =>
		[ key, { playing: deck.playing, gain: deck.gain.gain.value, blocked: deck.blocked, error: deck.error } ] ) ) };
}
