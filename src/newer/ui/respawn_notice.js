/**
 * @module newer/ui/respawn_notice
 *
 * The short corner message about the respawn-health rule (card [4]).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `notice`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// A short message in the corner of the screen about the respawn-health rule (card [4]): written by the local
// server when the entitlement changes, drawn by the 2D screen code. Local single player only, so the server and
// the client share this module and the game clock.
export const RESPAWN_NOTICE_SECONDS = 3;
export const RESPAWN_MINUS = 'Respawn minus 10 health', RESPAWN_PLUS = 'Next phase plus 10 respawn';
let notice = null;
/**
 * Shows a notice for `RESPAWN_NOTICE_SECONDS` (3 s) from `time`, replacing any current one; sv_respawn.js when the
 * respawn-health entitlement goes down or up.
 *
 * @param {string} text the message (RESPAWN_MINUS or RESPAWN_PLUS)
 * @param {number} time server game time in seconds (`sv.time`) when it starts
 */
export function Respawn_NoticeSet( text, time ) { notice = { text, time }; }
/**
 * Removes the current notice.
 */
export function Respawn_NoticeClear() { notice = null; }
/**
 * The text to draw at game time `time` (gl_screen.js, each 2D frame, with `cl.time`): the notice is shown from half
 * a second before its start until 3 s after.
 *
 * @param {number} time client game time in seconds
 * @returns {?string} the notice text, or null (also null if the clock has gone back before it began, or `time` is not finite)
 */
export function Respawn_NoticeAt( time ) {

	if ( notice === null || ! Number.isFinite( time ) || time < notice.time - 0.5 || time > notice.time + RESPAWN_NOTICE_SECONDS ) return null;
	return notice.text;

}
