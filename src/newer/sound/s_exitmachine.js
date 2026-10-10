/**
 * @module newer/sound/s_exitmachine
 *
 * E1M1's exit machine drone, heard on the approach.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
/**
 * Distance falloff for E1M1's exit machine drone, called by `SND_Spatialize` (snd_dma.js) for every channel it
 * spatialises. E1M1's native exit drone used to become audible only inside the machine room. Its approach ramp begins
 * at (1312,1248,-344), about 810 units away from the existing source (1314,450,-200). Reuse that loop and effects bus;
 * extend only this emitter's falloff, with a quiet, smooth approach envelope: a smoothstep from silence at 950 units
 * to 0.6 at 100 units and closer.
 *
 * @param {string|undefined} map the world model's name (`cl.worldmodel.name`)
 * @param {object} channel the channel_t being spatialised: only the static ambient (`entnum` -1) playing
 *   'ambience/drone6.wav' within 2 units of (1314,450,-200) is affected
 * @param {number} distance listener-to-source distance, Quake units (before `dist_mult`)
 * @param {boolean} newer whether the Newer Game is on (`R_NewerGame()`)
 * @returns {?number} the volume scale 0..0.6 to use instead of the native `1 - dist`, or null to keep the native
 *   falloff (any other map, channel or sound, or Classic)
 */
export function S_ExitMachineFalloff( map, channel, distance, newer ) {
	if ( ! newer || map !== 'maps/e1m1.bsp' || channel.entnum !== -1 ||
		channel.sfx?.name !== 'ambience/drone6.wav' ||
		Math.hypot( channel.origin[ 0 ] - 1314, channel.origin[ 1 ] - 450, channel.origin[ 2 ] + 200 ) > 2 ) return null;
	const t = Math.max( 0, Math.min( 1, ( 950 - distance ) / 850 ) );
	return .6 * t * t * ( 3 - 2 * t );
}
