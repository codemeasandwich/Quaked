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

	duration( deck ) { return Number.isFinite( deck.media.duration ) && deck.media.duration > 0 ? deck.media.duration : 0; }
	elapsed( deck ) { return deck.start === null ? 0 : Math.max( 0, deck.media.currentTime - deck.start ); }

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

	ensureStarted() {

		if ( this.disposed || ! this.allowed ) return;
		if ( this.active < 0 && this.prepare( 0 ) ) this.active = 0;
		if ( this.active >= 0 ) this.play( this.decks[ this.active ] );

	}

	unlock() {

		for ( const deck of this.decks ) deck.blocked = false;
		if ( this.allowed ) {

			this.ensureStarted();
			if ( this.transition ) this.play( this.decks[ this.transition.next ] );

		}

	}

	stop() {

		this.allowed = false; this.pulseStart = null; this.targetGain = 0; this.bus.gain.cancelScheduledValues( this.context.currentTime ); this.bus.gain.value = 0;
		for ( const deck of this.decks ) { deck.generation ++; deck.media.pause(); deck.playing = false; deck.pending = false; }
		this.lastTime = this.context.currentTime;

	}

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

	getStatus() {

		const progressing = this.decks.some( d => d.playing && ! d.media.paused && d.media.readyState >= 3 && ! d.media.seeking );
		return { active: this.allowed, phase: ! this.allowed ? 'paused' : this.error && ! progressing ? 'error' : this.decks[ this.active ]?.blocked ? 'blocked' : ! progressing && this.active >= 0 ? 'buffering' : this.transition ? 'crossfade' : this.active >= 0 ? 'playing' : 'loading',
			slotSeconds: this.slotSeconds, volume: this.targetGain, actualGain: this.bus.gain.value, swells: this.swells, transitions: this.transitions, recoveries: this.recoveries, error: this.error,
			decks: this.decks.map( d => ( { start: d.start, elapsed: this.elapsed( d ), slot: d.slot, playing: d.playing, blocked: d.blocked, gain: d.gain.gain.value, duration: this.duration( d ) } ) ) };

	}

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

export function S_AmbientMusicInit( context, output, options ) {

	if ( ! player ) {

		player = new AmbientMusicPlayer( context, output, options );
		if ( typeof document !== 'undefined' ) document.addEventListener( 'visibilitychange', hide );

	}
	return player;

}

export function S_GetAmbientMusicPlayer() { return player; }
export function S_AmbientMusicUnlock() { player?.unlock(); }
export function S_AmbientMusicStop() { player?.stop(); }
export function S_AmbientMusicNotifyCombat() { if ( player ) player.lastCombat = player.context.currentTime; }
export function S_AmbientMusicShutdown() {

	if ( typeof document !== 'undefined' ) document.removeEventListener( 'visibilitychange', hide );
	player?.dispose(); player = null;

}
