/**
 * @module newer/ui/newer_defaults
 *
 * Which enhancement switches a Newer Game launch turns on, and the profile-driven function that applies them.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
import { GameProfile_Get } from '../../engine/common/game_profile.js';

// Explicit Newer launches begin with the enhancement switches enabled. This
// is launch policy, not a per-frame override: feature controls remain effective
// during play. Numeric appearance/performance settings and flashlight run
// policy stay with their existing owners. The title demo borrows/restores this
// same baseline without making it the player's saved configuration.
export const NEWER_ENABLED_FEATURES = Object.freeze( [
 'r_newer_lighting', 'r_newer_normals', 'r_newer_shadows',
 'r_pointshadows', 'r_heightshadows', 'r_rockfield', 'r_powerups',
 'r_newer_weapons', 'r_newer_textures', 'r_newer_water',
 'r_newer_enemies', 'r_newer_portals', 'r_newer_hud',
 'r_decals', 'r_lerpmodels', 'r_newer_variety'
] );

// Enhanced starts with brightness at the slider midpoint and FPS showing.
// The successful fresh-map hook chooses the flashlight for the hub/difficulty.
export const NEWER_DEFAULT_GAMMA = 0.75; // brightness range is gamma1 (dark) to gamma.5 (bright)

/**
 * The commands that begin a game with Newer Game's launch defaults, for either family. The Quake menus and the
 * profile-driven Hexen II start call this, so a game's first map is enabled in exactly one place. `enabled` is the
 * existing Newer/Classic choice or Options toggle, so the owner can launch without the enhanced features: with it
 * false only `r_hdr 0` is emitted and every feature keeps its saved value.
 *
 * The Quake menus already emit `r_hdr 1` beside the defaults, so their common `newerDefaults()` helper asks for the
 * feature commands without a second header line (`hdr: false`); the full form is for a host that starts Hexen II.
 *
 * @param {?object} [profile=GameProfile_Get()] the active game profile (accepted so callers can be explicit)
 * @param {boolean} [enabled=true] the player's Newer Game choice; false turns Newer off and leaves the switches alone
 * @param {{ hdr?: boolean }} [options] `hdr` (default true) emits the `r_hdr` header line
 * @returns {string} console command text, ready for `Cbuf_AddText`
 */
export function Newer_ApplyGameDefaults( profile = GameProfile_Get(), enabled = true, { hdr = true } = {} ) {

	const newer = enabled !== false;
	const commands = [];
	if ( hdr ) commands.push( newer ? 'r_hdr 1\n' : 'r_hdr 0\n' );
	if ( newer ) {

		for ( const name of NEWER_ENABLED_FEATURES ) commands.push( name + ' 1\n' );
		commands.push( `gamma ${NEWER_DEFAULT_GAMMA}\n`, 'cl_showfps 1\n' );

	}
	return commands.join( '' );

}
