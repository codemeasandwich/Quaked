/**
 * @module engine/client/hexen2_audio
 *
 * The local-session bridge from Hexen II's gamecode sound events to the port's existing mixer: the events the server
 * builtins record (`Hexen2_DrainSoundEvents`) are turned into `S_StartSound` calls with the native conversions
 * (server volume 0..1 stays the client's `fvol`; attenuation is already the client-scale value). A sample the server
 * does not precache is skipped by name, never silently played as another sound. Networked clients keep receiving the
 * same sounds through the normal server messages.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; a missing precache returns a zero-play result.
 */

/** The server volume (0..1 float) as the mixer's 0..1 linear gain, clamped. */
export function Hexen2_SoundGain( volume ) {

	const value = typeof volume === 'number' && Number.isFinite( volume ) ? volume : 0;
	return Math.max( 0, Math.min( 1, value ) );

}

/**
 * Plays the queued sound events through a client mixer.
 *
 * @param {{ precache: function(string): ?object, startSound: function(number, number, ?object,
 *   ArrayLike<number>, number, number): void, drain: function(): Array<object> }} audio
 *   `precache` resolves a sample name to the mixer's sfx, `startSound` is the existing `S_StartSound`, `drain` is the
 *   event source (`Hexen2_DrainSoundEvents`)
 * @returns {{ played: number, skipped: number }} the events given to the mixer and those with no precached sample
 */
export function Hexen2_PlayPendingSounds( audio ) {

	let played = 0, skipped = 0;
	for ( const event of audio.drain() ) {

		const sfx = audio.precache( event.sample );
		if ( ! sfx ) { skipped ++; continue; }
		audio.startSound( event.entity, event.channel, sfx, event.origin, Hexen2_SoundGain( event.volume ), event.attenuation );
		played ++;

	}
	return { played, skipped };

}
