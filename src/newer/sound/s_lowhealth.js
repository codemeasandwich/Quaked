/**
 * @module newer/sound/s_lowhealth
 *
 * The low-health strain: a looping track while the local player is nearly dead, decided from the game each host frame.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `element`, `source`, `gain`, `playing`, `blocked`, `reason`.
 *
 * Errors: swallows the `play()` rejection so an autoplay refusal never escapes as an unhandled promise rejection.
 */
// One looping <audio> deck on Quake's already-unlocked audio context, through its
// own gain to the context destination, so Music Volume (bgmvolume) applies exactly
// as it does to the ambient bed and the intro jingle, and the separate Sound Volume
// slider cannot silence it. The track is streamed, never decoded into an AudioBuffer.
//
// ponytail: the deck construction below repeats `s_welcomejingle.js` rather than
// sharing a factory. Two call sites of four lines does not pay for an abstraction;
// extract when a third state-driven mp3 appears.
import { cl, cls, ca_connected, SIGNONS } from '../../engine/client/client.js';
import { sv, MOVETYPE_NOCLIP } from '../../engine/server/server.js';
import { key_dest, key_game } from '../../engine/client/keys.js';
import { STAT_HEALTH } from '../../engine/common/quakedef.js';
import { Cvar_VariableValue } from '../../engine/common/cvar.js';
import { bgmvolume } from '../../engine/sound/sound.js';
import { S_GetAudioContext } from '../../engine/sound/snd_dma.js';
import { R_NewerGame } from '../mode.js';

/**
 * The track itself. Built with `new URL(..., import.meta.url)` because the
 * distribution bundler rewrites exactly that form into its asset resolver (a bare
 * string literal would 404 in the packaged single-file web and Tauri builds).
 */
export const LOWHEALTH_TRACK_URL = new URL( '../../../assets/sounds/lowHealt.mp3', import.meta.url ).href;

/**
 * Health at or below which the strain plays. The band is therefore 1..11: the
 * native health readout still flashes red at 25 (`sbar.js`), so this is well
 * inside the already-alarming range, and `health <= 0` is death, not strain.
 */
export const LOW_HEALTH_THRESHOLD = 12;

let element = null, source = null, gain = null, playing = false, blocked = false, reason = 'not started';

/**
 * Whether the local player's eye is under liquid, using the server's own
 * `SV_CheckWater` classification rather than `cl.inwater`.
 *
 * `waterlevel === 3` means the contents at `origin[2] + view_ofs[2]` (the eye) is
 * water, slime or lava, because `SV_CheckWater` (sv_phys.js) only steps up through
 * `cont <= CONTENTS_WATER`, which covers all three. `cl.inwater` is deliberately
 * not used: it is set at waist level (waterlevel >= 2), so it cannot distinguish
 * wading from drowning, and `src/newer/ui/r_facegame.js` already documents that
 * choice for the same reason.
 *
 * Noclip is excluded because `SV_CheckWater` only runs for `MOVETYPE_WALK`, so a
 * noclip player's `waterlevel` is stale and would wrongly suppress the strain.
 * A remote server transmits neither `waterlevel` nor the edict, so with no local
 * server this reports false and the strain plays even if the player is under water.
 *
 * @returns {boolean} true when the eye is known to be submerged in liquid
 */
export function S_LowHealthSubmerged() {

	const local = sv.active && sv.worldmodel === cl.worldmodel && ! cls.demoplayback;
	const player = local ? sv.edicts?.[ cl.viewentity ] : null;
	return !! ( player && player.v.waterlevel === 3 && player.v.health > 0 && player.v.movetype !== MOVETYPE_NOCLIP );

}

/**
 * Decides whether the strain plays, from the game rather than from what is drawn.
 * Mirrors the ambient music policy (`s_ambientgame.js`) so both music layers stop
 * for the same reasons, then applies the two health-specific conditions.
 * Called from `S_UpdateLowHealth` every host frame.
 *
 * @param {boolean} [hidden] true when the page is hidden (default `document.hidden`)
 * @returns {{ active: boolean, reason: string, health: number, submerged: boolean }} the decision;
 *   `reason` is '' when active, otherwise 'classic game', 'demo', 'no game', 'dead',
 *   'intermission', 'paused', 'menu or console', 'hidden', 'muted', 'healthy' or 'submerged'
 */
export function S_LowHealthPolicy( hidden = typeof document !== 'undefined' && document.hidden ) {

	const health = cl.stats[ STAT_HEALTH ];
	let why = '';
	if ( ! R_NewerGame() ) why = 'classic game';
	else if ( cls.demoplayback ) why = 'demo';
	else if ( cls.state !== ca_connected || cls.signon !== SIGNONS || ! cl.worldmodel ) why = 'no game';
	else if ( health <= 0 ) why = 'dead';
	else if ( cl.intermission ) why = 'intermission';
	else if ( cl.paused || ( sv.active && sv.paused ) ) why = 'paused';
	else if ( key_dest !== key_game ) why = 'menu or console';
	else if ( hidden ) why = 'hidden';
	else if ( bgmvolume.value <= 0 || Cvar_VariableValue( 'nosound' ) !== 0 ) why = 'muted';
	else if ( health >= LOW_HEALTH_THRESHOLD ) why = 'healthy';
	else if ( S_LowHealthSubmerged() ) why = 'submerged';
	reason = why;
	return { active: why === '', reason: why, health, submerged: why === 'submerged' };

}

/**
 * Runs the strain for one host frame (host.js, after `S_UpdateAmbientMusic`).
 * Creates the looping deck on the audio context's destination the first time the
 * policy is active, starts it while the policy holds and pauses it as soon as it
 * does not. The gain is written every frame rather than once at start, so moving
 * Music Volume mid-strain fades continuously and muting is immediate.
 */
export function S_UpdateLowHealth() {

	const policy = S_LowHealthPolicy(), context = S_GetAudioContext();
	if ( ! policy.active || ! context || context.state !== 'running' ) {

		if ( playing ) { element?.pause(); playing = false; }
		// Leaving the band re-arms: a refusal is only worth suppressing until the
		// player next goes under 12, not for the rest of the session.
		blocked = false;
		return;

	}
	if ( ! element ) {

		element = new Audio(); element.preload = 'auto'; element.loop = true; element.volume = 1;
		source = context.createMediaElementSource( element );
		gain = context.createGain(); gain.gain.value = 0; source.connect( gain ); gain.connect( context.destination );
		element.src = LOWHEALTH_TRACK_URL;

	}
	gain.gain.value = bgmvolume.value;
	// `blocked` stops a refused element being asked to play again on every host
	// frame, which the ambient decks also guard against. The context is already
	// running here, so the refusal is a browser quirk rather than a real lockout.
	if ( playing || blocked ) return;
	let playback;
	try { playback = element.play(); } catch ( error ) { playback = Promise.reject( error ); }
	Promise.resolve( playback ).then( () => { playing = true; blocked = false; }, error => { playing = false; blocked = error?.name === 'NotAllowedError'; } );

}

/**
 * Releases the deck and its nodes, from `S_Shutdown` (snd_dma.js) beside
 * `S_WelcomeJingleShutdown`. Required, not tidiness: `S_Shutdown` closes the
 * AudioContext, leaving a cached MediaElementAudioSourceNode bound to a closed
 * context and permanently silent, so the next `S_Init` would loop into a dead
 * node. The element is also paused and unloaded first: a looping media element
 * keeps playing on its own after the last reference is dropped, so an unpaused
 * deck would loop silently for the rest of the session.
 */
export function S_LowHealthShutdown() {

	if ( element ) { element.pause(); element.removeAttribute( 'src' ); element.load(); }
	source?.disconnect(); gain?.disconnect();
	element = null; source = null; gain = null; playing = false; blocked = false; reason = 'not started';

}

/**
 * Status for diagnostics and tests: the last policy reason, whether the deck is
 * believed to be playing, and the live gain.
 *
 * @returns {{ active: boolean, reason: string, playing: boolean, blocked: boolean, gain: number }} the state
 */
export function S_GetLowHealthStatus() {

	return { active: reason === '', reason, playing, blocked, gain: gain?.gain.value ?? 0 };

}