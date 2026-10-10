/**
 * @module engine/sound/cd_audio
 *
 * Music (WinQuake cd_audio.c), played from audio files instead of a CD.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `playing`, `wasPlaying`, `initialized`, `enabled`, `playLooping`,
 * `playTrack`, `cdvolume`, `musicElement`, `musicGainNode`, `musicSource`, `_getTrackURL`.
 *
 * Errors: catches at 9 places.
 *
 * Where a track's audio file is comes from `CDAudio_SetTrackURLProvider`.
 */
// Ported from: WinQuake/cd_audio.c -- CD audio playback
// In browser port: uses Web Audio API (HTML5 Audio element) for music tracks

import { Con_Printf, Con_DPrintf } from '../common/console.js';
import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from '../common/cmd.js';
import { Cvar_SetValue } from '../common/cvar.js';
import { COM_CheckParm } from '../common/common.js';
import { bgmvolume } from './sound.js';
import { S_GetAudioContext } from './snd_dma.js';

/*
==============================================================================

			CD AUDIO STATE

==============================================================================
*/

const MAXIMUM_TRACKS = 100;

let playing = false;
let wasPlaying = false;
let initialized = false;
let enabled = true;
let playLooping = false;
let playTrack = 0;
let cdvolume = 0;

const remap = new Uint8Array( 256 );

// Web Audio / HTML5 Audio for music
let musicElement = null; // HTMLAudioElement for music playback
let musicGainNode = null;
let musicSource = null; // MediaElementAudioSourceNode

// Track URL provider (set externally)
let _getTrackURL = null;

/*
==============================================================================

			EXTERNAL INTERFACE

==============================================================================
*/

/*
================
CDAudio_SetTrackURLProvider
================
*/
/**
 * Sets a function that maps track number -> URL for music files, e.g.
 * (track) => `music/track${track.toString().padStart(2,'0')}.ogg`. Kept until replaced; `CDAudio_Play` does nothing
 * without one. Only tests/audio_volume_test.js sets one at present, so in the game `CDAudio_Play` logs "no URL" and
 * returns.
 *
 * @param {?function(number): ?string} fn receives the remapped track (1..99) and returns its URL, or a falsy value
 *     when it has none; null removes the provider
 */
export function CDAudio_SetTrackURLProvider( fn ) {

	_getTrackURL = fn;

}

/*
================
CDAudio_Play
================
*/
/**
 * Starts a music track (WinQuake cd_audio.c), played from an audio file through a reused HTMLAudioElement instead of
 * a CD. cl_parse.js calls it for svc_cdtrack (with `cls.forcetrack` when that is set), and the `cd play` / `cd loop`
 * console commands. The track number is first passed through the `cd remap` table; asking for the track already
 * playing does nothing, otherwise the current one is stopped. Volume comes from `bgmvolume` (clamped to 0..1, and
 * written back if it was out of range); when a Web Audio context exists the element is routed once, for the session,
 * through its own gain node, independent of the effects volume. Errors from the browser (bad URL, autoplay refusal)
 * are logged with Con_DPrintf, never thrown. Does nothing before `CDAudio_Init`, after `cd off`, for a track outside
 * 1..99 or when the URL provider gives no URL.
 *
 * @param {number} track CD track number, 0..255 before remapping
 * @param {boolean} looping true to repeat the track until stopped
 */
export function CDAudio_Play( track, looping ) {

	if ( ! initialized || ! enabled )
		return;

	track = remap[ track ];

	if ( playing ) {

		if ( playTrack === track )
			return;
		CDAudio_Stop();

	}

	playLooping = looping;

	if ( track < 1 || track >= MAXIMUM_TRACKS ) {

		Con_DPrintf( 'CDAudio_Play: Bad track number %d.\n', track );
		return;

	}

	playTrack = track;

	let vol = Math.floor( bgmvolume.value * 255.0 );
	if ( vol < 0 ) {

		Cvar_SetValue( 'bgmvolume', 0.0 );
		vol = 0;

	} else if ( vol > 255 ) {

		Cvar_SetValue( 'bgmvolume', 1.0 );
		vol = 255;

	}

	cdvolume = vol;

	// Get track URL
	let url = null;
	if ( _getTrackURL ) {

		url = _getTrackURL( track );

	}

	if ( ! url ) {

		Con_DPrintf( 'CDAudio_Play: no URL for track %d\n', track );
		return;

	}

	try {

		// Create or reuse HTMLAudioElement
		if ( ! musicElement ) {

			musicElement = new Audio();

		}

		musicElement.src = url;
		musicElement.loop = looping;
		musicElement.volume = bgmvolume.value;

		// Music has its own gain, independent of the effects volume.
		const audioContext = S_GetAudioContext();

		if ( audioContext && ! musicSource ) {

			try {

				musicSource = audioContext.createMediaElementSource( musicElement );
				musicGainNode = audioContext.createGain();
				musicGainNode.gain.value = bgmvolume.value;
				musicSource.connect( musicGainNode );
				musicGainNode.connect( audioContext.destination );

			} catch ( e ) {

				// Fallback: direct playback without Web Audio routing
				Con_DPrintf( 'CDAudio: Web Audio routing failed, using direct playback\n' );

			}

		}

		if ( musicGainNode ) {

			// MediaElement volume also affects a Web Audio source; using both
			// gains would square the slider setting on a newly started track.
			musicElement.volume = 1;
			musicGainNode.gain.value = bgmvolume.value;

		}

		musicElement.play().catch( function ( e ) {

			Con_DPrintf( 'CDAudio_Play: playback failed: %s\n', e.message );

		} );

		// Handle looping via ended event for non-loop mode
		musicElement.onended = function () {

			if ( ! playLooping ) {

				playing = false;

			}

		};

		playing = true;

	} catch ( e ) {

		Con_DPrintf( 'CDAudio_Play: track %d failed: %s\n', track, e.message );
		playing = false;

	}

}

/*
================
CDAudio_Stop
================
*/
/**
 * Stops the music and rewinds it to the start (WinQuake cd_audio.c); used by `CDAudio_Play` before a new track, by
 * `CDAudio_Shutdown` and by the `cd stop` / `cd off` / `cd reset` commands. Remembers whether it was playing for
 * `CDAudio_Resume`. Does nothing before `CDAudio_Init` or after `cd off`.
 */
export function CDAudio_Stop() {

	if ( ! initialized || ! enabled )
		return;

	if ( musicElement ) {

		try {

			musicElement.pause();
			musicElement.currentTime = 0;

		} catch ( e ) { /* ignore */ }

	}

	wasPlaying = playing;
	playing = false;

}

/*
================
CDAudio_Pause
================
*/
/**
 * Pauses the music where it is (WinQuake cd_audio.c); called for svc_setpause when the game pauses, and by `cd pause`.
 * Does nothing when nothing is playing, before `CDAudio_Init` or after `cd off`.
 */
export function CDAudio_Pause() {

	if ( ! initialized || ! enabled )
		return;

	if ( ! playing )
		return;

	if ( musicElement ) {

		try {

			musicElement.pause();

		} catch ( e ) { /* ignore */ }

	}

	wasPlaying = playing;
	playing = false;

}

/*
================
CDAudio_Resume
================
*/
/**
 * Resumes music paused or stopped while it was playing (WinQuake cd_audio.c); called for svc_setpause when the game
 * unpauses, and by `cd resume`. A playback refusal from the browser is ignored. Does nothing unless the music was
 * playing when last paused or stopped, before `CDAudio_Init` or after `cd off`.
 */
export function CDAudio_Resume() {

	if ( ! initialized || ! enabled )
		return;

	if ( ! wasPlaying )
		return;

	if ( musicElement ) {

		try {

			musicElement.play().catch( function () {} );

		} catch ( e ) { /* ignore */ }

	}

	playing = true;

}

/*
================
CDAudio_Update
================
*/
/**
 * Applies a change of `bgmvolume` to the playing music (WinQuake cd_audio.c); called once per host frame from
 * _Host_Frame_Internal (host.js). When the volume (in 1/255 steps) has changed it clamps the cvar to 0..1 (writing it
 * back if out of range) and sets the gain node, or the element's own volume when there is no Web Audio routing. Does
 * nothing before `CDAudio_Init` or after `cd off`.
 */
export function CDAudio_Update() {

	if ( ! initialized || ! enabled )
		return;

	let newVolume = Math.floor( bgmvolume.value * 255.0 );
	if ( newVolume !== cdvolume ) {

		if ( newVolume < 0 ) {

			Cvar_SetValue( 'bgmvolume', 0.0 );
			newVolume = 0;

		} else if ( newVolume > 255 ) {

			Cvar_SetValue( 'bgmvolume', 1.0 );
			newVolume = 255;

		}

		cdvolume = newVolume;

		if ( musicGainNode ) {

			musicElement.volume = 1;
			musicGainNode.gain.value = bgmvolume.value;

		} else if ( musicElement ) {

			musicElement.volume = bgmvolume.value;

		}

	}

}

/*
================
CDAudio_Init
================
*/
/**
 * Initialises music playback (WinQuake cd_audio.c); Host_Init calls it once at startup. Resets the track remap
 * table to identity, enables playback and adds the `cd` console command (on, off, reset, remap, play, loop, stop,
 * pause, resume, info).
 *
 * @returns {number} 0 when initialised, -1 when the `-nocdaudio` command-line parameter disables music
 */
export function CDAudio_Init() {

	if ( COM_CheckParm( '-nocdaudio' ) )
		return - 1;

	for ( let n = 0; n < 256; n ++ )
		remap[ n ] = n;

	initialized = true;
	enabled = true;

	Cmd_AddCommand( 'cd', CD_f );

	Con_Printf( 'CD Audio Initialized (Web Audio)\n' );

	return 0;

}

/*
================
CDAudio_Shutdown
================
*/
/**
 * Stops the music and releases the audio element and its Web Audio nodes (WinQuake cd_audio.c); called from
 * Host_Shutdown. Afterwards nothing plays until `CDAudio_Init` runs again. Does nothing if not initialised.
 */
export function CDAudio_Shutdown() {

	if ( ! initialized )
		return;

	CDAudio_Stop();

	if ( musicSource ) {

		try {

			musicSource.disconnect();

		} catch ( e ) { /* ignore */ }

		musicSource = null;

	}

	if ( musicGainNode ) {

		try {

			musicGainNode.disconnect();

		} catch ( e ) { /* ignore */ }

		musicGainNode = null;

	}

	musicElement = null;
	initialized = false;

}

/*
================
CD_f

Console command handler for "cd" command
================
*/
function CD_f() {

	if ( Cmd_Argc() < 2 )
		return;

	const command = Cmd_Argv( 1 );

	if ( command === 'on' ) {

		enabled = true;
		return;

	}

	if ( command === 'off' ) {

		if ( playing )
			CDAudio_Stop();
		enabled = false;
		return;

	}

	if ( command === 'reset' ) {

		enabled = true;
		if ( playing )
			CDAudio_Stop();
		for ( let n = 0; n < 256; n ++ )
			remap[ n ] = n;
		return;

	}

	if ( command === 'remap' ) {

		const ret = Cmd_Argc() - 2;
		if ( ret <= 0 ) {

			for ( let n = 1; n < 256; n ++ ) {

				if ( remap[ n ] !== n )
					Con_Printf( '  %d -> %d\n', n, remap[ n ] );

			}

			return;

		}

		for ( let n = 1; n <= ret; n ++ )
			remap[ n ] = parseInt( Cmd_Argv( n + 1 ) ) || 0;

		return;

	}

	if ( command === 'play' ) {

		CDAudio_Play( parseInt( Cmd_Argv( 2 ) ) || 0, false );
		return;

	}

	if ( command === 'loop' ) {

		CDAudio_Play( parseInt( Cmd_Argv( 2 ) ) || 0, true );
		return;

	}

	if ( command === 'stop' ) {

		CDAudio_Stop();
		return;

	}

	if ( command === 'pause' ) {

		CDAudio_Pause();
		return;

	}

	if ( command === 'resume' ) {

		CDAudio_Resume();
		return;

	}

	if ( command === 'info' ) {

		if ( playing )
			Con_Printf( 'Currently %s track %d\n', playLooping ? 'looping' : 'playing', playTrack );
		else
			Con_Printf( 'Not playing\n' );

		Con_Printf( 'Volume is %d\n', cdvolume );
		return;

	}

}
