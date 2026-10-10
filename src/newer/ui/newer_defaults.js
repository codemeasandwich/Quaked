/**
 * @module newer/ui/newer_defaults
 *
 * Which enhancement switches a Newer Game launch turns on.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
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
