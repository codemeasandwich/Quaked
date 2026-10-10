/**
 * @module engine/common/host_state
 *
 * The host's frame clock and one host flag, shared by the client, the renderer and the platform (WinQuake declares
 * them in host.c): `realtime` and `host_frametime` in seconds, `host_framecount` in frames, and `noclip_anglehack`
 * (set while `noclip` is on, so the client sends angles the server keeps). Only the host writes them, through the
 * setters; `host.js` and `host_cmd.js` re-export them. A leaf so that modules below the host read them without
 * importing it (card [44g], baseline debt D1a).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `realtime`, `host_frametime`, `host_framecount`, `noclip_anglehack`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */

export let realtime = 0; // seconds since the host started, advanced every frame by Host_Frame
export let host_frametime = 0; // seconds this frame lasts (scaled by host_timescale, the Bestiary and slow motion)
export let host_framecount = 0; // frames run since start (incremented by _Host_Frame)
export let noclip_anglehack = false; // true while noclip is on (host_cmd.js Host_Noclip_f)

/** @param {number} v seconds since the host started */
export function set_realtime( v ) { realtime = v; }
/** @param {number} v seconds this frame lasts */
export function set_host_frametime( v ) { host_frametime = v; }
/** @param {number} v frames run since start */
export function set_host_framecount( v ) { host_framecount = v; }
/** @param {boolean} v whether noclip is on */
export function set_noclip_anglehack( v ) { noclip_anglehack = v; }
