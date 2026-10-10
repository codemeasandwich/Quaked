/**
 * @module engine/sound/sound
 *
 * Sound definitions (WinQuake sound.h): the sound, channel and DMA structures, and their shared state.
 *
 * Types: exported classes `portable_samplepair_t`, `sfx_t`, `sfxcache_t`, `dma_t`, `channel_t`, `wavinfo_t`.
 *
 * State: mutable exports `total_channels`, `fakedma`, `fakedma_updates`, `paintedtime`, `shm`, `snd_initialized`,
 * `snd_blocked`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Its shared state is set through `Sound_SetTotalChannels`, `Sound_SetPaintedtime` and `Sound_SetShm`.
 */
// Ported from: WinQuake/sound.h -- client sound i/o definitions

import { MAX_QPATH } from '../common/quakedef.js';

/*
==============================================================================

			SOUND CONSTANTS

==============================================================================
*/

export const DEFAULT_SOUND_PACKET_VOLUME = 255;
export const DEFAULT_SOUND_PACKET_ATTENUATION = 1.0;

export const MAX_CHANNELS = 128;
export const MAX_DYNAMIC_CHANNELS = 32;
export const NUM_AMBIENTS = 4;

// Ambient sound types (from bspfile.h)
export const AMBIENT_WATER = 0;
export const AMBIENT_SKY = 1;
export const AMBIENT_SLIME = 2;
export const AMBIENT_LAVA = 3;

/*
==============================================================================

			SOUND STRUCTURES

==============================================================================
*/

// portable_samplepair_t
export class portable_samplepair_t {

	/**
	 * One stereo sample pair for the mixer's paint buffer (WinQuake sound.h): `left` and `right` start at 0. Not
	 * constructed anywhere in the port; the Web Audio mixer does not use a paint buffer.
	 */
	constructor() {

		this.left = 0;
		this.right = 0;

	}

}

// sfx_t
export class sfx_t {

	/**
	 * A known sound by name (WinQuake sound.h). snd_dma.js creates the fixed `known_sfx` table of these once at load;
	 * `S_FindName` fills `name` (a path under sound/, at most MAX_QPATH characters in C) and `S_LoadSound` sets
	 * `cache` to the decoded sfxcache_t. `cache` is null until the sound is loaded.
	 */
	constructor() {

		this.name = ''; // char name[MAX_QPATH]
		this.cache = null; // cache_user_t -- will hold sfxcache_t

	}

}

// sfxcache_t
export class sfxcache_t {

	/**
	 * A sound's decoded samples (WinQuake sound.h), built by `S_LoadSound` (snd_mem.js) from the WAV's wavinfo_t and
	 * then resampled to the output rate. After loading: `length` and `loopstart` are in samples at `speed`
	 * (`loopstart` -1 means no loop), `speed` is samples per second (the output rate), `width` is bytes per sample
	 * (1 or 2), `stereo` is 0 (mono after resampling) and `data` is a Uint8Array of the samples. Kept in its
	 * sfx_t's `cache` for the life of the page.
	 */
	constructor() {

		this.length = 0;
		this.loopstart = 0;
		this.speed = 0;
		this.width = 0;
		this.stereo = 0;
		this.data = null; // variable sized byte array

	}

}

// dma_t
export class dma_t {

	/**
	 * The output device description (WinQuake sound.h). The module keeps one, `sn`; `S_Init` (snd_dma.js) fills it for
	 * Web Audio (output sample rate in `speed`, 16 `samplebits`, 2 `channels`, 16384 `samples`, a byte `buffer`) and
	 * points `shm` at it through `Sound_SetShm`. All fields start at 0, false or null.
	 */
	constructor() {

		this.gamealive = false;
		this.soundalive = false;
		this.splitbuffer = false;
		this.channels = 0;
		this.samples = 0; // mono samples in buffer
		this.submission_chunk = 0; // don't mix less than this #
		this.samplepos = 0; // in mono samples
		this.samplebits = 0;
		this.speed = 0;
		this.buffer = null; // unsigned char *

	}

}

// channel_t
export class channel_t {

	/**
	 * One playing sound (WinQuake sound.h). The module allocates all MAX_CHANNELS (128) at load in `channels`; the
	 * first NUM_AMBIENTS (4) are the ambients, then MAX_DYNAMIC_CHANNELS (32) for entity sounds, then static sounds. `sfx` is the
	 * sfx_t (null when free); `leftvol`, `rightvol` and `master_vol` are 0..255; `end` is the end time in global
	 * paint samples (compare `paintedtime`); `pos` is the sample position in the sfx; `looping` is where to loop
	 * (-1 = no looping); `entnum` and `entchannel` allow overriding a specific sound; `origin` is the sound's world
	 * position (Quake units); `dist_mult` is attenuation divided by the clip distance.
	 */
	constructor() {

		this.sfx = null; // sfx_t *
		this.leftvol = 0; // 0-255 volume
		this.rightvol = 0; // 0-255 volume
		this.end = 0; // end time in global paintsamples
		this.pos = 0; // sample position in sfx
		this.looping = 0; // where to loop, -1 = no looping
		this.entnum = 0; // to allow overriding a specific sound
		this.entchannel = 0;
		this.origin = new Float32Array( 3 ); // origin of sound effect
		this.dist_mult = 0; // distance multiplier (attenuation/clipK)
		this.master_vol = 0; // 0-255 master volume

	}

}

// wavinfo_t
export class wavinfo_t {

	/**
	 * The format of a parsed WAV file (WinQuake sound.h), returned by `GetWavinfo` (snd_mem.js); all fields stay 0
	 * when the file is missing or not RIFF/WAVE. `rate` is samples per second, `width` bytes per sample, `channels`
	 * the channel count, `loopstart` the loop point in samples (-1 when there is none), `samples` the sample count
	 * and `dataofs` the byte offset of the sample data (chunk starts this many bytes from file start).
	 */
	constructor() {

		this.rate = 0;
		this.width = 0;
		this.channels = 0;
		this.loopstart = 0;
		this.samples = 0;
		this.dataofs = 0; // chunk starts this many bytes from file start

	}

}

/*
==============================================================================

			SOUND GLOBALS

==============================================================================
*/

export const channels = [];
for ( let i = 0; i < MAX_CHANNELS; i ++ )
	channels[ i ] = new channel_t();

export let total_channels = 0;

export let fakedma = false;
export let fakedma_updates = 0;
export let paintedtime = 0;

export const listener_origin = new Float32Array( 3 );
export const listener_forward = new Float32Array( 3 );
export const listener_right = new Float32Array( 3 );
export const listener_up = new Float32Array( 3 );

export const sn = new dma_t();
export let shm = null; // volatile dma_t * -- points to sn when initialized

export const sound_nominal_clip_dist = 1000.0;

// cvars
export const loadas8bit = { name: 'loadas8bit', string: '0', value: 0 };
export const bgmvolume = { name: 'bgmvolume', string: '1', value: 1, archive: true };
export const volume = { name: 'volume', string: '0.4', value: 0.4, archive: true };

export let snd_initialized = false;
export let snd_blocked = 0;

// Setters for mutable globals
/**
 * Sets `total_channels`, the count of channels in use (dynamic plus ambient plus static). snd_dma.js sets it to
 * MAX_DYNAMIC_CHANNELS + NUM_AMBIENTS (36) at `S_Init` and in `S_StopAllSounds`, and adds one per static sound
 * started.
 *
 * @param {number} val channel count, 0..MAX_CHANNELS (128)
 */
export function Sound_SetTotalChannels( val ) { total_channels = val; }
/**
 * Sets `paintedtime`, the mixer's sample clock that channel_t `end` times are compared with. snd_dma.js sets it from
 * the audio context's clock (output samples) on every `S_StartSound` and `S_Update`.
 *
 * @param {number} val time in output samples
 */
export function Sound_SetPaintedtime( val ) { paintedtime = val; }
/**
 * Sets `shm`, the active output device. `S_Init` (snd_dma.js) points it at `sn` once Web Audio starts; while it is
 * null no sound has been initialised.
 *
 * @param {?dma_t} val the device, normally `sn`
 */
export function Sound_SetShm( val ) { shm = val; }
/**
 * Sets `snd_initialized`: true once `S_Init` has created the Web Audio context, false again after `S_Shutdown`.
 *
 * @param {boolean} val whether the sound system is running
 */
export function Sound_SetInitialized( val ) { snd_initialized = val; }
/**
 * Sets `snd_blocked` (WinQuake's count of nested S_BlockSound calls, which mutes output while above 0). No current
 * caller, so it stays 0.
 *
 * @param {number} val the block count
 */
export function Sound_SetBlocked( val ) { snd_blocked = val; }
