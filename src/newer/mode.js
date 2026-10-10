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

// playing Newer Game (r_hdr is what the menu sets; read directly because a level
// is started in the same batch of commands that sets it)
export function R_NewerGame() {

	return classicPass === false && Cvar_VariableValue( 'r_hdr' ) !== 0;

}

// While the classic half of the title demo is drawn (r_demosplit.js) nothing of Newer Game is on: this reads
// as New Game
let classicPass = false;

export function R_AnimSetClassicPass( on ) {

	classicPass = on === true;

}

export function R_ClassicPassActive() {

	return classicPass;

}

let newerActive = false;

export function R_AnimSetNewer( active ) {

	newerActive = active === true;
	COM_SetNewerActive( newerActive ); // newer.pak's files are only there in Newer Game

}

// whether the Newer lighting pipeline is what is drawing (set by gl_post.js)
let lightingActive = false;

export function R_AnimSetLighting( active ) {

	lightingActive = active === true;

}

export function R_NewerLightingActive() {

	return ! classicPass && lightingActive;

}

export function R_IsNewer() {

	return ! classicPass && newerActive;

}

