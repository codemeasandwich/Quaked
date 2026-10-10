/**
 * @module newer/gameplay/sv_portalmotion
 *
 * The scope of one client physics call, so a portal can keep the player's velocity without physics importing the
 * renderer.
 *
 * Owns: one map of the move in progress. Lifetime: one physics call.
 *
 * Errors: none raised.
 */
// Renderer-independent scope for one client physics call. Physics must not
// import the portal renderer to retain a pre-impact velocity: doing so changes
// the browser startup's circular module evaluation order.
const motions = new WeakMap();

export function SV_PortalMoveStart( ent, time ) {

	const motion = { time, velocity: Array.from( ent.v.velocity ) };
	motions.set( ent, motion );
	return motion;

}

export function SV_PortalMoveEnd( ent, motion ) {

	if ( motions.get( ent ) === motion ) motions.delete( ent );

}

export function SV_PortalMoveRead( ent, time ) {

	const motion = motions.get( ent );
	return motion?.time === time ? motion : null;

}

// The walk move's step attempt (up, forward, down, and possibly undone) links the player at positions that may be
// discarded. A portal touch decided there could teleport twice in one frame, so the obstruction fallback ignores
// them; the frame's final link still decides.
export function SV_PortalMoveStepping( ent, time, stepping ) {

	const motion = SV_PortalMoveRead( ent, time );
	if ( motion ) motion.stepping = stepping;

}
