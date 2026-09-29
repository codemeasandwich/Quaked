// Model animation smoothing: extra frames between Quake's animation frames.
//
// Quake animates alias models by stepping between stored poses, usually one
// step every 0.1 s (10 fps), and the original draws whichever pose is current.
// Here the vertices are blended between the pose being left and the pose being
// entered, so the motion runs at the display's frame rate.
//
// The state lives on the entity: which pose it was showing, which it is
// heading for and when that started.  It resets, and does not blend, when a
// model is seen for the first time or has not been drawn for a while (so a
// monster coming into view does not slide out of its previous pose), when the
// model changes, or when the entity has teleported or jumped.

import { cvar_t } from './cvar.js';

// 0 = off, 1 = on in Newer Game only (the default), 2 = always
export const r_lerpmodels = new cvar_t( 'r_lerpmodels', '1' );

export const ANIM_STEP = 0.1; // seconds between frames in Quake's own animations
const STALE = 0.25; // not drawn for this long: start again without blending
const JUMP = 96; // a move this big in one frame is a teleport

let newerActive = false;

export function R_AnimSetNewer( active ) {

	newerActive = active === true;

}

export function R_IsNewer() {

	return newerActive;

}

export function R_AnimEnabled() {

	const v = r_lerpmodels.value;
	return v >= 2 || ( v >= 1 && newerActive );

}

/*
================
R_AliasPoseBlend

target is the pose the game says the entity is in now; interval is how long the
frame lasts (a group frame has its own; otherwise Quake's 0.1 s).  Returns the
state with .from, .to and .blend (0..1).
================
*/
export function R_AliasPoseBlend( entity, model, target, time, interval ) {

	let s = entity._aliasLerp;
	const origin = entity.origin;

	if ( s === undefined || s.model !== model || time < s.lastTime || time - s.lastTime > STALE ||
		( origin != null && s.origin != null && Math.hypot( origin[ 0 ] - s.origin[ 0 ], origin[ 1 ] - s.origin[ 1 ], origin[ 2 ] - s.origin[ 2 ] ) > JUMP ) ) {

		s = entity._aliasLerp = {
			model, from: target, to: target, start: time, interval: interval, lastTime: time,
			origin: origin != null ? [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ] : null, blend: 1
		};
		return s;

	}

	if ( target !== s.to ) {

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
	if ( s.from === s.to ) s.blend = 1;

	return s;

}

// out[ i ] = a[ i ] + ( b[ i ] - a[ i ] ) * t
export function R_BlendArrays( out, a, b, t ) {

	for ( let i = 0; i < out.length; i ++ ) out[ i ] = a[ i ] + ( b[ i ] - a[ i ] ) * t;

}
