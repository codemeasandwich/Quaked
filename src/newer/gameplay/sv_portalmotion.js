/**
 * @module newer/gameplay/sv_portalmotion
 *
 * The scope of one client physics call, so a portal can keep the player's velocity without physics importing the
 * renderer.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 1 module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Renderer-independent scope for one client physics call. Physics must not
// import the portal renderer to retain a pre-impact velocity: doing so changes
// the browser startup's circular module evaluation order.
const motions = new WeakMap();

/**
 * Opens the portal-motion scope of one walking client's physics call: records the velocity the player had before the
 * move, so a camera portal touched during the move (sv_portal.js) can keep the pre-impact velocity instead of the one
 * clipped against the wall. Called by `SV_Physics_Client` (sv_phys.js) for MOVETYPE_WALK just before `SV_WalkMove`.
 *
 * @param {edict_t} ent the player's edict; replaces any scope already open for it
 * @param {number} time `sv.time` of this physics frame (seconds); readers must pass the same time
 * @returns {{ time: number, velocity: Array<number>, stepping?: boolean }} the scope: a copy of `ent.v.velocity`
 *   (units per second). Pass it to `SV_PortalMoveEnd`. Held in a WeakMap keyed by the edict, so it lives at most until
 *   that call or until the edict object is collected.
 */
export function SV_PortalMoveStart( ent, time ) {

	const motion = { time, velocity: Array.from( ent.v.velocity ) };
	motions.set( ent, motion );
	return motion;

}

/**
 * Closes the scope opened by `SV_PortalMoveStart` at the end of `SV_Physics_Client` (sv_phys.js). Does nothing if a
 * newer scope has replaced it.
 *
 * @param {edict_t} ent the player's edict
 * @param {{ time: number, velocity: Array<number> }} motion the object `SV_PortalMoveStart` returned
 */
export function SV_PortalMoveEnd( ent, motion ) {

	if ( motions.get( ent ) === motion ) motions.delete( ent );

}

/**
 * Reads the open portal-motion scope for an edict, if it belongs to this physics frame. Used by the portal touch
 * (sv_portal.js, the pre-impact velocity) and by `SV_PortalObstructed` (world.js, which ignores step attempts).
 *
 * @param {edict_t} ent the edict being moved
 * @param {number} time the current `sv.time` (seconds)
 * @returns {?{ time: number, velocity: Array<number>, stepping?: boolean }} the scope (do not keep it), or null when
 *   none is open for `ent` or it was opened at another time
 */
export function SV_PortalMoveRead( ent, time ) {

	const motion = motions.get( ent );
	return motion?.time === time ? motion : null;

}

/**
 * Marks whether `SV_WalkMove` (sv_phys.js) is inside its step attempt: set true before the up/forward/down tries and
 * false once the step is kept or undone. No effect when no scope is open for this frame.
 *
 * The walk move's step attempt (up, forward, down, and possibly undone) links the player at positions that may be
 * discarded. A portal touch decided there could teleport twice in one frame, so the obstruction fallback ignores
 * them; the frame's final link still decides.
 *
 * @param {edict_t} ent the player's edict
 * @param {number} time the current `sv.time` (seconds)
 * @param {boolean} stepping true while the step attempt runs; mutates the open scope's `stepping`
 */
export function SV_PortalMoveStepping( ent, time, stepping ) {

	const motion = SV_PortalMoveRead( ent, time );
	if ( motion ) motion.stepping = stepping;

}
