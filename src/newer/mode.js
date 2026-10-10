/**
 * @module newer/mode
 *
 * Newer Game or Classic: whether Newer Game is being played (`R_NewerGame`, from `r_hdr`), whether its renderer and
 * its lighting are what is drawing, the classic half of the split title demo, and the switches of Newer Game's
 * features. Its own leaf module (baseline debt D2): it imports only the engine's cvars and file system.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `classicPass`, `newerActive`, `lightingActive`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
import { cvar_t, Cvar_VariableValue } from '../engine/common/cvar.js';
import { COM_SetNewerActive } from '../engine/common/pak.js';

// Newer Game's features, each on or off (they apply only while playing Newer
// Game, which is r_hdr): lighting, normal maps, liquids, enemies, camera portals, wall textures and the status bar
export const r_newer_lighting = new cvar_t( 'r_newer_lighting', '1' );
export const r_newer_normals = new cvar_t( 'r_newer_normals', '1' );
export const r_newer_water = new cvar_t( 'r_newer_water', '1' );
export const r_newer_enemies = new cvar_t( 'r_newer_enemies', '1' );
export const r_newer_portals = new cvar_t( 'r_newer_portals', '1' );
export const r_newer_textures = new cvar_t( 'r_newer_textures', '1' );
export const r_newer_hud = new cvar_t( 'r_newer_hud', '1' );
// shadows of enemies and objects from the lights that shine on them
export const r_newer_shadows = new cvar_t( 'r_newer_shadows', '1' );
// the rare crate pictures: one crate in this many (0 = never); applies from the next level
export const r_newer_crates = new cvar_t( 'r_newer_crates', '40' );

/**
 * Whether Newer Game is being played: `r_hdr` is non-zero (what the menu sets; read directly with
 * `Cvar_VariableValue` because a level is started in the same batch of commands that sets it) and the classic half of
 * the split title demo is not being drawn. The switch most Newer Game features test (server hooks, renderer effects, HUD);
 * cheap enough to call any number of times per frame.
 *
 * @returns {boolean} true while playing Newer Game outside a classic pass
 */
export function R_NewerGame() {

	return classicPass === false && Cvar_VariableValue( 'r_hdr' ) !== 0;

}

// While the classic half of the title demo is drawn (r_demosplit.js) nothing of Newer Game is on: this reads
// as New Game
let classicPass = false;

/**
 * Enters or leaves the classic pass: the classic half of the split title demo (r_demosplit.js), drawn by
 * `R_ClassicOn` (gl_rmain.js) and the status bar in `SCR_DrawStatusBar` (gl_screen.js). Callers save
 * `R_ClassicPassActive()` first and restore it in a `finally`/rollback.
 *
 * @param {boolean} on true while the classic half is drawn (anything but `true` means off)
 */
export function R_AnimSetClassicPass( on ) {

	classicPass = on === true;

}

/**
 * Whether the classic half of the split title demo is being drawn right now (see `R_AnimSetClassicPass`).
 *
 * @returns {boolean} true inside a classic pass, when every Newer Game query here reads as off
 */
export function R_ClassicPassActive() {

	return classicPass;

}

let newerActive = false;

/**
 * Records whether the Newer renderer is drawing, once per frame from `R_PostBegin` (gl_post.js): the post pipeline is
 * enabled and `r_hdr` is on. Also tells the file system (`COM_SetNewerActive`), since newer.pak's files are only
 * there in Newer Game.
 *
 * @param {boolean} active true when Newer Game is being drawn this frame (anything but `true` means off)
 */
export function R_AnimSetNewer( active ) {

	newerActive = active === true;
	COM_SetNewerActive( newerActive ); // newer.pak's files are only there in Newer Game

}

// whether the Newer lighting pipeline is what is drawing (set by gl_post.js)
let lightingActive = false;

/**
 * Records whether the Newer lighting pipeline is what is drawing, once per frame from `R_PostBegin` (gl_post.js): the
 * post pipeline is active and `r_newer_lighting` is on.
 *
 * @param {boolean} active true when Newer lighting draws this frame (anything but `true` means off)
 */
export function R_AnimSetLighting( active ) {

	lightingActive = active === true;

}

/**
 * Whether the Newer lighting pipeline is what is drawing (as last set by gl_post.js), outside a classic pass.
 *
 * @returns {boolean} true when lighting effects (glow, flashlight, brighter flames, rock bakes) should be used
 */
export function R_NewerLightingActive() {

	return ! classicPass && lightingActive;

}

/**
 * Whether the Newer renderer is drawing (as last set by `R_AnimSetNewer` from gl_post.js), outside a classic pass. The
 * renderer-side counterpart of `R_NewerGame`: it lags the cvar by up to a frame and is false while post-processing is
 * disabled.
 *
 * @returns {boolean} true when Newer Game's renderer is active this frame
 */
export function R_IsNewer() {

	return ! classicPass && newerActive;

}

