/**
 * @module newer/render/r_dof
 *
 * Depth of field with autofocus (card [38]).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `deps`, `focus`, `lastTime`, `lastEye`, `lastWorld`, `_t`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Depth of field with autofocus (card [38]), Newer Game only.
//
// What the player looks at is sharp; what is much nearer or further is softened, as by a camera lens.  The focus is
// found where the crosshair meets what is drawn there: five rays through the middle of the view against the level, its
// doors, lifts and other brush entities, and the monsters and items (the renderer's trace, deps.trace); the median of
// their depths, so one thin edge does not snatch it.  A ray that reaches the sky focuses far; one that reaches lava stops
// on it (it hides what is below); water and slime are seen through.  The focus follows smoothly: it settles in about a
// quarter of a second whatever the frame rate, holds while the game is paused or the eye is inside a wall, and jumps at
// once to a new distance after a teleport, a respawn or a new level.  The held gun, the status bar, the menus and the
// Bestiary's paper never take the focus and are never blurred (the gun is marked in the G-buffer; the rest is drawn after
// the picture).
//
// The blur itself is its own pass (gl_post.js DOF_FRAGMENT) at the composite's resolution: a 16-tap gather, turned per
// pixel, whose radius is the pixel's circle of confusion, min( max, strength * | 1 - focus / depth | ), scaled to a
// 1080-line picture.  A nearer, sharper sample does not spread into the blur behind it.  The sky counts as the far focus.

import { cvar_t } from '../../engine/common/cvar.js';
import { R_NewerGame } from '../mode.js';
import { R_TracePoint } from '../../engine/render/r_trace.js';

export const r_dof = new cvar_t( 'r_dof', '0.15', true ); // strength 0..1 (0 off; the options slider, a step .05: the owner's default is three steps)

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

/**
 * Installs the renderer's hooks the focus search uses. Called by `R_NewMap` (`gl_rmain.js`) on every map load; the
 * object is kept until the next call.
 *
 * @param {{ xr?: function(): boolean, trace?: function(Array<number>, Array<number>): { fraction: number,
 *   startsolid: boolean }, contents?: function(Array<number>): (number|undefined), pointInLeaf?: function(Array<number>,
 *   model_t): ?mleaf_t }} externals `xr()` -> whether WebXR is presenting (no depth of field there);
 *   `trace( a, b )` -> `{ fraction, startsolid }`, where a ray first meets the level, its brush entities and its
 *   monsters and items (else the world's own hull 0 alone, via `R_TracePoint`); `contents( p )` -> the level's
 *   contents at a point (sky volumes and lava along a ray); `pointInLeaf( p, world )` (a sky face struck); either of
 *   the last two left out is not looked at
 */
export function R_DofSetup( externals ) { deps = externals; }
const CONTENTS_LAVA = - 5, CONTENTS_SKY = - 6;
export const R_DofEnabled = () => R_NewerGame() && r_dof.value > 0 && ! ( deps?.xr?.() ?? false );

// how far along a -> b (0..1) the ray is stopped, or null when it starts inside a wall
let _t = null; // (made on first use: world.js is still loading when this module is)
function traceFraction( world, a, b ) {

	let r;
	if ( deps?.trace ) r = deps.trace( a, b );
	else {

		r = R_TracePoint( world, a, b, _t ?? undefined );
		if ( r === null ) return 1;
		_t = r;

	}
	if ( r.startsolid ) return null;
	// a sky face struck (the sky drawn on a solid brush, as in E1M1): far
	if ( r.fraction < 1 && deps?.pointInLeaf && skyStruck( world, a, b, r.fraction ) ) return 1;
	// along the way: the sky (focus far) or lava (stop on it); the hull lets both through
	if ( deps?.contents ) {

		const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ), end = r.fraction * len;
		for ( let d = 8; d < end; d += 8 ) {

			const t = d / len, c = deps.contents( [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t ] );
			if ( c === CONTENTS_SKY ) return 1;
			if ( c === CONTENTS_LAVA ) return t;

		}

	}
	return r.fraction;

}

// whether a ray from a to b, stopped at fraction f, stopped on a sky face: a surface drawn as sky, among those of the leaf
// just in front of the stop, whose plane holds the stopping point
const SURF_DRAWSKY = 4;
function skyStruck( world, a, b, f ) {

	const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ) || 1, back = Math.max( 0, f - 1 / len );
	const p = [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * f, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * f, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * f ];
	const leaf = deps.pointInLeaf( [ a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * back, a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * back, a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * back ], world );
	if ( leaf == null || leaf.firstmarksurface == null ) return false;
	for ( let i = 0; i < leaf.nummarksurfaces; i ++ ) {

		const s = leaf.firstmarksurface[ i ];
		if ( s == null || ! ( s.flags & SURF_DRAWSKY ) || s.plane == null ) continue;
		const n = s.plane.normal;
		if ( Math.abs( n[ 0 ] * p[ 0 ] + n[ 1 ] * p[ 1 ] + n[ 2 ] * p[ 2 ] - s.plane.dist ) < 1.5 ) return true;

	}
	return false;

}

/*
================
R_DofTarget

Where the view is looking: the median view depth (along forward) of five rays through the middle of the view against
the level, each clamped to [ near, far ]; null when every ray starts inside a wall (the focus then holds).
================
*/
/**
 * Finds where the view is looking: five rays of length `DOF.far` (4096 Quake units), the middle one along `forward`
 * and four offset by `DOF.spread` along `right` and `up`, each traced against the level (sky focuses far, lava stops
 * the ray, water and slime are seen through). Called by `R_DofFrame` each frame.
 *
 * @param {model_t} world the client's world model, passed to the trace and leaf lookups
 * @param {Array<number>} eye the view origin (Quake units, world space)
 * @param {Array<number>} forward the unit view direction
 * @param {Array<number>} right the unit right vector of the view
 * @param {Array<number>} up the unit up vector of the view
 * @returns {?number} the median view depth along `forward`, in Quake units clamped to 16..4096 (`DOF.near`..`DOF.far`);
 *   null when every ray starts inside a wall
 */
export function R_DofTarget( world, eye, forward, right, up ) {

	const s = DOF.spread, offsets = [ [ 0, 0 ], [ s, 0 ], [ - s, 0 ], [ 0, s ], [ 0, - s ] ], depths = [];
	for ( const [ x, y ] of offsets ) {

		const d = [ forward[ 0 ] + right[ 0 ] * x + up[ 0 ] * y, forward[ 1 ] + right[ 1 ] * x + up[ 1 ] * y, forward[ 2 ] + right[ 2 ] * x + up[ 2 ] * y ];
		const end = [ eye[ 0 ] + d[ 0 ] * DOF.far, eye[ 1 ] + d[ 1 ] * DOF.far, eye[ 2 ] + d[ 2 ] * DOF.far ];
		const f = traceFraction( world, eye, end );
		// view depth: along forward (d's forward part is 1)
		if ( f !== null ) depths.push( Math.max( DOF.near, Math.min( DOF.far, f * DOF.far ) ) );

	}
	if ( depths.length === 0 ) return null;
	depths.sort( ( a, b ) => a - b );
	return depths[ depths.length >> 1 ];

}

/*
================
R_DofFrame

Each frame, after the view is set up: the focus moves towards where the view looks (in log distance, so near and far
changes take the same time), held while the clock stands, snapped on a new level, a jump of the eye or the clock going
back.
================
*/
/**
 * Advances the autofocus once per rendered frame, from `R_RenderView` (`gl_rmain.js`) after the view is set up. The
 * focus eases towards `R_DofTarget` with a 0.25 s time constant in log distance; it snaps (counting `dofStats.snaps`)
 * on the first frame, a new world, the clock going back or an eye move of more than 96 Quake units in one frame.
 * Updates `dofStats.target` and `dofStats.focus`. When depth of field is off (`R_DofEnabled()` false) or there is no
 * world, the focus is dropped.
 *
 * @param {number} time client time in seconds (`cl.time`); the focus holds while it stands still
 * @param {?model_t} world the client's world model
 * @param {Array<number>} eye the view origin (Quake units, world space)
 * @param {Array<number>} forward the unit view direction (`vpn`)
 * @param {Array<number>} right the unit right vector (`vright`)
 * @param {Array<number>} up the unit up vector (`vup`)
 * @returns {number} the focus distance in Quake units, or 0 when depth of field is off
 */
export function R_DofFrame( time, world, eye, forward, right, up ) {

	if ( R_DofEnabled() === false || world == null ) { focus = null; lastTime = null; dofStats.focus = 0; return 0; }
	let target = R_DofTarget( world, eye, forward, right, up );
	if ( target === null ) target = focus ?? DOF.far; // (the eye inside a wall: hold)
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

/**
 * The circle of confusion's scale for a picture this many lines high: `DOF.blurPx` (14 pixels at 1080 lines) times the
 * `r_dof` strength (clamped 0..1), scaled by `height / 1080`. Read by the post pipeline (`gl_post.js`) to set the blur
 * pass's uniforms each frame.
 *
 * @param {number} height the composite target's height in pixels
 * @returns {Array<number>} `[ strength in pixels, the largest ]`: the blur radius for `| 1 - focus / depth | = 1` and
 *   the cap (`DOF.maxPx` times it), both in pixels of this picture
 */
export function R_DofCircle( height ) {

	const px = DOF.blurPx * Math.max( 0, Math.min( 1, r_dof.value ) ) * height / 1080;
	return [ px, px * DOF.maxPx ];

}

// the depth the sky counts as in the blur: the far focus, so looking far leaves the sky sharp
export const R_DofFar = () => DOF.far;

/**
 * Forgets the focus, the last time, eye and world, so the next `R_DofFrame` snaps. Called by `R_NewMap`
 * (`gl_rmain.js`) at the end of every map load.
 */
export function R_DofClear() { focus = null; lastTime = null; lastEye = null; lastWorld = null; }
