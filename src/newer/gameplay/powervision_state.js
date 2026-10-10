/**
 * @module newer/gameplay/powervision_state
 *
 * Which power-up vision is active (Unseen World for the Ring, Demon for the Pentagram), from the native item bits and
 * their timers.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
import { IT_INVISIBILITY, IT_INVULNERABILITY, STAT_HEALTH } from '../../engine/common/quakedef.js';

/**
 * Picks the power-up vision for the local client from its native item bits. Native item bits carry server expiry,
 * renewal and save restoration; never synthesize a second timer from item_gettime. Ring wins over Pentagram, as in
 * Quake's native visual priority; Demon resumes if its own bit remains set. Called every rendered frame (view blend in
 * `view.js`, `gl_rmain.js`, the post pipeline in `gl_post.js`, enemy skins in `r_newerskins.js`).
 *
 * @param {client_state_t} client the client state (`cl`): reads `items`, `stats[STAT_HEALTH]` and `intermission`
 * @param {boolean} enhanced whether the enhanced path is on (callers pass `R_PostActive()` or `R_NewerGame()`); false
 *   always yields 0
 * @returns {number} 0 none (also when dead or at intermission), 1 Unseen World (Ring of Shadows, `IT_INVISIBILITY`),
 *   2 Demon (Pentagram, `IT_INVULNERABILITY`)
 */
export function PowerVisionMode(client, enhanced) {
	if (!enhanced || !client || client.stats[STAT_HEALTH] <= 0 || client.intermission) return 0;
	return client.items & IT_INVISIBILITY ? 1 : client.items & IT_INVULNERABILITY ? 2 : 0;
}

/**
 * Pure temporal admission, shared by runtime and lifecycle regression tests: decides whether the previous frame's
 * Unseen World history may be blended into this frame. `R_PowerVisionRender` calls it once per vision frame. History is
 * refused unless both frames are mode 1 with the same world model, view entity, render size and projection, time moved
 * forward by at most 0.25 s, the camera moved at most 64 Quake units on every axis, and the view direction turned less
 * than about 37 degrees (dot product of the forward vectors at least 0.8).
 *
 * @param {?{ mode: number, world: *, view: number, width: number, height: number, projection?: ArrayLike<number>,
 *   time: number, origin: Array<number>, forward: Array<number> }} previous the last accepted frame, or null on the
 *   first frame
 * @param {{ mode: number, world: *, view: number, width: number, height: number, projection?: ArrayLike<number>,
 *   time: number, origin: Array<number>, forward: Array<number> }} frame this frame: `time` is client time in seconds,
 *   `origin` the camera position (Quake units, world space), `forward` the unit view direction, `width`/`height` the
 *   render target size in pixels
 * @returns {boolean} true when the history is still valid for `frame`
 */
export function PowerVisionHistory(previous, frame) {
	if (!previous || frame.mode !== 1 || previous.mode !== frame.mode ||
		previous.world !== frame.world || previous.view !== frame.view ||
		previous.width !== frame.width || previous.height !== frame.height ||
		(previous.projection && frame.projection && frame.projection.some((v,i)=>v!==previous.projection[i])) ||
		frame.time < previous.time || frame.time - previous.time > .25 ||
		frame.origin.some((v, i) => Math.abs(v - previous.origin[i]) > 64) ||
		frame.forward.reduce((sum, v, i) => sum + v * previous.forward[i], 0) < .8)
		return false;
	return true;
}
