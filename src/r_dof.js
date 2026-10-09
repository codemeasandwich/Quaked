// Depth of field with autofocus (card [38]), Newer Game only.
//
// What the player looks at is sharp; what is much nearer or further is softened, as by a camera lens.  The focus is
// found where the crosshair meets the level (five rays through the middle of the view against the level's own hull,
// the median of their depths, so one thin edge does not snatch it), and follows it smoothly: it settles in about a
// quarter of a second whatever the frame rate, holds while the game is paused, and jumps at once to a new distance after
// a teleport, a respawn or a new level.  The held gun, the status bar, the menus and the Bestiary's paper never take the
// focus and are never blurred (the gun is marked in the G-buffer; the rest is drawn after the picture).
//
// The blur itself is in the present pass (gl_post.js PRESENT_FRAGMENT): a 16-tap gather whose radius is the pixel's
// circle of confusion, min( max, strength * | 1 - focus / depth | ), in the composite's own pixels (so dynamic resolution
// does not change it) scaled to a 1080-line picture.  A nearer, sharper sample does not spread into the blur behind it.

import { cvar_t } from './cvar.js';
import { R_NewerGame } from './r_anim.js';
import { trace_t, SV_RecursiveHullCheck } from './world.js';

export const r_dof = new cvar_t( 'r_dof', '0.3', true ); // strength (0 off; the options slider)

export const DOF = {
	far: 4096,          // Quake units: a ray that meets nothing focuses here (the sky, a long hall)
	near: 16,           // the nearest focus (a wall at the player's nose)
	spread: 0.03,       // the four outer rays, this far off the middle (of the view's forward, sideways and up)
	settle: 0.25,       // seconds: the smoothing's time constant
	jump: 96,           // Quake units the eye moves in one frame that count as a teleport (focus snaps)
	blurPx: 14,         // circle of confusion at strength 1, in pixels of a 1080-line picture, for | 1 - focus / depth | = 1
	maxPx: 2            // the largest circle, as a multiple of blurPx (very near things)
};

let deps = null, focus = null, lastTime = null, lastEye = null, lastWorld = null;
export const dofStats = { target: 0, focus: 0, snaps: 0 };

// externals: xr() -> whether WebXR is presenting (no depth of field there); trace( a, b ) (optional, for tests:
// the distance fraction a ray meets the level, else the world's own hull 0)
export function R_DofSetup( externals ) { deps = externals; }
export const R_DofEnabled = () => R_NewerGame() && r_dof.value > 0 && ! ( deps?.xr?.() ?? false );

function traceFraction( world, a, b ) {

	if ( deps?.trace ) return deps.trace( a, b );
	const hull = world?.hulls?.[ 0 ];
	if ( ! hull ) return 1;
	const t = new trace_t(); t.allsolid = true; t.endpos.set( b );
	SV_RecursiveHullCheck( hull, hull.firstclipnode, 0, 1, a, b, t );
	return t.startsolid ? 0 : t.fraction;

}

/*
================
R_DofTarget

Where the view is looking: the median view depth (along forward) of five rays through the middle of the view against
the level, each clamped to [ near, far ].
================
*/
export function R_DofTarget( world, eye, forward, right, up ) {

	const s = DOF.spread, offsets = [ [ 0, 0 ], [ s, 0 ], [ - s, 0 ], [ 0, s ], [ 0, - s ] ], depths = [];
	for ( const [ x, y ] of offsets ) {

		const d = [ forward[ 0 ] + right[ 0 ] * x + up[ 0 ] * y, forward[ 1 ] + right[ 1 ] * x + up[ 1 ] * y, forward[ 2 ] + right[ 2 ] * x + up[ 2 ] * y ];
		const end = [ eye[ 0 ] + d[ 0 ] * DOF.far, eye[ 1 ] + d[ 1 ] * DOF.far, eye[ 2 ] + d[ 2 ] * DOF.far ];
		const f = traceFraction( world, eye, end );
		// view depth: along forward (d's forward part is 1)
		depths.push( Math.max( DOF.near, Math.min( DOF.far, f * DOF.far ) ) );

	}
	depths.sort( ( a, b ) => a - b );
	return depths[ 2 ];

}

/*
================
R_DofFrame

Each frame, after the view is set up: the focus moves towards where the view looks (in log distance, so near and far
changes take the same time), held while the clock stands, snapped on a new level, a jump of the eye or the clock going
back.
================
*/
export function R_DofFrame( time, world, eye, forward, right, up ) {

	if ( R_DofEnabled() === false || world == null ) { focus = null; lastTime = null; dofStats.focus = 0; return 0; }
	const target = R_DofTarget( world, eye, forward, right, up );
	const moved = lastEye === null ? Infinity : Math.hypot( eye[ 0 ] - lastEye[ 0 ], eye[ 1 ] - lastEye[ 1 ], eye[ 2 ] - lastEye[ 2 ] );
	if ( focus === null || world !== lastWorld || lastTime === null || time < lastTime || moved > DOF.jump ) {

		focus = target; dofStats.snaps ++;

	} else {

		const k = 1 - Math.exp( - ( time - lastTime ) / DOF.settle );
		focus = Math.exp( Math.log( focus ) + ( Math.log( target ) - Math.log( focus ) ) * k );

	}
	lastTime = time; lastEye = [ eye[ 0 ], eye[ 1 ], eye[ 2 ] ]; lastWorld = world;
	dofStats.target = target; dofStats.focus = focus;
	return focus;

}

// the focus distance this frame, or 0 (off: no depth of field drawn)
export const R_DofFocus = () => ( R_DofEnabled() && focus !== null ? focus : 0 );

// the circle of confusion's scale for a picture this many lines high: [ strength in pixels, the largest ]
export function R_DofCircle( height ) {

	const px = DOF.blurPx * Math.max( 0, r_dof.value ) * height / 1080;
	return [ px, px * DOF.maxPx ];

}

export function R_DofClear() { focus = null; lastTime = null; lastEye = null; lastWorld = null; }
