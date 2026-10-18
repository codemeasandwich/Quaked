/** Two supplied environmental cues, using the shared SFX decks and existing map
 * emitters, spatializer and drawn-alias visibility. Never changes native state.
 */
import { cl, cls, cl_entities, cl_static_entities, ca_connected, SIGNONS } from '../../engine/client/client.js';
import { sv, svs } from '../../engine/server/server.js';
import { PR_GetString } from '../../engine/progs/progs.js';
import { key_dest, key_game } from '../../engine/client/keys.js';
import { STAT_HEALTH } from '../../engine/common/quakedef.js';
import { Cvar_VariableValue } from '../../engine/common/cvar.js';
import { volume } from '../../engine/sound/sound.js';
import { S_GetAudioContext, S_GetMasterGain, SND_Spatialize } from '../../engine/sound/snd_dma.js';
import { R_NewerGame } from '../mode.js';
import { R_AmbientPlaces, R_AmbientPlacesVersion } from '../render/r_ambientplaces.js';
import { R_VisibleAliasBounds } from '../render/r_aliasvisibility.js';
import { createEffectDeck, startEffect, stopEffect, releaseEffect } from './s_effectdeck.js';

export const ENVIRONMENT_TRACK_URLS = Object.freeze( {
	fire: new URL( '../../../assets/audio/sounds/fire-Environmental.mp3', import.meta.url ).href,
	shub: new URL( '../../../assets/audio/sounds/firstSee_Shub.mp3', import.meta.url ).href
} );
export const ENVIRONMENT_FIRE_RADIUS = 800, ENVIRONMENT_FIRE_GAIN = .3;
export const ENVIRONMENT_FIRE_FADE_IN = .2, ENVIRONMENT_FIRE_FADE_OUT = .8;
let world, decks = {}, panner = null, shubSeen = false, pendingShub = false;
let scanAt = -Infinity, registryVersion = -1, staticCount = -1, sources = 0, fireTarget = 0, firePan = 0, lastTime = null;
let status = { active: false, reason: 'not started' };
// Reuse Quake's exact listener, attenuation and stereo policy, without taking a
// dynamic/static native channel or changing one of its sounds.
const proxy = { origin: new Float32Array( 3 ), master_vol: 255, dist_mult: 1 / ENVIRONMENT_FIRE_RADIUS,
	entnum: -1, sfx: { name: 'quaked/environment-fire' }, leftvol: 0, rightvol: 0 };

function reason() {
	if ( ! R_NewerGame() ) return 'classic game';
	if ( cls.demoplayback ) return 'demo';
	if ( cls.state !== ca_connected || cls.signon !== SIGNONS || ! cl.worldmodel ) return 'no game';
	if ( cl.stats[ STAT_HEALTH ] <= 0 ) return 'dead';
	if ( cl.intermission ) return 'intermission';
	if ( cl.paused || ( sv.active && sv.paused ) ) return 'paused';
	if ( key_dest !== key_game ) return 'menu or console';
	if ( typeof document !== 'undefined' && document.hidden ) return 'hidden';
	if ( volume.value <= 0 || Cvar_VariableValue( 'nosound' ) !== 0 ) return 'muted';
	return '';
}
/** A cleared client/new world gives a fresh first sighting, independent of the
 * persistent Bestiary. Stop-all/audio restarts alone retain the sighting history. */
export function S_EnvironmentSoundsReset() {
	for ( const deck of Object.values( decks ) ) stopEffect( deck );
	world = cl.worldmodel; shubSeen = pendingShub = false;
	scanAt = -Infinity; registryVersion = staticCount = -1; sources = fireTarget = firePan = 0; lastTime = null;
}
function syncWorld() { if ( world !== cl.worldmodel ) S_EnvironmentSoundsReset(); }

/** Called for the main rendered scene after aliases are placed, before the
 * Bestiary may turn the camera. Only a paired local, living Shub actually seen
 * through the same frustum/brush-door LOS test can arm the cue. */
export function S_ObserveEnvironmentSounds( scene, camera, entities ) {
	syncWorld();
	if ( shubSeen || reason() ) return false;
	const local = svs.clients?.[ 0 ], peer = cls.netcon?.driverdata;
	if ( ! sv.active || sv.worldmodel !== cl.worldmodel || cls.netcon?.driver !== 0 || cls.netcon.disconnected ||
		! peer || peer.disconnected || peer !== local?.netconnection || ! local?.active || local.edict !== sv.edicts?.[ 1 ] ||
		local.edict.free || local.edict.v.health <= 0 ) return false;
	for ( const entity of entities ) {
		if ( ! /^progs\/oldone(?:_new)?\.mdl$/i.test( entity?.model?.name ?? '' ) ) continue;
		const index = cl_entities.indexOf( entity ), native = sv.edicts?.[ index ];
		if ( ! native || native.free || native.v.health <= 0 || native.v.deadflag !== 0 ||
			! /^(monster_oldone|monster_oldone_new)$/.test( PR_GetString( native.v.classname ) ) ) continue;
		if ( ! R_VisibleAliasBounds( scene, camera, entity ) ) continue;
		shubSeen = pendingShub = true; return true;
	}
	return false;
}
function deckFor( key, context ) {
	if ( decks[ key ] ) return decks[ key ];
	let output = S_GetMasterGain();
	if ( key === 'fire' && context.createStereoPanner ) {
		panner = context.createStereoPanner(); panner.connect( output ); output = panner;
	}
	return decks[ key ] = createEffectDeck( context, ENVIRONMENT_TRACK_URLS[ key ], key === 'fire', output );
}
function scanFire() {
	const version = R_AmbientPlacesVersion();
	if ( cl.time >= scanAt && cl.time < scanAt + .1 && version === registryVersion && cl.num_statics === staticCount ) return;
	scanAt = cl.time; registryVersion = version; staticCount = cl.num_statics;
	const placed = R_AmbientPlaces( 'ambience/fire1.wav' );
	const positions = placed.length ? placed : cl_static_entities.slice( 0, Math.min( 128, cl.num_statics ) )
		.filter( entity => /^progs\/flame2?\.mdl$/i.test( entity?.model?.name ?? '' ) ).map( entity => entity.origin );
	sources = positions.length; fireTarget = firePan = 0;
	let loudest = 0;
	for ( const origin of positions ) {
		proxy.origin.set( origin ); SND_Spatialize( proxy );
		const total = proxy.leftvol + proxy.rightvol;
		if ( total <= loudest ) continue;
		loudest = total;
		fireTarget = ENVIRONMENT_FIRE_GAIN * Math.min( 1, Math.max( proxy.leftvol, proxy.rightvol ) / 255 );
		firePan = total ? Math.max( -1, Math.min( 1, ( proxy.rightvol - proxy.leftvol ) / total ) ) : 0;
	}
}
/** Host-frame loop update, independent of HUD/torch rendering. One conservative
 * fire layer follows the loudest placed source; native audio remains unchanged. */
export function S_UpdateEnvironmentSounds() {
	syncWorld();
	const context = S_GetAudioContext();
	let why = reason();
	if ( ! why && ( ! context || context.state !== 'running' || ! S_GetMasterGain() ) ) why = 'audio unavailable';
	status = { active: ! why, reason: why };
	const now = context?.currentTime ?? 0, dt = lastTime === null ? 0 : Math.max( 0, now - lastTime ); lastTime = now;
	if ( why ) {
		pendingShub = false; lastTime = null;
		for ( const deck of Object.values( decks ) ) stopEffect( deck );
		return;
	}
	if ( pendingShub ) {
		pendingShub = false;
		const deck = deckFor( 'shub', context ); stopEffect( deck ); deck.level = deck.gain.gain.value = 1; startEffect( deck, true );
	}
	scanFire();
	const fire = fireTarget > 0 ? deckFor( 'fire', context ) : decks.fire;
	if ( fire ) {
		const step = dt * ENVIRONMENT_FIRE_GAIN / ( fireTarget > fire.level ? ENVIRONMENT_FIRE_FADE_IN : ENVIRONMENT_FIRE_FADE_OUT );
		if ( fireTarget > fire.level ) fire.level = Math.min( fireTarget, fire.level + step );
		else fire.level = Math.max( fireTarget, fire.level - step );
		fire.gain.gain.value = fire.level;
		if ( panner ) panner.pan.value = firePan;
		if ( fire.level > 0 || fireTarget > 0 ) startEffect( fire ); else stopEffect( fire );
	}
}
/** Release context-bound media, preserving a same-world first-sighting receipt. */
export function S_EnvironmentSoundsShutdown() {
	for ( const deck of Object.values( decks ) ) releaseEffect( deck );
	decks = {}; panner?.disconnect(); panner = null; pendingShub = false; lastTime = null;
	status = { active: false, reason: 'not started' };
}
export function S_GetEnvironmentSoundsStatus() {
	return { ...status, fireSources: sources, fireGain: decks.fire?.gain.gain.value ?? 0, firePan, shubSeen,
		tracks: Object.fromEntries( Object.entries( decks ).map( ( [ key, deck ] ) =>
			[ key, { playing: deck.playing, gain: deck.gain.gain.value, blocked: deck.blocked, error: deck.error } ] ) ) };
}
