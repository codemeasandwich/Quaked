/**
 * @module newer/sound/s_welcomejingle
 *
 * The Newer Game's first-level jingle: one streamed track, started once when a Newer Game begins on its intro level.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `element`, `gain`.
 *
 * Errors: swallows the `play()` rejection so an autoplay refusal never escapes as an unhandled promise rejection.
 */
// A single <audio> deck on Quake's already-unlocked audio context, routed through
// its own gain so the Music Volume slider (bgmvolume) applies exactly as it does
// to the streamed ambient bed. The track is short and non-looping, so it is never
// decoded into an AudioBuffer and never needs deck swapping or crossfades.
//
// ponytail: the gain is sampled once when the jingle starts, not tracked per
// frame, so changing Music Volume mid-jingle takes effect on the next jingle
// rather than fading the current one. Per-frame tracking would need a host-frame
// hook for a 32-second one-shot.
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
let element = null, gain = null;

/** Accepts the same map spellings as `Host_Map_f`: 'start', 'maps/start.bsp', 'START.BSP'. */
const mapName = value => String( value || '' ).toLowerCase().replace( /^maps\//, '' ).replace( /\.bsp$/, '' );

/**
 * Starts the Newer Game first-level jingle. Called by `Host_Map_f` (host_cmd.js)
 * after an explicit `map` command has connected, beside `R_FlashlightNewRun`, and
 * so never by changelevel, seamless travel, load, respawn or the attract demo.
 *
 * The gate is `r_hdr` on the intro map, which is the one start path all four
 * Quake installs share: shareware and registered both reach 'start' (the Newer
 * hub, or the original Introduction), Scourge of Armagon reaches 'start'
 * (Command HQ) and Dissolution of Eternity reaches 'start' (Split Decision).
 * No game-identity test is needed because every install names that level 'start';
 * `R_FlashlightNewRun` makes the same assumption for its welcome aids.
 *
 * Plays over the quiet ambient bed rather than ducking it: that bed already sits
 * at `AMBIENT_BASE_GAIN` (0.075) as an under-layer, and ducking it would mean
 * threading a mute signal into `AmbientMusicPlayer` for a 32-second track.
 *
 * Nothing plays when the audio context is not running, when Music Volume is 0 or
 * `nosound` is set; the ambient bed is allowed to fade in underneath, as the
 * owner chose. The jingle runs to its end even if the player disconnects
 * mid-track, matching original Quake, whose CD audio kept playing into the menu.
 *
 * @param {string} name the map being started ('start' or 'maps/start.bsp' style; case and path are ignored)
 * @param {boolean} newer true when connected with `r_hdr` on (Newer Game); only then does the jingle play
 */
export function S_WelcomeJingle( name, newer ) {

	if ( newer !== true || mapName( name ) !== 'start' ) return;
	if ( bgmvolume.value <= 0 || Cvar_VariableValue( 'nosound' ) !== 0 ) return;
	const context = S_GetAudioContext();
	if ( ! context || context.state !== 'running' ) return;
	if ( ! element ) {

		element = new Audio(); element.preload = 'auto'; element.loop = false; element.volume = 1;
		const source = context.createMediaElementSource( element );
		gain = context.createGain(); gain.gain.value = 0; source.connect( gain ); gain.connect( context.destination );
		element.src = WELCOME_TRACK_URL;

	}
	// Rewind so a re-entering the intro map replays from the top, and stay silent
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

	element = null; gain = null;

}