/**
 * @module newer/sound/s_ambientmusic
 *
 * The streamed ambient music: two decks on Quake's audio context, never decoded whole.
 *
 * Types: exported classes `AmbientMusicPlayer`.
 *
 * State: no mutable exports; module-level variables `player`.
 *
 * Errors: catches at 2 places.
 */
// Two streamed decks share Quake's unlocked audio context. Never decode this
// hour-long recording into an AudioBuffer or advance it with simulation time.
export const AMBIENT_TRACK_URL = new URL( '../../../music/ambient.mp3', import.meta.url ).href;
export const AMBIENT_SLOT_SECONDS = 20 * 60;
export const AMBIENT_FADE_SECONDS = 12;
export const AMBIENT_BASE_GAIN = 0.075;
export const AMBIENT_SWELL_GAIN = 0.025;

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );
const ease = t => ( 1 - Math.cos( Math.PI * clamp( t, 0, 1 ) ) ) / 2;

export class AmbientMusicPlayer {

	/**
	 * Builds the two streamed decks on Quake's (already unlocked) audio context, each an `<audio>` element routed
	 * through its own gain into one shared bus gain (starting silent) connected to `output`. Both decks start loading the
	 * track's metadata at once; the hour-long recording is never decoded into an AudioBuffer or advanced with simulation
	 * time. Created once by `S_AmbientMusicInit`; lives until `dispose`.
	 *
	 * @param {AudioContext} context Quake's audio context; its `currentTime` (seconds) is the player's clock
	 * @param {AudioNode} output where the music bus connects (the context's destination)
	 * @param {{ createMedia?: function(): HTMLMediaElement, random?: function(): number, url?: string,
	 *   slotSeconds?: number, fadeSeconds?: number }} [options] test seams and timing: `createMedia` makes each deck's
	 *   element (default `new Audio()`), `random` returns 0..1 (default `Math.random`), `url` the track
	 *   (`AMBIENT_TRACK_URL`), `slotSeconds` how long one random section plays (`AMBIENT_SLOT_SECONDS`, 20 minutes),
	 *   `fadeSeconds` the crossfade length (`AMBIENT_FADE_SECONDS`, 12 s)
	 */
	constructor( context, output, { createMedia = () => new Audio(), random = Math.random, url = AMBIENT_TRACK_URL,
		slotSeconds = AMBIENT_SLOT_SECONDS, fadeSeconds = AMBIENT_FADE_SECONDS } = {} ) {

		this.context = context; this.random = random; this.slotSeconds = slotSeconds; this.fadeSeconds = fadeSeconds;
		this.bus = context.createGain(); this.bus.gain.value = 0; this.bus.connect( output );
		this.allowed = false; this.disposed = false; this.active = - 1; this.transition = null;
		this.lastTime = context.currentTime; this.motionTime = 0; this.nextSwell = 10 + random() * 15;
		this.pulseStart = null; this.swells = 0; this.transitions = 0; this.recoveries = 0; this.lastCombat = - Infinity;
		this.targetGain = 0; this.error = null;
		this.decks = Array.from( { length: 2 }, () => {

			const media = createMedia(); media.preload = 'metadata'; media.loop = false; media.volume = 1;
			const source = context.createMediaElementSource( media ), gain = context.createGain();
			gain.gain.value = 0; source.connect( gain ); gain.connect( this.bus );
			const deck = { media, source, gain, start: null, slot: 0, playing: false, pending: false, blocked: false, failed: false, generation: 0 };
			deck.onMetadata = () => { if ( this.allowed ) this.ensureStarted(); };
			deck.onError = () => { deck.failed = true; deck.playing = false; gain.gain.value = 0; this.error = 'Ambient music could not be loaded.'; };
			media.addEventListener( 'loadedmetadata', deck.onMetadata ); media.addEventListener( 'error', deck.onError );
			media.src = url;
			return deck;

		} );

	}

	/**
	 * The deck's track length once its metadata has loaded.
	 *
	 * @param {{ media: HTMLMediaElement }} deck one of `this.decks`
	 * @returns {number} seconds, or 0 while unknown
	 */
	duration( deck ) { return Number.isFinite( deck.media.duration ) && deck.media.duration > 0 ? deck.media.duration : 0; }
	/**
	 * How far the deck has played into its current section.
	 *
	 * @param {{ media: HTMLMediaElement, start: ?number }} deck one of `this.decks`
	 * @returns {number} seconds since the section's start (media time, so it does not advance while paused or
	 *   buffering); 0 when no section is prepared
	 */
	elapsed( deck ) { return deck.start === null ? 0 : Math.max( 0, deck.media.currentTime - deck.start ); }

	/**
	 * Picks a fresh random section for a deck and seeks it there, paused and silent: up to one slot long (or the whole
	 * track if shorter), starting anywhere that leaves the slot inside the track, and at least a slot (or half the free
	 * range) away from `previousStart` when given (eight tries, then the far end). Invalidates the deck's pending play.
	 *
	 * @param {number} index 0 or 1, the deck
	 * @param {?number} [previousStart=null] the start of the section just played (seconds), to avoid repeating it
	 * @returns {boolean} true when the deck is ready to play; false while its duration is unknown, after it failed, or
	 *   when the seek threw
	 */
	prepare( index, previousStart = null ) {

		const deck = this.decks[ index ], duration = this.duration( deck );
		if ( ! duration || deck.failed ) return false;
		deck.slot = Math.min( this.slotSeconds, duration );
		const range = Math.max( 0, duration - deck.slot - 0.1 );
		const separation = Math.min( deck.slot, range / 2 );
		let start = this.random() * range;
		for ( let i = 0; previousStart !== null && Math.abs( start - previousStart ) < separation && i < 8; i ++ ) start = this.random() * range;
		if ( previousStart !== null && Math.abs( start - previousStart ) < separation ) start = previousStart < range / 2 ? range : 0;
		deck.media.pause(); deck.playing = false; deck.pending = false; deck.generation ++;
		deck.gain.gain.value = 0; deck.start = start;
		try { deck.media.currentTime = start; } catch ( error ) { deck.start = null; return false; }
		return true;

	}

	/**
	 * Starts a prepared deck's element playing, unless playback is not allowed, the deck is already playing or
	 * pending, its section is used up, or it is blocked or failed. Settles asynchronously: on success the deck is
	 * `playing` (or paused again if playback was stopped meanwhile); autoplay refusal (`NotAllowedError`) marks it
	 * `blocked` until another real user gesture (`unlock`); any other error but `AbortError` marks it `failed` and sets
	 * `error`. Results for an older `generation` are ignored; never rejects.
	 *
	 * @param {object} deck one of `this.decks`
	 */
	play( deck ) {

		if ( ! this.allowed || this.disposed || deck.start === null || this.elapsed( deck ) >= deck.slot || deck.pending || deck.playing || deck.blocked || deck.failed ) return;
		const generation = deck.generation;
		deck.pending = true;
		let playback;
		try { playback = deck.media.play(); } catch ( error ) { playback = Promise.reject( error ); }
		Promise.resolve( playback ).then( () => {

			if ( this.disposed || generation !== deck.generation ) return;
			deck.pending = false;
			if ( ! this.allowed ) { deck.media.pause(); return; }
			deck.playing = true;

		}, error => {

			if ( this.disposed || generation !== deck.generation ) return;
			deck.pending = false; deck.playing = false;
			// Autoplay resumes only on another real user gesture. Media failures
			// remain silent, without a promise rejection on every host frame.
			if ( error?.name === 'NotAllowedError' ) deck.blocked = true;
			else if ( error?.name !== 'AbortError' ) { deck.failed = true; this.error = 'Ambient music playback failed.'; }

		} );

	}

	/**
	 * Prepares deck 0 if nothing is active yet and plays the active deck; called on each update while allowed and when
	 * a deck's metadata arrives. Does nothing until playback is allowed.
	 */
	ensureStarted() {

		if ( this.disposed || ! this.allowed ) return;
		if ( this.active < 0 && this.prepare( 0 ) ) this.active = 0;
		if ( this.active >= 0 ) this.play( this.decks[ this.active ] );

	}

	/**
	 * Clears every deck's autoplay block after a real user gesture (`S_AmbientMusicUnlock`, from `S_UnlockAudio`) and,
	 * if playback is allowed, starts the active deck and any incoming crossfade deck.
	 */
	unlock() {

		for ( const deck of this.decks ) deck.blocked = false;
		if ( this.allowed ) {

			this.ensureStarted();
			if ( this.transition ) this.play( this.decks[ this.transition.next ] );

		}

	}

	/**
	 * Pauses everything at once and silences the bus: when the policy turns the music off, the page is hidden, Quake
	 * stops all sounds (`S_AmbientMusicStop`) or on dispose. Positions are kept, so a partial crossfade continues where it
	 * was when music resumes.
	 */
	stop() {

		this.allowed = false; this.pulseStart = null; this.targetGain = 0; this.bus.gain.cancelScheduledValues( this.context.currentTime ); this.bus.gain.value = 0;
		for ( const deck of this.decks ) { deck.generation ++; deck.media.pause(); deck.playing = false; deck.pending = false; }
		this.lastTime = this.context.currentTime;

	}

	/**
	 * Runs the music for one host frame, called by `S_UpdateAmbientMusic` (s_ambientgame.js) with the current policy.
	 * Stops when the policy is inactive, the volume is 0 or the audio context is not running. Otherwise plays the active
	 * section at `AMBIENT_BASE_GAIN` times the volume; after 10..25 s (then every 35..90 s) of moving while safe it swells
	 * by up to `AMBIENT_SWELL_GAIN` (4 s up, 9 s down). Near a section's end it prepares the other deck at a new random
	 * section and crossfades linearly over the fade (at most a quarter of the slot), advancing only while the incoming
	 * media actually plays. A section is never extended past its slot: if the incoming deck failed, is blocked or has not
	 * progressed for 5 s, `recover` restarts the outgoing stream elsewhere.
	 *
	 * @param {{ active: boolean, moving?: boolean, safe?: boolean, musicVolume?: number }} policy from
	 *   `S_AmbientMusicPolicy`: whether music may play, whether the player moves (over 20 units/s), whether no enemy is
	 *   near and no combat recent, and `bgmvolume` (0..1)
	 */
	update( { active, moving = false, safe = false, musicVolume = 1 } ) {

		if ( this.disposed ) return;
		const now = this.context.currentTime, dt = clamp( now - this.lastTime, 0, 0.25 ); this.lastTime = now;
		if ( ! active || musicVolume <= 0 || this.context.state !== 'running' ) { if ( this.allowed ) this.stop(); return; }
		if ( ! this.allowed && this.transition ) this.transition.lastProgressAt = now;
		this.allowed = true; this.ensureStarted();
		if ( this.active < 0 ) return;
		const deck = this.decks[ this.active ];
		if ( safe && moving && deck.playing ) {

			this.motionTime += dt;
			if ( this.pulseStart === null && this.motionTime >= this.nextSwell ) {

				this.pulseStart = now; this.swells ++; this.nextSwell = this.motionTime + 35 + this.random() * 55;

			}

		} else this.pulseStart = null;
		let swell = 0;
		if ( this.pulseStart !== null ) {

			const age = now - this.pulseStart;
			swell = age < 4 ? ease( age / 4 ) : ease( 1 - ( age - 4 ) / 9 );
			if ( age >= 13 ) this.pulseStart = null;

		}
		const target = clamp( musicVolume, 0, 1 ) * ( AMBIENT_BASE_GAIN + swell * AMBIENT_SWELL_GAIN );
		if ( Math.abs( target - this.targetGain ) > 0.00001 ) {

			this.targetGain = target;
			this.bus.gain.cancelScheduledValues( now ); this.bus.gain.setTargetAtTime( target, now, 0.8 );

		}
		const fade = Math.min( this.fadeSeconds, deck.slot / 4 );
		if ( ! this.transition && this.elapsed( deck ) >= deck.slot - fade ) {

			const next = 1 - this.active;
			if ( this.prepare( next, deck.start ) ) this.transition = { next, start: null, progress: 0, lastProgressAt: now };

		}
		if ( this.transition ) {

			const next = this.decks[ this.transition.next ]; this.play( next );
			const progress = this.elapsed( next );
			if ( progress > this.transition.progress + 0.001 ) {

				this.transition.progress = progress; this.transition.lastProgressAt = now;

			}
			if ( next.playing && ! next.media.seeking && next.media.readyState >= 3 ) {

				if ( this.transition.start === null ) this.transition.start = progress;
				// Decode/buffering stalls do not advance the fade. Paused media
				// clocks also preserve a partial transition across menus/visibility.
				const mix = clamp( ( progress - this.transition.start ) / fade, 0, 1 );
				// Linear overlap keeps two equally loud passages at background level.
				deck.gain.gain.value = 1 - mix; next.gain.gain.value = mix;
				if ( mix >= 1 ) {

					deck.media.pause(); deck.playing = false; deck.gain.gain.value = 0;
					this.active = this.transition.next; next.gain.gain.value = 1; this.transition = null; this.transitions ++;

				}

			}

		} else deck.gain.gain.value = deck.playing ? 1 : 0;
		// A slow/failed incoming seek must never extend the outgoing 20 minutes.
		if ( this.elapsed( deck ) >= deck.slot && this.active === this.decks.indexOf( deck ) ) {

			deck.media.pause(); deck.playing = false; deck.gain.gain.value = 0;
			const next = this.transition && this.decks[ this.transition.next ];
			if ( ! this.transition || next.failed || next.blocked || now - this.transition.lastProgressAt >= 5 ) this.recover( deck, now );

		}

	}

	/**
	 * Restarts the music after the other deck failed or stopped advancing: cancels the crossfade, picks a fresh random
	 * section on the working deck (away from its last one) and plays it, with the bus faded back in from silence by the
	 * next `update`.
	 *
	 * @param {object} deck the deck whose section just ran out (the active one)
	 * @param {number} now the audio context's current time, seconds
	 */
	recover( deck, now ) {

		// Reuse the working stream for a fresh random section if the other deck
		// fails or stops advancing. Fade in after the gap; never loop a bad play
		// promise or silently extend an expired section beyond twenty minutes.
		if ( this.transition ) {

			const next = this.decks[ this.transition.next ];
			next.generation ++; next.pending = false; next.playing = false; next.media.pause(); next.gain.gain.value = 0;
			this.transition = null;

		}
		if ( this.prepare( this.active, deck.start ) ) {

			this.recoveries ++; this.bus.gain.cancelScheduledValues( now ); this.bus.gain.value = 0; this.targetGain = 0;
			this.play( deck );

		}

	}

	/**
	 * The player's state, for `S_GetAmbientMusicStatus` (diagnostics and tests).
	 *
	 * @returns {{ active: boolean, phase: string, slotSeconds: number, volume: number, actualGain: number,
	 *   swells: number, transitions: number, recoveries: number, error: ?string, decks: Array<object> }} a new snapshot;
	 *   `phase` is 'paused', 'error', 'blocked', 'buffering', 'crossfade', 'playing' or 'loading'; `volume` the target bus
	 *   gain and `actualGain` its current value; each deck's start, elapsed, slot and duration in seconds
	 */
	getStatus() {

		const progressing = this.decks.some( d => d.playing && ! d.media.paused && d.media.readyState >= 3 && ! d.media.seeking );
		return { active: this.allowed, phase: ! this.allowed ? 'paused' : this.error && ! progressing ? 'error' : this.decks[ this.active ]?.blocked ? 'blocked' : ! progressing && this.active >= 0 ? 'buffering' : this.transition ? 'crossfade' : this.active >= 0 ? 'playing' : 'loading',
			slotSeconds: this.slotSeconds, volume: this.targetGain, actualGain: this.bus.gain.value, swells: this.swells, transitions: this.transitions, recoveries: this.recoveries, error: this.error,
			decks: this.decks.map( d => ( { start: d.start, elapsed: this.elapsed( d ), slot: d.slot, playing: d.playing, blocked: d.blocked, gain: d.gain.gain.value, duration: this.duration( d ) } ) ) };

	}

	/**
	 * Stops and tears the player down for good: removes the element listeners, unloads the media and disconnects every
	 * node. Called by `S_AmbientMusicShutdown`; the player must not be used afterwards.
	 */
	dispose() {

		this.stop(); this.disposed = true;
		for ( const d of this.decks ) {

			d.generation ++; d.media.removeEventListener( 'loadedmetadata', d.onMetadata ); d.media.removeEventListener( 'error', d.onError );
			d.media.removeAttribute( 'src' ); d.media.load(); d.source.disconnect(); d.gain.disconnect();

		}
		this.bus.disconnect();

	}

}

let player = null;
const hide = () => { if ( document.hidden ) player?.stop(); };

/**
 * Returns the one ambient music player, creating it on first use (from `S_UpdateAmbientMusic` once the policy is
 * first active) and from then on stopping it whenever the page is hidden. Later calls ignore their arguments. Lives
 * until `S_AmbientMusicShutdown`.
 *
 * @param {AudioContext} context Quake's audio context
 * @param {AudioNode} output where the music bus connects (the context's destination)
 * @param {object} [options] constructor options for `AmbientMusicPlayer` (first call only)
 * @returns {AmbientMusicPlayer} the shared player
 */
export function S_AmbientMusicInit( context, output, options ) {

	if ( ! player ) {

		player = new AmbientMusicPlayer( context, output, options );
		if ( typeof document !== 'undefined' ) document.addEventListener( 'visibilitychange', hide );

	}
	return player;

}

/**
 * The shared player without creating one; read by the ambient policy (for the last combat time) and for status.
 *
 * @returns {?AmbientMusicPlayer} the player, or null before `S_AmbientMusicInit` or after shutdown
 */
export function S_GetAmbientMusicPlayer() { return player; }
/**
 * Passes a real user gesture to the player (`unlock`), from `S_UnlockAudio` (snd_dma.js); nothing without a player.
 */
export function S_AmbientMusicUnlock() { player?.unlock(); }
/**
 * Pauses the music at once (`stop`), from `S_StopAllSounds` (snd_dma.js); the next host frame's policy may start it
 * again. Nothing without a player.
 */
export function S_AmbientMusicStop() { player?.stop(); }
/**
 * Records that the player fired a weapon now, from `S_StartSound` (snd_dma.js) for the view entity's weapon sounds
 * (not pickups); `S_AmbientMusicPolicy` treats combat as lasting `AMBIENT_COMBAT_SECONDS` after it, which stops the
 * swells. Stored as the audio context's time on the player; nothing without a player.
 */
export function S_AmbientMusicNotifyCombat() { if ( player ) player.lastCombat = player.context.currentTime; }
/**
 * Disposes the player and stops watching page visibility, from `S_Shutdown` (snd_dma.js); a later
 * `S_AmbientMusicInit` creates a new one.
 */
export function S_AmbientMusicShutdown() {

	if ( typeof document !== 'undefined' ) document.removeEventListener( 'visibilitychange', hide );
	player?.dispose(); player = null;

}
