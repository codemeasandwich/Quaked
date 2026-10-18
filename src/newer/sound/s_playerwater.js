/** Player water effects, streamed on Quake's existing effects bus (Sound Volume).
 * One deck per cue; host updates keep this independent of HUD visibility. Demo
 * water comes from recorded player geometry; live air stays native QC-owned.
 */
import { cl, cls, ca_connected, SIGNONS } from '../../engine/client/client.js';
import { sv } from '../../engine/server/server.js';
import { key_dest, key_game } from '../../engine/client/keys.js';
import { STAT_HEALTH } from '../../engine/common/quakedef.js';
import { Cvar_VariableValue } from '../../engine/common/cvar.js';
import { volume } from '../../engine/sound/sound.js';
import { S_GetAudioContext, S_GetMasterGain } from '../../engine/sound/snd_dma.js';
import { R_NewerGame } from '../mode.js';
import { CL_PlayerWater } from '../gameplay/cl_water.js';
import { createEffectDeck, startEffect as start, stopEffect as stop, releaseEffect } from './s_effectdeck.js';

// Keep literal new URL calls: the distribution bundler rewrites these assets.
export const WATER_TRACK_URLS = Object.freeze( {
	bubbles: new URL( '../../../assets/sounds/player-bubbles.mp3', import.meta.url ).href,
	underwater: new URL( '../../../assets/sounds/underwater.mp3', import.meta.url ).href,
	enter: new URL( '../../../assets/sounds/enter-underwater.mp3', import.meta.url ).href,
	walking: new URL( '../../../assets/sounds/walking-in-water.mp3', import.meta.url ).href
} );
export const WATER_WALK_FADE_IN = .12, WATER_WALK_FADE_OUT = 1.8;
let decks = {}, epoch, wasSubmerged = false, lastTime = null;
let status = { active: false, reason: 'not started', submerged: false };

function deckFor( key, context ) {
	if ( decks[ key ] ) return decks[ key ];
	return decks[ key ] = createEffectDeck( context, WATER_TRACK_URLS[ key ], key !== 'enter', S_GetMasterGain() );
}

function loop( key, wanted, context, dt, fadeIn = 0, fadeOut = 0 ) {
	const deck = wanted ? deckFor( key, context ) : decks[ key ];
	if ( ! deck ) return;
	if ( wanted ) {
		deck.level = fadeIn ? Math.min( 1, deck.level + dt / fadeIn ) : 1;
		start( deck );
	} else {
		deck.level = fadeOut ? Math.max( 0, deck.level - dt / fadeOut ) : 0;
		if ( deck.level <= 0 ) stop( deck );
	}
	deck.gain.gain.value = deck.level;
}

/** Called every host frame beside the existing ambient and low-health updates.
 * Pauses/hide/mute stop immediately. Surface movement fades in over 120ms and
 * out over 1.8s after stopping; leaving shallow water cancels the tail. A paused
 * or muted submersion retains its edge so resuming cannot replay entry.
 */
export function S_UpdatePlayerWater() {
	const water = CL_PlayerWater(), context = S_GetAudioContext();
	let reason = '';
	if ( ! R_NewerGame() ) reason = 'classic game';
	else if ( cls.state !== ca_connected || cls.signon !== SIGNONS || ! cl.worldmodel ) reason = 'no game';
	else if ( cl.stats[ STAT_HEALTH ] <= 0 ) reason = 'dead';
	else if ( cl.intermission ) reason = 'intermission';
	else if ( cl.paused || ( ! cls.demoplayback && sv.active && sv.paused ) ) reason = 'paused';
	else if ( ! cls.demoplayback && key_dest !== key_game ) reason = 'menu or console';
	else if ( typeof document !== 'undefined' && document.hidden ) reason = 'hidden';
	else if ( volume.value <= 0 || Cvar_VariableValue( 'nosound' ) !== 0 ) reason = 'muted';
	else if ( ! context || context.state !== 'running' || ! S_GetMasterGain() ) reason = 'audio unavailable';
	else if ( ! water.known ) reason = 'unknown water';
	if ( epoch !== water.epoch ) {
		for ( const deck of Object.values( decks ) ) stop( deck );
		epoch = water.epoch; wasSubmerged = false; lastTime = null;
	}
	const submerged = water.water && water.submerged;
	const entered = submerged && ! wasSubmerged;
	wasSubmerged = submerged;
	const now = context?.currentTime ?? 0;
	const dt = lastTime === null ? 0 : Math.max( 0, now - lastTime );
	lastTime = now;
	status = { active: reason === '', reason, submerged };
	if ( reason ) {
		lastTime = null;
		for ( const deck of Object.values( decks ) ) stop( deck );
		return;
	}
	if ( entered ) {
		const deck = deckFor( 'enter', context ); stop( deck ); deck.level = deck.gain.gain.value = 1; start( deck, true );
	} else if ( ! submerged && decks.enter ) stop( decks.enter );
	loop( 'underwater', submerged, context, dt );
	loop( 'bubbles', submerged && water.filling, context, dt );
	loop( 'walking', water.wading, context, dt, WATER_WALK_FADE_IN, water.water && ! submerged ? WATER_WALK_FADE_OUT : 0 );
}

/** Release nodes/elements before S_Shutdown closes their owning context. */
export function S_PlayerWaterShutdown() {
	for ( const deck of Object.values( decks ) ) {
		releaseEffect( deck );
	}
	decks = {}; epoch = undefined; wasSubmerged = false; lastTime = null;
	status = { active: false, reason: 'not started', submerged: false };
}

/** Diagnostic copy of policy and actual deck state, also used by public tests. */
export function S_GetPlayerWaterStatus() {
	return { ...status, tracks: Object.fromEntries( Object.entries( decks ).map( ( [ key, deck ] ) =>
		[ key, { playing: deck.playing, gain: deck.gain.gain.value, blocked: deck.blocked, error: deck.error } ] ) ) };
}
