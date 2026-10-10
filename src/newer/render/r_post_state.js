/**
 * @module newer/render/r_post_state
 *
 * The post pipeline's shared state (card [44h], split from gl_post.js): what the stages read of one another, each
 * field written in one place.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `postState.glowActive` and `postState.detailActive` are written by the G-buffer stage, `postState.postActive` by
 * `R_PostBegin`, `postState.underwater` by `R_PostSetUnderwater` and `postState.gpu` by `R_PostBegin` and
 * `R_PostShutdown`. The holders `lightCurve`, `lightingLook` and `classicLook` are given to shaders as uniforms, so
 * they stay the same objects for the page's life.
 */
import { r_newer_water } from '../mode.js';

/** The flags the stages share: advanced lighting with its emissive boost, the shared HDR targets in use (also needed
 * by normals and liquids), relief detail, the eye under water, slime or lava (no lens drops, no edge outlines), and
 * the pipeline's render targets and materials (`gpu`: made by the first `R_PostBegin` that draws, freed by
 * `R_PostShutdown`; null between). */
export const postState = { glowActive: false, postActive: false, detailActive: false, underwater: false, gpu: null };

/** The light curve, shared with the lit world materials' shader. */
export const lightCurve = { value: 1 };
/** 1 while the classic half of the title demo is drawn (see r_demosplit.js): no bounce floor, the original light
 * curve, no relief. */
export const classicLook = { value: 0 };
/** The lighting look given to the lit world materials. */
export const lightingLook = { value: 0 };

/**
 * Records whether the eye is under water, slime or lava (no drops on the lens, no edge outlines). Called once a
 * frame by gl_rmain.js `R_SetupFrame` from the view leaf's contents.
 *
 * @param {boolean} v true when the view leaf is water, slime or lava (anything but `true` counts as false)
 */
export function R_PostSetUnderwater( v ) {

	postState.underwater = v === true;

}

/**
 * Whether this frame goes through the shared HDR targets (decided by `R_PostBegin`), outside the classic half of
 * the title demo. Asked by the world renderer, view effects and power vision.
 *
 * @returns {boolean} true while the post pipeline is drawing and the classic look is not
 */
export function R_PostActive() {

	return postState.postActive && classicLook.value === 0;

}

/**
 * Whether the Newer liquids are drawn this frame. Newer liquids use the shared targets, independently of advanced
 * lighting.
 *
 * @returns {boolean} `R_PostActive()` and r_newer_water is not 0
 */
export function R_WaterActive() {

	return R_PostActive() && r_newer_water.value !== 0;

}
