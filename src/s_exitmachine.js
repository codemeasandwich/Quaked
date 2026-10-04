// E1M1's native exit drone used to become audible only inside the machine
// room. Its approach ramp begins at (1312,1248,-344), about 810 units away
// from the existing source (1314,450,-200). Reuse that loop and effects bus;
// extend only this emitter's falloff, with a quiet, smooth approach envelope.
export function S_ExitMachineFalloff( map, channel, distance, newer ) {
	if ( ! newer || map !== 'maps/e1m1.bsp' || channel.entnum !== -1 ||
		channel.sfx?.name !== 'ambience/drone6.wav' ||
		Math.hypot( channel.origin[ 0 ] - 1314, channel.origin[ 1 ] - 450, channel.origin[ 2 ] + 200 ) > 2 ) return null;
	const t = Math.max( 0, Math.min( 1, ( 950 - distance ) / 850 ) );
	return .6 * t * t * ( 3 - 2 * t );
}
