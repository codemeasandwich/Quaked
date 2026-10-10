/**
 * @module newer/render/r_anim
 *
 * Smooth animation: in-between frames for Quake's models. (The Newer Game / Classic switch is in `newer/mode.js`.)
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Model animation smoothing: extra frames between Quake's animation frames.
//
// Quake animates alias models by stepping between stored poses, usually one
// step every 0.1 s (10 fps), and the original draws whichever pose is current.
// Here the vertices are blended between the pose being left and the pose being
// entered (or, when the game changes pose before a blend is done, from the pose
// that was on screen), so the motion runs at the display's frame rate.
//
// The state lives on the entity: which pose it was showing, which it is
// heading for and when that started.  It resets, and does not blend, when a
// model is seen for the first time or has not been drawn for a while (so a
// monster coming into view does not slide out of its previous pose), when the
// model changes, or when the entity has teleported or jumped.

import { cvar_t } from '../../engine/common/cvar.js';
import { R_IsNewer } from '../mode.js';
import { ANIM_STEP } from '../../engine/common/quakedef.js';

// 0 = off; values 1 and above enable smoothing only in Newer Game.
// Legacy value 2 is retained as a preference, but never overrides Classic.
export const r_lerpmodels = new cvar_t( 'r_lerpmodels', '1' );

export { ANIM_STEP }; // seconds between frames in Quake's own animations (engine/common/quakedef.js)
const STALE = 0.25; // not drawn for this long: start again without blending
const JUMP = 96; // a move this big in one frame is a teleport

export function R_AnimEnabled() {

	return R_IsNewer() && r_lerpmodels.value >= 1;

}

/*
================
R_AliasPoseBlend

target is the pose the game says the entity is in now; interval is how long the
frame lasts (a group frame has its own; otherwise Quake's 0.1 s).  Returns the
state with .from, .to and .blend (0..1), and .lead: null, or, when the game
changed pose before the last blend was done (a think that lands a server frame
early, about 0.083 s after the last: about one change in seven in the browser
audit), { from, to, t }, the two poses and how far between them the blend had got.
The mesh (gl_mesh.js) then starts the new blend from the pose it had on screen
rather than snapping the rest of the way to .from (card [43]).
================
*/
export function R_AliasPoseBlend( entity, model, target, time, interval ) {

	let s = entity._aliasLerp;
	const origin = entity.origin;

	if ( s === undefined || s.model !== model || time < s.lastTime || time - s.lastTime > STALE ||
		( origin != null && s.origin != null && Math.hypot( origin[ 0 ] - s.origin[ 0 ], origin[ 1 ] - s.origin[ 1 ], origin[ 2 ] - s.origin[ 2 ] ) > JUMP ) ) {

		s = entity._aliasLerp = {
			model, from: target, to: target, start: time, interval: interval, lastTime: time,
			origin: origin != null ? [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ] : null, blend: 1, lead: null
		};
		return s;

	}

	if ( target !== s.to ) {

		// how far the last blend had got (by its own interval) when the change came: short of the end, an early change
		// (the mesh keeps the pose it drew; these two poses and t rebuild it when it has none). Rounding on a change
		// that comes on time is not early.
		const t = ( time - s.start ) / ( s.interval > 0 ? s.interval : ANIM_STEP );
		s.lead = s.from !== s.to && t < 1 - 1e-6 ? { from: s.from, to: s.to, t: t < 0 ? 0 : t } : null;
		s.from = s.to;
		s.to = target;
		s.start = time;
		s.interval = interval;

	}

	s.lastTime = time;
	if ( origin != null ) {

		if ( s.origin == null ) s.origin = [ 0, 0, 0 ];
		s.origin[ 0 ] = origin[ 0 ]; s.origin[ 1 ] = origin[ 1 ]; s.origin[ 2 ] = origin[ 2 ];

	}

	const t = ( time - s.start ) / ( s.interval > 0 ? s.interval : ANIM_STEP );
	s.blend = t < 0 ? 0 : t > 1 ? 1 : t;
	if ( s.from === s.to ) { s.blend = 1; s.lead = null; }
	if ( s.blend >= 1 ) s.lead = null;

	return s;

}

//============================================================================
// Smooth movement
//============================================================================
//
// Monsters walk in steps: the game moves them once per think (about every 0.1 s),
// so their position and heading only change ten times a second however smooth
// their poses are.  Here the displayed position and heading glide from where they
// were to where the game put them, over the time the step took.  It lags the
// game by one step, which is invisible; fast things (projectiles, players) and
// things that are teleported are left alone.

const STEP_MIN = 0.04; // changes closer together than this are continuous movement
const STEP_MAX = 0.35; // and further apart than this are not walking
const STEP_SPEED = 380; // units per second: faster than any monster walks
const STEP_JUMP = 96; // a bigger change is a teleport
const MODEL_EFFECTS = ~ 8; // any model flag but EF_ROTATE (rockets, grenades, gibs, tracers...) means fast

const _from = [ 0, 0, 0 ];

function lerpAngle( a, b, t ) {

	let d = b - a;
	if ( d > 180 ) d -= 360; else if ( d < - 180 ) d += 360;
	return a + d * t;

}

/*
================
R_SmoothMove

Called just before an alias entity is drawn; adjusts entity.origin and
entity.angles in place (the game recomputes them every frame).
================
*/
export function R_SmoothMove( entity, time ) {

	const o = entity.origin, a = entity.angles;
	if ( o == null || a == null ) return;

	let s = entity._smoothMove;

	if ( s === undefined || time < s.lastTime || time - s.lastTime > STALE || s.model !== entity.model ) {

		entity._smoothMove = {
			model: entity.model, lastTime: time, changed: time,
			rawO: [ o[ 0 ], o[ 1 ], o[ 2 ] ], rawA: [ a[ 0 ], a[ 1 ], a[ 2 ] ],
			fromO: [ o[ 0 ], o[ 1 ], o[ 2 ] ], toO: [ o[ 0 ], o[ 1 ], o[ 2 ] ],
			fromA: [ a[ 0 ], a[ 1 ], a[ 2 ] ], toA: [ a[ 0 ], a[ 1 ], a[ 2 ] ],
			start: time, dur: 0
		};
		return;

	}

	// drawn again in the same frame (a portal or mirror view): show what was shown
	if ( time === s.lastTime && s.shown !== undefined ) {

		for ( let i = 0; i < 3; i ++ ) { o[ i ] = s.shown[ i ]; a[ i ] = s.shownA[ i ]; }
		return;

	}

	s.lastTime = time;

	const moved = Math.hypot( o[ 0 ] - s.rawO[ 0 ], o[ 1 ] - s.rawO[ 1 ], o[ 2 ] - s.rawO[ 2 ] );
	const turned = Math.abs( lerpAngle( s.rawA[ 1 ], a[ 1 ], 1 ) - s.rawA[ 1 ] ) + Math.abs( lerpAngle( s.rawA[ 0 ], a[ 0 ], 1 ) - s.rawA[ 0 ] );

	if ( moved > 0.01 || turned > 0.05 ) {

		const dt = time - s.changed;

		// where it is shown right now: the starting point of the next glide
		const t = s.dur > 0 ? Math.min( 1, ( time - s.start ) / s.dur ) : 1;
		for ( let i = 0; i < 3; i ++ ) {

			_from[ i ] = s.fromO[ i ] + ( s.toO[ i ] - s.fromO[ i ] ) * t;
			s.fromA[ i ] = lerpAngle( s.fromA[ i ], s.toA[ i ], t );

		}

		const walking = dt >= STEP_MIN && dt <= STEP_MAX && moved < STEP_JUMP && moved / dt < STEP_SPEED &&
			( entity.model == null || ( ( entity.model.flags | 0 ) & MODEL_EFFECTS ) === 0 );

		if ( walking ) {

			for ( let i = 0; i < 3; i ++ ) s.fromO[ i ] = _from[ i ];
			s.dur = Math.min( dt * 1.2, STEP_MAX ); // a little long, so it never stops short of the next step

		} else {

			// no glide: show it where the game says
			for ( let i = 0; i < 3; i ++ ) { s.fromO[ i ] = o[ i ]; s.fromA[ i ] = a[ i ]; }
			s.dur = 0;

		}

		for ( let i = 0; i < 3; i ++ ) { s.toO[ i ] = o[ i ]; s.toA[ i ] = a[ i ]; s.rawO[ i ] = o[ i ]; s.rawA[ i ] = a[ i ]; }
		s.start = time;
		s.changed = time;

	}

	if ( s.dur > 0 ) {

		const t = Math.min( 1, ( time - s.start ) / s.dur );
		for ( let i = 0; i < 3; i ++ ) {

			o[ i ] = s.fromO[ i ] + ( s.toO[ i ] - s.fromO[ i ] ) * t;
			a[ i ] = lerpAngle( s.fromA[ i ], s.toA[ i ], t );

		}

	}

	s.shown = [ o[ 0 ], o[ 1 ], o[ 2 ] ];
	s.shownA = [ a[ 0 ], a[ 1 ], a[ 2 ] ];

}

// out[ i ] = a[ i ] + ( b[ i ] - a[ i ] ) * t
export function R_BlendArrays( out, a, b, t ) {

	for ( let i = 0; i < out.length; i ++ ) out[ i ] = a[ i ] + ( b[ i ] - a[ i ] ) * t;

}
