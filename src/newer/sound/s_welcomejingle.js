/**
 * @module newer/sound/s_welcomejingle
 *
 * The Newer Game's hub jingle: one streamed track, armed when a Newer Game starts on its
 * intro level and played once the welcome loading hold ends and the local player is in control.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `element`, `gain`, `pending`.
 *
 * Errors: swallows the `play()` rejection so an autoplay refusal never escapes as an unhandled promise rejection.
 */
// A single <audio> deck on Quake's already-unlocked audio context, routed through
// its own gain so the Music Volume slider (bgmvolume) applies exactly as it does
// to the streamed ambient bed. The track is short and non-looping, so it is never
// decoded into an AudioBuffer and never needs deck swapping or crossfades.
//
// The track is not started by the `map` command: the welcome loading hold still owns the
// screen and the player has no control then. It is armed there and started by the host frame
// after R_WelcomeLoadingHolding() clears and the local player is spawned, so the music begins
// as the hub difficulty select becomes playable, over the ambient bed rather than instead of it.
import { cl, cls, cl_entities, ca_connected, SIGNONS } from '../../engine/client/client.js';
import { svs } from '../../engine/server/server.js';
import { key_dest, key_game } from '../../engine/client/keys.js';
import { STAT_HEALTH } from '../../engine/common/quakedef.js';
import { R_NewerGame } from '../mode.js';
import { R_WelcomeLoadingHolding } from '../../engine/common/hooks.js';
import { S_GetAudioContext } from '../../engine/sound/snd_dma.js';
import { bgmvolume } from '../../engine/sound/sound.js';
import { Cvar_VariableValue } from '../../engine/common/cvar.js';

/**
 * The jingle itself. Built with `new URL(..., import.meta.url)` because the
 * distribution bundler rewrites exactly that form into its asset resolver (a bare
 * string literal would 404 in the packaged single-file web and Tauri builds).
 */
export const WELCOME_TRACK_URL = new URL( '../../../assets/sounds/quake1newereGame_firstLevelEasyMidHard.mp3', import.meta.url ).href;

// One deck for the whole session; the track is the same one-shot on Easy,
// Medium and Hard, so the skill never branches it.
let element = null, gain = null, pending = false;

/** Accepts the same map spellings as `Host_Map_f`: 'start', 'maps/start.bsp', 'START.BSP'. */
const mapName = value => String( value || '' ).toLowerCase().replace( /^maps\//, '' ).replace( /\.bsp$/, '' );

/**
 * Arms the Newer Game hub jingle. Called by `Host_Map_f` (host_cmd.js) after an explicit `map`
 * command has connected, beside `R_FlashlightNewRun`, and so never by changelevel, seamless
 * travel, load, respawn or the attract demo. The jingle itself starts later, from
 * `S_UpdateWelcomeJingle`, once the welcome hold has ended and the player has control.
 *
 * The gate is `r_hdr` on the intro map, which is the one start path all four Quake installs
 * share: shareware and registered both reach 'start' (the Newer hub, or the original
 * Introduction), Scourge of Armagon reaches 'start' (Command HQ) and Dissolution of Eternity
 * reaches 'start' (Split Decision). No game-identity test is needed because every install
 * names that level 'start'; `R_FlashlightNewRun` makes the same assumption for its welcome
 * aids. Only a single-player Newer start arms the hub jingle.
 *
 * @param {string} name the map being started ('start' or 'maps/start.bsp' style; case and path are ignored)
 * @param {boolean} newer true when connected with `r_hdr` on (Newer Game); only then does it arm
 */
export function S_WelcomeJingle( name, newer ) {

	if ( newer !== true || mapName( name ) !== 'start' ) { pending = false; return; }
	if ( svs.maxclients !== 1 ) return;
	pending = true;

}

/**
 * Starts the armed jingle once the player has control (host.js, after the ambient and low-health
 * updates). The welcome loading hold, pause, intermission, menu/console, death and a
 * disconnected state keep it waiting or cancel it. It plays over the quiet ambient
 * bed: that bed already sits at `AMBIENT_BASE_GAIN` as an under-layer, and nothing here ducks or
 * stops it.
 *
 * Muting Music Volume or `nosound` at the moment of control cancels the armed jingle instead of
 * playing it silently; a later fresh start can play it. If the audio context is not running yet,
 * the jingle stays armed and starts on the first control frame after the context is available.
 *
 * @param {boolean} [holding] true while the welcome loading screen still owns the player
 *   (default `R_WelcomeLoadingHolding()`; tests pass `false` to represent control)
 */
export function S_UpdateWelcomeJingle( holding = R_WelcomeLoadingHolding() ) {

	if ( ! pending ) return;
	if ( holding ) return;
	if ( ! R_NewerGame() || cls.demoplayback ) { pending = false; return; }
	if ( cls.state !== ca_connected || cls.signon !== SIGNONS || ! cl.worldmodel ) { pending = false; return; }
	if ( cl.paused || cl.intermission || key_dest !== key_game ) return;
	if ( ( cl.stats?.[ STAT_HEALTH ] ?? 0 ) <= 0 ) return;
	if ( ! ( cl.viewentity > 0 ) || ! cl_entities?.[ cl.viewentity ] ) return;
	if ( bgmvolume.value <= 0 || Cvar_VariableValue( 'nosound' ) !== 0 ) { pending = false; return; }
	const context = S_GetAudioContext();
	if ( ! context || context.state !== 'running' ) return;
	pending = false;
	if ( ! element ) {

		element = new Audio(); element.preload = 'auto'; element.loop = false; element.volume = 1;
		const source = context.createMediaElementSource( element );
		gain = context.createGain(); gain.gain.value = 0; source.connect( gain ); gain.connect( context.destination );
		element.src = WELCOME_TRACK_URL;

	}
	// Rewind so re-entering the intro map replays from the top, and stay silent
	// until the element is genuinely producing audio.
	element.currentTime = 0; gain.gain.value = 0;
	let playback;
	try { playback = element.play(); } catch ( error ) { playback = Promise.reject( error ); }
	Promise.resolve( playback ).then( () => { gain.gain.value = bgmvolume.value; }, () => { gain.gain.value = 0; } );

}

/**
 * Releases the deck and its gain node, from `S_Shutdown` (snd_dma.js) beside
 * `S_AmbientMusicShutdown`. Required, not tidiness: `S_Shutdown` closes the
 * AudioContext, which leaves a cached MediaElementAudioSourceNode bound to a
 * closed context and permanently silent. Clearing it lets the next `S_Init`
 * build a deck on the new context instead of replaying through the dead one.
 */
export function S_WelcomeJingleShutdown() {

	element = null; gain = null; pending = false;

}
