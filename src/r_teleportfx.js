// The teleporter pad effect (Newer Game): the whole picture stretches upwards,
// splitting into red, green and blue, while the level changes; then it snaps back
// into place, and the new level is there.
//
//   begin   the player has stepped on the pad: the picture stretches for BUILD seconds
//           and stays stretched while the next level loads
//   snap    the next level has arrived: no stretch at all, and the colour split dies away
//
// R_TeleportFx( now ) gives the picture's stretch and colour split for the renderer.

const BUILD = 0.32;
const TAIL = 0.28;

let phase = 'idle'; // 'idle', 'build', 'snap'
let since = 0;
let snapAsked = false;

export function R_TeleportFxBegin( now ) {

	phase = 'build';
	since = now;
	snapAsked = false;

}

// the next level has been loaded: the snap starts with the first picture of it
export function R_TeleportFxSnap() {

	if ( phase === 'build' ) snapAsked = true;

}

export function R_TeleportFxActive() {

	return phase !== 'idle';

}

export function R_TeleportFxReset() {

	phase = 'idle';
	snapAsked = false;

}

export function R_TeleportFx( now ) {

	if ( phase === 'idle' ) return { stretch: 0, chroma: 0 };

	if ( phase === 'build' && snapAsked ) {

		phase = 'snap';
		since = now;

	}

	const t = now - since;

	if ( phase === 'build' ) {

		// accelerating: slow at first, then all at once
		const k = Math.min( 1, t / BUILD );
		return { stretch: k * k * ( 3 - 2 * k ), chroma: k };

	}

	if ( t >= TAIL ) {

		phase = 'idle';
		return { stretch: 0, chroma: 0 };

	}

	// snapped back: the colours are still apart, and close up
	const k = 1 - t / TAIL;
	return { stretch: 0, chroma: k * k };

}
