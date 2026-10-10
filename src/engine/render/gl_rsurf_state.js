/**
 * @module engine/render/gl_rsurf_state
 *
 * The world renderer's shared state (card [44i], split from gl_rsurf.js): the world's two groups, which every stage
 * reads and the frame and the map load set.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `worldState.group` is made by `R_EnsureWorldGroup` (from `R_DrawWorld` and `R_BuildWorldMeshes`) and kept for the
 * page's life; `worldState.renderGroup` is set to it by `R_DrawWorld` before the world's surfaces draw.
 */
import * as THREE from 'three';
import { scene } from './gl_rmain.js';

// The world's groups: `group` the `quake_world` THREE.Group of the world BSP (made on first use by
// R_EnsureWorldGroup), `renderGroup` the group the surface renderers add liquid and sky meshes to (the world's group
// while the world draws). One object, so every part of the world renderer reads and sets the same two.
export const worldState = { group: null, renderGroup: null };

/**
 * The world's `quake_world` group (`worldState.group`), made on first use and added to the scene. Called by
 * `R_DrawWorld` each frame and by `R_BuildWorldMeshes` at a map load.
 *
 * @returns {THREE.Group} the world's group
 */
export function R_EnsureWorldGroup() {

	if ( ! worldState.group ) {

		worldState.group = new THREE.Group();
		worldState.group.name = 'quake_world';
		if ( scene ) scene.add( worldState.group );

	}
	return worldState.group;

}
