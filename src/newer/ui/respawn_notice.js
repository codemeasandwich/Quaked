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
export function Respawn_NoticeSet( text, time ) { notice = { text, time }; }
export function Respawn_NoticeClear() { notice = null; }
// the text to draw at game time `time`, or null (also null if the clock has gone back before it began)
export function Respawn_NoticeAt( time ) {

	if ( notice === null || ! Number.isFinite( time ) || time < notice.time - 0.5 || time > notice.time + RESPAWN_NOTICE_SECONDS ) return null;
	return notice.text;

}
