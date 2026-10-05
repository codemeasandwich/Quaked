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
