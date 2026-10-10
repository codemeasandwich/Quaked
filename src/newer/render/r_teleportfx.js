/**
 * @module newer/render/r_teleportfx
 *
 * The teleporter pad effect.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `phase`, `since`, `snapAsked`, `captureAsked`, `overlay`,
 * `afterFrames`.
 *
 * Errors: catches at 1 place.
 */
// The teleporter pad effect (Newer Game).
//
// As the player steps onto a pad, the picture on the screen is copied, and that copy is
// stretched upwards (splitting into red, green and blue) while the next level loads
// behind it.  The copy is a page element animated by the browser itself, so it keeps
// moving while the game is busy loading.  When the new level is up and has drawn its
// first pictures, the copy goes, and the colours of the new level's first frames fade
// back to normal: the new place is there at once.
//
// Where the screen cannot be copied, the live picture is stretched by the renderer
// instead (R_TeleportFx gives the stretch and colour split for the lighting pass).

const BUILD = 0.36; // seconds the stretch takes to build up (and the least time it is shown)
const TAIL = 0.28; // seconds for the colours of the new level to come together

let phase = 'idle'; // 'idle', 'build' (live stretch), 'overlay' (the copy is up), 'snap'
let since = 0;
let snapAsked = false;
let captureAsked = false;
let overlay = null; // { root }
let afterFrames = 0;

// --- the copy of the screen ---
const LAYERS = [
	{ colour: '#f00', animation: 'qtele-r' },
	{ colour: '#0f0', animation: 'qtele-g' },
	{ colour: '#00f', animation: 'qtele-b' }
];

function ensureStyle() {

	if ( document.getElementById( 'qtele-style' ) !== null ) return;

	const style = document.createElement( 'style' );
	style.id = 'qtele-style';
	// each colour is stretched a little more than the last, so they come apart along the stretch
	style.textContent = `
		.qtele { position: fixed; left: 0; top: 0; width: 100%; height: 100%; background: #000; overflow: hidden; pointer-events: none; }
		.qtele canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; mix-blend-mode: screen; transform-origin: 50% 50%; will-change: transform; animation-duration: ${BUILD}s; animation-timing-function: cubic-bezier(0.55, 0, 0.95, 0.6); animation-fill-mode: forwards; }
		@keyframes qtele-r { from { transform: scale(1, 1); } to { transform: scale(1.0, 8.4) translateY(-0.6%); } }
		@keyframes qtele-g { from { transform: scale(1, 1); } to { transform: scale(1.04, 10) translateY(0); } }
		@keyframes qtele-b { from { transform: scale(1, 1); } to { transform: scale(1.08, 11.8) translateY(0.6%); } }`;
	document.head.appendChild( style );

}

// what the player sees, copied: the picture of the world only.  The text and the status bar
// are on a canvas of their own and stay as they are (sharp, and not stretched).
function capture( main ) {

	const w = Math.min( 1280, main.width ), h = Math.round( main.height * w / main.width );
	const base = document.createElement( 'canvas' );
	base.width = w;
	base.height = h;
	const g = base.getContext( '2d' );
	g.drawImage( main, 0, 0, w, h );
	g.getImageData( 0, 0, 1, 1 ); // (throws if the picture is not readable)
	return base;

}

function show( base, main ) {

	ensureStyle();

	const root = document.createElement( 'div' );
	root.className = 'qtele';

	for ( const layer of LAYERS ) {

		const c = document.createElement( 'canvas' );
		c.width = base.width;
		c.height = base.height;
		const g = c.getContext( '2d' );
		g.drawImage( base, 0, 0 );
		// this colour of the picture only
		g.globalCompositeOperation = 'multiply';
		g.fillStyle = layer.colour;
		g.fillRect( 0, 0, c.width, c.height );
		c.style.animationName = layer.animation;
		root.appendChild( c );

	}

	// straight after the picture of the world, so the text canvas (later in the page) stays above it
	if ( main.parentNode !== null ) main.parentNode.insertBefore( root, main.nextSibling );
	else document.body.appendChild( root );
	overlay = { root };

}

function hide() {

	if ( overlay !== null ) overlay.root.remove();
	overlay = null;

}

export function R_TeleportFxBegin( now ) {

	phase = 'build';
	since = now;
	snapAsked = false;

}

// the picture is to be copied at the end of this frame, once it is drawn
export function R_TeleportFxCapture() {

	captureAsked = true;
	phase = 'overlay';
	snapAsked = false;
	afterFrames = 0;

}

// called at the end of every frame, with the two canvases and whether the game is
// running in a level; returns true while the copy of the screen is up
export function R_TeleportFrameEnd( now, main, over, levelReady ) {

	if ( captureAsked ) {

		captureAsked = false;

		try {

			show( capture( main ), main );
			since = now;

		} catch ( e ) {

			// the screen cannot be copied here: the live picture is stretched instead
			hide();
			R_TeleportFxBegin( now );

		}

		return overlay !== null;

	}

	if ( overlay === null ) return false;

	// the new level has drawn its first pictures, and the stretch has run its course
	if ( snapAsked && levelReady ) {

		afterFrames ++;

		if ( afterFrames >= 2 && now - since >= BUILD ) {

			hide();
			phase = 'snap';
			since = now;

		}

	}

	return overlay !== null;

}

export function R_TeleportOverlayShown() {

	return overlay !== null;

}

// the next level has been loaded
export function R_TeleportFxSnap() {

	if ( phase === 'build' || phase === 'overlay' ) snapAsked = true;

}

export function R_TeleportFxMode() {

	return phase;

}

export function R_TeleportFxActive() {

	return phase !== 'idle';

}

export function R_TeleportFxReset() {

	hide();
	phase = 'idle';
	snapAsked = false;
	captureAsked = false;

}

export function R_TeleportFx( now ) {

	if ( phase === 'idle' || phase === 'overlay' ) return { stretch: 0, chroma: 0 };

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
